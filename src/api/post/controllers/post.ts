"use strict";

import FileOptimisationService from "../../../utils/file_optimisation_service";

const { createCoreController } = require("@strapi/strapi").factories;

const STORY_EXPIRATION_HOURS = 24;

module.exports = createCoreController("api::post.post", ({ strapi }) => ({
    async create(ctx) {
        const { id: userId } = ctx.state.user;
        if (!userId)
            return ctx.unauthorized("You must be logged in to create a post.");

        const data: any = ctx.request.body;
        data.posted_by = userId;
        if (
            !data ||
            !data.title ||
            !data.post_type ||
            !data.category ||
            data?.media?.length === 0
        )
            return ctx.badRequest("Missing required fields.");

        if (data?.media?.length > 0) {
            for (let i = 0; i < data.media.length; i++) {
                const file_id = data.media[i];
                try {
                    const file_data = await strapi.entityService.findOne(
                        "plugin::upload.file",
                        file_id
                    );
                    if (!file_data) {
                        return ctx.badRequest(
                            `Media with ID ${file_id} does not exist.`
                        );
                    }
                } catch (error) {
                    return ctx.badRequest(
                        `Media with ID ${file_id} does not exist.`
                    );
                }
            }
        }

        if (data.category) {
            const categoryExists = await strapi.entityService.findOne(
                "api::category.category",
                data.category
            );
            if (!categoryExists)
                return ctx.badRequest(
                    `The provided category with ID ${data.category} does not exist.`
                );
        }
        if (
            data.tagged_users &&
            Array.isArray(data.tagged_users) &&
            data.tagged_users.length > 0
        ) {
            if (data?.tagged_users?.includes(userId)) {
                return ctx.badRequest("You cannot tag yourself in a post.");
            }
            const foundUsers = await strapi.entityService.findMany(
                "plugin::users-permissions.user",
                {
                    filters: { id: { $in: data.tagged_users } },
                    fields: ["id"],
                }
            );
            if (foundUsers.length !== data.tagged_users.length) {
                const foundUserIds = foundUsers.map((user) => user.id);
                const invalidUserIds = data.tagged_users.filter(
                    (id) => !foundUserIds.includes(id)
                );
                return ctx.badRequest(
                    `The following tagged user IDs do not exist: ${invalidUserIds.join(", ")}`
                );
            }
        }
        if (data.location) {
            const { latitute, longitude, address, zip } = data.location;
            if (
                (latitute !== undefined && typeof latitute !== "number") ||
                (longitude !== undefined && typeof longitude !== "number")
            )
                return ctx.badRequest(
                    "If provided, location latitude and longitude must be numbers."
                );
        }

        try {
            data.posted_by = userId;

            const newPost = await strapi.entityService.create(
                "api::post.post",
                {
                    data,
                    populate: {
                        posted_by: { fields: ["id", "username", "name"] },
                        tagged_users: { fields: ["id", "username", "name"] },
                        category: { fields: ["id", "name"] },
                    },
                }
            );
            const find_user = await strapi.entityService.findMany(
                "plugin::users-permissions.user",
                {
                    filters: { id: userId },
                    fields: ["id", "username", "name"],
                }
            );

            const message =
                data.post_type === "post" ? "Post created" : "Story added";
            return ctx.send({
                post: newPost,

                message: `${message} successfully.`,
            });
        } catch (err) {
            console.error("Create Post Error:", err);
            return ctx.internalServerError(
                "An unexpected error occurred while creating the post."
            );
        }
    },

    async findOne(ctx) {
        const { id } = ctx.params;
        const { query } = ctx;

        try {
            const entity = await strapi.entityService.findOne(
                "api::post.post",
                id,
                {
                    ...query,
                    populate: {
                        posted_by: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                        tagged_users: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                        category: { fields: ["id", "name"] },
                        media: true,
                        ...query.populate,
                    },
                }
            );

            if (!entity) return ctx.notFound("Post not found");

            if (entity.post_type === "story") {
                const createdAt = new Date(entity.createdAt);
                const now = new Date();
                const expirationTime =
                    createdAt.getTime() +
                    STORY_EXPIRATION_HOURS * 60 * 60 * 1000;
                entity.expiration_time = expirationTime;
                if (now.getTime() > expirationTime)
                    return ctx.notFound(
                        "This story has expired and is no longer available."
                    );
            }

            return ctx.send(entity);
        } catch (err) {
            console.error("Find One Post Error:", err);
            return ctx.internalServerError(
                "An error occurred while fetching the post."
            );
        }
    },

    async feed(ctx) {
        console.log("Fetching feed with query:", ctx.state);
        const { id: userId } = ctx.state.user;
        const { pagination_size, page } = ctx.query;

        let default_pagination = {
            pagination: { page: 1, pageSize: 10 },
        };
        if (pagination_size)
            default_pagination.pagination.pageSize = pagination_size;

        if (page) default_pagination.pagination.page = page;

        try {
            const results = await strapi.entityService.findMany(
                "api::post.post",
                {
                    filters: {
                        post_type: "post",
                    },
                    sort: { createdAt: "desc" },

                    populate: {
                        posted_by: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                        category: { fields: ["id", "name"] },
                        tagged_users: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                        media: true,
                    },
                    start:
                        (default_pagination.pagination.page - 1) *
                        default_pagination.pagination.pageSize,
                    limit: default_pagination.pagination.pageSize,
                }
            );

            console.log("Feed results:", results);
            for (let i = 0; i < results.length; i++) {
                const likesCount = await strapi.services[
                    "api::like.like"
                ].getLikesCount(results[i].id);
                results[i].likes_count = likesCount;

                const commentsCount = await strapi.services[
                    "api::comment.comment"
                ].getCommentsCount(results[i].id);
                results[i].comments_count = commentsCount;

                results[i].media = await strapi
                    .service("api::post.post")
                    .getOptimisedFileData(results[i].media);

                results[i].posted_by = {
                    id: results[i].posted_by?.id,
                    username: results[i].posted_by?.username,
                    name: results[i].posted_by?.name,
                    profile_picture: results[i].posted_by?.profile_picture,
                };

                results[i].is_liked = await strapi.services[
                    "api::like.like"
                ].verifyPostLikeByUser(results[i].id, userId);
            }

            const count = await strapi.entityService.count("api::post.post", {
                filters: { post_type: "post" },
            });

            return ctx.send({
                data: results,
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
                message: "Posts fetched successfully.",
            });
        } catch (err) {
            console.error("Find Posts Error:", err);
            return ctx.internalServerError(
                "An error occurred while fetching posts."
            );
        }
    },

    async stories(ctx) {
        const { pagination_size, page } = ctx.query;
        let default_pagination = {
            pagination: { page: 1, pageSize: 5 },
        };
        if (pagination_size)
            default_pagination.pagination.pageSize = pagination_size;

        if (page) default_pagination.pagination.page = page;

        try {
            const results = await strapi.entityService.findMany(
                "api::post.post",
                {
                    filters: {
                        post_type: "story",
                    },
                    sort: { createdAt: "desc" },
                    populate: {
                        posted_by: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                        category: { fields: ["id", "name"] },
                        tagged_users: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                        media: true,
                    },
                    start:
                        (default_pagination.pagination.page - 1) *
                        default_pagination.pagination.pageSize,
                    limit: default_pagination.pagination.pageSize,
                }
            );

            const count = await strapi.entityService.count("api::post.post", {
                filters: { post_type: "story" },
            });

            for (let i = 0; i < results.length; i++) {
                const createdAt = new Date(results[i].createdAt);
                const expirationTime =
                    createdAt.getTime() +
                    STORY_EXPIRATION_HOURS * 60 * 60 * 1000;
                results[i].expiration_time = expirationTime;

                const likesCount = await strapi.services[
                    "api::like.like"
                ].getLikesCount(results[i].id);
                results[i].likes_count = likesCount;

                const commentsCount = await strapi.services[
                    "api::comment.comment"
                ].getCommentsCount(results[i].id);
                results[i].comments_count = commentsCount;

                results[i].media = await strapi
                    .service("api::post.post")
                    .getOptimisedFileData(results[i].media);

                results[i].posted_by = {
                    id: results[i].posted_by?.id,
                    username: results[i].posted_by?.username,
                    name: results[i].posted_by?.name,
                    profile_picture: results[i].posted_by?.profile_picture,
                };
            }

            return ctx.send({
                data: results,
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
                message: "Stories fetched successfully.",
            });
        } catch (err) {
            console.error("Find Stories Error:", err);
            return ctx.internalServerError(
                "An error occurred while fetching stories."
            );
        }
    },

    //replace by followers for now returning all users except the current user
    async getFriendsToTag(ctx) {
        const { id: userId } = ctx.state.user;
        const { pagination_size, page } = ctx.query;

        let default_pagination = {
            pagination: { page: 1, pageSize: 20 },
        };
        if (pagination_size)
            default_pagination.pagination.pageSize = pagination_size;

        if (page) default_pagination.pagination.page = page;

        if (!userId)
            return ctx.unauthorized(
                "You must be logged in to get friends to tag."
            );

        try {
            const users = await strapi.entityService.findMany(
                "plugin::users-permissions.user",
                {
                    filters: { id: { $ne: userId } },
                    fields: ["id", "username", "name"],
                    populate: { profile_picture: true },
                    start:
                        (default_pagination.pagination.page - 1) *
                        default_pagination.pagination.pageSize,
                    limit: default_pagination.pagination.pageSize,
                }
            );

            const count = await strapi.entityService.count(
                "plugin::users-permissions.user",
                { filters: { id: { $ne: userId } } }
            );

            return ctx.send({
                data: users,
                message: "Friends fetched successfully.",
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
        } catch (err) {
            console.error("Get Friends Error:", err);
            return ctx.internalServerError(
                "An error occurred while fetching friends."
            );
        }
    },

    async testFIleUpload(ctx) {
        const { file } = ctx.request.files;
        if (!file) {
            return ctx.badRequest("No file uploaded.");
        }
        console.log("File received:", file);
        const file_service =
            await new FileOptimisationService().uploadFileToCloudStorage(
                file.filepath,
                file.mimetype
            );
        return ctx.send({
            message: "File uploaded successfully.",
            file_url: file_service,
        });
    },

    async getTestFile(ctx) {
        const { media_id } = ctx.params;
        if (!media_id) return ctx.badRequest("Media ID is required.");

        const file_url = await new FileOptimisationService().getSignedUrl(
            media_id
        );
        if (file_url) {
            return ctx.send({
                file_url,
                message: "File fetched successfully.",
            });
        } else {
            return ctx.badRequest("Failed to fetch the file.");
        }
    },

    async update(ctx) {
        const { id: postId } = ctx.params;
        const { id: userId } = ctx.state.user;
        const data = ctx.request.body;

        try {
            const posts = await strapi.entityService.findMany(
                "api::post.post",
                { filters: { id: postId, posted_by: userId }, limit: 1 }
            );

            if (posts.length === 0)
                return ctx.forbidden(
                    "You are not allowed to update this post, or it does not exist."
                );

            if (data.category) {
                const categoryExists = await strapi.entityService.findOne(
                    "api::category.category",
                    data.category
                );
                if (!categoryExists)
                    return ctx.badRequest(
                        `The provided category with ID ${data.category} does not exist.`
                    );
            }

            if (data.tagged_users && Array.isArray(data.tagged_users)) {
                const foundUsers = await strapi.entityService.findMany(
                    "plugin::users-permissions.user",
                    {
                        filters: { id: { $in: data.tagged_users } },
                        fields: ["id"],
                    }
                );
                if (foundUsers.length !== data.tagged_users.length) {
                    const foundUserIds = foundUsers.map((user) => user.id);
                    const invalidUserIds = data.tagged_users.filter(
                        (id) => !foundUserIds.includes(id)
                    );
                    return ctx.badRequest(
                        `The following tagged user IDs do not exist: ${invalidUserIds.join(", ")}`
                    );
                }
            }

            if (data.location) {
                const { latitute, longitude } = data.location;
                if (
                    (latitute !== undefined && typeof latitute !== "number") ||
                    (longitude !== undefined && typeof longitude !== "number")
                )
                    return ctx.badRequest(
                        "If provided, location latitude and longitude must be numbers."
                    );
            }
            const updatedPost = await strapi.entityService.update(
                "api::post.post",
                postId,
                {
                    data,
                    populate: {
                        posted_by: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                        tagged_users: {
                            fields: ["id", "username", "name"],
                            populate: { profile_picture: true },
                        },
                        category: { fields: ["id", "name"] },
                        media: true,
                    },
                }
            );

            return ctx.send({
                updatedPost,
                message: "Post updated successfully.",
            });
        } catch (err) {
            console.error("Update Post Error:", err);
            return ctx.internalServerError(
                "An unexpected error occurred while updating the post."
            );
        }
    },

    async delete(ctx) {
        const { id: postId } = ctx.params;
        const { id: userId } = ctx.state.user;

        try {
            const posts = await strapi.entityService.findMany(
                "api::post.post",
                { filters: { id: postId, posted_by: userId }, limit: 1 }
            );

            if (posts.length === 0)
                return ctx.forbidden(
                    "You are not allowed to delete this post, or it does not exist."
                );

            const deletedPost = await strapi.entityService.delete(
                "api::post.post",
                postId
            );

            return ctx.send({
                deletedPost,
                message: "Post deleted successfully.",
            });
        } catch (err) {
            console.error("Delete Post Error:", err);
            return ctx.internalServerError(
                "An error occurred while deleting the post."
            );
        }
    },
}));
