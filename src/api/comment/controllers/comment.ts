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
    async pinComment(ctx) {
      const { comment_id } = ctx.state.params;
      const userId = ctx.state.user.id;
      const comment: any = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: { id: comment_id },
          populate: {
            post: {
              populate: {
                posted_by: true,
              },
            },
          },
        }
      );
      if (comment.length === 0) {
        return ctx.badRequest("You cannot pin this comment");
      }
      if (comment[0].post.posted_by.id !== userId) {
        return ctx.badRequest("You cannot pin this comment");
      }
      const updatedComment = await strapi.entityService.update(
        "api::comment.comment",
        comment_id,
        {
          data: {
            pinned: true,
          },
        }
      );
      return ctx.send("Comment pinned successfully");
    },
    async unpinComment(ctx) {
      const { comment_id } = ctx.state.params;
      const userId = ctx.state.user.id;
      const comment: any = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: { id: comment_id },
          populate: {
            post: {
              populate: {
                posted_by: true,
              },
            },
          },
        }
      );
      if (comment.length === 0) {
        return ctx.badRequest("You cannot unpin this comment");
      }
      if (comment[0].pinned === false) {
        return ctx.send("Comment unpinned successfully");
      }
      if (comment[0].post.posted_by.id !== userId) {
        return ctx.badRequest("You cannot unpin this comment");
      }
      const updatedComment = await strapi.entityService.update(
        "api::comment.comment",
        comment_id,
        {
          data: {
            pinned: false,
          },
        }
      );
      return ctx.send("Comment unpinned successfully");
    },
  })
);
