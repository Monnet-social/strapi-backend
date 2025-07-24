"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/posts",
      handler: "post.create",
      config: {},
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
    {
      method: "GET",
      path: "/stories",
      handler: "post.stories",
    },
    {
      method: "GET",
      path: "/feed",
      handler: "post.feed",
    },
    // {
    //   method: "POST",
    //   path: "/upload",
    //   handler: "post.testFIleUpload",
    // },
    {
      method: "GET",
      path: "/test-file/:media_id",
      handler: "post.getTestFile",
    },
    {
      method: "POST",
      path: "/stories/:id/view",
      handler: "post.viewStory",
    },
    {
      method: "GET",
      path: "/stories/:id/viewers",
      handler: "post.getStoryViewers",
    },
    {
      method: "GET",
      path: "/get-friends",
      handler: "post.getFriendsToTag",
    },
    {
      method: "GET",
      path: "/users/:id/posts",
      handler: "post.findUserPosts",
      config: {
        policies: [],
      },
    },
  ],
};
