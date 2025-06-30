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
    updateProfilePicture,
};
