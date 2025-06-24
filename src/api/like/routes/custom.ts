export default {
  routes: [
    {
      method: "POST",
      path: "/like",
      handler: "like.likePost",
      config: {
        prefix: "",
      },
    },

    {
      method: "POST",
      path: "/unlike",
      handler: "like.unlikePost",
      config: {
        prefix: "",
      },
    },
    {
      method: "GET",
      path: "/:post_id/likes",
      handler: "like.getLikesByPostId",
      config: {
        prefix: "",
      },
    },
  ],
};
