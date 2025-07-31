import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::post-view.post-view', ({ strapi }) => ({
    async markPostAsViewed(postId: string, userId: string, timeInSeconds: number = 1) {
        const currentEntry = await strapi.documents("api::post-view.post-view").findFirst({
            filters: {
                post: { documentId: postId },
                user: { documentId: userId },
            },
        });
        if (currentEntry) {
            return strapi.documents("api::post-view.post-view").update({
                documentId: currentEntry.documentId,
                data: {
                    watchedSeconds: currentEntry.watchedSeconds + timeInSeconds,
                },
            });
        }

        return strapi.documents("api::post-view.post-view").create({
            data: {
                post: { documentId: postId },
                user: { documentId: userId },
                watchedSeconds: timeInSeconds,
            },
        });
    }
}));
