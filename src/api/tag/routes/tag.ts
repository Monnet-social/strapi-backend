module.exports = {
  routes: [
    {
      method: "GET",
      path: "/tags",
      handler: "tag.getTags",
    },
    {
      method: "GET",
      path: "/search",
      handler: "tag.searchNavigation",
    },
  ],
};
