import { factories } from "@strapi/strapi";

export default factories.createCoreController(
    "api::share.share",
    ({ strapi }) => ({
        async createShare(ctx) {
            const { postId } = ctx.request.body;
            const userId = ctx.state.user.id;

            await strapi.entityService.create("api::share.share", {
                data: {
                    post: postId,
                    shared_by: userId,
                },
            });
            return {
                message: "Post shared successfully",
                share: `${process.env.FRONTEND_URL}/post/${postId}`,
            };
        },
    })
);
