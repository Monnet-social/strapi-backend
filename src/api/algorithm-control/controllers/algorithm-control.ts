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
      const { id: userId } = ctx.state.user;

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

      const alog_control = await strapi
        .service("api::algorithm-control.algorithm-control")
        .findOrCreate(userId);
      if (!alog_control.id) {
        return ctx.badRequest("Control document not found for user.");
      }
      console.log("Updating algorithm control for user:", userId);
      const data = ctx.request.body;
      let control: any = {};

      if (data.friends) control.friends = data.friends;

      if (data.followings) control.followings = data.followings;

      if (data.recommendations) control.recommendations = data.recommendations;

      if (data.distance) control.distance = data.distance;

      if (data.categories_entry) {
        //get old category and new category map with category id and then remove id from component and create new category with updated data and create new one
        let categories = [];
        for (const entry of alog_control.categories_entry) {
          console.log("Processing category entry:", entry);
          const updatedCategory = data.categories_entry.find(
            (cat) => cat.category.id === entry.category.id
          );
          if (updatedCategory) {
            // If the category exists, update its weight
            categories.push({
              category: updatedCategory.category.id,
              weightage: updatedCategory.weight,
            });
          } else {
            // If the category does not exist, get old category and push them by removing id
            categories.push({
              category: entry.category.id,
              weightage: entry.weightage,
            });
          }
        }
        control.categories_entry = categories;
      }

      console.log(
        "Updating control document with ID:",
        control.categories_entry
      );

      console.log("Updating control document with ID:", control);

      const response = await strapi.entityService.update(
        "api::algorithm-control.algorithm-control",
        alog_control.id,
        {
          data: control,
          populate: {
            categories_entry: {
              populate: {
                category: true,
              },
            },
          },
        }
      );

      return ctx.send({
        message: "Algorithm control updated successfully",
        data: response,
      });
    },
  })
);
