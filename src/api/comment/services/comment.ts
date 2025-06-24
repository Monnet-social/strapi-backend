/**
 * comment service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::comment.comment",
  ({ strapi }) => ({
    async getCommentsCount(postId: number) {
      const likes = await strapi.db.query("api::comment.comment").count({
        where: { post: postId },
      });

      return likes;
    },
    async getCommentsByPostId(postId: number) {
      const likes = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: { post: { id: postId } },
          populate: {
            commented_by: {
              fields: ["id", "username", "email", "name"],
            },
          },
        }
      );

      return likes;
    },
  })
);
