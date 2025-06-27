/**
 * post service
 */

import { factories } from "@strapi/strapi";
import FileOptimisationService from "../../../utils/file_optimisation_service";

export default factories.createCoreService("api::post.post", ({ strapi }) => ({
  async getOptimisedFileData(media: any[]) {
    let finalMedia = [];
    for (let i = 0; i < media?.length; i++) {
      const file = media[i];
      const findImage = await strapi.entityService.findMany(
        "api::file-optimisation.file-optimisation",
        {
          filters: { media: { id: file.id } },
        }
      );
      if (findImage.length > 0) {
        const fileData = findImage[0];
        if (fileData?.thumbnail_url?.length > 0)
          media[i].thumbnail_url =
            await new FileOptimisationService().getSignedUrl(
              fileData.thumbnail_url
            );
        if (fileData?.compressed_url?.length > 0)
          media[i].compressed_url = (
            await new FileOptimisationService().getSignedUrl(
              fileData.compressed_url
            )
          )?.split("?")[0];
        finalMedia.push({
          id: file.id,
          url: file.url,
          mime: file.mime,
          thumbnail_url: media[i].thumbnail_url,
          compressed_url: media[i].compressed_url,
        });
      } else {
        // If no optimisation data found, trigger it
        finalMedia.push({
          id: file.id,
          url: file.url,
          mime: file.mime,
          thumbnail_url: null,
          compressed_url: null,
        });
      }
    }
    return finalMedia;
  },
}));
