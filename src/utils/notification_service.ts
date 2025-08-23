import { initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export default class NotificationService {
  static FIREBASE_APP = null;

  constructor() {
    if (!NotificationService.FIREBASE_APP)
      NotificationService.FIREBASE_APP = initializeApp();
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
      | "comment"
      | "mention"
      | "follow_request"
      | "reaction"
      | "repost"
      | "reply",
    actorId: number,
    receiverId: number,
    message: string,
    extraData: { post?: number; comment?: number; original_post?: number } = {}
  ) {
    const data: any = {
      type,
      actor: actorId,
      user: receiverId,
      message,
    };
    if (extraData.post) data.post = extraData.post;
    if (extraData.comment) data.comment = extraData.comment;
    // Add any additional customizations as needed

    try {
      const created = await strapi.entityService.create(
        "api::notification.notification",
        {
          data,
        }
      );
      console.log("Notification created:", created.id);
      return created;
    } catch (error) {
      console.error("Error creating notification record:", error);
      throw error;
    }
  }

  /* Notification handlers */
  async notifyMention(
    actor: number,
    mentionedUser: number,
    commentId: number,
    postId: number,
    actorName: string,
    fcm_token: string
  ) {
    const message = `${actorName} mentioned you in a comment.`;
    await this.saveNotification("mention", actor, mentionedUser, message, {
      comment: commentId,
      post: postId,
    });
    if (fcm_token) {
      await this.sendPushNotification("New Mention", message, {}, fcm_token);
    }
  }

  async notifyRepost(
    actor: number,
    targetUser: number,
    commentId: number,
    postId: number,
    actorName: string,
    fcm_token: string
  ) {
    const message = `${actorName} reposted your comment.`;
    await this.saveNotification("repost", actor, targetUser, message, {
      comment: commentId,
      post: postId,
    });
    if (fcm_token) {
      await this.sendPushNotification(
        "Comment Reposted",
        message,
        {},
        fcm_token
      );
    }
  }

  async notifyReply(
    actor: number,
    targetUser: number,
    commentId: number,
    postId: number,
    actorName: string,
    fcm_token: string
  ) {
    const message = `${actorName} replied to your comment.`;
    await this.saveNotification("reply", actor, targetUser, message, {
      comment: commentId,
      post: postId,
    });
    if (fcm_token) {
      await this.sendPushNotification("New Reply", message, {}, fcm_token);
    }
  }

  async notifyComment(
    actor: number,
    targetUser: number,
    commentId: number,
    postId: number,
    actorName: string,
    fcm_token: string,
    postTitle: string
  ) {
    const message = `${actorName} commented on your post: ${postTitle}`;
    await this.saveNotification("comment", actor, targetUser, message, {
      comment: commentId,
      post: postId,
    });
    if (fcm_token) {
      await this.sendPushNotification("New Comment", message, {}, fcm_token);
    }
  }

  async notifyFollow(
    actor: number,
    targetUser: number,
    actorName: string,
    fcm_token: string,
    data: Record<string, any> = {}
  ) {
    const message = `${actorName} started following you.`;
    await this.saveNotification(
      "follow_request",
      actor,
      targetUser,
      message,
      data
    );
    if (fcm_token) {
      await this.sendPushNotification("New Follower", message, {}, fcm_token);
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
        data: { fcm_token: null },
      }
    );
    console.log(`Removed invalid FCM token for user ${user.id}`);
  }
  async notifyBioMention(
    actor: number,
    mentionedUser: number,
    actorName: string,
    fcm_token: string
  ) {
    const message = `${actorName} mentioned you in their bio.`;
    await this.saveNotification("mention", actor, mentionedUser, message, {});
    if (fcm_token) {
      await this.sendPushNotification("New Mention", message, {}, fcm_token);
    }
  }
}
