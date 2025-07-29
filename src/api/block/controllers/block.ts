"use strict";
interface BlockEntryWithUser {
  id: number;
  blocked_user: {
    id: number;
    username: string;
    name: string;
    is_public: boolean;
    avatar_ring_color?: string;
    profile_pic: object;
  };
}
module.exports = {
  async toggleBlockUser(ctx) {
    const { user: blocker } = ctx.state;
    const { user_id_to_block: userIdToBlock } = ctx.request.body;

    if (!blocker)
      return ctx.unauthorized("You must be logged in to block a user.");

    if (!userIdToBlock || isNaN(userIdToBlock))
      return ctx.badRequest('A valid "userIdToBlock" is required.');

    if (blocker.id === Number(userIdToBlock))
      return ctx.badRequest("You cannot block yourself.");

    try {
      const userToBlock = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userIdToBlock
      );
      if (!userToBlock)
        return ctx.notFound("The user you are trying to block does not exist.");

      const existingBlock = await strapi.entityService.findMany(
        "api::block.block",
        {
          filters: {
            blocked_by: { id: blocker.id },
            blocked_user: { id: userIdToBlock },
          },
          limit: 1,
        }
      );

      if (existingBlock.length > 0) {
        await strapi.entityService.delete(
          "api::block.block",
          existingBlock[0].id
        );
        return ctx.send({
          success: true,
          blocked: false,
          message: "User unblocked successfully.",
        });
      } else {
        await strapi.entityService.create("api::block.block", {
          data: {
            blocked_by: blocker.id,
            blocked_user: userIdToBlock,
            publishedAt: new Date(),
          },
        });
        return ctx.send({
          success: true,
          blocked: true,
          message: "User blocked successfully.",
        });
      }
    } catch (error) {
      strapi.log.error("Error in toggleBlockUser controller:", error);
      return ctx.internalServerError(
        "An error occurred while processing your request."
      );
    }
  },

  async getBlockedUsers(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      if (!userId)
        return ctx.unauthorized("You must be logged in to view blocked users.");

      const blockedEntries = (await strapi.entityService.findMany(
        "api::block.block",
        {
          filters: { blocked_by: { id: userId } },
          populate: {
            blocked_user: {
              fields: [
                "id",
                "username",
                "name",
                "is_public",
                "avatar_ring_color",
              ],
              populate: { profile_picture: true },
            },
          },
        }
      )) as any;
      if (!blockedEntries || blockedEntries.length === 0) {
        return ctx.send({
          data: [],
          message: "You have not blocked any users.",
        });
      }

      const usersToEnrich = blockedEntries.map((entry) => entry.blocked_user);

      await strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures(usersToEnrich);
      const blockedUsers = blockedEntries.map((entry) => {
        const {
          id,
          username,
          name,
          is_public,
          avatar_ring_color,
          profile_picture,
        } = entry.blocked_user;

        const userResponse = {
          id,
          username,
          name,
          profile_picture,
        };

        if (is_public)
          (userResponse as any).avatar_ring_color = avatar_ring_color;

        return userResponse;
      });
      return ctx.send({
        data: blockedUsers,
      });
    } catch (error) {
      console.error("Error in getBlockedUsers controller:", error);
      return ctx.internalServerError(
        "An unexpected error occurred while fetching blocked users."
      );
    }
  },
};
