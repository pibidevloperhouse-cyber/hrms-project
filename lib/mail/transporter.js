import nodemailer from "nodemailer";

/**
 * Shared Nodemailer transporter using Gmail SMTP.
 * Credentials come from EMAIL_USER and EMAIL_PASS in .env.local
 */
export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
