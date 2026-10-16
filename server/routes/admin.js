const express = require("express");
const crypto = require("crypto");
const { db, formatUser } = require("../db");
const { authMiddleware, adminMiddleware, hashPassword } = require("../auth");
const { sendMail, SENDER_EMAIL } = require("../mailer");

const router = express.Router();

const generateSecureTemporaryPassword = () => {
  const charsUpper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const charsLower = "abcdefghjkmnpqrstuvwxyz";
  const charsDigits = "23456789";
  const charsSpecial = "@#$&*!";

  let password = "";
  password += charsUpper[crypto.randomInt(0, charsUpper.length)];
  password += charsLower[crypto.randomInt(0, charsLower.length)];
  password += charsDigits[crypto.randomInt(0, charsDigits.length)];
  password += charsSpecial[crypto.randomInt(0, charsSpecial.length)];

  const allChars = charsUpper + charsLower + charsDigits + charsSpecial;
  for (let i = 0; i < 8; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)];
  }

  return password.split("").sort(() => 0.5 - Math.random()).join("");
};

// ─── ADMIN: CREATE PROFESSOR ACCOUNT ─────────────────────────────────────────
router.post("/admin-create-professor", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      fullName,
      email,
      institute,
      department1,
      department2,
      designation,
      interest,
      phone,
      website,
      bio,
      customPassword,
    } = req.body;

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !fullName) {
      return res.status(400).json({ error: "Email and Full Name are required." });
    }

    const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: "An account already exists with this email address." });
    }

    const temporaryPassword = customPassword && String(customPassword).trim()
      ? String(customPassword).trim()
      : generateSecureTemporaryPassword();

    const passwordHash = await hashPassword(temporaryPassword);
    const userId = "u_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, role, is_admin, email_verified,
        institute, designation, department1, department2, interest, phone,
        website, bio, resumes, documents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'professor', 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?)
    `).run(
      userId,
      normalizedEmail,
      passwordHash,
      fullName.trim(),
      institute ? institute.trim() : null,
      designation ? designation.trim() : "Professor",
      department1 ? department1.trim() : null,
      department2 ? department2.trim() : null,
      interest ? (Array.isArray(interest) ? interest.join(", ") : interest) : null,
      phone ? phone.trim() : null,
      website ? website.trim() : null,
      bio ? bio.trim() : null,
      now,
      now
    );

    // Send Onboarding Email
    await sendMail({
      to: normalizedEmail,
      subject: "Welcome to FEP Portal — IIT Kanpur Faculty Account Created",
      text: `Dear ${fullName},\n\nAn account has been created for you on the IIT Kanpur Foreign Exposure Programme portal.\n\nLogin Email: ${normalizedEmail}\nTemporary Password: ${temporaryPassword}\n\nPlease log in and update your password.`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; background: #f8fafc; border-radius: 8px;">
          <h2 style="color: #0f294a;">Foreign Exposure Programme — IIT Kanpur</h2>
          <p>Dear ${fullName},</p>
          <p>An account has been created for you on the IIT Kanpur Foreign Exposure Programme (FEP) portal.</p>
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Login Email:</strong> ${normalizedEmail}</p>
            <p style="margin: 0;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${temporaryPassword}</code></p>
          </div>
          <p>You can use this portal to post research projects and evaluate applications from IIT Kanpur students.</p>
        </div>
      `,
    });

    const createdRow = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    return res.status(201).json({
      success: true,
      user: formatUser(createdRow),
      temporaryPassword,
    });
  } catch (error) {
    console.error("admin-create-professor error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── ADMIN: RESET PROFESSOR PASSWORD ─────────────────────────────────────────
router.post("/admin-reset-professor-password", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { uid, email, customPassword } = req.body;
    let targetRow = null;

    if (uid) {
      targetRow = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    } else if (email) {
      targetRow = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).trim().toLowerCase());
    }

    if (!targetRow) {
      return res.status(404).json({ error: "Professor account not found." });
    }

    const temporaryPassword = customPassword && String(customPassword).trim()
      ? String(customPassword).trim()
      : generateSecureTemporaryPassword();

    const passwordHash = await hashPassword(temporaryPassword);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, targetRow.id);

    await sendMail({
      to: targetRow.email,
      subject: "Password Reset Notice — FEP IIT Kanpur",
      text: `Your password has been reset by the administrator.\n\nTemporary Password: ${temporaryPassword}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h3>Password Reset Notice</h3>
          <p>Your password has been reset by the FEP administrator.</p>
          <p><strong>New Temporary Password:</strong> <code>${temporaryPassword}</code></p>
        </div>
      `,
    });

    return res.json({
      success: true,
      email: targetRow.email,
      temporaryPassword,
    });
  } catch (error) {
    console.error("admin-reset-professor-password error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── ADMIN: UPDATE PROFESSOR PROFILE ─────────────────────────────────────────
router.post("/admin-update-professor", authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { uid, ...updates } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "Professor UID is required." });
    }

    const targetRow = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    if (!targetRow) {
      return res.status(404).json({ error: "User not found." });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users SET
        full_name = coalesce(?, full_name),
        institute = coalesce(?, institute),
        department1 = coalesce(?, department1),
        department2 = coalesce(?, department2),
        designation = coalesce(?, designation),
        interest = coalesce(?, interest),
        phone = coalesce(?, phone),
        website = coalesce(?, website),
        bio = coalesce(?, bio),
        updated_at = ?
      WHERE id = ?
    `).run(
      updates.fullName ? updates.fullName.trim() : null,
      updates.institute ? updates.institute.trim() : null,
      updates.department1 ? updates.department1.trim() : null,
      updates.department2 ? updates.department2.trim() : null,
      updates.designation ? updates.designation.trim() : null,
      updates.interest ? (Array.isArray(updates.interest) ? updates.interest.join(", ") : updates.interest) : null,
      updates.phone ? updates.phone.trim() : null,
      updates.website ? updates.website.trim() : null,
      updates.bio ? updates.bio.trim() : null,
      now,
      uid
    );

    const updatedRow = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    return res.json({ success: true, user: formatUser(updatedRow) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── ADMIN: BROADCAST ANNOUNCEMENT ───────────────────────────────────────────
router.post("/broadcast-announcement", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { subject, message, targetRole } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and message are required." });
    }

    let sql = "SELECT email, full_name FROM users WHERE 1=1";
    const params = [];
    if (targetRole && ["student", "professor"].includes(targetRole)) {
      sql += " AND role = ?";
      params.push(targetRole);
    }

    const recipients = db.prepare(sql).all(...params);
    let sentCount = 0;

    for (const r of recipients) {
      try {
        await sendMail({
          to: r.email,
          subject: `[FEP IITK] ${subject}`,
          text: message,
          html: `
            <div style="font-family: sans-serif; padding: 24px; background: #f8fafc;">
              <h2 style="color: #0f294a;">Foreign Exposure Programme Announcement</h2>
              <p>Dear ${r.full_name},</p>
              <div style="background: #ffffff; padding: 18px; border-radius: 6px; border: 1px solid #cbd5e1; margin: 16px 0;">
                <h3 style="margin-top: 0;">${subject}</h3>
                <p style="white-space: pre-wrap;">${message}</p>
              </div>
            </div>
          `,
        });
        sentCount++;
      } catch (err) {
        console.warn(`Failed broadcast to ${r.email}:`, err.message);
      }
    }

    return res.json({ success: true, sentCount, totalRecipients: recipients.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── ADMIN: PROFESSOR APPLICATIONS DIGEST ────────────────────────────────────
router.post("/send-professor-digest", async (req, res) => {
  try {
    const unnotifiedApps = db.prepare(`
      SELECT * FROM applications
      WHERE admin_approval_status = 'approved' AND notification_email_sent = 0
    `).all();

    if (unnotifiedApps.length === 0) {
      return res.json({ sentCount: 0, message: "No new approved applications found for digest." });
    }

    // Group applications by professor
    const appsByProf = {};
    for (const app of unnotifiedApps) {
      if (!appsByProf[app.professor_id]) {
        appsByProf[app.professor_id] = [];
      }
      appsByProf[app.professor_id].push(app);
    }

    let emailedCount = 0;
    const now = new Date().toISOString();

    for (const profId of Object.keys(appsByProf)) {
      const prof = db.prepare("SELECT * FROM users WHERE id = ?").get(profId);
      if (!prof || !prof.email) continue;

      const profApps = appsByProf[profId];
      const appsListHtml = profApps.map((a) => `
        <li style="margin-bottom: 8px;">
          <strong>${a.student_name}</strong> (CPI: ${a.cpi || "N/A"}) — Project: <em>${a.project_title}</em>
        </li>
      `).join("");

      await sendMail({
        to: prof.email,
        subject: `[FEP IITK] New Applications Digest — ${profApps.length} New Application(s)`,
        text: `Dear ${prof.full_name},\n\nYou have received ${profApps.length} new approved application(s) for your projects. Please log in to review candidates.`,
        html: `
          <div style="font-family: sans-serif; padding: 24px; background: #f8fafc;">
            <h2 style="color: #0f294a;">Foreign Exposure Programme Digest</h2>
            <p>Dear ${prof.full_name},</p>
            <p>You have received <strong>${profApps.length}</strong> new approved applicant(s) for your projects:</p>
            <ul>${appsListHtml}</ul>
            <p>Please log in to the FEP portal to view resumes and take action.</p>
          </div>
        `,
      });

      emailedCount++;
      db.prepare(`
        UPDATE applications SET notification_email_sent = 1, notification_email_sent_at = ?
        WHERE professor_id = ? AND admin_approval_status = 'approved'
      `).run(now, profId);
    }

    return res.json({ sentCount: emailedCount });
  } catch (error) {
    console.error("send-professor-digest error:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
