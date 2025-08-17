/**
 * mention-policy service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::mention-policy.mention-policy",
  ({ strapi }) => ({
    async findOrCreateMentionPolicy(userId) {
      const findMentionPolicy = await strapi.entityService.findMany(
        "api::mention-policy.mention-policy",
        {
          filters: {
            user: { id: userId },
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
      //   const findMentionPolicy = await this.findOrCreateMentionPolicy(userId);
      //   let policy = "anyone";
      //   if (type == "story") {
      //     policy = findMentionPolicy.story_policy;
      //   } else if (type == "comment") {
      //     policy = findMentionPolicy.comment_policy;
      //   } else if (type == "post") {
      //     policy = findMentionPolicy.post_policy;
      //   }
      //   let userFollowers = await strapi.entityService.findMany(
      //     "api::following.following",
      //     {
      //       filters: {
      //         subject: {
      //           id: Number(userId),
      //         },
      //       },
      //       fields: ["id"],
      //     }
      //   );
      //   let userCloseFriends = await strapi.entityService.findMany(
      //     "api::following.following",
      //     {
      //       filters: {
      //         subject: {
      //           id: Number(userId),
      //         },
      //         is_close_friend: true,
      //       },
      //       fields: ["id"],
      //     }
      //   );
      let finalMention = [];

      for (let character of content) {
        if (character === "@") {
          let allowTagging = false;
          // Extract the username following the @ symbol
          const username = content
            .slice(content.indexOf("@") + 1)
            .split(" ")[0];
          const findUser = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
              filters: {
                username: {
                  $eq: username,
                },
              },
              fields: ["id"],
            }
          );
          let findMentionPolicy = await this.findOrCreateMentionPolicy(
            findUser[0].id
          );
          let policy = "anyone";
          if (type == "story") {
            policy = findMentionPolicy.story_policy;
          } else if (type == "comment") {
            policy = findMentionPolicy.comment_policy;
          } else if (type == "post") {
            policy = findMentionPolicy.post_policy;
          }
          let userFollowers = await strapi.entityService.findMany(
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
            }
          );
          let userCloseFriends = await strapi.entityService.findMany(
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
            }
          );

          if (findUser.length > 0) {
            // Check if the user is allowed to be mentioned
            if (
              policy === "anyone" ||
              (policy === "friends" &&
                userCloseFriends.some(
                  (friend) => friend.id === findUser[0].id
                )) ||
              (policy === "followers" &&
                userFollowers.some(
                  (follower) => follower.id === findUser[0].id
                ))
            ) {
              // Allow mentioning
              allowTagging = true;
            }
            finalMention.push({
              user: findUser[0].id,
              username,
              start: content.indexOf("@"),
              end:
                content.indexOf(" ") === -1
                  ? content.length
                  : content.indexOf(" "),
              mention_status: allowTagging,
            });
          }
        }
      }
      return finalMention;
    },
  })
);
