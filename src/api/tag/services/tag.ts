/**
 * tag service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService("api::tag.tag", (strapi) => ({
  async insertTa() {
    // Custom logic here
  },
}));
