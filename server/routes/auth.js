const express = require("express");
const crypto = require("crypto");
const { db, formatUser } = require("../db");
const {
  hashPassword,
  comparePassword,
  generateToken,
  authMiddleware,
} = require("../auth");
const { sendMail, SENDER_EMAIL } = require("../mailer");

const router = express.Router();

const STUDENT_EMAIL_DOMAIN = "iitk.ac.in";
const ALLOWED_INSTITUTE_DOMAIN_LABELS = [
  "edu", "ac", "int", "dk", "de", "ch", "se", "no", "fi", "nl", "be", "fr", "ca", "it", "es", "at"
];

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getEmailDomain = (email = "") => {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "";
  return parts[1];
};

const validateSignupEmail = (email, role) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  // Backdoor check for test accounts
  const parts = normalizedEmail.split("@");
  if (parts.length === 2) {
    const localPart = parts[0].split("+")[0];
    const domainPart = parts[1];
    if (localPart === "yash.sinha2006" && domainPart === "gmail.com") {
      return null;
    }
  }

  const domain = getEmailDomain(normalizedEmail);
  if (!normalizedEmail || !role) return "Email and role are required.";

  if (role === "student") {
    return domain === STUDENT_EMAIL_DOMAIN
      ? null
      : "Students can sign up only with @iitk.ac.in.";
  }

  if (role === "professor") {
    const domainParts = domain.split(".");
    const isEducational = domainParts.some((part) =>
      ALLOWED_INSTITUTE_DOMAIN_LABELS.includes(part)
    );
    return isEducational
      ? null
      : "Professors can sign up only with an institutional email (e.g. .edu, .ac, .dk).";
  }

  return null;
};

// ─── SIGNUP / REGISTER ───────────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  try {
    const { email, role, fullName, password, ...rest } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const emailError = validateSignupEmail(normalizedEmail, role);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    // Check if user already exists
    const existingUser = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
    if (existingUser && existingUser.email_verified) {
      return res.status(400).json({ error: "The email address is already in use by another account." });
    }

    const otp = generateOtp();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const resendAllowedAt = Date.now() + 60 * 1000;

    // Store OTP & pending signup data in SQLite
    const signupData = {
      fullName,
      email: normalizedEmail,
      password,
      role,
      ...rest,
    };

    db.prepare(`
      INSERT INTO otps (id, type, otp_hash, expires_at, resend_allowed_at, attempts, data, created_at)
      VALUES (?, 'email_verify', ?, ?, ?, 0, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        otp_hash = excluded.otp_hash,
        expires_at = excluded.expires_at,
        resend_allowed_at = excluded.resend_allowed_at,
        attempts = 0,
        data = excluded.data,
        created_at = excluded.created_at
    `).run(normalizedEmail, otpHash, expiresAt, resendAllowedAt, JSON.stringify(signupData));

    // Send Verification Email
    await sendMail({
      to: normalizedEmail,
      subject: "Email Verification OTP — Foreign Exposure Programme",
      text: `Your FEP verification OTP is ${otp}. It expires in 10 minutes.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; background: #f8fafc; border-radius: 8px;">
          <h2 style="color: #0f294a;">Foreign Exposure Programme (FEP)</h2>
          <p>Please use the verification code below to confirm your email and complete your registration:</p>
          <div style="background: #ffffff; padding: 18px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; margin: 18px 0;">
            <span style="font-size: 32px; font-weight: 700; color: #0284c7; letter-spacing: 6px;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 13px;">This code will expire in 10 minutes.</p>
        </div>
      `,
    });

    return res.json({ status: "otp_sent" });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: error.message || "Failed to process signup" });
  }
});

// ─── VERIFY OTP & CREATE ACCOUNT ─────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp, signupData: rawSignupData } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const otpRow = db.prepare("SELECT * FROM otps WHERE id = ? AND type = 'email_verify'").get(normalizedEmail);
    if (!otpRow) {
      return res.status(400).json({ error: "No OTP found. Please request a new code." });
    }

    if (Date.now() > otpRow.expires_at) {
      return res.status(400).json({ error: "OTP expired. Please request a new code." });
    }

    if (otpRow.attempts >= 5) {
      return res.status(400).json({ error: "Too many failed attempts. Please request a new code." });
    }

    const inputHash = crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
    if (inputHash !== otpRow.otp_hash) {
      db.prepare("UPDATE otps SET attempts = attempts + 1 WHERE id = ?").run(normalizedEmail);
      return res.status(400).json({ error: "Invalid OTP code." });
    }

    const signupData = rawSignupData || (otpRow.data ? JSON.parse(otpRow.data) : null);
    if (!signupData) {
      return res.status(400).json({ error: "Signup details missing. Please register again." });
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(signupData.password);
    const userId = "u_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date().toISOString();

    // Insert user into SQLite
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, role, is_admin, email_verified,
        institute, roll, programme, department1, department2, interest, phone,
        resumes, documents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        password_hash = excluded.password_hash,
        full_name = excluded.full_name,
        role = excluded.role,
        email_verified = 1,
        institute = excluded.institute,
        roll = excluded.roll,
        programme = excluded.programme,
        department1 = excluded.department1,
        department2 = excluded.department2,
        interest = excluded.interest,
        phone = excluded.phone,
        updated_at = excluded.updated_at
    `).run(
      userId,
      normalizedEmail,
      passwordHash,
      signupData.fullName,
      signupData.role,
      signupData.institute || null,
      signupData.roll || null,
      signupData.programme || null,
      signupData.department1 || null,
      signupData.department2 || null,
      signupData.interest || null,
      signupData.phone || null,
      now,
      now
    );

    // Delete OTP
    db.prepare("DELETE FROM otps WHERE id = ?").run(normalizedEmail);

    const userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
    const user = formatUser(userRow);
    const token = generateToken(user);

    return res.json({
      status: "verified",
      token,
      user,
    });
  } catch (error) {
    console.error("verify-otp error:", error);
    return res.status(500).json({ error: "Verification failed: " + error.message });
  }
});

// ─── RESEND OTP ──────────────────────────────────────────────────────────────
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const otpRow = db.prepare("SELECT * FROM otps WHERE id = ?").get(normalizedEmail);
    if (!otpRow) {
      return res.status(400).json({ error: "No active verification found. Please register again." });
    }

    if (Date.now() < otpRow.resend_allowed_at) {
      const waitSec = Math.ceil((otpRow.resend_allowed_at - Date.now()) / 1000);
      return res.status(400).json({ error: `Please wait ${waitSec}s before requesting a new code.` });
    }

    const otp = generateOtp();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const resendAllowedAt = Date.now() + 60 * 1000;

    db.prepare(`
      UPDATE otps SET
        otp_hash = ?,
        expires_at = ?,
        resend_allowed_at = ?,
        attempts = 0
      WHERE id = ?
    `).run(otpHash, expiresAt, resendAllowedAt, normalizedEmail);

    await sendMail({
      to: normalizedEmail,
      subject: "Resent Verification OTP — Foreign Exposure Programme",
      text: `Your new OTP is ${otp}.`,
    });

    return res.json({ status: "otp_sent" });
  } catch (error) {
    console.error("resend-otp error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── LOGIN CHECK EMAIL & AUTHENTICATE ────────────────────────────────────────
router.post("/login-check-email", async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
    if (!userRow) {
      return res.json({ status: "not_found" });
    }

    if (!userRow.email_verified) {
      return res.json({ status: "unverified" });
    }

    return res.json({ status: "verified" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── LOGIN (Direct Email & Password) ─────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);

    if (!userRow) {
      return res.status(400).json({ error: "No account found with this email." });
    }

    if (!userRow.email_verified) {
      return res.status(400).json({ error: "Email is not verified. Please verify your email first.", status: "unverified" });
    }

    const isMatch = await comparePassword(password, userRow.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect password." });
    }

    const user = formatUser(userRow);
    const token = generateToken(user);

    return res.json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── ADMIN LOGIN ─────────────────────────────────────────────────────────────
router.post("/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);

    if (!userRow) {
      return res.status(400).json({ error: "Access denied. Invalid administrator credentials." });
    }

    if (!userRow.is_admin && userRow.role !== "admin") {
      return res.status(403).json({ error: "Access denied. You do not have administrator privileges." });
    }

    const isMatch = await comparePassword(password, userRow.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid administrator credentials." });
    }

    const user = formatUser(userRow);
    const token = generateToken(user);

    return res.json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    console.error("admin-login error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── CURRENT USER (ME) ───────────────────────────────────────────────────────
router.get("/me", authMiddleware, (req, res) => {
  return res.json({ user: req.user });
});

// ─── PASSWORD RESET FLOW ─────────────────────────────────────────────────────
router.post("/request-reset-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
    if (!userRow) {
      return res.status(404).json({ error: "No account found with this email." });
    }

    const otp = generateOtp();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const resendAllowedAt = Date.now() + 60 * 1000;

    db.prepare(`
      INSERT INTO otps (id, type, otp_hash, expires_at, resend_allowed_at, attempts, created_at)
      VALUES (?, 'password_reset', ?, ?, ?, 0, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        otp_hash = excluded.otp_hash,
        expires_at = excluded.expires_at,
        resend_allowed_at = excluded.resend_allowed_at,
        attempts = 0,
        created_at = excluded.created_at
    `).run(normalizedEmail, otpHash, expiresAt, resendAllowedAt);

    await sendMail({
      to: normalizedEmail,
      subject: "Password Reset Code — Foreign Exposure Programme",
      text: `Your password reset code is ${otp}. It expires in 10 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>Use the code below to reset your FEP password:</p>
          <h1 style="color: #0284c7; letter-spacing: 4px;">${otp}</h1>
          <p style="color: #64748b;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    return res.json({ status: "otp_sent" });
  } catch (error) {
    console.error("request-reset-otp error:", error);
    return res.status(500).json({ error: error.message });
  }
});

router.post("/verify-reset-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const otpRow = db.prepare("SELECT * FROM otps WHERE id = ? AND type = 'password_reset'").get(normalizedEmail);
    if (!otpRow) {
      return res.status(400).json({ error: "No reset request found." });
    }

    if (Date.now() > otpRow.expires_at) {
      return res.status(400).json({ error: "Reset code expired." });
    }

    const inputHash = crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
    if (inputHash !== otpRow.otp_hash) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    // Generate a secure reset token valid for 15 minutes
    const resetToken = crypto.randomBytes(32).toString("hex");
    db.prepare(`
      UPDATE otps SET data = ? WHERE id = ?
    `).run(JSON.stringify({ resetToken, verifiedAt: Date.now() }), normalizedEmail);

    return res.json({ status: "verified", resetToken });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/execute-reset-password", async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }

    const otpRow = db.prepare("SELECT * FROM otps WHERE id = ? AND type = 'password_reset'").get(normalizedEmail);
    if (!otpRow || !otpRow.data) {
      return res.status(400).json({ error: "Unauthorized password reset attempt." });
    }

    const parsedData = JSON.parse(otpRow.data);
    if (parsedData.resetToken !== resetToken) {
      return res.status(400).json({ error: "Invalid reset token." });
    }

    const newHash = await hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE email = ?").run(newHash, normalizedEmail);
    db.prepare("DELETE FROM otps WHERE id = ?").run(normalizedEmail);

    return res.json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── ACCOUNT DELETION OTP & EXECUTE ──────────────────────────────────────────
router.post("/request-delete-code", authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const code = generateOtp();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;

    db.prepare(`
      INSERT INTO otps (id, type, otp_hash, expires_at, resend_allowed_at, attempts, created_at)
      VALUES (?, 'account_delete', ?, ?, ?, 0, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        otp_hash = excluded.otp_hash,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at
    `).run(userEmail, codeHash, expiresAt, Date.now() + 60000);

    await sendMail({
      to: userEmail,
      subject: "Account Deletion Confirmation Code — FEP",
      text: `Your confirmation code for permanently deleting your FEP account is ${code}. It expires in 10 minutes.`,
    });

    return res.json({ status: "code_sent" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/delete-account", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    const userEmail = req.user.email;
    const userId = req.user.id;

    const otpRow = db.prepare("SELECT * FROM otps WHERE id = ? AND type = 'account_delete'").get(userEmail);
    if (!otpRow) {
      return res.status(400).json({ error: "No deletion request found." });
    }

    const inputHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");
    if (inputHash !== otpRow.otp_hash) {
      return res.status(400).json({ error: "Invalid deletion confirmation code." });
    }

    // Cascade deletes user and related rows (via FOREIGN KEY ON DELETE CASCADE)
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    db.prepare("DELETE FROM otps WHERE id = ?").run(userEmail);

    return res.json({ status: "deleted" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
