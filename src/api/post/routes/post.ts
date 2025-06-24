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
      path: "/feed",
      handler: "post.feed",
    },
    {
      method: "POST",
      path: "/upload",
      handler: "post.testFIleUpload",
    },
    {
      method: "GET",
      path: "/test-file/:media_id",
      handler: "post.getTestFile",
    },
    {
      method: "GET",
      path: "/friends",
      handler: "post.getFriendsToTag",
    },
  ],
};
