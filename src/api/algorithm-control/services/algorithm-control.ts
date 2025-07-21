import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::algorithm-control.algorithm-control', ({ strapi }) => ({
    async findOrCreate(userId: string) {
        const existingControl = await strapi.documents("api::algorithm-control.algorithm-control").findOne({
            documentId: userId,
            populate: {
                categories_entry: {
                    populate: {
                        category: true,
                    }
                },
            }
        });
        if (existingControl) {
            return existingControl;
        }

        const newControl = await this.generateDefaultControl(userId);
        return newControl;
    },

    async generateDefaultControl(userId: string) {
        const categories = await strapi.documents("api::category.category").findMany();

        const newControl = await strapi.documents("api::algorithm-control.algorithm-control").create({
            data: {
                user: { documentId: userId },
                friends: 100,
                followings: 100,
                recommendations: 100,
                distance: 100,
                categories_entry: categories.map(category => ({
                    category: { documentId: category.documentId },
                    weight: 100,
                })),
            },
            populate: {
                categories_entry: {
                    populate: {
                        category: true,
                    }
                },
            }
        });

        return newControl;
    },
}));
