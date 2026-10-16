const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { db } = require("./db");
const { hashPassword } = require("./auth");

const authRoutes = require("./routes/auth");
const projectRoutes = require("./routes/projects");
const applicationRoutes = require("./routes/applications");
const userRoutes = require("./routes/users");
const uploadRoutes = require("./routes/uploads");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 5001;

// CORS setup: allow local dev on ports 3000, 3001 and incoming origins
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// Request logger for local dev visibility
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "test") {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  }
  next();
});

// Seed Initial Admin User if none exists
const seedInitialAdmin = async () => {
  try {
    const adminExists = db.prepare("SELECT id FROM users WHERE is_admin = 1 OR role = 'admin' LIMIT 1").get();
    if (!adminExists) {
      const adminEmail = String(process.env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();
      const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
      if (!adminEmail || !adminPassword || adminPassword.length < 12) {
        throw new Error(
          "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (minimum 12 characters) are required to seed the first admin."
        );
      }
      const passwordHash = await hashPassword(adminPassword);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO users (
          id, email, password_hash, full_name, role, is_admin, email_verified,
          institute, created_at, updated_at
        ) VALUES ('admin_root', ?, ?, 'FEP Administrator', 'admin', 1, 1, 'IIT Kanpur', ?, ?)
      `).run(adminEmail, passwordHash, now, now);

      console.log(`[SEED] Created initial admin account: ${adminEmail}`);
    }
  } catch (err) {
    console.error("[SEED] Admin initialization failed:", err.message);
    process.exitCode = 1;
    throw err;
  }
};

// Route Mounts
app.use("/api/auth", authRoutes);
app.use("/api", authRoutes); // Aliases for backwards compatibility with functions/index.js routes
app.use("/api/projects", projectRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api", uploadRoutes); // For /api/files/:type/:filename
app.use("/api", adminRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: "sqlite",
    time: new Date().toISOString(),
  });
});

// Serve frontend static build if running in production mode
const buildPath = path.join(__dirname, "..", "build");
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get("*", (req, res, next) => {
    if (req.url.startsWith("/api/")) return next();
    res.sendFile(path.join(buildPath, "index.html"));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

seedInitialAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  FEP IITK Server running on http://localhost:${PORT}`);
    console.log(`  Database: SQLite (server/data/fep.db)`);
    console.log(`  Uploads: server/uploads/`);
    console.log(`=======================================================`);
  });
});

module.exports = app;
