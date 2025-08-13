import HelperService from "../../../utils/helper_service";
module.exports = {
  async getProfile(ctx) {
    const { userId } = ctx.params;
    const { id: currentUserId } = ctx.state;

    if (!userId) {
      return ctx.badRequest("User ID is required.");
    }

    try {
      const user = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
        {
          fields: [
            "id",
            "username",
            "name",
            "bio",
            "website",
            "professional_info",
            "is_public",
            "badge",
            "avatar_ring_color",
            "play_mature_content",
          ],
          populate: { profile_picture: true, location: true },
        }
      );

      if (!user) {
        return ctx.notFound("User not found");
      }

      // Prepare date filter for stories within last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Parallel fetch counts for posts, followers, following, mutual followers, follow requests, and active stories
      const [
        postsCount,
        followersCount,
        followingCount,
        mutualFollowersCount,
        followRequestCount,
        activeStoryCount,
      ] = await Promise.all([
        strapi.entityService.count("api::post.post", {
          filters: { posted_by: { id: userId }, post_type: "post" },
        }),
        strapi.entityService.count("api::following.following", {
          filters: { subject: { id: userId } },
        }),
        strapi.entityService.count("api::following.following", {
          filters: { follower: { id: userId } },
        }),
        strapi
          .service("api::following.following")
          .getMutualFollowersCount(currentUserId, userId),
        strapi.entityService.count("api::follow-request.follow-request", {
          filters: {
            requested_by: { id: currentUserId },
            requested_for: { id: userId },
          },
        }),
        // Count of active stories (created within 24 hours)
        strapi.entityService.count("api::post.post", {
          filters: {
            posted_by: { id: userId },
            post_type: "story",
            createdAt: { $gte: twentyFourHoursAgo },
          },
        }),
      ]);

      // Enrich user data
      await Promise.all([
        strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedPictures([user]),
        strapi.service("api::following.following").enrichItemsWithFollowStatus({
          items: [{ user }],
          userPaths: ["user"],
          currentUserId,
        }),
      ]);

      // Update last_active time
      await strapi.entityService.update(
        "plugin::users-permissions.user",
        userId,
        {
          data: { last_active_at: new Date() },
        }
      );

      const isRequestSent =
        !(user as any)?.is_following &&
        currentUserId !== userId &&
        followRequestCount > 0;

      // Optional location enrichment with reverse geocoding can be added here if needed...

      const profileData = {
        id: user.id,
        username: user.username,
        name: user.name,
        bio: user.bio,
        website: user.website,
        professional_info: user.professional_info,
        location: (user as any).location, // enriched if you keep that from your code
        is_public: user.is_public,
        badge: user.badge,
        avatar_ring_color: user.avatar_ring_color,
        profile_picture: (user as any).profile_picture,
        stats: {
          posts: postsCount,
          followers: followersCount,
          following: followingCount,
          mutual_followers: mutualFollowersCount,
        },
        is_following: (user as any).is_following,
        is_follower: (user as any).is_follower,
        is_request_sent: isRequestSent,
        has_stories: activeStoryCount > 0, // <------ New flag here
        is_self: currentUserId === userId,
        play_mature_content: user.play_mature_content,
      };

      return ctx.send(profileData);
    } catch (err) {
      console.error("Error fetching profile:", err);
      return ctx.internalServerError(
        "An error occurred while fetching the profile."
      );
    }
  },
};
