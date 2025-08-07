import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::algorithm-control.algorithm-control",
  ({ strapi }) => ({
    async findOrCreate(userId: string) {
      //   const existingControl = await strapi
      //     .documents("api::algorithm-control.algorithm-control")
      //     .findMany({
      //       filters: { user: { documentId: userId } },
      //       populate: {
      //         categories_entry: {
      //           populate: {
      //             category: true,
      //           },
      //         },
      //       },
      //     });
      const existingControl = await strapi.entityService.findMany(
        "api::algorithm-control.algorithm-control",
        {
          filters: { user: { id: userId } },
          populate: {
            categories_entry: {
              populate: {
                category: true,
              },
            },
          },
        }
      );

      const findUser = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: { id: userId },
        }
      );
      if (!findUser || findUser.length === 0) {
        throw new Error("User not found");
      }
      console.log("exisitn control", existingControl);
      if (existingControl.length > 0) {
        return existingControl[0];
      }

      const newControl = await this.generateDefaultControl(
        findUser[0].documentId
      );
      return newControl;
    },

    async generateDefaultControl(userId: string) {
      const categories = await strapi
        .documents("api::category.category")
        .findMany();

      const newControl = await strapi
        .documents("api::algorithm-control.algorithm-control")
        .create({
          data: {
            user: { documentId: userId },
            friends: 100,
            followings: 100,
            recommendations: 100,
            distance: 100,
            categories_entry: categories.map((category) => ({
              category: { documentId: category.documentId },
              weight: 100,
            })),
          },
          populate: {
            categories_entry: {
              populate: {
                category: true,
              },
            },
          },
        });

      return newControl;
    },
  })
);
