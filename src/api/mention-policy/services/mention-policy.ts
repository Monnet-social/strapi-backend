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
      type: "story" | "comment" | "post" | "bio"
    ) {
      if (typeof content !== "string")
        throw new TypeError("content must be a string");

      const finalMention = [];
      const mentionRegex = /@([\w_]+)/g;
      let match;

      while ((match = mentionRegex.exec(content)) !== null) {
        const username = match[1];
        const start = match.index;
        const end = start + username.length + 1;
        const findUser = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { username: { $eqi: username } },
            fields: ["id"],
            limit: 1,
          }
        );

        if (findUser.length === 0) continue;

        const foundUserId = findUser[0].id;

        const findMentionPolicy =
          await this.findOrCreateMentionPolicy(foundUserId);

        let policy = "anyone";

        if (type === "bio") policy = "anyone";
        else if (type === "story") policy = findMentionPolicy.story_policy;
        else if (type === "comment") policy = findMentionPolicy.comment_policy;
        else if (type === "post") policy = findMentionPolicy.post_policy;

        const userFollowers = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: {
              subject: { id: Number(foundUserId) },
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
              follower: { id: Number(foundUserId) },
              subject: { id: Number(userId) },
              is_close_friend: true,
            },
            fields: ["id"],
            limit: 1,
          }
        );

        let allowTagging = false;

        if (
          policy === "anyone" ||
          (policy === "friends" && userCloseFriends.length > 0) ||
          (policy === "followers" && userFollowers.length > 0)
        ) {
          allowTagging = true;
        }

        finalMention.push({
          user: foundUserId,
          username,
          start,
          end,
          mention_status: allowTagging,
        });
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
