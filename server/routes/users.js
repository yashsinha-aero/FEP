const express = require("express");
const { db, formatUser } = require("../db");
const { authMiddleware } = require("../auth");

const router = express.Router();

// ─── LIST ALL USERS (Admin Only) ─────────────────────────────────────────────
router.get("/", authMiddleware, (req, res) => {
  try {
    const user = req.user;
    if (!user.isAdmin && user.role !== "admin") {
      return res.status(403).json({ error: "Administrator privileges required." });
    }

    const { role } = req.query;
    let sql = "SELECT * FROM users WHERE 1=1";
    const params = [];

    if (role) {
      sql += " AND role = ?";
      params.push(role);
    }

    sql += " ORDER BY created_at DESC";
    const rows = db.prepare(sql).all(...params);

    return res.json(rows.map(formatUser));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET USER BY ID ──────────────────────────────────────────────────────────
router.get("/:id", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);

    if (!row) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json(formatUser(row));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── UPDATE USER PROFILE ─────────────────────────────────────────────────────
router.put("/:id", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const isSelf = user.id === id;
    const isAdmin = user.isAdmin || user.role === "admin";

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "Forbidden: You cannot update another user's profile." });
    }

    const updates = req.body;
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "User not found." });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users SET
        full_name = coalesce(?, full_name),
        phone = coalesce(?, phone),
        institute = coalesce(?, institute),
        roll = coalesce(?, roll),
        programme = coalesce(?, programme),
        department1 = coalesce(?, department1),
        department2 = coalesce(?, department2),
        interest = coalesce(?, interest),
        designation = coalesce(?, designation),
        bio = coalesce(?, bio),
        website = coalesce(?, website),
        updated_at = ?
      WHERE id = ?
    `).run(
      updates.fullName !== undefined ? updates.fullName.trim() : null,
      updates.phone !== undefined ? updates.phone : null,
      updates.institute !== undefined ? updates.institute : null,
      updates.roll !== undefined ? updates.roll : null,
      updates.programme !== undefined ? updates.programme : null,
      updates.department1 !== undefined ? updates.department1 : null,
      updates.department2 !== undefined ? updates.department2 : null,
      updates.interest !== undefined ? updates.interest : null,
      updates.designation !== undefined ? updates.designation : null,
      updates.bio !== undefined ? updates.bio : null,
      updates.website !== undefined ? updates.website : null,
      now,
      id
    );

    const updatedRow = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return res.json(formatUser(updatedRow));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── USER NOTIFICATIONS ──────────────────────────────────────────────────────
router.get("/:id/notifications", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (user.id !== id && !user.isAdmin) {
      return res.status(403).json({ error: "Access denied." });
    }

    const rows = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC
    `).all(id);

    return res.json(rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      message: r.message,
      link: r.link,
      read: Boolean(r.read),
      createdAt: r.created_at,
    })));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/:id/notifications/:notifId/read", authMiddleware, (req, res) => {
  try {
    const { id, notifId } = req.params;
    const user = req.user;

    if (user.id !== id && !user.isAdmin) {
      return res.status(403).json({ error: "Access denied." });
    }

    db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(notifId, id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
