import { factories } from "@strapi/strapi";

type PopulatedHideStory = {
  id: string;
  target?: {
    id: string;
  };
};

export default factories.createCoreController(
  "api::hide-story.hide-story",
  ({ strapi }) => ({
    async hideStory(ctx) {
      const ownerId = ctx.state.user.id;

      const { targetIds } = ctx.request.body;

      if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0)
        return ctx.badRequest(
          "An array of 'targetIds' is required in the request body."
        );

      const uniqueTargetIds = [
        ...new Set(targetIds.filter((id) => id !== ownerId)),
      ];

      if (uniqueTargetIds.length === 0)
        return ctx.badRequest("No valid target IDs provided.");

      try {
        const existingRules = await strapi.entityService.findMany(
          "api::hide-story.hide-story",
          {
            filters: {
              owner: { id: ownerId },
              target: { id: { $in: uniqueTargetIds } },
            },
            populate: { target: { fields: ["id"] } },
          }
        );
        const existingRulesMap = new Map(
          (existingRules as PopulatedHideStory[])
            .filter((rule) => rule.target?.id != null)
            .map((rule) => [rule.target.id, rule.id])
        );

        const promisesToCreate = [];
        const idsToDelete = [];
        const results = [];

        for (const targetId of uniqueTargetIds) {
          const ruleIdToDelete = existingRulesMap.get(targetId);

          if (ruleIdToDelete) {
            idsToDelete.push(ruleIdToDelete);
            results.push({ targetId, is_hidden: false });
          } else {
            promisesToCreate.push(
              strapi.entityService.create("api::hide-story.hide-story", {
                data: {
                  owner: ownerId,
                  target: targetId,
                },
              })
            );
            results.push({ targetId, is_hidden: true });
          }
        }

        const deletePromises = idsToDelete.map((id) =>
          strapi.entityService.delete("api::hide-story.hide-story", id)
        );

        await Promise.all([...deletePromises, ...promisesToCreate]);

        return ctx.send({
          message: "Hide story status updated for all provided users.",
          results,
        });
      } catch (error) {
        strapi.log.error(
          "Error in hide-story toggleMultiple controller:",
          error
        );
        return ctx.internalServerError(
          "An error occurred during the bulk toggle operation."
        );
      }
    },

    async getFriendsWithHideStatus(ctx) {
      const { id: currentUserId } = ctx.state.user;

      try {
        const followingEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { follower: { id: currentUserId } },
            populate: {
              subject: {
                fields: ["id", "username", "name", "avatar_ring_color"],
                populate: { profile_picture: true },
              },
            },
          }
        );
        const followingUsers = followingEntries.map(
          (entry: any) => entry.subject
        );
        const followingIds = new Set(followingUsers.map((user) => user.id));

        if (followingIds.size === 0)
          return ctx.send({
            data: [],
            message: "You are not following anyone.",
          });

        const followerEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: {
              subject: { id: currentUserId },
              follower: { id: { $in: Array.from(followingIds) } },
            },
            populate: { follower: { fields: ["id"] } },
          }
        );
        const friendIds = new Set(
          followerEntries.map((entry: any) => entry.follower.id)
        );

        const friends = followingUsers.filter((user) => friendIds.has(user.id));

        if (friends.length === 0)
          return ctx.send({ data: [], message: "No mutual friends found." });

        const hiddenStoryEntries = await strapi.entityService.findMany(
          "api::hide-story.hide-story",
          {
            filters: { owner: { id: currentUserId } },
            populate: { target: { fields: ["id"] } },
          }
        );
        const hiddenUserIds = new Set(
          hiddenStoryEntries
            .map((entry: any) => entry.target?.id)
            .filter(Boolean)
        );

        await strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedProfilePictures(friends);

        const friendsWithStatus = friends.map((friend) => ({
          ...friend,
          is_story_hidden: hiddenUserIds.has(friend.id),
        }));

        return ctx.send({
          data: friendsWithStatus,
          message: "Friends fetched successfully.",
        });
      } catch (error) {
        strapi.log.error(
          "Error in getFriendsWithHideStatus controller:",
          error
        );
        return ctx.internalServerError(
          "An error occurred while fetching friends."
        );
      }
    },
  })
);
