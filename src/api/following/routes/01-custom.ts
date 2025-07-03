module.exports = {
  routes: [
    {
      method: "POST",
      path: "/follow",
      handler: "following.followUnfollowUser",
    },
    {
      method: "GET",
      path: "/followers/:userId",
      handler: "following.getUserFollowers",
    },
    {
      method: "GET",
      path: "/following/:userId",
      handler: "following.getUserFollowing",
    },
    {
      method: "PUT",
      path: "/close-friends",
      handler: "following.addCloseFriends",
    },
  ],
};
