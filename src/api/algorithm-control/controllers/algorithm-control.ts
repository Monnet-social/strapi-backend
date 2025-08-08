import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::algorithm-control.algorithm-control",
  ({ strapi }) => ({
    async find(ctx) {
      const { id: userId } = ctx.state.user;
      console.log("Fetching algorithm control for user:", userId);
      const control = await strapi
        .service("api::algorithm-control.algorithm-control")
        .findOrCreate(userId);

      return control;
    },

    async update(ctx) {
      const { documentId: userId } = ctx.state.user;
      const { controlDocumentId } = ctx.params;
      // {
      //   friends:0-100,
      //   followings:0-100,
      //   recommendations:0-100,
      //   distance:0-100,
      //   categories_entry: [
      //     {
      //       category: { id: "categoryId" },
      //       weight: 0-100,
      //     },
      //   ],
      // }
      console.log("Updating algorithm control for user:", userId);
      const data = ctx.request.body;
      let control: any = {};

      if (!data.friends) control.friends = data.friends;

      if (!data.followings) control.followings = data.followings;

      if (!data.recommendations) control.recommendations = data.recommendations;

      if (!data.distance) control.distance = data.distance;

      if (data.categories_entry)
        control.categories_entry = data.categories_entry.map((entry) => ({
          category: { id: entry.category.id },
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

      return ctx.send({
        message: "Algorithm control updated successfully",
        data: response,
      });
    },
  })
);
