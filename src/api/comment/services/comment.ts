/**
 * comment service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::comment.comment",
  ({ strapi }) => ({
    async getCommentsCount(postId: number): Promise<number> {
      const totalCount = await strapi.entityService.count(
        "api::comment.comment",
        { filters: { post: { id: postId } } }
      );

      return totalCount;
    },

    async getCommentsByPostId(postId: number): Promise<any[]> {
      const topLevelComments = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: {
            post: { id: postId },
            parent_comment: { id: { $null: true } },
          },
          populate: {
            commented_by: {
              fields: ["id", "username", "name", "avatar_ring_color"],
              populate: { profile_picture: true },
            },
          },
        }
      );

      if (topLevelComments.length === 0) return [];

      const finalComments = await Promise.all(
        topLevelComments.map(async (comment) => {
          const repliesCount = await strapi.entityService.count(
            "api::comment.comment",
            { filters: { parent_comment: { id: comment.id } } }
          );

          const likesCount = await strapi.entityService.count(
            "api::like.like",
            { filters: { comment: { id: comment.id } } }
          );

          return {
            ...comment,
            replies_count: repliesCount,
            likes_count: likesCount,
          };
        })
      );

      return finalComments;
    },

    async getCommentLikesCount(commentId: number): Promise<number> {
      const likesCount = await strapi.entityService.count("api::like.like", {
        filters: { comment: { id: commentId } },
      });
      return likesCount;
    },

    async getTotalLikesOnCommentsByPostId(postId: number): Promise<number> {
      const commentsOnPost = await strapi.entityService.findMany(
        "api::comment.comment",
        { filters: { post: { id: postId } }, fields: ["id"] }
      );

      if (commentsOnPost.length === 0) return 0;

      const commentIds = commentsOnPost.map((c) => c.id);

      const likesCount = await strapi.entityService.count("api::like.like", {
        filters: { comment: { id: { $in: commentIds } } },
      });

      return likesCount;
    },
  })
);
