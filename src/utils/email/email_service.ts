import mjml2html from "mjml";
import Handlebars from "handlebars";
import fs from "fs";
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default class EmailService {
    async sendEmailVerificationEmail(email: string, otp: string) {
        if (!email || !otp) return;

        const data = { email, otp: otp?.split("") };
        await this.sendEmail(
            email,
            "public/email/email_verification.mjml",
            "Monnet - One-Time Password",
            data
        );

        console.log("Email verification email sent successfully.");
    }
    //test

    async sendResetPasswordEmail(email: string, otp: string) {
        if (!email || !otp) return;

        const data = { email, otp: otp?.split("") };
        console.log(otp);
        await this.sendEmail(
            email,
            "public/email/reset_password.mjml",
            "Monnet - Reset Password",
            data
        );
        console.log("RESET PASS Eamil sent successfully.");
    }

    async sendEmail(
        email: string,
        mjml_template_path: string,
        subject: string,
        data: any
    ) {
        // const final_mjml_path = path.join(__dirname, mjml_template_path);
        const template = fs.readFileSync(mjml_template_path, "utf8");
        const compiledTemplate = Handlebars.compile(template);
        const mjml = compiledTemplate(data);

        const html = mjml2html(mjml).html;
        console.log("Email sent successfully:", process.env.SENDER_EMAIL);
        try {
            let msg: any = {
                to: email, // Change to your recipient
                from: process.env.SENDER_EMAIL, // Change to your verified sender
                subject,
                html,
            };
            const response = await sgMail.send(msg);

            console.log("Response from email server", response);
        } catch (error) {
            console.error("Error sending email verification email:", error);
            console.log("ERROR SENDING EMAIL", error?.body?.errors);
            console.log("ERROR SENDING EMAIL", error?.response?.body);
            throw new Error("Failed to send email verification email.");
        }
    }
}
