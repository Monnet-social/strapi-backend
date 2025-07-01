/**
 * share controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::share.share",
  ({ strapi }) => ({
    async createShare(ctx) {
      const { postId } = ctx.request.body;
      const userId = ctx.state.user.id;

      const share = await strapi.entityService.create("api::share.share", {
        data: {
          post: postId,
          shared_by: userId,
        },
      });
      return share;
    },
  })
);
