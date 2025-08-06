/**
 * file-optimisation service
 */

import { factories } from "@strapi/strapi";
import FileOptimisationService from "../../../utils/file_optimisation_service";

export default factories.createCoreService(
  "api::file-optimisation.file-optimisation",
  ({ strapi }) => ({
    async optimiseFile(file_id: number) {
      try {
        console.log("Optimising file with id: ", file_id);
        const file_data = await strapi.entityService.findOne(
          "plugin::upload.file",
          file_id
        );
        const data = await new FileOptimisationService().handleOptimisation(
          file_data
        );
        console.log(data);

        await strapi.entityService.create(
          "api::file-optimisation.file-optimisation",
          { data: { ...data, media: file_id } }
        );
      } catch (error) {
        console.error("Error optimising file: ", error);
      }
    },
    async deleteOptimisedFile(file_id: number) {
      if (!file_id || isNaN(file_id)) return;

      console.log(`Starting deletion process for media file id: ${file_id}`);

      try {
        const fileToDelete = await strapi.entityService.findOne(
          "plugin::upload.file",
          file_id
        );
        if (!fileToDelete) {
          console.warn(
            `Media file with id ${file_id} not found. No action taken.`
          );
          return;
        }

        const optimisationRecords = await strapi.entityService.findMany(
          "api::file-optimisation.file-optimisation",
          { filters: { media: { id: file_id } }, limit: 1 }
        );

        if (optimisationRecords.length > 0) {
          const fullRecordFromDB = optimisationRecords[0];

          const recordForDeletion = {
            id: fullRecordFromDB.id,
            thumbnail_url: fullRecordFromDB.thumbnail_url,
            compressed_url: fullRecordFromDB.compressed_url,
          };

          await new FileOptimisationService().handleDeletion(recordForDeletion);
          console.log(
            `Deleted optimised files from GCP for media id: ${file_id}`
          );

          await strapi.entityService.delete(
            "api::file-optimisation.file-optimisation",
            fullRecordFromDB.id
          );
        }

        await strapi.plugin("upload").service("upload").remove(fileToDelete);
        console.log(
          `Successfully deleted media file and all associations for id: ${file_id}`
        );
      } catch (error) {
        console.error(
          `Error during deletion process for file id ${file_id}: `,
          error
        );
      }
    },
  })
);
