/**
 * like controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::like.like",
  ({ strapi }) => ({
    async likePost(ctx) {
      const { post_id } = ctx.request.body;
      const userId = ctx.state.user.id;
      const existingLike = await strapi.entityService.findMany(
        "api::like.like",
        { filters: { post: post_id, liked_by: userId } }
      );
      if (existingLike.length > 0) {
        await strapi.entityService.delete("api::like.like", existingLike[0].id);
        return ctx.send({
          message: "Post unliked successfully ",
          is_liked: false,
          status: 200,
        });
      }
      await strapi.entityService.create("api::like.like", {
        data: { post: post_id, liked_by: userId },
      });
      return ctx.send({
        message: "Post liked successfully ",
        status: 200,
        is_liked: true,
      });
    },

    async getLikesByPostId(ctx) {
      const { post_id } = ctx.params;
      const { user: currentUser } = ctx.state;

      if (!post_id || isNaN(post_id))
        return ctx.badRequest("Please provide a valid post id.");

      if (!currentUser)
        return ctx.unauthorized(
          "You must be logged in to perform this action."
        );

      try {
        const likes = await strapi.entityService.findMany("api::like.like", {
          filters: { post: { id: post_id } },
          populate: {
            liked_by: {
              fields: ["id", "username", "email", "name", "avatar_ring_color"],
              populate: { profile_picture: true },
            },
          },
        });

        const users = likes.map((like: any) => like.liked_by).filter(Boolean);

        if (users.length === 0) return ctx.send([]);

        const userIds = users.map((user) => user.id);

        const [followStatusMap] = await Promise.all([
          strapi
            .service("api::following.following")
            .getFollowStatusForUsers(currentUser.id, userIds),
          strapi
            .service("api::post.post")
            .enrichUsersWithOptimizedProfilePictures(users),
        ]);

        const finalUsers = users.map((user) => {
          return {
            ...user,
            ...followStatusMap.get(user.id),
          };
        });

        return ctx.send(finalUsers);
      } catch (err) {
        strapi.log.error("Error in getLikesByPostId:", err);
        return ctx.internalServerError(
          "An error occurred while fetching likes."
        );
      }
    },
  })
);
