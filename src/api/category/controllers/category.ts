"use strict";

module.exports = {
    async getCategories(ctx) {
        try {
            const categories = await strapi.entityService.findMany(
                "api::category.category",
                { populate: { subcategories: { fields: ["id", "name"] } } }
            );

            const formattedResponse = categories.map((category) => ({
                id: category.id,
                name: category.name,
                subcategories: (category as any).subcategories,
            }));

            return ctx.send(formattedResponse);
        } catch (error) {
            strapi.log.error(
                "Error fetching categories with subcategories:",
                error
            );
            return ctx.internalServerError(
                "An error occurred while fetching the categories."
            );
        }
    },
};
