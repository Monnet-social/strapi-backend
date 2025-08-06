"use strict";

export default {
  async getCategories(ctx) {
    try {
      const subcategories = await strapi.entityService.findMany(
        "api::subcategory.subcategory",
        { populate: { category: { fields: ["id", "name"] } } }
      );

      const categoryMap = new Map();

      for (const sub of subcategories)
        if ((sub as any).category) {
          const parentCategory = (sub as any).category;

          if (!categoryMap.has(parentCategory.id))
            categoryMap.set(parentCategory.id, {
              id: parentCategory.id,
              name: parentCategory.name,
              subcategories: [],
            });

          categoryMap.get(parentCategory.id).subcategories.push({
            id: sub.id,
            name: sub.name,
          });
        }

      const formattedResponse = Array.from(categoryMap.values());

      return ctx.send(formattedResponse);
    } catch (error) {
      console.error("Error fetching categories with subcategories:", error);
      return ctx.internalServerError(
        "An error occurred while fetching the categories."
      );
    }
  },
};
