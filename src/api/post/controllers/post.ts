"use strict";

import FileOptimisationService from "../../../utils/file_optimisation_service";
import HelperService from "../../../utils/helper_service";

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::post.post", ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user)
      return ctx.unauthorized("You must be logged in to create a post.");
    const userId = user.id;
    try {
      let data = ctx.request.body;
      if (!data)
        return ctx.badRequest("Request body must contain a data object.");

      if (
        !data.title ||
        !data.post_type ||
        (data.post_type === "post" && !data.category) ||
        !data.media ||
        data.media.length === 0
      )
        return ctx.badRequest(
          "Missing required fields.(title, post_type, category, media)"
        );

      if (data.share_with) {
        const allowedShareWithOptions = [
          "PUBLIC",
          "FOLLOWERS",
          "CLOSE-FRIENDS",
        ];
        if (!allowedShareWithOptions.includes(data.share_with))
          return ctx.badRequest(
            `Invalid share_with value. Allowed values are: ${allowedShareWithOptions.join(", ")}`
          );
      } else data.share_with = "PUBLIC";

      if (data.share_with === "CLOSE-FRIENDS") {
        if (
          !data.share_with_close_friends ||
          !Array.isArray(data.share_with_close_friends) ||
          data.share_with_close_friends.length === 0
        )
          return ctx.badRequest(
            "For 'CLOSE-FRIENDS' sharing, 'share_with_close_friends' must be a non-empty array of user IDs."
          );

        const foundCloseFriends = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { id: { $in: data.share_with_close_friends } },
            fields: ["id"],
          }
        );

        if (foundCloseFriends.length !== data.share_with_close_friends.length) {
          const foundCloseFriendIds = foundCloseFriends.map((u) => u.id);
          const invalidCloseFriendIds = data.share_with_close_friends.filter(
            (id) => !foundCloseFriendIds.includes(id)
          );
          return ctx.badRequest(
            `The following 'share_with_close_friends' user IDs do not exist: ${invalidCloseFriendIds.join(", ")}`
          );
        }

        if (data.share_with_close_friends.includes(userId))
          return ctx.badRequest(
            "You cannot include yourself in the 'share_with_close_friends' list."
          );
      } else {
        if (
          data.share_with_close_friends &&
          data.share_with_close_friends.length > 0
        )
          return ctx.badRequest(
            "'share_with_close_friends' should only be provided when 'share_with' is 'CLOSE-FRIENDS'."
          );
        delete data.share_with_close_friends;
      }

      if (data.media && data.media.length > 0) {
        for (let i = 0; i < data.media.length; i++) {
          const file_id = data.media[i];
          try {
            const file_data = await strapi.entityService.findOne(
              "plugin::upload.file",
              file_id
            );
            if (!file_data)
              return ctx.badRequest(`Media with ID ${file_id} does not exist.`);
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
        if (data.tagged_users.includes(userId))
          return ctx.badRequest("You cannot tag yourself in a post.");
        const foundUsers = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { id: { $in: data.tagged_users } },
            fields: ["id"],
          }
        );
        if (foundUsers.length !== data.tagged_users.length) {
          const foundUserIds = foundUsers.map((u) => u.id);
          const invalidUserIds = data.tagged_users.filter(
            (id) => !foundUserIds.includes(id)
          );
          return ctx.badRequest(
            `The following tagged user IDs do not exist: ${invalidUserIds.join(
              ", "
            )}`
          );
        }
      }

      if (data.location) {
        const { latitude, longitude, address = "" } = data.location;
        if (
          (latitude !== undefined && typeof latitude !== "number") ||
          (longitude !== undefined && typeof longitude !== "number")
        )
          return ctx.badRequest(
            "If provided, location latitude and longitude must be numbers."
          );

        if (address) {
          const geocodedLocation = await HelperService.geocodeAddress(address);
          if (geocodedLocation) {
            data.location.latitude = geocodedLocation.latitude;
            data.location.longitude = geocodedLocation.longitude;
          }
        }
      }

      if (data.repost_of) {
        const initialRepostTargetId = data.repost_of;

        let postToRepost = await strapi.entityService.findOne(
          "api::post.post",
          initialRepostTargetId,
          { populate: { posted_by: true, repost_of: true } }
        );

        if (!postToRepost)
          return ctx.badRequest(
            `The post you are trying to repost (ID: ${initialRepostTargetId}) does not exist.`
          );

        if (postToRepost.repost_of) {
          data.repost_of = postToRepost.repost_of.id;

          postToRepost = await strapi.entityService.findOne(
            "api::post.post",
            postToRepost.repost_of.id,
            { populate: { posted_by: true } }
          );
          if (!postToRepost)
            return ctx.badRequest(
              `The original post you are trying to repost does not exist.`
            );
        }

        if (postToRepost.posted_by.id === userId)
          return ctx.badRequest("You cannot repost your own post.");
      }

      data.posted_by = userId;

      const newPost = await strapi.entityService.create("api::post.post", {
        data,
        populate: {
          posted_by: { fields: ["id", "username", "name"] },
          tagged_users: { fields: ["id", "username", "name"] },
          category: { fields: ["id", "name"] },
          ...(data.share_with === "CLOSE-FRIENDS" &&
            data.share_with_close_friends
            ? {
              share_with_close_friends: {
                fields: ["id", "username", "name"],
              },
            }
            : {}),
        },
      });

      const message =
        data.post_type === "post" ? "Post created" : "Story added";
      return ctx.send({
        post: newPost,
        message: `${message} successfully.`,
      });
    } catch (err) {
      console.error("Create Post Error:", err);
      return ctx.internalServerError(
        "An unexpected error occurred while creating the post.",
        { details: err.message }
      );
    }
  },

  async findOneAdmin(ctx) {
    const { id } = ctx.params;

    try {
      const entity = await strapi.entityService.findOne("api::post.post", id, {
        populate: {
          media: true,
          posted_by: {
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
          },
        },
      });

      if (!entity) return ctx.notFound("Post not found");

      entity.media =
        (await strapi
          .service("api::post.post")
          .getOptimisedFileData(entity.media)) || [];
      entity.likes_count = await strapi.services[
        "api::like.like"
      ].getLikesCount(entity.id);
      entity.comments_count = await strapi.services[
        "api::comment.comment"
      ].getCommentsCount(entity.id);
      const usersToProcess = [entity.posted_by];
      await strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures(usersToProcess);

      return ctx.send(entity);
    } catch (err) {
      console.error("Find One Post Error:", err);
      return ctx.internalServerError(
        "An error occurred while fetching the post."
      );
    }
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    const { id: userId } = ctx.state.user;

    try {
      const entity = await strapi.entityService.findOne("api::post.post", id, {
        populate: {
          posted_by: {
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
          },
          tagged_users: {
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
          },
          category: { fields: ["id", "name"] },
          media: true,
        },
      });

      if (!entity) return ctx.notFound("Post not found");

      const usersToProcess = [entity.posted_by, ...entity.tagged_users].filter(
        Boolean
      );

      await Promise.all([
        strapi.service("api::following.following").enrichItemsWithFollowStatus({
          items: [entity],
          userPaths: ["posted_by", "tagged_users"],
          currentUserId: userId,
        }),
        strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedProfilePictures(usersToProcess),
      ]);

      entity.likes_count = await strapi.services[
        "api::like.like"
      ].getLikesCount(entity.id);
      entity.is_liked = await strapi.services[
        "api::like.like"
      ].verifyPostLikeByUser(entity.id, userId);
      entity.dislikes_count = await strapi
        .service("api::dislike.dislike")
        .getDislikesCountByPostId(entity.id);
      entity.is_disliked = await strapi
        .service("api::dislike.dislike")
        .verifyPostDislikedByUser(entity.id, userId);
      entity.comments_count = await strapi.services[
        "api::comment.comment"
      ].getCommentsCount(entity.id);
      entity.media =
        (await strapi
          .service("api::post.post")
          .getOptimisedFileData(entity.media)) || [];

      if (entity.post_type === "story") {
        const createdAt = new Date(entity.createdAt);
        const now = new Date();
        const expirationTime = createdAt.getTime() + 24 * 60 * 60 * 1000;
        entity.expiration_time = expirationTime;
        if (now.getTime() > expirationTime) {
          return ctx.notFound(
            "This story has expired and is no longer available."
          );
        }
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
    const { id: userId } = ctx.state.user;
    const { pagination_size, page } = ctx.query;

    let default_pagination = {
      pagination: { page: 1, pageSize: 10 },
    };
    if (pagination_size)
      default_pagination.pagination.pageSize = pagination_size;
    if (page) default_pagination.pagination.page = page;

    try {
      const blockEntries = await strapi.entityService.findMany(
        "api::block.block",
        {
          filters: { blocked_by: { id: userId } },
          populate: { blocked_user: { fields: ["id"] } },
        }
      );
      const blockedUserIds = blockEntries.map(
        (entry: any) => entry.blocked_user.id
      );

      const results = await strapi.entityService.findMany("api::post.post", {
        filters: {
          post_type: "post",
          media: { id: { $notNull: true } },
          posted_by: {
            id: {
              $notIn: blockedUserIds.length > 0 ? blockedUserIds : [-1],
            },
          },
        },
        sort: { createdAt: "desc" },
        populate: {
          posted_by: {
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
          },
          category: { fields: ["id", "name"] },
          tagged_users: {
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
          },
          media: true,
        },
        start:
          (default_pagination.pagination.page - 1) *
          default_pagination.pagination.pageSize,
        limit: default_pagination.pagination.pageSize,
      });

      if (results.length > 0) {
        const usersToProcess = results
          .flatMap((post) => [post.posted_by, ...(post.tagged_users || [])])
          .filter(Boolean);

        await Promise.all([
          strapi
            .service("api::following.following")
            .enrichItemsWithFollowStatus({
              items: results,
              userPaths: ["posted_by", "tagged_users"],
              currentUserId: userId,
            }),
          strapi
            .service("api::post.post")
            .enrichUsersWithOptimizedProfilePictures(usersToProcess),
        ]);
      }

      for (const post of results) {
        post.likes_count = await strapi.services[
          "api::like.like"
        ].getLikesCount(post.id);
        post.is_liked = await strapi.services[
          "api::like.like"
        ].verifyPostLikeByUser(post.id, userId);
        post.dislikes_count = await strapi
          .service("api::dislike.dislike")
          .getDislikesCountByPostId(post.id);
        post.is_disliked = await strapi
          .service("api::dislike.dislike")
          .verifyPostDislikedByUser(post.id, userId);
        post.comments_count = await strapi.services[
          "api::comment.comment"
        ].getCommentsCount(post.id);
        post.share_count = await strapi.services[
          "api::share.share"
        ].countShares(post.id);
        post.media =
          (await strapi
            .service("api::post.post")
            .getOptimisedFileData(post.media)) || [];
      }

      const count = await strapi.entityService.count("api::post.post", {
        filters: {
          post_type: "post",
          media: { id: { $notNull: true } },
          posted_by: {
            id: {
              $notIn: blockedUserIds.length > 0 ? blockedUserIds : [-1],
            },
          },
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
    const {
      pagination_size,
      page,
      filter = "temporary",
      user_id: specificUserId,
    } = ctx.query;
    const { id: currentUserId } = ctx.state.user;

    let followingUserIds = [];
    let followerUserIds = [];
    let closeFriendUserIds = [];
    let blockedUserIds = [];

    if (currentUserId) {
      const followingEntries = await strapi.entityService.findMany(
        "api::following.following",
        {
          filters: { follower: { id: currentUserId } },
          populate: { subject: { fields: ["id"] } },
        }
      );
      followingUserIds = followingEntries
        .filter((entry) => entry.subject)
        .map((entry) => entry.subject.id);

      const followerEntries = await strapi.entityService.findMany(
        "api::following.following",
        {
          filters: { subject: { id: currentUserId } },
          populate: { follower: { fields: ["id"] } },
        }
      );
      followerUserIds = followerEntries
        .filter((entry) => entry.follower)
        .map((entry) => entry.follower.id);

      const closeFriendsFollowingEntries = await strapi.entityService.findMany(
        "api::following.following",
        {
          filters: {
            follower: { id: currentUserId },
            is_close_friend: true,
          },
          populate: { subject: { fields: ["id"] } },
        }
      );
      closeFriendUserIds = closeFriendsFollowingEntries
        .filter((entry) => entry.subject)
        .map((entry) => entry.subject.id);

      const blockEntries = await strapi.entityService.findMany(
        "api::block.block",
        {
          filters: { blocked_by: { id: currentUserId } },
          populate: { blocked_user: { fields: ["id"] } },
        }
      );
      blockedUserIds = blockEntries
        .filter((entry) => entry.blocked_user)
        .map((entry) => entry.blocked_user.id);
    }

    let default_pagination = {
      pagination: { page: 1, pageSize: 10 },
    };
    if (pagination_size)
      default_pagination.pagination.pageSize = pagination_size;
    if (page) default_pagination.pagination.page = page;

    try {
      const twentyFourHoursAgo = new Date(
        new Date().getTime() - 24 * 60 * 60 * 1000
      );
      const baseStoryFilters = {
        post_type: "story",
        createdAt: { $gte: twentyFourHoursAgo },
      };

      const populateOptions = {
        posted_by: {
          fields: ["id", "username", "name", "avatar_ring_color"],
          populate: { profile_picture: true },
        },
        tagged_users: {
          fields: ["id", "username", "name", "avatar_ring_color"],
          populate: { profile_picture: true },
        },
        media: true,
        share_with_close_friends: { fields: ["id"] },
      };

      if (specificUserId) {
        let userStories = await strapi.entityService.findMany(
          "api::post.post",
          {
            filters: { ...baseStoryFilters, posted_by: { id: specificUserId } },
            sort: { createdAt: "desc" },
            populate: populateOptions,
          }
        );

        userStories = userStories.filter((story) => {
          if (story.posted_by.id === currentUserId) return true;

          if (blockedUserIds.includes(story.posted_by.id)) return false;

          if (story.share_with === "PUBLIC") return true;
          else if (story.share_with === "FOLLOWERS")
            return followingUserIds.includes(specificUserId);
          else if (story.share_with === "CLOSE-FRIENDS")
            return (
              Array.isArray(story.share_with_close_friends) &&
              story.share_with_close_friends.some(
                (cf) => cf.id === currentUserId
              )
            );
          return false;
        });

        if (userStories.length > 0) {
          const usersToProcess = userStories
            .flatMap((story) => [
              story.posted_by,
              ...(story.tagged_users || []),
            ])
            .filter(Boolean);
          await Promise.all([
            strapi
              .service("api::following.following")
              .enrichItemsWithFollowStatus({
                items: userStories,
                userPaths: ["posted_by", "tagged_users"],
                currentUserId,
              }),
            strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures(usersToProcess),
          ]);
        }
        return ctx.send({
          data: userStories,
          message: "User stories fetched successfully.",
        });
      }

      const myStories = await strapi.entityService.findMany("api::post.post", {
        filters: { ...baseStoryFilters, posted_by: { id: currentUserId } },
        populate: populateOptions,
      });

      const baseOtherStoriesFilter = {
        ...baseStoryFilters,
        posted_by: {
          id: {
            $ne: currentUserId,
            $notIn: blockedUserIds.length > 0 ? blockedUserIds : [-1],
          },
        },
        $or: [
          { share_with: "PUBLIC" },
          {
            $and: [
              { share_with: "FOLLOWERS" },
              {
                posted_by: {
                  id: {
                    $in: followingUserIds.length > 0 ? followingUserIds : [-1],
                  },
                },
              },
            ],
          },
          {
            $and: [
              { share_with: "CLOSE-FRIENDS" },
              { share_with_close_friends: { id: currentUserId } },
            ],
          },
        ],
      };

      let finalStoryFeedFilters = { ...baseOtherStoriesFilter };
      if (filter === "friends" || filter === "following") {
        (finalStoryFeedFilters as any).$and =
          (finalStoryFeedFilters as any).$and || [];
        (finalStoryFeedFilters as any).$and.push({
          posted_by: {
            id: { $in: followingUserIds.length > 0 ? followingUserIds : [-1] },
          },
        });
      } else if (filter === "follower") {
        (finalStoryFeedFilters as any).$and =
          (finalStoryFeedFilters as any).$and || [];
        (finalStoryFeedFilters as any).$and.push({
          posted_by: {
            id: { $in: followerUserIds.length > 0 ? followerUserIds : [-1] },
          },
        });
      } else if (filter === "close_friends") {
        (finalStoryFeedFilters as any).$and =
          (finalStoryFeedFilters as any).$and || [];
        (finalStoryFeedFilters as any).$and.push({
          posted_by: {
            id: {
              $in: closeFriendUserIds.length > 0 ? closeFriendUserIds : [-1],
            },
          },
        });
      }

      const otherStories = await strapi.entityService.findMany(
        "api::post.post",
        {
          filters: finalStoryFeedFilters,
          sort: { createdAt: "desc" },
          populate: populateOptions,
          start:
            (default_pagination.pagination.page - 1) *
            default_pagination.pagination.pageSize,
          limit: default_pagination.pagination.pageSize,
        }
      );

      const allStoriesForProcessing = [...myStories, ...otherStories];

      if (allStoriesForProcessing.length > 0) {
        const usersToProcess = allStoriesForProcessing
          .flatMap((story) => [story.posted_by, ...(story.tagged_users || [])])
          .filter(Boolean);
        await Promise.all([
          strapi
            .service("api::following.following")
            .enrichItemsWithFollowStatus({
              items: allStoriesForProcessing,
              userPaths: ["posted_by", "tagged_users"],
              currentUserId,
            }),
          strapi
            .service("api::post.post")
            .enrichUsersWithOptimizedProfilePictures(usersToProcess),
        ]);
      }

      for (const story of allStoriesForProcessing) {
        story.expiration_time =
          new Date(story.createdAt).getTime() + 24 * 60 * 60 * 1000;
        story.likes_count = await strapi.services[
          "api::like.like"
        ].getLikesCount(story.id);
        story.is_liked = await strapi.services[
          "api::like.like"
        ].verifyPostLikeByUser(story.id, currentUserId);
        story.media =
          (await strapi
            .service("api::post.post")
            .getOptimisedFileData(story.media)) || [];
        story.viewers_count = await strapi.services[
          "api::post.post"
        ].getStoryViewersCount(story.id);
      }

      const count = await strapi.entityService.count("api::post.post", {
        filters: finalStoryFeedFilters,
      });

      return ctx.send({
        data: {
          my_stories: myStories,
          other_stories: otherStories,
        },
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

  async getFriendsToTag(ctx) {
    const { id: userId } = ctx.state.user;
    const { pagination_size, page, filter } = ctx.query;

    let default_pagination = {
      pagination: { page: 1, pageSize: 20 },
    };
    if (pagination_size)
      default_pagination.pagination.pageSize = pagination_size;
    if (page) default_pagination.pagination.page = page;

    if (!userId)
      return ctx.unauthorized("You must be logged in to get friends to tag.");

    try {
      let users = [];
      let count = 0;

      if (filter === "temporary") {
        users = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { id: { $ne: userId } },
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
            start:
              (default_pagination.pagination.page - 1) *
              default_pagination.pagination.pageSize,
            limit: default_pagination.pagination.pageSize,
          }
        );

        count = await strapi.entityService.count(
          "plugin::users-permissions.user",
          {
            filters: { id: { $ne: userId } },
          }
        );

        if (users.length > 0) {
          await Promise.all([
            strapi
              .service("api::following.following")
              .enrichItemsWithFollowStatus({
                items: users.map((u) => ({ user: u })),
                userPaths: ["user"],
                currentUserId: userId,
              }),
            strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures(users),
          ]);
        }
      } else {
        const followerEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { subject: { id: userId } },
            populate: {
              follower: {
                fields: ["id", "username", "name", "avatar_ring_color"],
                populate: { profile_picture: true },
              },
            },
            start:
              (default_pagination.pagination.page - 1) *
              default_pagination.pagination.pageSize,
            limit: default_pagination.pagination.pageSize,
          }
        );

        users = followerEntries
          .map((entry: any) => entry.follower)
          .filter(Boolean);

        if (users.length > 0) {
          await Promise.all([
            strapi
              .service("api::following.following")
              .enrichItemsWithFollowStatus({
                items: followerEntries,
                userPaths: ["follower"],
                currentUserId: userId,
              }),
            strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures(users),
          ]);
        }

        count = await strapi.entityService.count("api::following.following", {
          filters: { subject: { id: userId } },
        });
      }

      return ctx.send({
        data: users,
        message: "Users fetched successfully.",
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
      return ctx.internalServerError("An error occurred while fetching users.");
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
        filters: { id: postId, posted_by: userId },
        limit: 1,
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
            `The following tagged user IDs do not exist: ${invalidUserIds.join(
              ", "
            )}`
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
              fields: ["id", "username", "name", "avatar_ring_color"],
              populate: { profile_picture: true },
            },
            tagged_users: {
              fields: ["id", "username", "name", "avatar_ring_color"],
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
      const posts = await strapi.entityService.findMany("api::post.post", {
        filters: { id: postId, posted_by: userId },
        limit: 1,
      });

      if (posts.length === 0)
        return ctx.forbidden(
          "You are not allowed to delete this post, or it does not exist."
        );

      //  using db.query coz using entityService would require more operations making api much slower
      await Promise.all([
        strapi.db
          .query("api::like.like")
          .deleteMany({ where: { post: postId } }),
        strapi.db
          .query("api::dislike.dislike")
          .deleteMany({ where: { post: postId } }),
        strapi.db
          .query("api::comment.comment")
          .deleteMany({ where: { post: postId } }),
        strapi.db
          .query("api::share.share")
          .deleteMany({ where: { post: postId } }),
      ]);

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

  async viewPost(ctx) {
    const { id: postId } = ctx.params;
    const { user } = ctx.state;
    let { watchedSeconds = "1" } = ctx.query;

    if (watchedSeconds)
      watchedSeconds = parseInt(watchedSeconds, 10);
    if (!user)
      return ctx.unauthorized("You must be logged in to view a story.");

    if (!postId || isNaN(postId))
      return ctx.badRequest("A valid Post ID is required in the URL.");

    try {
      const post = await strapi.entityService.findOne(
        "api::post.post",
        postId,
        {
          populate: { viewers: { fields: ["id"] } },
        }
      );

      if (!post)
        return ctx.notFound("The post you are trying to view does not exist.");

      const hasAlreadyViewed = post.viewers.some(
        (viewer) => viewer.id === user.id
      );
      if (hasAlreadyViewed)
        return ctx.send({
          success: true,
          message: "Post already marked as viewed.",
        });

      await strapi.entityService.update("api::post.post", postId, {
        data: { viewers: { connect: [user.id] } },
      });

      await strapi.service("api::post-view.post-view").markPostAsViewed(post.documentId, user.documentId, watchedSeconds);

      return ctx.send({
        success: true,
        message: "Post successfully marked as viewed.",
      });
    } catch (error) {
      strapi.log.error("Error in viewStory controller:", error);
      return ctx.internalServerError(
        "An error occurred while marking the story as viewed."
      );
    }
  },

  async getStoryViewers(ctx) {
    const { id: postId } = ctx.params;
    const { user: currentUser } = ctx.state;
    const { page = 1, pageSize = 20 } = ctx.query;

    if (!currentUser)
      return ctx.unauthorized("You must be logged in to perform this action.");

    try {
      const post = await strapi.entityService.findOne(
        "api::post.post",
        postId,
        {
          populate: {
            viewers: {
              fields: ["id", "username", "email", "name", "avatar_ring_color"],
              populate: { profile_picture: true },
            },
          },
        }
      );

      if (!post) return ctx.notFound("Post not found.");

      const allViewers = post.viewers || [];

      if (allViewers.length > 0) {
        await Promise.all([
          strapi
            .service("api::following.following")
            .enrichItemsWithFollowStatus({
              items: [post],
              userPaths: ["viewers"],
              currentUserId: currentUser.id,
            }),
          strapi
            .service("api::post.post")
            .enrichUsersWithOptimizedProfilePictures(allViewers),
        ]);
      }

      const totalViewers = allViewers.length;
      const start = (Number(page) - 1) * Number(pageSize);
      const end = start + Number(pageSize);
      const paginatedViewers = allViewers.slice(start, end);

      return ctx.send({
        data: paginatedViewers,
        meta: {
          pagination: {
            page: Number(page),
            pageSize: Number(pageSize),
            total: totalViewers,
            pageCount: Math.ceil(totalViewers / Number(pageSize)),
          },
        },
      });
    } catch (error) {
      strapi.log.error("Error fetching story viewers:", error);
      return ctx.internalServerError(
        "An error occurred while fetching the viewers."
      );
    }
  },

  async findUserPosts(ctx) {
    const { id: targetUserId } = ctx.params;
    const { id: currentUserId } = ctx.state.user;

    if (!targetUserId) return ctx.badRequest("User ID is required.");

    try {
      const targetUser = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        targetUserId,
        { fields: ["id", "is_public"] }
      );

      if (!targetUser) return ctx.notFound("Target user not found.");

      let canViewContent =
        targetUser.is_public ||
        (currentUserId && currentUserId.toString() === targetUserId.toString());
      if (!canViewContent && currentUserId) {
        const followRelation = await strapi.entityService.count(
          "api::following.following",
          {
            filters: { follower: currentUserId, subject: targetUserId },
          }
        );
        if (followRelation > 0) canViewContent = true;
      }

      if (!canViewContent) return ctx.send([]);

      const userPosts = await strapi.entityService.findMany("api::post.post", {
        filters: {
          posted_by: { id: targetUserId },
          post_type: "post",
        },
        sort: { createdAt: "desc" },
        populate: {
          media: true,
          repost_of: true,
          posted_by: {
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
          },
          tagged_users: {
            fields: ["id", "username", "name", "avatar_ring_color"],
            populate: { profile_picture: true },
          },
        },
      });

      if (!userPosts || userPosts.length === 0) return ctx.send([]);

      await strapi
        .service("api::following.following")
        .enrichItemsWithFollowStatus({
          items: userPosts,
          userPaths: ["posted_by", "tagged_users"],
          currentUserId: currentUserId,
        });

      const allUsers = userPosts
        .flatMap((p) => [p.posted_by, ...(p.tagged_users || [])])
        .filter(Boolean);
      const uniqueUsers = [...new Map(allUsers.map((u) => [u.id, u])).values()];
      await strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures(uniqueUsers);

      const allMedia = userPosts.flatMap((p) => p.media || []).filter(Boolean);
      const optimizedMediaArray = await strapi
        .service("api::post.post")
        .getOptimisedFileData(allMedia);
      const optimizedMediaMap = new Map(
        (optimizedMediaArray || []).map((m) => [m.id, m])
      );

      const finalPosts = userPosts.map((post) => ({
        ...post,
        is_repost: post.repost_of !== null,
        media: (post.media || []).map((m) => optimizedMediaMap.get(m.id) || m),
      }));

      return ctx.send(finalPosts);
    } catch (err) {
      console.error("Error in findUserPosts:", err);
      return ctx.internalServerError(
        "An error occurred while fetching user posts."
      );
    }
  },
}));
