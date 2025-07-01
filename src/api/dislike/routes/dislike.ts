export default {
    routes: [
        {
            method: "POST",
            path: "/dislikes/post",
            handler: "dislike.dislikePost",
        },
        {
            method: "GET",
            path: "/posts/:post_id/dislikes",
            handler: "dislike.getDislikesByPostId",
        },
    ],
};
