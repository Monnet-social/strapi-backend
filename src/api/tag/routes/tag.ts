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
    {
      method: "GET",
      path: "/extract-tags",
      handler: "tag.assignTags",
      config: {
        auth: false,
      },
    },
  ],
};
