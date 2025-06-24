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
  ],
};
