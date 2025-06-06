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
  console.log("CTX. state", ctx.state);
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
  console.log("USER FOUND IN DB", user);
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

async function forgotPassword(ctx) {
  console.log("CTX. state", ctx.state);
  const { email } = ctx.request.body;
  try {
    let user = await strapi.query("plugin::users-permissions.user").findOne({
      where: {
        email,
      },
    });
    console.log("USER FOUND IN DB", user);

    if (!user) {
      return ctx.badRequest("User not found");
    }

    const resetToken = await jwt.sign(
      {
        id: user?.id,
        token_type: "RESET-PASSWORD",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    console.log("Reset passwords", resetToken);
    //add logic to send email
    let sendEmail = true;
    console.log("Send EMAIL", sendEmail);
    if (sendEmail) {
      ctx.send(`Sucessfully sent reset password instructions to ${email}!`);
    } else {
      ctx.internalServerError("Could not send email! Please try agian later");
    }
  } catch (err) {
    console.log("Err", err);
    ctx.badRequest(`User not found`);
  }
}

async function updatePassword(ctx) {
  const { token, password } = ctx.request.body;
  if (!token || !password) {
    return ctx.badRequest("Incomplete body");
  }

  const decodeToken = decodeURIComponent(token);
  const jwtStatus = await jwt.verify(decodeToken, process.env.JWT_SECRET);
  console.log("JWT status", jwtStatus);
  if (jwtStatus && jwtStatus?.token_type == "RESET-PASSWORD") {
    const hashPassword = (password) => bcrypt.hash(password, 10);
    try {
      let user = await strapi.query("plugin::users-permissions.user").update({
        where: {
          id: jwtStatus?.id,
        },
        data: {
          password: await hashPassword(password),
        },
      });
      return ctx.send("Updated user password successully");
    } catch (err) {
      console.log("Err", err);
      return ctx.internalServerError(
        "Something went wrong! Please try again later"
      );
    }
  }
}

module.exports = {
  login,
  register,
  forgotPassword,
  updatePassword,
  getUser,
};
