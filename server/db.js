const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "fep.db");
const db = new DatabaseSync(DB_PATH);

// Enable Foreign Key constraints and WAL mode
db.exec("PRAGMA foreign_keys = ON;");
try {
  db.exec("PRAGMA journal_mode = WAL;");
} catch (e) {
  // Ignore if WAL isn't supported in environment
}

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'professor', 'admin')),
    is_admin INTEGER DEFAULT 0,
    email_verified INTEGER DEFAULT 0,
    institute TEXT,
    roll TEXT,
    programme TEXT,
    department1 TEXT,
    department2 TEXT,
    interest TEXT,
    phone TEXT,
    designation TEXT,
    bio TEXT,
    website TEXT,
    resumes TEXT DEFAULT '[]',
    documents TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    department TEXT,
    departments TEXT DEFAULT '[]',
    stipend TEXT,
    duration TEXT,
    deadline TEXT,
    requirements TEXT,
    qualifications TEXT,
    location TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed')),
    publishing_status TEXT DEFAULT 'pending' CHECK(publishing_status IN ('pending', 'approved', 'rejected')),
    created_by TEXT NOT NULL,
    created_by_name TEXT,
    created_by_email TEXT,
    created_by_institute TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
  CREATE INDEX IF NOT EXISTS idx_projects_pub_status ON projects(publishing_status);

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    project_title TEXT,
    student_id TEXT NOT NULL,
    student_name TEXT,
    student_email TEXT,
    cpi TEXT,
    experience TEXT,
    cover_note TEXT,
    resume_url TEXT,
    documents TEXT DEFAULT '[]',
    professor_id TEXT NOT NULL,
    professor_name TEXT,
    professor_email TEXT,
    status TEXT DEFAULT 'applied' CHECK(status IN ('applied', 'pending', 'shortlisted', 'selected', 'rejected')),
    admin_approval_status TEXT DEFAULT 'pending' CHECK(admin_approval_status IN ('pending', 'approved', 'rejected')),
    notification_email_sent INTEGER DEFAULT 0,
    notification_email_sent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (professor_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_apps_project ON applications(project_id);
  CREATE INDEX IF NOT EXISTS idx_apps_student ON applications(student_id);
  CREATE INDEX IF NOT EXISTS idx_apps_professor ON applications(professor_id);
  CREATE INDEX IF NOT EXISTS idx_apps_admin_approval ON applications(admin_approval_status);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_app ON messages(application_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

  CREATE TABLE IF NOT EXISTS project_announcements (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT,
    message TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_announcements_proj ON project_announcements(project_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

  CREATE TABLE IF NOT EXISTS otps (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    resend_allowed_at INTEGER NOT NULL,
    attempts INTEGER DEFAULT 0,
    data TEXT,
    created_at TEXT NOT NULL
  );
`);

// Helper to format SQLite row into frontend-compatible user object
function formatUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.id,
    email: row.email,
    fullName: row.full_name,
    displayName: row.full_name,
    role: row.role,
    isAdmin: Boolean(row.is_admin),
    emailVerified: Boolean(row.email_verified),
    institute: row.institute || null,
    roll: row.roll || null,
    programme: row.programme || null,
    department1: row.department1 || null,
    department2: row.department2 || null,
    interest: row.interest || null,
    phone: row.phone || null,
    designation: row.designation || null,
    bio: row.bio || null,
    website: row.website || null,
    resumes: row.resumes ? JSON.parse(row.resumes) : [],
    documents: row.documents ? JSON.parse(row.documents) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to format SQLite row into frontend-compatible project object
function formatProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    department: row.department || "",
    departments: row.departments ? JSON.parse(row.departments) : [],
    stipend: row.stipend || "",
    duration: row.duration || "",
    deadline: row.deadline || "",
    requirements: row.requirements || "",
    qualifications: row.qualifications || "",
    location: row.location || "",
    status: row.status,
    publishingStatus: row.publishing_status,
    createdBy: row.created_by,
    createdByName: row.created_by_name || "",
    createdByEmail: row.created_by_email || "",
    createdByInstitute: row.created_by_institute || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to format SQLite row into frontend-compatible application object
function formatApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    projectTitle: row.project_title || "",
    studentId: row.student_id,
    studentName: row.student_name || "",
    studentEmail: row.student_email || "",
    cpi: row.cpi || "",
    experience: row.experience || "",
    coverNote: row.cover_note || "",
    resumeUrl: row.resume_url || null,
    documents: row.documents ? JSON.parse(row.documents) : [],
    professorId: row.professor_id,
    professorName: row.professor_name || "",
    professorEmail: row.professor_email || "",
    status: row.status,
    adminApprovalStatus: row.admin_approval_status,
    notificationEmailSent: Boolean(row.notification_email_sent),
    notificationEmailSentAt: row.notification_email_sent_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  db,
  formatUser,
  formatProject,
  formatApplication,
};
