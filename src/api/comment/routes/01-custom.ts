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
  ],
};
