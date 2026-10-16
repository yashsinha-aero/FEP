const express = require("express");
const crypto = require("crypto");
const { db, formatApplication } = require("../db");
const { authMiddleware } = require("../auth");
const { sendMail, SENDER_EMAIL } = require("../mailer");

const router = express.Router();

// ─── LIST APPLICATIONS ────────────────────────────────────────────────────────
router.get("/", authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const { projectId, studentId, professorId, adminApprovalStatus } = req.query;
    const isAdmin = user.isAdmin || user.role === "admin";

    let sql = "SELECT * FROM applications WHERE 1=1";
    const params = [];

    if (isAdmin) {
      if (projectId) {
        sql += " AND project_id = ?";
        params.push(projectId);
      }
      if (studentId) {
        sql += " AND student_id = ?";
        params.push(studentId);
      }
      if (professorId) {
        sql += " AND professor_id = ?";
        params.push(professorId);
      }
      if (adminApprovalStatus) {
        sql += " AND admin_approval_status = ?";
        params.push(adminApprovalStatus);
      }
    } else if (user.role === "professor") {
      sql += " AND professor_id = ? AND admin_approval_status = 'approved'";
      params.push(user.id);
      if (projectId) {
        sql += " AND project_id = ?";
        params.push(projectId);
      }
    } else {
      // Student
      sql += " AND student_id = ?";
      params.push(user.id);
      if (projectId) {
        sql += " AND project_id = ?";
        params.push(projectId);
      }
    }

    sql += " ORDER BY created_at DESC";

    const rows = db.prepare(sql).all(...params);
    const applications = rows.map(formatApplication);

    return res.json(applications);
  } catch (error) {
    console.error("List applications error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET SINGLE APPLICATION ───────────────────────────────────────────────────
router.get("/:id", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);

    if (!row) {
      return res.status(404).json({ error: "Application not found." });
    }

    const isAdmin = user.isAdmin || user.role === "admin";
    const isParticipant = row.student_id === user.id || row.professor_id === user.id;

    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ error: "Access denied to this application." });
    }

    return res.json(formatApplication(row));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── SUBMIT APPLICATION (Student) ─────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "student") {
      return res.status(403).json({ error: "Only students can submit applications." });
    }

    const {
      projectId,
      cpi,
      experience,
      coverNote,
      resumeUrl,
      documents,
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required." });
    }

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    if (project.status === "closed") {
      return res.status(400).json({ error: "This project is closed for applications." });
    }

    // Check if already applied
    const existing = db.prepare(`
      SELECT * FROM applications WHERE project_id = ? AND student_id = ?
    `).get(projectId, user.id);

    if (existing) {
      return res.status(400).json({ error: "You have already applied to this project." });
    }

    const appId = "app_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date().toISOString();
    const docsJson = Array.isArray(documents) ? JSON.stringify(documents) : "[]";

    db.prepare(`
      INSERT INTO applications (
        id, project_id, project_title, student_id, student_name, student_email,
        cpi, experience, cover_note, resume_url, documents,
        professor_id, professor_name, professor_email, status,
        admin_approval_status, notification_email_sent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', 'pending', 0, ?, ?)
    `).run(
      appId,
      project.id,
      project.title,
      user.id,
      user.fullName,
      user.email,
      cpi || "",
      experience || "",
      coverNote || "",
      resumeUrl || null,
      docsJson,
      project.created_by,
      project.created_by_name,
      project.created_by_email,
      now,
      now
    );

    const createdRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(appId);
    return res.status(201).json(formatApplication(createdRow));
  } catch (error) {
    console.error("Submit application error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── UPDATE APPLICATION STATUS (Professor) ───────────────────────────────────
router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = req.user;

    const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
    if (!appRow) {
      return res.status(404).json({ error: "Application not found." });
    }

    const isOwner = appRow.professor_id === user.id;
    const isAdmin = user.isAdmin || user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Forbidden: You cannot change this application's status." });
    }

    const validStatuses = ["applied", "pending", "shortlisted", "selected", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE applications SET status = ?, updated_at = ? WHERE id = ?
    `).run(status, now, id);

    // Send status update notification email to student
    try {
      if (appRow.student_email) {
        await sendMail({
          to: appRow.student_email,
          subject: `Application Status Updated: ${appRow.project_title}`,
          text: `Your application status for "${appRow.project_title}" has been updated to "${status.toUpperCase()}".`,
          html: `
            <div style="font-family: sans-serif; padding: 24px; background: #f8fafc;">
              <h2 style="color: #0f294a;">Foreign Exposure Programme</h2>
              <p>Dear ${appRow.student_name},</p>
              <p>Your application status for <strong>${appRow.project_title}</strong> under Professor <strong>${appRow.professor_name}</strong> has been updated to:</p>
              <div style="padding: 16px; background: #ffffff; border-radius: 6px; text-align: center; margin: 16px 0; border: 1px solid #e2e8f0;">
                <h3 style="color: #0284c7; text-transform: uppercase; margin: 0;">${status}</h3>
              </div>
            </div>
          `,
        });
      }
    } catch (mailErr) {
      console.warn("Could not send student status email:", mailErr.message);
    }

    const updatedRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
    return res.json(formatApplication(updatedRow));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── ADMIN APPROVAL STATUS (Admin) ───────────────────────────────────────────
router.put("/:id/admin-approval", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { adminApprovalStatus } = req.body;
    const user = req.user;

    if (!user.isAdmin && user.role !== "admin") {
      return res.status(403).json({ error: "Administrator privileges required." });
    }

    if (!["approved", "rejected", "pending"].includes(adminApprovalStatus)) {
      return res.status(400).json({ error: "Invalid approval status." });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE applications SET admin_approval_status = ?, updated_at = ? WHERE id = ?
    `).run(adminApprovalStatus, now, id);

    const updatedRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
    return res.json(formatApplication(updatedRow));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── DELETE APPLICATION ───────────────────────────────────────────────────────
router.delete("/:id", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);

    if (!appRow) {
      return res.status(404).json({ error: "Application not found." });
    }

    const isStudentOwner = appRow.student_id === user.id;
    const isAdmin = user.isAdmin || user.role === "admin";

    if (!isStudentOwner && !isAdmin) {
      return res.status(403).json({ error: "Forbidden: You cannot delete this application." });
    }

    db.prepare("DELETE FROM applications WHERE id = ?").run(id);
    return res.json({ success: true, message: "Application deleted." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── CHAT MESSAGES ───────────────────────────────────────────────────────────
router.get("/:id/messages", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);

    if (!appRow) {
      return res.status(404).json({ error: "Application not found." });
    }

    const isAdmin = user.isAdmin || user.role === "admin";
    const isParticipant = appRow.student_id === user.id || appRow.professor_id === user.id;

    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ error: "Forbidden: Access denied to these messages." });
    }

    const rows = db.prepare(`
      SELECT * FROM messages WHERE application_id = ? ORDER BY created_at ASC
    `).all(id);

    return res.json(rows.map((r) => ({
      id: r.id,
      applicationId: r.application_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderRole: r.sender_role,
      message: r.message,
      read: Boolean(r.read),
      createdAt: r.created_at,
    })));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/:id/messages", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const user = req.user;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message content cannot be empty." });
    }

    const appRow = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
    if (!appRow) {
      return res.status(404).json({ error: "Application not found." });
    }

    const isAdmin = user.isAdmin || user.role === "admin";
    const isParticipant = appRow.student_id === user.id || appRow.professor_id === user.id;

    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ error: "Forbidden: You cannot send messages in this application." });
    }

    const msgId = "msg_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (id, application_id, sender_id, sender_name, sender_role, message, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      msgId,
      id,
      user.id,
      user.fullName,
      user.role,
      message.trim(),
      now
    );

    return res.status(201).json({
      id: msgId,
      applicationId: id,
      senderId: user.id,
      senderName: user.fullName,
      senderRole: user.role,
      message: message.trim(),
      read: false,
      createdAt: now,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/:id/messages/read", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Mark messages sent by others as read
    db.prepare(`
      UPDATE messages SET read = 1 WHERE application_id = ? AND sender_id != ?
    `).run(id, user.id);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
