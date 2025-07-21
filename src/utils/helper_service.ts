const shortid = require("shortid");

interface Strapi {
  entityService: any;
  query: (uid: string) => any;
}

export default class HelperService {
  static STORY_EXPIRATION_HOURS = 24;
  static DATE_REGEX: RegExp = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  static WEBSITE_REGEX = /^(https?:\/\/)?([\w\d-]+\.)+[\w\d-]{2,}(\/.*)?$/i;
  static USERNAME_REGEX: RegExp = /^[a-zA-Z0-9_]{3,20}$/;
  static EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  static generateOtp(length: number = 4): string {
    let otp = "";
    for (let i = 0; i < length; i++) otp += Math.floor(Math.random() * 10);

    return otp;
  }

  static async generateUniqueReferralCode(strapi: Strapi): Promise<string> {
    let referral_code!: string;
    let isCodeUnique = false;

    while (!isCodeUnique) {
      const candidateCode = shortid.generate();

      const usersWithCode = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: { referral_code: candidateCode },
          fields: ["id"],
        }
      );

      if (usersWithCode.length === 0) {
        referral_code = candidateCode;
        isCodeUnique = true;
      }
    }
    return referral_code;
  }

  static handleError(error: any, title: string | null = null) {
    if (title) {
      console.error(title);
    }

    console.error(error);
    // Sentry.captureException(error, { extra: { title } });
  }
}
