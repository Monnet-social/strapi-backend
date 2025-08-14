/**
 * tag controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController("api::tag.tag", ({ strapi }) => ({
  async getTags(ctx) {
    const { pagination_size, page, query } = ctx.query;
    let default_pagination: any = {
      pagination: { page: 1, pageSize: 10 },
    };
    if (pagination_size)
      default_pagination.pagination.pageSize = pagination_size;
    if (page) default_pagination.pagination.page = page;
    const tags = await strapi.entityService.findMany("api::tag.tag", {
      sort: { post_count: "desc" },
      start:
        (default_pagination.pagination.page - 1) *
        default_pagination.pagination.pageSize,
      limit: default_pagination.pagination.pageSize,
    });
    //count
    const count = await strapi.entityService.count("api::tag.tag");
    return ctx.send({
      data: tags,
      meta: {
        pagination: {
          page: Number(default_pagination.pagination.page),
          pageSize: Number(default_pagination.pagination.pageSize),
          pageCount: Math.ceil(count / default_pagination.pagination.pageSize),
          total: count,
        },
      },
    });
  },
}));
