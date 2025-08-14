/**
 * notification service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::notification.notification",
  ({ strapi }) => ({
    async saveNotification(type, actor, user, message, data) {
      let finalBody: any = {
        type,
        actor,
        user,
        message,
        ...data,
      };

      const notification = await strapi.entityService.create(
        "api::notification.notification",
        {
          data: finalBody,
        }
      );
      return notification;
    },
  })
);
