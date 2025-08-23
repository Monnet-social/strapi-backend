import { factories } from "@strapi/strapi";
import { Context } from "koa";
import NotificationService from "../../../utils/notification_service";

export default factories.createCoreController(
  "api::comment.comment",
  ({ strapi }) => ({
    async commentPost(ctx: any) {
      const { id: userId } = ctx.state.user;
      const body = ctx.request.body as {
        post_id: number;
        comment: string;
        parent_comment_id?: number;
        repost_of_id?: number;
      };
      const { post_id, comment, parent_comment_id, repost_of_id } = body;

      if (!userId) return ctx.unauthorized("You must be logged in to comment.");
      if (!post_id || isNaN(post_id))
        return ctx.badRequest('A valid "post_id" is required.');
      if (
        !comment ||
        typeof comment !== "string" ||
        comment.trim().length === 0
      )
        return ctx.badRequest("Comment text cannot be empty.");

      const dataToCreate: any = {
        post: post_id,
        commented_by: userId,
        comment: comment.trim(),
      };

      try {
        const postExists = await strapi.entityService.findOne(
          "api::post.post",
          post_id
        );
        if (!postExists)
          return ctx.notFound(
            "The post you are trying to comment on does not exist."
          );

        if (parent_comment_id) {
          if (isNaN(parent_comment_id))
            return ctx.badRequest("parent_comment_id must be a number.");
          const parentComment = await strapi.entityService.findOne(
            "api::comment.comment",
            parent_comment_id,
            { populate: { post: { fields: ["id"] } } }
          );
          if (!parentComment)
            return ctx.notFound(
              "The comment you are trying to reply to does not exist."
            );
          if ((parentComment as any).post?.id !== Number(post_id))
            return ctx.badRequest(
              "The parent comment does not belong to this post."
            );
          dataToCreate.parent_comment = parent_comment_id;
        }

        if (repost_of_id) {
          if (isNaN(repost_of_id))
            return ctx.badRequest("repost_of_id must be a number.");
          const originalComment = await strapi.entityService.findOne(
            "api::comment.comment",
            repost_of_id
          );
          if (!originalComment)
            return ctx.notFound(
              "The comment you are trying to repost does not exist."
            );
          dataToCreate.repost_of = repost_of_id;
        }

        let mentionData = await strapi
          .service("api::mention-policy.mention-policy")
          .mentionUser(userId, comment, "comment");
        if (mentionData) dataToCreate.mentioned_users = mentionData;

        const newComment = await strapi.entityService.create(
          "api::comment.comment",
          {
            data: dataToCreate,
            populate: {
              commented_by: {
                fields: ["id", "username", "name", "avatar_ring_color"],
                populate: { profile_picture: true },
              },
              repost_of: { fields: ["id", "comment"] },
            },
          }
        );

        const notificationUtil = new NotificationService();
        const actorUserName =
          ctx.state.user.username || ctx.state.user.name || "a user";

        if (dataToCreate.mentioned_users?.length) {
          for (const mention of dataToCreate.mentioned_users) {
            if (mention.user && mention.user !== userId) {
              const mentionedUser = await strapi.entityService.findOne(
                "plugin::users-permissions.user",
                mention.user
              );
              const tokens = mentionedUser?.fcm_token ?? [];
              await notificationUtil.notifyMention(
                userId,
                mention.user,
                (newComment as any).id,
                post_id,
                actorUserName,
                tokens[0]
              );
            }
          }
        }

        if (dataToCreate.repost_of) {
          const originalComments = await strapi.entityService.findMany(
            "api::comment.comment",
            {
              filters: { id: dataToCreate.repost_of },
              populate: {
                commented_by: {
                  fields: ["id", "username", "name", "fcm_token"],
                },
                post: { fields: ["id"] },
              },
              limit: 1,
            }
          );
          const origComment = originalComments[0];
          if ((origComment as any)?.commented_by?.fcm_token?.length) {
            await notificationUtil.notifyRepost(
              userId,
              (origComment as any).commented_by.id,
              (newComment as any).id,
              post_id,
              actorUserName,
              (origComment as any).commented_by.fcm_token
            );
          }
        }

        if (dataToCreate.parent_comment) {
          const parentComments = await strapi.entityService.findMany(
            "api::comment.comment",
            {
              filters: { id: dataToCreate.parent_comment },
              populate: {
                commented_by: {
                  fields: ["id", "username", "name", "fcm_token"],
                },
              },
              limit: 1,
            }
          );
          const parentComment = parentComments[0];
          if ((parentComment as any)?.commented_by?.fcm_token?.length) {
            await notificationUtil.notifyReply(
              userId,
              (parentComment as any).commented_by.id,
              (newComment as any).id,
              post_id,
              actorUserName,
              (parentComment as any).commented_by.fcm_token
            );
          }
        }

        if (dataToCreate.post) {
          const postService = strapi.service("api::post.post");
          const postRecord = await postService.resolveOriginalPost(
            dataToCreate.post
          );
          if (postRecord) {
            const tokens = postRecord.posted_by?.fcm_token ?? [];
            await notificationUtil.notifyComment(
              userId,
              postRecord.posted_by.id,
              (newComment as any).id,
              postRecord.id,
              actorUserName,
              tokens,
              postRecord.title ?? ""
            );

            (newComment as any).original_post_details = {
              id: postRecord.id,
              title: postRecord.title,
              description: postRecord.description,
              posted_by: postRecord.posted_by,
              media: postRecord.media,
            };
          }
        }

        return ctx.send(newComment);
      } catch (error) {
        strapi.log.error("Error creating comment/reply:", error);
        return ctx.internalServerError(
          "An error occurred while posting your comment."
        );
      }
    },

    async pinComment(ctx: Context) {
      const { comment_id } = ctx.params;
      const userId = ctx.state.user.id;

      const comment: any = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: { id: comment_id },
          populate: { post: { populate: { posted_by: true } } },
          limit: 1,
        }
      );
      if (comment.length === 0)
        return ctx.badRequest("You cannot pin this comment");

      if (comment[0]?.post?.posted_by?.id !== userId)
        return ctx.badRequest("You cannot pin this comment");

      const checkIfAnotherCommentIsPinned = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: {
            post: { id: comment[0].post.id },
            pinned: true,
            id: { $ne: comment_id },
          },
        }
      );
      if (checkIfAnotherCommentIsPinned.length > 0)
        await strapi.entityService.update(
          "api::comment.comment",
          checkIfAnotherCommentIsPinned[0].id,
          { data: { pinned: false } }
        );

      await strapi.entityService.update("api::comment.comment", comment_id, {
        data: { pinned: true },
      });

      return ctx.send({
        message: "Comment pinned successfully",
        status: 200,
      });
    },

    async unpinComment(ctx: Context) {
      const { comment_id } = ctx.params;
      const userId = ctx.state.user.id;
      const comment: any = await strapi.entityService.findMany(
        "api::comment.comment",
        {
          filters: { id: comment_id },
          populate: { post: { populate: { posted_by: true } } },
          limit: 1,
        }
      );
      if (comment.length === 0)
        return ctx.badRequest("You cannot unpin this comment");

      if (comment[0].pinned === false)
        return ctx.send({
          message: "Comment unpinned successfully",
          status: 200,
        });

      if (comment[0]?.post?.posted_by?.id !== userId)
        return ctx.badRequest("You cannot unpin this comment");

      await strapi.entityService.update("api::comment.comment", comment_id, {
        data: { pinned: false },
      });

      return ctx.send({
        message: "Comment unpinned successfully",
        status: 200,
      });
    },

    // async getCommentsByPostId(ctx: any) {
    //   const { post_id: postIdParam } = ctx.params as { post_id?: string };
    //   const { user } = ctx.state as { user?: { id: number } };
    //   const { page = "1", pageSize = "10" } = ctx.query as Record<
    //     string,
    //     string
    //   >;

    //   if (!user) return ctx.unauthorized("You must be logged in.");

    //   const userId = user.id;
    //   const postId = Number(postIdParam);
    //   if (!postId || isNaN(postId)) return ctx.badRequest("Invalid Post ID.");

    //   const mentionPolicyService = strapi.service(
    //     "api::mention-policy.mention-policy"
    //   );

    //   async function enrichMentionWithPolicy(mention: any) {
    //     const policy = mention.comment_policy || "anyone";
    //     const mentionedUserId = mention.user?.id || mention.user;

    //     if (!mentionedUserId) return { ...mention, is_allowed: false };

    //     const allowed = await mentionPolicyService.isMentionAllowed(
    //       userId,
    //       mentionedUserId,
    //       policy
    //     );

    //     return { ...mention, is_allowed: allowed };
    //   }

    //   async function shapeCommentData(item, isRepostCaption = false) {
    //     let mentions = Array.isArray(item.mentioned_users)
    //       ? item.mentioned_users.filter((m) => m.mention_status === true)
    //       : [];

    //     if (!mentions.length) {
    //       mentions = [
    //         {
    //           mention_status: false,
    //           username: "",
    //           user: null,
    //           start: null,
    //           end: null,
    //           is_allowed: true,
    //         },
    //       ];
    //     }

    //     const enrichedMentions = [];
    //     for (const mention of mentions) {
    //       const enriched = await enrichMentionWithPolicy(mention);
    //       enrichedMentions.push({
    //         id: mention.id,
    //         username: mention.username,
    //         user: mention.user,
    //         start: mention.start,
    //         end: mention.end,
    //         isAllowed: enriched.is_allowed, // Note camelCase here to match Dart usage
    //       });
    //     }

    //     const author = item.user ?? item.commented_by ?? null;
    //     const profilePic = author?.profile_picture ?? null;

    //     return {
    //       id: item.id,
    //       comment: isRepostCaption
    //         ? item.comment || item.repost_caption || ""
    //         : item.comment || "",
    //       mentionedUsers: enrichedMentions, // camelCase
    //       createdAt: item.createdAt,
    //       repostCaption: isRepostCaption ? item.repost_caption || "" : "", // camelCase
    //       isRepostCaption: isRepostCaption, // camelCase
    //       stats: {
    //         likes: item.stats?.likes ?? 0,
    //         replies: item.stats?.replies ?? 0,
    //         isLiked: item.stats?.is_liked ?? false,
    //         isLikedByAuthor: item.stats?.is_liked_by_author ?? false,
    //       },
    //       author: author
    //         ? {
    //             id: author.id,
    //             username: author.username,
    //             name: author.name,
    //             avatarRingColor: author.avatar_ring_color, // camelCase if your Dart expects so
    //             profilePicture: profilePic
    //               ? {
    //                   id: profilePic.id,
    //                   url: profilePic.url,
    //                   formats: profilePic.formats || null,
    //                   alternativeText: profilePic.alternativeText || null,
    //                 }
    //               : null,
    //           }
    //         : null,
    //       pinned: item.pinned ?? false,
    //       parent: item.parent_comment ?? null,
    //       repostOf: item.repost_of ?? null, // camelCase
    //     };
    //   }

    //   try {
    //     const post = await strapi.entityService.findOne(
    //       "api::post.post",
    //       postId,
    //       {
    //         fields: ["id", "createdAt", "repost_caption"],
    //         populate: {
    //           posted_by: {
    //             fields: ["id", "username", "name", "avatar_ring_color"],
    //             populate: { profile_picture: true },
    //           },
    //           repost_of: {
    //             fields: ["id"],
    //             populate: {
    //               posted_by: {
    //                 fields: ["id", "username", "name", "avatar_ring_color"],
    //                 populate: { profile_picture: true },
    //               },
    //             },
    //           },
    //         },
    //       }
    //     );

    //     if (!post) return ctx.notFound("Post not found");
    //     console.log("REPOST", post);
    //     const isRepost = !!(post as any).repost_of;
    //     const repostCaption = post.repost_caption?.trim() || "";

    //     const pinnedComments = await strapi.entityService.findMany(
    //       "api::comment.comment",
    //       {
    //         filters: {
    //           post: { id: postId },
    //           parent_comment: null,
    //           pinned: true,
    //         },
    //         fields: ["id", "comment", "createdAt", "pinned"],
    //         populate: {
    //           commented_by: {
    //             fields: ["id", "username", "name", "avatar_ring_color"],
    //             populate: { profile_picture: true },
    //           },
    //           mentioned_users: {
    //             populate: {
    //               user: {
    //                 fields: ["id", "username", "name", "avatar_ring_color"],
    //                 populate: { profile_picture: true },
    //               },
    //             },
    //           },
    //         },
    //         limit: 1,
    //         sort: { createdAt: "desc" },
    //       }
    //     );

    //     const pinnedBlock = await Promise.all(
    //       pinnedComments.map((item) => shapeCommentData(item))
    //     );
    //     let repostCaptionBlock: any[] = [];
    //     if (isRepost && repostCaption) {
    //       const repostUser = (post as any).posted_by;
    //       const block = await shapeCommentData(
    //         {
    //           id: post.id,
    //           comment: "",
    //           repost_caption: repostCaption,
    //           user: repostUser,
    //           commented_by: repostUser,
    //           createdAt: post.createdAt,
    //           stats: {
    //             likes: 0,
    //             replies: 0,
    //             is_liked: false,
    //             is_liked_by_author: false,
    //           },
    //           mentioned_users: [],
    //           pinned: false,
    //           parent_comment: null,
    //           repost_of: null,
    //         },
    //         true
    //       );

    //       repostCaptionBlock = [block];
    //     }

    //     const paginatedComments = await strapi.entityService.findPage(
    //       "api::comment.comment",
    //       {
    //         filters: {
    //           post: { id: postId },
    //           parent_comment: null,
    //           pinned: false,
    //         },
    //         sort: { createdAt: "desc" },
    //         fields: ["id", "comment", "createdAt", "pinned"],
    //         populate: {
    //           commented_by: {
    //             fields: ["id", "username", "name", "avatar_ring_color"],
    //             populate: { profile_picture: true },
    //           },
    //           mentioned_users: {
    //             populate: {
    //               user: {
    //                 fields: ["id", "username", "name", "avatar_ring_color"],
    //                 populate: { profile_picture: true },
    //               },
    //             },
    //           },
    //         },
    //         page: Number(page),
    //         pageSize: Number(pageSize),
    //       }
    //     );

    //     const comments = paginatedComments.results || [];
    //     const pagination = paginatedComments.pagination || {};

    //     const enrichedComments = await Promise.all(
    //       comments.map((item) => shapeCommentData(item))
    //     );

    //     const response = [
    //       ...pinnedBlock,
    //       ...repostCaptionBlock,
    //       ...enrichedComments,
    //     ];

    //     return ctx.send({ data: response, meta: { pagination } });
    //   } catch (error) {
    //     ctx.log.error("Error fetching comments:", error);
    //     return ctx.internalServerError("Error retrieving comments.");
    //   }
    // },

    async getCommentsByPostId(ctx: any) {
      const { post_id: postIdParam } = ctx.params as { post_id?: string };
      const { user } = ctx.state as { user?: { id: number } };
      const { page = "1", pageSize = "10" } = ctx.query as Record<
        string,
        string
      >;

      if (!user) return ctx.unauthorized("You must be logged in.");

      const userId = user.id;
      const postId = Number(postIdParam);
      if (!postId || isNaN(postId)) return ctx.badRequest("Invalid Post ID.");

      const mentionPolicyService = strapi.service(
        "api::mention-policy.mention-policy"
      );
      const commentService = strapi.service("api::comment.comment");
      const postService = strapi.service("api::post.post");

      try {
        const post = await postService.getPost(postId);
        if (!post) return ctx.notFound("Post not found");

        const isRepost = !!(post as any).repost_of;
        const repostCaption = post.repost_caption?.trim() || "";

        const pinnedComments = await strapi.entityService.findMany(
          "api::comment.comment",
          {
            filters: {
              post: { id: postId },
              parent_comment: null,
              pinned: true,
            },
            fields: ["id", "comment", "createdAt", "pinned"],
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
            limit: 1,
            sort: { createdAt: "desc" },
          }
        );
        const pinnedBlock = await Promise.all(
          pinnedComments.map((item) =>
            commentService.shapeCommentData(item, userId, mentionPolicyService)
          )
        );

        let repostCaptionBlock: any[] = [];
        if (isRepost && repostCaption) {
          const repostUser = (post as any).posted_by;
          const reposts = await postService.populateRepostData([post]);
          console.log(reposts);
          const block = await commentService.shapeCommentData(
            reposts[0],
            userId,
            mentionPolicyService,
            true
          );
          repostCaptionBlock = [block];
        }

        const paginatedComments = await strapi.entityService.findPage(
          "api::comment.comment",
          {
            filters: {
              post: { id: postId },
              parent_comment: null,
              pinned: false,
            },
            sort: { createdAt: "desc" },
            fields: ["id", "comment", "createdAt", "pinned"],
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
            page: Number(page),
            pageSize: Number(pageSize),
          }
        );
        const comments = paginatedComments.results || [];
        const pagination = paginatedComments.pagination || {};

        const enrichedComments = await Promise.all(
          comments.map((item) =>
            commentService.shapeCommentData(item, userId, mentionPolicyService)
          )
        );

        const response = [
          ...pinnedBlock,
          ...repostCaptionBlock,
          ...enrichedComments,
        ];

        return ctx.send({ data: response, meta: { pagination } });
      } catch (error) {
        ctx.log.error("Error fetching comments:", error);
        return ctx.internalServerError("Error retrieving comments.");
      }
    },
    async likeComment(ctx: Context) {
      const { id: commentId } = ctx.params;
      const { id: userId } = ctx.state.user;

      if (!userId)
        return ctx.unauthorized("You must be logged in to like a comment.");
      if (!commentId || isNaN(Number(commentId)))
        return ctx.badRequest("A valid comment ID is required.");

      try {
        const comment = await strapi.entityService.findOne(
          "api::comment.comment",
          commentId
        );
        //tes
        if (!comment) return ctx.notFound("Comment not found.");

        const existingLike = await strapi.entityService.findMany(
          "api::like.like",
          {
            filters: {
              comment: { id: commentId },
              liked_by: { id: userId },
            },
            limit: 1,
          }
        );

        if (existingLike.length > 0) {
          await strapi.entityService.delete(
            "api::like.like",
            existingLike[0].id
          );
          return ctx.send({
            success: true,
            liked: false,
            message: "Comment unliked successfully.",
          });
        } else {
          await strapi.entityService.create("api::like.like", {
            data: {
              liked_by: userId,
              comment: commentId,
              post: null,
            },
          });
          return ctx.send({
            success: true,
            liked: true,
            message: "Comment liked successfully.",
          });
        }
      } catch (error) {
        strapi.log.error("Error liking comment:", error);
        return ctx.internalServerError("An error occurred.");
      }
    },

    async dislikeComment(ctx: Context) {
      const { id: commentId } = ctx.params;
      const { id: userId } = ctx.state.user;

      if (!commentId || isNaN(Number(commentId)))
        return ctx.badRequest("A valid comment ID is required.");

      try {
        const comment = await strapi.entityService.findOne(
          "api::comment.comment",
          commentId
        );
        if (!comment) return ctx.notFound("Comment not found.");

        const existingLike = await strapi.entityService.findMany(
          "api::like.like",
          {
            filters: {
              comment: { id: commentId },
              liked_by: { id: userId },
            },
            limit: 1,
          }
        );
        if (existingLike.length > 0)
          await strapi.entityService.delete(
            "api::like.like",
            existingLike[0].id
          );

        const existingDislike = await strapi.entityService.findMany(
          "api::dislike.dislike",
          {
            filters: {
              comment: { id: commentId },
              disliked_by: { id: userId },
            },
            limit: 1,
          }
        );

        if (existingDislike.length > 0) {
          await strapi.entityService.delete(
            "api::dislike.dislike",
            existingDislike[0].id
          );
          return ctx.send({
            success: true,
            disliked: false,
            message: "Comment undisliked successfully.",
          });
        } else {
          await strapi.entityService.create("api::dislike.dislike", {
            data: {
              disliked_by: userId,
              comment: commentId,
              post: null,
            },
          });
          return ctx.send({
            success: true,
            disliked: true,
            message: "Comment disliked successfully.",
          });
        }
      } catch (error) {
        strapi.log.error("Error disliking comment:", error);
        return ctx.internalServerError("An error occurred.");
      }
    },

    async getCommentReplies(ctx: Context) {
      const { id: parentCommentId } = ctx.params;
      const { user } = ctx.state;
      const { page = 1, pageSize = 10 } = ctx.query;
      const userId = user.id;

      if (!user)
        return ctx.unauthorized("You must be logged in to view replies.");

      if (!parentCommentId || isNaN(Number(parentCommentId)))
        return ctx.badRequest(
          "A valid parent comment ID is required in the URL."
        );

      try {
        const parentComment = await strapi.entityService.findOne(
          "api::comment.comment",
          parentCommentId,
          {
            populate: {
              post: { populate: { posted_by: { fields: ["id"] } } },
            },
          }
        );

        if (!parentComment) return ctx.notFound("Parent comment not found.");

        const postAuthorId = (parentComment as any).post?.posted_by?.id;

        const paginatedReplies: any = await strapi.entityService.findPage(
          "api::comment.comment",
          {
            filters: { parent_comment: { id: parentCommentId } },
            sort: { createdAt: "asc" },
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
            page: Number(page),
            pageSize: Number(pageSize),
          }
        );

        const { results: replies, pagination } = paginatedReplies;

        if (replies.length === 0)
          return ctx.send({ data: [], meta: { pagination } });

        const authorsMap = new Map();
        replies.forEach((reply) => {
          let finalList = [];
          for (let i = 0; i < replies?.mentioned_users?.length; i++) {
            const status = replies.mentioned_users[i].mention_status;
            if (status) {
              finalList.push(replies.mentioned_users[i]);
            }
          }
          replies.mentioned_users = finalList;
          if (reply.commented_by)
            authorsMap.set(reply.commented_by.id, reply.commented_by);
        });
        const authors = Array.from(authorsMap.values());

        if (authors.length > 0)
          await Promise.all([
            strapi
              .service("api::following.following")
              .enrichItemsWithFollowStatus({
                items: replies,
                userPaths: ["commented_by"],
                currentUserId: userId,
              }),
            strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures(authors),
          ]);

        const replyIds = replies.map((reply) => reply.id);

        const [userLikes, userDislikes, authorLikes] = await Promise.all([
          strapi.entityService.findMany("api::like.like", {
            filters: {
              liked_by: { id: userId },
              comment: { id: { $in: replyIds } },
            },
            populate: { comment: { fields: ["id"] } },
          }),
          strapi.entityService.findMany("api::dislike.dislike", {
            filters: {
              disliked_by: { id: userId },
              comment: { id: { $in: replyIds } },
            },
            populate: { comment: { fields: ["id"] } },
          }),
          postAuthorId
            ? strapi.entityService.findMany("api::like.like", {
                filters: {
                  liked_by: { id: postAuthorId },
                  comment: { id: { $in: replyIds } },
                },
                populate: { comment: { fields: ["id"] } },
              })
            : Promise.resolve([]),
        ]);

        const likedReplyIds = new Set(
          userLikes.map((like: any) => like.comment?.id).filter(Boolean)
        );
        const dislikedReplyIds = new Set(
          userDislikes
            .map((dislike: any) => dislike.comment?.id)
            .filter(Boolean)
        );

        const authorLikedReplyIds = new Set(
          authorLikes.map((like: any) => like.comment?.id).filter(Boolean)
        );

        const finalResults = await Promise.all(
          replies.map(async (reply: any) => {
            const [like_count, dislike_count] = await Promise.all([
              strapi.entityService.count("api::like.like", {
                filters: { comment: { id: reply.id } },
              }),
              strapi.entityService.count("api::dislike.dislike", {
                filters: { comment: { id: reply.id } },
              }),
            ]);

            return {
              ...reply,
              like_count,
              dislike_count,
              is_liked: likedReplyIds.has(reply.id),
              is_disliked: dislikedReplyIds.has(reply.id),
              // 4. Add the new flag here
              is_liked_by_author: authorLikedReplyIds.has(reply.id),
            };
          })
        );

        return ctx.send({ data: finalResults, meta: { pagination } });
      } catch (error) {
        strapi.log.error("Error fetching comment replies:", error);
        return ctx.internalServerError(
          "An error occurred while fetching replies."
        );
      }
    },

    async delete(ctx) {
      const user = ctx.state.user;

      if (!user)
        return ctx.unauthorized("You must be logged in to delete a comment.");

      const { id: commentIdToDelete } = ctx.params;

      try {
        const commentToDelete = await strapi.entityService.findOne(
          "api::comment.comment",
          commentIdToDelete,
          { populate: ["commented_by"] }
        );

        if (!commentToDelete) return ctx.notFound("Comment not found.");

        if ((commentToDelete as any).commented_by?.id !== user.id)
          return ctx.forbidden(
            "You are not authorized to delete this comment."
          );

        const deleteCommentAndReplies = async (currentCommentId) => {
          const replies = await strapi.entityService.findMany(
            "api::comment.comment",
            {
              filters: { parent_comment: currentCommentId },
              fields: ["id"],
            }
          );

          for (const reply of replies) await deleteCommentAndReplies(reply.id);

          await strapi.entityService.delete(
            "api::comment.comment",
            currentCommentId
          );
        };

        await deleteCommentAndReplies(commentIdToDelete);

        return ctx.send({
          message: "Comment and all its replies deleted successfully.",
          is_deleted: true,
        });
      } catch (err) {
        strapi.log.error("Error deleting comment:", err);
        ctx.badRequest("Could not delete comment.", { details: err.message });
      }
    },
  })
);
