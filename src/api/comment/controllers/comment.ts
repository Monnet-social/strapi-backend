/**
 * comment controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::comment.comment",
  ({ strapi }) => ({
    async commentPost(ctx) {
      const { post_id, comment } = ctx.request.body;
      const userId = ctx.state.user.id;

      const createComment = await strapi.entityService.create(
        "api::comment.comment",
        {
          data: {
            post: post_id,
            commented_by: userId,
            content: comment,
          },
        }
      );
      return ctx.send("Add comment successfully on post");
    },
  })
);
