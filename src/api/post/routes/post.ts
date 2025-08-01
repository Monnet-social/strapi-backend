"use strict";

module.exports = {
  routes: [
    //================================================================
    // CORE POST ROUTES
    //================================================================
    {
      method: "POST",
      path: "/posts",
      handler: "post.create",
    },
    {
      method: "GET",
      path: "/feed",
      handler: "post.feed",
    },
    {
      method: "GET",
      path: "/posts/:id",
      handler: "post.findOne",
    },
    {
      method: "GET",
      path: "/posts/:id/admin",
      handler: "post.findOneAdmin",
    },
    {
      method: "PUT",
      path: "/posts/:id",
      handler: "post.update",
    },
    {
      method: "DELETE",
      path: "/posts/:id",
      handler: "post.delete",
    },

    //================================================================
    // STORY ROUTES
    //================================================================
    {
      method: "GET",
      path: "/stories",
      handler: "post.stories",
    },
    // {
    //   method: "GET",
    //   path: "/stories/:id",
    //   handler: "post.getStory",
    // },
    {
      method: "POST",
      path: "/stories/:id/view",
      handler: "post.viewPost",
    },
    {
      method: "GET",
      path: "/stories/:id/viewers",
      handler: "post.getStoryViewers",
    },
    {
      method: "DELETE",
      path: "/stories/expired",
      handler: "post.deleteExpiredStories",
    },

    //================================================================
    // USER & FRIENDS ROUTES
    //================================================================
    {
      method: "GET",
      path: "/users/:id/posts",
      handler: "post.findUserPosts",
    },
    {
      method: "GET",
      path: "/get-friends",
      handler: "post.getFriendsToTag",
    },

    //================================================================
    // DEVELOPMENT & TESTING ROUTES
    //================================================================
    {
      method: "POST",
      path: "/posts/seed", // From previous request to seed data
      handler: "post.seedStories",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/test-file/:media_id",
      handler: "post.getTestFile",
    },
    // {
    //   method: "POST",
    //   path: "/upload",
    //   handler: "post.testFIleUpload",
    // },
  ],
};
