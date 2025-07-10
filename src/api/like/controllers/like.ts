/**
 * like controller
 */

import { factories } from "@strapi/strapi";
import { stat } from "fs";

export default factories.createCoreController(
    "api::like.like",
    ({ strapi }) => ({
        async likePost(ctx) {
            const { post_id } = ctx.request.body;
            const userId = ctx.state.user.id;
            const existingLike = await strapi.entityService.findMany(
                "api::like.like",
                { filters: { post: post_id, liked_by: userId } }
            );
            if (existingLike.length > 0) {
                await strapi.entityService.delete(
                    "api::like.like",
                    existingLike[0].id
                );
                return ctx.send({
                    message: "Post unliked successfully ",
                    status: 200,
                });
            }
            const createLike = await strapi.entityService.create(
                "api::like.like",
                {
                    data: { post: post_id, liked_by: userId },
                }
            );
            return ctx.send({
                message: "Post liked successfully ",
                status: 200,
            });
        },
        // async unlikePost(ctx) {
        //   const { post_id } = ctx.request.body;
        //   const userId = ctx.state.user.id;
        //   const existingLike = await strapi.entityService.findMany(
        //     "api::like.like",
        //     {
        //       filters: { post: post_id, liked_by: userId },
        //     }
        //   );
        //   if (existingLike.length === 0) {
        //     return ctx.send({ message: "Post unliked successfully ", status: 200 });
        //   }
        //   await strapi.entityService.delete("api::like.like", existingLike[0].id);
        //   return ctx.send({ message: "Post unliked successfully ", status: 200 });
        // },
        async getLikesByPostId(ctx) {
            const { post_id } = ctx.params;
            const { user: currentUser } = ctx.state;

            if (!post_id || isNaN(post_id))
                return ctx.badRequest("Please provide a valid post id.");

            if (!currentUser)
                return ctx.unauthorized(
                    "You must be logged in to perform this action."
                );

            try {
                const likes = await strapi.entityService.findMany(
                    "api::like.like",
                    {
                        filters: { post: { id: post_id } },
                        populate: {
                            liked_by: {
                                fields: ["id", "username", "email", "name"],
                                populate: { profile_picture: true },
                            },
                        },
                    }
                );

                const users = likes
                    .map((like: any) => like.liked_by)
                    .filter(Boolean);
                if (users.length === 0) return ctx.send([]);

                const userIds = users.map((u) => u.id);
                const currentUserId = currentUser.id;

                const iFollowRelations = await strapi.entityService.findMany(
                    "api::following.following",
                    {
                        filters: {
                            follower: currentUserId,
                            subject: { id: { $in: userIds } },
                        },
                        populate: { subject: true },
                    }
                );
                const iFollowIds = new Set(
                    iFollowRelations.map((rel: any) => rel.subject.id)
                );

                const followsMeRelations = await strapi.entityService.findMany(
                    "api::following.following",
                    {
                        filters: {
                            subject: currentUserId,
                            follower: { id: { $in: userIds } },
                        },
                        populate: { follower: true },
                    }
                );
                const followsMeIds = new Set(
                    followsMeRelations.map((rel: any) => rel.follower.id)
                );

                for (const user of users) {
                    const userWithFlags: any = user;
                    console.log(userWithFlags);
                    userWithFlags.is_following = iFollowIds.has(user.id);
                    userWithFlags.is_followed_by = followsMeIds.has(user.id);

                    if (
                        userWithFlags.profile_picture !== null &&
                        userWithFlags.profile_picture.id
                    ) {
                        let profile_picture = await strapi
                            .service("api::post.post")
                            .getOptimisedFileData([
                                userWithFlags.profile_picture,
                            ]);
                        userWithFlags.profile_picture = profile_picture[0];
                        console.log(userWithFlags, profile_picture);
                    } else userWithFlags.profile_picture = null;
                }

                return ctx.send(users);
            } catch (err) {
                strapi.log.error("Error in getLikesByPostId:", err);
                return ctx.internalServerError(
                    "An error occurred while fetching likes."
                );
            }
        },
    })
);
