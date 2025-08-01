module.exports = {
  routes: [
    {
      method: "GET",
      path: "/follow/requests",
      handler: "follow-request.getFollowRequests",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/follow/manage-request",
      handler: "follow-request.manageFollowRequest",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "DELETE",
      path: "/follow-request/:id",
      handler: "follow-request.deleteRequest",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
