/**
 * tag-link controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::tag-link.tag-link",
  ({ strapi }) => ({
    async extractTags(ctx) {
      const { content } = ctx.request.body;
      const findAllPost = await strapi.entityService.findMany(
        "api::post.post",
        {}
      );
      for (let i = 0; i < findAllPost.length; i++) {
        const post = findAllPost[i];
        if (post.description)
          await strapi
            .service("api::tag-link.tag-link")
            .extractTags(post.description, "post", post.id);
      }
      const findAllComment = await strapi.entityService.findMany(
        "api::comment.comment",
        {}
      );
      for (let i = 0; i < findAllComment.length; i++) {
        const comment = findAllComment[i];
        if (comment.comment)
          await strapi
            .service("api::tag-link.tag-link")
            .extractTags(comment.comment, "comment", comment.id);
      }
      return ctx.send({
        message: "Tags extracted successfully",
      });
    },
  })
);
