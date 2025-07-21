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
      path: "/friends/:userId",
      handler: "following.getFriends",
    },
    {
      method: "GET",
      path: "/following/:userId",
      handler: "following.getUserFollowing",
    },
    {
      method: "GET",
      path: "/mutual-followers/:userId",
      handler: "following.getMutualFollowers",
    },
    {
      method: "PUT",
      path: "/close-friends",
      handler: "following.addCloseFriends",
    },
  ],
};
