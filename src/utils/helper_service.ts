export default class HelperService {
  static generateOtp(length: number = 4) {
    let otp = "";
    for (let i = 0; i < length; i++) {
      otp += Math.floor(Math.random() * 10);
    }

    return otp;
  }
}
