import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::mention-policy.mention-policy",
  ({ strapi }) => ({
    async findOrCreateMentionPolicy(userId) {
      const findMentionPolicy = await strapi.entityService.findMany(
        "api::mention-policy.mention-policy",
        { filters: { user: userId } }
      );
      console.log("Mention Policy:", findMentionPolicy, userId);

      if (findMentionPolicy.length > 0) {
        console.log("TEST", findMentionPolicy[0]);
        return findMentionPolicy[0];
      }
      const findUser = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        { filters: { id: userId } }
      );

      return await strapi.entityService.create(
        "api::mention-policy.mention-policy",
        {
          data: {
            user: userId,
            comment_policy: findUser[0]?.is_public ? "anyone" : "no_one",
            story_policy: findUser[0]?.is_public ? "anyone" : "no_one",
            post_policy: findUser[0]?.is_public ? "anyone" : "no_one",
          },
        }
      );
    },

    async mentionUser(
      userId: string,
      content: string,
      type: "story" | "comment" | "post"
    ) {
      if (typeof content !== "string")
        throw new TypeError("content must be a string");

      let finalMention = [];

      for (let i = 0; i < content.length; i++) {
        if (content[i] === "@") {
          let allowTagging = false;
          const restOfContent = content.slice(i + 1);
          const username = restOfContent.split(" ")[0] || "";

          if (!username) continue;

          const findUser = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
              filters: { username: { $eq: username } },
              fields: ["id"],
              limit: 1,
            }
          );

          if (findUser.length === 0) continue;

          const findMentionPolicy = await this.findOrCreateMentionPolicy(
            findUser[0].id
          );

          let policy = "anyone";
          if (type === "story") policy = findMentionPolicy.story_policy;
          else if (type === "comment")
            policy = findMentionPolicy.comment_policy;
          else if (type === "post") policy = findMentionPolicy.post_policy;

          const userFollowers = await strapi.entityService.findMany(
            "api::following.following",
            {
              filters: {
                subject: { id: Number(findUser[0].id) },
                follower: { id: Number(userId) },
              },
              fields: ["id"],
              limit: 1,
            }
          );

          const userCloseFriends = await strapi.entityService.findMany(
            "api::following.following",
            {
              filters: {
                follower: { id: Number(findUser[0].id) },
                subject: { id: Number(userId) },
                is_close_friend: true,
              },
              fields: ["id"],
              limit: 1,
            }
          );

          if (
            policy === "anyone" ||
            (policy === "friends" &&
              userCloseFriends.some(
                (friend) => friend.id === findUser[0].id
              )) ||
            (policy === "followers" &&
              userFollowers.some((follower) => follower.id === findUser[0].id))
          )
            allowTagging = true;

          finalMention.push({
            user: findUser[0].id,
            username,
            start: i,
            end: i + 1 + username.length,
            mention_status: allowTagging,
          });
        }
      }

      return finalMention;
    },

    async isMentionAllowed(
      currentUserId: any,
      mentionedUserId: any,
      policy: string
    ): Promise<boolean> {
      if (policy === "anyone") return true;

      if (currentUserId === mentionedUserId) return true;

      if (policy === "followers") {
        const isFollower = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: {
              follower: currentUserId,
              subject: mentionedUserId,
            },
            limit: 1,
          }
        );
        return isFollower.length > 0;
      }

      if (policy === "friends") {
        const isCloseFriend = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: {
              $or: [
                {
                  subject: currentUserId,
                  follower: mentionedUserId,
                  is_close_friend: true,
                },
                {
                  subject: mentionedUserId,
                  follower: currentUserId,
                  is_close_friend: true,
                },
              ],
            },
            limit: 1,
          }
        );
        return isCloseFriend.length > 0;
      }

      return false;
    },
  })
);
