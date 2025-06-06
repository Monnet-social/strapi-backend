module.exports = [
  {
    method: "POST",
    path: "/auth/login",
    handler: "authentication.login",
    config: {
      prefix: "",
      auth: false,
    },
  },
];
