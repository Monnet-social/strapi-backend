/**
 * like service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService("api::like.like", ({ strapi }) => ({
  async getLikesCount(postId: number) {
    const likes = await strapi.db.query("api::like.like").count({
      where: { post: postId },
    });

    return likes;
  },
  async getLikesByPostId(postId: number) {
    const likes = await strapi.entityService.findMany("api::like.like", {
      filters: { post: { id: postId } },
      populate: {
        liked_by: {
          fields: ["id", "username", "email", "name"],
        },
      },
    });

    return likes;
  },
  async verifyPostLikeByUser(postId: number, userId: number) {
    const like = await strapi.entityService.findMany("api::like.like", {
      filters: {
        post: { id: postId },
        liked_by: { id: userId },
      },
      limit: 1,
    });

    return like.length > 0;
  },
}));
