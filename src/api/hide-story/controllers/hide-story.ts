import { factories } from "@strapi/strapi";

type PopulatedHideStory = {
  id: string;
  target?: {
    id: string;
  };
};

export default factories.createCoreController(
  "api::hide-story.hide-story",
  ({ strapi }) => ({
    async hideStory(ctx) {
      const ownerId = ctx.state.user.id;

      const { targetIds } = ctx.request.body;

      if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0)
        return ctx.badRequest(
          "An array of 'targetIds' is required in the request body."
        );

      const uniqueTargetIds = [
        ...new Set(targetIds.filter((id) => id !== ownerId)),
      ];

      if (uniqueTargetIds.length === 0)
        return ctx.badRequest("No valid target IDs provided.");

      try {
        const existingRules = await strapi.entityService.findMany(
          "api::hide-story.hide-story",
          {
            filters: {
              owner: { id: ownerId },
              target: { id: { $in: uniqueTargetIds } },
            },
            populate: { target: { fields: ["id"] } },
          }
        );
        const existingRulesMap = new Map(
          (existingRules as PopulatedHideStory[])
            .filter((rule) => rule.target?.id != null)
            .map((rule) => [rule.target.id, rule.id])
        );

        const promisesToCreate = [];
        const idsToDelete = [];
        const results = [];

        for (const targetId of uniqueTargetIds) {
          const ruleIdToDelete = existingRulesMap.get(targetId);

          if (ruleIdToDelete) {
            idsToDelete.push(ruleIdToDelete);
            results.push({ targetId, is_hidden: false });
          } else {
            promisesToCreate.push(
              strapi.entityService.create("api::hide-story.hide-story", {
                data: {
                  owner: ownerId,
                  target: targetId,
                },
              })
            );
            results.push({ targetId, is_hidden: true });
          }
        }

        const deletePromises = idsToDelete.map((id) =>
          strapi.entityService.delete("api::hide-story.hide-story", id)
        );

        await Promise.all([...deletePromises, ...promisesToCreate]);

        return ctx.send({
          message: "Hide story status updated for all provided users.",
          results,
        });
      } catch (error) {
        strapi.log.error(
          "Error in hide-story toggleMultiple controller:",
          error
        );
        return ctx.internalServerError(
          "An error occurred during the bulk toggle operation."
        );
      }
    },
  })
);
