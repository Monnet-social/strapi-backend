module.exports = [
  {
    method: "POST",
    path: "/auth/login",
    handler: "auth.login",
    config: {
      prefix: "",
      auth: false,
    },
  },
];
