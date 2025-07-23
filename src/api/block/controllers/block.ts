"use strict";

module.exports = {
  async toggleBlockUser(ctx) {
    const { user: blocker } = ctx.state;
    const { user_id_to_block: userIdToBlock } = ctx.request.body;

    if (!blocker)
      return ctx.unauthorized("You must be logged in to block a user.");
    //test
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
};
