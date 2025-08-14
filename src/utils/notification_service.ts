import { initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export default class NotificationService {
  static FIREBASE_APP = null;

  constructor() {
    if (!NotificationService.FIREBASE_APP) {
      NotificationService.FIREBASE_APP = initializeApp();
    }
  }

  async sendPushNotification(
    title: string,
    body: string,
    data: any = {},
    fcm_token: string
  ) {
    if (!fcm_token) return;
    const message = {
      notification: { title, body },
      data,
      token: fcm_token,
    };
    try {
      const response = await getMessaging(
        NotificationService.FIREBASE_APP
      ).send(message);
      console.log("Push message sent:", response);
    } catch (error) {
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered" ||
        error.code === "messaging/invalid-argument"
      ) {
        console.log("Invalid token detected. Removing token.");
        await this.deleteFcmToken(fcm_token);
      } else {
        console.error("Error sending push:", error);
      }
    }
  }

  async saveNotification(
    type:
      | "mention"
      | "follow_request"
      | "reaction"
      | "comment"
      | "repost"
      | "reply",
    actorId: number,
    receiverId: number,
    message: string,
    extraData: { post?: number; comment?: number; original_post?: number } = {}
  ) {
    try {
      const data: any = {
        type,
        actor: actorId,
        user: receiverId,
        message,
      };
      if (extraData.post) data.post = extraData.post;
      if (extraData.comment) data.comment = extraData.comment;
      // Add any additional custom fields into a json field if necessary

      const created = await strapi.entityService.create(
        "api::notification.notification",
        {
          data,
        }
      );
      console.log("Notification record created:", created.id);
      return created;
    } catch (error) {
      console.error("Error creating notification record:", error);
      throw error;
    }
  }

  async deleteFcmToken(fcm_token: string) {
    const users = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: { fcm_token },
      }
    );
    if (!users || users.length === 0) return;
    const user = users[0];
    await strapi.entityService.update(
      "plugin::users-permissions.user",
      user.id,
      {
        data: { fcm_token: "" },
      }
    );
    console.log("Removed invalid FCM token for user:", user.id);
  }
}
