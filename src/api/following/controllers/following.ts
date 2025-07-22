import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::following.following",
  ({ strapi }) => ({
    async followUnfollowUser(ctx) {
      try {
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
          return ctx.send({
            message: "Unfollowed successfully",
            is_following: false,
          });
        }

        await strapi.entityService.create("api::following.following", {
          data: {
            follower: userId,
            subject: subjectId,
          },
        });

        return ctx.send({
          message: "Followed successfully",
          is_follwing: true,
        });
      } catch (error) {
        return ctx.internalServerError("Error following user", {
          error,
        });
      }
    },

    async getUserFollowers(ctx) {
      try {
        const { user: currentUser } = ctx.state;
        let { userId } = ctx.params;
        const { pagination_size, page, query } = ctx.query;

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

        const filters: any = { subject: { id: userId } };
        if (query) {
          filters.follower = {
            $or: [
              { username: { $containsi: query } },
              { name: { $containsi: query } },
            ],
          };
        }

        const followersEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters,
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
          { filters }
        );

        return ctx.send({
          data: users,
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
      } catch (error) {
        strapi.log.error("Error fetching followers:", error);
        return ctx.internalServerError("Error fetching followers", {
          error,
        });
      }
    },

    async getFriends(ctx) {
      const { user: currentUser } = ctx.state;
      let { userId } = ctx.params;
      const { pagination_size, page, query } = ctx.query;

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
            populate: { subject: { fields: ["id"] } },
          }
        );
        const followingIds = new Set(
          followingEntries.map((entry: any) => entry.subject.id)
        );
        const followerEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { subject: { id: userId } },
            populate: { follower: { fields: ["id"] } },
          }
        );
        const followerIds = new Set(
          followerEntries.map((entry: any) => entry.follower.id)
        );

        let friendIds = [...followingIds].filter((id) => followerIds.has(id));

        if (friendIds.length === 0) {
          return ctx.send({
            data: [],
            meta: {
              pagination: {
                page: 1,
                pageSize: default_pagination.pagination.pageSize,
                pageCount: 0,
                total: 0,
              },
            },
          });
        }

        const closeFriendEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: {
              follower: { id: userId },
              subject: { id: { $in: friendIds } },
              is_close_friend: true,
            },
            populate: { subject: { fields: ["id"] } },
          }
        );
        const closeFriendIds = new Set(
          closeFriendEntries.map((entry: any) => entry.subject.id)
        );

        const finalFriendIds = friendIds.filter(
          (id) => !closeFriendIds.has(id)
        );

        if (finalFriendIds.length === 0) {
          return ctx.send({
            data: [],
            meta: {
              pagination: {
                page: 1,
                pageSize: default_pagination.pagination.pageSize,
                pageCount: 0,
                total: 0,
              },
            },
          });
        }

        const userFilters: any = { id: { $in: finalFriendIds } };
        if (query) {
          userFilters.$or = [
            { username: { $containsi: query } },
            { name: { $containsi: query } },
          ];
        }

        const users = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: userFilters,
            populate: { profile_picture: true },
            start:
              (default_pagination.pagination.page - 1) *
              default_pagination.pagination.pageSize,
            limit: default_pagination.pagination.pageSize,
          }
        );

        if (users.length > 0) {
          await Promise.all([
            strapi
              .service("api::following.following")
              .enrichItemsWithFollowStatus({
                items: users.map((user) => ({ user })),
                userPaths: ["user"],
                currentUserId: currentUser.id,
              }),
            strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures(users),
          ]);
        }

        const count = await strapi.entityService.count(
          "plugin::users-permissions.user",
          { filters: userFilters }
        );

        return ctx.send({
          data: users,
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
      } catch (error) {
        strapi.log.error("Error fetching friends:", error);
        return ctx.internalServerError("Error fetching friends", { error });
      }
    },

    async getUserFollowing(ctx) {
      try {
        const { user: currentUser } = ctx.state;
        let { userId } = ctx.params;
        const { pagination_size, page, query } = ctx.query;

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

        const filters: any = { follower: { id: userId } };
        if (query) {
          filters.subject = {
            $or: [
              { username: { $containsi: query } },
              { name: { $containsi: query } },
            ],
          };
        }

        const followingEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters,
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

        if (users.length > 0)
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

        const count = await strapi.entityService.count(
          "api::following.following",
          { filters }
        );

        return ctx.send({
          data: users,
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
      } catch (error) {
        strapi.log.error("Error fetching following:", error);
        return ctx.internalServerError("Error fetching following", {
          error,
        });
      }
    },

    async getMutualFollowers(ctx) {
      try {
        const { userId: targetUserId } = ctx.params;
        const { id: currentUserId } = ctx.state.user;
        const { pagination_size, page, query } = ctx.query;

        let default_pagination: any = {
          pagination: { page: 1, pageSize: 10 },
        };
        if (pagination_size)
          default_pagination.pagination.pageSize = pagination_size;
        if (page) default_pagination.pagination.page = page;
        if (!targetUserId) return ctx.badRequest("Target User ID is required");
        if (!currentUserId)
          return ctx.unauthorized(
            "You must be logged in to perform this action."
          );
        const [currentUserFollowing, targetUserFollowers] = await Promise.all([
          strapi.entityService.findMany("api::following.following", {
            filters: { follower: { id: currentUserId } },
            populate: { subject: { fields: ["id"] } },
          }),
          strapi.entityService.findMany("api::following.following", {
            filters: { subject: { id: targetUserId } },
            populate: { follower: { fields: ["id"] } },
          }),
        ]);

        const currentUserFollowingIds = new Set(
          currentUserFollowing.map((rel: any) => rel.subject.id)
        );
        const targetUserFollowerIds = new Set(
          targetUserFollowers.map((rel: any) => rel.follower.id)
        );

        const mutualFollowerIds = [...currentUserFollowingIds].filter((id) =>
          targetUserFollowerIds.has(id)
        );

        if (mutualFollowerIds.length === 0)
          return ctx.send({
            data: [],
            meta: {
              pagination: {
                page: 1,
                pageSize: default_pagination.pagination.pageSize,
                pageCount: 0,
                total: 0,
              },
            },
          });

        const userFilters: any = { id: { $in: mutualFollowerIds } };
        if (query)
          userFilters.$or = [
            { username: { $containsi: query } },
            { name: { $containsi: query } },
          ];

        const users = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: userFilters,
            populate: { profile_picture: true },
            start:
              (default_pagination.pagination.page - 1) *
              default_pagination.pagination.pageSize,
            limit: default_pagination.pagination.pageSize,
          }
        );

        if (users.length > 0)
          await Promise.all([
            strapi
              .service("api::following.following")
              .enrichItemsWithFollowStatus({
                items: users.map((user) => ({ user })),
                userPaths: ["user"],
                currentUserId: currentUserId,
              }),
            strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures(users),
          ]);

        const count = await strapi.entityService.count(
          "plugin::users-permissions.user",
          { filters: userFilters }
        );

        return ctx.send({
          data: users,
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
      } catch (error) {
        strapi.log.error("Error fetching mutual followers:", error);
        return ctx.internalServerError("Error fetching mutual followers", {
          error,
        });
      }
    },

    async addCloseFriends(ctx) {
      try {
        const { id: userId } = ctx.state.user;
        const { subjectId } = ctx.request.body;

        if (!subjectId) return ctx.badRequest("Subject ID is required");

        if (userId.toString() === subjectId.toString())
          return ctx.badRequest("You cannot add yourself as a close friend.");

        const [userFollowsSubject] = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { follower: { id: userId }, subject: { id: subjectId } },
            limit: 1,
          }
        );

        if (!userFollowsSubject)
          return ctx.badRequest(
            "You must be following this user to add them as a close friend."
          );

        const [subjectFollowsUser] = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { follower: { id: subjectId }, subject: { id: userId } },
            limit: 1,
          }
        );

        if (!subjectFollowsUser)
          return ctx.badRequest(
            "This user is not following you back. Mutual friendship is required."
          );

        const newIsCloseFriend = !userFollowsSubject.is_close_friend;

        await strapi.entityService.update(
          "api::following.following",
          userFollowsSubject.id,
          { data: { is_close_friend: newIsCloseFriend } }
        );

        return ctx.send({
          message: `Successfully ${newIsCloseFriend ? "added user to" : "removed user from"} your close friends.`,
          is_close_friend: newIsCloseFriend,
        });
      } catch (error) {
        console.log("Error while updating close friends status", error);
        return ctx.internalServerError("Error updating close friends status", {
          error,
        });
      }
    },

    async getUserCloseFriends(ctx) {
      try {
        const { id: userId } = ctx.params;
        if (!userId)
          return ctx.unauthorized(
            "You must be logged in to view close friends"
          );
        console.log("Fetching close friends for user:", userId);

        const closeFriends: any = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { follower: { id: userId }, is_close_friend: true },
            populate: {
              subject: {
                fields: ["id", "username", "email", "name"],
                populate: { profile_picture: true },
              },
            },
          }
        );
        console.log("Close friends found:", closeFriends.length, closeFriends);
        for (let friend of closeFriends) {
          if (!friend?.subject?.id) {
            await strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures([
                friend?.subject?.profile_picture,
              ]);
          }
        }

        return ctx.send({ data: closeFriends });
      } catch (error) {
        console.log("Error fetching close friends:", error);
        return ctx.internalServerError("Error fetching close friends", {
          error,
        });
      }
    },
  })
);
