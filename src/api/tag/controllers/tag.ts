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

  async searchNavigation(ctx) {
    const { pagination_size, page } = ctx.query;
    let default_pagination: any = {
      pagination: { page: 1, pageSize: 10 },
    };
    if (pagination_size)
      default_pagination.pagination.pageSize = pagination_size;
    if (page) default_pagination.pagination.page = page;

    let keyword = (ctx.query.keyword as string) ?? "";
    // type : tags | comments | accounts |posts
    let { type } = ctx.query;
    if (!type) {
      type = "tags";
    }

    if (type == "tags") {
      if (keyword[0] == "#") {
        keyword = keyword.substring(1);
      }
      const results = await strapi.entityService.findMany(
        "api::tag-link.tag-link",
        {
          filters: {
            tag: {
              name: { $containsi: keyword },
            },
          },
          populate: { post: true },
        }
      );
      const count = await strapi.entityService.count("api::tag-link.tag-link", {
        filters: {
          tag: {
            name: { $containsi: keyword },
          },
        },
      });

      return ctx.send({
        data: results,
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
    }
    if (type == "comments") {
      const results = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: {
            comment: { $containsi: keyword },
          },
          populate: { post: true },
        }
      );
      const count = await strapi.entityService.count("api::comment.comment", {
        filters: {
          comment: { $containsi: keyword },
        },
      });

      return ctx.send({
        data: results,
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
    }
    if (type == "accounts") {
      const results = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: {
            $or: [
              { username: { $containsi: keyword } },
              { bio: { $containsi: keyword } },
            ],
          },
          populate: {
            profile_picture: true,
          },
        }
      );
      const count = await strapi.entityService.count(
        "plugin::users-permissions.user",
        {
          filters: {
            $or: [
              { username: { $containsi: keyword } },
              { bio: { $containsi: keyword } },
            ],
          },
        }
      );

      return ctx.send({
        data: results,
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
    }
    if (type == "posts") {
      const results = await strapi.entityService.findMany("api::post.post", {
        filters: {
          $or: [
            { title: { $containsi: keyword } },
            { description: { $containsi: keyword } },
          ],
        },
        populate: { posted_by: true },
      });
      const count = await strapi.entityService.count("api::post.post", {
        filters: {
          $or: [
            { title: { $containsi: keyword } },
            { description: { $containsi: keyword } },
          ],
        },
      });

      return ctx.send({
        data: results,
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
    }
    return ctx.send({
      data: [],
      meta: {
        pagination: {
          page: Number(default_pagination.pagination.page),
          pageSize: Number(default_pagination.pagination.pageSize),
          pageCount: 0,
          total: 0,
        },
      },
    });
  },
}));
