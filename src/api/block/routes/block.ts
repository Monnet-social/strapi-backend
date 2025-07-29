module.exports = {
  routes: [
    {
      method: "POST",
      path: "/block",
      handler: "block.toggleBlockUser",
    },
    {
      method: "GET",
      path: "/blocked-users",
      handler: "block.getBlockedUsers",
    },
  ],
};
