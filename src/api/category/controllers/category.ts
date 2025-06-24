/**
 * category controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::category.category",
  ({ strapi }) => ({
    async getCategories(ctx) {
      const categories = await strapi.entityService.findMany(
        "api::category.category",
        {}
      );
      return ctx.send(categories);
    },
  })
);
