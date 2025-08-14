import { factories } from "@strapi/strapi";
import FileOptimisationService from "../../../utils/file_optimisation_service";

interface PostStats {
  id: string | number;
  likes_count?: number;
  is_liked?: boolean;
  dislikes_count?: number;
  is_disliked?: boolean;
  comments_count?: number;
  share_count?: number;
}

type Post = Record<string, any>;

export default factories.createCoreService("api::post.post", ({ strapi }) => ({
  async getOptimisedFileData(media: any[]) {
    const finalMedia = [];
    for (let i = 0; i < media?.length; i++) {
      const file = media[i];
      const findImage = await strapi.entityService.findMany(
        "api::file-optimisation.file-optimisation",
        { filters: { media: { id: file.id } } }
      );
      if (findImage.length > 0) {
        const fileData = findImage[0];
        if (fileData?.thumbnail_url?.length > 0)
          media[i].thumbnail_url =
            await new FileOptimisationService().getSignedUrl(
              fileData.thumbnail_url
            );
        if (fileData?.compressed_url?.length > 0)
          media[i].compressed_url = (
            await new FileOptimisationService().getSignedUrl(
              fileData.compressed_url
            )
          )?.split("?")[0];
        finalMedia.push({
          id: file.id,
          url: file.url,
          mime: file.mime,
          thumbnail_url: media[i].thumbnail_url,
          compressed_url: media[i].compressed_url,
        });
      } else {
        finalMedia.push({
          id: file.id,
          url: file.url,
          mime: file.mime,
          thumbnail_url: null,
          compressed_url: null,
        });
      }
    }
    return finalMedia;
  },

  async getStoryViewersCount(postId: number): Promise<number> {
    if (!postId || isNaN(postId)) return 0;
    try {
      const post = await strapi.entityService.findOne(
        "api::post.post",
        postId,
        { fields: ["id"], populate: { viewers: { count: true } } as any }
      );
      if (!post) return 0;
      return (post as any).viewers.count || 0;
    } catch {
      return 0;
    }
  },

  async enrichUsersWithOptimizedProfilePictures(users: any[]) {
    if (!users?.length) return;
    for (const user of users) {
      if (user?.profile_picture?.id) {
        const optimizedPictures = await this.getOptimisedFileData([
          user.profile_picture,
        ]);
        user.profile_picture = optimizedPictures[0] || null;
      } else if (user) user.profile_picture = null;
    }
  },

  async enrichPostsWithStats(posts: any, currentUserId: string | number) {
    const isArray = Array.isArray(posts);
    const postList = isArray ? posts : [posts];
    await Promise.all(
      postList.map(async (post) => {
        const [
          likes_count,
          is_liked,
          dislikes_count,
          is_disliked,
          comments_count,
          share_count,
        ] = await Promise.all([
          strapi.services["api::like.like"].getLikesCount(post.id),
          strapi.services["api::like.like"].verifyPostLikeByUser(
            post.id,
            currentUserId
          ),
          strapi
            .service("api::dislike.dislike")
            .getDislikesCountByPostId(post.id),
          strapi
            .service("api::dislike.dislike")
            .verifyPostDislikedByUser(post.id, currentUserId),
          strapi.services["api::comment.comment"].getCommentsCount(post.id),
          strapi.services["api::share.share"].countShares(post.id),
        ]);
        Object.assign(post, {
          likes_count,
          is_liked,
          dislikes_count,
          is_disliked,
          comments_count,
          share_count,
        });
      })
    );
    return isArray ? postList : postList[0];
  },

  async populateRepostData(
    posts: Post[],
    currentUserId: string | number
  ): Promise<Post[]> {
    if (!posts?.length) return posts;
    const repostIds = posts
      .filter((p) => p.repost_of)
      .map((p) =>
        typeof p.repost_of === "number" || typeof p.repost_of === "string"
          ? p.repost_of
          : p.repost_of.id
      )
      .filter(
        (id): id is string | number =>
          typeof id === "string" || typeof id === "number"
      );
    if (!repostIds.length) return posts;
    const originals = await strapi.entityService.findMany("api::post.post", {
      filters: { id: { $in: repostIds } },
      populate: {
        posted_by: {
          fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
          populate: { profile_picture: true },
        },
        category: true,
        tagged_users: {
          fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
          populate: { profile_picture: true },
        },
        location: true,
        media: true,
        viewers: true,
        share_with_close_friends: true,
        repost_of: true,
        reposted_from: true,
      },
    });
    const originalsMap = new Map<string | number, Post>(
      originals.map((o: any) => [o.id, o])
    );
    const skipKeys = [
      "id",
      "documentId",
      "createdAt",
      "updatedAt",
      "publishedAt",
      "posted_by",
      "repost_of",
      "reposted_from",
      "repost_caption",
      "likes_count",
      "is_liked",
      "dislikes_count",
      "is_disliked",
      "comments_count",
      "share_count",
    ];
    return posts.map((post: Post) => {
      if (post.repost_of) {
        const origId =
          typeof post.repost_of === "number" ||
          typeof post.repost_of === "string"
            ? post.repost_of
            : post.repost_of.id;
        const orig = originalsMap.get(origId);
        if (orig) {
          post.is_repost = true;
          Object.keys(orig).forEach((key) => {
            if (!skipKeys.includes(key)) post[key] = orig[key];
          });
          post.repost_of = orig;
          post.reposted_from = orig?.posted_by || null;
        }
      }
      return post;
    });
  },

  async enrichRepostsAndStats(
    posts: Post[],
    currentUserId: string | number
  ): Promise<Post[]> {
    const withReposts = await this.populateRepostData(posts, currentUserId);
    await this.enrichPostsWithStats(withReposts, currentUserId);
    const originalIds = withReposts
      .filter((p) => p.repost_of && p.repost_of.id)
      .map((p) => p.repost_of.id)
      .filter(
        (id): id is string | number =>
          typeof id === "string" || typeof id === "number"
      );
    if (originalIds.length) {
      const uniqueIds: (string | number)[] = Array.from(new Set(originalIds));
      const originals = await strapi.entityService.findMany("api::post.post", {
        filters: { id: { $in: uniqueIds } },
        fields: ["id"],
      });
      await this.enrichPostsWithStats(originals, currentUserId);
      const statsMap = new Map<string | number, PostStats>(
        originals.map((o) => [o.id, o as PostStats])
      );
      for (const post of withReposts) {
        if (post.repost_of && statsMap.has(post.repost_of.id)) {
          const stats = statsMap.get(post.repost_of.id)!;
          post.original_stats = {
            likes_count: stats.likes_count ?? 0,
            comments_count: stats.comments_count ?? 0,
            share_count: stats.share_count ?? 0,
            is_liked: !!stats.is_liked,
            is_disliked: !!stats.is_disliked,
            dislikes_count: stats.dislikes_count ?? 0,
          };
        }
      }
    }
    return withReposts;
  },

  async mapSubcategoriesToPosts(posts: any[]) {
    const categoryIds = [
      ...new Set(
        posts
          .map((p) => p.category?.id)
          .filter(
            (id): id is string | number =>
              typeof id === "string" || typeof id === "number"
          )
      ),
    ];
    if (!categoryIds.length) return new Map();
    const allSubcats = await strapi.entityService.findMany(
      "api::subcategory.subcategory",
      {
        filters: { category: { id: { $in: categoryIds } } },
        populate: { category: true },
        pagination: { limit: -1 },
      }
    );
    const map = new Map();
    for (const sub of allSubcats) {
      const catId = (sub as any).category?.id;
      if (!catId) continue;
      if (!map.has(catId)) map.set(catId, []);
      map.get(catId).push(sub);
    }
    return map;
  },

  async enrichMediaAndFollowStatus(posts, currentUserId) {
    const usersToProcess = posts
      .flatMap((p) => [p.posted_by, ...(p.tagged_users || [])])
      .filter(Boolean);
    const allUserIds = [...new Set(usersToProcess.map((u) => u.id))];
    const allMedia = posts.flatMap((p) => p.media || []).filter(Boolean);
    const [optimizedMediaArray, followStatusMap] = await Promise.all([
      this.getOptimisedFileData(allMedia),
      strapi
        .service("api::following.following")
        .getFollowStatusForUsers(currentUserId, allUserIds),
      this.enrichUsersWithOptimizedProfilePictures(usersToProcess),
    ]);
    const optimizedMediaMap = new Map(
      (optimizedMediaArray || []).map((m) => [m.id, m])
    );
    return { optimizedMediaMap, followStatusMap };
  },

  async resolveOriginalPost(postId: number): Promise<any | null> {
    if (!postId || isNaN(postId)) return null;

    try {
      let currentPostId = postId;
      let visitedIds = new Set<number>();

      while (currentPostId && !visitedIds.has(currentPostId)) {
        visitedIds.add(currentPostId);

        const post = await strapi.entityService.findOne(
          "api::post.post",
          currentPostId,
          {
            fields: ["id", "title", "description", "createdAt"],
            populate: {
              repost_of: { fields: ["id"] },
              posted_by: { fields: ["id", "username", "name", "fcm_token"] },
              media: { fields: ["id", "url", "mime"] },
            },
          }
        );

        if (!post) return null;

        if (!(post as any).repost_of) {
          return post;
        }

        currentPostId = (post as any).repost_of.id;
      }

      return null;
    } catch (err) {
      strapi.log.error("Error resolving original post:", err);
      return null;
    }
  },
  mapFinalPosts(posts, subMap, optimizedMediaMap, followStatusMap) {
    return posts.map((post) => {
      const postCategoryId = post.category?.id;
      return {
        ...post,
        subcategories: subMap.get(postCategoryId) || [],
        is_repost: !!post.repost_of,
        media: (post.media || []).map((m) => optimizedMediaMap.get(m.id) || m),
        posted_by: {
          ...post.posted_by,
          ...followStatusMap.get(post.posted_by.id),
        },
        tagged_users: (post.tagged_users || []).map((user) => ({
          ...user,
          ...followStatusMap.get(user.id),
        })),
      };
    });
  },
}));
