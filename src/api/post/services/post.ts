// import { factories } from "@strapi/strapi";
// import FileOptimisationService from "../../../utils/file_optimisation_service";
// import NotificationService from "../../../utils/notification_service";

// interface PostStats {
//   id: string | number;
//   likes_count?: number;
//   is_liked?: boolean;
//   dislikes_count?: number;
//   is_disliked?: boolean;
//   comments_count?: number;
//   share_count?: number;
// }
// type Post = Record<string, any>;

// export default factories.createCoreService("api::post.post", ({ strapi }) => ({
//   async getOptimisedFileData(media: any[]) {
//     const finalMedia = [];
//     for (let i = 0; i < media?.length; i++) {
//       const file = media[i];
//       const findImage = await strapi.entityService.findMany(
//         "api::file-optimisation.file-optimisation",
//         { filters: { media: { id: file.id } } }
//       );
//       if (findImage.length > 0) {
//         const fileData = findImage[0];
//         if (fileData?.thumbnail_url?.length > 0)
//           media[i].thumbnail_url =
//             await new FileOptimisationService().getSignedUrl(
//               fileData.thumbnail_url
//             );
//         if (fileData?.compressed_url?.length > 0)
//           media[i].compressed_url = (
//             await new FileOptimisationService().getSignedUrl(
//               fileData.compressed_url
//             )
//           )?.split("?")[0];
//         finalMedia.push({
//           id: file.id,
//           url: file.url,
//           mime: file.mime,
//           thumbnail_url: media[i].thumbnail_url,
//           compressed_url: media[i].compressed_url,
//         });
//       } else {
//         finalMedia.push({
//           id: file.id,
//           url: file.url,
//           mime: file.mime,
//           thumbnail_url: null,
//           compressed_url: null,
//         });
//       }
//     }
//     return finalMedia;
//   },

//   async getStoryViewersCount(postId: number): Promise<number> {
//     if (!postId || isNaN(postId)) return 0;
//     try {
//       const post = await strapi.entityService.findOne(
//         "api::post.post",
//         postId,
//         { fields: ["id"], populate: { viewers: { count: true } } as any }
//       );
//       if (!post) return 0;
//       return (post as any).viewers.count || 0;
//     } catch {
//       return 0;
//     }
//   },

//   async enrichPostsWithStats(posts: any, currentUserId: string | number) {
//     const isArray = Array.isArray(posts);
//     const postList = isArray ? posts : [posts];
//     await Promise.all(
//       postList.map(async (post) => {
//         const [
//           likes_count,
//           is_liked,
//           dislikes_count,
//           is_disliked,
//           comments_count,
//           share_count,
//         ] = await Promise.all([
//           strapi.services["api::like.like"].getLikesCount(post.id),
//           strapi.services["api::like.like"].verifyPostLikeByUser(
//             post.id,
//             currentUserId
//           ),
//           strapi
//             .service("api::dislike.dislike")
//             .getDislikesCountByPostId(post.id),
//           strapi
//             .service("api::dislike.dislike")
//             .verifyPostDislikedByUser(post.id, currentUserId),
//           strapi.services["api::comment.comment"].getCommentsCount(post.id),
//           strapi.services["api::share.share"].countShares(post.id),
//         ]);
//         Object.assign(post, {
//           likes_count,
//           is_liked,
//           dislikes_count,
//           is_disliked,
//           comments_count,
//           share_count,
//         });
//       })
//     );
//     return isArray ? postList : postList[0];
//   },

//   async populateRepostData(
//     posts: Post[],
//     currentUserId: string | number
//   ): Promise<Post[]> {
//     if (!posts?.length) return posts;

//     // Loop through each post that has a repost_of
//     return await Promise.all(
//       posts.map(async (post: Post) => {
//         if (post.repost_of) {
//           const repostId =
//             typeof post.repost_of === "number" ||
//             typeof post.repost_of === "string"
//               ? post.repost_of
//               : post.repost_of.id;

//           const orig = await this.resolveOriginalPost(repostId);

//           if (orig) {
//             post.is_repost = true;

//             const skipKeys = [
//               "id",
//               "documentId",
//               "createdAt",
//               "updatedAt",
//               "publishedAt",
//               "posted_by",
//               "repost_of",
//               "reposted_from",
//               "repost_caption",
//               "likes_count",
//               "is_liked",
//               "dislikes_count",
//               "is_disliked",
//               "comments_count",
//               "share_count",
//             ];
//             Object.keys(orig).forEach((key) => {
//               if (!skipKeys.includes(key)) post[key] = orig[key];
//             });

//             post.repost_of = orig;
//             post.reposted_from = orig.posted_by || null;
//           }
//         }
//         return post;
//       })
//     );
//   },

//   async resolveOriginalPost(postId: number): Promise<any | null> {
//     if (!postId || isNaN(postId)) return null;

//     try {
//       let currentPostId = postId;
//       let visitedIds = new Set<number>();

//       while (currentPostId && !visitedIds.has(currentPostId)) {
//         visitedIds.add(currentPostId);

//         const post = await strapi.entityService.findOne(
//           "api::post.post",
//           currentPostId,
//           {
//             populate: {
//               repost_of: { fields: ["id"] },
//               posted_by: { fields: ["id", "username", "name", "fcm_token"] },
//               media: { fields: ["id", "url", "mime"] },
//               mentioned_users: {
//                 populate: {
//                   user: {
//                     fields: ["id", "username", "name", "fcm_token"],
//                   },
//                 },
//               },
//             },
//           }
//         );

//         if (!post) return null;

//         if (!(post as any).repost_of) {
//           return post;
//         }

//         currentPostId = (post as any).repost_of.id;
//       }

//       return null;
//     } catch (err) {
//       strapi.log.error("Error resolving original post:", err);
//       return null;
//     }
//   },

//   async preparePostsForResponse(
//     posts,
//     currentUserId,
//     { includeStories = false } = {}
//   ) {
//     if (!posts || !posts.length) return [];

//     // Step1: Enrich reposts & stats
//     posts = await strapi
//       .service("api::post.post")
//       .enrichRepostsAndStats(posts, currentUserId);

//     // Step2: Map subcategories
//     const subMap = await strapi
//       .service("api::post.post")
//       .mapSubcategoriesToPosts(posts);

//     // Step3: Enrich media + follow status
//     const { optimizedMediaMap, followStatusMap } = await strapi
//       .service("api::post.post")
//       .enrichMediaAndFollowStatus(posts, currentUserId);

//     // Step4: Build final post objects
//     posts = strapi
//       .service("api::post.post")
//       .mapFinalPosts(posts, subMap, optimizedMediaMap, followStatusMap);

//     // Step5: Add has_stories flag if needed
//     if (includeStories) {
//       const authorIds = posts.map((p) => p.posted_by?.id).filter(Boolean);
//       const hasStoriesSet = await this.getUsersWithStories(authorIds);
//       posts = posts.map((p) => ({
//         ...p,
//         posted_by: {
//           ...p.posted_by,
//           has_stories: hasStoriesSet.has(p.posted_by?.id),
//         },
//       }));
//     }

//     return posts;
//   },

//   /**
//    * ========================
//    * Tagged Users Validation
//    * ========================
//    */
//   async validateTaggedUsers(taggedUserIds, currentUserId) {
//     if (!Array.isArray(taggedUserIds) || !taggedUserIds.length) return;

//     if (taggedUserIds.includes(currentUserId)) {
//       throw new Error("You cannot tag yourself in a post.");
//     }

//     const users = await strapi.entityService.findMany(
//       "plugin::users-permissions.user",
//       {
//         filters: { id: { $in: taggedUserIds } },
//         fields: ["id"],
//       }
//     );

//     if (users.length !== taggedUserIds.length) {
//       const foundIds = users.map((u) => u.id);
//       const invalidIds = taggedUserIds.filter((id) => !foundIds.includes(id));
//       throw new Error(`Invalid tagged user IDs: ${invalidIds.join(", ")}`);
//     }
//   },

//   /**
//    * =================
//    * Media Validation
//    * =================
//    */
//   async validateMediaFiles(mediaIds) {
//     if (!Array.isArray(mediaIds) || !mediaIds.length) return;

//     for (let file_id of mediaIds) {
//       const fileData = await strapi.entityService.findOne(
//         "plugin::upload.file",
//         file_id
//       );
//       if (!fileData)
//         throw new Error(`Media with ID ${file_id} does not exist.`);
//     }
//   },

//   /**
//    * =====================
//    * Category Validation
//    * =====================
//    */
//   async validateCategory(categoryId) {
//     if (!categoryId) return;

//     const exists = await strapi.entityService.findOne(
//       "api::category.category",
//       categoryId
//     );
//     if (!exists)
//       throw new Error(`Category with ID ${categoryId} does not exist.`);
//   },

//   /**
//    * ========================
//    * Close Friends Validation
//    * ========================
//    */
//   async validateCloseFriendsList(shareWith, closeFriendsList, currentUserId) {
//     const allowedShareWithOptions = ["PUBLIC", "FOLLOWERS", "CLOSE-FRIENDS"];
//     if (shareWith && !allowedShareWithOptions.includes(shareWith)) {
//       throw new Error(
//         `Invalid share_with value. Allowed: ${allowedShareWithOptions.join(", ")}`
//       );
//     }

//     if (shareWith === "CLOSE-FRIENDS") {
//       if (!Array.isArray(closeFriendsList) || !closeFriendsList.length) {
//         throw new Error(
//           "For 'CLOSE-FRIENDS', you must provide a non-empty list of friends."
//         );
//       }

//       const found = await strapi.entityService.findMany(
//         "plugin::users-permissions.user",
//         {
//           filters: { id: { $in: closeFriendsList } },
//           fields: ["id"],
//         }
//       );

//       if (found.length !== closeFriendsList.length) {
//         const foundIds = found.map((u) => u.id);
//         const invalidIds = closeFriendsList.filter(
//           (id) => !foundIds.includes(id)
//         );
//         throw new Error(`Invalid close friends: ${invalidIds.join(", ")}`);
//       }

//       if (closeFriendsList.includes(currentUserId)) {
//         throw new Error(
//           "You cannot include yourself in the close friends list."
//         );
//       }
//     } else {
//       if (Array.isArray(closeFriendsList) && closeFriendsList.length > 0) {
//         throw new Error(
//           "'share_with_close_friends' should only be provided when share_with is 'CLOSE-FRIENDS'."
//         );
//       }
//     }
//   },

//   /**
//    * ===========================
//    * Notify Mentions in a Post
//    * ===========================
//    */
//   async notifyMentionsInPost(mentionedUserIds, actorUser, postId, postType) {
//     if (!Array.isArray(mentionedUserIds) || !mentionedUserIds.length) return;

//     for (const userId of mentionedUserIds) {
//       const notifMsg = `${actorUser.username} mentioned you in a ${postType === "story" ? "story" : "post"}.`;
//       const notificationService = new NotificationService();
//       await notificationService.saveNotification(
//         "mention",
//         actorUser.id,
//         userId,
//         notifMsg,
//         { post: postId }
//       );

//       const recipient = await strapi.entityService.findOne(
//         "plugin::users-permissions.user",
//         userId,
//         {
//           fields: ["fcm_token"],
//         }
//       );

//       if (recipient && recipient.fcm_token) {
//         await notificationService.sendPushNotification(
//           "New Mention",
//           notifMsg,
//           { type: "mention", postId: postId.toString() },
//           recipient.fcm_token
//         );
//       }
//     }
//   },
//   /**
//    * ===============================
//    * Prepare Single Post for Response
//    * ===============================
//    */
//   async prepareSinglePostForResponse(postEntity, currentUserId) {
//     let enriched = await strapi
//       .service("api::post.post")
//       .enrichRepostsAndStats([postEntity], currentUserId);
//     postEntity = enriched[0];

//     const { optimizedMediaMap, followStatusMap } = await strapi
//       .service("api::post.post")
//       .enrichMediaAndFollowStatus([postEntity], currentUserId);

//     postEntity.media = (postEntity.media || []).map(
//       (m) => optimizedMediaMap.get(m.id) || m
//     );

//     postEntity.posted_by = {
//       ...postEntity.posted_by,
//       ...followStatusMap.get(postEntity.posted_by.id),
//     };

//     postEntity.tagged_users = (postEntity.tagged_users || [])
//       .filter((u) => u && u.id)
//       .map((user) => ({
//         ...user,
//         ...(user && user.id ? followStatusMap.get(user.id) : {}),
//       }));

//     postEntity.mentioned_users = (postEntity.mentioned_users || []).map(
//       (mention) => ({
//         ...mention,
//         user: {
//           ...mention.user,
//           ...followStatusMap.get(mention.user?.id),
//         },
//       })
//     );

//     // delete postEntity.tagged_users;

//     return postEntity;
//   },
//   /**
//    * ================
//    * Enrich Stories
//    * ================
//    */
//   async enrichStories(stories, currentUserId) {
//     if (!stories.length) return;

//     const usersToProcess = stories
//       .flatMap((story) => [story.posted_by, ...(story.tagged_users || [])])
//       .filter(Boolean);

//     await Promise.all([
//       strapi.service("api::following.following").enrichItemsWithFollowStatus({
//         items: stories,
//         userPaths: ["posted_by", "tagged_users"],
//         currentUserId,
//       }),
//       strapi
//         .service("api::post.post")
//         .enrichUsersWithOptimizedProfilePictures(usersToProcess),
//     ]);

//     await Promise.all(
//       stories.map(async (story) => {
//         const [likes_count, is_liked, viewers_count, optimizedMedia] =
//           await Promise.all([
//             strapi.service("api::like.like").getLikesCount(story.id),
//             strapi
//               .service("api::like.like")
//               .verifyPostLikeByUser(story.id, currentUserId),
//             strapi.service("api::post.post").getStoryViewersCount(story.id),
//             strapi.service("api::post.post").getOptimisedFileData(story.media),
//           ]);
//         story.expiration_time =
//           new Date(story.createdAt).getTime() + 24 * 60 * 60 * 1000;
//         story.likes_count = likes_count;
//         story.is_liked = is_liked;
//         story.viewers_count = viewers_count;
//         story.media = optimizedMedia || [];
//       })
//     );
//   },

//   /**
//    * =========================
//    * Verify Post Ownership ACL
//    * =========================
//    */
//   async verifyPostOwnership(postId, userId) {
//     const posts = await strapi.entityService.findMany("api::post.post", {
//       filters: { id: postId, posted_by: userId },
//       limit: 1,
//     });
//     if (!posts.length) {
//       throw new Error(
//         "You are not allowed to modify this post, or it does not exist."
//       );
//     }
//   },

//   /**
//    * ===========================
//    * Follow/Close Friend Status
//    * ===========================
//    */
//   async getUserRelationStatus(currentUserId, targetUserId) {
//     const isOwner =
//       currentUserId && currentUserId.toString() === targetUserId.toString();
//     let isFollowing = false;
//     let isCloseFriend = false;

//     if (currentUserId && !isOwner) {
//       const [followCount, closeFriendCount] = await Promise.all([
//         strapi.entityService.count("api::following.following", {
//           filters: {
//             follower: { id: currentUserId },
//             subject: { id: targetUserId },
//           },
//         }),
//         strapi.entityService.count("api::following.following", {
//           filters: {
//             follower: { id: targetUserId },
//             subject: { id: currentUserId },
//             is_close_friend: true,
//           },
//         }),
//       ]);
//       isFollowing = followCount > 0;
//       isCloseFriend = closeFriendCount > 0;
//     }
//     const canViewProfile = isOwner || isFollowing;
//     return { isOwner, isFollowing, isCloseFriend, canViewProfile };
//   },

//   async getFeedPosts(
//     userId: number,
//     pagination: { page: number; pageSize: number },
//     blockList: number[],
//     followingList: number[],
//     closeFriendList: number[]
//   ) {
//     const filters: any = {
//       post_type: "post",
//       posted_by: { id: { $notIn: blockList.length ? blockList : [-1] } },
//       $or: [
//         { share_with: "PUBLIC" },
//         {
//           $and: [
//             { share_with: "FOLLOWERS" },
//             {
//               posted_by: {
//                 id: { $in: followingList.length ? followingList : [-1] },
//               },
//             },
//           ],
//         },
//         {
//           $and: [
//             { share_with: "CLOSE_FRIENDS" },
//             {
//               posted_by: {
//                 id: { $in: closeFriendList.length ? closeFriendList : [-1] },
//               },
//             },
//           ],
//         },
//         { posted_by: { id: userId } },
//       ],
//     };

//     const [posts, total] = await Promise.all([
//       strapi.entityService.findMany("api::post.post", {
//         filters,
//         sort: { createdAt: "desc" }, // sorts posts and reposts by their createdAt descending
//         populate: {
//           posted_by: {
//             fields: ["id", "username", "name", "avatar_ring_color"],
//             populate: { profile_picture: true },
//           },
//           category: true,
//           tagged_users: {
//             fields: ["id", "username", "name", "avatar_ring_color"],
//             populate: { profile_picture: true },
//           },
//           media: true,
//           repost_of: {
//             populate: {
//               posted_by: true,
//               media: true,
//               category: true,
//               tagged_users: true,
//             },
//           },
//         },
//         start: (pagination.page - 1) * pagination.pageSize,
//         limit: pagination.pageSize,
//       }),
//       strapi.entityService.count("api::post.post", { filters }),
//     ]);

//     return { posts, total };
//   },
//   async getUserRelationsAndBlocks(userId: number) {
//     if (!userId)
//       return {
//         following: [],
//         followers: [],
//         closeFriends: [],
//         blocked: [],
//         hidden: [],
//       };

//     const [
//       followingEntries,
//       followerEntries,
//       closeFriendsEntries,
//       blockedEntries,
//       hiddenEntries,
//     ] = await Promise.all([
//       strapi.entityService.findMany("api::following.following", {
//         filters: { follower: { id: userId } },
//         populate: { subject: true },
//       }),
//       strapi.entityService.findMany("api::following.following", {
//         filters: { subject: { id: userId } },
//         populate: { follower: true },
//       }),
//       strapi.entityService.findMany("api::following.following", {
//         filters: { follower: { id: userId }, is_close_friend: true },
//         populate: { subject: true },
//       }),
//       strapi.entityService.findMany("api::block.block", {
//         filters: { blocked_by: { id: userId } },
//         populate: { blocked_user: true },
//       }),
//       strapi.entityService.findMany("api::hide-story.hide-story", {
//         filters: { owner: { id: userId } },
//         populate: { target: true },
//       }),
//     ]);

//     return {
//       following: followingEntries
//         .map((e: any) => e.subject?.id)
//         .filter(Boolean),
//       followers: followerEntries
//         .map((e: any) => e.follower?.id)
//         .filter(Boolean),
//       closeFriends: closeFriendsEntries
//         .map((e: any) => e.subject?.id)
//         .filter(Boolean),
//       blocked: blockedEntries
//         .map((e: any) => e.blocked_user?.id)
//         .filter(Boolean),
//       hidden: hiddenEntries.map((e: any) => e.target?.id).filter(Boolean),
//     };
//   },
//   async getUserAccessFlags(currentUserId: number, targetUserId: number) {
//     const isOwner =
//       currentUserId && currentUserId.toString() === targetUserId.toString();
//     let isFollowing = false;
//     let isCloseFriend = false;

//     if (currentUserId && !isOwner) {
//       const [followCount, closeFriendCount] = await Promise.all([
//         strapi.entityService.count("api::following.following", {
//           filters: {
//             follower: { id: currentUserId },
//             subject: { id: targetUserId },
//           },
//         }),
//         strapi.entityService.count("api::following.following", {
//           filters: {
//             follower: { id: targetUserId },
//             subject: { id: currentUserId },
//             is_close_friend: true,
//           },
//         }),
//       ]);
//       isFollowing = followCount > 0;
//       isCloseFriend = closeFriendCount > 0;
//     }

//     const canViewProfile = isOwner || isFollowing;
//     return {
//       isOwner,
//       isFollowing,
//       isCloseFriend,
//       canViewProfile,
//     };
//   },
//   async fetchUserPosts(targetUserId: number) {
//     return strapi.entityService.findMany("api::post.post", {
//       filters: { posted_by: { id: targetUserId }, post_type: "post" },
//       sort: { createdAt: "desc" },
//       populate: {
//         media: true,
//         repost_of: true,
//         category: true,
//         posted_by: {
//           fields: ["id", "username", "name", "avatar_ring_color"],
//           populate: { profile_picture: true },
//         },
//         tagged_users: {
//           fields: ["id", "username", "name", "avatar_ring_color"],
//           populate: { profile_picture: true },
//         },
//       },
//     });
//   },

//   async enrichRepostsAndStats(
//     posts: Post[],
//     currentUserId: string | number
//   ): Promise<Post[]> {
//     const withReposts = await this.populateRepostData(posts, currentUserId);
//     await this.enrichPostsWithStats(withReposts, currentUserId);
//     const originalIds = withReposts
//       .filter((p) => p.repost_of && p.repost_of.id)
//       .map((p) => p.repost_of.id)
//       .filter(
//         (id): id is string | number =>
//           typeof id === "string" || typeof id === "number"
//       );
//     if (originalIds.length) {
//       const uniqueIds: (string | number)[] = Array.from(new Set(originalIds));
//       const originals = await strapi.entityService.findMany("api::post.post", {
//         filters: { id: { $in: uniqueIds } },
//         fields: ["id"],
//       });
//       await this.enrichPostsWithStats(originals, currentUserId);
//       const statsMap = new Map<string | number, PostStats>(
//         originals.map((o) => [o.id, o as PostStats])
//       );
//       for (const post of withReposts) {
//         if (post.repost_of && statsMap.has(post.repost_of.id)) {
//           const stats = statsMap.get(post.repost_of.id)!;
//           post.original_stats = {
//             likes_count: stats.likes_count ?? 0,
//             comments_count: stats.comments_count ?? 0,
//             share_count: stats.share_count ?? 0,
//             is_liked: !!stats.is_liked,
//             is_disliked: !!stats.is_disliked,
//             dislikes_count: stats.dislikes_count ?? 0,
//           };
//         }
//       }
//     }
//     return withReposts;
//   },

//   async mapSubcategoriesToPosts(posts: any[]) {
//     const categoryIds = [
//       ...new Set(
//         posts
//           .map((p) => p.category?.id)
//           .filter(
//             (id): id is string | number =>
//               typeof id === "string" || typeof id === "number"
//           )
//       ),
//     ];
//     if (!categoryIds.length) return new Map();
//     const allSubcats = await strapi.entityService.findMany(
//       "api::subcategory.subcategory",
//       {
//         filters: { category: { id: { $in: categoryIds } } },
//         populate: { category: true },
//         pagination: { limit: -1 },
//       }
//     );
//     const map = new Map();
//     for (const sub of allSubcats) {
//       const catId = (sub as any).category?.id;
//       if (!catId) continue;
//       if (!map.has(catId)) map.set(catId, []);
//       map.get(catId).push(sub);
//     }
//     return map;
//   },
//   mapFinalPosts(posts, subMap, optimizedMediaMap, followStatusMap) {
//     return posts
//       .map((post) => {
//         if (!post) {
//           console.error("mapFinalPosts: skipping null post", post);
//           return null;
//         }

//         const postCategoryId = post.category?.id ?? null;

//         if (!post.posted_by || !post.posted_by.id) {
//           console.warn(
//             `mapFinalPosts: post ${post.id} missing posted_by or posted_by.id`
//           );
//           post.posted_by = post.posted_by || { id: null };
//         }

//         return {
//           ...post,
//           subcategories:
//             postCategoryId && subMap.has(postCategoryId)
//               ? subMap.get(postCategoryId)
//               : [],
//           is_repost: !!post.repost_of,
//           media: (post.media || []).map((m) =>
//             m && m.id ? optimizedMediaMap.get(m.id) || m : m
//           ),
//           posted_by: {
//             ...post.posted_by,
//             ...(post.posted_by && post.posted_by.id
//               ? followStatusMap.get(post.posted_by.id)
//               : {}),
//           },

//           // Remove tagged_users mapping:
//           tagged_users: (post.tagged_users || [])
//             .filter((u) => u && u.id)
//             .map((user) => ({
//               ...user,
//               ...(user && user.id ? followStatusMap.get(user.id) : {}),
//             })),

//           // New mentioned_users mapping (hydrate nested user with follow status):
//           mentioned_users: (post.mentioned_users || []).map((mention) => ({
//             ...mention,
//             user: {
//               ...mention.user,
//               ...(mention.user && mention.user.id
//                 ? followStatusMap.get(mention.user.id)
//                 : {}),
//             },
//           })),
//         };
//       })
//       .filter(Boolean);
//   },
//   async enrichMediaAndFollowStatus(posts, currentUserId) {
//     const usersToProcess = posts
//       .flatMap((p) => [p.posted_by, ...(p.tagged_users || [])])
//       .filter(Boolean);
//     const allUserIds = [...new Set(usersToProcess.map((u) => u.id))];
//     const allMedia = posts.flatMap((p) => p.media || []).filter(Boolean);
//     const [optimizedMediaArray, followStatusMap] = await Promise.all([
//       this.getOptimisedFileData(allMedia),
//       strapi
//         .service("api::following.following")
//         .getFollowStatusForUsers(currentUserId, allUserIds),
//       this.enrichUsersWithOptimizedProfilePictures(usersToProcess),
//     ]);
//     const optimizedMediaMap = new Map(
//       (optimizedMediaArray || []).map((m) => [m.id, m])
//     );
//     return { optimizedMediaMap, followStatusMap };
//   },
//   async enrichUsersWithOptimizedProfilePictures(users: any[]) {
//     if (!users?.length) return;
//     for (const user of users) {
//       if (user?.profile_picture?.id) {
//         const optimizedPictures = await this.getOptimisedFileData([
//           user.profile_picture,
//         ]);
//         user.profile_picture = optimizedPictures[0] || null;
//       } else if (user) user.profile_picture = null;
//     }
//   },
//   /**
//    * ========================
//    * Get Users with Stories
//    * ========================
//    */
//   async getUsersWithStories(userIds) {
//     if (!userIds || !userIds.length) return new Set();

//     const stories = await strapi.entityService.findMany("api::post.post", {
//       filters: {
//         posted_by: { id: { $in: userIds } },
//         post_type: "story",
//         createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
//       },
//       fields: ["id"],
//       populate: { posted_by: { fields: ["id"] } },
//     });

//     return new Set(stories.map((s: any) => s.posted_by?.id).filter(Boolean));
//   },
//   async preparePosts(
//     posts: any[],
//     currentUserId: number,
//     opts: { includeStories?: boolean } = {}
//   ) {
//     if (!posts || posts.length === 0) return [];

//     const mentionService = strapi.service("api::mention-policy.mention-policy");

//     // 1. Enrich mentions on each post (both component and text-based)
//     for (const post of posts) {
//       // Extract mentions from title + description
//       const combinedText = `${post.title || ""} ${post.description || ""}`;
//       const textMentions = await mentionService.mentionUser(
//         currentUserId,
//         combinedText,
//         "post"
//       );

//       const componentMentions = Array.isArray(post.mentioned_users)
//         ? post.mentioned_users
//         : [];

//       // Avoid duplicates
//       const componentUsernames = new Set(
//         componentMentions.map((m) => m.username)
//       );
//       const filteredTextMentions = textMentions.filter(
//         (m) => !componentUsernames.has(m.username)
//       );

//       // Helper to enrich with is_allowed
//       const enrichMentions = async (mentions: any[]) => {
//         const enriched: any[] = [];
//         for (const mention of mentions) {
//           const policy = mention.policy || mention.comment_policy || "any";
//           const mentionedId = mention.user?.id || mention.user;
//           const allowed = await mentionService.isMentionAllowed(
//             currentUserId,
//             mentionedId,
//             policy
//           );
//           enriched.push({
//             ...mention,
//             is_allowed: allowed,
//           });
//         }
//         return enriched;
//       };

//       post.mentioned_users = await enrichMentions(componentMentions);
//       post.mentioned_users_in_content =
//         await enrichMentions(filteredTextMentions);
//     }

//     // Existing enrichment pipeline, fix destructor names below:
//     let enrichedPosts = await this.enrichRepostsAndStats(posts, currentUserId);
//     const categoryMap = await this.mapSubcategoriesToPosts(enrichedPosts);
//     const { optimizedMediaMap, followStatusMap } =
//       await this.enrichMediaAndFollowStatus(enrichedPosts, currentUserId);

//     enrichedPosts = this.mapFinalPosts(
//       enrichedPosts,
//       categoryMap,
//       optimizedMediaMap,
//       followStatusMap
//     );

//     if (opts.includeStories) {
//       const authorIds = enrichedPosts
//         .map((p) => p.posted_by?.id)
//         .filter(Boolean);
//       const usersWithStories = await this.getUsersWithStories(authorIds);
//       enrichedPosts = enrichedPosts.map((post) => ({
//         ...post,
//         posted_by: {
//           ...post.posted_by,
//           has_stories: usersWithStories.has(post.posted_by?.id),
//         },
//       }));
//     }

//     return enrichedPosts;
//   },
//   async getUserRelationsData(userId: number) {
//     if (!userId)
//       return {
//         blockList: [],
//         followingList: [],
//         closeFriendList: [],
//       };

//     const [blockedEntries, followingEntries, closeFriendsEntries] =
//       await Promise.all([
//         strapi.entityService.findMany("api::block.block", {
//           filters: { blocked_by: { id: userId } },
//           populate: { blocked_user: { fields: ["id"] } },
//         }),
//         strapi.entityService.findMany("api::following.following", {
//           filters: { follower: { id: userId } },
//           populate: { subject: { fields: ["id"] } },
//         }),
//         strapi.entityService.findMany("api::following.following", {
//           filters: { subject: { id: userId }, is_close_friend: true },
//           populate: { follower: { fields: ["id"] } },
//         }),
//       ]);

//     const blockList = blockedEntries
//       .map((e: any) => e.blocked_user?.id)
//       .filter(Boolean);
//     const followingList = followingEntries
//       .map((e: any) => e.subject?.id)
//       .filter(Boolean);
//     const closeFriendList = closeFriendsEntries
//       .map((e: any) => e.follower?.id)
//       .filter(Boolean);

//     return { blockList, followingList, closeFriendList };
//   },
//   async getPost(postId: number | string) {
//     return await strapi.entityService.findOne("api::post.post", postId, {
//       populate: {
//         posted_by: {
//           fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
//           populate: { profile_picture: true },
//         },
//         tagged_users: {
//           fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
//           populate: { profile_picture: true },
//         },
//         category: {
//           fields: ["id", "name"],
//         },
//         location: true,
//         media: true,
//         viewers: {
//           fields: ["id", "username", "name"],
//           populate: { profile_picture: true },
//         },
//         repost_of: {
//           populate: {
//             posted_by: {
//               fields: [
//                 "id",
//                 "username",
//                 "name",
//                 "avatar_ring_color",
//                 "is_public",
//               ],
//               populate: { profile_picture: true },
//             },
//             category: { fields: ["id", "name"] },
//             media: true,
//             location: true,
//             tagged_users: {
//               fields: [
//                 "id",
//                 "username",
//                 "name",
//                 "avatar_ring_color",
//                 "is_public",
//               ],
//               populate: { profile_picture: true },
//             },
//             mentioned_users: {
//               populate: {
//                 user: {
//                   fields: [
//                     "id",
//                     "username",
//                     "name",
//                     "avatar_ring_color",
//                     "is_public",
//                   ],
//                   populate: { profile_picture: true },
//                 },
//               },
//             },
//           },
//         },
//         reposted_from: {
//           fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
//           populate: { profile_picture: true },
//         },
//         share_with_close_friends: {
//           fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
//           populate: { profile_picture: true },
//         },
//         mentioned_users: {
//           populate: {
//             user: {
//               fields: [
//                 "id",
//                 "username",
//                 "name",
//                 "avatar_ring_color",
//                 "is_public",
//               ],
//               populate: { profile_picture: true },
//             },
//           },
//         },
//         tags: true,
//       },
//     });
//   },
// }));
import { factories } from "@strapi/strapi";
import FileOptimisationService from "../../../utils/file_optimisation_service";
import NotificationService from "../../../utils/notification_service";
type Post = Record<string, any>;
interface PostStats {
  id: string | number;
  likes_count?: number;
  is_liked?: boolean;
  dislikes_count?: number;
  is_disliked?: boolean;
  comments_count?: number;
  share_count?: number;
}
export default factories.createCoreService("api::post.post", ({ strapi }) => ({
  async getOptimisedFileData(media = []) {
    const finalMedia = [];
    for (const file of media) {
      const findImage = await strapi.entityService.findMany(
        "api::file-optimisation.file-optimisation",
        {
          filters: { media: { id: file.id } },
        }
      );
      if (findImage.length > 0) {
        const fileData = findImage[0];
        finalMedia.push({
          id: file.id,
          url: file.url,
          mime: file.mime,
          thumbnail_url: fileData?.thumbnail_url
            ? await new FileOptimisationService().getSignedUrl(
                fileData.thumbnail_url
              )
            : null,
          compressed_url: fileData?.compressed_url
            ? (
                await new FileOptimisationService().getSignedUrl(
                  fileData.compressed_url
                )
              ).split("?")[0]
            : null,
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

  async getUserRelations(userId: number) {
    if (!userId)
      return {
        following: [],
        followers: [],
        closeFriends: [],
        blocked: [],
        hidden: [],
      };
    const [
      followingEntries,
      followerEntries,
      closeFriendsEntries,
      blockedEntries,
      hiddenEntries,
    ] = await Promise.all([
      strapi.entityService.findMany("api::following.following", {
        filters: { follower: { id: userId } },
        populate: { subject: true },
      }),
      strapi.entityService.findMany("api::following.following", {
        filters: { subject: { id: userId } },
        populate: { follower: true },
      }),
      strapi.entityService.findMany("api::following.following", {
        filters: { follower: { id: userId }, is_close_friend: true },
        populate: { subject: true },
      }),
      strapi.entityService.findMany("api::block.block", {
        filters: { blocked_by: { id: userId } },
        populate: { blocked_user: true },
      }),
      strapi.entityService.findMany("api::hide-story.hide-story", {
        filters: { owner: { id: userId } },
        populate: { target: true },
      }),
    ]);
    return {
      following: followingEntries
        .map((e: any) => e.subject?.id)
        .filter(Boolean),
      followers: followerEntries
        .map((e: any) => e.follower?.id)
        .filter(Boolean),
      closeFriends: closeFriendsEntries
        .map((e: any) => e.subject?.id)
        .filter(Boolean),
      blocked: blockedEntries
        .map((e: any) => e.blocked_user?.id)
        .filter(Boolean),
      hidden: hiddenEntries.map((e: any) => e.target?.id).filter(Boolean),
    };
  },

  async enrichPosts(posts, currentUserId, opts = {}) {
    if (!Array.isArray(posts)) posts = [posts];
    for (const post of posts) {
      let statId = post.id;
      if (post.repost_of) {
        const orig = await this.resolveOriginalPost(
          post.repost_of.id || post.repost_of
        );
        if (orig) {
          statId = orig.id;
          post.is_repost = true;
          post.repost_of = orig;
          post.reposted_from = (orig as any).posted_by || null;
        }
        console.log("ORID ID ", statId, orig.id);
      }
      const [
        likes_count,
        is_liked,
        dislikes_count,
        is_disliked,
        comments_count,
        share_count,
      ] = await Promise.all([
        strapi.services["api::like.like"].getLikesCount(statId),
        strapi.services["api::like.like"].verifyPostLikeByUser(
          statId,
          currentUserId
        ),
        strapi.service("api::dislike.dislike").getDislikesCountByPostId(statId),
        strapi
          .service("api::dislike.dislike")
          .verifyPostDislikedByUser(statId, currentUserId),
        strapi.services["api::comment.comment"].getCommentsCount(statId),
        strapi.services["api::share.share"].countShares(statId),
      ]);
      Object.assign(post, {
        likes_count,
        is_liked,
        dislikes_count,
        is_disliked,
        comments_count,
        share_count,
      });
      // Optimized media
      post.media = await this.getOptimisedFileData(post.media);
    }
    // Stories flag (optional)
    if ((opts as any).includeStories) {
      const authorIds = posts.map((p) => p.posted_by?.id).filter(Boolean);
      const storySet = await this.getUsersWithStories(authorIds);
      for (const post of posts) {
        if (post.posted_by && post.posted_by.id) {
          post.posted_by.has_stories = storySet.has(post.posted_by.id);
        }
      }
    }
    return posts;
  },

  async resolveOriginalPost(postId: number) {
    if (!postId) return null;
    let currentId = postId;
    let visited = new Set<number>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const post = await strapi.entityService.findOne(
        "api::post.post",
        currentId,
        {
          populate: {
            repost_of: { fields: ["id"] },
            posted_by: { fields: ["id", "username", "name"] },
            media: { fields: ["id", "url", "mime"] },
            category: true,
            tagged_users: true,
          },
        }
      );
      if (!post) return null;
      if (!(post as any).repost_of) return post;
      currentId = (post as any).repost_of.id;
    }
    return null;
  },
  async getUsersWithStories(userIds: number[]) {
    if (!userIds || !userIds.length) return new Set();
    const stories = await strapi.entityService.findMany("api::post.post", {
      filters: {
        posted_by: { id: { $in: userIds } },
        post_type: "story",
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      fields: ["id"],
      populate: { posted_by: { fields: ["id"] } },
    });
    return new Set(stories.map((s: any) => s.posted_by?.id).filter(Boolean));
  },

  async getFeedPosts(
    userId: number,
    pagination: { page: number; pageSize: number },
    blockList: number[],
    followingList: number[],
    closeFriendList: number[]
  ) {
    const filters: any = {
      post_type: "post",
      posted_by: { id: { $notIn: blockList.length ? blockList : [-1] } },
      $or: [
        { share_with: "PUBLIC" },
        {
          $and: [
            { share_with: "FOLLOWERS" },
            {
              posted_by: {
                id: { $in: followingList.length ? followingList : [-1] },
              },
            },
          ],
        },
        {
          $and: [
            { share_with: "CLOSE-FRIENDS" },
            {
              posted_by: {
                id: { $in: closeFriendList.length ? closeFriendList : [-1] },
              },
            },
          ],
        },
        { posted_by: { id: userId } },
      ],
    };

    const [posts, total] = await Promise.all([
      strapi.entityService.findMany("api::post.post", {
        filters,
        sort: { createdAt: "desc" },
        populate: this.getPopulate() as any,
        start: (pagination.page - 1) * pagination.pageSize,
        limit: pagination.pageSize,
      }),
      strapi.entityService.count("api::post.post", { filters }),
    ]);

    return { posts, total };
  },

  async fetchUserPosts(targetUserId: number) {
    return await strapi.entityService.findMany("api::post.post", {
      filters: {
        posted_by: { id: targetUserId },
        post_type: "post",
      },
      sort: { createdAt: "desc" },
      populate: this.getPopulate() as any,
    });
  },

  getPopulate() {
    return {
      posted_by: {
        fields: ["id", "username", "name", "avatar_ring_color"],
        populate: { profile_picture: true },
      },
      category: true,
      tagged_users: {
        fields: ["id", "username", "name", "avatar_ring_color"],
        populate: { profile_picture: true },
      },
      media: true,
      repost_of: {
        populate: {
          posted_by: true,
          media: true,
          category: true,
          tagged_users: true,
        },
      },
    };
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
        let statId = post.id;
        if (post.repost_of) {
          const orig = await this.resolveOriginalPost(
            post.repost_of.id || post.repost_of
          );
          if (orig) {
            statId = orig.id;
            post.is_repost = true;
            post.repost_of = orig;
            post.reposted_from = (orig as any).posted_by || null;
          }
          console.log("ORID ID ", statId, orig.id);
        }
        const [
          likes_count,
          is_liked,
          dislikes_count,
          is_disliked,
          comments_count,
          share_count,
        ] = await Promise.all([
          strapi.services["api::like.like"].getLikesCount(statId),
          strapi.services["api::like.like"].verifyPostLikeByUser(
            statId,
            currentUserId
          ),
          strapi
            .service("api::dislike.dislike")
            .getDislikesCountByPostId(statId),
          strapi
            .service("api::dislike.dislike")
            .verifyPostDislikedByUser(statId, currentUserId),
          strapi.services["api::comment.comment"].getCommentsCount(statId),
          strapi.services["api::share.share"].countShares(statId),
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
      .filter((post) => post.repost_of)
      .map((post) =>
        typeof post.repost_of === "object" ? post.repost_of.id : post.repost_of
      );

    const originals = await strapi.entityService.findMany("api::post.post", {
      filters: { id: { $in: repostIds } },
      populate: {
        category: true,
        media: true,
        posted_by: true,
        mentioned_users: true,
      },
    });

    await this.enrichPostsWithStats(originals, currentUserId);

    const originalsMap = new Map(originals.map((orig) => [orig.id, orig]));

    return Promise.all(
      posts.map(async (post) => {
        if (!post.repost_of) return post;

        const repostId =
          typeof post.repost_of === "object"
            ? post.repost_of.id
            : post.repost_of;
        const original = originalsMap.get(repostId) as any;

        if (original) {
          post.is_repost = true;

          const keysToSkip = new Set([
            "id",
            "documentId",
            "createdAt",
            "updatedAt",
            "publishedAt",
            "posted_by",
            "repost_of",
            "reposted_from",
            "repost_caption",
          ]);

          Object.keys(original).forEach((key) => {
            if (!keysToSkip.has(key)) post[key] = original[key];
          });

          post.repost_of = original as any;
          post.reposted_from = original.posted_by || null;
        }
        return post;
      })
    );
  },
  async validateTaggedUsers(taggedUserIds, currentUserId) {
    if (!Array.isArray(taggedUserIds) || !taggedUserIds.length) return;

    if (taggedUserIds.includes(currentUserId)) {
      throw new Error("You cannot tag yourself in a post.");
    }

    const users = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: { id: { $in: taggedUserIds } },
        fields: ["id"],
      }
    );

    if (users.length !== taggedUserIds.length) {
      const foundIds = users.map((u) => u.id);
      const invalidIds = taggedUserIds.filter((id) => !foundIds.includes(id));
      throw new Error(`Invalid tagged user IDs: ${invalidIds.join(", ")}`);
    }
  },

  async validateMediaFiles(mediaIds) {
    if (!Array.isArray(mediaIds) || !mediaIds.length) return;

    for (let file_id of mediaIds) {
      const fileData = await strapi.entityService.findOne(
        "plugin::upload.file",
        file_id
      );
      if (!fileData)
        throw new Error(`Media with ID ${file_id} does not exist.`);
    }
  },

  async validateCategory(categoryId) {
    if (!categoryId) return;

    const exists = await strapi.entityService.findOne(
      "api::category.category",
      categoryId
    );
    if (!exists)
      throw new Error(`Category with ID ${categoryId} does not exist.`);
  },

  async validateCloseFriendsList(shareWith, closeFriendsList, currentUserId) {
    const allowedShareWithOptions = ["PUBLIC", "FOLLOWERS", "CLOSE-FRIENDS"];
    if (shareWith && !allowedShareWithOptions.includes(shareWith)) {
      throw new Error(
        `Invalid share_with value. Allowed: ${allowedShareWithOptions.join(", ")}`
      );
    }

    if (shareWith === "CLOSE-FRIENDS") {
      if (!Array.isArray(closeFriendsList) || !closeFriendsList.length) {
        throw new Error(
          "For 'CLOSE-FRIENDS', you must provide a non-empty list of friends."
        );
      }

      const found = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: { id: { $in: closeFriendsList } },
          fields: ["id"],
        }
      );

      if (found.length !== closeFriendsList.length) {
        const foundIds = found.map((u) => u.id);
        const invalidIds = closeFriendsList.filter(
          (id) => !foundIds.includes(id)
        );
        throw new Error(`Invalid close friends: ${invalidIds.join(", ")}`);
      }

      if (closeFriendsList.includes(currentUserId)) {
        throw new Error(
          "You cannot include yourself in the close friends list."
        );
      }
    } else {
      if (Array.isArray(closeFriendsList) && closeFriendsList.length > 0) {
        throw new Error(
          "'share_with_close_friends' should only be provided when share_with is 'CLOSE-FRIENDS'."
        );
      }
    }
  },

  async notifyMentionsInPost(mentionedUserIds, actorUser, postId, postType) {
    if (!Array.isArray(mentionedUserIds) || !mentionedUserIds.length) return;

    for (const userId of mentionedUserIds) {
      const notifMsg = `${actorUser.username} mentioned you in a ${postType === "story" ? "story" : "post"}.`;
      const notificationService = new NotificationService();
      await notificationService.saveNotification(
        "mention",
        actorUser.id,
        userId,
        notifMsg,
        { post: postId }
      );

      const recipient = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
        {
          fields: ["fcm_token"],
        }
      );

      if (recipient && recipient.fcm_token) {
        await notificationService.sendPushNotification(
          "New Mention",
          notifMsg,
          { type: "mention", postId: postId.toString() },
          recipient.fcm_token
        );
      }
    }
  },

  async verifyPostOwnership(postId, userId) {
    const posts = await strapi.entityService.findMany("api::post.post", {
      filters: { id: postId, posted_by: userId },
      limit: 1,
    });
    if (!posts.length)
      throw new Error(
        "You are not allowed to modify this post, or it does not exist."
      );
  },

  async getUserAccessFlags(currentUserId: number, targetUserId: number) {
    const isOwner =
      currentUserId && currentUserId.toString() === targetUserId.toString();
    let isFollowing = false;
    let isCloseFriend = false;

    if (currentUserId && !isOwner) {
      const [followCount, closeFriendCount] = await Promise.all([
        strapi.entityService.count("api::following.following", {
          filters: {
            follower: { id: currentUserId },
            subject: { id: targetUserId },
          },
        }),
        strapi.entityService.count("api::following.following", {
          filters: {
            follower: { id: targetUserId },
            subject: { id: currentUserId },
            is_close_friend: true,
          },
        }),
      ]);
      isFollowing = followCount > 0;
      isCloseFriend = closeFriendCount > 0;
    }

    const canViewProfile = isOwner || isFollowing;
    return {
      isOwner,
      isFollowing,
      isCloseFriend,
      canViewProfile,
    };
  },

  async getPost(postId: number | string) {
    return await strapi.entityService.findOne("api::post.post", postId, {
      populate: {
        posted_by: {
          fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
          populate: { profile_picture: true },
        },
        tagged_users: {
          fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
          populate: { profile_picture: true },
        },
        category: {
          fields: ["id", "name"],
        },
        location: true,
        media: true,
        viewers: {
          fields: ["id", "username", "name"],
          populate: { profile_picture: true },
        },
        repost_of: {
          populate: {
            posted_by: {
              fields: [
                "id",
                "username",
                "name",
                "avatar_ring_color",
                "is_public",
              ],
              populate: { profile_picture: true },
            },
            category: { fields: ["id", "name"] },
            media: true,
            location: true,
            tagged_users: {
              fields: [
                "id",
                "username",
                "name",
                "avatar_ring_color",
                "is_public",
              ],
              populate: { profile_picture: true },
            },
            mentioned_users: {
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
              },
            },
          },
        },
        reposted_from: {
          fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
          populate: { profile_picture: true },
        },
        share_with_close_friends: {
          fields: ["id", "username", "name", "avatar_ring_color", "is_public"],
          populate: { profile_picture: true },
        },
        mentioned_users: {
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
          },
        },
        tags: true,
      },
    });
  },

  async preparePosts(
    posts: any[],
    currentUserId: number,
    opts: { includeStories?: boolean } = {}
  ) {
    if (!posts || posts.length === 0) return [];

    const mentionService = strapi.service("api::mention-policy.mention-policy");

    for (const post of posts) {
      const combinedText = `${post.title || ""} ${post.description || ""}`;
      const textMentions = await mentionService.mentionUser(
        currentUserId,
        combinedText,
        "post"
      );

      const componentMentions = Array.isArray(post.mentioned_users)
        ? post.mentioned_users
        : [];

      const componentUsernames = new Set(
        componentMentions.map((m) => m.username)
      );
      const filteredTextMentions = textMentions.filter(
        (m) => !componentUsernames.has(m.username)
      );

      // Helper to enrich with is_allowed
      const enrichMentions = async (mentions: any[]) => {
        const enriched: any[] = [];
        for (const mention of mentions) {
          const policy = mention.policy || mention.comment_policy || "any";
          const mentionedId = mention.user?.id || mention.user;
          const allowed = await mentionService.isMentionAllowed(
            currentUserId,
            mentionedId,
            policy
          );
          enriched.push({
            ...mention,
            is_allowed: allowed,
          });
        }
        return enriched;
      };

      post.mentioned_users = await enrichMentions(componentMentions);
      post.mentioned_users_in_content =
        await enrichMentions(filteredTextMentions);
    }

    let enrichedPosts = await this.enrichRepostsAndStats(posts, currentUserId);
    const categoryMap = await this.mapSubcategoriesToPosts(enrichedPosts);
    const { optimizedMediaMap, followStatusMap } =
      await this.enrichMediaAndFollowStatus(enrichedPosts, currentUserId);

    enrichedPosts = this.mapFinalPosts(
      enrichedPosts,
      categoryMap,
      optimizedMediaMap,
      followStatusMap
    );

    if (opts.includeStories) {
      const authorIds = enrichedPosts
        .map((p) => p.posted_by?.id)
        .filter(Boolean);
      const usersWithStories = await this.getUsersWithStories(authorIds);
      enrichedPosts = enrichedPosts.map((post) => ({
        ...post,
        posted_by: {
          ...post.posted_by,
          has_stories: usersWithStories.has(post.posted_by?.id),
        },
      }));
    }

    return enrichedPosts;
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
  mapFinalPosts(posts, subMap, optimizedMediaMap, followStatusMap) {
    return posts
      .map((post) => {
        if (!post) {
          console.error("mapFinalPosts: skipping null post", post);
          return null;
        }

        const postCategoryId = post.category?.id ?? null;

        if (!post.posted_by || !post.posted_by.id) {
          console.warn(
            `mapFinalPosts: post ${post.id} missing posted_by or posted_by.id`
          );
          post.posted_by = post.posted_by || { id: null };
        }

        return {
          ...post,
          subcategories:
            postCategoryId && subMap.has(postCategoryId)
              ? subMap.get(postCategoryId)
              : [],
          is_repost: !!post.repost_of,
          media: (post.media || []).map((m) =>
            m && m.id ? optimizedMediaMap.get(m.id) || m : m
          ),
          posted_by: {
            ...post.posted_by,
            ...(post.posted_by && post.posted_by.id
              ? followStatusMap.get(post.posted_by.id)
              : {}),
          },

          // Remove tagged_users mapping:
          tagged_users: (post.tagged_users || [])
            .filter((u) => u && u.id)
            .map((user) => ({
              ...user,
              ...(user && user.id ? followStatusMap.get(user.id) : {}),
            })),

          // New mentioned_users mapping (hydrate nested user with follow status):
          mentioned_users: (post.mentioned_users || []).map((mention) => ({
            ...mention,
            user: {
              ...mention.user,
              ...(mention.user && mention.user.id
                ? followStatusMap.get(mention.user.id)
                : {}),
            },
          })),
        };
      })
      .filter(Boolean);
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

  async getUserRelationsData(userId: number) {
    if (!userId)
      return {
        blockList: [],
        followingList: [],
        closeFriendList: [],
      };

    const [blockedEntries, followingEntries, closeFriendsEntries] =
      await Promise.all([
        strapi.entityService.findMany("api::block.block", {
          filters: { blocked_by: { id: userId } },
          populate: { blocked_user: { fields: ["id"] } },
        }),
        strapi.entityService.findMany("api::following.following", {
          filters: { follower: { id: userId } },
          populate: { subject: { fields: ["id"] } },
        }),
        strapi.entityService.findMany("api::following.following", {
          filters: { subject: { id: userId }, is_close_friend: true },
          populate: { follower: { fields: ["id"] } },
        }),
      ]);

    const blockList = blockedEntries
      .map((e: any) => e.blocked_user?.id)
      .filter(Boolean);
    const followingList = followingEntries
      .map((e: any) => e.subject?.id)
      .filter(Boolean);
    const closeFriendList = closeFriendsEntries
      .map((e: any) => e.follower?.id)
      .filter(Boolean);

    return { blockList, followingList, closeFriendList };
  },

  async prepareSinglePostForResponse(postEntity, currentUserId) {
    let enriched = await strapi
      .service("api::post.post")
      .enrichRepostsAndStats([postEntity], currentUserId);
    postEntity = enriched[0];

    const { optimizedMediaMap, followStatusMap } = await strapi
      .service("api::post.post")
      .enrichMediaAndFollowStatus([postEntity], currentUserId);

    postEntity.media = (postEntity.media || []).map(
      (m) => optimizedMediaMap.get(m.id) || m
    );

    postEntity.posted_by = {
      ...postEntity.posted_by,
      ...followStatusMap.get(postEntity.posted_by.id),
    };

    postEntity.tagged_users = (postEntity.tagged_users || [])
      .filter((u) => u && u.id)
      .map((user) => ({
        ...user,
        ...(user && user.id ? followStatusMap.get(user.id) : {}),
      }));

    postEntity.mentioned_users = (postEntity.mentioned_users || []).map(
      (mention) => ({
        ...mention,
        user: {
          ...mention.user,
          ...followStatusMap.get(mention.user?.id),
        },
      })
    );

    // delete postEntity.tagged_users;

    return postEntity;
  },

  async getUserRelationsAndBlocks(userId: number) {
    if (!userId)
      return {
        following: [],
        followers: [],
        closeFriends: [],
        blocked: [],
        hidden: [],
      };

    const [
      followingEntries,
      followerEntries,
      closeFriendsEntries,
      blockedEntries,
      hiddenEntries,
    ] = await Promise.all([
      strapi.entityService.findMany("api::following.following", {
        filters: { follower: { id: userId } },
        populate: { subject: true },
      }),
      strapi.entityService.findMany("api::following.following", {
        filters: { subject: { id: userId } },
        populate: { follower: true },
      }),
      strapi.entityService.findMany("api::following.following", {
        filters: { follower: { id: userId }, is_close_friend: true },
        populate: { subject: true },
      }),
      strapi.entityService.findMany("api::block.block", {
        filters: { blocked_by: { id: userId } },
        populate: { blocked_user: true },
      }),
      strapi.entityService.findMany("api::hide-story.hide-story", {
        filters: { owner: { id: userId } },
        populate: { target: true },
      }),
    ]);

    return {
      following: followingEntries
        .map((e: any) => e.subject?.id)
        .filter(Boolean),
      followers: followerEntries
        .map((e: any) => e.follower?.id)
        .filter(Boolean),
      closeFriends: closeFriendsEntries
        .map((e: any) => e.subject?.id)
        .filter(Boolean),
      blocked: blockedEntries
        .map((e: any) => e.blocked_user?.id)
        .filter(Boolean),
      hidden: hiddenEntries.map((e: any) => e.target?.id).filter(Boolean),
    };
  },

  async enrichStories(stories, currentUserId) {
    if (!stories.length) return;

    const usersToProcess = stories
      .flatMap((story) => [story.posted_by, ...(story.tagged_users || [])])
      .filter(Boolean);

    await Promise.all([
      strapi.service("api::following.following").enrichItemsWithFollowStatus({
        items: stories,
        userPaths: ["posted_by", "tagged_users"],
        currentUserId,
      }),
      strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures(usersToProcess),
    ]);

    await Promise.all(
      stories.map(async (story) => {
        const [likes_count, is_liked, viewers_count, optimizedMedia] =
          await Promise.all([
            strapi.service("api::like.like").getLikesCount(story.id),
            strapi
              .service("api::like.like")
              .verifyPostLikeByUser(story.id, currentUserId),
            strapi.service("api::post.post").getStoryViewersCount(story.id),
            strapi.service("api::post.post").getOptimisedFileData(story.media),
          ]);
        story.expiration_time =
          new Date(story.createdAt).getTime() + 24 * 60 * 60 * 1000;
        story.likes_count = likes_count;
        story.is_liked = is_liked;
        story.viewers_count = viewers_count;
        story.media = optimizedMedia || [];
      })
    );
  },
}));
