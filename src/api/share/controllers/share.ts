import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::share.share",
  ({ strapi }) => ({
    async createShare(ctx) {
      const { postId, profileId } = ctx.request.body;
      const userId = ctx.state.user.id;

      if (!postId && !profileId)
        return ctx.badRequest(
          "Either postId or profileId is required to create a share."
        );

      let shareData: any = { shared_by: userId };
      let shareUrl = "";
      let successMessage = "";

      if (postId) {
        const postService = strapi.service("api::post.post");
        const originalPost = await postService.resolveOriginalPost(postId);
        const originalId = originalPost ? originalPost.id : postId;

        shareData.post = originalId;
        successMessage = "Post shared successfully";
        shareUrl = `${process.env.FRONTEND_URL}/post/${originalId}`;
      } else if (profileId) {
        shareData.shared_profile = profileId;
        successMessage = "Profile shared successfully";
        shareUrl = `${process.env.FRONTEND_URL}/profile/${profileId}`;
      }

      try {
        await strapi.entityService.create("api::share.share", {
          data: shareData,
        });
        return {
          message: successMessage,
          share: shareUrl,
        };
      } catch (error) {
        console.error("Error creating share:", error);
        return ctx.internalServerError(
          "An error occurred while creating the share."
        );
      }
    },
  })
);
