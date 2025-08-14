/**
 * notification controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::notification.notification",
  // Custom controller logic goes here
  ({ strapi }) => ({
    async getNotification(ctx) {
      const { user: currentUser } = ctx.state;

      const { pagination_size, page, query } = ctx.query;

      let default_pagination: any = {
        pagination: { page: 1, pageSize: 10 },
      };
      if (pagination_size)
        default_pagination.pagination.pageSize = pagination_size;
      if (page) default_pagination.pagination.page = page;

      const notifications = await strapi.entityService.findMany(
        "api::notification.notification",
        {
          filters: { user: currentUser.id },
          sort: { createdAt: "desc" },
          start:
            (default_pagination.pagination.page - 1) *
            default_pagination.pagination.pageSize,
          limit: default_pagination.pagination.pageSize,
        }
      );
      //count
      const count = await strapi.entityService.count(
        "api::notification.notification",
        {
          filters: { user: currentUser.id },
        }
      );

      return ctx.send({
        data: notifications,
        meta: {
          pagination: {
            page: Number(default_pagination.pagination.page),
            pageSize: Number(default_pagination.pagination.pageSize),
            pageCount: Math.ceil(
              count / default_pagination.pagination.pageSize
            ),
            total: count,
          },
        },
      });
    },
  })
);
