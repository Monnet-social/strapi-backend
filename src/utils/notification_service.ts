import axios from "axios";
import { App, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export default class NotificationService {
  static FIREBASE_APP: App = null;

  static initializeFirebase() {
    console.log("Initializing Firebase");
    this.FIREBASE_APP = initializeApp();
  }

  async sendNotification(
    title: string,
    body: string,
    data: any = {},
    fcm_token: string
  ) {
    if (fcm_token === "" || !fcm_token) return;
    const message = {
      notification: {
        title,
        body,
      },
      data,
      token: fcm_token,
    };

    try {
      const response = await getMessaging(
        NotificationService.FIREBASE_APP
      ).send(message);
      console.log("Successfully sent message:", response);
    } catch (error) {
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered" ||
        error.code === "messaging/invalid-argument"
      ) {
        console.log("Invalid token, deleting user fcm token");
        this.deleteFcmToken(fcm_token);
      }
    }
  }

  async deleteFcmToken(fcm_token: string) {
    const users = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: {
          fcm_token,
        },
      }
    );
    if (!users || users.length === 0) return;

    const user = users[0];
    user.fcm_token = "";
    await strapi.entityService.update(
      "plugin::users-permissions.user",
      user.id,
      {
        data: {
          fcm_token: "",
        },
      }
    );
    console.log("Deleted fcm token for user:", user.id);
  }
}
