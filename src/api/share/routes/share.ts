export default {
    routes: [
        {
            method: "POST",
            path: "/share",
            handler: "share.createShare",
            config: {
                prefix: "",
            },
        },
    ],
};
