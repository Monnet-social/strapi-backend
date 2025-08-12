import HelperService from "../../../utils/helper_service";
import MesiboService from "../../../utils/mesibo_service";
module.exports = {
  async getProfile(ctx) {
    const { userId } = ctx.params;
    const { id: currentUserId } = ctx.state.user;

    if (!userId) return ctx.badRequest("User ID is required.");

    try {
      let user = await strapi.entityService.findOne(
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
            "mesibo_id",
            "mesibo_token",
          ],
          populate: { profile_picture: true, location: true },
        }
      );

      if (!user) return ctx.notFound("User not found.");
      console.log("User found:", user);
      if (!user.mesibo_id) {
        const newMesiboUser = await MesiboService.editMesiboUser(userId);

        user.mesibo_id = newMesiboUser.uid?.toString();
        user.mesibo_token = newMesiboUser.token;
      }

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
  async updateProfile(ctx) {
    const { user } = ctx.state;
    if (!user)
      return ctx.unauthorized("You must be logged in to edit your profile.");

    const body: any = ctx.request.body;
    const dataToUpdate: any = {};
    console.log(body, typeof body.name, body.name);
    if (body.name !== undefined && body.name !== "") {
      if (typeof body.name !== "string")
        return ctx.badRequest("Name must be a non-empty string.");
      dataToUpdate.name = body.name.trim();
    }
    if (body.bio !== undefined && body.bio !== "") {
      if (typeof body.bio !== "string")
        return ctx.badRequest("Bio must be a string.");
      dataToUpdate.bio = body.bio.trim();
    }
    if (body.website !== undefined && body.website !== "") {
      if (
        typeof body.website !== "string" ||
        !HelperService.WEBSITE_REGEX.test(body.website)
      )
        return ctx.badRequest("Website must be a non-empty string.");
      dataToUpdate.website = body.website.trim();
    }
    if (body.date_of_birth !== undefined && body.date_of_birth !== "") {
      if (!HelperService.DATE_REGEX.test(body.date_of_birth))
        return ctx.badRequest("Invalid date format. Please use YYYY-MM-DD.");
      if (new Date(body.date_of_birth) > new Date())
        return ctx.badRequest("Date of birth cannot be in the future.");
      dataToUpdate.date_of_birth = body.date_of_birth;
    }
    if (body.username !== undefined && body.username !== "") {
      if (!HelperService.USERNAME_REGEX.test(body.username))
        return ctx.badRequest(
          "Username must be 3-20 characters long and can only contain letters, numbers, and underscores."
        );
      const existingUsers = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: { username: body.username, id: { $ne: user.id } },
        }
      );
      if (existingUsers.length > 0)
        return ctx.conflict("Username is already taken.");
      dataToUpdate.username = body.username;
    }
    if (
      body.profile_picture_id !== undefined &&
      body.profile_picture_id !== ""
    ) {
      if (
        typeof body.profile_picture_id !== "number" ||
        isNaN(body.profile_picture_id)
      )
        return ctx.badRequest("profile_picture_id must be a number.");
      const file = await strapi.entityService.findOne(
        "plugin::upload.file",
        body.profile_picture_id
      );
      if (!file)
        return ctx.notFound(
          "The specified profile picture could not be found."
        );
      dataToUpdate.profile_picture = body.profile_picture_id;
    }
    if (body.professional_info !== undefined || body.professional_info !== "")
      dataToUpdate.professional_info = body.professional_info;

    if (
      body.location !== undefined &&
      body.latitude !== "" &&
      body.longitude !== "" &&
      body.address !== "" &&
      body.zip !== ""
    ) {
      if (typeof body.location !== "object" || body.location === null)
        return ctx.badRequest("Location must be a valid object.");

      const { latitude, longitude, address, zip } = body.location;
      if (typeof latitude !== "number" || typeof longitude !== "number")
        return ctx.badRequest("Latitude and longitude must be numbers.");

      if (typeof address !== "string" || typeof zip !== "string")
        return ctx.badRequest("Address and zip must be strings.");

      dataToUpdate.location = body.location;
    }

    if (body.is_public !== undefined && body.is_public !== "") {
      if (typeof body.is_public !== "boolean") {
        return ctx.badRequest(
          "is_public must be a boolean value (true or false)."
        );
      }
      dataToUpdate.is_public = body.is_public;
    }

    if (body.badge !== undefined && body.badge !== "") {
      const allowedBadges = ["verified"];
      if (
        typeof body.badge !== "string" ||
        !allowedBadges.includes(body.badge)
      ) {
        return ctx.badRequest(
          `Invalid badge. Allowed value is: ${allowedBadges.join(", ")}.`
        );
      }
      dataToUpdate.badge = body.badge;
    }
    if (body.gender !== undefined && body.gender !== "") {
      dataToUpdate.gender = body.gender;
    }

    if (body.avatar_ring_color !== undefined && body.avatar_ring_color !== "") {
      if (
        typeof body.avatar_ring_color !== "string" ||
        !HelperService.HEX_COLOR_REGEX.test(body.avatar_ring_color)
      )
        return ctx.badRequest(
          "Invalid hex color format for avatar_ring_color."
        );
      dataToUpdate.avatar_ring_color = body.avatar_ring_color;
    }

    if (
      body.play_mature_content !== undefined &&
      body.play_mature_content !== ""
    ) {
      if (typeof body.play_mature_content !== "boolean")
        return ctx.badRequest(
          "play_mature_content must be a boolean value (true or false)."
        );
      dataToUpdate.play_mature_content = body.play_mature_content;
    }
    if (Object.keys(dataToUpdate).length === 0)
      return ctx.badRequest("No valid fields were provided for update.");

    try {
      const updatedUser = await strapi.entityService.update(
        "plugin::users-permissions.user",
        user.id,
        {
          data: dataToUpdate,
          populate: { profile_picture: true, location: true },
          fields: [
            "id",
            "username",
            "email",
            "bio",
            "website",
            "name",
            "is_email_verified",
            "referral_code",
            "date_of_birth",
            "professional_info",
            "is_public",
            "badge",
            "gender",
            "avatar_ring_color",
            "play_mature_content",
          ] as any,
        }
      );

      await strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures([updatedUser]);

      delete updatedUser.password;

      let userStories = [];
      if ((updatedUser as any).is_public) {
        const twentyFourHoursAgo = new Date(
          new Date().getTime() - 24 * 60 * 60 * 1000
        );
        userStories = await strapi.entityService.findMany("api::post.post", {
          filters: {
            posted_by: { id: user.id },
            post_type: "story",
            createdAt: { $gte: twentyFourHoursAgo },
          },
          populate: { media: true },
        });

        for (const story of userStories) {
          (story as any).media = await strapi
            .service("api::post.post")
            .getOptimisedFileData((story as any).media);
        }
      }

      return ctx.send({ user: updatedUser, stories: userStories });
    } catch (error) {
      strapi.log.error("Error in updateProfile controller:", error);
      return ctx.internalServerError(
        "An error occurred while updating the profile."
      );
    }
  },

  async updateProfilePicture(ctx): Promise<void> {
    const { user } = ctx.state;
    if (!user)
      return ctx.unauthorized("You must be logged in to perform this action.");

    const { mediaId } = ctx.request.body;
    if (!mediaId || isNaN(mediaId))
      return ctx.badRequest('Invalid input: "mediaId" must be a number.');

    try {
      const newFile = await strapi.entityService.findOne(
        "plugin::upload.file",
        mediaId
      );
      if (!newFile)
        return ctx.notFound("The specified new media file could not be found.");

      const currentUser = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        user.id,
        { populate: { profile_picture: { fields: ["id"] } } }
      );

      const oldProfilePictureId = (currentUser as any).profile_picture?.id;

      if (oldProfilePictureId && oldProfilePictureId !== mediaId) {
        console.log(
          `Deleting old profile picture with ID: ${oldProfilePictureId}`
        );
        await strapi
          .service("api::file-optimisation.file-optimisation")
          .deleteOptimisedFile(oldProfilePictureId);
      }

      const updatedUser = await strapi.entityService.update(
        "plugin::users-permissions.user",
        user.id,
        {
          data: { profile_picture: mediaId },
          populate: { profile_picture: true },
        }
      );
      delete updatedUser.password;
      await strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures([updatedUser]);

      ctx.send({
        user: updatedUser,
        message: "Profile picture updated successfully.",
      });
    } catch (error) {
      strapi.log.error("Error updating profile picture:", error);
      return ctx.internalServerError(
        "An error occurred while updating the profile picture."
      );
    }
  },

  async getAvatarRingColors(ctx) {
    return ctx.send({
      message: "Fetched colors succesfully",
      avatarRingColors: HelperService.avatarRingColors,
    });
  },
};
