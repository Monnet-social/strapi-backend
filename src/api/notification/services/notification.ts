import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::notification.notification",
  ({ strapi }) => ({
    async saveNotification(
      type:
        | "comment"
        | "mention"
        | "follow_request"
        | "reaction"
        | "repost"
        | "reply",
      actor: number,
      user: number,
      message: string,
      data: Record<string, any>
    ) {
      const notification = await strapi.entityService.create(
        "api::notification.notification",
        {
          data: {
            type,
            actor,
            user,
            message,
            ...data,
          },
        }
      );
      return notification;
    },
  })
);
