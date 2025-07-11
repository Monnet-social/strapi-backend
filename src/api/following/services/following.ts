export default ({ strapi }: { strapi }) => ({
    async getFollowRelationships(currentUserId, targetUserIds: any[]) {
        if (!currentUserId || !targetUserIds || targetUserIds.length === 0)
            return {
                iFollowIds: new Set(),
                followsMeIds: new Set(),
            };

        const [iFollowRelations, followsMeRelations] = await Promise.all([
            strapi.entityService.findMany("api::following.following", {
                filters: {
                    follower: currentUserId,
                    subject: { id: { $in: targetUserIds } },
                },
                populate: { subject: true },
            }),
            strapi.entityService.findMany("api::following.following", {
                filters: {
                    subject: currentUserId,
                    follower: { id: { $in: targetUserIds } },
                },
                populate: { follower: true },
            }),
        ]);

        const iFollowIds = new Set(
            iFollowRelations.map((rel: any) => rel.subject.id)
        );
        const followsMeIds = new Set(
            followsMeRelations.map((rel: any) => rel.follower.id)
        );

        return { iFollowIds, followsMeIds };
    },

    async enrichItemsWithFollowStatus({ items, userPaths, currentUserId }) {
        if (
            !items ||
            items.length === 0 ||
            !currentUserId ||
            !userPaths ||
            userPaths.length === 0
        )
            return;

        const allUserIds = new Set<any>();
        for (const item of items)
            for (const path of userPaths) {
                const usersData = item[path];
                if (Array.isArray(usersData))
                    usersData.forEach(
                        (user) => user && user.id && allUserIds.add(user.id)
                    );
                else if (usersData && usersData.id)
                    allUserIds.add(usersData.id);
            }

        if (allUserIds.size === 0) return;

        const { iFollowIds, followsMeIds } = await this.getFollowRelationships(
            currentUserId,
            Array.from(allUserIds)
        );

        for (const item of items) {
            for (const path of userPaths) {
                const usersData = item[path];

                const enrichUser = (user: any) => {
                    if (user && user.id) {
                        user.is_following = iFollowIds.has(user.id);
                        user.is_follower = followsMeIds.has(user.id);
                    }
                };

                if (Array.isArray(usersData)) usersData.forEach(enrichUser);
                else enrichUser(usersData);
            }
        }
    },
});
