const shortid = require("shortid");
import axios from "axios";

interface Strapi {
  entityService: any;
  query: (uid: string) => any;
}

//1st row frinds & close_friends
// 2nd row following (only)
export default class HelperService {
  static STORY_EXPIRATION_HOURS = 24;
  static DATE_REGEX: RegExp = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  static WEBSITE_REGEX: RegExp =
    /^(https?:\/\/)?([\w\d-]+\.)+[\w\d-]{2,}(\/.*)?$/i;
  static USERNAME_REGEX: RegExp = /^[a-zA-Z0-9_]{3,20}$/;
  static EMAIL_REGEX: RegExp =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  static HEX_COLOR_REGEX: RegExp = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  static avatarRingColors = [
    { id: 1, name: "Vibe Green", hexCode: "#58BCBA" },
    { id: 2, name: "Vibe Red", hexCode: "#FF3857" },
    { id: 3, name: "Vibe Purple", hexCode: "#A670ED" },
    { id: 4, name: "Vibe Blue", hexCode: "#576FFF" },
    { id: 5, name: "Vibe Orange", hexCode: "#F29500" },
    { id: 6, name: "Vibe Pink", hexCode: "#F46EB5" },
  ];

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

  static async geocodeAddress(
    address: string
  ): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const response = await axios.post(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAP_API_KEY}`
      );
      if (response.data.status !== "OK") {
        console.error(
          `Geocoding failed for address "${address}": ${response.data.status}`
        );
        return null;
      }

      const location = response.data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
      };
    } catch (error) {
      console.error(
        `Geocoding failed for address "${address}": ${error.message}`
      );
      return null;
    }
  }

  static async reverseGeocodeCoords(
    latitude: number,
    longitude: number
  ): Promise<{ city: string | null; country: string | null }> {
    try {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.GOOGLE_MAP_API_KEY}`
      );

      if (response.data.status !== "OK" || response.data.results.length === 0) {
        console.error(
          `Reverse geocoding failed for coordinates (${latitude}, ${longitude}): ${response.data.status}`
        );
        return { city: null, country: null };
      }

      const result = response.data.results[0];
      let city = null;
      let country = null;

      for (const component of result.address_components) {
        if (component.types.includes("locality")) city = component.long_name;
        if (component.types.includes("country")) country = component.long_name;
      }

      return { city, country };
    } catch (error) {
      console.error(
        `Reverse geocoding failed for coordinates (${latitude}, ${longitude}): ${error.message}`
      );
      return { city: null, country: null };
    }
  }
}
