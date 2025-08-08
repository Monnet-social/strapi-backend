/**
 *** CRON FORMAT FOR NO FURTHER CONFUSION !!! ***
 * | (Minute) | (Hour) | (Day of Month) | (Month) | (Day of Week) |
 * |    0     |   0    |       *        |    *    |      *        |
 **/

export default {
  "0 0 * * *": async ({ strapi }) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      console.log("-------------------------------------------");
      console.log(`[Cron Job] Running: Delete old, unverified users...`);
      console.log(
        `[Cron Job] Deleting users created before: ${sevenDaysAgo.toISOString()}`
      );

      const batchSize = 100;
      let usersToDelete;
      while (true) {
        usersToDelete = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: {
              createdAt: { $lt: sevenDaysAgo.toISOString() },
              is_email_verified: false,
            },
            fields: ["id", "email"],
            limit: batchSize,
          }
        );
        // LOOP TERMINATION CONDITION...
        if (usersToDelete.length === 0) {
          console.log("[Cron Job] No more old, unverified users found.");
          break;
        }

        console.log(
          `[Cron Job] Found a batch of ${usersToDelete.length} user(s) to delete.`
        );

        const userIdsToDelete = usersToDelete.map((user) => user.id);

        await strapi.entityService.deleteMany(
          "plugin::users-permissions.user",
          { filters: { id: { $in: userIdsToDelete } } }
        );
        for (const user of usersToDelete) {
          console.log(` -> Deleted user: ${user.email} (ID: ${user.id})`);
        }
      }

      console.log("[Cron Job] Successfully finished cleanup task.");
      console.log("-------------------------------------------");
    } catch (error) {
      console.error(
        "[Cron Job] Error while deleting old, unverified users:",
        error
      );
    }
  },
  deleteExpiredStories: {
    task: async ({ strapi }) => {
      console.log("-------------------------------------------");
      console.log("[Cron Job] Running: Checking for expired stories...");

      const twentyFourHoursAgo = new Date(
        new Date().getTime() - 24 * 60 * 60 * 1000
      );
      console.log(
        `[Cron Job] Deleting stories created before: ${twentyFourHoursAgo.toISOString()}`
      );

      const expiredStories = await strapi.entityService.findMany(
        "api::post.post",
        {
          filters: {
            post_type: "story",
            createdAt: {
              $lt: twentyFourHoursAgo,
            },
          },
          populate: { media: true },
        }
      );

      if (expiredStories.length === 0) {
        console.log("[Cron Job] No expired stories found.");
        console.log("-------------------------------------------");
        return;
      }

      console.log(
        `[Cron Job] Found ${expiredStories.length} expired stories to delete.`
      );

      for (const story of expiredStories) {
        try {
          if (story.media && story.media.length > 0) {
            for (const mediaFile of story.media) {
              await strapi
                .service("api::file-optimisation.file-optimisation")
                .deleteOptimisedFile(mediaFile.id);
            }
          }

          await strapi.entityService.delete("api::post.post", story.id);
          console.log(` -> Deleted story with ID: ${story.id}`);
        } catch (error) {
          console.error(
            `[Cron Job] Failed to delete story with ID ${story.id}:`,
            error
          );
        }
      }
      console.log("[Cron Job] Finished deleting expired stories.");
      console.log("-------------------------------------------");
    },
    options: {
      rule: "0 * * * *",
    },
  },
};
