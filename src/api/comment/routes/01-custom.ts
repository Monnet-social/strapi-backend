export default {
  routes: [
    {
      method: "POST",
      path: "/comment",
      handler: "comment.commentPost",
      config: {
        prefix: "",
      },
    },
    {
      method: "GET",
      path: "/:post_id/comments",
      handler: "comment.getCommentsByPostId",
      config: {
        prefix: "",
      },
    },
    {
      method: "POST",
      path: "/comment/:comment_id/pin",
      handler: "comment.pinComment",
      config: {
        prefix: "",
      },
    },
    {
      method: "POST",
      path: "/comment/:comment_id/unpin",
      handler: "comment.unpinComment",
      config: {
        prefix: "",
      },
    },
  ],
};
