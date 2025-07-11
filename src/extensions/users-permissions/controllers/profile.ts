import HelperService from "../../../utils/helper_service";

interface EditProfileRequestBody {
    name?: string;
    date_of_birth?: string;
    username?: string;
    profile_picture_id?: number;
}

interface UserUpdateData {
    name?: string;
    date_of_birth?: string;
    username?: string;
    profile_picture?: number;
}

async function updateProfile(ctx): Promise<void> {
    const { user } = ctx.state;

    if (!user)
        return ctx.unauthorized("You must be logged in to edit your profile.");

    const body: EditProfileRequestBody = ctx.request.body;
    const dataToUpdate: UserUpdateData = {};

    if (body.name !== undefined) {
        if (typeof body.name !== "string" || body.name.trim().length === 0)
            return ctx.badRequest("Name must be a non-empty string.");

        dataToUpdate.name = body.name.trim();
    }

    if (body.date_of_birth !== undefined) {
        if (!HelperService.DATE_REGEX.test(body.date_of_birth))
            return ctx.badRequest(
                "Invalid date format for date_of_birth. Please use YYYY-MM-DD."
            );

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
                limit: 1,
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
            return ctx.notFound(
                "The specified profile picture media file could not be found."
            );

        const currentUser = await strapi.entityService.findOne(
            "plugin::users-permissions.user",
            user.id,
            { populate: { profile_picture: { fields: ["id"] } } }
        );

        const oldProfilePictureId = (currentUser as any).profile_picture?.id;

        if (
            oldProfilePictureId &&
            oldProfilePictureId !== body.profile_picture_id
        )
            await strapi
                .service("api::file-optimisation.file-optimisation")
                .deleteOptimisedFile(oldProfilePictureId);

        dataToUpdate.profile_picture = body.profile_picture_id;
    }

    if (Object.keys(dataToUpdate).length === 0)
        return ctx.badRequest(
            "No valid or editable fields were provided for update."
        );

    try {
        const updatedUser = await strapi.entityService.update(
            "plugin::users-permissions.user",
            user.id,
            { data: dataToUpdate, populate: { profile_picture: true } }
        );

        await strapi
            .service("api::post.post")
            .enrichUsersWithOptimizedProfilePictures([updatedUser]);

        delete updatedUser.password;

        ctx.send({ user: updatedUser });
    } catch (error) {
        strapi.log.error("Error in editProfile controller:", error);
        return ctx.internalServerError(
            "An error occurred while updating the profile."
        );
    }
}

async function updateProfilePicture(ctx): Promise<void> {
    const { user } = ctx.state;
    if (!user)
        return ctx.unauthorized(
            "You must be logged in to perform this action."
        );

    const { mediaId } = ctx.request.body;
    if (!mediaId || isNaN(mediaId))
        return ctx.badRequest('Invalid input: "mediaId" must be a number.');

    try {
        const newFile = await strapi.entityService.findOne(
            "plugin::upload.file",
            mediaId
        );
        if (!newFile)
            return ctx.notFound(
                "The specified new media file could not be found."
            );

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
};
