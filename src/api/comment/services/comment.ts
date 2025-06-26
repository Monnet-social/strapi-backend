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
                            fields: ["id", "username", "email", "name"],
                        },
                    },
                }
            );

            const commentsWithRepliesCount = await Promise.all(
                topLevelComments.map(async (comment) => {
                    const repliesCount = await strapi.entityService.count(
                        "api::comment.comment",
                        { filters: { parent_comment: { id: comment.id } } }
                    );

                    return {
                        ...comment,
                        replies_count: repliesCount,
                    };
                })
            );

            return commentsWithRepliesCount;
        },
    })
);
