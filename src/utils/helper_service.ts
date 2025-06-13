const shortid = require("shortid");

interface Strapi {
    entityService: any;
    query: (uid: string) => any;
}

export default class HelperService {
    static generateOtp(length: number = 6): string {
        let otp = "";
        for (let i = 0; i < length; i++) {
            otp += Math.floor(Math.random() * 10);
        }
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
}
