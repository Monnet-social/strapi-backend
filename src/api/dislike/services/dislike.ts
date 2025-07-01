"use strict";

/**
 * dislike service
 */

const { factories } = require("@strapi/strapi");

export default factories.createCoreService(
    "api::dislike.dislike",
    ({ strapi }) => ({
        /**
         * Gets the total dislike count for a specific post.
         * @param {number} postId The ID of the post.
         * @returns {Promise<number>} The total number of dislikes.
         */
        async getDislikesCountByPostId(postId: number) {
            // Changed from db.query to entityService.count
            const dislikes = await strapi.entityService.count(
                "api::dislike.dislike",
                {
                    filters: { post: { id: postId } },
                }
            );
            return dislikes;
        },

        /**
         * Gets the total dislike count for a specific comment.
         * @param {number} commentId The ID of the comment.
         * @returns {Promise<number>} The total number of dislikes.
         */
        async getDislikesCountByCommentId(commentId: number) {
            // Changed from db.query to entityService.count
            const dislikes = await strapi.entityService.count(
                "api::dislike.dislike",
                {
                    filters: { comment: { id: commentId } },
                }
            );
            return dislikes;
        },

        async verifyPostDislikeByUser(postId: number, userId: number) {
            const dislike = await strapi.entityService.findMany(
                "api::dislike.dislike",
                {
                    filters: {
                        post: { id: postId },
                        disliked_by: { id: userId },
                    },
                    limit: 1,
                }
            );
            return dislike.length > 0;
        },

        async verifyCommentDislikeByUser(commentId: number, userId: number) {
            const dislike = await strapi.entityService.findMany(
                "api::dislike.dislike",
                {
                    filters: {
                        comment: { id: commentId },
                        disliked_by: { id: userId },
                    },
                    limit: 1,
                }
            );
            return dislike.length > 0;
        },
    })
);
