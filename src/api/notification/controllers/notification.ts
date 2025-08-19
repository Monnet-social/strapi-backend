import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::notification.notification",
  ({ strapi }) => ({
    async getNotification(ctx) {
      const { user: currentUser } = ctx.state;
      const { pagination_size, page } = ctx.query;

      const pageSize = pagination_size ? Number(pagination_size) : 10;
      const currentPage = page ? Number(page) : 1;

      const notifications = await strapi.entityService.findMany(
        "api::notification.notification",
        {
          filters: { user: currentUser.id },
          sort: { createdAt: "desc" },
          populate: {
            user: {
              populate: {
                profile_picture: true,
              },
            },
            post: {
              populate: {
                media: true,
                repost_of: {
                  populate: {
                    media: true,
                  },
                },
              },
            },
            actor: {
              populate: {
                profile_picture: true,
              },
            },
            comment: true,
          },
          start: (currentPage - 1) * pageSize,
          limit: pageSize,
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

      // Extract all post IDs for counting
      const postIds = notifications
        .map((n: any) => n.post?.id)
        .filter((id) => !!id);

      const commentCounts = await Promise.all(
        postIds.map(async (postId) => {
          const count = await strapi
            .service("api::comment.comment")
            .getCommentsCount(postId);
          return { postId, count };
        })
      );
      const commentCountMap = Object.fromEntries(
        commentCounts.map(({ postId, count }) => [postId, count])
      );

      const likesCounts = await Promise.all(
        postIds.map(async (postId) => {
          const count = await strapi
            .service("api::like.like")
            .getLikesCount(postId);
          return { postId, count };
        })
      );
      const likesCountMap = Object.fromEntries(
        likesCounts.map(({ postId, count }) => [postId, count])
      );

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
            firstMedia = post.repost_of.media;
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

          post.comments_count = commentCountMap[post.id] || 0;
          post.likes_count = likesCountMap[post.id] || 0;
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
            page: currentPage,
            pageSize,
            pageCount: Math.ceil(count / pageSize),
            total: count,
          },
        },
      });
    },
  })
);
