/**
 * like controller
 */

import { factories } from "@strapi/strapi";
import { stat } from "fs";

export default factories.createCoreController(
  "api::like.like",
  ({ strapi }) => ({
    async likePost(ctx) {
      const { post_id } = ctx.request.body;
      const userId = ctx.state.user.id;
      const existingLike = await strapi.entityService.findMany(
        "api::like.like",
        {
          filters: { post: post_id, liked_by: userId },
        }
      );
      if (existingLike.length > 0) {
        return ctx.send({
          message: "Post liked successfully 123",
          status: 200,
        });
      }
      const createLike = await strapi.entityService.create("api::like.like", {
        data: {
          post: post_id,
          liked_by: userId,
        },
      });
      return ctx.send({ message: "Post liked successfully ", status: 200 });
    },
    async unlikePost(ctx) {
      const { post_id } = ctx.request.body;
      const userId = ctx.state.user.id;
      const existingLike = await strapi.entityService.findMany(
        "api::like.like",
        {
          filters: { post: post_id, liked_by: userId },
        }
      );
      if (existingLike.length === 0) {
        return ctx.send("Post unliked successfully");
      }
      await strapi.entityService.delete("api::like.like", existingLike[0].id);
      return ctx.send("Post unliked successfully");
    },
    async getLikesByPostId(ctx) {
      const { post_id } = ctx.state.params;
      const likes = await strapi.entityService.findMany("api::like.like", {
        filters: { post: { id: post_id } },
        populate: {
          liked_by: {
            fields: ["id", "username", "email", "name"],
          },
        },
      });
      return ctx.send(likes);
    },
  })
);
