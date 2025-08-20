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

      await strapi
        .service("api::post.post")
        .validateCloseFriendsList(
          data.share_with,
          data.share_with_close_friends,
          userId
        );
      await strapi.service("api::post.post").validateMediaFiles(data.media);
      await strapi.service("api::post.post").validateCategory(data.category);

      const mentionedUserIds = (data.mentioned_users || []).map((m) => m.user);
      if (mentionedUserIds.length) {
        await strapi
          .service("api::post.post")
          .validateTaggedUsers(mentionedUserIds, userId);
      }

      if (data.location?.address) {
        const geo = await HelperService.geocodeAddress(data.location.address);
        if (geo) {
          data.location.latitude = geo.latitude;
          data.location.longitude = geo.longitude;
        }
      }

      let repostOfData = null;
      if (data.repost_of) {
        const original = await strapi
          .service("api::post.post")
          .resolveOriginalPost(data.repost_of);
        if (!original) return ctx.badRequest("Original post not found.");
        if (original.posted_by.id === userId)
          return ctx.badRequest("You cannot repost your own post.");
        data.repost_of = original.id;
        data.reposted_from = original.posted_by.id;
        repostOfData = original;
      }

      const mentionTexts = [];
      if (typeof data.title === "string") mentionTexts.push(data.title);
      if (typeof data.description === "string")
        mentionTexts.push(data.description);
      const mentionPromises = mentionTexts.map((text) =>
        strapi
          .service("api::mention-policy.mention-policy")
          .mentionUser(userId, text, data.post_type)
      );
      const mentionsFromTextArrays = await Promise.all(mentionPromises);
      const mentionsFromText = mentionsFromTextArrays.flat();
      if (
        data.mentioned_users &&
        data.mentioned_users.length > 0 &&
        typeof data.mentioned_users === "number"
      ) {
        data.mentioned_users = data.mentioned_users.map((userId) => ({
          user: userId,
          username: "",
          start: 0,
          end: 0,
          mention_status: true,
        }));
      }
      const allMentionsMap = new Map();
      for (const mention of [
        ...mentionsFromText,
        ...(data.mentioned_users || []),
      ])
        allMentionsMap.set(mention.user, mention);

      data.mentioned_users = Array.from(allMentionsMap.values());

      data.posted_by = userId;

      // Create post with mentioned_users component
      const newPost = await strapi.entityService.create("api::post.post", {
        data,
        populate: {
          posted_by: { fields: ["id", "username", "name"] },
          category: { fields: ["id", "name"] },
          media: true,
          repost_of: { populate: "*" },
          mentioned_users: {
            populate: {
              user: {
                fields: ["id", "username", "name", "profile_picture"],
                populate: { profile_picture: true },
              },
            },
          },
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

      // Extract tags from title & description
      if (typeof data.title === "string") {
        await strapi
          .service("api::tag.tag")
          .extractTags(data.title, newPost.id);
      }
      if (typeof data.description === "string") {
        await strapi
          .service("api::tag.tag")
          .extractTags(data.description, newPost.id);
      }

      await strapi.service("api::post.post").notifyMentionsInPost(
        data.mentioned_users.map((m) => m.user),
        user,
        newPost.id,
        data.post_type
      );

      // Compose final response post object
      const responsePost = {
        ...newPost,
        is_repost: !!data.repost_of,
        ...(repostOfData
          ? { reposted_from: repostOfData.posted_by, repost_of: repostOfData }
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

      entity = await strapi
        .service("api::post.post")
        .prepareSinglePostForResponse(entity, userId);

      if (entity.post_type === "story") {
        const expirationTime =
          new Date(entity.createdAt).getTime() + 24 * 60 * 60 * 1000;
        entity.expiration_time = expirationTime;
        if (Date.now() > expirationTime)
          return ctx.notFound(
            "This story has expired and is no longer available."
          );
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
      await strapi
        .service("api::post.post")
        .verifyPostOwnership(postId, userId);
      await strapi.service("api::post.post").validateCategory(data.category);
      await strapi
        .service("api::post.post")
        .validateTaggedUsers(data.tagged_users, userId);

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

      return ctx.send({ updatedPost, message: "Post updated successfully." });
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
      await strapi
        .service("api::post.post")
        .verifyPostOwnership(postId, userId);

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
      return ctx.send({ deletedPost, message: "Post deleted successfully." });
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

    // Fetch user relations and blocked/hidden lists
    const { following, followers, closeFriends, blocked, hidden } = await strapi
      .service("api::post.post")
      .getUserRelationsAndBlocks(currentUserId);

    const excludedUserIds = [...new Set([...blocked, ...hidden])];

    const defaultPagination = {
      page: Number(page) || 1,
      pageSize: Number(pagination_size) || 10,
    };

    // Base filters for active stories in last 24 hours
    const baseStoryFilters = {
      post_type: "story",
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    };

    // Common populate options
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

    try {
      if (specificUserId) {
        if (excludedUserIds.includes(Number(specificUserId))) {
          return ctx.send({
            data: [],
            message: "You cannot view stories from this user.",
          });
        }

        let userStories = await strapi.entityService.findMany(
          "api::post.post",
          {
            filters: {
              ...baseStoryFilters,
              posted_by: { id: Number(specificUserId) },
            },
            sort: { createdAt: "desc" },
            populate: populateOptions,
          }
        );

        userStories = userStories.filter((story) => {
          if (story.posted_by.id === currentUserId) return true;
          if (story.share_with === "PUBLIC") return true;
          if (story.share_with === "FOLLOWERS")
            return following.includes(story.posted_by.id);
          if (story.share_with === "CLOSE_FRIENDS") {
            return (
              Array.isArray(story.share_with_close_friends) &&
              story.share_with_close_friends.some(
                (cf) => cf.id === currentUserId
              )
            );
          }
          return false;
        });

        await strapi
          .service("api::post.post")
          .enrichStories(userStories, currentUserId);

        return ctx.send({
          data: userStories,
          message: "User stories fetched successfully.",
        });
      }

      // User's own stories
      const myStories = await strapi.entityService.findMany("api::post.post", {
        filters: { ...baseStoryFilters, posted_by: { id: currentUserId } },
        populate: populateOptions,
      });

      let otherFilters: any = {
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
                  id: { $in: following.length > 0 ? following : [-1] },
                },
              },
            ],
          },
          {
            $and: [
              { share_with: "CLOSE_FRIENDS" },
              { share_with_close_friends: { $in: [currentUserId] } },
            ],
          },
        ],
      };

      // Additional filters based on filter param
      if (filter === "friends" || filter === "following") {
        otherFilters.$and = otherFilters.$and || [];
        otherFilters.$and.push({
          posted_by: { id: { $in: following.length > 0 ? following : [-1] } },
        });
      } else if (filter === "follower") {
        otherFilters.$and = otherFilters.$and || [];
        otherFilters.$and.push({
          posted_by: { id: { $in: followers.length > 0 ? followers : [-1] } },
        });
      } else if (filter === "close_friends") {
        otherFilters.$and = otherFilters.$and || [];
        otherFilters.$and.push({
          posted_by: {
            id: { $in: closeFriends.length > 0 ? closeFriends : [-1] },
          },
        });
      }

      const otherStories = await strapi.entityService.findMany(
        "api::post.post",
        {
          filters: otherFilters,
          sort: { createdAt: "desc" },
          populate: populateOptions,
          start: (defaultPagination.page - 1) * defaultPagination.pageSize,
          limit: defaultPagination.pageSize,
        }
      );

      const allStories = [...myStories, ...otherStories];

      await strapi
        .service("api::post.post")
        .enrichStories(allStories, currentUserId);

      const totalCount = await strapi.entityService.count("api::post.post", {
        filters: otherFilters,
      });

      return ctx.send({
        data: { my_stories: myStories, other_stories: otherStories },
        message: "Stories fetched successfully.",
        meta: {
          pagination: {
            page: Number(defaultPagination.page),
            pageSize: Number(defaultPagination.pageSize),
            pageCount: Math.ceil(totalCount / defaultPagination.pageSize),
            total: totalCount,
          },
        },
      });
    } catch (e) {
      strapi.log.error("stories fetch error", e);
      return ctx.internalServerError("An error occurred fetching stories.");
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

  // ================================================================
  // || POST CONTROLLERS                                           ||
  // ================================================================

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
    const defaultPagination = {
      page: Number(page) || 1,
      pageSize: Number(pagination_size) || 10,
    };

    try {
      const { blockList, followingList, closeFriendList } = await strapi
        .service("api::post.post")
        .getUserRelationsData(userId);

      const { posts, total } = await strapi
        .service("api::post.post")
        .getFeedPosts(
          userId,
          defaultPagination,
          blockList,
          followingList,
          closeFriendList
        );

      if (!posts.length) {
        return ctx.send({
          data: [],
          meta: {
            pagination: { ...defaultPagination, pageCount: 0, total: 0 },
          },
          message: "No posts found",
        });
      }

      const enrichedPosts = await strapi
        .service("api::post.post")
        .preparePosts(posts, userId, { includeStories: true });

      return ctx.send({
        data: enrichedPosts,
        meta: {
          pagination: {
            ...defaultPagination,
            pageCount: Math.ceil(total / defaultPagination.pageSize),
            total,
          },
        },
        message: "Posts fetched successfully",
      });
    } catch (e) {
      strapi.log.error("feed fetch error", e);
      return ctx.internalServerError("An error occurred fetching feed posts");
    }
  },
  async findUserPosts(ctx) {
    const { id: targetUserId } = ctx.params;
    const { id: currentUserId } = ctx.state.user;
    if (!targetUserId) return ctx.badRequest("User ID is required");

    try {
      const targetUser = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        targetUserId,
        { fields: ["id", "is_public"] }
      );
      if (!targetUser) return ctx.notFound("Target user not found");

      const { isOwner, isFollowing, isCloseFriend } = await strapi
        .service("api::post.post")
        .getUserAccessFlags(currentUserId, targetUserId);

      const canView = targetUser.is_public || isOwner || isFollowing;
      if (!canView) return ctx.send({ data: [] });

      const posts = await strapi
        .service("api::post.post")
        .fetchUserPosts(targetUserId);

      const filteredPosts = posts.filter((post) => {
        if (isOwner || post.share_with === "PUBLIC") return true;
        if (post.share_with === "FOLLOWERS") return isFollowing;
        if (post.share_with === "CLOSE_FRIENDS") return isCloseFriend;
        return false;
      });

      if (!filteredPosts.length) return ctx.send({ data: [] });

      const enrichedPosts = await strapi
        .service("api::post.post")
        .preparePosts(filteredPosts, currentUserId);

      return ctx.send({
        data: enrichedPosts,
        message: "User posts fetched successfully",
      });
    } catch (e) {
      strapi.log.error("findUserPosts error", e);
      return ctx.internalServerError("An error occurred fetching user posts");
    }
  },
}));
