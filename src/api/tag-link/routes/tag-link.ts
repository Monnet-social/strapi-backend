module.exports = {
  routes: [
    {
      method: "GET",
      path: "/extractTags",
      handler: "tag-link.extractTags",
      config: {
        auth: false,
      },
    },
  ],
};
