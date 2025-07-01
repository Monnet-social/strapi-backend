"use strict";

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
    "api::dislike.dislike",
    ({ strapi }) => ({
        async getDislikesCountByPostId(postId: number): Promise<number> {
            const dislikesCount = await strapi.entityService.count(
                "api::dislike.dislike",
                {
                    filters: { post: { id: postId } },
                }
            );
            return dislikesCount;
        },

        async getDislikesCountByCommentId(commentId: number): Promise<number> {
            const dislikesCount = await strapi.entityService.count(
                "api::dislike.dislike",
                {
                    filters: { comment: { id: commentId } },
                }
            );
            return dislikesCount;
        },

        async getDislikesByPostId(postId: number) {
            const dislikes = await strapi.entityService.findMany(
                "api::dislike.dislike",
                {
                    filters: { post: { id: postId } },
                    populate: {
                        disliked_by: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                    },
                }
            );
            return dislikes;
        },

        async verifyPostDislikedByUser(
            postId: number,
            userId: number
        ): Promise<boolean> {
            if (!postId || !userId) return false;

            const count = await strapi.entityService.count(
                "api::dislike.dislike",
                {
                    filters: {
                        post: { id: postId },
                        disliked_by: { id: userId },
                    },
                }
            );
            return count > 0;
        },

        async verifyCommentDislikedByUser(
            commentId: number,
            userId: number
        ): Promise<boolean> {
            if (!commentId || !userId) return false;

            const count = await strapi.entityService.count(
                "api::dislike.dislike",
                {
                    filters: {
                        comment: { id: commentId },
                        disliked_by: { id: userId },
                    },
                }
            );
            return count > 0;
        },
    })
);
