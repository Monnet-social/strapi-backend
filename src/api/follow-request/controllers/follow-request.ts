import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::follow-request.follow-request",
  ({ strapi }) => ({
    async getFollowRequests(ctx) {
      try {
        const userId = ctx.state.user.id;
        const requests = await strapi.entityService.findMany(
          "api::follow-request.follow-request",
          {
            filters: {
              requested_for: { id: userId },
              request_status: "PENDING",
            },
            populate: { requested_by: { fields: ["id", "username"] } },
          }
        );

        return ctx.send(requests);
      } catch (error: unknown) {
        console.error("Error in getFollowRequests:", error);
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred.";
        return ctx.internalServerError(
          "An unexpected error occurred while fetching follow requests.",
          { error: errorMessage }
        );
      }
    },

    async manageFollowRequest(ctx) {
      try {
        const userId = ctx.state.user.id;
        const { requestId, action } = ctx.request.body;

        if (!requestId || !action)
          return ctx.badRequest(
            "Both 'requestId' and 'action' ('ACCEPT' or 'REJECT') are required."
          );

        if (action !== "ACCEPT" && action !== "REJECT")
          return ctx.badRequest(
            "The 'action' must be either 'ACCEPT' or 'REJECT'."
          );

        const request = await strapi.entityService.findOne(
          "api::follow-request.follow-request",
          requestId,
          { populate: ["requested_by", "requested_for"] }
        );

        if (!request)
          return ctx.notFound("The follow request could not be found.");

        if ((request as any).requested_for.id !== userId)
          return ctx.unauthorized(
            "You are not authorized to manage this follow request."
          );

        if (action === "ACCEPT") {
          await strapi.entityService.create("api::following.following", {
            data: {
              follower: (request as any).requested_by.id,
              subject: userId,
            },
          });

          await strapi.entityService.delete(
            "api::follow-request.follow-request",
            request.id
          );

          return ctx.send({ message: "Follow request accepted successfully." });
        } else {
          await strapi.entityService.delete(
            "api::follow-request.follow-request",
            request.id
          );
          return ctx.send({ message: "Follow request rejected successfully." });
        }
      } catch (error: unknown) {
        console.error("Error in manageFollowRequest:", error);
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred.";
        return ctx.internalServerError(
          "An unexpected error occurred while managing the follow request.",
          { error: errorMessage }
        );
      }
    },
  })
);
