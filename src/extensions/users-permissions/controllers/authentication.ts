import HelperService from "../../../utils/helper_service";
import EmailService from "../../../utils/email/email_service";
const bcrypt = require("bcryptjs");

async function login(ctx) {
    const { email, password } = ctx.request.body;

    if (!password || !email)
        return ctx.badRequest("Email and password must be provided.");

    try {
        const users = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
                filters: { email: email.toLowerCase() },
                fields: [
                    "id",
                    "email",
                    "name",
                    "password",
                    "username",
                    "blocked",
                    "referral_code",
                    "is_email_verified",
                ],
                populate: {
                    referred_by: { fields: ["id", "name", "username"] },
                },
            }
        );
        if (users.length === 0) return ctx.unauthorized("Invalid credentials.");

        const user = users[0];
        if (!user.is_email_verified)
            return ctx.unauthorized("Please verify email first.");
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) return ctx.unauthorized("Invalid credentials.");
        delete user.password;
        const token = await strapi
            .plugin("users-permissions")
            .service("jwt")
            .issue({ id: user.id });

        return ctx.send({ jwt: token, user });
    } catch (err) {
        console.error("Login Error:", err);
        return ctx.internalServerError(
            "An unexpected error occurred. Please try again."
        );
    }
}

async function register(ctx: any) {
    const {
        email,
        password,
        name,
        date_of_birth,
        referral_code: fromReferral,
    } = ctx.request.body;

    if (!email || !password || !date_of_birth)
        return ctx.badRequest(
            "Incomplete fields: email, password,date_of_birth and name are required."
        );

    try {
        const existingUsers = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            { filters: { email } }
        );

        if (existingUsers.length > 0)
            return ctx.badRequest(
                "User already exists. Try logging in or resetting your password."
            );

        const referral_code =
            await HelperService.generateUniqueReferralCode(strapi);

        let referredById = null;
        if (fromReferral) {
            const referrers = await strapi.entityService.findMany(
                "plugin::users-permissions.user",
                {
                    fields: ["id", "no_of_referrals"],
                    filters: { referral_code: fromReferral },
                    limit: 1,
                }
            );

            if (referrers.length > 0) {
                const referrer = referrers[0];
                const currentReferralCount = referrer.no_of_referrals || 0;

                if (currentReferralCount >= 5)
                    return ctx.badRequest(
                        "This referral code has reached its maximum limit of 5 uses."
                    );

                referredById = referrer.id;

                await strapi.entityService.update(
                    "plugin::users-permissions.user",
                    referrer.id,
                    { data: { no_of_referrals: currentReferralCount + 1 } }
                );
            }
        }

        const newUser = await strapi
            .plugin("users-permissions")
            .service("user")
            .add({
                email,
                username: email,
                password,
                name,
                referral_code,
                referred_by: referredById,
                provider: "local",
                confirmed: false,
                blocked: false,
                is_email_verified: false,
                role: 1,
                date_of_birth,
            });
        delete newUser.password;
        const token = await strapi
            .plugin("users-permissions")
            .service("jwt")
            .issue({ id: newUser.id });

        return ctx.send({ jwt: token, user: newUser });
    } catch (error) {
        console.error("Registration Error:", error);
        return ctx.internalServerError(
            "Something went wrong. Please try again later."
        );
    }
}

async function getUser(ctx) {
    try {
        const userId = ctx.state.user.id;

        const user = await strapi.entityService.findOne(
            "plugin::users-permissions.user",
            userId,
            {
                fields: [
                    "id",
                    "email",
                    "name",
                    "referral_code",
                    "username",
                    "is_email_verified",
                ],
                populate: {
                    referred_by: {
                        fields: ["id", "name", "username", "email"],
                    },
                },
            }
        );

        if (!user) return ctx.badRequest("User not found");

        return ctx.send({ user: user });
    } catch (error) {
        console.error("Get User Error:", error);
        return ctx.internalServerError(
            "Something went wrong. Please try again later."
        );
    }
}

async function sendOTP(ctx: any) {
    try {
        const { email, type } = ctx.request.body;

        if (!email || !type)
            return ctx.badRequest("Email and type are required.");

        const users = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            { filters: { email } }
        );

        if (users.length === 0) return ctx.badRequest("User not found");

        const user = users[0];
        const otp = HelperService.generateOtp();
        console.log("OTP inn auth ", otp);
        switch (type) {
            case "reset-password":
                await new EmailService().sendResetPasswordEmail(email, otp);
                console.log(`Preparing to send reset-password OTP to ${email}`);
                break;

            case "register":
                await new EmailService().sendEmailVerificationEmail(email, otp);
                console.log(`Preparing to send registration OTP to ${email}`);
                break;

            default:
                return ctx.badRequest("Invalid request type");
        }
        await strapi.entityService.update(
            "plugin::users-permissions.user",
            user.id,
            { data: { email_otp: otp } }
        );

        return ctx.send({
            message: "An OTP has been sent to your email address.",
            status: 200,
        });
    } catch (error) {
        console.error("sendOTP Error:", error);
        return ctx.internalServerError("An unexpected error occurred.");
    }
}

async function verifyOTP(ctx) {
    const { otp, email, type } = ctx.request.body;
    console.log("Email", email, otp);

    if (!otp) return ctx.badRequest("Invalid otp");

    const user = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
            filters: { email },
            fields: ["id", "email", "name", "email_otp"],
        }
    );

    if (user[0].email_otp == otp) {
        await strapi.entityService.update(
            "plugin::users-permissions.user",
            user[0].id,
            { data: { email_otp: "" } }
        );

        const finalUser = { ...user[0] };
        delete finalUser.email_otp;

        switch (type) {
            case "register": {
                await strapi.entityService.update(
                    "plugin::users-permissions.user",
                    user[0].id,
                    { data: { is_email_verified: true, confirmed: true } }
                );
                finalUser.is_email_verified = true;

                const token = await strapi
                    .plugin("users-permissions")
                    .service("jwt")
                    .issue({ id: user[0].id });

                return ctx.send({
                    message: "Email verified successfully!!",
                    user: finalUser,
                    jwt: token,
                });
            }

            case "reset-password": {
                const token = await strapi
                    .plugin("users-permissions")
                    .service("jwt")
                    .issue(
                        { id: user[0]?.id, token_type: "RESET-PASSWORD" },
                        { expiresIn: "1h" }
                    );

                return ctx.send({
                    reset_token: token,
                    message: "OTP verified successfully!!",
                    user: finalUser,
                });
            }

            default:
                return ctx.badRequest("Invalid request type");
        }
    } else return ctx.badRequest("Invalid OTP");
}

async function sendTestEmail(ctx) {
    const { email } = ctx.request.body;
    if (!email) return ctx.badRequest("Email is required.");

    try {
        const resp: any = await new EmailService().sendEmailVerificationEmail(
            email,
            HelperService.generateOtp()
        );
        console.log("Email sent successfully:", resp);
        console.log("Email sent to:", resp?.body);
        return ctx.send({
            message: "Test email sent successfully.",
            status: 200,
        });
    } catch (error) {
        console.error("Error sending email:", error);
        if (error.response) {
            console.error("Error response body:", error.response.body);
        }
        return ctx.internalServerError(
            "Failed to send test email. Please check the server logs for more details."
        );
    }
}

async function resetPassword(ctx) {
    const { reset_token, new_password } = ctx.request.body;

    if (!reset_token || !new_password)
        return ctx.badRequest("Reset token and new password are required.");

    if (new_password.length < 6)
        return ctx.badRequest(
            "Password is too weak. It must be at least 6 characters long."
        );

    try {
        const payload = await strapi
            .plugin("users-permissions")
            .service("jwt")
            .verify(reset_token);

        if (payload.token_type !== "RESET-PASSWORD")
            return ctx.badRequest(
                "Invalid token. This is not a password reset token."
            );

        await strapi
            .plugin("users-permissions")
            .service("user")
            .edit(payload.id, {
                password: new_password,
            });

        return ctx.send({
            message:
                "Your password has been reset successfully. You can now log in.",
        });
    } catch (err) {
        console.error("Password Reset Error:", err);

        if (err.name === "TokenExpiredError")
            return ctx.badRequest(
                "Your reset token has expired. Please request a new one."
            );

        return ctx.badRequest(
            "Invalid token or error resetting password. Please try again."
        );
    }
}

async function checkUserStatus(ctx) {
    const { email } = ctx.request.body;

    if (!email) return ctx.badRequest("Email is required.");

    try {
        const users = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
                filters: { email: email.toLowerCase() },
                fields: ["is_email_verified", "confirmed"],
            }
        );

        if (users.length === 0)
            return ctx.send({
                exists: false,
                message: "User does'nt exists with this email.",
            });

        const user = users[0];

        return ctx.send({
            exists: true,
            message: "User already exists with this email.",
            user,
        });
    } catch (err) {
        console.error("Check User Status Error:", err);
        return ctx.internalServerError("An unexpected error occurred.");
    }
}

module.exports = {
    login,
    register,
    sendOTP,
    verifyOTP,
    resetPassword,
    getUser,
    sendTestEmail,
    checkUserStatus,
};
