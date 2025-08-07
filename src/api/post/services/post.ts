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
        { filters: { media: { id: file.id } } }
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

  async getStoryViewersCount(postId: number): Promise<number> {
    if (!postId || isNaN(postId)) {
      strapi.log.warn("getStoryViewersCount called with an invalid postId.");
      return 0;
    }

    try {
      const post = await strapi.entityService.findOne(
        "api::post.post",
        postId,
        {
          fields: ["id"],
          populate: { viewers: { count: true } } as any,
        }
      );

      if (!post) {
        strapi.log.info(
          `getStoryViewersCount: Post with id ${postId} not found.`
        );
        return 0;
      }

      const totalViewers = (post as any).viewers.count || 0;
      return totalViewers;
    } catch (error) {
      strapi.log.error(
        `Error fetching story viewers count for post ${postId}:`,
        error
      );
      return 0;
    }
  },

  async enrichUsersWithOptimizedProfilePictures(users: any[]) {
    if (!users || users.length === 0) {
      return;
    }

    for (const user of users) {
      if (user && user.profile_picture && user.profile_picture.id) {
        const optimizedPictures = await this.getOptimisedFileData([
          user.profile_picture,
        ]);
        user.profile_picture = optimizedPictures[0] || null;
      } else if (user) user.profile_picture = null;
    }
  },
}));
