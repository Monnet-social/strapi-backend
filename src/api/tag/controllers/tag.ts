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
    const paginationSize = Number(ctx.query.pagination_size) || 10;
    const page = Number(ctx.query.page) || 1;
    let keyword = (ctx.query.keyword as string) || "";
    const type = (ctx.query.type as string) || "tags";

    const pagination = {
      start: (page - 1) * paginationSize,
      limit: paginationSize,
    };

    if (type === "tags") {
      if (keyword.startsWith("#")) keyword = keyword.substring(1);
      const tags = await strapi.entityService.findMany("api::tag.tag", {
        filters: keyword ? { name: { $containsi: keyword } } : {},
        sort: { post_count: "desc" },
        ...pagination,
      });
      const count = await strapi.entityService.count("api::tag.tag", {
        filters: keyword ? { name: { $containsi: keyword } } : {},
      });
      const data = tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        post_count: tag.post_count || 0,
      }));
      return ctx.send({
        data,
        meta: {
          pagination: {
            page,
            pageSize: paginationSize,
            pageCount: Math.ceil(count / paginationSize),
            total: count,
          },
        },
      });
    }

    if (type === "comments") {
      const filters = keyword ? { comment: { $containsi: keyword } } : {};
      const results = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters,
          populate: { post: true },
          ...pagination,
        }
      );
      const count = await strapi.entityService.count("api::comment.comment", {
        filters,
      });
      return ctx.send({
        data: results,
        meta: {
          pagination: {
            page,
            pageSize: paginationSize,
            pageCount: Math.ceil(count / paginationSize),
            total: count,
          },
        },
      });
    }

    if (type === "accounts") {
      const filters = keyword
        ? {
            $or: [
              { username: { $containsi: keyword } },
              { bio: { $containsi: keyword } },
            ],
          }
        : {};

      const users = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters,
          populate: { profile_picture: true },
          ...pagination,
        }
      );

      const count = await strapi.entityService.count(
        "plugin::users-permissions.user",
        {
          filters,
        }
      );

      const currentUserId = ctx.state.user?.id;
      let enrichedUsers = users;

      if (currentUserId) {
        const followStatusMap = await strapi
          .service("api::following.following")
          .getFollowStatusForUsers(
            currentUserId,
            users.map((u) => u.id)
          );

        enrichedUsers = users.map((user) => ({
          ...user,
          is_follower: followStatusMap.get(user.id)?.is_follower || false,
          is_following: followStatusMap.get(user.id)?.is_following || false,
          is_request_sent:
            followStatusMap.get(user.id)?.is_request_sent || false,
          is_my_request_accepted:
            followStatusMap.get(user.id)?.is_my_request_accepted || false,
        }));
      }

      return ctx.send({
        data: enrichedUsers,
        meta: {
          pagination: {
            page,
            pageSize: paginationSize,
            pageCount: Math.ceil(count / paginationSize),
            total: count,
          },
        },
      });
    }

    if (type === "posts") {
      const filters = keyword
        ? {
            $or: [
              { title: { $containsi: keyword } },
              { description: { $containsi: keyword } },
            ],
          }
        : {};

      const posts = await strapi.entityService.findMany("api::post.post", {
        filters,
        sort: { createdAt: "desc" },
        ...pagination,
      });

      console.log(`Fetched posts count: ${posts.length}`);
      posts.forEach((p, idx) => {
        if (!p || !p.id) {
          console.error(`Invalid post at index ${idx}:`, p);
        }
      });

      const validPosts = posts.filter((p) => p && p.id);

      const count = await strapi.entityService.count("api::post.post", {
        filters,
      });

      const hydratedPosts = await strapi
        .service("api::post.post")
        .preparePosts(validPosts, ctx.state.user ? ctx.state.user.id : null, {
          includeStories: false,
        });

      return ctx.send({
        data: hydratedPosts,
        meta: {
          pagination: {
            page,
            pageSize: paginationSize,
            pageCount: Math.ceil(count / paginationSize),
            total: count,
          },
        },
      });
    }

    return ctx.send({
      data: [],
      meta: {
        pagination: {
          page,
          pageSize: paginationSize,
          pageCount: 0,
          total: 0,
        },
      },
    });
  },
  async assignTags(ctx) {
    const findProducts = await strapi.entityService.findMany("api::post.post", {
      filters: {
        id: 1012,
      },
    });
    for (let i = 0; i < findProducts.length; i++) {
      const product = findProducts[i];
      console.log(
        "Processing product:",
        product.id,
        product.title,
        product.description
      );
      if (product.title) {
        await strapi
          .service("api::tag.tag")
          .extractTags(product.title, product.id);
      }
      if (product.description) {
        await strapi.service("api::tag.tag").extractTags(
          product.description,

          product.id
        );
      }
    }
    return ctx.send({
      message: "DONE",
    });
  },
}));
