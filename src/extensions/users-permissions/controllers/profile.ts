"use strict";

const { sanitize } = require("@strapi/utils");

async function updateProfilePicture(ctx) {
    const { user } = ctx.state;
    console.log(ctx);
    if (!user)
        return ctx.unauthorized(
            "You must be logged in to perform this action.Please login first."
        );

    const { mediaId } = ctx.request.body;
    if (!mediaId || isNaN(mediaId))
        return ctx.badRequest('Invalid input: "mediaId" must be a number.');

    try {
        const file = await strapi.entityService.findOne(
            "plugin::upload.file",
            mediaId
        );
        if (!file)
            return ctx.notFound("The specified media file could not be found.");

        const updatedUser = await strapi.entityService.update(
            "plugin::users-permissions.user",
            user.id,
            {
                data: { profile_picture: mediaId },
                populate: { profile_picture: true },
            }
        );

        delete updatedUser.password;

        ctx.send({
            user: updatedUser,
            message: "Profile picture updated successfully.",
        });
    } catch (error) {
        strapi.log.error(error);
        return ctx.internalServerError(
            "An error occurred while updating the profile picture."
        );
    }
}
module.exports = {
    updateProfilePicture,
};
