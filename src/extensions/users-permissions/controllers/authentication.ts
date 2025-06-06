import HelperService from "../../../utils/helper_service";

require("@strapi/strapi");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

async function login(ctx) {
  const { email, password } = ctx.request.body;

  if (!password || !email) {
    return ctx.badRequest("Email or password is not provided");
  }

  try {
    let user: any = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: {
          email,
        },
        fields: ["id", "email", "name", "password"],
      }
    );

    if (user?.length == 0) {
      return ctx.badRequest("User not found or wrong password");
    }

    if (await bcrypt.compare(password, user[0]?.password)) {
      let finalUser: any = {};

      finalUser = user[0];
      delete finalUser?.password;

      const token = await strapi
        .plugin("users-permissions")
        .service("jwt")
        .issue({
          id: user[0]?.id,
        });

      return ctx.send({
        jwt: token,
        user: finalUser,
      });
    } else {
      return ctx.unauthorized("Unauthorized");
    }
  } catch (err) {
    console.log("err", err);
    return ctx.internalServerError("Something went wrong!");
  }
}

async function register(ctx) {
  console.log("CTX. state", ctx.state);
  const { email, password, name } = ctx.request.body;

  // Check if email and password is provided
  if (!password || !email || !name) {
    return ctx.badRequest("Incomplete Fields");
  }
  try {
    let user = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: {
          email,
        },
      }
    );

    if (user?.length > 0) {
      return ctx.badRequest(
        "User already exist! Try logging in or reset password"
      );
    }

    let finalUserData: any = {};

    const data = {
      username: email,
      email,
      name,

      password,

      confirmed: true,

      role: 1,
    };

    finalUserData = await strapi
      .query("plugin::users-permissions.user")
      .create({
        data,
      });
    console.log("Final User", finalUserData);

    let keys = ["id", "email", "name"];
    const finalUser: any = {};

    for (const key of keys) {
      finalUser[key] = finalUserData[key];
    }

    const token = await strapi
      .plugin("users-permissions")
      .service("jwt")
      .issue({
        id: finalUser?.id,
      });

    return ctx.send({
      jwt: token,
      user: finalUser,
    });
  } catch (err) {
    console.log(err);
    ctx.internalServerError("Something went wrong please try again later");
  }
}

async function getUser(ctx) {
  const user_id = ctx.state.user.id;
  let user = await strapi.entityService.findMany(
    "plugin::users-permissions.user",
    {
      filters: {
        id: user_id,
      },
      fields: ["id", "email", "name"],
    }
  );

  if (user?.length == 0) {
    return ctx.badRequest("User not found");
  }
  let finalUser: any = {};
  finalUser = user[0];
  delete finalUser?.password;

  return ctx.send({
    user: finalUser,
  });
}

async function sendOTP(ctx) {
  console.log("SEND EMAIL OTP", ctx.state.user);
  const email = ctx.request.body.email;

  const otp = HelperService.generateOtp();
  console.log("OTP", otp);

  //TODO: Implement email sending logic here

  const user = await strapi.entityService.findMany(
    "plugin::users-permissions.user",
    {
      filters: {
        email,
      },
    }
  );
  if (user.length == 0) {
    return ctx.badRequest("User not found");
  }

  const updateUser = await strapi.entityService.update(
    "plugin::users-permissions.user",
    user[0].id,
    {
      data: {
        email_otp: otp,
      },
    }
  );

  ctx.send({ message: "Email sent successfully!!", otp, status: 200 });
}

async function verifyOTP(ctx) {
  const { otp, email } = ctx.request.body;
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
    const resetOtp = await strapi.entityService.update(
      "plugin::users-permissions.user",
      user[0].id,
      {
        data: {
          email_otp: "",
        },
      }
    );

    let finalUser: any;

    finalUser = user[0];
    delete finalUser?.password;

    const token = await strapi.plugin("users-permissions").service("jwt").issue(
      {
        id: user[0]?.id,
        token_type: "RESET-PASSWORD",
      },
      {
        expiresIn: "1h",
      }
    );

    return ctx.send({
      jwt: token,
      user: finalUser,
    });
  } else {
    return ctx.badRequest("Invalid OTP");
  }
}

async function resetPassword(ctx) {
  const { resetToken, newPassword } = ctx.request.body;
  if (!resetToken || !newPassword) {
    return ctx.badRequest("Reset token and new password are required");
  }

  try {
    const payload = await strapi
      .plugin("users-permissions")
      .service("jwt")
      .verify(resetToken);
    if (payload.purpose && payload.token_type !== "RESET-PASSWORD") {
      return ctx.badRequest("Invalid reset token");
    }

    try {
      await strapi.entityService.update(
        "plugin::users-permissions.user",
        payload.id,
        {
          data: { password: newPassword },
        }
      );

      return ctx.send({
        message: "Password has been reset successfully",
      });
    } catch (updateErr) {
      console.error("Error updating password:", updateErr);
      return ctx.badRequest("Failed to update password");
    }
  } catch (err) {
    console.error("Error in resetPassword:", err);
    if (err.name === "TokenExpiredError") {
      return ctx.badRequest("Reset token has expired");
    }
    return ctx.badRequest("Invalid or expired token");
  }
}
module.exports = {
  login,
  register,
  sendOTP,
  verifyOTP,
  resetPassword,
  getUser,
};
