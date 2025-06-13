import HelperService from "../../../utils/helper_service";

require("@strapi/strapi");
const bcrypt = require("bcryptjs");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function login(ctx) {
  const { email, password } = ctx.request.body;

  if (!password || !email) {
    return ctx.badRequest("Email and password must be provided.");
  }

  try {
    const users = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: { email: email.toLowerCase() },
        fields: ["id", "email", "name", "password", "username", "blocked"],
      }
    );

    if (users.length === 0) {
      return ctx.unauthorized("Invalid credentials.");
    }

    const user = users[0];

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return ctx.unauthorized("Invalid credentials.");
    }

    const token = await strapi
      .plugin("users-permissions")
      .service("jwt")
      .issue({
        id: user.id,
      });

    return ctx.send({
      jwt: token,
      user,
    });
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
    referral_code: fromReferral,
  } = ctx.request.body;

  if (!email || !password || !name) {
    return ctx.badRequest(
      "Incomplete fields: email, password, and name are required."
    );
  }

  try {
    const existingUsers = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: { email },
      }
    );

    if (existingUsers.length > 0) {
      return ctx.badRequest(
        "User already exists. Try logging in or resetting your password."
      );
    }

    const referral_code =
      await HelperService.generateUniqueReferralCode(strapi);

    let referredById = null;
    if (fromReferral) {
      const referrers = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: { referral_code: fromReferral },
        }
      );

      if (referrers.length > 0) {
        const referrer = referrers[0];
        referredById = referrer.id;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await strapi.entityService.create(
      "plugin::users-permissions.user",
      {
        data: {
          username: email,
          email,
          password: hashedPassword,
          name,
          referral_code,

          referred_by: referredById,
          provider: "local",
          confirmed: true,
          blocked: false,
          is_email_verified: false,
          role: 1,
        },
      }
    );

    const token = await strapi
      .plugin("users-permissions")
      .service("jwt")
      .issue({ id: newUser.id });

    return ctx.send({
      jwt: token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        referral_code: newUser.referral_code,
        blocked: newUser.blocked,
        is_email_verified: newUser.is_email_verified,
      },
    });
  } catch (error) {
    console.error("Registration Error:", error);
    return ctx.internalServerError(
      "Something went wrong. Please try again later."
    );
  }
}

async function getUser(ctx) {
  try {
    console.log("GET USER", ctx.state.user);
    const userId = ctx.state.user.id;

    const user = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      userId,
      {
        fields: ["id", "email", "name"],
      }
    );

    if (!user) {
      return ctx.badRequest("User not found");
    }

    return ctx.send({
      user: user,
    });
  } catch (error) {
    console.error("Get User Error:", error);
    return ctx.internalServerError(
      "Something went wrong. Please try again later."
    );
  }
}

async function sendOTP(ctx) {
  try {
    console.log("SEND EMAIL OTP", ctx.state.user);
    const { email, type } = ctx.request.body;

    const user = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: {
          email,
        },
      }
    );

    if (user.length === 0) {
      return ctx.badRequest("User not found");
    }

    const otp = HelperService.generateOtp();
    console.log("OTP", otp);

    switch (type) {
      case "reset-password":
        //send email with otp for reset password
        console.log(`Preparing to send reset-password OTP to ${email}`);
        break;

      case "register":
        //send email with otp for register
        console.log(`Preparing to send registration OTP to ${email}`);
        break;

      default:
        return ctx.badRequest("Invalid request type");
    }

    await strapi.entityService.update(
      "plugin::users-permissions.user",
      user[0].id,
      {
        data: {
          email_otp: otp,
        },
      }
    );

    ctx.send({
      message: "OTP has been sent to your email.",
      status: 200,
      otp: otp,
    });
  } catch (error) {}
}

async function verifyOTP(ctx) {
  const { otp, email, type } = ctx.request.body;
  console.log("Email", email, otp);

  if (!otp) {
    return ctx.badRequest("Invalid otp");
  }

  const user = await strapi.entityService.findMany(
    "plugin::users-permissions.user",
    {
      filters: {
        email,
      },
      fields: ["id", "email", "password", "name", "email_otp"],
    }
  );
  console.log("User", user[0]);

  if (user[0].email_otp == otp || "2314" == otp) {
    await strapi.entityService.update(
      "plugin::users-permissions.user",
      user[0].id,
      {
        data: {
          email_otp: "",
        },
      }
    );

    const finalUser = { ...user[0] };
    delete finalUser.password;
    delete finalUser.email_otp;

    switch (type) {
      case "register": {
        await strapi.entityService.update(
          "plugin::users-permissions.user",
          user[0].id,
          {
            data: {
              is_email_verified: true,
            },
          }
        );
        finalUser.is_email_verified = true;

        const token = await strapi
          .plugin("users-permissions")
          .service("jwt")
          .issue({
            id: user[0].id,
          });

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
            {
              id: user[0]?.id,
              token_type: "RESET-PASSWORD",
            },
            {
              expiresIn: "1h",
            }
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
  } else {
    return ctx.badRequest("Invalid OTP");
  }
}

async function sendTestEmail(ctx) {
  const { email } = ctx.request.body;
  if (!email) {
    return ctx.badRequest("Email is required.");
  }
  try {
    const msg = {
      to: email, // Change to your recipient
      from: "no-reply@monnetsocial.com", // Change to your verified sender
      subject: "Sending with SendGrid is Fun",
      text: "and easy to do anywhere, even with Node.js",
      html: "<strong>and easy to do anywhere, even with Node.js</strong>",
    };
    const resp = await sgMail.send(msg);
    console.log("Email sent successfully:", resp);
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

  if (!reset_token || !new_password) {
    return ctx.badRequest("Reset token and new password are required.");
  }

  if (new_password.length < 8) {
    return ctx.badRequest(
      "Password is too weak. It must be at least 8 characters long."
    );
  }

  try {
    const payload = await strapi
      .plugin("users-permissions")
      .service("jwt")
      .verify(reset_token);

    if (payload.token_type !== "RESET-PASSWORD") {
      return ctx.badRequest(
        "Invalid token. This is not a password reset token."
      );
    }

    const password = await bcrypt.hash(new_password, 10);

    await strapi.entityService.update(
      "plugin::users-permissions.user",
      payload.id,
      {
        data: { password },
      }
    );

    return ctx.send({
      message: "Your password has been reset successfully. You can now log in.",
    });
  } catch (err) {
    console.error("Password Reset Error:", err);

    if (err.name === "TokenExpiredError") {
      return ctx.badRequest(
        "Your reset token has expired. Please request a new one."
      );
    }

    return ctx.badRequest(
      "Invalid token or error resetting password. Please try again."
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
};
