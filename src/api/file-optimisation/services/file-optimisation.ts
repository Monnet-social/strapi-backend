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
          {
            data: {
              ...data,
              media: file_id,
            },
          }
        );
      } catch (error) {
        console.error("Error optimising file: ", error);
      }
    },
  })
);
