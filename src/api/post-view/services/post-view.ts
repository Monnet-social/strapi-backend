import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::post-view.post-view",
  ({ strapi }) => ({
    async markPostAsViewed(postId, userId, timeInSeconds = 1) {
      try {
        const existingEntries = await strapi.entityService.findMany(
          "api::post-view.post-view",
          {
            filters: {
              post: { id: postId },
              viewed_by: { id: userId },
            },
            limit: 1,
          }
        );

        const currentEntry =
          existingEntries.length > 0 ? existingEntries[0] : null;

        if (currentEntry) {
          const newWatchedTime =
            (currentEntry.watched_seconds || 0) + timeInSeconds;

          return await strapi.entityService.update(
            "api::post-view.post-view",
            currentEntry.id,
            { data: { watched_seconds: newWatchedTime } }
          );
        }

        return await strapi.entityService.create("api::post-view.post-view", {
          data: {
            post: postId,
            viewed_by: userId,
            watched_seconds: timeInSeconds,
          },
        });
      } catch (error) {
        strapi.log.error("Error in markPostAsViewed service:", error);
        throw error;
      }
    },
  })
);
