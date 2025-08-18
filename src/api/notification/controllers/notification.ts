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

      const postIds = notifications
        .map((n: any) => n.post?.id)
        .filter((id) => !!id);

      const commentRecords = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: { post: { id: { $in: postIds } } },
          populate: { post: true },
          limit: 1000,
        }
      );
      const commentCountMap: Record<string, number> = {};
      commentRecords.forEach((rec) => {
        const postId = (rec as any).post?.id;
        if (postId)
          commentCountMap[postId] = (commentCountMap[postId] || 0) + 1;
      });
      const likeRecords = await strapi.entityService.findMany(
        "api::like.like",
        {
          filters: { post: { id: { $in: postIds } } },
          populate: { post: true, liked_by: true },
          limit: 1000,
        }
      );
      const likesCountMap: Record<string, number> = {};
      likeRecords.forEach((rec) => {
        const postId = (rec as any).post?.id;
        if (postId) likesCountMap[postId] = (likesCountMap[postId] || 0) + 1;
      });

      for (const n of notifications) {
        const post = (n as any).post;
        if (post) {
          let firstMedia = null;
          if (Array.isArray(post.media) && post.media.length > 0)
            firstMedia = post.media[0];
          else if (
            post.repost_of &&
            Array.isArray(post.repost_of.media) &&
            post.repost_of.media.length > 0
          )
            firstMedia = post.repost_of.media[0];

          if (firstMedia) {
            const [optimized] = await strapi
              .service("api::post.post")
              .getOptimisedFileData([firstMedia]);
            post.first_media = optimized || firstMedia;
          } else post.first_media = null;

          if (post.repost_of && post.repost_of.title)
            post.display_title = post.repost_of.title;
          else if (post.title) post.display_title = post.title;
          else post.display_title = "";

          post.comments_count = commentCountMap[post.id] || 0;
          post.likes_count = likesCountMap[post.id] || 0;
        }
      }

      const count = await strapi.entityService.count(
        "api::notification.notification",
        { filters: { user: currentUser.id } }
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
