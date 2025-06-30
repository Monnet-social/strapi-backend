"use strict";
import { factories } from "@strapi/strapi";
import { Context } from "koa";

type ReportCreateData = {
    message: string;
    reported_by: number;
    publishedAt: Date;
    reported_post?: number;
    reported_user?: number;
};

module.exports = factories.createCoreController(
    "api::report.report",
    ({ strapi }) => ({
        async create(ctx: Context) {
            const { user: reporter } = ctx.state;
            if (!reporter)
                return ctx.unauthorized(
                    "You must be logged in to create a report."
                );

            const {
                post_id: postId,
                user_id: userId,
                message,
            } = ctx.request.body as {
                post_id?: number;
                user_id?: number;
                message?: string;
            };

            if (
                !message ||
                typeof message !== "string" ||
                message.trim().length === 0
            )
                return ctx.badRequest(
                    'A non-empty "message" is required to create a report.'
                );

            if ((!postId && !userId) || (postId && userId))
                return ctx.badRequest(
                    'You must provide either a "postId" or a "userId" to report, but not both.'
                );

            const dataToCreate: ReportCreateData = {
                message: message.trim(),
                reported_by: reporter.id,
                publishedAt: new Date(),
            };

            try {
                if (postId) {
                    if (typeof postId !== "number" || isNaN(postId))
                        return ctx.badRequest('The "postId" must be a number.');

                    const postToReport = await strapi.entityService.findOne(
                        "api::post.post",
                        postId
                    );
                    if (!postToReport)
                        return ctx.notFound(
                            "The post you are trying to report does not exist."
                        );

                    dataToCreate.reported_post = postId;
                } else if (userId) {
                    if (typeof userId !== "number" || isNaN(userId))
                        return ctx.badRequest('The "userId" must be a number.');

                    if (reporter.id === userId)
                        return ctx.badRequest("You cannot report yourself.");

                    const userToReport = await strapi.entityService.findOne(
                        "plugin::users-permissions.user",
                        userId
                    );
                    if (!userToReport)
                        return ctx.notFound(
                            "The user you are trying to report does not exist."
                        );

                    dataToCreate.reported_user = userId;
                }

                const newReport = await strapi.entityService.create(
                    "api::report.report",
                    { data: dataToCreate }
                );

                return ctx.send({
                    success: true,
                    message: "Your report has been submitted successfully.",
                    reportId: newReport.id,
                });
            } catch (error) {
                strapi.log.error("Error creating report:", error);
                return ctx.internalServerError(
                    "An error occurred while submitting the report."
                );
            }
        },
    })
);
