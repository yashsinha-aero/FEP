/**
 * Data Import Utility for FEP IITK
 * 
 * Imports Firebase-exported data into the local SQLite database.
 * 
 * Usage:
 *   node server/scripts/import_data.js
 * 
 * Expected files in /imported/:
 *   - accounts.json    — Firebase Auth export: { "users": [ { "localId", "email", "passwordHash", "salt", ... } ] }
 *   - users_cleaned.json — Firestore users export: [ { "Document ID", "email", "fullName", "role", ... } ]
 *   - projects.json — Firestore projects export: [ { "Document ID", "title", "createdBy", ... } ]
 * 
 * Firebase SCRYPT hashes are preserved in a tagged format and verified by the
 * server using the project's Firebase password hash parameters.
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { db } = require("../db");
const { encodeFirebaseScryptHash } = require("../firebaseScrypt");

const IMPORTED_DIR = path.join(__dirname, "..", "..", "imported");
const ACCOUNTS_FILE = path.join(IMPORTED_DIR, "accounts.json");
const USERS_FILE = path.join(IMPORTED_DIR, "users_cleaned.json");
const PROJECTS_FILE = path.join(IMPORTED_DIR, "projects.json");

const run = async () => {
  console.log("=== FEP IITK Data Import ===\n");

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Load source files
  // ──────────────────────────────────────────────────────────────────────────
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error("Missing:", ACCOUNTS_FILE);
    process.exit(1);
  }
  const accountsRaw = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
  const firebaseAuthUsers = accountsRaw.users || [];
  const firestoreUsers = fs.existsSync(USERS_FILE)
    ? JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"))
    : [];
  const firestoreProjects = fs.existsSync(PROJECTS_FILE)
    ? JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf-8"))
    : [];

  console.log(`Found ${firebaseAuthUsers.length} auth accounts in accounts.json`);
  console.log(`Found ${firestoreUsers.length} user profiles in users_cleaned.json`);
  console.log(`Found ${firestoreProjects.length} projects in projects.json\n`);

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Build a lookup map: email -> auth record (for localId matching)
  // ──────────────────────────────────────────────────────────────────────────
  const authByEmail = {};
  const authById = {};
  for (const auth of firebaseAuthUsers) {
    const email = (auth.email || "").trim().toLowerCase();
    if (email) authByEmail[email] = auth;
    if (auth.localId) authById[auth.localId] = auth;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Insert users into SQLite
  // ──────────────────────────────────────────────────────────────────────────
  const insertUser = db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, role, is_admin, email_verified,
      institute, roll, programme, department1, department2, interest, phone,
      designation, bio, website, resumes, documents, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  // Also handle duplicate emails: skip if already inserted by a prior row
  const checkEmail = db.prepare("SELECT id FROM users WHERE email = ?");
  const updateImportedPassword = db.prepare(`
    UPDATE users
    SET password_hash = ?, email_verified = ?, updated_at = ?
    WHERE email = ?
  `);

  let importedCount = 0;
  let updatedPasswordCount = 0;
  const profileEmails = new Set();
  let skippedCount = 0;
  let errors = [];

  // Parse the human-readable Firestore date format: "21 August 2026 at 13:32:19 UTC+5:30"
  const parseFirestoreDate = (dateStr) => {
    if (!dateStr) return new Date().toISOString();
    try {
      // Remove " at " and " UTC" portions for standard parsing
      const cleaned = dateStr
        .replace(" at ", " ")
        .replace(" UTC", " GMT");
      const d = new Date(cleaned);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } catch {
      return new Date().toISOString();
    }
  };

  for (const profile of firestoreUsers) {
    const docId = profile["Document ID"];
    const email = (profile.email || "").trim().toLowerCase();

    if (!email) {
      skippedCount++;
      continue;
    }

    // The Firebase localId / Document ID is used as the user's id
    const userId = docId || "u_" + email.replace(/[^a-z0-9]/g, "_");
    const role = profile.role || "student";
    const isAdmin = role === "admin" ? 1 : 0;
    const emailVerified = profile.emailVerified !== false ? 1 : 0;

    const createdAt = parseFirestoreDate(profile.createdAt);
    const updatedAt = profile.updatedAt ? parseFirestoreDate(profile.updatedAt) : createdAt;
    const authRecord = authById[docId] || authByEmail[email];
    if (!authRecord || !authRecord.passwordHash || !authRecord.salt) {
      errors.push({ email, error: "Missing Firebase password hash or salt." });
      continue;
    }
    const passwordHash = encodeFirebaseScryptHash(authRecord.passwordHash, authRecord.salt);
    const existingUser = checkEmail.get(email);
    if (existingUser) {
      updateImportedPassword.run(
        passwordHash,
        authRecord.emailVerified ? 1 : 0,
        new Date().toISOString(),
        email
      );
      updatedPasswordCount++;
      skippedCount++;
      profileEmails.add(email);
      continue;
    }

    try {
      insertUser.run(
        userId,
        email,
        passwordHash,
        profile.fullName || "User",
        role,
        isAdmin,
        emailVerified,
        profile.institute || null,
        profile.roll || null,
        profile.programme || null,
        profile.department1 || null,
        profile.department2 || null,
        profile.interest || null,
        profile.phone || null,
        null, // designation
        null, // bio
        null, // website
        JSON.stringify(profile.resumes || []),
        JSON.stringify(profile.documents || []),
        createdAt,
        updatedAt
      );
      importedCount++;
      profileEmails.add(email);
    } catch (err) {
      errors.push({ email, error: err.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Import auth-only accounts (users in accounts.json but NOT in Firestore)
  // ──────────────────────────────────────────────────────────────────────────
  let authOnlyCount = 0;
  for (const auth of firebaseAuthUsers) {
    const email = (auth.email || "").trim().toLowerCase();
    if (!email) continue;
    if (profileEmails.has(email)) continue;

    if (!auth.passwordHash || !auth.salt) {
      errors.push({ email, error: "Missing Firebase password hash or salt." });
      continue;
    }
    const passwordHash = encodeFirebaseScryptHash(auth.passwordHash, auth.salt);
    if (checkEmail.get(email)) {
      updateImportedPassword.run(
        passwordHash,
        auth.emailVerified ? 1 : 0,
        new Date().toISOString(),
        email
      );
      updatedPasswordCount++;
      continue;
    }

    const userId = auth.localId || "u_" + email.replace(/[^a-z0-9]/g, "_");

    try {
      insertUser.run(
        userId,
        email,
        passwordHash,
        "User",        // No profile name available
        "student",     // Default role
        0,             // Not admin
        auth.emailVerified ? 1 : 0,
        null, null, null, null, null, null, null,
        null, null, null,
        "[]", "[]",
        new Date(parseInt(auth.createdAt)).toISOString(),
        new Date(parseInt(auth.lastSignedInAt || auth.createdAt)).toISOString()
      );
      authOnlyCount++;
    } catch (err) {
      // Likely duplicate, ignore
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Import projects after users so created_by foreign keys are valid
  // ──────────────────────────────────────────────────────────────────────────
  const insertProject = db.prepare(`
    INSERT INTO projects (
      id, title, description, department, departments, stipend, duration,
      deadline, requirements, qualifications, location, status,
      publishing_status, created_by, created_by_name, created_by_email,
      created_by_institute, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      department = excluded.department,
      departments = excluded.departments,
      stipend = excluded.stipend,
      duration = excluded.duration,
      deadline = excluded.deadline,
      requirements = excluded.requirements,
      qualifications = excluded.qualifications,
      location = excluded.location,
      status = excluded.status,
      publishing_status = excluded.publishing_status,
      created_by = excluded.created_by,
      created_by_name = excluded.created_by_name,
      created_by_email = excluded.created_by_email,
      created_by_institute = excluded.created_by_institute,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const findUser = db.prepare("SELECT id, email, full_name, institute FROM users WHERE id = ?");
  let importedProjectCount = 0;
  let updatedProjectCount = 0;
  let skippedProjectCount = 0;

  const asArray = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return value ? [String(value)] : [];
  };
  const asText = (value) => (value === null || value === undefined ? "" : String(value).trim());
  const formatDetails = (label, values) => {
    const items = asArray(values);
    return items.length ? `${label}: ${items.join(", ")}` : "";
  };

  for (const project of firestoreProjects) {
    const projectId = asText(project["Document ID"]);
    const title = asText(project.title);
    const creatorId = asText(project.createdBy);
    const creator = creatorId ? findUser.get(creatorId) : null;

    if (!projectId || !title || !creator) {
      skippedProjectCount++;
      console.error(
        `[PROJECT IMPORT] Skipping invalid project ${projectId || "(missing id)"}: ` +
        `${!projectId ? "missing Document ID" : !title ? "missing title" : `creator ${creatorId} not found`}`
      );
      continue;
    }

    const departments = asArray(project.departments);
    const requirements = [
      asText(project.requirements),
      formatDetails("Prior experience", project.priorExperience),
      formatDetails("Eligible years", project.eligibleYears),
      formatDetails("Required documents", project.requiredDocuments),
      formatDetails("Time commitment", project.timeCommitment),
      project.openings !== null && project.openings !== undefined
        ? `Openings: ${project.openings}`
        : "",
      project.openToAll !== null && project.openToAll !== undefined
        ? `Open to all: ${project.openToAll ? "Yes" : "No"}`
        : "",
      formatDetails("Optional tags", project.optionalTags),
      project.stipendMin !== null || project.stipendMax !== null
        ? `Stipend range: ${project.stipendMin ?? ""} - ${project.stipendMax ?? ""}`
        : "",
      formatDetails("Expense support", project.expenseSupport),
      formatDetails("Other expense support", project.expenseSupportOther),
    ].filter(Boolean).join("\n");
    const qualifications = [
      project.cpiRequirement !== null && project.cpiRequirement !== undefined
        ? `CPI requirement: ${project.cpiRequirement}`
        : "",
      formatDetails("Eligible years", project.eligibleYears),
    ].filter(Boolean).join("\n");
    const createdAt = parseFirestoreDate(project.createdAt);
    const existing = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);

    insertProject.run(
      projectId,
      title,
      asText(project.description),
      departments.join(", "),
      JSON.stringify(departments),
      asText(project.compensation) || asText(project.stipendType),
      asText(project.timeline),
      asText(project.deadline) || null,
      requirements,
      qualifications,
      asText(project.location),
      project.status === "closed" ? "closed" : "open",
      ["pending", "approved", "rejected"].includes(project.publishingStatus)
        ? project.publishingStatus
        : "pending",
      creator.id,
      asText(project.createdByName) || creator.full_name,
      creator.email,
      asText(project.createdByInstitute) || creator.institute || "",
      createdAt,
      createdAt
    );
    if (existing) updatedProjectCount++;
    else importedProjectCount++;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log("=== Import Complete ===");
  console.log(`  Profile users imported: ${importedCount}`);
  console.log(`  Auth-only users imported: ${authOnlyCount}`);
  console.log(`  Existing passwords updated: ${updatedPasswordCount}`);
  console.log(`  Projects imported: ${importedProjectCount}`);
  console.log(`  Existing projects updated: ${updatedProjectCount}`);
  console.log(`  Projects skipped: ${skippedProjectCount}`);
  console.log(`  Skipped (dupes/empty): ${skippedCount}`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
    errors.forEach((e) => console.log(`    - ${e.email}: ${e.error}`));
  }

  const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get();
  console.log(`\nTotal users now in database: ${totalUsers.count}`);
  console.log("\nImported Firebase password hashes are preserved and verified with Firebase SCRYPT.\n");
};

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
