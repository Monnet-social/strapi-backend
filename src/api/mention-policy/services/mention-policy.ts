import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::mention-policy.mention-policy",
  ({ strapi }) => ({
    async findOrCreateMentionPolicy(userId) {
      const findMentionPolicy = await strapi.entityService.findMany(
        "api::mention-policy.mention-policy",
        {
          filters: {
            user: userId,
          },
        }
      );

      if (findMentionPolicy.length > 0) {
        return findMentionPolicy[0];
      }

      return await strapi.entityService.create(
        "api::mention-policy.mention-policy",
        {
          data: {
            user: userId,
            comment_policy: "anyone",
            story_policy: "anyone",
            post_policy: "anyone",
          },
        }
      );
    },

    async mentionUser(
      userId: string,
      content: string,
      type: "story" | "comment" | "post"
    ) {
      if (typeof content !== "string") {
        throw new TypeError("content must be a string");
      }

      let finalMention = [];

      for (let i = 0; i < content.length; i++) {
        if (content[i] === "@") {
          let allowTagging = false;

          // Extract the username following the @ symbol
          const restOfContent = content.slice(i + 1);
          const username = restOfContent.split(" ")[0] || "";

          if (!username) continue;

          const findUser = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
              filters: {
                username: {
                  $eq: username,
                },
              },
              fields: ["id"],
              limit: 1,
            }
          );

          if (findUser.length === 0) continue;

          const findMentionPolicy = await this.findOrCreateMentionPolicy(
            findUser[0].id
          );

          let policy = "anyone";
          if (type === "story") {
            policy = findMentionPolicy.story_policy;
          } else if (type === "comment") {
            policy = findMentionPolicy.comment_policy;
          } else if (type === "post") {
            policy = findMentionPolicy.post_policy;
          }

          const userFollowers = await strapi.entityService.findMany(
            "api::following.following",
            {
              filters: {
                subject: {
                  id: Number(findUser[0].id),
                },
                follower: {
                  id: Number(userId),
                },
              },
              fields: ["id"],
              limit: 1,
            }
          );

          const userCloseFriends = await strapi.entityService.findMany(
            "api::following.following",
            {
              filters: {
                follower: {
                  id: Number(findUser[0].id),
                },
                subject: {
                  id: Number(userId),
                },
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
          ) {
            allowTagging = true;
          }

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
  })
);
