"use strict";

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::dislike.dislike",
  ({ strapi }) => ({
    getDislikesCountByPostId: (postId: number): Promise<number> =>
      strapi.entityService.count("api::dislike.dislike", {
        filters: { post: { id: postId } },
      }),

    getDislikesCountByCommentId: (commentId: number): Promise<number> =>
      strapi.entityService.count("api::dislike.dislike", {
        filters: { comment: { id: commentId } },
      }),

    getDislikesByPostId: (postId: number) =>
      strapi.entityService.findMany("api::dislike.dislike", {
        filters: { post: { id: postId } },
        populate: {
          disliked_by: {
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
          },
        },
      }),

    verifyPostDislikedByUser: async (
      postId: number,
      userId: number
    ): Promise<boolean> =>
      !!(
        postId &&
        userId &&
        (await strapi.entityService.count("api::dislike.dislike", {
          filters: {
            post: { id: postId },
            disliked_by: { id: userId },
          },
        })) > 0
      ),

    verifyCommentDislikedByUser: async (
      commentId: number,
      userId: number
    ): Promise<boolean> =>
      !!(
        commentId &&
        userId &&
        (await strapi.entityService.count("api::dislike.dislike", {
          filters: {
            comment: { id: commentId },
            disliked_by: { id: userId },
          },
        })) > 0
      ),
  })
);
