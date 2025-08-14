module.exports = {
  routes: [
    {
      method: "GET",
      path: "/tags",
      handler: "tag.getTags",
    },
  ],
};
