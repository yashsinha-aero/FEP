const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { db, formatUser } = require("../db");
const { authMiddleware } = require("../auth");

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const RESUMES_DIR = path.join(UPLOADS_DIR, "resumes");
const DOCS_DIR = path.join(UPLOADS_DIR, "documents");

[RESUMES_DIR, DOCS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Configure Multer storage
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RESUMES_DIR),
  filename: (req, file, cb) => {
    const userId = req.user ? req.user.id : "anon";
    const timestamp = Date.now();
    const cleanOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${userId}_${timestamp}_${cleanOriginalName}`);
  },
});

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCS_DIR),
  filename: (req, file, cb) => {
    const userId = req.user ? req.user.id : "anon";
    const timestamp = Date.now();
    const cleanOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${userId}_${timestamp}_${cleanOriginalName}`);
  },
});

const uploadResumeMulter = multer({
  storage: resumeStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadDocMulter = multer({
  storage: docStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ─── UPLOAD RESUME ────────────────────────────────────────────────────────────
router.post("/resume", authMiddleware, uploadResumeMulter.single("resume"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No resume file provided." });
    }

    const user = req.user;
    const resumeName = (req.body.name || req.file.originalname).trim();
    const fileUrl = `/api/files/resumes/${req.file.filename}`;
    const storagePath = `resumes/${req.file.filename}`;
    const uploadedAt = new Date().toISOString();

    const newResume = {
      name: resumeName,
      url: fileUrl,
      storagePath,
      uploadedAt,
    };

    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    const existingResumes = userRow.resumes ? JSON.parse(userRow.resumes) : [];
    const updatedResumes = [...existingResumes, newResume];

    db.prepare("UPDATE users SET resumes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(updatedResumes), user.id);

    return res.status(201).json({
      success: true,
      resume: newResume,
      resumes: updatedResumes,
    });
  } catch (error) {
    console.error("Upload resume error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── DELETE RESUME ────────────────────────────────────────────────────────────
router.delete("/resume", authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const { storagePath, url } = req.body;

    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    const existingResumes = userRow.resumes ? JSON.parse(userRow.resumes) : [];

    const updatedResumes = existingResumes.filter((r) => {
      if (storagePath && r.storagePath === storagePath) return false;
      if (url && r.url === url) return false;
      return true;
    });

    db.prepare("UPDATE users SET resumes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(updatedResumes), user.id);

    // Optionally remove file from disk
    if (storagePath) {
      const filename = path.basename(storagePath);
      const filePath = path.join(RESUMES_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    return res.json({ success: true, resumes: updatedResumes });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── UPLOAD SUPPORTING DOCUMENT ──────────────────────────────────────────────
router.post("/document", authMiddleware, uploadDocMulter.single("document"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No document file provided." });
    }

    const user = req.user;
    const docName = (req.body.name || req.file.originalname).trim();
    const fileUrl = `/api/files/documents/${req.file.filename}`;
    const storagePath = `documents/${req.file.filename}`;
    const uploadedAt = new Date().toISOString();
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const newDoc = {
      id: docId,
      name: docName,
      fileName: req.file.originalname,
      url: fileUrl,
      storagePath,
      uploadedAt,
    };

    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    const existingDocs = userRow.documents ? JSON.parse(userRow.documents) : [];
    const updatedDocs = [...existingDocs, newDoc];

    db.prepare("UPDATE users SET documents = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(updatedDocs), user.id);

    return res.status(201).json({
      success: true,
      document: newDoc,
      documents: updatedDocs,
    });
  } catch (error) {
    console.error("Upload document error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── DELETE DOCUMENT ─────────────────────────────────────────────────────────
router.delete("/document", authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const { id, storagePath } = req.body;

    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    const existingDocs = userRow.documents ? JSON.parse(userRow.documents) : [];

    const updatedDocs = existingDocs.filter((d) => {
      if (id && d.id === id) return false;
      if (storagePath && d.storagePath === storagePath) return false;
      return true;
    });

    db.prepare("UPDATE users SET documents = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(updatedDocs), user.id);

    if (storagePath) {
      const filename = path.basename(storagePath);
      const filePath = path.join(DOCS_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    return res.json({ success: true, documents: updatedDocs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─── SERVE UPLOADED FILES ─────────────────────────────────────────────────────
router.get("/files/:type/:filename", (req, res) => {
  try {
    const { type, filename } = req.params;
    if (!["resumes", "documents"].includes(type)) {
      return res.status(400).json({ error: "Invalid file category." });
    }

    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const targetDir = type === "resumes" ? RESUMES_DIR : DOCS_DIR;
    const filePath = path.join(targetDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found." });
    }

    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
