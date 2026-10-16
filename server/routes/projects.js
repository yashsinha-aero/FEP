const express = require("express");
const crypto = require("crypto");
const { db, formatProject } = require("../db");
const { authMiddleware, optionalAuthMiddleware } = require("../auth");

const router = express.Router();

// ─── LIST PROJECTS ────────────────────────────────────────────────────────────
router.get("/", optionalAuthMiddleware, (req, res) => {
  try {
    const { status, publishingStatus, createdBy } = req.query;
    const user = req.user;
    const isUserAdmin = user && (user.isAdmin || user.role === "admin");
    const isProfessor = user && user.role === "professor";

    let query = "SELECT * FROM projects WHERE 1=1";
    const params = [];

    // Access control on publishing status:
    // If not admin and not filtering by own created projects, non-admin users only see approved projects
    if (createdBy) {
      query += " AND created_by = ?";
      params.push(createdBy);
      if (publishingStatus) {
        query += " AND publishing_status = ?";
        params.push(publishingStatus);
      }
    } else if (isUserAdmin) {
      if (publishingStatus) {
        query += " AND publishing_status = ?";
        params.push(publishingStatus);
      }
    } else {
      // General public / student view
      query += " AND publishing_status = 'approved'";
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const rows = db.prepare(query).all(...params);
    const projects = rows.map(formatProject);

    return res.json(projects);
  } catch (error) {
    console.error("List projects error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET SINGLE PROJECT ───────────────────────────────────────────────────────
router.get("/:id", optionalAuthMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);

    if (!row) {
      return res.status(404).json({ error: "Project not found." });
    }

    const project = formatProject(row);
    return res.json(project);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── CREATE PROJECT (Professors Only) ─────────────────────────────────────────
router.post("/", authMiddleware, (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "professor" && !user.isAdmin) {
      return res.status(403).json({ error: "Only faculty accounts can create projects." });
    }

    const {
      title,
      description,
      department,
      departments,
      stipend,
      duration,
      deadline,
      requirements,
      qualifications,
      location,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Project title is required." });
    }

    const projectId = "p_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date().toISOString();

    const deptsJson = Array.isArray(departments)
      ? JSON.stringify(departments)
      : JSON.stringify(department ? [department] : []);

    db.prepare(`
      INSERT INTO projects (
        id, title, description, department, departments, stipend, duration,
        deadline, requirements, qualifications, location, status,
        publishing_status, created_by, created_by_name, created_by_email,
        created_by_institute, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'pending', ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      title.trim(),
      description || "",
      department || "",
      deptsJson,
      stipend || "",
      duration || "",
      deadline || "",
      requirements || "",
      qualifications || "",
      location || "",
      user.id,
      user.fullName || user.displayName || "",
      user.email,
      user.institute || "",
      now,
      now
    );

    const createdRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
    return res.status(201).json(formatProject(createdRow));
  } catch (error) {
    console.error("Create project error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── UPDATE PROJECT ───────────────────────────────────────────────────────────
router.put("/:id", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Project not found." });
    }

    const isOwner = existing.created_by === user.id;
    const isAdmin = user.isAdmin || user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Forbidden: You cannot edit this project." });
    }

    const updates = req.body;
    const now = new Date().toISOString();

    const currentDepts = existing.departments ? JSON.parse(existing.departments) : [];
    const newDepts = updates.departments !== undefined
      ? (Array.isArray(updates.departments) ? JSON.stringify(updates.departments) : JSON.stringify([updates.departments]))
      : JSON.stringify(currentDepts);

    // Only admins can change publishingStatus
    let publishingStatus = existing.publishing_status;
    if (isAdmin && updates.publishingStatus !== undefined) {
      publishingStatus = updates.publishingStatus;
    }

    db.prepare(`
      UPDATE projects SET
        title = coalesce(?, title),
        description = coalesce(?, description),
        department = coalesce(?, department),
        departments = ?,
        stipend = coalesce(?, stipend),
        duration = coalesce(?, duration),
        deadline = coalesce(?, deadline),
        requirements = coalesce(?, requirements),
        qualifications = coalesce(?, qualifications),
        location = coalesce(?, location),
        status = coalesce(?, status),
        publishing_status = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      updates.title !== undefined ? updates.title.trim() : null,
      updates.description !== undefined ? updates.description : null,
      updates.department !== undefined ? updates.department : null,
      newDepts,
      updates.stipend !== undefined ? updates.stipend : null,
      updates.duration !== undefined ? updates.duration : null,
      updates.deadline !== undefined ? updates.deadline : null,
      updates.requirements !== undefined ? updates.requirements : null,
      updates.qualifications !== undefined ? updates.qualifications : null,
      updates.location !== undefined ? updates.location : null,
      updates.status !== undefined ? updates.status : null,
      publishingStatus,
      now,
      id
    );

    const updatedRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return res.json(formatProject(updatedRow));
  } catch (error) {
    console.error("Update project error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── DELETE PROJECT ───────────────────────────────────────────────────────────
router.delete("/:id", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Project not found." });
    }

    const isOwner = existing.created_by === user.id;
    const isAdmin = user.isAdmin || user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Forbidden: You cannot delete this project." });
    }

    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return res.json({ success: true, message: "Project deleted." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── PROJECT ANNOUNCEMENTS ───────────────────────────────────────────────────
router.get("/:id/announcements", (req, res) => {
  try {
    const { id } = req.params;
    const rows = db.prepare(`
      SELECT * FROM project_announcements WHERE project_id = ? ORDER BY created_at DESC
    `).all(id);

    return res.json(rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      message: r.message,
      authorId: r.author_id,
      authorName: r.author_name,
      createdAt: r.created_at,
    })));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/:id/announcements", authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { title, message } = req.body;
    const user = req.user;

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    if (project.created_by !== user.id && !user.isAdmin) {
      return res.status(403).json({ error: "Only project owner or admin can post announcements." });
    }

    const announcementId = "pa_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO project_announcements (id, project_id, title, message, author_id, author_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(announcementId, id, title || "", message, user.id, user.fullName, now);

    return res.status(201).json({
      id: announcementId,
      projectId: id,
      title: title || "",
      message,
      authorId: user.id,
      authorName: user.fullName,
      createdAt: now,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
