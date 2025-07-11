import { factories } from "@strapi/strapi";

export default factories.createCoreController(
    "api::following.following",
    ({ strapi }) => ({
        async followUnfollowUser(ctx) {
            const userId = ctx.state.user.id;
            const { subjectId } = ctx.request.body;
            if (!subjectId) return ctx.badRequest("Subject ID is required");
            if (userId === subjectId)
                return ctx.badRequest("You cannot follow/unfollow yourself");

            const existingFollow = await strapi.entityService.findMany(
                "api::following.following",
                {
                    filters: {
                        follower: { id: userId },
                        subject: { id: subjectId },
                    },
                    limit: 1,
                }
            );
            if (existingFollow.length > 0) {
                await strapi.entityService.delete(
                    "api::following.following",
                    existingFollow[0].id
                );
                return ctx.send({ message: "Unfollowed successfully" });
            }

            try {
                await strapi.entityService.create("api::following.following", {
                    data: {
                        follower: userId,
                        subject: subjectId,
                    },
                });

                return ctx.send({
                    message: "Followed successfully",
                });
            } catch (error) {
                return ctx.internalServerError("Error following user", {
                    error,
                });
            }
        },

        async getUserFollowers(ctx) {
            const { userId } = ctx.params;
            const { user: currentUser } = ctx.state;
            const { pagination_size, page } = ctx.query;

            let default_pagination: any = {
                pagination: { page: 1, pageSize: 10 },
            };
            if (pagination_size)
                default_pagination.pagination.pageSize = pagination_size;
            if (page) default_pagination.pagination.page = page;
            if (!userId) return ctx.badRequest("User ID is required");
            if (!currentUser)
                return ctx.unauthorized(
                    "You must be logged in to perform this action."
                );

            try {
                const followersEntries = await strapi.entityService.findMany(
                    "api::following.following",
                    {
                        filters: { subject: { id: userId } },
                        populate: {
                            follower: {
                                fields: ["id", "username", "email", "name"],
                                populate: { profile_picture: true },
                            },
                        },
                        start:
                            (default_pagination.pagination.page - 1) *
                            default_pagination.pagination.pageSize,
                        limit: default_pagination.pagination.pageSize,
                    }
                );

                const users = followersEntries
                    .map((entry: any) => entry.follower)
                    .filter(Boolean);

                if (users.length > 0) {
                    await Promise.all([
                        strapi
                            .service("api::following.following")
                            .enrichItemsWithFollowStatus({
                                items: followersEntries,
                                userPaths: ["follower"],
                                currentUserId: currentUser.id,
                            }),
                        strapi
                            .service("api::post.post")
                            .enrichUsersWithOptimizedProfilePictures(users),
                    ]);
                }

                const count = await strapi.entityService.count(
                    "api::following.following",
                    {
                        filters: { subject: { id: userId } },
                    }
                );

                return ctx.send({
                    data: users,
                    meta: {
                        pagination: {
                            page: Number(default_pagination.pagination.page),
                            pageSize: Number(
                                default_pagination.pagination.pageSize
                            ),
                            pageCount: Math.ceil(
                                count / default_pagination.pagination.pageSize
                            ),
                            total: count,
                        },
                    },
                });
            } catch (error) {
                strapi.log.error("Error fetching followers:", error);
                return ctx.internalServerError("Error fetching followers", {
                    error,
                });
            }
        },

        async getUserFollowing(ctx) {
            const { userId } = ctx.params;
            const { user: currentUser } = ctx.state;
            const { pagination_size, page } = ctx.query;

            let default_pagination: any = {
                pagination: { page: 1, pageSize: 10 },
            };
            if (pagination_size)
                default_pagination.pagination.pageSize = pagination_size;
            if (page) default_pagination.pagination.page = page;
            if (!userId) return ctx.badRequest("User ID is required");
            if (!currentUser)
                return ctx.unauthorized(
                    "You must be logged in to perform this action."
                );

            try {
                const followingEntries = await strapi.entityService.findMany(
                    "api::following.following",
                    {
                        filters: { follower: { id: userId } },
                        populate: {
                            subject: {
                                fields: ["id", "username", "email", "name"],
                                populate: { profile_picture: true },
                            },
                        },
                        start:
                            (default_pagination.pagination.page - 1) *
                            default_pagination.pagination.pageSize,
                        limit: default_pagination.pagination.pageSize,
                    }
                );

                const users = followingEntries
                    .map((entry: any) => entry.subject)
                    .filter(Boolean);

                if (users.length > 0) {
                    await Promise.all([
                        strapi
                            .service("api::following.following")
                            .enrichItemsWithFollowStatus({
                                items: followingEntries,
                                userPaths: ["subject"],
                                currentUserId: currentUser.id,
                            }),
                        strapi
                            .service("api::post.post")
                            .enrichUsersWithOptimizedProfilePictures(users),
                    ]);
                }

                const count = await strapi.entityService.count(
                    "api::following.following",
                    {
                        filters: { follower: { id: userId } },
                    }
                );

                return ctx.send({
                    data: users,
                    meta: {
                        pagination: {
                            page: Number(default_pagination.pagination.page),
                            pageSize: Number(
                                default_pagination.pagination.pageSize
                            ),
                            pageCount: Math.ceil(
                                count / default_pagination.pagination.pageSize
                            ),
                            total: count,
                        },
                    },
                });
            } catch (error) {
                strapi.log.error("Error fetching following:", error);
                return ctx.internalServerError("Error fetching following", {
                    error,
                });
            }
        },

        async addCloseFriends(ctx) {
            const userId = ctx.state.user.id;
            const { subjectId } = ctx.request.body;
            if (!subjectId) return ctx.badRequest("Subject ID is required");
            const findRelation = await strapi.entityService.findMany(
                "api::following.following",
                {
                    filters: {
                        follower: { id: userId },
                        subject: { id: subjectId },
                    },
                }
            );
            if (findRelation?.length == 0)
                return ctx.badRequest("You are not following this user");

            const existingCloseFriends = await strapi.entityService.findMany(
                "api::following.following",
                {
                    filters: {
                        follower: { id: subjectId },
                        subject: { id: userId },
                    },
                }
            );
            if (existingCloseFriends.length == 0)
                return ctx.badRequest("User is not follwing you back");

            const updateCloseFriends = await strapi.entityService.update(
                "api::following.following",
                findRelation[0].id,
                { data: { is_close_friend: !findRelation[0].is_close_friend } }
            );
            return ctx.send({
                message: "Close friends updated successfully",
            });
        },
    })
);
