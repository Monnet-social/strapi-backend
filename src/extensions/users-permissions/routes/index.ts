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
  {
    method: "POST",
    path: "/auth/register",
    handler: "authentication.register",
    config: {
      prefix: "",
      auth: false,
    },
  },
  {
    method: "GET",
    path: "/user",
    handler: "authentication.getUser",
    config: {
      prefix: "",
      auth: false,
    },
  },
  {
    method: "POST",
    path: "/auth/register",
    handler: "authentication.register",
    config: {
      prefix: "",
    },
  },
  {
    method: "POST",
    path: "/send-otp",
    handler: "authentication.sendOTP",
    config: {
      prefix: "",
      auth: false,
    },
  },
  {
    method: "POST",
    path: "/verify-otp",
    handler: "authentication.verifyOTP",
    config: {
      prefix: "",
      auth: false,
    },
  },

  {
    method: "POST",
    path: "/reset-password",
    handler: "authentication.resetPassword",
    config: {
      prefix: "",
      auth: false,
    },
  },
];
