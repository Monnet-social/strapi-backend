export default ({ strapi }: { strapi }) => ({
  async getFollowRelationships(currentUserId: number, targetUserIds: any[]) {
    if (!currentUserId || !targetUserIds?.length) {
      return { iFollowIds: new Set(), followsMeIds: new Set() };
    }

    const [iFollowRelations, followsMeRelations] = await Promise.all([
      strapi.entityService.findMany("api::following.following", {
        filters: {
          follower: { id: currentUserId },
          subject: { id: { $in: targetUserIds } },
        },
        populate: { subject: { fields: ["id"] } },
      }),
      strapi.entityService.findMany("api::following.following", {
        filters: {
          subject: { id: currentUserId },
          follower: { id: { $in: targetUserIds } },
        },
        populate: { follower: { fields: ["id"] } },
      }),
    ]);

    const iFollowIds = new Set(
      iFollowRelations.map((rel: any) => rel.subject?.id).filter(Boolean)
    );
    const followsMeIds = new Set(
      followsMeRelations.map((rel: any) => rel.follower?.id).filter(Boolean)
    );

    return { iFollowIds, followsMeIds };
  },

  async enrichItemsWithFollowStatus({ items, userPaths, currentUserId }) {
    if (!items?.length || !currentUserId || !userPaths?.length) return;

    const allUserIds = new Set<number>();

    for (const item of items)
      for (const path of userPaths) {
        const usersData = item[path];
        if (Array.isArray(usersData)) {
          for (const u of usersData) {
            if (u?.id) allUserIds.add(u.id);
          }
        } else if (usersData?.id) allUserIds.add(usersData.id);
      }

    if (!allUserIds.size) return;

    const { iFollowIds, followsMeIds } = await this.getFollowRelationships(
      currentUserId,
      Array.from(allUserIds)
    );

    const enrichUser = (u: any) => {
      if (u?.id) {
        u.is_following = iFollowIds.has(u.id);
        u.is_follower = followsMeIds.has(u.id);
      }
    };

    for (const item of items)
      for (const path of userPaths) {
        const usersData = item[path];
        if (Array.isArray(usersData)) usersData.forEach(enrichUser);
        else enrichUser(usersData);
      }
  },

  async getMutualFollowersCount(currentUserId: number, targetUserId: number) {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId)
      return 0;

    const [currentUserFollowing, targetUserFollowers] = await Promise.all([
      strapi.entityService.findMany("api::following.following", {
        filters: { follower: { id: currentUserId } },
        populate: { subject: { fields: ["id"] } },
      }),
      strapi.entityService.findMany("api::following.following", {
        filters: { subject: { id: targetUserId } },
        populate: { follower: { fields: ["id"] } },
      }),
    ]);

    const currentUserFollowingIds = new Set(
      currentUserFollowing.map((rel) => rel.subject?.id).filter(Boolean)
    );
    const targetUserFollowerIds = new Set(
      targetUserFollowers.map((rel) => rel.follower?.id).filter(Boolean)
    );

    let mutualCount = 0;
    for (const id of currentUserFollowingIds)
      if (targetUserFollowerIds.has(id)) mutualCount++;

    return mutualCount;
  },
  async getFollowStatusForUsers(currentUserId: number, userIds: number[]) {
    if (!currentUserId || !userIds?.length) return new Map();

    const [followBackEntries, outgoingRequestEntries] = await Promise.all([
      strapi.entityService.findMany("api::following.following", {
        filters: {
          follower: { id: currentUserId },
          subject: { id: { $in: userIds } },
        },
        populate: { subject: { fields: ["id"] } },
      }),
      strapi.entityService.findMany("api::follow-request.follow-request", {
        filters: {
          requested_by: { id: currentUserId },
          requested_for: { id: { $in: userIds } },
          request_status: { $ne: "REJECTED" },
        },
        populate: { requested_for: { fields: ["id", "is_public"] } },
      }),
    ]);

    const usersYouFollowSet = new Set(
      followBackEntries.map((entry: any) => entry.subject?.id).filter(Boolean)
    );

    const outgoingRequestStatusMap = new Map<number, string>();
    for (const req of outgoingRequestEntries)
      if (req.requested_for?.id)
        outgoingRequestStatusMap.set(req.requested_for.id, req.request_status);

    const result = new Map<number, any>();
    for (const uid of userIds) {
      const is_following = usersYouFollowSet.has(uid);
      const reqStatus = outgoingRequestStatusMap.get(uid) || null;

      result.set(uid, {
        is_following,
        is_request_sent: !is_following && reqStatus === "PENDING",
        is_my_request_accepted: !is_following && reqStatus === "ACCEPTED",
      });
    }

    return result;
  },
});
