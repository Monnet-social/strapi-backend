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
            sort: { createdAt: "desc" },
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

        if (!requests?.length) return ctx.send([]);

        const requesterIds = requests.map((r: any) => r.requested_by.id);

        const [followBackEntries, outgoingRequests, usersWithStories] =
          await Promise.all([
            strapi.entityService.findMany("api::following.following", {
              filters: {
                follower: { id: userId },
                subject: { id: { $in: requesterIds } },
              },
              populate: { subject: { fields: ["id"] } },
            }),
            strapi.entityService.findMany(
              "api::follow-request.follow-request",
              {
                filters: {
                  requested_by: { id: userId },
                  requested_for: { id: { $in: requesterIds } },
                  request_status: { $ne: "REJECTED" },
                },
                populate: { requested_for: { fields: ["id"] } },
              }
            ),
            // Fetch users who have posted stories in last 24h
            strapi.entityService.findMany("api::post.post", {
              filters: {
                posted_by: { id: { $in: requesterIds } },
                post_type: "story",
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              },
              fields: ["id"],
              populate: { posted_by: { fields: ["id"] } },
            }),
          ]);

        const usersYouFollow = new Set(
          followBackEntries.map((e: any) => e.subject.id)
        );
        const outgoingStatus = new Map(
          outgoingRequests.map((r: any) => [
            r.requested_for.id,
            r.request_status,
          ])
        );

        // Build a set of IDs that have active stories within last 24h
        const hasStoriesSet = new Set(
          usersWithStories
            .map((story: any) => story.posted_by?.id)
            .filter(Boolean)
        );

        const usersToProcess = requests.map((r: any) => r.requested_by);
        await strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedProfilePictures(usersToProcess);

        const final = requests.map((req) => {
          const by = (req as any).requested_by;
          const iFollow = usersYouFollow.has(by.id);
          const myReqStatus = outgoingStatus.get(by.id);
          return {
            ...req,
            requested_by: {
              ...by,
              is_accepted: req.request_status === "ACCEPTED",
              is_following: iFollow,
              is_request_sent: !iFollow && myReqStatus === "PENDING",
              is_my_request_accepted: !iFollow && myReqStatus === "ACCEPTED",
              has_stories: hasStoriesSet.has(by.id),
            },
          };
        });

        return ctx.send(final);
      } catch (error) {
        console.error("Error in getFollowRequests:", error);
        return ctx.internalServerError("Failed to fetch follow requests.");
      }
    },
    async manageFollowRequest(ctx) {
      try {
        const userId = ctx.state.user.id;
        const { requestId, action } = ctx.request.body;

        if (!requestId || !action)
          return ctx.badRequest("Both 'requestId' and 'action' required.");
        if (!["ACCEPT", "REJECT"].includes(action))
          return ctx.badRequest("Invalid action. Must be ACCEPT or REJECT.");

        const request = await strapi.entityService.findOne(
          "api::follow-request.follow-request",
          requestId,
          { populate: { requested_by: true, requested_for: true } }
        );
        if (!request) return ctx.notFound("Request not found.");
        if ((request as any).requested_for.id !== userId)
          return ctx.unauthorized("Not allowed.");

        if (action === "ACCEPT") {
          const requesterId = (request as any).requested_by.id;

          const already = await strapi.entityService.count(
            "api::following.following",
            {
              filters: {
                follower: { id: requesterId },
                subject: { id: userId },
              },
            }
          );
          if (!already)
            await strapi.entityService.create("api::following.following", {
              data: { follower: { id: requesterId }, subject: { id: userId } },
            });

          await strapi.entityService.update(
            "api::follow-request.follow-request",
            request.id,
            { data: { request_status: "ACCEPTED" } }
          );

          return ctx.send({
            message: "Follow request accepted.",
            data: { requestId, is_following: false },
          });
        } else {
          await strapi.entityService.update(
            "api::follow-request.follow-request",
            request.id,
            {
              data: { request_status: "REJECTED" },
            }
          );
          return ctx.send({
            message: "Follow request rejected.",
            data: { requestId },
          });
        }
      } catch (error) {
        console.error("Error in manageFollowRequest:", error);
        return ctx.internalServerError("Error managing follow request.");
      }
    },

    async deleteRequest(ctx) {
      try {
        const userId = ctx.state.user.id;
        const { id: requestId } = ctx.params;
        if (!requestId) return ctx.badRequest("Request ID is required.");

        const request = await strapi.entityService.findOne(
          "api::follow-request.follow-request",
          requestId,
          {
            populate: {
              requested_for: { fields: ["id"] },
              requested_by: { fields: ["id"] },
            },
          }
        );
        if (!request) return ctx.notFound("Request not found.");

        if (
          (request as any).requested_for.id !== userId &&
          (request as any).requested_by.id !== userId
        )
          return ctx.unauthorized(
            "You are not authorized to delete this request."
          );

        const deleted = await strapi.entityService.delete(
          "api::follow-request.follow-request",
          requestId
        );
        return ctx.send({
          message: "Follow request deleted.",
          data: { id: deleted.id },
        });
      } catch (error) {
        console.error("Error in deleteRequest:", error);
        return ctx.internalServerError("Error deleting follow request.");
      }
    },
  })
);
