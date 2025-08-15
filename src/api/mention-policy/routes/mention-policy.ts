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
  ],
};
