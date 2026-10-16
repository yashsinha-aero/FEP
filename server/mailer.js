const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST || "mmtp.iitk.ac.in";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465", 10);
const SMTP_USER = process.env.SMTP_USER || "fep@iitk.ac.in";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SENDER_EMAIL = process.env.SENDER_EMAIL || "fep@iitk.ac.in";

let transporter = null;

if (SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
  });
}

const sendMail = async ({ to, subject, text, html }) => {
  if (!transporter) {
    console.log("-------------------------------------------------------");
    console.log(`[LOCAL DEV MAIL SIMULATOR] To: ${to}`);
    console.log(`Subject: ${subject}`);
    if (text) console.log(`Text: ${text}`);
    console.log("-------------------------------------------------------");
    return { messageId: "simulated-" + Date.now() };
  }

  try {
    return await transporter.sendMail({
      from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("Failed to send email via SMTP:", error.message);
    // In local dev, don't crash if SMTP fails
    if (process.env.NODE_ENV !== "production") {
      console.warn("Falling back to console mail simulation for local testing.");
      return { messageId: "failed-smtp-fallback-" + Date.now() };
    }
    throw error;
  }
};

module.exports = {
  sendMail,
  SENDER_EMAIL,
};
