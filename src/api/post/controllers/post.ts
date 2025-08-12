"use strict";

import FileOptimisationService from "../../../utils/file_optimisation_service";
import HelperService from "../../../utils/helper_service";

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

      if (!data.title || !data.post_type)
        return ctx.badRequest("Missing required fields. (title, post_type)");

      if (!data.repost_of && data.post_type === "post" && !data.category)
        return ctx.badRequest("Category is required for post type 'post'.");

      if (!data.repost_of && (!data.media || data.media.length === 0))
        return ctx.badRequest("Media is required for a normal post.");

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
          const foundIds = foundCloseFriends.map((u) => u.id);
          const invalidIds = data.share_with_close_friends.filter(
            (id) => !foundIds.includes(id)
          );
          return ctx.badRequest(
            `The following 'share_with_close_friends' IDs do not exist: ${invalidIds.join(", ")}`
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
        const categoryExists = await strapi.entityService.findOne(
          "api::category.category",
          data.category
        );
        if (!categoryExists)
          return ctx.badRequest(
            `The provided category with ID ${data.category} does not exist.`
          );
      }

      if (Array.isArray(data.tagged_users) && data.tagged_users.length > 0) {
        if (data.tagged_users.includes(userId))
          return ctx.badRequest("You cannot tag yourself in a post.");
        const foundUsers = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          { filters: { id: { $in: data.tagged_users } }, fields: ["id"] }
        );
        if (foundUsers.length !== data.tagged_users.length) {
          const foundIds = foundUsers.map((u) => u.id);
          const invalidIds = data.tagged_users.filter(
            (id) => !foundIds.includes(id)
          );
          return ctx.badRequest(
            `The following tagged user IDs do not exist: ${invalidIds.join(", ")}`
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
        let postToRepost = await strapi.entityService.findOne(
          "api::post.post",
          data.repost_of,
          {
            populate: {
              posted_by: true,
              repost_of: true,
              media: true,
              category: true,
              tagged_users: true,
            },
          }
        );
        if (!postToRepost)
          return ctx.badRequest(
            `The post you are trying to repost (ID: ${data.repost_of}) does not exist.`
          );

        if (postToRepost.repost_of) {
          data.repost_of = postToRepost.repost_of.id;
          postToRepost = await strapi.entityService.findOne(
            "api::post.post",
            postToRepost.repost_of.id,
            {
              populate: {
                posted_by: true,
                media: true,
                category: true,
                tagged_users: true,
              },
            }
          );
          if (!postToRepost)
            return ctx.badRequest(
              `The original post you are trying to repost does not exist.`
            );
        }

        if (postToRepost.posted_by.id === userId)
          return ctx.badRequest("You cannot repost your own post.");

        repostOfData = postToRepost;

        delete data.media;
      }

      data.posted_by = userId;

      const newPost = await strapi.entityService.create("api::post.post", {
        data,
        populate: {
          posted_by: { fields: ["id", "username", "name"] },
          tagged_users: { fields: ["id", "username", "name"] },
          category: { fields: ["id", "name"] },
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

      const message =
        data.post_type === "post" ? "Post created" : "Story added";

      return ctx.send({
        post: {
          ...newPost,
          is_repost: !!data.repost_of,
          ...(repostOfData ? { repost_of: repostOfData } : {}),
        },
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

  // async getStory(ctx) {
  //   const { id: specificUserId } = ctx.params;
  //   const { id: currentUserId } = ctx.state.user;

  //   if (!currentUserId)
  //     return ctx.unauthorized("You must be logged in to view stories.");

  //   try {
  //     if (Number(specificUserId) !== currentUserId) {
  //       const blockEntry = await strapi.entityService.findMany(
  //         "api::block.block",
  //         {
  //           filters: {
  //             blocked_by: { id: specificUserId },
  //             blocked_user: { id: currentUserId },
  //           },
  //           limit: 1,
  //         }
  //       );

  //       if (blockEntry.length > 0)
  //         return ctx.forbidden(
  //           "You are not allowed to view this user's stories."
  //         );
  //     }

  //     const twentyFourHoursAgo = new Date(
  //       new Date().getTime() - 24 * 60 * 60 * 1000
  //     );

  //     const populateOptions = {
  //       posted_by: {
  //         fields: ["id", "username", "name", "avatar_ring_color"],
  //         populate: { profile_picture: true },
  //       },
  //       tagged_users: {
  //         fields: ["id", "username", "name", "avatar_ring_color"],
  //         populate: { profile_picture: true },
  //       },
  //       media: true,
  //       share_with_close_friends: { fields: ["id"] },
  //     };

  //     let userStories = await strapi.entityService.findMany("api::post.post", {
  //       filters: {
  //         post_type: "story",
  //         posted_by: { id: specificUserId },
  //         createdAt: { $gte: twentyFourHoursAgo },
  //       },
  //       sort: { createdAt: "desc" },
  //       populate: populateOptions,
  //     });

  //     if (userStories.length === 0)
  //       return ctx.send({
  //         data: [],
  //         message: "This user has no active stories.",
  //       });

  //     let visibleStories;

  //     if (Number(specificUserId) === currentUserId)
  //       visibleStories = userStories;
  //     else {
  //       const followingEntry = await strapi.entityService.findMany(
  //         "api::following.following",
  //         {
  //           filters: {
  //             follower: { id: currentUserId },
  //             subject: { id: specificUserId },
  //           },
  //           limit: 1,
  //         }
  //       );
  //       const isFollowing = followingEntry.length > 0;

  //       visibleStories = userStories.filter((story) => {
  //         if (story.share_with === "PUBLIC") return true;
  //         if (story.share_with === "FOLLOWERS") return isFollowing;
  //         if (story.share_with === "CLOSE-FRIENDS") {
  //           return (
  //             Array.isArray(story.share_with_close_friends) &&
  //             story.share_with_close_friends.some(
  //               (cf) => cf.id === currentUserId
  //             )
  //           );
  //         }
  //         return false;
  //       });
  //     }

  //     if (visibleStories.length > 0) {
  //       const usersToProcess = visibleStories
  //         .flatMap((story) => [story.posted_by, ...(story.tagged_users || [])])
  //         .filter(Boolean);

  //       await Promise.all([
  //         strapi
  //           .service("api::following.following")
  //           .enrichItemsWithFollowStatus({
  //             items: visibleStories,
  //             userPaths: ["posted_by", "tagged_users"],
  //             currentUserId,
  //           }),
  //         strapi
  //           .service("api::post.post")
  //           .enrichUsersWithOptimizedProfilePictures(usersToProcess),
  //       ]);

  //       for (const story of visibleStories) {
  //         const [likes_count, is_liked, viewers_count] = await Promise.all([
  //           strapi.service("api::like.like").getLikesCount(story.id),
  //           strapi
  //             .service("api::like.like")
  //             .verifyPostLikeByUser(story.id, currentUserId),
  //           strapi.service("api::post.post").getStoryViewersCount(story.id),
  //         ]);

  //         story.expiration_time =
  //           new Date(story.createdAt).getTime() + 24 * 60 * 60 * 1000;
  //         story.likes_count = likes_count;
  //         story.is_liked = is_liked;
  //         story.viewers_count = viewers_count;
  //         story.media =
  //           (await strapi
  //             .service("api::post.post")
  //             .getOptimisedFileData(story.media)) || [];
  //       }
  //     }

  //     return ctx.send({
  //       data: visibleStories,
  //       message: "User stories fetched successfully.",
  //     });
  //   } catch (err) {
  //     console.error("Find User's Stories Error:", err);
  //     return ctx.internalServerError(
  //       "An error occurred while fetching the user's stories."
  //     );
  //   }
  // },

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
            filters: { title: story.title },
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

  // async feed(ctx) {
  //   const { id: userId } = ctx.state.user;
  //   const { pagination_size, page } = ctx.query;

  //   let default_pagination = {
  //     pagination: { page: 1, pageSize: 10 },
  //   };
  //   if (pagination_size)
  //     default_pagination.pagination.pageSize = pagination_size;
  //   if (page) default_pagination.pagination.page = page;

  //   try {
  //     const [blockEntries, followingRelations, closeFriendRelations] =
  //       await Promise.all([
  //         strapi.entityService.findMany("api::block.block", {
  //           filters: { blocked_by: { id: userId } },
  //           populate: { blocked_user: { fields: ["id"] } },
  //         }),
  //         strapi.entityService.findMany("api::following.following", {
  //           filters: { follower: { id: userId } },
  //           populate: { subject: { fields: ["id"] } },
  //         }),
  //         strapi.entityService.findMany("api::following.following", {
  //           filters: {
  //             subject: { id: userId },
  //             is_close_friend: true,
  //           },
  //           populate: { follower: true },
  //         }),
  //       ]);
  //     const blockedUserIds = blockEntries
  //       .map((entry) => entry.blocked_user && entry.blocked_user.id)
  //       .filter(Boolean);

  //     const followingIds = followingRelations
  //       .map((f) => f.subject && f.subject.id)
  //       .filter(Boolean);

  //     const closeFriendAuthorIds = closeFriendRelations
  //       .map((cf) => cf.follower && cf.follower.id)
  //       .filter(Boolean);

  //     const postFilters = {
  //       post_type: "post",
  //       media: { id: { $notNull: true } },
  //       posted_by: {
  //         id: { $notIn: blockedUserIds.length > 0 ? blockedUserIds : [-1] },
  //       },
  //       $or: [
  //         { share_with: "PUBLIC" },
  //         {
  //           share_with: "FOLLOWERS",
  //           posted_by: {
  //             id: { $in: followingIds.length > 0 ? followingIds : [-1] },
  //           },
  //         },
  //         {
  //           share_with: "CLOSE-FRIENDS",
  //           posted_by: {
  //             id: {
  //               $in:
  //                 closeFriendAuthorIds.length > 0 ? closeFriendAuthorIds : [-1],
  //             },
  //           },
  //         },
  //         { posted_by: { id: userId } },
  //       ],
  //     };

  //     const [results, count] = await Promise.all([
  //       strapi.entityService.findMany("api::post.post", {
  //         filters: postFilters,
  //         sort: { createdAt: "desc" },
  //         populate: {
  //           posted_by: {
  //             fields: [
  //               "id",
  //               "username",
  //               "name",
  //               "avatar_ring_color",
  //               "is_public",
  //             ],
  //             populate: { profile_picture: true },
  //           },
  //           category: true,
  //           tagged_users: {
  //             fields: [
  //               "id",
  //               "username",
  //               "name",
  //               "avatar_ring_color",
  //               "is_public",
  //             ],
  //             populate: { profile_picture: true },
  //           },
  //           media: true,
  //         },
  //         start:
  //           (default_pagination.pagination.page - 1) *
  //           default_pagination.pagination.pageSize,
  //         limit: default_pagination.pagination.pageSize,
  //       }),
  //       strapi.entityService.count("api::post.post", { filters: postFilters }),
  //     ]);

  //     if (results.length > 0) {
  //       const categoryIds = [
  //         ...new Set(results.map((post) => post.category?.id).filter(Boolean)),
  //       ];
  //       let subcategoriesByCategory = new Map();
  //       if (categoryIds.length > 0) {
  //         const allSubcategories = await strapi.entityService.findMany(
  //           "api::subcategory.subcategory",
  //           {
  //             filters: { category: { id: { $in: categoryIds } } },
  //             populate: { category: true },
  //             pagination: { limit: -1 },
  //           }
  //         );
  //         for (const subcat of allSubcategories) {
  //           const catId = subcat.category?.id;
  //           if (!catId) continue;
  //           if (!subcategoriesByCategory.has(catId))
  //             subcategoriesByCategory.set(catId, []);
  //           subcategoriesByCategory.get(catId).push(subcat);
  //         }
  //       }

  //       const usersToProcess = results
  //         .flatMap((post) => [post.posted_by, ...(post.tagged_users || [])])
  //         .filter(Boolean);

  //       const allUserIds = [...new Set(usersToProcess.map((u) => u.id))];

  //       const allMedia = results.flatMap((p) => p.media || []).filter(Boolean);

  //       const [optimizedMediaArray, followStatusMap] = await Promise.all([
  //         strapi.service("api::post.post").getOptimisedFileData(allMedia),
  //         strapi
  //           .service("api::following.following")
  //           .getFollowStatusForUsers(userId, allUserIds),
  //         strapi
  //           .service("api::post.post")
  //           .enrichUsersWithOptimizedProfilePictures(usersToProcess),
  //       ]);
  //       const optimizedMediaMap = new Map(
  //         (optimizedMediaArray || []).map((m) => [m.id, m])
  //       );

  //       await Promise.all(
  //         results.map(async (post) => {
  //           const [
  //             likes_count,
  //             is_liked,
  //             dislikes_count,
  //             is_disliked,
  //             comments_count,
  //             share_count,
  //           ] = await Promise.all([
  //             strapi.services["api::like.like"].getLikesCount(post.id),
  //             strapi.services["api::like.like"].verifyPostLikeByUser(
  //               post.id,
  //               userId
  //             ),
  //             strapi
  //               .service("api::dislike.dislike")
  //               .getDislikesCountByPostId(post.id),
  //             strapi
  //               .service("api::dislike.dislike")
  //               .verifyPostDislikedByUser(post.id, userId),
  //             strapi.services["api::comment.comment"].getCommentsCount(post.id),
  //             strapi.services["api::share.share"].countShares(post.id),
  //           ]);
  //           Object.assign(post, {
  //             likes_count,
  //             is_liked,
  //             dislikes_count,
  //             is_disliked,
  //             comments_count,
  //             share_count,
  //           });
  //         })
  //       );

  //       const finalData = results.map((post) => {
  //         const postCategoryId = post.category?.id;

  //         return {
  //           ...post,
  //           subcategories: subcategoriesByCategory.get(postCategoryId) || [],
  //           media: (post.media || []).map(
  //             (m) => optimizedMediaMap.get(m.id) || m
  //           ),
  //           posted_by: {
  //             ...post.posted_by,
  //             ...followStatusMap.get(post.posted_by.id),
  //           },
  //           tagged_users: (post.tagged_users || []).map((user) => ({
  //             ...user,
  //             ...followStatusMap.get(user.id),
  //           })),
  //         };
  //       });

  //       return ctx.send({
  //         data: finalData,
  //         meta: {
  //           pagination: {
  //             page: Number(default_pagination.pagination.page),
  //             pageSize: Number(default_pagination.pagination.pageSize),
  //             pageCount: Math.ceil(
  //               count / default_pagination.pagination.pageSize
  //             ),
  //             total: count,
  //           },
  //         },
  //         message: "Posts fetched successfully.",
  //       });
  //     }

  //     return ctx.send({ data: [] });
  //   } catch (err) {
  //     console.error("Find Posts Error:", err);
  //     return ctx.internalServerError("An error occurred while fetching posts.");
  //   }
  // },

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

    let default_pagination = {
      pagination: { page: 1, pageSize: 10 },
    };
    if (pagination_size)
      default_pagination.pagination.pageSize = pagination_size;
    if (page) default_pagination.pagination.page = page;

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
            filters: {
              subject: { id: userId },
              is_close_friend: true,
            },
            populate: { follower: true },
          }),
        ]);

      const blockedUserIds = blockEntries
        .map((entry) => entry.blocked_user && entry.blocked_user.id)
        .filter(Boolean);

      const followingIds = followingRelations
        .map((f) => f.subject && f.subject.id)
        .filter(Boolean);

      const closeFriendAuthorIds = closeFriendRelations
        .map((cf) => cf.follower && cf.follower.id)
        .filter(Boolean);

      const postFilters = {
        post_type: "post",
        media: { id: { $notNull: true } },
        posted_by: {
          id: { $notIn: blockedUserIds.length > 0 ? blockedUserIds : [-1] },
        },
        $or: [
          { share_with: "PUBLIC" },
          {
            share_with: "FOLLOWERS",
            posted_by: {
              id: { $in: followingIds.length > 0 ? followingIds : [-1] },
            },
          },
          {
            share_with: "CLOSE-FRIENDS",
            posted_by: {
              id: {
                $in:
                  closeFriendAuthorIds.length > 0 ? closeFriendAuthorIds : [-1],
              },
            },
          },
          { posted_by: { id: userId } },
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
          start:
            (default_pagination.pagination.page - 1) *
            default_pagination.pagination.pageSize,
          limit: default_pagination.pagination.pageSize,
        }),
        strapi.entityService.count("api::post.post", { filters: postFilters }),
      ]);

      if (results.length === 0)
        return ctx.send({
          data: [],
          meta: {
            pagination: {
              page: default_pagination.pagination.page,
              pageSize: default_pagination.pagination.pageSize,
              pageCount: 0,
              total: 0,
            },
          },
          message: "No posts found.",
        });

      const categoryIds = [
        ...new Set(results.map((post) => post.category?.id).filter(Boolean)),
      ];
      let subcategoriesByCategory = new Map();

      if (categoryIds.length > 0) {
        const allSubcategories = await strapi.entityService.findMany(
          "api::subcategory.subcategory",
          {
            filters: { category: { id: { $in: categoryIds } } },
            populate: { category: true },
            pagination: { limit: -1 },
          }
        );
        for (const subcat of allSubcategories) {
          const catId = subcat.category?.id;
          if (!catId) continue;
          if (!subcategoriesByCategory.has(catId))
            subcategoriesByCategory.set(catId, []);
          subcategoriesByCategory.get(catId).push(subcat);
        }
      }

      const usersToProcess = results
        .flatMap((post) => [post.posted_by, ...(post.tagged_users || [])])
        .filter(Boolean);
      const allUserIds = [...new Set(usersToProcess.map((u) => u.id))];
      const allMedia = results.flatMap((p) => p.media || []).filter(Boolean);

      const [optimizedMediaArray, followStatusMap] = await Promise.all([
        strapi.service("api::post.post").getOptimisedFileData(allMedia),
        strapi
          .service("api::following.following")
          .getFollowStatusForUsers(userId, allUserIds),
        strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedProfilePictures(usersToProcess),
      ]);

      const optimizedMediaMap = new Map(
        (optimizedMediaArray || []).map((m) => [m.id, m])
      );

      await Promise.all(
        results.map(async (post) => {
          const [
            likes_count,
            is_liked,
            dislikes_count,
            is_disliked,
            comments_count,
            share_count,
          ] = await Promise.all([
            strapi.services["api::like.like"].getLikesCount(post.id),
            strapi.services["api::like.like"].verifyPostLikeByUser(
              post.id,
              userId
            ),
            strapi
              .service("api::dislike.dislike")
              .getDislikesCountByPostId(post.id),
            strapi
              .service("api::dislike.dislike")
              .verifyPostDislikedByUser(post.id, userId),
            strapi.services["api::comment.comment"].getCommentsCount(post.id),
            strapi.services["api::share.share"].countShares(post.id),
          ]);
          Object.assign(post, {
            likes_count,
            is_liked,
            dislikes_count,
            is_disliked,
            comments_count,
            share_count,
          });
        })
      );

      const finalData = results.map((post) => {
        const postCategoryId = post.category?.id;
        return {
          ...post,
          subcategories: subcategoriesByCategory.get(postCategoryId) || [],
          is_repost: !!post.repost_of,
          media: (post.media || []).map(
            (m) => optimizedMediaMap.get(m.id) || m
          ),
          posted_by: {
            ...post.posted_by,
            ...followStatusMap.get(post.posted_by.id),
          },
          tagged_users: (post.tagged_users || []).map((user) => ({
            ...user,
            ...followStatusMap.get(user.id),
          })),
        };
      });

      return ctx.send({
        data: finalData,
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
      let isFollowing = false;
      let isCloseFriend = false;

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

      const posts = await strapi.entityService.findMany("api::post.post", {
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

      const accessiblePosts = posts.filter((post) => {
        if (isOwner || post.share_with === "PUBLIC") return true;
        if (post.share_with === "FOLLOWERS") return isFollowing;
        if (post.share_with === "CLOSE-FRIENDS") return isCloseFriend;
        return false;
      });

      if (!accessiblePosts || accessiblePosts.length === 0)
        return ctx.send({ data: [] });

      const categoryIds = [
        ...new Set(
          accessiblePosts.map((post) => post.category?.id).filter(Boolean)
        ),
      ];
      let subcategoriesByCategory = new Map();
      if (categoryIds.length > 0) {
        const allSubcategories = await strapi.entityService.findMany(
          "api::subcategory.subcategory",
          {
            filters: { category: { id: { $in: categoryIds } } },
            populate: { category: true },
            pagination: { limit: -1 },
          }
        );
        for (const subcat of allSubcategories) {
          const catId = subcat.category?.id;
          if (!catId) continue;
          if (!subcategoriesByCategory.has(catId))
            subcategoriesByCategory.set(catId, []);
          subcategoriesByCategory.get(catId).push(subcat);
        }
      }

      const usersToProcess = accessiblePosts
        .flatMap((p) => [p.posted_by, ...(p.tagged_users || [])])
        .filter(Boolean);
      const allUserIds = [...new Set(usersToProcess.map((u) => u.id))];
      const allMedia = accessiblePosts
        .flatMap((p) => p.media || [])
        .filter(Boolean);

      const [optimizedMediaArray, followStatusMap] = await Promise.all([
        strapi.service("api::post.post").getOptimisedFileData(allMedia),
        strapi
          .service("api::following.following")
          .getFollowStatusForUsers(currentUserId, allUserIds),
        strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedProfilePictures(usersToProcess),
      ]);
      const optimizedMediaMap = new Map(
        (optimizedMediaArray || []).map((m) => [m.id, m])
      );

      await Promise.all(
        accessiblePosts.map(async (post) => {
          const [
            likes_count,
            is_liked,
            dislikes_count,
            is_disliked,
            comments_count,
            share_count,
          ] = await Promise.all([
            strapi.services["api::like.like"].getLikesCount(post.id),
            strapi.services["api::like.like"].verifyPostLikeByUser(
              post.id,
              currentUserId
            ),
            strapi
              .service("api::dislike.dislike")
              .getDislikesCountByPostId(post.id),
            strapi
              .service("api::dislike.dislike")
              .verifyPostDislikedByUser(post.id, currentUserId),
            strapi.services["api::comment.comment"].getCommentsCount(post.id),
            strapi.services["api::share.share"].countShares(post.id),
          ]);
          Object.assign(post, {
            likes_count,
            is_liked,
            dislikes_count,
            is_disliked,
            comments_count,
            share_count,
          });
        })
      );

      const finalPosts = accessiblePosts.map((post) => {
        const postCategoryId = post.category?.id;
        return {
          ...post,
          subcategories: subcategoriesByCategory.get(postCategoryId) || [],
          is_repost: !!post.repost_of,
          media: (post.media || []).map(
            (m) => optimizedMediaMap.get(m.id) || m
          ),
          posted_by: {
            ...post.posted_by,
            ...followStatusMap.get(post.posted_by.id),
          },
          tagged_users: (post.tagged_users || []).map((user) => ({
            ...user,
            ...followStatusMap.get(user.id),
          })),
        };
      });

      return ctx.send({
        data: finalPosts,
        message: "User's posts fetched successfully.",
      });
    } catch (err) {
      console.error("Error in FINDUSERPOSTS:", err);
      return ctx.internalServerError(
        "An error occurred while fetching user posts."
      );
    }
  },

  // async findUserPosts(ctx) {
  //   const { id: targetUserId } = ctx.params;
  //   const { id: currentUserId } = ctx.state.user;

  //   if (!targetUserId) return ctx.badRequest("User ID is required.");

  //   try {
  //     const targetUser = await strapi.entityService.findOne(
  //       "plugin::users-permissions.user",
  //       targetUserId,
  //       { fields: ["id", "is_public"] }
  //     );

  //     if (!targetUser) return ctx.notFound("Target user not found.");

  //     const isOwner =
  //       currentUserId && currentUserId.toString() === targetUserId.toString();
  //     let isFollowing = false;
  //     let isCloseFriend = false;

  //     if (currentUserId && !isOwner) {
  //       const [followCount, closeFriendCount] = await Promise.all([
  //         strapi.entityService.count("api::following.following", {
  //           filters: {
  //             follower: { id: currentUserId },
  //             subject: { id: targetUserId },
  //           },
  //         }),
  //         strapi.entityService.count("api::following.following", {
  //           filters: {
  //             follower: { id: targetUserId },
  //             subject: { id: currentUserId },
  //             is_close_friend: true,
  //           },
  //         }),
  //       ]);
  //       isFollowing = followCount > 0;
  //       isCloseFriend = closeFriendCount > 0;
  //     }

  //     const canViewProfile = targetUser.is_public || isOwner || isFollowing;
  //     if (!canViewProfile) return ctx.send({ data: [] });

  //     // Main find query
  //     const posts = await strapi.entityService.findMany("api::post.post", {
  //       filters: { posted_by: { id: targetUserId }, post_type: "post" },
  //       sort: { createdAt: "desc" },
  //       populate: {
  //         media: true,
  //         repost_of: true,
  //         category: true,
  //         posted_by: {
  //           fields: [
  //             "id",
  //             "username",
  //             "name",
  //             "avatar_ring_color",
  //             "is_public",
  //           ],
  //           populate: { profile_picture: true },
  //         },
  //         tagged_users: {
  //           fields: [
  //             "id",
  //             "username",
  //             "name",
  //             "avatar_ring_color",
  //             "is_public",
  //           ],
  //           populate: { profile_picture: true },
  //         },
  //       },
  //     });

  //     // Visibility checks
  //     const accessiblePosts = posts.filter((post) => {
  //       if (isOwner || post.share_with === "PUBLIC") return true;
  //       if (post.share_with === "FOLLOWERS") return isFollowing;
  //       if (post.share_with === "CLOSE-FRIENDS") return isCloseFriend;
  //       return false;
  //     });

  //     if (!accessiblePosts || accessiblePosts.length === 0)
  //       return ctx.send({ data: [] });

  //     // Subcategory mapping (as feed API)
  //     const categoryIds = [
  //       ...new Set(
  //         accessiblePosts.map((post) => post.category?.id).filter(Boolean)
  //       ),
  //     ];
  //     let subcategoriesByCategory = new Map();
  //     if (categoryIds.length > 0) {
  //       const allSubcategories = await strapi.entityService.findMany(
  //         "api::subcategory.subcategory",
  //         {
  //           filters: { category: { id: { $in: categoryIds } } },
  //           populate: { category: true },
  //           pagination: { limit: -1 },
  //         }
  //       );
  //       for (const subcat of allSubcategories) {
  //         const catId = subcat.category?.id;
  //         if (!catId) continue;
  //         if (!subcategoriesByCategory.has(catId))
  //           subcategoriesByCategory.set(catId, []);
  //         subcategoriesByCategory.get(catId).push(subcat);
  //       }
  //     }

  //     // Feed-style user enrichment
  //     const usersToProcess = accessiblePosts
  //       .flatMap((p) => [p.posted_by, ...(p.tagged_users || [])])
  //       .filter(Boolean);
  //     const allUserIds = [...new Set(usersToProcess.map((u) => u.id))];

  //     const allMedia = accessiblePosts
  //       .flatMap((p) => p.media || [])
  //       .filter(Boolean);

  //     const [optimizedMediaArray, followStatusMap] = await Promise.all([
  //       strapi.service("api::post.post").getOptimisedFileData(allMedia),
  //       strapi
  //         .service("api::following.following")
  //         .getFollowStatusForUsers(currentUserId, allUserIds),
  //       strapi
  //         .service("api::post.post")
  //         .enrichUsersWithOptimizedProfilePictures(usersToProcess),
  //     ]);
  //     const optimizedMediaMap = new Map(
  //       (optimizedMediaArray || []).map((m) => [m.id, m])
  //     );

  //     // Engagement stats
  //     await Promise.all(
  //       accessiblePosts.map(async (post) => {
  //         const [
  //           likes_count,
  //           is_liked,
  //           dislikes_count,
  //           is_disliked,
  //           comments_count,
  //           share_count,
  //         ] = await Promise.all([
  //           strapi.services["api::like.like"].getLikesCount(post.id),
  //           strapi.services["api::like.like"].verifyPostLikeByUser(
  //             post.id,
  //             currentUserId
  //           ),
  //           strapi
  //             .service("api::dislike.dislike")
  //             .getDislikesCountByPostId(post.id),
  //           strapi
  //             .service("api::dislike.dislike")
  //             .verifyPostDislikedByUser(post.id, currentUserId),
  //           strapi.services["api::comment.comment"].getCommentsCount(post.id),
  //           strapi.services["api::share.share"].countShares(post.id),
  //         ]);
  //         Object.assign(post, {
  //           likes_count,
  //           is_liked,
  //           dislikes_count,
  //           is_disliked,
  //           comments_count,
  //           share_count,
  //         });
  //       })
  //     );

  //     // Final feed-style response mapping
  //     const finalPosts = accessiblePosts.map((post) => {
  //       const postCategoryId = post.category?.id;

  //       return {
  //         ...post,
  //         subcategories: subcategoriesByCategory.get(postCategoryId) || [],
  //         is_repost: !!post.repost_of,
  //         media: (post.media || []).map(
  //           (m) => optimizedMediaMap.get(m.id) || m
  //         ),
  //         posted_by: {
  //           ...post.posted_by,
  //           ...followStatusMap.get(post.posted_by.id),
  //         },
  //         tagged_users: (post.tagged_users || []).map((user) => ({
  //           ...user,
  //           ...followStatusMap.get(user.id),
  //         })),
  //       };
  //     });

  //     // Always respond as an object with `data` array, so frontend can treat same as feed
  //     return ctx.send({
  //       data: finalPosts,
  //       message: "User's posts fetched successfully.",
  //     });
  //   } catch (err) {
  //     console.error("Error in findUserPosts:", err);
  //     return ctx.internalServerError(
  //       "An error occurred while fetching user posts."
  //     );
  //   }
  // },
}));
