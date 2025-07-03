/**
 * following controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::following.following",
  ({ strapi }) => ({
    async followUnfollowUser(ctx) {
      const userId = ctx.state.user.id;
      const { subjectId } = ctx.request.body;
      if (!subjectId) {
        return ctx.badRequest("Subject ID is required");
      }

      const existingFollow = await strapi.entityService.findMany(
        "api::following.following",
        {
          filters: {
            follower: { id: userId },
            subject: { id: subjectId },
          },
        }
      );
      if (existingFollow.length > 0) {
        const followId = existingFollow[0].id;
        await strapi.entityService.delete("api::following.following", followId);
        return ctx.send({ message: "Unfollowed successfully" });
      }

      try {
        const following = await strapi.entityService.create(
          "api::following.following",
          {
            data: {
              follower: userId,
              subject: subjectId,
            },
          }
        );

        return ctx.send(following);
      } catch (error) {
        return ctx.internalServerError("Error following user", { error });
      }
    },
    async getUserFollowers(ctx) {
      const userId = ctx.params.userId;

      const { pagination_size, page } = ctx.query;

      let default_pagination: any = {
        pagination: { page: 1, pageSize: 10 },
      };
      if (pagination_size)
        default_pagination.pagination.pageSize = pagination_size;
      if (page) default_pagination.pagination.page = page;
      if (!userId) {
        return ctx.badRequest("User ID is required");
      }
      try {
        const followers: any = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { subject: { id: userId } },
            populate: {
              follower: {
                fields: ["id", "username", "email", "name"],
                populate: {
                  profile_picture: true,
                },
              },
            },
          }
        );
        for (let i = 0; i < followers.length; i++) {
          followers[i].follower.profile_picture = await strapi
            .service("api::post.post")
            .getOptimisedFileData([followers[i].follower.profile_picture]);
        }
        const count = await strapi.entityService.count("api::post.post", {
          filters: {
            post_type: "post",
            media: { id: { $notNull: true } },
          },
        });
        return ctx.send({
          followers,

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
        return ctx.internalServerError("Error fetching followers", { error });
      }
    },
    async getUserFollowing(ctx) {
      const userId = ctx.params.userId;
      const { pagination_size, page } = ctx.query;

      let default_pagination: any = {
        pagination: { page: 1, pageSize: 10 },
      };
      if (pagination_size)
        default_pagination.pagination.pageSize = pagination_size;
      if (page) default_pagination.pagination.page = page;
      if (!userId) {
        return ctx.badRequest("User ID is required");
      }
      try {
        const following: any = await strapi.entityService.findMany(
          "api::following.following",
          {
            filters: { follower: { id: userId } },
            populate: {
              subject: {
                fields: ["id", "username", "email", "name"],
                populate: {
                  profile_picture: true,
                },
              },
            },

            start:
              (default_pagination.pagination.page - 1) *
              default_pagination.pagination.pageSize,
            limit: default_pagination.pagination.pageSize,
          }
        );
        for (let i = 0; i < following.length; i++) {
          following[i].subject.profile_picture = await strapi
            .service("api::post.post")
            .getOptimisedFileData([following[i].subject.profile_picture]);
        }
        const count = await strapi.entityService.count("api::post.post", {
          filters: {
            post_type: "post",
            media: { id: { $notNull: true } },
          },
        });
        return ctx.send({
          following,
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
        return ctx.internalServerError("Error fetching following", { error });
      }
    },
    async addCloseFriends(ctx) {
      const userId = ctx.state.user.id;
      const { subjectId } = ctx.request.body;
      if (!subjectId) {
        return ctx.badRequest("Subject ID is required");
      }
      const findRelation = await strapi.entityService.findMany(
        "api::following.following",
        {
          filters: {
            follower: { id: userId },
            subject: { id: subjectId },
          },
        }
      );
      if (findRelation?.length == 0) {
        return ctx.badRequest("You are not following this user");
      }
      const existingCloseFriends = await strapi.entityService.findMany(
        "api::following.following",
        {
          filters: {
            follower: { id: subjectId },
            subject: { id: userId },
          },
        }
      );
      if (existingCloseFriends.length == 0) {
        return ctx.badRequest("You are not following this user");
      }
      const updateCloseFriends = await strapi.entityService.update(
        "api::following.following",
        findRelation[0].id,
        {
          data: {
            is_close_friend: !findRelation[0].is_close_friend,
          },
        }
      );
      return ctx.send(updateCloseFriends);
    },
  })
);
