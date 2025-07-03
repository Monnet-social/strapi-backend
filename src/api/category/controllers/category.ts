"use strict";

export default {
    async getCategories(ctx) {
        try {
            // 1. Fetch all subcategories and populate their parent category information.
            const subcategories = await strapi.entityService.findMany(
                "api::subcategory.subcategory",
                { populate: { category: { fields: ["id", "name"] } } }
            );

            // 2. Group the subcategories by their parent category using a Map for efficiency.
            const categoryMap = new Map();

            for (const sub of subcategories) {
                // Proceed only if the subcategory is correctly linked to a parent category.
                if ((sub as any).category) {
                    const parentCategory = (sub as any).category;

                    // If we haven't seen this parent category before, add it to our map.
                    if (!categoryMap.has(parentCategory.id)) {
                        categoryMap.set(parentCategory.id, {
                            id: parentCategory.id,
                            name: parentCategory.name,
                            subcategories: [], // Initialize an empty array for its subcategories
                        });
                    }

                    // Add the current subcategory (just its name) to its parent's list.
                    categoryMap.get(parentCategory.id).subcategories.push({
                        id: sub.id,
                        name: sub.name,
                    });
                }
            }

            // 3. Convert the map of grouped categories into the final array format.
            const formattedResponse = Array.from(categoryMap.values());

            // 4. Send the formatted response.
            return ctx.send(formattedResponse);
        } catch (error) {
            console.error(
                "Error fetching categories with subcategories:",
                error
            );
            return ctx.internalServerError(
                "An error occurred while fetching the categories."
            );
        }
    },
};
