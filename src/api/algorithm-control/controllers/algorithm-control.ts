import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::algorithm-control.algorithm-control",
  ({ strapi }) => ({
    async find(ctx) {
      const { documentId: userId } = ctx.state.user;
      const control = await strapi
        .service("api::algorithm-control.algorithm-control")
        .findOrCreate(userId);

      return control;
    },

    async update(ctx) {
      const { documentId: userId } = ctx.state.user;
      const { controlDocumentId } = ctx.params;

      const data = ctx.request.body;
      let control: any = {};

      if (!data.friends) control.friends = data.friends;

      if (!data.followings) control.followings = data.followings;

      if (!data.recommendations) control.recommendations = data.recommendations;

      if (!data.distance) control.distance = data.distance;

      if (data.categories_entry)
        control.categories_entry = data.categories_entry.map((entry) => ({
          category: { documentId: entry.category.documentId },
          weight: entry.weight,
        }));

      const response = await strapi
        .documents("api::algorithm-control.algorithm-control")
        .update({
          documentId: controlDocumentId,
          filters: { user: { documentId: userId } },
          data: control,
          populate: {
            categories_entry: {
              populate: {
                category: true,
              },
            },
          },
        });

      return response;
    },
  })
);
