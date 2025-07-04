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
        path: "/check-username",
        handler: "authentication.checkUsername",
        config: {
            prefix: "",
        },
    },
];
