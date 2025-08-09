import { factories } from "@strapi/strapi";
import { request } from "http";

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
      // sample request body
      //  {
      //   "friends": 73,
      //   "followings": 22,
      //   "recommendations": 91,
      //   "distance": 45,
      //   "categories_entry": [
      //     {
      //       "category": {
      //         "id": 19
      //       },
      //       "weight": 88
      //     },
      //         {
      //       "category": {
      //         "id": 21
      //       },
      //       "weight": 69
      //     }
      //   ]
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
        let categories = [];
        for (const entry of alog_control.categories_entry) {
          console.log("Processing category entry:", entry);
          const updatedCategory = data.categories_entry.find(
            (cat) => cat.category.id === entry.category.id
          );
          if (updatedCategory) {
            categories.push({
              category: updatedCategory.category.id,
              weightage: updatedCategory.weight,
            });
          } else {
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
