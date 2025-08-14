import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::following.following",
  ({ strapi }) => ({
    async followUnfollowUser(ctx) {
      try {
        const userId = ctx.state.user.id;
        const { subjectId } = ctx.request.body;

        if (!subjectId) return ctx.badRequest("The 'subjectId' is required.");
        if (userId === subjectId)
          return ctx.badRequest("You cannot follow/unfollow yourself.");

        const existingFollow = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { follower: { id: userId }, subject: { id: subjectId } },
            limit: 1,
          }
        );

        if (existingFollow.length > 0) {
          await strapi.entityService.delete(
            "api::following.following",
            existingFollow[0].id
          );

          const existingRequest = await strapi.entityService.findMany(
            "api::follow-request.follow-request",
            {
              filters: { requested_by: userId, requested_for: subjectId },
              limit: 1,
            }
          );
          if (existingRequest.length > 0)
            await strapi.entityService.delete(
              "api::follow-request.follow-request",
              existingRequest[0].id
            );

          return ctx.send({
            message: "Unfollowed successfully.",
            is_following: false,
          });
        }

        const subjectUser = await strapi.entityService.findOne(
          "plugin::users-permissions.user",
          subjectId,
          { fields: ["id", "is_public"], populate: ["role"] }
        );
        if (!subjectUser)
          return ctx.notFound(
            "The user you are trying to follow does not exist."
          );

        const isPublicProfile = subjectUser.is_public === true;

        if (isPublicProfile) {
          await strapi.entityService.create("api::following.following", {
            data: { follower: userId, subject: subjectId },
          });
          return ctx.send({
            message: "Followed successfully.",
            is_following: true,
          });
        } else {
          const existingRequest = await strapi.entityService.findMany(
            "api::follow-request.follow-request",
            {
              filters: { requested_by: userId, requested_for: subjectId },
              limit: 1,
            }
          );

          if (existingRequest.length > 0) {
            return ctx.send({
              request_status: existingRequest[0].request_status,
              is_request_sent: true,
              is_following: false,
            });
          }

          await strapi.entityService.create(
            "api::follow-request.follow-request",
            {
              data: {
                requested_by: userId,
                requested_for: subjectId,
                request_status: "PENDING",
              },
            }
          );

          return ctx.send({
            message: "Follow request sent successfully.",
            is_following: false,
            is_request_sent: true,
            request_status: "PENDING",
          });
        }
      } catch (error) {
        console.error("Error in followUnfollowUser:", error);
        return ctx.internalServerError("An unexpected error occurred.", {
          error: error.message,
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
        if (query)
          filters.follower = {
            $or: [
              { username: { $containsi: query } },
              { name: { $containsi: query } },
            ],
          };

        const followersEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters,
            populate: {
              follower: {
                fields: [
                  "id",
                  "username",
                  "email",
                  "name",
                  "avatar_ring_color",
                ],
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

        if (users.length > 0)
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
      const { userId } = ctx.params;
      const { pagination_size = 10, page = 1, query } = ctx.query;

      if (!userId) return ctx.badRequest("User ID is required");
      if (!currentUser)
        return ctx.unauthorized(
          "You must be logged in to perform this action."
        );

      try {
        const [followingEntries, followerEntries, hiddenStoryEntries] =
          await Promise.all([
            strapi.entityService.findMany("api::following.following", {
              filters: { follower: { id: userId } },
              populate: { subject: { fields: ["id"] } },
            }),
            strapi.entityService.findMany("api::following.following", {
              filters: { subject: { id: userId } },
              populate: { follower: { fields: ["id"] } },
            }),
            strapi.entityService.findMany("api::hide-story.hide-story", {
              filters: { owner: { id: currentUser.id } },
              populate: { target: { fields: ["id"] } },
            }),
          ]);

        const followingIds = new Set(
          followingEntries
            .map((entry: any) => entry.subject?.id)
            .filter(Boolean)
        );
        const followerIds = new Set(
          followerEntries
            .map((entry: any) => entry.follower?.id)
            .filter(Boolean)
        );
        const hiddenUserIds = new Set(
          hiddenStoryEntries
            .map((entry: any) => entry.target?.id)
            .filter(Boolean)
        );

        const friendIds = [...followingIds].filter((id) => followerIds.has(id));

        if (friendIds.length === 0)
          return ctx.send({
            data: [],
            meta: {
              pagination: {
                page: 1,
                pageSize: Number(pagination_size),
                pageCount: 0,
                total: 0,
              },
            },
          });

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
          closeFriendEntries
            .map((entry: any) => entry.subject?.id)
            .filter(Boolean)
        );

        const userFilters: any = { id: { $in: friendIds } };
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
            start: (Number(page) - 1) * Number(pagination_size),
            limit: Number(pagination_size),
          }
        );

        if (users.length > 0)
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

        const finalUsers = users.map((user) => ({
          ...user,
          is_close_friend: closeFriendIds.has(user.id),
          is_story_hidden: hiddenUserIds.has(user.id),
        }));

        const count = await strapi.entityService.count(
          "plugin::users-permissions.user",
          { filters: userFilters }
        );

        return ctx.send({
          data: finalUsers,
          meta: {
            pagination: {
              page: Number(page),
              pageSize: Number(pagination_size),
              pageCount: Math.ceil(count / Number(pagination_size)),
              total: count,
            },
          },
        });
      } catch (error) {
        strapi.log.error("Error fetching friends:", error);
        return ctx.internalServerError("Error fetching friends", { error });
      }
    },

    async getAllFriends(ctx) {
      const { user: currentUser } = ctx.state;
      const { userId } = ctx.params;
      const { pagination_size = 10, page = 1, query } = ctx.query;

      if (!userId) return ctx.badRequest("User ID is required");
      if (!currentUser)
        return ctx.unauthorized(
          "You must be logged in to perform this action."
        );

      try {
        const [followingEntries, followerEntries, hiddenStoryEntries] =
          await Promise.all([
            strapi.entityService.findMany("api::following.following", {
              filters: { follower: { id: userId } },
              populate: { subject: { fields: ["id"] } },
            }),
            strapi.entityService.findMany("api::following.following", {
              filters: { subject: { id: userId } },
              populate: { follower: { fields: ["id"] } },
            }),
            strapi.entityService.findMany("api::hide-story.hide-story", {
              filters: { owner: { id: currentUser.id } },
              populate: { target: { fields: ["id"] } },
            }),
          ]);

        const followingIds = new Set(
          followingEntries
            .map((entry: any) => entry.subject?.id)
            .filter(Boolean)
        );
        const followerIds = new Set(
          followerEntries
            .map((entry: any) => entry.follower?.id)
            .filter(Boolean)
        );
        const hiddenUserIds = new Set(
          hiddenStoryEntries
            .map((entry: any) => entry.target?.id)
            .filter(Boolean)
        );

        const friendIds = [...followingIds].filter((id) => followerIds.has(id));

        if (friendIds.length === 0)
          return ctx.send({
            data: [],
            meta: {
              pagination: {
                page: 1,
                pageSize: Number(pagination_size),
                pageCount: 0,
                total: 0,
              },
            },
          });

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
          closeFriendEntries
            .map((entry: any) => entry.subject?.id)
            .filter(Boolean)
        );

        const userFilters: any = { id: { $in: friendIds } };
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
            start: (Number(page) - 1) * Number(pagination_size),
            limit: Number(pagination_size),
          }
        );

        if (users.length > 0)
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

        const finalUsers = users.map((user) => ({
          ...user,
          is_close_friend: closeFriendIds.has(user.id),
          is_story_hidden: hiddenUserIds.has(user.id),
        }));

        const count = await strapi.entityService.count(
          "plugin::users-permissions.user",
          { filters: userFilters }
        );

        return ctx.send({
          data: finalUsers,
          meta: {
            pagination: {
              page: Number(page),
              pageSize: Number(pagination_size),
              pageCount: Math.ceil(count / Number(pagination_size)),
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
                fields: [
                  "id",
                  "username",
                  "email",
                  "name",
                  "avatar_ring_color",
                ],
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
          currentUserFollowing
            .filter((rel: any) => rel.subject)
            .map((rel: any) => rel.subject.id)
        );
        const targetUserFollowerIds = new Set(
          targetUserFollowers
            .filter((rel: any) => rel.follower)
            .map((rel: any) => rel.follower.id)
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

    async addMultipleCloseFriends(ctx) {
      try {
        const userId = ctx.state.user.id;
        const { subjectIds } = ctx.request.body;

        if (
          !subjectIds ||
          !Array.isArray(subjectIds) ||
          subjectIds.length === 0
        )
          return ctx.badRequest("An array of 'subjectIds' is required.");

        const uniqueSubjectIds = [
          ...new Set(subjectIds.filter((id) => id !== userId)),
        ];
        if (uniqueSubjectIds.length === 0)
          return ctx.badRequest("No valid subject IDs provided.");

        const userFollowsSubjects = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: {
              follower: { id: userId },
              subject: { id: { $in: uniqueSubjectIds } },
            },
            populate: { subject: { fields: ["id"] } },
          }
        );

        const subjectsFollowUser = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: {
              follower: { id: { $in: uniqueSubjectIds } },
              subject: { id: userId },
            },
            populate: { follower: { fields: ["id"] } },
          }
        );

        const userFollowsSubjectsMap = new Map(
          userFollowsSubjects.map((f: any) => [f.subject?.id, f])
        );
        const subjectsWhoFollowBackIds = new Set(
          subjectsFollowUser.map((f: any) => f.follower?.id)
        );

        const updatePromises = [];
        const results = { updated: [], failed: [] };

        for (const subjectId of uniqueSubjectIds) {
          const followingEntry = userFollowsSubjectsMap.get(subjectId);
          const isFollowedBack = subjectsWhoFollowBackIds.has(subjectId);

          if (followingEntry && isFollowedBack) {
            const newIsCloseFriend = !followingEntry.is_close_friend;
            updatePromises.push(
              strapi.entityService.update(
                "api::following.following",
                followingEntry.id,
                { data: { is_close_friend: newIsCloseFriend } }
              )
            );
            results.updated.push({
              subjectId,
              is_close_friend: newIsCloseFriend,
            });
          } else {
            let reason = "An unknown error occurred.";
            if (!followingEntry) reason = "You are not following this user.";
            else if (!isFollowedBack)
              reason = "This user is not following you back.";
            results.failed.push({ subjectId, reason });
          }
        }

        await Promise.all(updatePromises);

        return ctx.send({
          message:
            "Close friends status updated for all valid mutual followers.",
          results,
        });
      } catch (error: unknown) {
        console.error("Error in manageCloseFriends:", error);
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred.";
        return ctx.internalServerError(
          "An unexpected error occurred while managing close friends.",
          { error: errorMessage }
        );
      }
    },

    async getUserCloseFriends(ctx) {
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
        const filters: any = {
          follower: { id: userId },
          is_close_friend: true,
        };

        if (query) {
          filters.subject = {
            $or: [
              { username: { $containsi: query } },
              { name: { $containsi: query } },
            ],
          };
        }

        const closeFriendEntries = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters,
            populate: {
              subject: {
                fields: [
                  "id",
                  "username",
                  "email",
                  "name",
                  "avatar_ring_color",
                ],
                populate: { profile_picture: true },
              },
            },
            start:
              (default_pagination.pagination.page - 1) *
              default_pagination.pagination.pageSize,
            limit: default_pagination.pagination.pageSize,
          }
        );

        const users = closeFriendEntries
          .map((entry: any) => entry.subject)
          .filter(Boolean);

        if (users.length > 0)
          await Promise.all([
            strapi
              .service("api::following.following")
              .enrichItemsWithFollowStatus({
                items: closeFriendEntries,
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
        strapi.log.error("Error fetching close friends:", error);
        return ctx.internalServerError("Error fetching close friends", {
          error,
        });
      }
    },
  })
);
