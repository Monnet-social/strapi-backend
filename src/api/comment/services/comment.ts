/**
 * comment service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::comment.comment",
  ({ strapi }) => ({
    getCommentsCount: (postId: number): Promise<number> =>
      strapi.entityService.count("api::comment.comment", {
        filters: { post: { id: postId } },
      }),

    async getCommentsByPostId(postId: number): Promise<any[]> {
      const topLevelComments = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: {
            post: { id: postId },
            parent_comment: { id: { $null: true } },
          },
          populate: {
            commented_by: {
              fields: ["id", "username", "name", "avatar_ring_color"],
              populate: { profile_picture: true },
            },
            mentioned_users: {
              populate: {
                user: {
                  fields: ["id", "username", "name", "avatar_ring_color"],
                  populate: { profile_picture: true },
                },
              },
            },
          },
        }
      );

      if (topLevelComments.length === 0) return [];

      const finalComments = await Promise.all(
        topLevelComments.map(async (comment: any) => {
          const repliesCount = await strapi.entityService.count(
            "api::comment.comment",
            { filters: { parent_comment: { id: comment.id } } }
          );

          const likesCount = await strapi.entityService.count(
            "api::like.like",
            { filters: { comment: { id: comment.id } } }
          );
          let finalList = [];
          for (let i = 0; i < comment?.mentioned_users?.length; i++) {
            const status = comment.mentioned_users[i].mention_status;
            if (status) {
              finalList.push(comment.mentioned_users[i]);
            }
          }
          comment.mentioned_users = finalList;

          return {
            ...comment,
            replies_count: repliesCount,
            likes_count: likesCount,
          };
        })
      );

      return finalComments;
    },

    getCommentLikesCount: (commentId: number): Promise<number> =>
      strapi.entityService.count("api::like.like", {
        filters: { comment: { id: commentId } },
      }),

    async getTotalLikesOnCommentsByPostId(postId: number): Promise<number> {
      const commentsOnPost = await strapi.entityService.findMany(
        "api::comment.comment",
        { filters: { post: { id: postId } }, fields: ["id"] }
      );

      if (commentsOnPost.length === 0) return 0;

      const commentIds = commentsOnPost.map((c) => c.id);

      return await strapi.entityService.count("api::like.like", {
        filters: { comment: { id: { $in: commentIds } } },
      });
    },

    async enrichMentionWithPolicy(mention, userId, mentionPolicyService) {
      const policy = mention.comment_policy || "anyone";
      const mentionedUserId = mention.user?.id || mention.user;
      if (!mentionedUserId) return { ...mention, is_allowed: false };

      const allowed = await mentionPolicyService.isMentionAllowed(
        userId,
        mentionedUserId,
        policy
      );
      return { ...mention, is_allowed: allowed };
    },

    async shapeCommentData(
      item,
      userId,
      mentionPolicyService,
      isRepostCaption = false
    ) {
      let mentions = Array.isArray(item.mentioned_users)
        ? item.mentioned_users.filter((m) => m.mention_status === true)
        : [];

      if (!mentions.length) {
        mentions = [
          {
            mention_status: false,
            username: "",
            user: null,
            start: null,
            end: null,
            is_allowed: true,
          },
        ];
      }

      const enrichedMentions = [];
      for (const mention of mentions) {
        const enriched = await this.enrichMentionWithPolicy(
          mention,
          userId,
          mentionPolicyService
        );
        enrichedMentions.push({
          id: mention.id,
          username: mention.username,
          user: mention.user,
          start: mention.start,
          end: mention.end,
          is_allowed: enriched.is_allowed,
        });
      }

      const author = item.user ?? item.commented_by ?? null;
      const profilePic = author?.profile_picture ?? null;

      return {
        id: item.id,
        comment: isRepostCaption
          ? item.comment || item.repost_caption || ""
          : item.comment || "",
        mentioned_users: enrichedMentions,
        createdAt: item.createdAt,
        repost_caption: isRepostCaption ? item.repost_caption || "" : "",
        is_repost_caption: isRepostCaption,
        stats: {
          likes: item.stats?.likes ?? 0,
          replies: item.stats?.replies ?? 0,
          is_liked: item.stats?.is_liked ?? false,
          is_liked_by_author: item.stats?.is_liked_by_author ?? false,
        },
        author: author
          ? {
              id: author.id,
              username: author.username,
              name: author.name,
              avatarRingColor: author.avatar_ring_color,
              profilePicture: profilePic
                ? {
                    id: profilePic.id,
                    url: profilePic.url,
                    formats: profilePic.formats || null,
                    alternativeText: profilePic.alternativeText || null,
                  }
                : null,
            }
          : null,
        pinned: item.pinned ?? false,
        parent: item.parent_comment ?? null,
        repost_of: item.repost_of ?? null,
      };
    },
    async enrichPostMentions(
      post: any,
      userId: number,
      type: "story" | "comment" | "post" = "post"
    ) {
      const mentionService = strapi.service(
        "api::mention-policy.mention-policy"
      );

      // 1. Extract mentions from title + description text using mentionUser service method
      const combinedText = `${post.title || ""} ${post.description || ""}`;
      const mentionsFromText = await mentionService.mentionUser(
        userId,
        combinedText,
        type
      );

      // 2. Get the existing mentioned_users component array (if any)
      const componentMentions = Array.isArray(post.mentioned_users)
        ? post.mentioned_users
        : [];

      // 3. Determine usernames already included in component mentions to avoid duplicates
      const componentUsernames = new Set(
        componentMentions.map((m) => m.username)
      );
      const filteredTextMentions = mentionsFromText.filter(
        (m) => !componentUsernames.has(m.username)
      );

      // 4. Combine component mentions with newly extracted mentions from text
      const combinedMentions = [...componentMentions, ...filteredTextMentions];

      // 5. Enrich all mentions with permission 'is_allowed' flag based on policy
      const enrichedMentions = [];
      for (const mention of combinedMentions) {
        const policy = mention.policy || mention.comment_policy || "any";
        const mentionedUserId = mention.user?.id || mention.user;
        const isAllowed = await mentionService.isMentionAllowed(
          userId,
          mentionedUserId,
          policy
        );
        enrichedMentions.push({
          ...mention,
          is_allowed: isAllowed,
        });
      }
      console.log(
        "COMMENT ENRICHMENTS(IN POST MENTIONS) : \n",
        enrichedMentions
      );
      // 6. Assign enriched mentions back into post
      post.mentioned_users = enrichedMentions;
      return post;
    },

    async enrichCommentStats(comments: any[], currentUserId: number) {
      const enriched = [];
      for (const comment of comments) {
        const [likes_count, is_liked, replies_count, is_liked_by_author] =
          await Promise.all([
            this.getLikesCount(comment.id),
            this.verifyCommentLikedByUser(comment.id, currentUserId),
            this.getRepliesCount(comment.id),
            this.verifyCommentLikedByAuthor(
              comment.id,
              comment.commented_by?.id
            ),
          ]);
        enriched.push({
          ...comment,
          stats: {
            likes: likes_count,
            replies: replies_count,
            is_liked,
            is_liked_by_author,
          },
        });
      }
      return enriched;
    },

    async getLikesCount(commentId: number | any): Promise<number> {
      return await strapi.entityService.count("api::like.like", {
        filters: { comment: commentId },
      });
    },

    async getRepliesCount(commentId: number | any): Promise<number> {
      return await strapi.entityService.count("api::comment.comment", {
        filters: { parent_comment: commentId },
      });
    },

    async verifyCommentLikedByUser(
      commentId: number | any,
      userId: number | any
    ): Promise<boolean> {
      const count = await strapi.entityService.count("api::like.like", {
        filters: { comment: commentId, liked_by: userId },
      });
      return count > 0;
    },

    async verifyCommentLikedByAuthor(
      commentId: number | any,
      authorId: number | any
    ): Promise<boolean> {
      if (!authorId) return false;
      const count = await strapi.entityService.count("api::like.like", {
        filters: { comment: commentId, liked_by: authorId },
      });
      return count > 0;
    },
  })
);
