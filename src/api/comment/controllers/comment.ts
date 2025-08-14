import { factories } from "@strapi/strapi";
import { Context } from "koa";
import NotificationService from "../../../utils/notification_service";

interface CommentRequestBody {
  post_id: number;
  comment: string;
  parent_comment_id?: number;
  repost_of_id?: number;
}

interface CommentCreateData {
  post: number;
  commented_by: number;
  comment: string;
  parent_comment?: number;
  repost_of?: number;
}

export default factories.createCoreController(
  "api::comment.comment",
  ({ strapi }) => ({
    async commentPost(ctx: Context) {
      const { id: userId } = ctx.state.user;
      const body: CommentRequestBody = ctx.request.body;
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

      const dataToCreate: CommentCreateData = {
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

        if (dataToCreate.repost_of) {
          const originalComment: any = await strapi.entityService.findMany(
            "api::comment.comment",
            {
              filters: { id: dataToCreate.repost_of },
              populate: {
                commented_by: {
                  fields: ["id", "username", "name", "fcm_token"],
                },
                post: { fields: ["id"] },
              },
            }
          );
          const actorUserName =
            ctx.state.user.username || ctx.state.user.name || "a user";
          if (
            originalComment &&
            originalComment.length > 0 &&
            originalComment[0]?.commented_by?.fcm_token?.length > 0
          ) {
            // Notify the original comment's author about the repost
            const notificationService = new NotificationService();
            notificationService.sendNotification(
              "Your comment was reposted",
              `Your comment: "${originalComment[0]?.comment}" was reposted by ${actorUserName}.`,
              {},
              originalComment[0]?.commented_by?.fcm_token
            );
          }
          await strapi
            .service("api::notification.notification")
            .saveNotification(
              "repost",
              ctx.state.user.id,
              originalComment[0]?.commented_by.id,
              `Your comment: "${originalComment[0]?.comment}" was reposted by ${actorUserName}.`,
              {
                comment: originalComment[0].id,
                post: originalComment[0]?.post.id,
              }
            );
        }

        if (dataToCreate?.parent_comment) {
          const parentComment: any = await strapi.entityService.findMany(
            "api::comment.comment",
            {
              filters: { id: dataToCreate.parent_comment },
              populate: {
                commented_by: {
                  fields: ["id", "username", "name", "fcm_token"],
                },
              },
            }
          );
          const actorUserName =
            ctx.state.user.username || ctx.state.user.name || "a user";
          if (
            parentComment &&
            parentComment.length > 0 &&
            parentComment[0]?.commented_by?.fcm_token?.length > 0
          ) {
            // Notify the parent comment's author about the reply
            const notificationService = new NotificationService();
            notificationService.sendNotification(
              "You received a reply",
              `Your comment: "${parentComment[0]?.comment}" was replied to by ${actorUserName}.`,
              {},
              parentComment[0]?.commented_by?.fcm_token
            );
          }
          await strapi
            .service("api::notification.notification")
            .saveNotification(
              "reply",
              ctx.state.user.id,
              parentComment[0]?.commented_by.id,
              `Your comment: "${parentComment[0]?.comment}" was replied to by ${actorUserName}.`,
              {
                comment: parentComment[0].id,
                post: parentComment[0]?.post.id,
              }
            );
        }

        if (dataToCreate.post) {
          const findPost: any = await strapi.entityService.findMany(
            "api::post.post",
            {
              filters: { id: dataToCreate.post },
              populate: {
                posted_by: {
                  fields: ["id", "username", "name", "fcm_token"],
                },
              },
            }
          );
          const actorUserName =
            ctx.state.user.username || ctx.state.user.name || "a user";
          if (
            findPost &&
            findPost.length > 0 &&
            findPost[0]?.posted_by?.fcm_token?.length > 0
          ) {
            // Notify the post's author about the comment
            const notificationService = new NotificationService();
            notificationService.sendNotification(
              "Your post received a comment",
              `Your post: "${findPost[0]?.title}" received a comment from ${actorUserName}.`,
              {},
              findPost[0]?.posted_by?.fcm_token
            );
          }
          await strapi
            .service("api::notification.notification")
            .saveNotification(
              "comment",
              ctx.state.user.id,
              findPost[0]?.posted_by.id,
              `Your post: "${findPost[0]?.title}" received a comment from ${actorUserName}.`,
              {
                comment: newComment.id,
                post: findPost[0].id,
              }
            );
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

    async getCommentsByPostId(ctx: any) {
      const { post_id: postIdParam } = ctx.params as { post_id?: string };
      const { user } = ctx.state as { user?: { id: number } };
      const { page: pageParam = "1", pageSize: pageSizeParam = "10" } =
        ctx.query as Record<string, string | undefined>;

      if (!user)
        return ctx.unauthorized("You must be logged in to view comments.");
      const userId: number = user.id;
      const postIdNum = Number(postIdParam);

      if (!postIdNum || isNaN(postIdNum))
        return ctx.badRequest("A valid Post ID is required.");

      try {
        // --- Fetch post and its repost info
        const post = (await strapi.entityService.findOne(
          "api::post.post",
          postIdNum,
          {
            populate: {
              posted_by: { fields: ["id"] },
              repost_of: {
                fields: ["id"], // Only primitive fields here. Remove 'posted_by' from fields.
                populate: {
                  posted_by: { fields: ["id", "username", "name"] },
                },
              },
              repost_caption: true,
            },
          }
        )) as any;

        if (!post) return ctx.notFound("Post not found");

        const postAuthorId: number | undefined = post.posted_by?.id;
        const isRepost: boolean = !!post.repost_of;
        const repostCaption: string = post.repost_caption
          ? String(post.repost_caption).trim()
          : "";

        // --- Get pinned comment (if any)
        const pinnedArr = (await strapi.entityService.findMany(
          "api::comment.comment",
          {
            filters: {
              post: { id: postIdNum },
              parent_comment: { id: { $null: true } },
              pinned: true,
            },
            populate: {
              commented_by: {
                fields: ["id", "username", "name", "avatar_ring_color"],
                populate: { profile_picture: true },
              },
            },
            limit: 1,
          }
        )) as any[];

        let pinnedBlock: any[] = [];
        if (Array.isArray(pinnedArr) && pinnedArr.length > 0) {
          const pinned = pinnedArr[0];
          await strapi
            .service("api::following.following")
            .enrichItemsWithFollowStatus({
              items: [pinned],
              userPaths: ["commented_by"],
              currentUserId: userId,
            });
          const [replies, likes] = await Promise.all([
            strapi.entityService.count("api::comment.comment", {
              filters: { parent_comment: { id: pinned.id as number } },
            }),
            strapi.entityService.count("api::like.like", {
              filters: { comment: { id: pinned.id as number } },
            }),
          ]);
          let isLikedByAuthor = false;
          if (postAuthorId) {
            const authorLike = (await strapi.entityService.findMany(
              "api::like.like",
              {
                filters: {
                  comment: { id: pinned.id as number },
                  liked_by: { id: postAuthorId },
                },
                limit: 1,
              }
            )) as any[];
            isLikedByAuthor = authorLike.length > 0;
          }
          const userLike = (await strapi.entityService.findMany(
            "api::like.like",
            {
              filters: {
                liked_by: { id: userId },
                comment: { id: pinned.id as number },
              },
              limit: 1,
            }
          )) as any[];
          if (pinned.commented_by) {
            await strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures([pinned.commented_by]);
          }
          pinned.stats = {
            likes,
            replies,
            is_liked: userLike.length > 0,
            is_liked_by_author: isLikedByAuthor,
          };
          pinnedBlock = [pinned];
        }

        // --- Inject repost caption block if necessary
        let repostCaptionBlock: any[] = [];
        if (isRepost && repostCaption) {
          repostCaptionBlock = [
            {
              id: `repost-caption-${post.id}`,
              is_repost_caption: true,
              text: repostCaption,
              user: post.posted_by,
              createdAt: post.createdAt,
              stats: {},
              commented_by: post.posted_by,
            },
          ];
          await strapi
            .service("api::following.following")
            .enrichItemsWithFollowStatus({
              items: repostCaptionBlock,
              userPaths: ["commented_by"],
              currentUserId: userId,
            });
          if (post.posted_by) {
            await strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures([post.posted_by]);
          }
        }

        // --- Paginate and load non-pinned comments
        const paginatedComments = (await strapi.entityService.findPage(
          "api::comment.comment",
          {
            filters: {
              post: { id: postIdNum },
              parent_comment: { id: { $null: true } },
              pinned: false,
            },
            sort: { createdAt: "desc" },
            populate: {
              commented_by: {
                fields: ["id", "username", "name", "avatar_ring_color"],
                populate: { profile_picture: true },
              },
            },
            page: Number(pageParam),
            pageSize: Number(pageSizeParam),
          }
        )) as { results: any[]; pagination: any };

        const { results: comments, pagination } = paginatedComments || {
          results: [],
          pagination: {},
        };
        if (
          !Array.isArray(comments) ||
          (comments.length === 0 &&
            pinnedBlock.length === 0 &&
            repostCaptionBlock.length === 0)
        ) {
          return ctx.send({ data: [], meta: { pagination } });
        }

        let finalResponse: any[] = [];
        if (comments.length > 0) {
          await strapi
            .service("api::following.following")
            .enrichItemsWithFollowStatus({
              items: comments,
              userPaths: ["commented_by"],
              currentUserId: userId,
            });

          const commentIds = comments.map((c: any) => c.id as number);

          const [userLikes, authorLikes] = await Promise.all([
            strapi.entityService.findMany("api::like.like", {
              filters: {
                liked_by: { id: userId },
                comment: { id: { $in: commentIds } },
              },
              populate: { comment: { fields: ["id"] } },
            }) as Promise<any[]>,
            postAuthorId
              ? (strapi.entityService.findMany("api::like.like", {
                  filters: {
                    liked_by: { id: postAuthorId },
                    comment: { id: { $in: commentIds } },
                  },
                  populate: { comment: { fields: ["id"] } },
                }) as Promise<any[]>)
              : Promise.resolve([] as any[]),
          ]);

          const likedCommentIds = new Set(
            userLikes.map((like: any) => like.comment?.id).filter(Boolean)
          );
          const authorLikedCommentIds = new Set(
            authorLikes.map((like: any) => like.comment?.id).filter(Boolean)
          );

          finalResponse = await Promise.all(
            comments.map(async (comment: any) => {
              const [replies, likes] = await Promise.all([
                strapi.entityService.count("api::comment.comment", {
                  filters: { parent_comment: { id: comment.id as number } },
                }),
                strapi.entityService.count("api::like.like", {
                  filters: { comment: { id: comment.id as number } },
                }),
              ]);
              if (comment.commented_by) {
                await strapi
                  .service("api::post.post")
                  .enrichUsersWithOptimizedProfilePictures([
                    comment.commented_by,
                  ]);
              }
              return {
                ...comment,
                stats: {
                  likes,
                  replies,
                  is_liked: likedCommentIds.has(comment.id),
                  is_liked_by_author: authorLikedCommentIds.has(comment.id),
                },
              };
            })
          );
        }

        const topBlock = [...pinnedBlock, ...repostCaptionBlock];
        const data =
          Number(pageParam) === 1
            ? [...topBlock, ...finalResponse]
            : finalResponse;

        return ctx.send({ data, meta: { pagination } });
      } catch (error: any) {
        strapi.log.error("Error fetching post comments:", error);
        return ctx.internalServerError(
          "An error occurred while fetching comments."
        );
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

        const paginatedReplies = await strapi.entityService.findPage(
          "api::comment.comment",
          {
            filters: { parent_comment: { id: parentCommentId } },
            sort: { createdAt: "asc" },
            populate: {
              commented_by: {
                fields: ["id", "username", "name", "avatar_ring_color"],
                populate: { profile_picture: true },
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
