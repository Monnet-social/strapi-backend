import { factories } from "@strapi/strapi";
import { Context } from "koa";
("use strict");

export default factories.createCoreController(
    "api::dislike.dislike",
    ({ strapi }) => ({
        async dislikePost(ctx: Context) {
            const { post_id } = ctx.request.body;
            const { user } = ctx.state;

            if (!user)
                return ctx.unauthorized(
                    "You must be logged in to dislike a post."
                );

            if (!post_id || isNaN(post_id))
                return ctx.badRequest('A valid "post_id" is required.');

            try {
                const post = await strapi.entityService.findOne(
                    "api::post.post",
                    post_id
                );
                if (!post)
                    return ctx.notFound(
                        "The post you are trying to dislike does not exist."
                    );

                const existingLike = await strapi.entityService.findMany(
                    "api::like.like",
                    {
                        filters: {
                            post: { id: post_id },
                            liked_by: { id: user.id },
                        },
                        limit: 1,
                    }
                );

                if (existingLike.length > 0)
                    await strapi.entityService.delete(
                        "api::like.like",
                        existingLike[0].id
                    );

                const existingDislike = await strapi.entityService.findMany(
                    "api::dislike.dislike",
                    {
                        filters: {
                            post: { id: post_id },
                            disliked_by: { id: user.id },
                        },
                        limit: 1,
                    }
                );

                if (existingDislike.length > 0) {
                    await strapi.entityService.delete(
                        "api::dislike.dislike",
                        existingDislike[0].id
                    );
                    return ctx.send({
                        success: true,
                        disliked: false,
                        message: "Post undisliked successfully.",
                    });
                } else {
                    await strapi.entityService.create("api::dislike.dislike", {
                        data: {
                            disliked_by: user.id,
                            post: post_id,
                            comment: null,
                        },
                    });
                    return ctx.send({
                        success: true,
                        disliked: true,
                        message: "Post disliked successfully.",
                    });
                }
            } catch (error) {
                strapi.log.error("Error in dislikePost controller:", error);
                return ctx.internalServerError(
                    "An error occurred while processing your request."
                );
            }
        },

        async getDislikesByPostId(ctx) {
            const { post_id } = ctx.params;
            if (!post_id || isNaN(post_id))
                return ctx.badRequest("Please provide a valid post id.");

            const dislikes = await strapi.entityService.findMany(
                "api::dislike.dislike",
                {
                    filters: { post: { id: post_id } },
                    populate: {
                        disliked_by: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                    },
                }
            );

            const users = dislikes
                .map((dislike) => (dislike as any).disliked_by)
                .filter(Boolean);
            return ctx.send(users);
        },
    })
);
