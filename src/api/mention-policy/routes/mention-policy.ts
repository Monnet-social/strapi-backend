"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/posts/import",
      handler: "mention-policy.importFromCsv",
      config: {
        policies: [], // add auth/policies if you need
        middlewares: [],
      },
    },
    {
      method: "PUT",
      path: "/mention-policy",
      handler: "mention-policy.updateMentionPolicy",
      config: {
        policies: [], // add auth/policies if you need
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/mention-policy",
      handler: "mention-policy.getMentionPolicy",
      config: {
        policies: [], // add auth/policies if you need
        middlewares: [],
      },
    },
  ],
};
