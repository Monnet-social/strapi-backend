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
    path: "/test-tables",
    handler: "profile.updateTables",
    config: {
      prefix: "",
    },
  },
  {
    method: "GET",
    path: "/user",
    handler: "authentication.getUser",
    config: {
      prefix: "",
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
    method: "GET",
    path: "/share/image",
    handler: "authentication.getShareImage",
    config: {
      prefix: "",
      auth: false,
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
  {
    method: "POST",
    path: "/send-test-email",
    handler: "authentication.sendTestEmail",
    config: {
      prefix: "",
      auth: false,
    },
  },
  {
    method: "POST",
    path: "/check-user-status",
    handler: "authentication.checkUserStatus",
    config: {
      prefix: "",
      auth: false,
    },
  },
  {
    method: "PUT",
    path: "/accept-tos",
    handler: "authentication.acceptTos",
    config: {
      prefix: "",
    },
  },
  {
    method: "PUT",
    path: "/profile-picture",
    handler: "profile.updateProfilePicture",
    config: {
      prefix: "",
    },
  },
  {
    method: "PUT",
    path: "/profile",
    handler: "profile.updateProfile",
    config: {
      prefix: "",
    },
  },
  {
    method: "GET",
    path: "/profile/:userId",
    handler: "profile.getProfile",
    config: {
      prefix: "",
    },
  },
  {
    method: "GET",
    path: "/mesibo/profile/:mesibo_id",
    handler: "profile.getMesiboProfile",
    config: {
      prefix: "",
    },
  },
  {
    method: "GET",
    path: "/check-username",
    handler: "authentication.checkUsername",
    config: {
      prefix: "",
    },
  },
  {
    method: "PUT",
    path: "/username",
    handler: "authentication.updateUsername",
    config: {
      prefix: "",
    },
  },
  {
    method: "PUT",
    path: "/fcm-token",
    handler: "profile.updateFCMToken",
    config: {
      prefix: "",
    },
  },
  {
    method: "GET",
    path: "/fcm-token",
    handler: "profile.getUserFCMToken",
    config: {
      prefix: "",
    },
  },
  {
    method: "GET",
    path: "/get-avatar-ring-colors",
    handler: "profile.getAvatarRingColors",
    config: {
      prefix: "",
    },
  },
  {
    method: "GET",
    path: "/mesibo",
    handler: "authentication.generateMesiboToken",
    config: {
      prefix: "",
    },
  },
];
