/**
 * share service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::share.share",
  ({ strapi }) => ({
    async countShares(postId) {
      const count = await strapi.db
        .query("api::share.share")
        .count({ where: { post: postId } });

      return count;
    },
  })
);
