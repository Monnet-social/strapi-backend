"use strict";

import { profile } from "console";
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
            return ctx.badRequest(`Media with ID ${file_id} does not exist.`);
          }
        } catch (error) {
          return ctx.badRequest(`Media with ID ${file_id} does not exist.`);
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

      const newPost = await strapi.entityService.create("api::post.post", {
        data,
        populate: {
          posted_by: { fields: ["id", "username", "name"] },
          tagged_users: { fields: ["id", "username", "name"] },
          category: { fields: ["id", "name"] },
        },
      });
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
      const entity = await strapi.entityService.findOne("api::post.post", id, {
        ...query,
        populate: {
          posted_by: { fields: ["id", "username", "name"] },
          tagged_users: { fields: ["id", "username", "name"] },
          category: { fields: ["id", "name"] },
          ...query.populate,
        },
      });

      if (!entity) return ctx.notFound("Post not found");

      if (entity.post_type === "story") {
        const createdAt = new Date(entity.createdAt);
        const now = new Date();
        const expirationTime =
          createdAt.getTime() + STORY_EXPIRATION_HOURS * 60 * 60 * 1000;
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
    if (pagination_size) {
      default_pagination.pagination.pageSize = pagination_size;
    }

    if (page) {
      default_pagination.pagination.page = page;
    }
    try {
      const results = await strapi.entityService.findMany("api::post.post", {
        filters: {
          post_type: "post",
        },
        sort: { createdAt: "desc" },

        populate: {
          posted_by: { fields: ["id", "username", "name"] },
          category: { fields: ["id", "name"] },
          tagged_users: { fields: ["id", "username", "name"] },
          media: true,
        },
        start:
          (default_pagination.pagination.page - 1) *
          default_pagination.pagination.pageSize,
        limit: default_pagination.pagination.pageSize,
      });
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
        console.log("Optimised m41324edia for post:", results[i].media);
        results[i].media = await strapi
          .service("api::post.post")
          .getOptimisedFileData(results[i].media);
        results[i].posted_by = {
          id: results[i].posted_by?.id,
          username: results[i].posted_by?.username,
          name: results[i].posted_by?.name,

          profile_picture:
            "https://storage.googleapis.com/monnet-dev/media/Map_icon_3e1c0d13b0/Map_icon_3e1c0d13b0.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=strapi-bakend%40monnet-social.iam.gserviceaccount.com%2F20250626%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20250626T065242Z&X-Goog-Expires=900&X-Goog-SignedHeaders=host&X-Goog-Signature=2a95fbcd983df51219273ba1e98343899144361e315af92f05faa723a2c9b6d2473d96acf95db689813259cca9c1e95fc31d3f10e873d2080b2660b5efbc07260c3217aebe6c09eb00e6ce29272e3b329f261faa41533386feaf4ae6060075d4f87fc1b719c193cb6def73d211a342a661b32b51e23d9fbbb50fb3bd5bf7902623c9418384d87637de7cdc46afe87164cd804eb0c716fc019140971eda8ff9e5d84956462b594f8ed0fb74e0040396efbf26026a5fba66cdc88e61b6da0bfc591b494bc2e62175115666a17ef36a0c8618efce9e6bdec3a6e8b136c89c923cd3c7317a16080b9d4949f9205d4047cde376d398d3772b218eb8656c55852b88e7",
        };
        results[i].is_liked = await strapi.services[
          "api::like.like"
        ].verifyPostLikeByUser(results[i].id, userId);
        console.log("Optimised media for post:", results[i].media);
      }

      const count = await strapi.entityService.count("api::post.post", {
        filters: {
          post_type: "post",
        },
      });

      return ctx.send({
        data: results,
        meta: {
          pagination: {
            page: Number(default_pagination.pagination.page),
            pageSize: Number(default_pagination.pagination.pageSize),
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
      return ctx.internalServerError("An error occurred while fetching posts.");
    }
  },
  async stories(ctx) {
    const { id: userId } = ctx.state.user;
    const { pagination_size, page } = ctx.query;
    let default_pagination = {
      pagination: { page: 1, pageSize: 5 },
    };
    if (pagination_size) {
      default_pagination.pagination.pageSize = pagination_size;
    }
    if (page) {
      default_pagination.pagination.page = page;
    }
    try {
      const results = await strapi.entityService.findMany("api::post.post", {
        filters: {
          post_type: "story",
        },
        sort: { createdAt: "desc" },
        populate: {
          posted_by: { fields: ["id", "username", "name"] },
          category: { fields: ["id", "name"] },
          tagged_users: { fields: ["id", "username", "name"] },
          media: true,
        },
        start:
          (default_pagination.pagination.page - 1) *
          default_pagination.pagination.pageSize,
        limit: default_pagination.pagination.pageSize,
      });

      const count = await strapi.entityService.count("api::post.post", {
        filters: {
          post_type: "story",
        },
      });

      for (let i = 0; i < results.length; i++) {
        const createdAt = new Date(results[i].createdAt);
        const now = new Date();
        const expirationTime =
          createdAt.getTime() + STORY_EXPIRATION_HOURS * 60 * 60 * 1000;
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
        console.log("Optimised media for post:", results[i].media);
      }

      return ctx.send({
        data: results,
        meta: {
          pagination: {
            page: Number(default_pagination.pagination.page),
            pageSize: Number(default_pagination.pagination.pageSize),
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
    if (pagination_size) {
      default_pagination.pagination.pageSize = pagination_size;
    }

    if (page) {
      default_pagination.pagination.page = page;
    }
    if (!userId)
      return ctx.unauthorized("You must be logged in to get friends to tag.");

    try {
      const users = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: { id: { $ne: userId } },
          fields: ["id", "username", "name"],
          start:
            (default_pagination.pagination.page - 1) *
            default_pagination.pagination.pageSize,
          limit: default_pagination.pagination.pageSize,
        }
      );

      const count = await strapi.entityService.count(
        "plugin::users-permissions.user",
        {
          filters: { id: { $ne: userId } },
        }
      );

      return ctx.send({
        data: users,
        message: "Friends fetched successfully.",
        meta: {
          pagination: {
            page: Number(default_pagination.pagination.page),
            pageSize: Number(default_pagination.pagination.pageSize),
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

    const file_url = await new FileOptimisationService().getSignedUrl(media_id);
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
      const posts = await strapi.entityService.findMany("api::post.post", {
        filters: {
          id: postId,
          posted_by: userId,
        },
      });

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
            posted_by: { fields: ["id", "username", "name"] },
            tagged_users: { fields: ["id", "username", "name"] },
            category: { fields: ["id", "name"] },
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
      const posts = await strapi.entityService.findMany("api::post.post", {
        filters: {
          id: postId,
          posted_by: userId,
        },
      });

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
