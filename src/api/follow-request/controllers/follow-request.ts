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
              request_status: { $ne: "REJECTED" },
            },
            populate: {
              requested_by: {
                fields: [
                  "id",
                  "username",
                  "name",
                  "avatar_ring_color",
                  "is_public",
                ],
                populate: { profile_picture: true },
              },
            },
          }
        );

        if (!requests || requests.length === 0) return ctx.send([]);

        const requesterIds = requests.map(
          (request: any) => request.requested_by.id
        );

        const [followBackEntries, outgoingRequestEntries] = await Promise.all([
          strapi.entityService.findMany("api::following.following", {
            filters: {
              follower: { id: userId },
              subject: { id: { $in: requesterIds } },
            },
            populate: { subject: { fields: ["id"] } },
          }),

          strapi.entityService.findMany("api::follow-request.follow-request", {
            filters: {
              requested_by: { id: userId },
              requested_for: { id: { $in: requesterIds } },
              request_status: { $ne: "REJECTED" },
            },
            populate: { requested_for: { fields: ["id"] } },
          }),
        ]);

        const usersYouFollowSet = new Set(
          followBackEntries.map((entry: any) => entry.subject.id)
        );

        const outgoingRequestStatusMap = new Map();
        for (const req of outgoingRequestEntries) {
          if ((req as any).requested_for) {
            outgoingRequestStatusMap.set(
              (req as any).requested_for.id,
              req.request_status
            );
          }
        }

        const usersToEnrich = requests.map(
          (request: any) => request.requested_by
        );

        await strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedProfilePictures(usersToEnrich);

        const finalResponse = requests.map((request: any) => {
          const requester = request.requested_by;
          const iAmFollowing = usersYouFollowSet.has(requester.id);
          const myRequestStatus = outgoingRequestStatusMap.get(requester.id);

          return {
            ...request,
            requested_by: {
              is_accepted: request.request_status === "ACCEPTED",
              ...requester,
              is_following: iAmFollowing,
              is_request_sent: !iAmFollowing && myRequestStatus === "PENDING",
              is_my_request_accepted:
                !iAmFollowing && myRequestStatus === "ACCEPTED",
            },
          };
        });

        return ctx.send(finalResponse);
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
          { populate: { requested_by: true, requested_for: true } }
        );

        if (!request)
          return ctx.notFound("The follow request could not be found.");

        if ((request as any).requested_for.id !== userId)
          return ctx.unauthorized(
            "You are not authorized to manage this follow request."
          );

        if (action === "ACCEPT") {
          const requesterId = (request as any).requested_by.id;
          const [followBackStatus] = await Promise.all([
            strapi.entityService.count("api::following.following", {
              filters: {
                follower: { id: userId },
                subject: { id: requesterId },
              },
            }),
            strapi.entityService.create("api::following.following", {
              data: { follower: { id: requesterId }, subject: { id: userId } },
            }),
            strapi.entityService.update(
              "api::follow-request.follow-request",
              request.id,
              { data: { request_status: "ACCEPTED" } }
            ),
          ]);

          return ctx.send({
            message: "Follow request accepted successfully.",
            data: {
              requestId: request.id,
              is_following: followBackStatus > 0,
            },
          });
        } else {
          await strapi.entityService.update(
            "api::follow-request.follow-request",
            request.id,
            { data: { request_status: "REJECTED" } }
          );

          return ctx.send({
            message: "Follow request has been rejected.",
            data: { requestId: request.id },
          });
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

    async deleteRequest(ctx) {
      try {
        const userId = ctx.state.user.id;
        const { id: requestId } = ctx.params;

        if (!requestId)
          return ctx.badRequest(
            "A 'requestId' is required in the request body."
          );

        const request = await strapi.entityService.findOne(
          "api::follow-request.follow-request",
          requestId,
          { populate: { requested_for: { fields: ["id"] } } }
        );

        if (!request)
          return ctx.notFound("The follow request could not be found.");

        if ((request as any).requested_for.id !== userId)
          return ctx.unauthorized(
            "You are not authorized to delete this request."
          );

        const deletedRequest = await strapi.entityService.delete(
          "api::follow-request.follow-request",
          requestId
        );

        return ctx.send({
          message: "Follow request deleted successfully.",
          data: { id: deletedRequest.id },
        });
      } catch (error: unknown) {
        console.error("Error in deleteRequest:", error);
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred.";
        return ctx.internalServerError(
          "An unexpected error occurred while deleting the follow request.",
          { error: errorMessage }
        );
      }
    },
  })
);
