/**
 * comment controller
 */

import { factories } from "@strapi/strapi";
import { Context } from "koa";

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
                fields: ["id", "username", "name"],
                populate: { profile_picture: true },
              },
              repost_of: {
                fields: ["id", "comment"],
              },
            },
          }
        );

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
      if (comment.length === 0) {
        return ctx.badRequest("You cannot pin this comment");
      }
      if (comment[0].post.posted_by.id !== userId)
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
      if (checkIfAnotherCommentIsPinned.length > 0) {
        const unpinComment = await strapi.entityService.update(
          "api::comment.comment",
          checkIfAnotherCommentIsPinned[0].id,
          { data: { pinned: false } }
        );
      }

      const updatedComment = await strapi.entityService.update(
        "api::comment.comment",
        comment_id,
        { data: { pinned: true } }
      );

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

      if (comment[0].post.posted_by.id !== userId)
        return ctx.badRequest("You cannot unpin this comment");

      const updatedComment = await strapi.entityService.update(
        "api::comment.comment",
        comment_id,
        { data: { pinned: false } }
      );

      return ctx.send({
        message: "Comment unpinned successfully",
        status: 200,
      });
    },

    async getCommentsByPostId(ctx) {
      const { post_id: postId } = ctx.params;
      const { user } = ctx.state;
      const { page = 1, pageSize = 10 } = ctx.query;
      const userId = user.id;
      if (!user)
        return ctx.unauthorized("You must be logged in to view comments.");

      if (!postId || isNaN(postId))
        return ctx.badRequest("A valid Post ID is required.");

      try {
        const paginatedComments = await strapi.entityService.findPage(
          "api::comment.comment",
          {
            filters: {
              post: { id: postId },
              parent_comment: { id: { $null: true } },
              pinned: false,
            },
            sort: { createdAt: "desc", pinned: "desc" },
            populate: {
              commented_by: {
                fields: ["id", "username", "name"],
                populate: { profile_picture: true },
              },
              post: {
                fields: ["id", "title"],
                populate: { posted_by: true },
              },
            },
            page: Number(page),
            pageSize: Number(pageSize),
          }
        );
        console.log("Paginated Comments:", paginatedComments);
        const findPinnedComment: any = await strapi.entityService.findMany(
          "api::comment.comment",
          {
            filters: {
              post: { id: postId },
              parent_comment: { id: { $null: true } },
              pinned: true,
            },
            populate: {
              commented_by: {
                fields: ["id", "username", "name"],
                populate: { profile_picture: true },
              },
              post: {
                fields: ["id", "title"],
                populate: { posted_by: true },
              },
            },
          }
        );
        console.log("Pinned Comment:", findPinnedComment);
        if (findPinnedComment.length > 0) {
          await strapi
            .service("api::following.following")
            .enrichItemsWithFollowStatus({
              items: findPinnedComment,
              userPaths: ["commented_by"],
              currentUserId: userId,
            });

          let [replies, likes, liked_by_post_author] = await Promise.all([
            strapi.entityService.count("api::comment.comment", {
              filters: { parent_comment: { id: findPinnedComment[0].id } },
            }),
            strapi.entityService.count("api::like.like", {
              filters: { comment: { id: findPinnedComment[0].id } },
            }),
            strapi.entityService.findMany("api::like.like", {
              filters: {
                comment: { id: findPinnedComment[0].id },
                liked_by: { id: findPinnedComment[0]?.post?.posted_by?.id },
              },
              limit: 1,
            }),
          ]);
          console.log(
            "Replies, Likes, Liked by Post Author:",
            replies,
            likes,
            liked_by_post_author
          );
          let is_liked_by_user = await strapi.entityService.findMany(
            "api::like.like",
            {
              filters: {
                liked_by: { id: userId },
                comment: { id: findPinnedComment[0].id },
              },
              limit: 1,
            }
          );
          console.log("Is liked by user:", is_liked_by_user);
          findPinnedComment[0].stats = {
            likes: likes,
            replies: replies,
            is_liked_by_user: is_liked_by_user.length > 0,
            liked_by_post_author: liked_by_post_author.length > 0,
          };
          if (
            findPinnedComment?.commented_by &&
            findPinnedComment[0].commented_by.profile_picture
          )
            await strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures([
                findPinnedComment[0].commented_by.profile_picture,
              ]);
        }

        const { results: comments, pagination } = paginatedComments;

        if (comments.length === 0)
          return ctx.send({ data: [], meta: { pagination } });

        await strapi
          .service("api::following.following")
          .enrichItemsWithFollowStatus({
            items: comments,
            userPaths: ["commented_by"],
            currentUserId: userId,
          });

        const commentIds = comments.map((c) => c.id);
        const userLikes = await strapi.entityService.findMany(
          "api::like.like",
          {
            filters: {
              liked_by: { id: userId },
              comment: { id: { $in: commentIds } },
            },
            populate: { comment: { fields: ["id"] } },
          }
        );
        const likedCommentIds = new Set(
          userLikes.map((like: any) => like.comment.id)
        );

        const finalResponse = await Promise.all(
          comments.map(async (comment: any) => {
            const [replies, likes, liked_by_post_author] = await Promise.all([
              strapi.entityService.count("api::comment.comment", {
                filters: { parent_comment: { id: comment.id } },
              }),
              strapi.entityService.count("api::like.like", {
                filters: { comment: { id: comment.id } },
              }),
              strapi.entityService.findMany("api::like.like", {
                filters: {
                  comment: { id: comment.id },
                  liked_by: { id: comment?.post?.posted_by?.id },
                },
              }),
            ]);

            const author = comment.commented_by;

            if (author && author.profile_picture)
              await strapi
                .service("api::post.post")
                .enrichUsersWithOptimizedProfilePictures([
                  author.profile_picture,
                ]);

            return {
              id: comment.id,
              comment: comment.comment,
              createdAt: comment.createdAt,
              pinned: false,
              author: author,
              stats: {
                likes: likes,
                replies: replies,
                is_liked_by_user: likedCommentIds.has(comment.id),
                liked_by_post_author: liked_by_post_author.length > 0,
              },
            };
          })
        );

        return ctx.send({
          data: [...findPinnedComment, ...finalResponse],

          meta: { pagination },
        });
      } catch (error) {
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
      if (!commentId || isNaN(commentId))
        return ctx.badRequest("A valid comment ID is required.");

      try {
        const comment = await strapi.entityService.findOne(
          "api::comment.comment",
          commentId
        );
        if (!comment) return ctx.notFound("Comment not found.");

        // const existingDislike = await strapi.entityService.findMany(
        //     "api::dislike.dislike",
        //     {
        //         filters: {
        //             comment: { id: commentId },
        //             disliked_by: { id: userId },
        //         },
        //         limit: 1,
        //     }
        // );
        // if (existingDislike.length > 0)
        //     await strapi.entityService.delete(
        //         "api::dislike.dislike",
        //         existingDislike[0].id
        //     );

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

      if (!commentId || isNaN(commentId))
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

      if (!user) {
        return ctx.unauthorized("You must be logged in to view replies.");
      }
      if (!parentCommentId || isNaN(parentCommentId)) {
        return ctx.badRequest(
          "A valid parent comment ID is required in the URL."
        );
      }

      try {
        const paginatedReplies = await strapi.entityService.findPage(
          "api::comment.comment",
          {
            filters: { parent_comment: { id: parentCommentId } },
            sort: { createdAt: "asc" },
            populate: {
              commented_by: {
                fields: ["id", "username", "name"],
                populate: { profile_picture: true },
              },
            },
            page: Number(page),
            pageSize: Number(pageSize),
          }
        );

        const { results: replies, pagination } = paginatedReplies;
        const userId = user.id;

        if (replies.length === 0) {
          return ctx.send({ data: [], meta: { pagination } });
        }

        const authors = Array.from(
          new Map(
            replies.map((r) => [r.commented_by.id, r.commented_by])
          ).values()
        );

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
        const [userLikes, userDislikes] = await Promise.all([
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
        ]);

        const likedReplyIds = new Set(
          userLikes.map((like: any) => like.comment?.id)
        );
        const dislikedReplyIds = new Set(
          userDislikes.map((dislike: any) => dislike.comment?.id)
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
  })
);
