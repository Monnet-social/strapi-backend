import { factories } from "@strapi/strapi";

export default factories.createCoreService("api::like.like", ({ strapi }) => ({
  getLikesCount: (postId: number): Promise<number> =>
    strapi.db.query("api::like.like").count({
      where: { post: postId },
    }),

  getLikesByPostId: (postId: number): Promise<any[]> =>
    strapi.entityService.findMany("api::like.like", {
      filters: { post: { id: postId } },
      populate: {
        liked_by: {
          fields: ["id", "username", "email", "name"],
        },
      },
    }),

  verifyPostLikeByUser: async (
    postId: number,
    userId: number
  ): Promise<boolean> =>
    !!(
      postId &&
      userId &&
      (await strapi.entityService.count("api::like.like", {
        filters: {
          post: { id: postId },
          liked_by: { id: userId },
        },
      })) > 0
    ),

  // ✅ REFACTORED: Converted to a one-liner arrow function with a safety check.
  verifyCommentLikedByUser: async (
    commentId: number,
    userId: number
  ): Promise<boolean> =>
    !!(
      commentId &&
      userId &&
      (await strapi.entityService.count("api::like.like", {
        filters: { comment: { id: commentId }, liked_by: { id: userId } },
      })) > 0
    ),
}));
