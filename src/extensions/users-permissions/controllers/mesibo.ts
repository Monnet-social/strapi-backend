import HelperService from "../../../utils/helper_service";
module.exports = {
  async getProfile(ctx) {
    const { userId } = ctx.params;
    const { id: currentUserId } = ctx.state.user;

    if (!userId) return ctx.badRequest("User ID is required.");

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
            "gender",
            "professional_info",
            "is_public",
            "badge",
            "avatar_ring_color",
            "play_mature_content",
          ],
          populate: { profile_picture: true, location: true },
        }
      );

      if (!user) return ctx.notFound("User not found.");

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        postsCount,
        followersCount,
        followingCount,
        mutualFollowersCount,
        followRequestCount,
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
      ]);

      await Promise.all([
        strapi
          .service("api::post.post")
          .enrichUsersWithOptimizedProfilePictures([user]),
        strapi.service("api::following.following").enrichItemsWithFollowStatus({
          items: [{ user }],
          userPaths: ["user"],
          currentUserId,
        }),
      ]);

      const canViewContent =
        user.is_public || (user as any).is_following || currentUserId == userId;

      let userPosts = [];
      let userStories = [];

      if (canViewContent) {
        const postsPromise = strapi.entityService.findMany("api::post.post", {
          filters: { posted_by: { id: userId }, post_type: "post" },
          sort: { createdAt: "desc" },
          populate: {
            category: true,
            tagged_users: {
              fields: [
                "id",
                "username",
                "name",
                "avatar_ring_color",
                "is_public",
              ],
              populate: { profile_picture: true },
            },
            media: true,
            posted_by: {
              fields: [
                "id",
                "username",
                "name",
                "avatar_ring_color",
                "is_public",
              ],
              populate: { profile_picture: true },
            },
          },
        });

        const storiesPromise = strapi.entityService.findMany("api::post.post", {
          filters: {
            posted_by: { id: userId },
            post_type: "story",
            createdAt: { $gte: twentyFourHoursAgo },
          },
          sort: { createdAt: "desc" },
          populate: {
            media: true,
            posted_by: {
              fields: ["id", "username"],
              populate: { profile_picture: true },
            },
          },
        });

        [userPosts, userStories] = await Promise.all([
          postsPromise,
          storiesPromise,
        ]);

        if (userPosts.length > 0) {
          const categoryIds = [
            ...new Set(
              userPosts.map((post) => post.category?.id).filter(Boolean)
            ),
          ];
          let subcategoriesByCategory = new Map();
          if (categoryIds.length > 0) {
            const allSubcategories = await strapi.entityService.findMany(
              "api::subcategory.subcategory",
              {
                filters: { category: { id: { $in: categoryIds } } },
                populate: { category: true },
                pagination: { limit: -1 },
              }
            );
            for (const subcat of allSubcategories) {
              const catId = (subcat as any).category?.id;
              if (!catId) continue;
              if (!subcategoriesByCategory.has(catId))
                subcategoriesByCategory.set(catId, []);
              subcategoriesByCategory.get(catId).push(subcat);
            }
          }

          const usersToProcess = userPosts
            .flatMap((p) => [p.posted_by, ...(p.tagged_users || [])])
            .filter(Boolean);

          const allUserIds = [...new Set(usersToProcess.map((u) => u.id))];
          const allMedia = userPosts
            .flatMap((p) => p.media || [])
            .filter(Boolean);

          const [optimizedMediaArray, followStatusMap] = await Promise.all([
            strapi.service("api::post.post").getOptimisedFileData(allMedia),
            strapi
              .service("api::following.following")
              .getFollowStatusForUsers(currentUserId, allUserIds),
            strapi
              .service("api::post.post")
              .enrichUsersWithOptimizedProfilePictures(usersToProcess),
          ]);

          const optimizedMediaMap = new Map(
            (optimizedMediaArray || []).map((m) => [m.id, m])
          );

          await Promise.all(
            userPosts.map(async (post) => {
              const [
                likes_count,
                is_liked,
                dislikes_count,
                is_disliked,
                comments_count,
                share_count,
              ] = await Promise.all([
                strapi.services["api::like.like"].getLikesCount(post.id),
                strapi.services["api::like.like"].verifyPostLikeByUser(
                  post.id,
                  currentUserId
                ),
                strapi
                  .service("api::dislike.dislike")
                  .getDislikesCountByPostId(post.id),
                strapi
                  .service("api::dislike.dislike")
                  .verifyPostDislikedByUser(post.id, currentUserId),
                strapi.services["api::comment.comment"].getCommentsCount(
                  post.id
                ),
                strapi.services["api::share.share"].countShares(post.id),
              ]);
              Object.assign(post, {
                likes_count,
                is_liked,
                dislikes_count,
                is_disliked,
                comments_count,
                share_count,
                subcategories:
                  subcategoriesByCategory.get(post.category?.id) || [],
                media: (post.media || []).map(
                  (m) => optimizedMediaMap.get(m.id) || m
                ),
                posted_by: {
                  ...post.posted_by,
                  ...followStatusMap.get(post.posted_by.id),
                },
                tagged_users: (post.tagged_users || []).map((u) => ({
                  ...u,
                  ...followStatusMap.get(u.id),
                })),
              });
            })
          );
        }
      }

      if (userStories.length > 0) {
        const allStoryMedia = userStories
          .flatMap((s) => s.media || [])
          .filter(Boolean);
        const optimizedStoryMedia = await strapi
          .service("api::post.post")
          .getOptimisedFileData(allStoryMedia);
        const optimizedStoryMap = new Map(
          (optimizedStoryMedia || []).map((m) => [m.id, m])
        );
        userStories = userStories.map((s) => ({
          ...s,
          media: (s.media || []).map((m) => optimizedStoryMap.get(m.id) || m),
        }));
      }

      await strapi.entityService.update(
        "plugin::users-permissions.user",
        userId,
        { data: { last_active_at: new Date() } }
      );

      const isRequestSent =
        !(user as any).is_following &&
        currentUserId != userId &&
        followRequestCount > 0;

      let locationWithNames = (user as any).location;
      if (locationWithNames?.latitude && locationWithNames?.longitude) {
        try {
          const { city, country } = await HelperService.reverseGeocodeCoords(
            locationWithNames.latitude,
            locationWithNames.longitude
          );
          locationWithNames = { ...locationWithNames, city, country };
        } catch (err) {
          console.error("Error fetching city and country:", err);
        }
      }

      const profileData = {
        id: user.id,
        username: user.username,
        name: user.name,
        bio: user.bio,
        website: user.website,
        professional_info: user.professional_info,
        location: locationWithNames,
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
        posts: userPosts,
        stories: userStories,
        is_self: currentUserId == userId,
        play_mature_content: user.play_mature_content,
      };

      return ctx.send(profileData);
    } catch (err) {
      console.error("Get Profile Error:", err);
      return ctx.internalServerError(
        "An error occurred while fetching the profile."
      );
    }
  },
};
