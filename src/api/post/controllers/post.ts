"use strict";

import FileOptimisationService from "../../../utils/file_optimisation_service";
import HelperService from "../../../utils/helper_service";
import NotificationService from "../../../utils/notification_service";

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::post.post", ({ strapi }) => ({
  //================================================================
  // CORE POST CONTROLLERS
  //================================================================
  async create(ctx) {
    const user = ctx.state.user;
    if (!user)
      return ctx.unauthorized("You must be logged in to create a post.");
    const userId = user.id;
    try {
      let data = ctx.request.body;
      if (!data)
        return ctx.badRequest("Request body must contain a data object.");
      if (!data.repost_of && (!data.title || !data.post_type))
        return ctx.badRequest("Missing required fields. (title, post_type)");
      if (!data.repost_of && data.post_type === "post" && !data.category)
        return ctx.badRequest("Category is required for post type 'post'.");
      if (!data.repost_of && (!data.media || data.media.length === 0))
        return ctx.badRequest("Media is required for a normal post.");

      const allowedShareWithOptions = ["PUBLIC", "FOLLOWERS", "CLOSE-FRIENDS"];
      if (data.share_with) {
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
            "For 'CLOSE-FRIENDS', 'share_with_close_friends' must be a non-empty array of user IDs."
          );
        const found = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { id: { $in: data.share_with_close_friends } },
            fields: ["id"],
          }
        );
        if (found.length !== data.share_with_close_friends.length) {
          const foundIds = found.map((u) => u.id);
          const invalidIds = data.share_with_close_friends.filter(
            (id) => !foundIds.includes(id)
          );
          return ctx.badRequest(
            `Invalid close friends: ${invalidIds.join(", ")}`
          );
        }
        if (data.share_with_close_friends.includes(userId))
          return ctx.badRequest(
            "You cannot include yourself in the close friends list."
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

      if (!data.repost_of && data.media && data.media.length > 0) {
        for (let file_id of data.media) {
          const fileData = await strapi.entityService.findOne(
            "plugin::upload.file",
            file_id
          );
          if (!fileData)
            return ctx.badRequest(`Media with ID ${file_id} does not exist.`);
        }
      }

      if (data.category) {
        const exists = await strapi.entityService.findOne(
          "api::category.category",
          data.category
        );
        if (!exists)
          return ctx.badRequest(
            `Category with ID ${data.category} does not exist.`
          );
      }

      if (Array.isArray(data.tagged_users) && data.tagged_users.length > 0) {
        if (data.tagged_users.includes(userId))
          return ctx.badRequest("You cannot tag yourself in a post.");
        const users = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { id: { $in: data.tagged_users } },
            fields: ["id"],
          }
        );
        if (users.length !== data.tagged_users.length) {
          const foundIds = users.map((u) => u.id);
          const invalidIds = data.tagged_users.filter(
            (id) => !foundIds.includes(id)
          );
          return ctx.badRequest(
            `Invalid tagged user IDs: ${invalidIds.join(", ")}`
          );
        }
      }

      if (data.location) {
        const { latitude, longitude, address = "" } = data.location;
        if (
          (latitude !== undefined && typeof latitude !== "number") ||
          (longitude !== undefined && typeof longitude !== "number")
        )
          return ctx.badRequest("Location latitude/longitude must be numbers.");
        if (address) {
          const geo = await HelperService.geocodeAddress(address);
          if (geo) {
            data.location.latitude = geo.latitude;
            data.location.longitude = geo.longitude;
          }
        }
      }

      let repostOfData = null;
      if (data.repost_of) {
        const original = await strapi.entityService.findOne(
          "api::post.post",
          data.repost_of,
          { populate: { posted_by: true } }
        );
        if (!original) return ctx.badRequest("Original post not found.");
        if (original.posted_by.id === userId)
          return ctx.badRequest("You cannot repost your own post.");
        data.repost_of = original.id;
        data.reposted_from = original.posted_by.id;
        repostOfData = original;
      }

      data.posted_by = userId;
      const newPost = await strapi.entityService.create("api::post.post", {
        data,
        populate: {
          posted_by: { fields: ["id", "username", "name"] },
          tagged_users: { fields: ["id", "username", "name"] },
          category: { fields: ["id", "name"] },
          media: true,
          repost_of: { populate: "*" },
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

      if (Array.isArray(data.tagged_users) && data.tagged_users.length > 0) {
        const notificationService = new NotificationService();
        for (const taggedUserId of data.tagged_users) {
          const notifMsg = `${user.username} mentioned you in a ${data.post_type === "story" ? "story" : "post"}.`;
          await notificationService.saveNotification(
            "mention",
            userId,
            taggedUserId,
            notifMsg,
            { post: newPost.id }
          );

          const recipient = await strapi.entityService.findOne(
            "plugin::users-permissions.user",
            taggedUserId,
            {
              fields: ["fcm_token"],
            }
          );
          if (recipient && recipient.fcm_token) {
            await notificationService.sendPushNotification(
              "New Mention",
              notifMsg,
              { type: "mention", postId: newPost.id.toString() },
              recipient.fcm_token
            );
          }
        }
      }

      const responsePost = {
        ...newPost,
        is_repost: !!data.repost_of,
        ...(repostOfData
          ? {
              reposted_from: {
                id: repostOfData.posted_by.id,
                username: repostOfData.posted_by.username,
                name: repostOfData.posted_by.name,
              },
              repost_of: repostOfData,
            }
          : {}),
      };

      const msg = data.post_type === "post" ? "Post created" : "Story added";
      return ctx.send({ post: responsePost, message: `${msg} successfully.` });
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
      let entity = await strapi.entityService.findOne("api::post.post", id, {
        populate: {
          media: true,
          posted_by: {
            fields: [
              "id",
              "username",
              "name",
              "avatar_ring_color",
              "is_public",
            ],
            populate: { profile_picture: true },
          },
        },
      });

      if (!entity) return ctx.notFound("Post not found");

      entity.media =
        (await strapi
          .service("api::post.post")
          .getOptimisedFileData(entity.media)) || [];

      await strapi.service("api::post.post").enrichPostsWithStats(entity, null);

      await strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures([entity.posted_by]);

      return ctx.send(entity);
    } catch (err) {
      console.error("Find One Admin Post Error:", err);
      return ctx.internalServerError(
        "An error occurred while fetching the post."
      );
    }
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    const { id: userId } = ctx.state.user;

    try {
      let entity = await strapi.entityService.findOne("api::post.post", id, {
        populate: {
          posted_by: {
            fields: [
              "id",
              "username",
              "name",
              "avatar_ring_color",
              "is_public",
            ],
            populate: { profile_picture: true },
          },
          tagged_users: {
            fields: [
              "id",
              "username",
              "name",
              "avatar_ring_color",
              "is_public",
            ],
            populate: { profile_picture: true },
          },
          category: { fields: ["id", "name"] },
          media: true,
          repost_of: true,
        },
      });

      if (!entity) return ctx.notFound("Post not found");

      const enriched = await strapi
        .service("api::post.post")
        .enrichRepostsAndStats([entity], userId);
      entity = enriched[0];

      const { optimizedMediaMap, followStatusMap } = await strapi
        .service("api::post.post")
        .enrichMediaAndFollowStatus([entity], userId);

      entity.media = (entity.media || []).map(
        (m) => optimizedMediaMap.get(m.id) || m
      );

      entity.posted_by = {
        ...entity.posted_by,
        ...followStatusMap.get(entity.posted_by.id),
      };
      entity.tagged_users = (entity.tagged_users || []).map((u) => ({
        ...u,
        ...followStatusMap.get(u.id),
      }));

      if (entity.post_type === "story") {
        const createdAt = new Date(entity.createdAt);
        const expirationTime = createdAt.getTime() + 24 * 60 * 60 * 1000;
        entity.expiration_time = expirationTime;
        if (Date.now() > expirationTime) {
          return ctx.notFound(
            "This story has expired and is no longer available."
          );
        }
      }

      entity.is_repost = !!entity.repost_of;

      return ctx.send(entity);
    } catch (err) {
      console.error("Find One Post Error:", err);
      return ctx.internalServerError(
        "An error occurred while fetching the post."
      );
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

  //================================================================
  // STORY CONTROLLERS
  //================================================================
  async stories(ctx) {
    const {
      pagination_size,
      page,
      filter = "temporary",
      user_id: specificUserId,
    } = ctx.query;
    const { id: currentUserId } = ctx.state.user;

    const enrichStories = async (stories, userId) => {
      if (!stories || stories.length === 0) return;

      const usersToProcess = stories
        .flatMap((story) => [story.posted_by, ...(story.tagged_users || [])])
        .filter(Boolean);

      await Promise.all([
        strapi.service("api::following.following").enrichItemsWithFollowStatus({
          items: stories,
          userPaths: ["posted_by", "tagged_users"],
          currentUserId: userId,
        }),
        strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedProfilePictures(usersToProcess),
      ]);

      await Promise.all(
        stories.map(async (story) => {
          const [likes_count, is_liked, viewers_count, optimizedMedia] =
            await Promise.all([
              strapi.service("api::like.like").getLikesCount(story.id),
              strapi
                .service("api::like.like")
                .verifyPostLikeByUser(story.id, userId),
              strapi.service("api::post.post").getStoryViewersCount(story.id),
              strapi
                .service("api::post.post")
                .getOptimisedFileData(story.media),
            ]);
          story.expiration_time =
            new Date(story.createdAt).getTime() + 24 * 60 * 60 * 1000;
          story.likes_count = likes_count;
          story.is_liked = is_liked;
          story.viewers_count = viewers_count;
          story.media = optimizedMedia || [];
        })
      );
    };

    let followingUserIds = [];
    let followerUserIds = [];
    let closeFriendUserIds = [];
    let blockedUserIds = [];
    let hiddenUserIds = [];

    if (currentUserId) {
      const [
        followingEntries,
        followerEntries,
        closeFriendsFollowingEntries,
        blockEntries,
        hideStoryEntries,
      ] = await Promise.all([
        strapi.entityService.findMany("api::following.following", {
          filters: { follower: { id: currentUserId } },
          populate: { subject: { fields: ["id"] } },
        }),
        strapi.entityService.findMany("api::following.following", {
          filters: { subject: { id: currentUserId } },
          populate: { follower: { fields: ["id"] } },
        }),
        strapi.entityService.findMany("api::following.following", {
          filters: { follower: { id: currentUserId }, is_close_friend: true },
          populate: { subject: { fields: ["id"] } },
        }),
        strapi.entityService.findMany("api::block.block", {
          filters: { blocked_by: { id: currentUserId } },
          populate: { blocked_user: { fields: ["id"] } },
        }),
        strapi.entityService.findMany("api::hide-story.hide-story", {
          filters: { owner: { id: currentUserId } },
          populate: { target: { fields: ["id"] } },
        }),
      ]);
      followingUserIds = followingEntries
        .map((entry) => entry.subject?.id)
        .filter(Boolean);
      followerUserIds = followerEntries
        .map((entry) => entry.follower?.id)
        .filter(Boolean);
      closeFriendUserIds = closeFriendsFollowingEntries
        .map((entry) => entry.subject?.id)
        .filter(Boolean);
      blockedUserIds = blockEntries
        .map((entry) => entry.blocked_user?.id)
        .filter(Boolean);
      hiddenUserIds = hideStoryEntries
        .map((entry) => entry.target?.id)
        .filter(Boolean);
    }
    const excludedUserIds = [...new Set([...blockedUserIds, ...hiddenUserIds])];

    let default_pagination = { pagination: { page: 1, pageSize: 10 } };
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
        if (excludedUserIds.includes(Number(specificUserId)))
          return ctx.send({
            data: [],
            message: "You cannot view stories from this user.",
          });

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
          if (story.share_with === "PUBLIC") return true;
          if (story.share_with === "FOLLOWERS")
            return followingUserIds.includes(Number(specificUserId));
          if (story.share_with === "CLOSE-FRIENDS") {
            return (
              Array.isArray(story.share_with_close_friends) &&
              story.share_with_close_friends.some(
                (cf) => cf.id === currentUserId
              )
            );
          }
          return false;
        });

        await enrichStories(userStories, currentUserId);

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
            $notIn: excludedUserIds.length > 0 ? excludedUserIds : [-1],
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

      await enrichStories(allStoriesForProcessing, currentUserId);

      const count = await strapi.entityService.count("api::post.post", {
        filters: finalStoryFeedFilters,
      });

      return ctx.send({
        data: { my_stories: myStories, other_stories: otherStories },
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

  async deleteExpiredStories(ctx) {
    try {
      const twentyFourHoursAgo = new Date(
        new Date().getTime() - 24 * 60 * 60 * 1000
      );

      const deletedCount = await strapi.db.query("api::post.post").deleteMany({
        where: {
          post_type: "story",
          // createdAt: { $lt: twentyFourHoursAgo },
        },
      });

      if (deletedCount > 0) {
        console.log(`Successfully deleted ${deletedCount} expired stories.`);
      } else {
        console.log("No expired stories found to delete.");
      }

      return ctx.send({
        message: "Expired stories cleanup process completed successfully.",
        data: {
          deleted_count: deletedCount,
        },
      });
    } catch (err) {
      console.error("Delete Expired Stories Error:", err);
      return ctx.internalServerError(
        "An error occurred during the expired stories cleanup."
      );
    }
  },

  //================================================================
  // USER & FRIENDS CONTROLLERS
  //================================================================
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

  //================================================================
  // DEVELOPMENT & TESTING CONTROLLERS
  //================================================================
  async seedStories(ctx) {
    const storiesData = [
      {
        posted_by: 117,
        title: "Proper Good Times.",
        description:
          "From pub talks to park walks, it’s been brilliant. Soaking up the vibes and making memories with this top-tier squad.",
        media: [378, 379, 380],
        tagged_users: [120, 121, 124, 164, 176, 180, 183, 185, 186],
      },
      {
        posted_by: 120,
        title: "Mind the Gap.",
        description:
          "Between rainy spells and sunny moments, we found our perfect adventure. London's calling, and we definitely answered.",
        media: [381, 382, 383],
        tagged_users: [117, 121, 124, 164, 176, 180, 183, 185, 186],
      },
      {
        posted_by: 121,
        title: "Na zdraví! (Cheers!).",
        description:
          "Good food, great company, and a city that feels alive. Soaking in every single moment. An unforgettable journey.",
        media: [383, 384],
        tagged_users: [117, 120, 124, 164, 176, 180, 183, 185, 186],
      },
      {
        posted_by: 124,
        title: "History in High Definition.",
        description:
          "Walking through fairytales and vibrant history. This city's past is as captivating as its present. So much to explore.",
        media: [385, 386],
        tagged_users: [117, 120, 121, 164, 176, 180, 183, 185, 186],
      },
      {
        posted_by: 164,
        title: "Gipfelstürmer (Summit Stormers).",
        description:
          "Trading city noise for mountain echoes. Every challenging hike ends with a rewarding view and a story to tell.",
        media: [387, 388],
        tagged_users: [117, 120, 121, 124, 176, 180, 183, 185, 186],
      },
      {
        posted_by: 176,
        title: "From Another Point of View.",
        description:
          "We came for the mountains and stayed for the memories. That fresh alpine air hits different when you're with your favorite crew.",
        media: [389, 390],
        tagged_users: [117, 120, 121, 124, 164, 180, 183, 185, 186],
      },
      {
        posted_by: 180,
        title: "Midnight Sun & Memories.",
        description:
          "Chasing the endless summer light and making stories we'll tell for years. The days are long, but this trip felt too short.",
        media: [391, 392],
        tagged_users: [117, 120, 121, 124, 164, 176, 183, 185, 186],
      },
      {
        posted_by: 183,
        title: "Hygge Mode: Activated.",
        description:
          "Sweater weather and city streets. Finding the cozy in every corner with the best people. This is our kind of happiness.",
        media: [396, 395, 394],
        tagged_users: [117, 120, 121, 124, 164, 176, 180, 185, 186],
      },
      {
        posted_by: 185,
        title: "Postcard from Somewhere Beautiful.",
        description:
          "Finding our way through new streets and old histories. It’s not about the destination, but the journey with this crew. Prost!",
        media: [400, 401],
        tagged_users: [117, 120, 121, 124, 164, 176, 180, 183, 186],
      },
      {
        posted_by: 186,
        title: "La Dolce Vita.",
        description:
          "Living the sweet life with my favourite people. Sunshine, laughter, and a little bit of magic. Cheers to us! 🥂",
        media: [399, 398, 397],
        tagged_users: [117, 120, 121, 124, 164, 176, 180, 183, 185],
      },
    ];

    let createdCount = 0;
    let skippedCount = 0;

    try {
      for (const story of storiesData) {
        const existingPost = await strapi.entityService.findMany(
          "api::post.post",
          {
            filters: {
              title: story.title,
              post_type: "story",
              posted_by: { id: story.posted_by },
            },
            limit: 1,
          }
        );

        if (existingPost.length === 0) {
          await strapi.entityService.create("api::post.post", {
            data: {
              ...story,
              post_type: "story",
              share_with: "PUBLIC",
            },
          });
          createdCount++;
        } else skippedCount++;
      }

      return ctx.send({
        message: "Seeding process completed.",
        data: {
          created: createdCount,
          skipped: skippedCount,
        },
      });
    } catch (err) {
      console.error("Seeding error:", err);
      return ctx.internalServerError(
        "An error occurred during the seeding process."
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

  //================================================================
  // POST CONTROLLERS
  //================================================================

  async viewPost(ctx) {
    const { id: postId } = ctx.params;
    const { user } = ctx.state;
    let { watchedSeconds = "1" } = ctx.query;

    if (watchedSeconds) watchedSeconds = parseInt(watchedSeconds, 10);

    if (!user)
      return ctx.unauthorized("You must be logged in to view a story.");

    if (!postId || isNaN(postId))
      return ctx.badRequest("A valid Post ID is required in the URL.");

    try {
      const post = await strapi.entityService.findOne(
        "api::post.post",
        postId,
        { populate: { viewers: { fields: ["id"] } } }
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

      await strapi
        .service("api::post-view.post-view")
        .markPostAsViewed(post.id, user.id, watchedSeconds);

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

  async feed(ctx) {
    const { id: userId } = ctx.state.user;
    const { pagination_size, page } = ctx.query;

    const default_pagination = {
      page: Number(page) || 1,
      pageSize: Number(pagination_size) || 10,
    };

    try {
      const [blockEntries, followingRelations, closeFriendRelations] =
        await Promise.all([
          strapi.entityService.findMany("api::block.block", {
            filters: { blocked_by: { id: userId } },
            populate: { blocked_user: { fields: ["id"] } },
          }),
          strapi.entityService.findMany("api::following.following", {
            filters: { follower: { id: userId } },
            populate: { subject: { fields: ["id"] } },
          }),
          strapi.entityService.findMany("api::following.following", {
            filters: { subject: { id: userId }, is_close_friend: true },
            populate: { follower: true },
          }),
        ]);

      const blockedUserIds = blockEntries
        .map((e) => e.blocked_user?.id)
        .filter(Boolean);
      const followingIds = followingRelations
        .map((e) => e.subject?.id)
        .filter(Boolean);
      const closeFriendAuthorIds = closeFriendRelations
        .map((e) => e.follower?.id)
        .filter(Boolean);

      const postFilters = {
        post_type: "post",
        posted_by: {
          id: { $notIn: blockedUserIds.length ? blockedUserIds : [-1] },
        },
        $and: [
          {
            $or: [
              {
                repost_of: { id: { $null: true } },
                media: { id: { $notNull: true } },
              },
              {
                repost_of: { id: { $notNull: true } },
              },
            ],
          },
          {
            $or: [
              { share_with: "PUBLIC" },
              {
                share_with: "FOLLOWERS",
                posted_by: {
                  id: { $in: followingIds.length ? followingIds : [-1] },
                },
              },
              {
                share_with: "CLOSE-FRIENDS",
                posted_by: {
                  id: {
                    $in: closeFriendAuthorIds.length
                      ? closeFriendAuthorIds
                      : [-1],
                  },
                },
              },
              { posted_by: { id: userId } },
            ],
          },
        ],
      };

      const [results, count] = await Promise.all([
        strapi.entityService.findMany("api::post.post", {
          filters: postFilters,
          sort: { createdAt: "desc" },
          populate: {
            posted_by: {
              fields: [
                "id",
                "username",
                "name",
                "avatar_ring_color",
                "is_public",
              ],
              populate: { profile_picture: true },
            },
            category: true,
            tagged_users: {
              fields: [
                "id",
                "username",
                "name",
                "avatar_ring_color",
                "is_public",
              ],
              populate: { profile_picture: true },
            },
            media: true,
            repost_of: true,
          },
          start: (default_pagination.page - 1) * default_pagination.pageSize,
          limit: default_pagination.pageSize,
        }),
        strapi.entityService.count("api::post.post", { filters: postFilters }),
      ]);
      if (!results.length)
        return ctx.send({
          data: [],
          meta: {
            pagination: { ...default_pagination, pageCount: 0, total: 0 },
          },
          message: "No posts found.",
        });

      let posts = await strapi
        .service("api::post.post")
        .enrichRepostsAndStats(results, userId);
      const subMap = await strapi
        .service("api::post.post")
        .mapSubcategoriesToPosts(posts);
      const { optimizedMediaMap, followStatusMap } = await strapi
        .service("api::post.post")
        .enrichMediaAndFollowStatus(posts, userId);

      posts = strapi
        .service("api::post.post")
        .mapFinalPosts(posts, subMap, optimizedMediaMap, followStatusMap);

      return ctx.send({
        data: posts,
        meta: {
          pagination: {
            page: default_pagination.page,
            pageSize: default_pagination.pageSize,
            pageCount: Math.ceil(count / default_pagination.pageSize),
            total: count,
          },
        },
        message: "Posts fetched successfully.",
      });
    } catch (err) {
      console.error("FEED Posts Error:", err);
      return ctx.internalServerError("An error occurred while fetching posts.");
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

      const isOwner =
        currentUserId && currentUserId.toString() === targetUserId.toString();
      let isFollowing = false,
        isCloseFriend = false;
      if (currentUserId && !isOwner) {
        const [followCount, closeFriendCount] = await Promise.all([
          strapi.entityService.count("api::following.following", {
            filters: {
              follower: { id: currentUserId },
              subject: { id: targetUserId },
            },
          }),
          strapi.entityService.count("api::following.following", {
            filters: {
              follower: { id: targetUserId },
              subject: { id: currentUserId },
              is_close_friend: true,
            },
          }),
        ]);
        isFollowing = followCount > 0;
        isCloseFriend = closeFriendCount > 0;
      }

      const canViewProfile = targetUser.is_public || isOwner || isFollowing;
      if (!canViewProfile) return ctx.send({ data: [] });

      const postsRaw = await strapi.entityService.findMany("api::post.post", {
        filters: { posted_by: { id: targetUserId }, post_type: "post" },
        sort: { createdAt: "desc" },
        populate: {
          media: true,
          repost_of: true,
          category: true,
          posted_by: {
            fields: [
              "id",
              "username",
              "name",
              "avatar_ring_color",
              "is_public",
            ],
            populate: { profile_picture: true },
          },
          tagged_users: {
            fields: [
              "id",
              "username",
              "name",
              "avatar_ring_color",
              "is_public",
            ],
            populate: { profile_picture: true },
          },
        },
      });

      let posts = postsRaw.filter((post) => {
        if (isOwner || post.share_with === "PUBLIC") return true;
        if (post.share_with === "FOLLOWERS") return isFollowing;
        if (post.share_with === "CLOSE-FRIENDS") return isCloseFriend;
        return false;
      });

      if (!posts.length) return ctx.send({ data: [] });

      posts = await strapi
        .service("api::post.post")
        .enrichRepostsAndStats(posts, currentUserId);
      const subMap = await strapi
        .service("api::post.post")
        .mapSubcategoriesToPosts(posts);
      const { optimizedMediaMap, followStatusMap } = await strapi
        .service("api::post.post")
        .enrichMediaAndFollowStatus(posts, currentUserId);

      posts = strapi
        .service("api::post.post")
        .mapFinalPosts(posts, subMap, optimizedMediaMap, followStatusMap);

      return ctx.send({
        data: posts,
        message: "User's posts fetched successfully.",
      });
    } catch (err) {
      console.error("Error in FINDUSERPOSTS:", err);
      return ctx.internalServerError(
        "An error occurred while fetching user posts."
      );
    }
  },
}));
