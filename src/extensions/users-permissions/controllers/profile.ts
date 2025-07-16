import HelperService from "../../../utils/helper_service";

async function getProfile(ctx) {
  const { userId } = ctx.params;
  const { id: currentUserId } = ctx.state.user;

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
        ] as any,
        populate: { profile_picture: true, location: true },
      }
    );

    if (!user) {
      return ctx.notFound("User not found.");
    }

    const twentyFourHoursAgo = new Date(
      new Date().getTime() - 24 * 60 * 60 * 1000
    );

    const promises = [
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
      strapi.entityService.findMany("api::post.post", {
        filters: { posted_by: { id: userId }, post_type: "post" },
        sort: { createdAt: "desc" },
        populate: { media: true },
      }),
    ];

    if ((user as any).is_public) {
      promises.push(
        strapi.entityService.findMany("api::post.post", {
          filters: {
            posted_by: { id: userId },
            post_type: "story",
            createdAt: { $gte: twentyFourHoursAgo },
          },
          populate: { media: true },
        })
      );
    }

    const [
      postsCount,
      followersCount,
      followingCount,
      mutualFollowersCount,
      userPosts,
      userStories = [],
    ] = await Promise.all(promises);

    const allMedia = [
      ...userPosts.flatMap((p: any) => p.media || []),
      ...userStories.flatMap((s: any) => s.media || []),
    ].filter(Boolean);

    const [_, optimizedMedia] = await Promise.all([
      strapi
        .service("api::post.post")
        .enrichUsersWithOptimizedProfilePictures([user]),
      strapi.service("api::post.post").getOptimisedFileData(allMedia),
    ]);

    const optimizedMediaMap = new Map(
      (optimizedMedia || []).map((m) => [m.id, m])
    );

    const finalPosts = userPosts.map((p: any) => ({
      ...p,
      media: (p.media || []).map((m) => optimizedMediaMap.get(m.id) || m),
    }));

    const finalStories = userStories.map((s: any) => ({
      ...s,
      media: (s.media || []).map((m) => optimizedMediaMap.get(m.id) || m),
    }));

    const profileData = {
      id: user.id,
      username: user.username,
      name: user.name,
      bio: (user as any).bio,
      website: (user as any).website,
      professional_info: (user as any).professional_info,
      location: (user as any).location,
      is_public: (user as any).is_public,
      badge: (user as any).badge,
      profile_picture: (user as any).profile_picture,
      stats: {
        posts: postsCount,
        followers: followersCount,
        following: followingCount,
        mutual_followers: mutualFollowersCount,
      },
      posts: finalPosts,
      stories: finalStories,
    };

    return ctx.send(profileData);
  } catch (err) {
    console.error("Get Profile Error:", err);
    return ctx.internalServerError(
      "An error occurred while fetching the profile."
    );
  }
}
async function updateProfile(ctx) {
  const { user } = ctx.state;
  if (!user)
    return ctx.unauthorized("You must be logged in to edit your profile.");

  const body: any = ctx.request.body;
  const dataToUpdate: any = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0)
      return ctx.badRequest("Name must be a non-empty string.");
    dataToUpdate.name = body.name.trim();
  }
  if (body.bio !== undefined) {
    if (typeof body.bio !== "string" || body.bio.trim().length === 0)
      return ctx.badRequest("Bio must be a non-empty string.");
    dataToUpdate.bio = body.bio.trim();
  }
  if (body.website !== undefined) {
    if (
      typeof body.website !== "string" ||
      body.website.trim().length === 0 ||
      !HelperService.WEBSITE_REGEX.test(body.website)
    )
      return ctx.badRequest("Website must be a non-empty string.");
    dataToUpdate.website = body.website.trim();
  }
  if (body.date_of_birth !== undefined) {
    if (!HelperService.DATE_REGEX.test(body.date_of_birth))
      return ctx.badRequest("Invalid date format. Please use YYYY-MM-DD.");
    if (new Date(body.date_of_birth) > new Date())
      return ctx.badRequest("Date of birth cannot be in the future.");
    dataToUpdate.date_of_birth = body.date_of_birth;
  }
  if (body.username !== undefined) {
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
  if (body.profile_picture_id !== undefined) {
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
      return ctx.notFound("The specified profile picture could not be found.");
    dataToUpdate.profile_picture = body.profile_picture_id;
  }
  if (body.professional_info !== undefined)
    dataToUpdate.professional_info = body.professional_info;

  if (body.location !== undefined) {
    if (typeof body.location !== "object" || body.location === null) {
      return ctx.badRequest("Location must be a valid object.");
    }
    const { latitude, longitude, address, zip } = body.location;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return ctx.badRequest("Latitude and longitude must be numbers.");
    }
    if (typeof address !== "string" || typeof zip !== "string") {
      return ctx.badRequest("Address and zip must be strings.");
    }
    dataToUpdate.location = body.location;
  }

  if (body.is_public !== undefined) {
    if (typeof body.is_public !== "boolean") {
      return ctx.badRequest(
        "is_public must be a boolean value (true or false)."
      );
    }
    dataToUpdate.is_public = body.is_public;
  }

  if (body.badge !== undefined) {
    const allowedBadges = ["verified"];
    if (typeof body.badge !== "string" || !allowedBadges.includes(body.badge)) {
      return ctx.badRequest(
        `Invalid badge. Allowed value is: ${allowedBadges.join(", ")}.`
      );
    }
    dataToUpdate.badge = body.badge;
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
}

async function updateProfilePicture(ctx): Promise<void> {
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
}

module.exports = {
  updateProfile,
  updateProfilePicture,
  getProfile,
};
