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
                        comment,
                    },
                }
            );
            return ctx.send({
                message: "Add comment successfully on post",
                status: 200,
            });
        },
        async pinComment(ctx) {
            const { comment_id } = ctx.params;
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

            return ctx.send({
                message: "Comment pinned successfully",
                status: 200,
            });
        },
        async unpinComment(ctx) {
            const { comment_id } = ctx.params;
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
                return ctx.send({
                    message: "Comment unpinned successfully",
                    status: 200,
                });
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

            return ctx.send({
                message: "Comment unpinned successfully",
                status: 200,
            });
        },

        async getCommentsByPostId(ctx) {
            const { post_id } = ctx.params;
            if (!post_id || isNaN(post_id))
                return ctx.badRequest("Please provide a valid post id.");

            const topLevelComments = await strapi.entityService.findMany(
                "api::comment.comment",
                {
                    filters: {
                        post: { id: post_id },
                        parent_comment: { id: { $null: true } },
                    },
                    populate: {
                        commented_by: {
                            fields: ["id", "username", "email", "name"],
                            populate: { profile_picture: true },
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

            return ctx.send(commentsWithRepliesCount);
        },
    })
);
