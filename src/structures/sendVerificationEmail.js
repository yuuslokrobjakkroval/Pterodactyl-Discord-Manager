const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const settings = require("../../settings");
dotenv.config();

// Load credentials from environment variables
const SMTP_HOST = process.env.SMTP_HOST || "smtp-relay.brevo.com";
const SMTP_USER = process.env.SMTP_USER || "underscore";
const SMTP_PASS = process.env.SMTP_PASS || "underscore";
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true" || false;
const SMTP_FROM = process.env.SMTP_FROM || `no-reply@${settings.productDomain}`;

if (!SMTP_PASS) {
  throw new Error("Missing SMTP password. Set SMTP_PASS in environment.");
}

// Configure transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST, // e.g., smtp-relay.brevo.com
  port: SMTP_PORT, // 587 for TLS, 465 for SSL
  secure: SMTP_SECURE, // true for 465, false for other ports
  auth: {
    user: SMTP_USER, // e.g., "underscore"
    pass: SMTP_PASS, // e.g., "underscore"
  },
  logger: true,
  debug: false, // Set to true for debugging
  connectionTimeout: 10000,
  greetingTimeout: 5000,
});

// Send verification email
module.exports = async function sendVerificationEmail(email, code) {
  if (!email || !code) {
    throw new Error("Email and verification code are required.");
  }

  try {
    const FROM_EMAIL = SMTP_FROM || `no-reply@${settings.productDomain}`;
    const result = await transporter.sendMail({
      from: `${settings.productName} <${FROM_EMAIL}>`,
      to: email,
      subject: `${settings.productName} Email Verification`,
      html: `
        <div style="font-family:sans-serif; padding:20px; background:#f9f9f9; border-radius:8px;">
          <h2 style="color:#333;">Verify Your Email</h2>
          <p>Your one-time verification code is:</p>
          <div style="font-size:22px; font-weight:bold; margin:10px 0; color:#000;">${code}</div>
          <p>This code will expire in <strong>5 minutes</strong>.</p>
          <p style="margin-top:20px; color:#555;">If you didn$’t request this, you can safely ignore this email.</p>
          <p style="margin-top:30px; font-size:13px; color:#888;">
            ⚠️ <strong>Please do not reply to this email.</strong> This mailbox is not monitored.
          </p>
          <hr style="margin:20px 0; border:none; border-top:1px solid #ddd;" />
          <footer style="font-size:12px; color:#aaa;">
            ${settings.productName} • <a href="${settings.productUrl}" style="color:#888; text-decoration:none;">${settings.productUrl}</a>
          </footer>
        </div>
      `,
    });

    console.log(`✅ Verification email sent to ${email}`, result.messageId);
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error);
    throw error;
  }
};
