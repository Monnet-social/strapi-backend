import HelperService from "../../../utils/helper_service";
import EmailService from "../../../utils/email/email_service";
const bcrypt = require("bcryptjs");

async function login(ctx) {
    const { email, password } = ctx.request.body;

    if (!password || !email)
        return ctx.badRequest("Email and password must be provided.");

    if (!email || !HelperService.EMAIL_REGEX.test(email))
        return ctx.badRequest("A valid email address is required.");

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
                    "tos_accepted",
                    "date_of_birth",
                ],
                populate: {
                    referred_by: { fields: ["id", "name", "username"] },
                    profile_picture: true,
                },
            }
        );
        if (users.length === 0) return ctx.notFound("User not found.");

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
        tos_accepted,
        username,
    } = ctx.request.body;

    const birthDate = new Date(date_of_birth);
    const today = new Date();

    if (
        !email ||
        !password ||
        !date_of_birth ||
        tos_accepted === null ||
        tos_accepted === undefined
    )
        return ctx.badRequest(
            "Incomplete fields: email, password,date_of_birth,tos_accepted  are required."
        );
    if (!email || !HelperService.EMAIL_REGEX.test(email))
        return ctx.badRequest("A valid email address is required.");

    if (!HelperService.DATE_REGEX.test(date_of_birth))
        return ctx.badRequest(
            "Invalid date format for date_of_birth. Please use YYYY-MM-DD."
        );
    if (!HelperService.USERNAME_REGEX.test(username))
        return ctx.badRequest(
            "Invalid username.Must be atleast 4 chars starting with letter and consisting of letters,numbers & undescroes(_)"
        );

    if (birthDate > today)
        return ctx.badRequest("Date of birth cannot be in the future.");

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
                tos_accepted,
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
                    "tos_accepted",
                    "date_of_birth",
                ],
                populate: {
                    referred_by: {
                        fields: ["id", "name", "username", "email"],
                    },
                    profile_picture: true,
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

        if (!email || !HelperService.EMAIL_REGEX.test(email))
            return ctx.badRequest("A valid email address is required.");

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

    if (!email || !HelperService.EMAIL_REGEX.test(email))
        return ctx.badRequest("A valid email address is required.");

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
    if (!email || !HelperService.EMAIL_REGEX.test(email))
        return ctx.badRequest("A valid email address is required.");

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
    if (!email || !HelperService.EMAIL_REGEX.test(email))
        return ctx.badRequest("A valid email address is required.");

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

async function acceptTos(ctx) {
    const { user } = ctx.state;
    if (!user)
        return ctx.unauthorized("You must be logged in to accept the terms.");

    try {
        await strapi.entityService.update(
            "plugin::users-permissions.user",
            user.id,
            { data: { tos_accepted: true } }
        );

        return ctx.send({
            success: true,
            message: "Terms and Conditions have been accepted successfully.",
        });
    } catch (error) {
        console.error("Error accepting Terms and Conditions:", error);
        return ctx.internalServerError(
            "An error occurred while accepting the terms."
        );
    }
}

async function checkUsername(ctx: any) {
    const { username } = ctx.query;

    if (!username || typeof username !== "string")
        return ctx.badRequest("Username query parameter is required.");

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 4)
        return ctx.send({
            available: false,
            message: "Username must be at least 4 characters.",
        });

    if (!HelperService.USERNAME_REGEX.test(trimmedUsername))
        return ctx.send({
            available: false,
            message:
                "Username can only contain letters, numbers, and underscores.",
        });

    try {
        const existingUser = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
                filters: { username: trimmedUsername },
                limit: 1,
            }
        );

        if (existingUser.length > 0)
            return ctx.send({
                available: false,
                message: "Username unavailable",
            });

        return ctx.send({
            available: true,
            message: "Username available",
        });
    } catch (error) {
        strapi.log.error("Error in checkUsername controller:", error);
        return ctx.internalServerError(
            "An error occurred while checking username availability."
        );
    }
}

async function updateUsername(ctx) {
    const { user } = ctx.state;
    const { username: newUsername } = ctx.request.body;

    if (!user)
        return ctx.unauthorized(
            "You must be logged in to update your username."
        );

    if (!newUsername || typeof newUsername !== "string")
        return ctx.badRequest('A new "username" must be provided as a string.');

    const trimmedUsername = newUsername.trim();

    if (!HelperService.USERNAME_REGEX.test(trimmedUsername))
        return ctx.badRequest(
            "Username must be 4-20 characters long and can only contain letters, numbers, and underscores."
        );

    try {
        const existingUser = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
                filters: {
                    username: trimmedUsername,
                    id: { $ne: user.id },
                },
                limit: 1,
            }
        );

        if (existingUser.length > 0)
            return ctx.conflict(
                "This username is already taken. Please choose another."
            );

        await strapi.entityService.update(
            "plugin::users-permissions.user",
            user.id,
            {
                data: {
                    username: trimmedUsername,
                },
            }
        );

        return ctx.send({
            success: true,
            message: "Username updated successfully.",
            username: trimmedUsername,
        });
    } catch (error) {
        strapi.log.error("Error in updateUsername controller:", error);
        return ctx.internalServerError(
            "An error occurred while updating the username."
        );
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
    acceptTos,
    checkUsername,
    updateUsername,
};
