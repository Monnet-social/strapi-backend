/**
 * comment controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::comment.comment",
  ({ strapi }) => ({
    async likePost(ctx) {
      const { postId } = ctx.request.body;
      const userId = ctx.state.user.id;
      const existingLike = await strapi.entityService.findMany(
        "api::like.like",
        {
          filters: { post: postId, liked_by: userId },
        }
      );
      if (existingLike.length > 0) {
        return ctx.send("Post liked successfully");
      }
      const createLike = await strapi.entityService.create("api::like.like", {
        data: {
          post: postId,
          liked_by: userId,
        },
      });
      return ctx.send("Post liked successfully");
    },
    async unlikePost(ctx) {
      const { postId } = ctx.request.body;
      const userId = ctx.state.user.id;
      const existingLike = await strapi.entityService.findMany(
        "api::like.like",
        {
          filters: { post: postId, liked_by: userId },
        }
      );
      if (existingLike.length === 0) {
        return ctx.send("Post unliked successfully");
      }
      await strapi.entityService.delete("api::like.like", existingLike[0].id);
      return ctx.send("Post unliked successfully");
    },
  })
);
