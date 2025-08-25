/**
 * share service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::share.share",
  ({ strapi }) => ({
    async countShares(postId: any) {
      return await strapi.entityService.count("api::share.share", {
        filters: { post: postId },
      });
    },
  })
);
