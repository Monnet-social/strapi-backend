import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::notification.notification",
  ({ strapi }) => ({
    async getNotification(ctx) {
      const { user: currentUser } = ctx.state;
      const { pagination_size, page } = ctx.query;

      let default_pagination = {
        pagination: { page: 1, pageSize: 10 },
      };
      if (pagination_size)
        default_pagination.pagination.pageSize = Number(pagination_size);
      if (page) default_pagination.pagination.page = Number(page);

      const notifications = await strapi.entityService.findMany(
        "api::notification.notification",
        {
          filters: { user: currentUser.id },
          sort: { createdAt: "desc" },
          populate: {
            user: {
              fields: [
                "id",
                "username",
                "name",
                "avatar_ring_color",
                "is_public",
              ],
              populate: { profile_picture: true },
            },
            post: {
              populate: {
                media: { fields: ["id", "url", "mime"] },
                repost_of: {
                  fields: ["title", "id"],
                  populate: {
                    media: { fields: ["id", "url", "mime"] },
                  },
                },
              },
            },

            actor: {
              fields: ["id", "username", "name", "avatar_ring_color"],
              populate: { profile_picture: true },
            },
            comment: true,
          },
          start:
            (default_pagination.pagination.page - 1) *
            default_pagination.pagination.pageSize,
          limit: default_pagination.pagination.pageSize,
        }
      );

      const usersToEnrich: any[] = [];
      notifications.forEach((n: any) => {
        if (n.user) usersToEnrich.push(n.user);
        if (n.actor) usersToEnrich.push(n.actor);
      });
      const uniqueUsers = Array.from(
        new Map(usersToEnrich.map((u) => [u.id, u])).values()
      );
      await strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures(uniqueUsers);

      for (const n of notifications) {
        const post = (n as any).post;
        if (post) {
          let firstMedia = null;

          if (Array.isArray(post.media) && post.media.length > 0) {
            firstMedia = post.media[0];
          } else if (
            post.repost_of &&
            Array.isArray(post.repost_of.media) &&
            post.repost_of.media.length > 0
          ) {
            firstMedia = post.repost_of.media[0];
          }

          if (firstMedia) {
            const [optimized] = await strapi
              .service("api::post.post")
              .getOptimisedFileData([firstMedia]);
            post.first_media = optimized || firstMedia;
          } else {
            post.first_media = null;
          }

          if (post.repost_of && post.repost_of.title) {
            post.display_title = post.repost_of.title;
          } else if (post.title) {
            post.display_title = post.title;
          } else {
            post.display_title = "";
          }
        }
      }

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
            page: default_pagination.pagination.page,
            pageSize: default_pagination.pagination.pageSize,
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
