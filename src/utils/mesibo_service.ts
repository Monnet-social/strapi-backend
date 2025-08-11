import axios from "axios";
import { IAlgoControl } from "../../types/algo_control";
import RedisService from "./redis_service";

export default class MesiboService {
  static appId =
    process.env.MESIBO_TOKEN ??
    "gjoxsbj2lk9tz25d4s4xt79nsokpjey3awdaqjtslq86yx9ryx7qzl334pb0olp0";
  static async editMesiboUser(userId, data = {}) {
    const findUser: any = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: { id: userId },
        populate: {
          profile_picture: true,
        },
        fields: ["id", "name", "mesibo_id"],
      }
    );
    if (findUser.length == 0) {
      throw new Error("User not found");
    }
    let mesibo_id = findUser[0].mesibo_id;
    if (!mesibo_id) {
      let createMesiboUser = await this.createMesiboUser(userId);
      if (createMesiboUser) {
        mesibo_id = createMesiboUser.uid;
        console.log(
          "Mesibo user created:",
          createMesiboUser,
          findUser[0].name,
          findUser[0].profile_picture.url
        );
        data = {
          name: findUser[0].name,
          profile_picture: findUser[0].profile_picture.url,
        };
      } else {
        throw new Error("Failed to create Mesibo user");
      }
    }
    let fields = ["name", "profile_picture"];
    let updateData: any = {};
    for (let field of fields) {
      if (data[field] && field == "profile_picture") {
        updateData["image"] = data[field];
      } else if (data[field]) {
        updateData[field] = data[field];
      }
    }
    console.log("Update Data:", updateData);
    try {
      const response = await axios.post(
        process.env.MESIBO_BASE_URL ??
          "https://mesibo-dev.monnetsocial.com/mesiboapi",
        {
          op: "userset",
          token: this.appId,
          user: {
            uid: mesibo_id,
            profile: updateData,
          },
        }
      );
      console.log("Mesibo user edited:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error editing Mesibo user:", error);
      throw new Error("Failed to edit Mesibo user");
    }
  }
  static async createMesiboUser(userId) {
    const findUser = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: { id: userId },
        populate: {
          profile_picture: true,
        },
        fields: ["id", "name"],
      }
    );
    if (findUser?.length == 0) throw new Error("User not found");
    const user = findUser[0];
    try {
      const response = await axios.post(
        process.env.MESIBO_BASE_URL ??
          "https://mesibo-dev.monnetsocial.com/mesiboapi",
        {
          op: "useradd",
          token: this.appId,
          user: {
            address: userId,
            token: {
              appid: "com.mesibo.dev",
              expiry: 525600,
            },
          },
        }
      );
      console.log("Mesibo user created:", response.data);
      let finalResponse = response.data;
      const updateMesiboId = await strapi.entityService.update(
        "plugin::users-permissions.user",
        userId,
        {
          data: {
            mesibo_id: finalResponse.user.uid,
          },
        }
      );
      return {
        uid: finalResponse.user.uid,
        token: finalResponse.user.token,
      };
    } catch (error) {
      console.error("Error creating Mesibo user:", error);
      throw new Error("Failed to create Mesibo user");
    }
  }
}
