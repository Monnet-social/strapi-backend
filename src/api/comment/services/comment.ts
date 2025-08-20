/**
 * comment service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::comment.comment",
  ({ strapi }) => ({
    getCommentsCount: (postId: number): Promise<number> =>
      strapi.entityService.count("api::comment.comment", {
        filters: { post: { id: postId } },
      }),

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
            mentioned_users: {
              populate: {
                user: {
                  fields: ["id", "username", "name", "avatar_ring_color"],
                  populate: { profile_picture: true },
                },
              },
            },
          },
        }
      );

      if (topLevelComments.length === 0) return [];

      const finalComments = await Promise.all(
        topLevelComments.map(async (comment: any) => {
          const repliesCount = await strapi.entityService.count(
            "api::comment.comment",
            { filters: { parent_comment: { id: comment.id } } }
          );

          const likesCount = await strapi.entityService.count(
            "api::like.like",
            { filters: { comment: { id: comment.id } } }
          );
          let finalList = [];
          for (let i = 0; i < comment?.mentioned_users?.length; i++) {
            const status = comment.mentioned_users[i].mention_status;
            if (status) {
              finalList.push(comment.mentioned_users[i]);
            }
          }
          comment.mentioned_users = finalList;

          return {
            ...comment,
            replies_count: repliesCount,
            likes_count: likesCount,
          };
        })
      );

      return finalComments;
    },

    getCommentLikesCount: (commentId: number): Promise<number> =>
      strapi.entityService.count("api::like.like", {
        filters: { comment: { id: commentId } },
      }),

    async getTotalLikesOnCommentsByPostId(postId: number): Promise<number> {
      const commentsOnPost = await strapi.entityService.findMany(
        "api::comment.comment",
        { filters: { post: { id: postId } }, fields: ["id"] }
      );

      if (commentsOnPost.length === 0) return 0;

      const commentIds = commentsOnPost.map((c) => c.id);

      return await strapi.entityService.count("api::like.like", {
        filters: { comment: { id: { $in: commentIds } } },
      });
    },
  })
);
