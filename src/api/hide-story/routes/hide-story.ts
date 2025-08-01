module.exports = {
  routes: [
    {
      method: "POST",
      path: "/hide-story",
      handler: "hide-story.hideStory",
    },
    {
      method: "GET",
      path: "/friends-hide-story",
      handler: "hide-story.getFriendsWithHideStatus",
    },
  ],
};
