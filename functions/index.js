const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "fep-iitk",
    storageBucket: "fep-iitk.firebasestorage.app",
  });
} else {
  admin.initializeApp({
    projectId: "fep-iitk",
    storageBucket: "fep-iitk.firebasestorage.app",
  });
}

// Auto-load functions/.env if present
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

const app = express();
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  })
);
app.use(express.json());


const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SENDER_EMAIL = process.env.SENDER_EMAIL;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  pool: false,
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 45000,
});

// Secret used to authenticate the GitHub Actions digest cron call.
const DIGEST_SECRET = process.env.DIGEST_SECRET;

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const verifyAuthToken = async (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1]) {
    console.warn("verifyAuthToken: No valid Bearer authorization header found. Received:", authHeader ? "[present]" : "[empty]");
    throw new Error("Missing or invalid authorization token");
  }

  const token = match[1].trim();
  return admin.auth().verifyIdToken(token);
};

const commitBatch = async (batchState) => {
  if (batchState.count === 0) return;

  await batchState.batch.commit();
  batchState.batch = db.batch();
  batchState.count = 0;
};

const queueDelete = async (batchState, ref) => {
  batchState.batch.delete(ref);
  batchState.count += 1;

  if (batchState.count >= 450) {
    await commitBatch(batchState);
  }
};

const deleteMessagesForApplication = async (applicationRef, batchState) => {
  const messagesSnapshot = await applicationRef.collection("messages").get();

  for (const messageDoc of messagesSnapshot.docs) {
    await queueDelete(batchState, messageDoc.ref);
  }
};

const deleteStorageFileFromUrl = async (fileUrl) => {
  if (!fileUrl) return;

  try {
    const parsedUrl = new URL(fileUrl);
    const match = parsedUrl.pathname.match(/\/o\/([^?]+)/);
    if (!match) return;

    const filePath = decodeURIComponent(match[1]);
    await bucket.file(filePath).delete({ ignoreNotFound: true });
  } catch (error) {
    console.error("Failed to delete storage file:", error.message);
  }
};

const collectSnapshotDocs = async (querySnapshot, docsByPath) => {
  querySnapshot.docs.forEach((docSnap) => {
    docsByPath.set(docSnap.ref.path, docSnap);
  });
};

const hashCode = (code) => crypto.createHash("sha256").update(code).digest("hex");
const STUDENT_EMAIL_DOMAIN = "iitk.ac.in";
const MBA_DEPARTMENT = "MBA";
const STUDENT_DEPARTMENTS = new Set([
  "Aerospace Engineering",
  "Biological Sciences and Bioengineering",
  "Biological Sciences & Bioengineering",
  "Biosciences and Bioengineering",
  "Chemical Engineering",
  "Chemistry",
  "Civil Engineering",
  "Cognitive Science",
  "Computer Science and Engineering",
  "Design",
  "Earth Sciences",
  "Economics",
  "Economic Sciences",
  "Electrical Engineering",
  "Humanities and Social Sciences",
  "Humanities & Social Sciences",
  "Industrial Management and Engineering",
  "Industrial & Management Engineering",
  "Intelligent Systems",
  "Materials Science & Engineering",
  "Mathematics and Statistics",
  "Mathematics & Statistics",
  "Mechanical Engineering",
  "Physics",
  "Space, Planetary & Astronomical Sciences & Engineering",
  "Statistics and Data Sciences",
  "Sustainable Energy Engineering",
]);

const getEmailDomain = (email = "") => {
  const normalizedEmail = String(email).trim().toLowerCase();
  const parts = normalizedEmail.split("@");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return "";
  }

  return parts[1];
};

const validateSignupEmail = (email, role) => {
  const normalizedEmail = String(email).trim().toLowerCase();

  // Backdoor check for test accounts
  const isBackdoorEmail = (() => {
    const parts = normalizedEmail.split("@");
    if (parts.length !== 2) return false;
    const localPart = parts[0].split("+")[0];
    const domainPart = parts[1];
    return localPart === "yash.sinha2006" && domainPart === "gmail.com";
  })();

  if (isBackdoorEmail) {
    return null; // Bypass verification for testing
  }

  const domain = getEmailDomain(email);

  if (!["student", "professor"].includes(role)) {
    return "Please select a valid role.";
  }

  if (role === "student") {
    return domain === STUDENT_EMAIL_DOMAIN
      ? null
      : "Students must sign up only with an @iitk.ac.in email address.";
  }

  if (role === "professor") {
    const ALLOWED_INSTITUTE_DOMAIN_LABELS = [
      "edu",
      "ac",
      "int",
      "dk",
      "de",
      "ch",
      "se",
      "no",
      "fi",
      "nl",
      "be",
      "fr",
      "ca",
      "it",
      "es",
      "at",
    ];
    const parts = domain.split(".");
    const isEducational = parts.some((part) =>
      ALLOWED_INSTITUTE_DOMAIN_LABELS.includes(part)
    );
    return isEducational
      ? null
      : "Professors can sign up only with an institutional email (e.g. .edu, .ac, .dk).";
  }

  return domain
    ? null
    : "Please sign up with a valid email address.";
};

const normalizeStudentDepartments = (programme, department1, department2) => {
  const normalizedDepartment1 = String(department1 || "").trim();
  const normalizedDepartment2 = String(department2 || "").trim();

  if (programme === "MBA") {
    return {
      department1: MBA_DEPARTMENT,
      department2: normalizedDepartment2,
      error: normalizedDepartment2 && !STUDENT_DEPARTMENTS.has(normalizedDepartment2)
        ? "Please select a valid Department 2."
        : null,
    };
  }

  if (!STUDENT_DEPARTMENTS.has(normalizedDepartment1)) {
    return {
      department1: normalizedDepartment1,
      department2: normalizedDepartment2,
      error: "Please select a valid Department 1.",
    };
  }

  if (!normalizedDepartment2) {
    return {
      department1: normalizedDepartment1,
      department2: null,
      error: null,
    };
  }

  const isValidDepartment2 =
    STUDENT_DEPARTMENTS.has(normalizedDepartment2) ||
    (programme === "Dual Degree" && normalizedDepartment2 === MBA_DEPARTMENT);

  return {
    department1: normalizedDepartment1,
    department2: normalizedDepartment2,
    error: isValidDepartment2 ? null : "Please select a valid Department 2.",
  };
};

app.post("/signup", async (req, res) => {
  try {
    const {
      email,
      role,
      programme,
      department1,
      department2,
    } = req.body;

    const normalizedEmail = String(email || "").trim().toLowerCase();

    const emailError = validateSignupEmail(normalizedEmail, role);

    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const studentDepartments =
      role === "student"
        ? normalizeStudentDepartments(programme, department1, department2)
        : null;

    if (studentDepartments?.error) {
      return res.status(400).json({ error: studentDepartments.error });
    }

    // Check if the user already exists in Auth
    try {
      const existingUser = await admin.auth().getUserByEmail(normalizedEmail);
      if (existingUser.emailVerified) {
        return res.status(400).json({ error: "The email address is already in use by another account." });
      }

      // Cleanup legacy unverified account in Auth & Firestore
      await admin.auth().deleteUser(existingUser.uid);
      await db.collection("users").doc(existingUser.uid).delete();
    } catch (authError) {
      if (authError.code !== "auth/user-not-found") {
        return res.status(400).json({ error: authError.message });
      }
    }

    const otp = generateOtp();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    await db
      .collection("emailOtps")
      .doc(normalizedEmail)
      .set({
        otpHash,
        expiresAt: Date.now() + 10 * 60 * 1000,
        resendAllowedAt: Date.now() + 60 * 1000,
      });

    // Send Email with Elevated UI
    await transporter.sendMail({
      from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
      to: normalizedEmail,
      subject: "Email Verification OTP",
      text: `Your OTP is ${otp}. It expires in 10 minutes.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verification OTP</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px 16px; margin: 0; background-color: #f4f6fa; -webkit-font-smoothing: antialiased;">
          <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #0f294a; padding: 20px 24px;">
              <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">
                Foreign Exposure Programme
              </h2>
            </div>
            <div style="padding: 24px; color: #1e293b;">
              <p style="font-size: 16px; margin: 0 0 12px 0; font-weight: 500;">Welcome!</p>
              <p style="font-size: 14.5px; margin: 0 0 24px 0; color: #475569; line-height: 1.5;">Thank you for registering with the Foreign Exposure Programme. Please use the verification code below to confirm your email address and complete your signup:</p>
              <div style="text-align: center; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: 700; color: #0f294a; letter-spacing: 6px; display: block; margin-left: 6px;">${otp}</span>
              </div>
              <p style="margin: 0 0 24px 0; font-size: 13.5px; color: #64748b; font-style: italic;">
                This code is securely tracked and will expire in exactly 10 minutes.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
                <strong>Contact Us:</strong> For any queries, contact <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${SENDER_EMAIL}</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    res.json({ status: "otp_sent" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/verify-otp", async (req, res) => {
  const { email, otp, signupData } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const otpRef = db.collection("emailOtps").doc(normalizedEmail);
  const doc = await otpRef.get();

  if (!doc.exists) {
    return res.status(400).json({ error: "No OTP found" });
  }

  const data = doc.data();

  if (Date.now() > data.expiresAt) {
    return res.status(400).json({ error: "OTP expired" });
  }

  if (data.attempts >= 5) {
    return res.status(400).json({ error: "Too many attempts" });
  }

  const hash = crypto.createHash("sha256").update(otp).digest("hex");

  if (hash !== data.otpHash) {
    await otpRef.update({
      attempts: (data.attempts || 0) + 1,
    });
    return res.status(400).json({ error: "Invalid OTP" });
  }

  if (!signupData) {
    return res.status(400).json({ error: "Signup details missing. Please register again." });
  }

  try {
    // 1. Create the user in Firebase Auth with emailVerified: true
    const user = await admin.auth().createUser({
      email: normalizedEmail,
      password: signupData.password,
      emailVerified: true,
    });

    const studentDepartments =
      signupData.role === "student"
        ? normalizeStudentDepartments(signupData.programme, signupData.department1, signupData.department2)
        : null;

    // 2. Set user details in Firestore 'users' collection
    await db
      .collection("users")
      .doc(user.uid)
      .set({
        fullName: signupData.fullName,
        email: normalizedEmail,
        role: signupData.role,
        institute: signupData.institute || null,
        roll: signupData.roll || null,
        programme: signupData.programme || null,
        department1: studentDepartments?.department1 || signupData.department1 || null,
        department2: studentDepartments ? studentDepartments.department2 : (signupData.department2 || null),
        interest: signupData.interest || null,
        phone: signupData.phone || null,
        emailVerified: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // 3. Cleanup OTP collection
    await otpRef.delete();

    return res.json({ status: "verified" });
  } catch (createError) {
    console.error("Account creation failed during OTP verification:", createError);
    return res.status(400).json({ error: "Failed to create account: " + createError.message });
  }
});

app.post("/login-check-email", async (req, res) => {
  const { email } = req.body;

  const normalizedEmail = String(email || "").trim().toLowerCase();

  try {
    const user = await admin.auth().getUserByEmail(normalizedEmail);

    if (!user.emailVerified) {
      return res.json({ status: "unverified" });
    }

    return res.json({ status: "verified" });
  } catch {
    return res.json({ status: "not_found" });
  }
});

app.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const otpRef = db.collection("emailOtps").doc(email);
    const otpDoc = await otpRef.get();

    if (!otpDoc.exists) {
      return res.status(400).json({ error: "No OTP request found" });
    }

    const data = otpDoc.data();

    if (Date.now() < data.resendAllowedAt) {
      return res.status(429).json({
        error: "Please wait before resending OTP",
      });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(newOtp).digest("hex");

    await otpRef.set({
      otpHash,
      expiresAt: Date.now() + 10 * 60 * 1000,
      resendAllowedAt: Date.now() + 60 * 1000,
      attempts: 0,
    });

    // Send Email with Elevated UI
    await transporter.sendMail({
      from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
      to: email,
      subject: "New OTP | Email Verification",
      text: `Your new OTP is ${newOtp}. It expires in 10 minutes.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New OTP Verification</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px 16px; margin: 0; background-color: #f4f6fa; -webkit-font-smoothing: antialiased;">
          <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #0f294a; padding: 20px 24px;">
              <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">
                Foreign Exposure Programme
              </h2>
            </div>
            <div style="padding: 24px; color: #1e293b;">
              <p style="font-size: 16px; margin: 0 0 12px 0; font-weight: 500;">Hello,</p>
              <p style="font-size: 14.5px; margin: 0 0 24px 0; color: #475569; line-height: 1.5;">As requested, here is your new verification token. Use this code to authenticate and verify your institutional email address profile:</p>
              <div style="text-align: center; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: 700; color: #0f294a; letter-spacing: 6px; display: block; margin-left: 6px;">${newOtp}</span>
              </div>
              <p style="margin: 0 0 24px 0; font-size: 13.5px; color: #64748b; font-style: italic;">
                This new code resets your verification timeline and is valid for 10 minutes.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
                <strong>Contact Us:</strong> For any queries, contact <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${SENDER_EMAIL}</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    return res.json({ status: "resent" });
  } catch (err) {
    return res.status(400).json({ error: "Failed to resend OTP" });
  }
});

app.post("/notify-application", async (req, res) => {
  try {
    const decodedToken = await verifyAuthToken(req);
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: "Application ID is required" });
    }

    const applicationRef = db.collection("applications").doc(applicationId);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return res.status(404).json({ error: "Application not found" });
    }

    const application = applicationDoc.data();

    if (application.studentId !== decodedToken.uid) {
      return res.status(403).json({ error: "Not allowed to notify this application" });
    }

    await applicationRef.update({
      notificationEmailSent: false,
      notificationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ status: "queued" });
  } catch (error) {
    console.error("Application notification registration failed:", error);
    return res.status(400).json({
      error: error.message || "Failed to register notification",
    });
  }
});

// 🛠️ RESTORED ENDPOINT: Generates code and triggers secure styled UI email
app.post("/request-delete-code", async (req, res) => {
  try {
    const decodedToken = await verifyAuthToken(req);
    const uid = decodedToken.uid;
    const userRecord = await admin.auth().getUser(uid);
    const email = userRecord.email;

    if (!email) {
      return res.status(400).json({ error: "No email found for this account" });
    }

    const codeRef = db.collection("accountDeletionCodes").doc(uid);
    const codeDoc = await codeRef.get();
    const existingCode = codeDoc.exists ? codeDoc.data() : null;

    if (existingCode?.resendAllowedAt && Date.now() < existingCode.resendAllowedAt) {
      return res.status(429).json({
        error: "Please wait before requesting another deletion code",
      });
    }

    const code = generateOtp();

    await codeRef.set({
      codeHash: hashCode(code),
      email,
      expiresAt: Date.now() + 10 * 60 * 1000,
      resendAllowedAt: Date.now() + 60 * 1000,
      attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send Email with Elevated UI
    await transporter.sendMail({
      from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
      to: email,
      subject: "Account Deletion Code | FEP IITK",
      text: `Your account deletion code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Account Deletion Request</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px 16px; margin: 0; background-color: #f4f6fa; -webkit-font-smoothing: antialiased;">
          <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #0f294a; padding: 20px 24px;">
              <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">
                Foreign Exposure Programme
              </h2>
            </div>
            <div style="padding: 24px; color: #1e293b;">
              <p style="font-size: 16px; margin: 0 0 12px 0; font-weight: 500; color: #ef4444;">Security Alert: Account Deletion Request</p>
              <p style="font-size: 14.5px; margin: 0 0 24px 0; color: #475569; line-height: 1.5;">We received a request to permanently delete your Foreign Exposure Programme account. To confirm this security operation and clear your profile data, enter the authorization code below:</p>
              <div style="text-align: center; background-color: #fff5f5; border: 1px solid #fee2e2; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: 700; color: #dc2626; letter-spacing: 6px; display: block; margin-left: 6px;">${code}</span>
              </div>
              <p style="margin: 0 0 24px 0; font-size: 13.5px; color: #64748b; line-height: 1.4; font-style: italic;">
                <strong>Note:</strong> This code expires in 10 minutes. If you did not request this deletion, you can safely ignore this message—your account remains secure and unchanged.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
                <strong>Contact Us:</strong> For any queries, contact <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${SENDER_EMAIL}</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    return res.json({ status: "sent" });
  } catch (error) {
    console.error("Delete code request failed:", error);
    return res.status(400).json({
      error: error.message || "Failed to send deletion code",
    });
  }
});

app.post("/delete-account", async (req, res) => {
  try {
    const decodedToken = await verifyAuthToken(req);
    const uid = decodedToken.uid;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Deletion code is required" });
    }

    const codeRef = db.collection("accountDeletionCodes").doc(uid);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) {
      return res.status(400).json({ error: "Please request a deletion code first" });
    }

    const codeData = codeDoc.data();

    if (Date.now() > codeData.expiresAt) {
      await codeRef.delete();
      return res.status(400).json({ error: "Deletion code expired" });
    }

    if ((codeData.attempts || 0) >= 5) {
      return res.status(400).json({ error: "Too many deletion code attempts" });
    }

    if (hashCode(code) !== codeData.codeHash) {
      await codeRef.update({
        attempts: (codeData.attempts || 0) + 1,
      });
      return res.status(400).json({ error: "Invalid deletion code" });
    }

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const projectDocsByPath = new Map();
    const applicationDocsByPath = new Map();

    await collectSnapshotDocs(
      await db.collection("projects").where("createdBy", "==", uid).get(),
      projectDocsByPath
    );

    await collectSnapshotDocs(
      await db.collection("applications").where("studentId", "==", uid).get(),
      applicationDocsByPath
    );

    await collectSnapshotDocs(
      await db.collection("applications").where("professorId", "==", uid).get(),
      applicationDocsByPath
    );

    const projectIds = new Set(
      Array.from(projectDocsByPath.values()).map((projectDoc) => projectDoc.id)
    );

    const allApplicationsSnapshot = await db.collection("applications").get();
    allApplicationsSnapshot.docs.forEach((applicationDoc) => {
      if (projectIds.has(applicationDoc.data().projectId)) {
        applicationDocsByPath.set(applicationDoc.ref.path, applicationDoc);
      }
    });

    const batchState = {
      batch: db.batch(),
      count: 0,
    };

    for (const applicationDoc of applicationDocsByPath.values()) {
      await deleteMessagesForApplication(applicationDoc.ref, batchState);
      await deleteStorageFileFromUrl(applicationDoc.data().resumeUrl);
      const attachedDocs = applicationDoc.data().documents || [];
      for (const d of attachedDocs) {
        if (d?.url) await deleteStorageFileFromUrl(d.url);
      }
      await queueDelete(batchState, applicationDoc.ref);
    }

    for (const projectDoc of projectDocsByPath.values()) {
      await queueDelete(batchState, projectDoc.ref);
    }

    if (userData.email) {
      await queueDelete(batchState, db.collection("emailOtps").doc(userData.email));
    }

    await queueDelete(batchState, codeRef);
    await queueDelete(batchState, userRef);
    await commitBatch(batchState);

    try {
      await bucket.deleteFiles({
        prefix: `resumes/${uid}/`,
        force: true,
      });
    } catch (storageError) {
      console.warn("Storage files deletion failed/skipped:", storageError.message);
    }

    await admin.auth().deleteUser(uid);

    return res.json({
      status: "deleted",
      deletedProjects: projectDocsByPath.size,
      deletedApplications: applicationDocsByPath.size,
    });
  } catch (error) {
    console.error("Delete account failed:", error);
    return res.status(400).json({
      error: error.message || "Failed to delete account",
    });
  }
});

app.post("/trigger-digest", async (req, res) => {
  try {
    const decodedToken = await verifyAuthToken(req);
    const userSnap = await db.collection("users").doc(decodedToken.uid).get();
    const userData = userSnap.data();

    const userRecord = await admin.auth().getUser(decodedToken.uid);
    const isAdmin = userRecord.customClaims?.isAdmin === true || userData?.role === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied. Admin permissions required." });
    }

    const result = await sendProfessorDigestLogic();
    return res.json({ status: "success", result });
  } catch (error) {
    console.error("Manual digest trigger failed:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const normalizedEmail = String(email)
      .trim()
      .toLowerCase();

    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Firebase web API key is not configured." });
    }

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(401).json({
        error: "Invalid admin credentials",
      });
    }

    const uid = data.localId;

    const userRecord = await admin
      .auth()
      .getUser(uid);

    if (userRecord.disabled) {
      return res.status(403).json({
        error: "Account disabled",
      });
    }

    if (!userRecord.emailVerified) {
      return res.status(403).json({
        error: "Email not verified",
      });
    }

    if (
      !userRecord.customClaims ||
      userRecord.customClaims.isAdmin !== true
    ) {
      return res.status(403).json({
        error:
          "Access denied. Admin privileges required.",
      });
    }

    const customToken =
      await admin.auth().createCustomToken(uid);

    return res.json({
      success: true,
      customToken,
    });

  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      error: `Internal server error: ${error.message}`,
    });
  }
});

// ─── Internal: Notify student of application status change ────────────────
// Called directly by the admin panel after a professor status update.
// Protected by Firebase Auth admin token — no IAM policy required.
app.post("/notify-status-change", async (req, res) => {
  try {
    let decodedToken;
    try {
      decodedToken = await verifyAuthToken(req);
    } catch {
      return res.status(401).json({ error: "Unauthorized: invalid or missing token" });
    }

    const { applicationId, newStatus } = req.body;
    if (!applicationId || !newStatus) {
      return res.status(400).json({ error: "applicationId and newStatus are required" });
    }

    const appSnap = await db.collection("applications").doc(applicationId).get();
    if (!appSnap.exists) {
      return res.status(404).json({ error: "Application not found" });
    }

    const appData = appSnap.data();

    // Authorization check: Must be admin OR the professor of this application
    const isCallerAdmin = decodedToken.isAdmin === true;
    const isCallerProfessor = appData.professorId === decodedToken.uid;

    if (!isCallerAdmin && !isCallerProfessor) {
      return res.status(403).json({ error: "Forbidden: You are not authorized to notify for this application" });
    }

    // Only email if the application has already been admin-approved
    if (appData.adminApprovalStatus !== "approved") {
      return res.json({ sent: false, reason: "Application not yet admin-approved — email skipped" });
    }

    const [studentSnap, projectSnap] = await Promise.all([
      db.collection("users").doc(appData.studentId).get(),
      db.collection("projects").doc(appData.projectId).get(),
    ]);

    const student = studentSnap.exists ? studentSnap.data() : {};
    const project = projectSnap.exists ? projectSnap.data() : {};

    const studentEmail = student.email;
    if (!studentEmail) {
      return res.status(404).json({ error: `No email found for student ${appData.studentId}` });
    }

    const studentName = student.fullName || "Student";
    const projectTitle = project.title || "your project";
    const professorName = project.createdByName || "the professor";

    const emailSubject = `[FEP IITK] Application Status Update: ${projectTitle}`;
    const emailHtml = buildStudentStatusUpdateEmailHtml(
      studentName,
      projectTitle,
      newStatus,
      professorName,
      applicationId
    );

    await transporter.sendMail({
      from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
      to: studentEmail,
      subject: emailSubject,
      html: emailHtml,
    });

    console.log(`Status update email sent to ${studentEmail} for "${projectTitle}" (${newStatus}).`);
    return res.json({ sent: true });
  } catch (error) {
    console.error("notify-status-change error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Admin Broadcast Announcement Endpoint ──────────────────────────────────
// Allows System Administrators to broadcast announcements to applicants, professors, or both.
app.post("/broadcast-announcement", async (req, res) => {
  try {
    let decodedToken;
    try {
      decodedToken = await verifyAuthToken(req);
    } catch (authErr) {
      console.error("verifyAuthToken error:", authErr);
      return res.status(401).json({ error: `Unauthorized: ${authErr.message || "invalid or missing token"}` });
    }

    // Strict Admin Authorization check
    let isCallerAdmin = decodedToken.isAdmin === true;
    if (!isCallerAdmin) {
      const userSnap = await db.collection("users").doc(decodedToken.uid).get();
      const userData = userSnap.exists ? userSnap.data() : {};
      if (userData.role === "admin" || userData.isAdmin === true) {
        isCallerAdmin = true;
      }
    }

    if (!isCallerAdmin) {
      return res.status(403).json({ error: "Forbidden: Admin privileges required to broadcast announcements." });
    }

    const {
      targetMode = "project", // "portal_wide" | "project" | "custom_users"
      portalAudience = "all_students", // "all_students" | "all_professors" | "all_users"
      projectId,
      targetAudience = "all",
      recipientUids = [],
      subject,
      message,
    } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: "Announcement subject is required." });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Announcement message body is required." });
    }

    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    let projectTitle = "Foreign Exposure Programme";
    let professorId = null;
    let projectData = null;

    if (projectId) {
      const projectSnap = await db.collection("projects").doc(projectId).get();
      if (projectSnap.exists) {
        projectData = projectSnap.data();
        projectTitle = projectData.title || "Research Project";
        professorId = projectData.createdBy || null;
      }
    }

    // Determine target recipients
    const recipientMap = new Map(); // email -> { uid, name, email, role }

    // ── Mode 1: Portal-Wide Mass Audience ─────────────────────────────────────
    if (targetMode === "portal_wide") {
      let usersQuery = db.collection("users");
      if (portalAudience === "all_students") {
        usersQuery = usersQuery.where("role", "==", "student");
      } else if (portalAudience === "all_professors") {
        usersQuery = usersQuery.where("role", "==", "professor");
      }

      const usersSnap = await usersQuery.get();
      for (const docSnap of usersSnap.docs) {
        const uData = docSnap.data();
        if (uData.email) {
          recipientMap.set(uData.email.toLowerCase(), {
            uid: docSnap.id,
            name: uData.fullName || uData.name || (uData.role === "professor" ? "Professor" : "Student"),
            email: uData.email,
            role: uData.role || "user",
          });
        }
      }
    }
    // ── Mode 2: Specific Custom Selected Users ────────────────────────────────
    else if (targetMode === "custom_users" && Array.isArray(recipientUids) && recipientUids.length > 0) {
      for (const uId of recipientUids) {
        const uSnap = await db.collection("users").doc(uId).get();
        if (uSnap.exists) {
          const uData = uSnap.data();
          if (uData.email) {
            recipientMap.set(uData.email.toLowerCase(), {
              uid: uId,
              name: uData.fullName || uData.name || "Student",
              email: uData.email,
              role: uData.role || "student",
            });
          }
        }
      }
    }
    // ── Mode 3: Project-Specific Selection ────────────────────────────────────
    else {
      // Option A: Include Project Professor
      if (targetAudience === "professor" || targetAudience === "both") {
        if (professorId) {
          const profSnap = await db.collection("users").doc(professorId).get();
          if (profSnap.exists) {
            const profData = profSnap.data();
            if (profData.email) {
              recipientMap.set(profData.email.toLowerCase(), {
                uid: professorId,
                name: profData.fullName || profData.name || "Professor",
                email: profData.email,
                role: "professor",
              });
            }
          }
        }
      }

      // Option B: Include Project Applicants
      if (targetAudience !== "professor") {
        let appsQuery = db.collection("applications");
        if (projectId) {
          appsQuery = appsQuery.where("projectId", "==", projectId);
        }

        if (targetAudience === "applied" || targetAudience === "pending") {
          appsQuery = appsQuery.where("status", "in", ["applied", "pending"]);
        } else if (targetAudience === "shortlisted") {
          appsQuery = appsQuery.where("status", "==", "shortlisted");
        } else if (targetAudience === "selected") {
          appsQuery = appsQuery.where("status", "==", "selected");
        } else if (targetAudience === "rejected") {
          appsQuery = appsQuery.where("status", "==", "rejected");
        }

        const appsSnap = await appsQuery.get();
        const studentIds = [...new Set(appsSnap.docs.map((d) => d.data().studentId).filter(Boolean))];

        for (const sId of studentIds) {
          const sSnap = await db.collection("users").doc(sId).get();
          if (sSnap.exists) {
            const sData = sSnap.data();
            if (sData.email) {
              recipientMap.set(sData.email.toLowerCase(), {
                uid: sId,
                name: sData.fullName || sData.name || "Student",
                email: sData.email,
                role: "student",
              });
            }
          }
        }
      }
    }

    const recipients = Array.from(recipientMap.values());
    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients found for the selected target audience." });
    }

    // Save announcement in top-level announcements and project subcollection if applicable
    const topLevelAnnouncementRef = await db.collection("announcements").add({
      targetMode: targetMode,
      portalAudience: portalAudience || null,
      projectId: projectId || null,
      projectTitle: projectTitle,
      subject: cleanSubject,
      message: cleanMessage,
      targetAudience: targetAudience || null,
      recipientCount: recipients.length,
      senderUid: decodedToken.uid,
      senderRole: "admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (projectId) {
      await db.collection("projects").doc(projectId).collection("announcements").doc(topLevelAnnouncementRef.id).set({
        projectId: projectId,
        projectTitle: projectTitle,
        subject: cleanSubject,
        message: cleanMessage,
        targetAudience: targetAudience,
        recipientCount: recipients.length,
        senderUid: decodedToken.uid,
        senderRole: "admin",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Write in-app notifications to each recipient's feed
    const batch = db.batch();
    for (const r of recipients) {
      const notifRef = db.collection("users").doc(r.uid).collection("notifications").doc();
      batch.set(notifRef, {
        announcementId: topLevelAnnouncementRef.id,
        projectId: projectId || null,
        projectTitle: projectTitle,
        subject: cleanSubject,
        message: cleanMessage,
        senderRole: "admin",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    // Dispatch branded professional emails
    const emailPromises = recipients.map((r) => {
      const emailHtml = buildBroadcastAnnouncementEmailHtml(
        r.name,
        projectTitle,
        cleanSubject,
        cleanMessage
      );

      return transporter.sendMail({
        from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
        to: r.email,
        subject: `[FEP IITK Notice] ${cleanSubject}`,
        html: emailHtml,
      }).catch((mailErr) => {
        console.warn(`Failed to send broadcast email to ${r.email}:`, mailErr);
      });
    });

    await Promise.all(emailPromises);

    console.log(`Admin announcement broadcasted to ${recipients.length} recipients for "${projectTitle}".`);
    return res.json({
      success: true,
      recipientCount: recipients.length,
      announcementId: topLevelAnnouncementRef.id,
    });
  } catch (error) {
    console.error("broadcast-announcement error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Internal: Trigger professor application digest ───────────────────────
// Called by GitHub Actions cron job every 4 days.
// Protected by DIGEST_SECRET environment variable — no IAM policy required.
app.post("/send-professor-digest", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  const provided = match ? match[1].trim() : "";

  if (!DIGEST_SECRET || provided !== DIGEST_SECRET.trim()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await sendProfessorDigestLogic();
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("send-professor-digest error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// The pass reset flow cause firebase auth UI is mid
app.post("/request-reset-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1. Verify user exists in Firebase Auth
    try {
      await admin.auth().getUserByEmail(normalizedEmail);
    } catch (authError) {
      if (authError.code === "auth/user-not-found") {
        return res.status(400).json({ error: "Account with this email does not exist." });
      }
      return res.status(400).json({ error: authError.message });
    }

    // 2. Generate a 6-digit OTP
    const otp = generateOtp();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    // 3. Store OTP in passwordResetOtps
    const otpRef = db.collection("passwordResetOtps").doc(normalizedEmail);

    // Check resend limits if existing
    const existingDoc = await otpRef.get();
    if (existingDoc.exists) {
      const data = existingDoc.data();
      if (Date.now() < data.resendAllowedAt) {
        return res.status(429).json({ error: "Please wait before requesting another code." });
      }
    }

    await otpRef.set({
      otpHash,
      expiresAt: Date.now() + 10 * 60 * 1000,
      resendAllowedAt: Date.now() + 60 * 1000,
      attempts: 0,
    });

    // 4. Send Email with styled template
    await transporter.sendMail({
      from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
      to: normalizedEmail,
      subject: "Password Reset Verification Code | FEP IITK",
      text: `Your password reset code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset OTP</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px 16px; margin: 0; background-color: #f4f6fa; -webkit-font-smoothing: antialiased;">
          <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #0f294a; padding: 20px 24px;">
              <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">
                Foreign Exposure Programme
              </h2>
            </div>
            <div style="padding: 24px; color: #1e293b;">
              <p style="font-size: 16px; margin: 0 0 12px 0; font-weight: 500; color: #0f294a;">Password Reset Request</p>
              <p style="font-size: 14.5px; margin: 0 0 24px 0; color: #475569; line-height: 1.5;">We received a request to reset your FEP Portal account password. Please use the verification code below to authorize this operation and complete your reset:</p>
              <div style="text-align: center; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: 700; color: #0f294a; letter-spacing: 6px; display: block; margin-left: 6px;">${otp}</span>
              </div>
              <p style="margin: 0 0 24px 0; font-size: 13.5px; color: #64748b; line-height: 1.4; font-style: italic;">
                <strong>Note:</strong> This verification code is valid for exactly 10 minutes. If you did not make this request, you can safely ignore this email—your password remains secure.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
                <strong>Contact Us:</strong> For any queries, contact <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${SENDER_EMAIL}</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    return res.json({ status: "otp_sent" });
  } catch (error) {
    console.error("request-reset-otp error:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/verify-reset-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const otpRef = db.collection("passwordResetOtps").doc(normalizedEmail);
    const doc = await otpRef.get();

    if (!doc.exists) {
      return res.status(400).json({ error: "No OTP found. Please request a new one." });
    }

    const data = doc.data();

    if (Date.now() > data.expiresAt) {
      await otpRef.delete();
      return res.status(400).json({ error: "OTP has expired." });
    }

    if (data.attempts >= 5) {
      return res.status(400).json({ error: "Too many failed attempts. Please request a new OTP." });
    }

    const hash = crypto.createHash("sha256").update(otp).digest("hex");

    if (hash !== data.otpHash) {
      await otpRef.update({
        attempts: (data.attempts || 0) + 1,
      });
      return res.status(400).json({ error: "Invalid verification code." });
    }

    // Generate cryptographically secure resetToken
    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Save token in Firestore
    await db.collection("passwordResetTokens").doc(normalizedEmail).set({
      tokenHash,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins validity
    });

    // Cleanup OTP doc
    await otpRef.delete();

    return res.json({ status: "verified", resetToken });
  } catch (error) {
    console.error("verify-reset-otp error:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/execute-reset-password", async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ error: "Email, reset token, and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const tokenRef = db.collection("passwordResetTokens").doc(normalizedEmail);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      return res.status(400).json({ error: "Session expired or invalid. Please request a new OTP." });
    }

    const data = tokenDoc.data();

    if (Date.now() > data.expiresAt) {
      await tokenRef.delete();
      return res.status(400).json({ error: "Session expired. Please request a new OTP." });
    }

    const clientTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    if (clientTokenHash !== data.tokenHash) {
      return res.status(400).json({ error: "Invalid session token. Please request a new OTP." });
    }

    // 1. Get the user from Firebase Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    } catch (authError) {
      return res.status(400).json({ error: "User not found." });
    }

    // 2. Update their password using Admin SDK
    await admin.auth().updateUser(userRecord.uid, {
      password: newPassword,
    });

    // 3. Delete token document to prevent reuse
    await tokenRef.delete();

    return res.json({ status: "success" });
  } catch (error) {
    console.error("execute-reset-password error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Admin: Create Professor Account on Their Behalf ─────────────────────────
app.post("/admin-create-professor", async (req, res) => {
  try {
    let decodedToken;
    try {
      decodedToken = await verifyAuthToken(req);
    } catch (authErr) {
      console.error("verifyAuthToken error in admin-create-professor:", authErr);
      return res.status(401).json({ error: `Unauthorized: ${authErr.message || "invalid token"}` });
    }

    // Admin authorization check
    let isCallerAdmin = decodedToken.isAdmin === true;
    if (!isCallerAdmin) {
      const callerSnap = await db.collection("users").doc(decodedToken.uid).get();
      const callerData = callerSnap.exists ? callerSnap.data() : {};
      if (callerData.role === "admin" || callerData.isAdmin === true) {
        isCallerAdmin = true;
      }
    }

    if (!isCallerAdmin) {
      return res.status(403).json({ error: "Forbidden: Admin privileges required." });
    }

    const {
      fullName,
      email,
      password,
      institute,
      department1,
      department2,
      designation = "Professor",
      interest,
      phone,
      website,
      bio,
      sendWelcomeEmail = true,
    } = req.body;

    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({ error: "Professor full name is required." });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: "Institutional email address is required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email address format." });
    }

    if (!institute || !String(institute).trim()) {
      return res.status(400).json({ error: "Institution / University name is required." });
    }
    if (!department1 || !String(department1).trim()) {
      return res.status(400).json({ error: "Primary department is required." });
    }

    let finalPassword = password ? String(password).trim() : "";
    if (finalPassword && finalPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }
    if (!finalPassword) {
      finalPassword = generateSecureTemporaryPassword();
    }

    // Check if account already exists in Firebase Auth
    try {
      const existingAuthUser = await admin.auth().getUserByEmail(normalizedEmail);
      if (existingAuthUser) {
        return res.status(400).json({
          error: `An account with email ${normalizedEmail} already exists.`,
        });
      }
    } catch (authErr) {
      if (authErr.code !== "auth/user-not-found") {
        return res.status(400).json({ error: authErr.message });
      }
    }

    // Create user in Firebase Auth with emailVerified: true
    const userRecord = await admin.auth().createUser({
      email: normalizedEmail,
      password: finalPassword,
      displayName: String(fullName).trim(),
      emailVerified: true,
    });

    // Format research interests
    let formattedInterest = null;
    if (Array.isArray(interest)) {
      formattedInterest = interest.map((s) => String(s).trim()).filter(Boolean).join(", ") || null;
    } else if (interest && String(interest).trim()) {
      formattedInterest = String(interest).trim();
    }

    const cleanFullName = String(fullName).trim();
    const cleanInstitute = String(institute).trim();
    const cleanDept1 = String(department1).trim();
    const cleanDept2 = department2 && String(department2).trim() ? String(department2).trim() : null;
    const cleanDesignation = designation && String(designation).trim() ? String(designation).trim() : "Professor";
    const cleanPhone = phone && String(phone).trim() ? String(phone).trim() : null;
    const cleanWebsite = website && String(website).trim() ? String(website).trim() : null;
    const cleanBio = bio && String(bio).trim() ? String(bio).trim() : null;

    const professorData = {
      fullName: cleanFullName,
      email: normalizedEmail,
      role: "professor",
      institute: cleanInstitute,
      department1: cleanDept1,
      department2: cleanDept2,
      designation: cleanDesignation,
      interest: formattedInterest,
      phone: cleanPhone,
      website: cleanWebsite,
      bio: cleanBio,
      emailVerified: true,
      createdByAdmin: true,
      createdByAdminUid: decodedToken.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Store in Firestore users collection
    await db.collection("users").doc(userRecord.uid).set(professorData);

    // Send Welcome Email if requested
    let emailSent = false;
    let emailError = null;
    if (sendWelcomeEmail) {
      try {
        const welcomeHtml = buildProfessorWelcomeEmailHtml({
          fullName: cleanFullName,
          email: normalizedEmail,
          password: finalPassword,
          institute: cleanInstitute,
          department1: cleanDept1,
          designation: cleanDesignation,
        });

        await transporter.sendMail({
          from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
          to: normalizedEmail,
          subject: "[FEP IITK] Your Faculty Supervisor Account Has Been Created",
          html: welcomeHtml,
        });
        emailSent = true;
        console.log(`Welcome email dispatched to professor ${normalizedEmail}`);
      } catch (mailErr) {
        console.warn(`Failed to dispatch welcome email to ${normalizedEmail}:`, mailErr.message);
        emailError = mailErr.message;
      }
    }

    return res.json({
      success: true,
      uid: userRecord.uid,
      email: normalizedEmail,
      fullName: cleanFullName,
      temporaryPassword: finalPassword,
      emailSent,
      emailError,
      professor: {
        id: userRecord.uid,
        ...professorData,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("admin-create-professor error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Admin: Reset Professor Password ────────────────────────────────────────
app.post("/admin-reset-professor-password", async (req, res) => {
  try {
    let decodedToken;
    try {
      decodedToken = await verifyAuthToken(req);
    } catch (authErr) {
      return res.status(401).json({ error: `Unauthorized: ${authErr.message || "invalid token"}` });
    }

    let isCallerAdmin = decodedToken.isAdmin === true;
    if (!isCallerAdmin) {
      const callerSnap = await db.collection("users").doc(decodedToken.uid).get();
      const callerData = callerSnap.exists ? callerSnap.data() : {};
      if (callerData.role === "admin" || callerData.isAdmin === true) {
        isCallerAdmin = true;
      }
    }

    if (!isCallerAdmin) {
      return res.status(403).json({ error: "Forbidden: Admin privileges required." });
    }

    const { uid, newPassword, sendEmail = true } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "Professor UID is required." });
    }

    const userRecord = await admin.auth().getUser(uid);
    let finalPassword = newPassword ? String(newPassword).trim() : "";
    if (finalPassword && finalPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (!finalPassword) {
      finalPassword = generateSecureTemporaryPassword();
    }

    await admin.auth().updateUser(uid, { password: finalPassword });

    let emailSent = false;
    if (sendEmail && userRecord.email) {
      try {
        const resetHtml = buildProfessorPasswordResetEmailHtml({
          fullName: userRecord.displayName || "Professor",
          email: userRecord.email,
          password: finalPassword,
        });

        await transporter.sendMail({
          from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
          to: userRecord.email,
          subject: "[FEP IITK] Password Reset for Your Faculty Account",
          html: resetHtml,
        });
        emailSent = true;
      } catch (mailErr) {
        console.warn(`Failed to send password reset email to ${userRecord.email}:`, mailErr.message);
      }
    }

    return res.json({
      success: true,
      newPassword: finalPassword,
      emailSent,
    });
  } catch (error) {
    console.error("admin-reset-professor-password error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Admin: Update Professor Details on Their Behalf ────────────────────────
app.post("/admin-update-professor", async (req, res) => {
  try {
    let decodedToken;
    try {
      decodedToken = await verifyAuthToken(req);
    } catch (authErr) {
      return res.status(401).json({ error: `Unauthorized: ${authErr.message || "invalid token"}` });
    }

    let isCallerAdmin = decodedToken.isAdmin === true;
    if (!isCallerAdmin) {
      const callerSnap = await db.collection("users").doc(decodedToken.uid).get();
      const callerData = callerSnap.exists ? callerSnap.data() : {};
      if (callerData.role === "admin" || callerData.isAdmin === true) {
        isCallerAdmin = true;
      }
    }

    if (!isCallerAdmin) {
      return res.status(403).json({ error: "Forbidden: Admin privileges required." });
    }

    const {
      uid,
      fullName,
      institute,
      department1,
      department2,
      designation,
      interest,
      phone,
      website,
      bio,
    } = req.body;

    if (!uid) {
      return res.status(400).json({ error: "Professor UID is required." });
    }

    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (fullName !== undefined && String(fullName).trim()) {
      updates.fullName = String(fullName).trim();
    }
    if (institute !== undefined && String(institute).trim()) {
      updates.institute = String(institute).trim();
    }
    if (department1 !== undefined && String(department1).trim()) {
      updates.department1 = String(department1).trim();
    }
    if (department2 !== undefined) {
      updates.department2 = department2 && String(department2).trim() ? String(department2).trim() : null;
    }
    if (designation !== undefined) {
      updates.designation = designation && String(designation).trim() ? String(designation).trim() : "Professor";
    }
    if (interest !== undefined) {
      if (Array.isArray(interest)) {
        updates.interest = interest.map((s) => String(s).trim()).filter(Boolean).join(", ") || null;
      } else {
        updates.interest = interest && String(interest).trim() ? String(interest).trim() : null;
      }
    }
    if (phone !== undefined) {
      updates.phone = phone && String(phone).trim() ? String(phone).trim() : null;
    }
    if (website !== undefined) {
      updates.website = website && String(website).trim() ? String(website).trim() : null;
    }
    if (bio !== undefined) {
      updates.bio = bio && String(bio).trim() ? String(bio).trim() : null;
    }

    await db.collection("users").doc(uid).update(updates);

    if (updates.fullName) {
      try {
        await admin.auth().updateUser(uid, { displayName: updates.fullName });
      } catch (authErr) {
        console.warn("Could not update auth displayName:", authErr.message);
      }
    }

    return res.json({ success: true, updates });
  } catch (error) {
    console.error("admin-update-professor error:", error);
    return res.status(500).json({ error: error.message });
  }
});

exports.api = onRequest(app);


// Helper function to fetch multiple documents in chunks to avoid Firestore IN limit of 30 items
const fetchDocsMap = async (collectionName, ids) => {
  const map = {};
  if (!ids || ids.length === 0) return map;

  const chunks = [];
  const chunkSize = 30;
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await db
        .collection(collectionName)
        .where(admin.firestore.FieldPath.documentId(), "in", chunk)
        .get();
      snap.docs.forEach((docSnap) => {
        map[docSnap.id] = docSnap.data();
      });
    })
  );

  return map;
};

// Builder function for professor digest HTML email
const buildProfessorDigestEmailHtml = (profName, newAppsList) => {
  // Group by project title
  const groupedByProject = {};
  newAppsList.forEach((item) => {
    if (!groupedByProject[item.projectTitle]) {
      groupedByProject[item.projectTitle] = [];
    }
    groupedByProject[item.projectTitle].push(item);
  });

  const projectsHtml = Object.keys(groupedByProject)
    .map((projectTitle) => {
      const apps = groupedByProject[projectTitle];
      const appsListHtml = apps
        .map(
          (item) => `
          <li style="margin-bottom: 8px; font-size: 14.5px;">
            <strong>${item.studentName}</strong> (CPI: ${item.cpi})
          </li>
        `
        )
        .join("");

      return `
        <div style="margin-bottom: 24px; text-align: left;">
          <h4 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: #0f294a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
            Project: ${projectTitle} (${apps.length} new)
          </h4>
          <ul style="margin: 0; padding-left: 20px;">
            ${appsListHtml}
          </ul>
        </div>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Applications Digest</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px 16px; margin: 0; background-color: #f4f6fa; -webkit-font-smoothing: antialiased; text-align: center;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background-color: #0f294a; padding: 20px 24px; text-align: left;">
          <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">
            Foreign Exposure Programme
          </h2>
        </div>
        <div style="padding: 24px; color: #1e293b; text-align: left;">
          <p style="font-size: 16px; margin: 0 0 12px 0; font-weight: 600;">Dear Professor ${profName},</p>
          <p style="font-size: 14.5px; margin: 0 0 24px 0; color: #475569; line-height: 1.5;">
            You have received <strong>${newAppsList.length}</strong> new approved application(s) for your research projects. Below is a summary:
          </p>
          
          ${projectsHtml}
          
          <p style="font-size: 14.5px; margin: 24px 0 12px 0; color: #1e293b; line-height: 1.5; font-weight: 500;">
            Please log into the FEP Portal dashboard to view the full student profiles, resumes, and manage their applications.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
            <strong>Contact Us:</strong> For any queries, contact <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${SENDER_EMAIL}</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Builder function for student status update HTML email
const buildStudentStatusUpdateEmailHtml = (studentName, projectTitle, status, professorName, appId) => {
  const statusColors = {
    shortlisted: "#d97706",
    selected: "#16a34a",
    rejected: "#dc2626",
    applied: "#2563eb",
    pending: "#2563eb",
  };

  const color = statusColors[status] || "#475569";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Application Status Update</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px 16px; margin: 0; background-color: #f4f6fa; -webkit-font-smoothing: antialiased; text-align: center;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background-color: #0f294a; padding: 20px 24px; text-align: left;">
          <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">
            Foreign Exposure Programme
          </h2>
        </div>
        <div style="padding: 24px; color: #1e293b; text-align: left;">
          <p style="font-size: 16px; margin: 0 0 12px 0; font-weight: 500;">Dear ${studentName},</p>
          <p style="font-size: 14.5px; margin: 0 0 20px 0; color: #475569; line-height: 1.5;">
            Your application status for the project <strong>"${projectTitle}"</strong> under Professor <strong>${professorName}</strong> has been updated.
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <p style="margin: 0 0 8px 0; font-size: 13.5px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">New Status</p>
            <span style="font-size: 20px; font-weight: 700; color: ${color}; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">
              ${status}
            </span>
          </div>

          <div style="text-align: center; margin: 24px 0 20px 0;">
            <a href="https://iriitk.com/fep/login" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.2);">
              Log in to FEP Portal →
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.5;">
            <strong>Contact Us:</strong> For any queries, contact <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${SENDER_EMAIL}</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Builder function for admin broadcast HTML email
const buildBroadcastAnnouncementEmailHtml = (recipientName, projectTitle, subject, messageText) => {
  const formattedBody = (messageText || "")
    .split("\n\n")
    .map((para) => `<p style="margin: 0 0 16px 0; font-size: 14.5px; color: #334155; line-height: 1.6;">${para.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px 16px; margin: 0; background-color: #f4f6fa; -webkit-font-smoothing: antialiased; text-align: center;">
      <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background-color: #0f294a; padding: 20px 24px; text-align: left;">
          <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">
            Foreign Exposure Programme
          </h2>
        </div>
        <div style="padding: 24px; color: #1e293b; text-align: left;">
          <p style="font-size: 15.5px; margin: 0 0 16px 0; font-weight: 600; color: #0f294a;">Dear ${recipientName},</p>

          <div style="background-color: #ffffff; border-left: 4px solid #0284c7; padding: 4px 0 4px 16px; margin-bottom: 24px;">
            <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a; font-weight: 700;">
              ${subject}
            </h3>
            ${formattedBody}
          </div>

          <div style="text-align: center; margin: 28px 0 20px 0;">
            <a href="https://iriitk.com/fep/login" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.2);">
              Log in to FEP Portal →
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
          <p style="font-size: 12.5px; color: #64748b; margin: 0 0 4px 0; line-height: 1.5;">
            This is an official administrative notice sent by the Foreign Exposure Programme team, International Relations Wing, IIT Kanpur.
          </p>
          <p style="font-size: 12.5px; color: #64748b; margin: 0; line-height: 1.5;">
            <strong>Contact Us:</strong> For any queries, contact <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${SENDER_EMAIL}</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Helper: Generate secure, readable temporary password
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

  return password
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
};

// Builder: Professor Account Onboarding / Welcome Email
const buildProfessorWelcomeEmailHtml = ({
  fullName,
  email,
  password,
  institute,
  department1,
}) => {
  const loginUrl = "https://iriitk.com/fep/login";
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Your FEP Portal Account - IIT Kanpur</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 32px 16px; margin: 0;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        
        <div style="border-bottom: 2px solid #0f294a; padding-bottom: 12px; margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 18px; color: #0f294a; font-weight: 700;">
            Indian Institute of Technology Kanpur
          </h2>
          <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">
            Foreign Exposure Programme (FEP) • International Relations Wing
          </p>
        </div>

        <p style="font-size: 15px; margin: 0 0 16px 0;">Dear ${fullName},</p>

        <p style="font-size: 14.5px; color: #334155; margin: 0 0 16px 0;">
          An account has been set up for you on the IIT Kanpur Foreign Exposure Programme portal${institute ? ` for ${institute}` : ""}. You can use this portal to publish research projects and receive applications from IIT Kanpur students.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <div style="font-size: 13.5px; margin-bottom: 8px;">
            <span style="color: #64748b; display: inline-block; width: 140px;">Portal:</span>
            <a href="${loginUrl}" style="color: #0284c7; text-decoration: none; font-weight: 500;">${loginUrl}</a>
          </div>
          <div style="font-size: 13.5px; margin-bottom: 8px;">
            <span style="color: #64748b; display: inline-block; width: 140px;">Login Email:</span>
            <strong style="font-family: monospace; color: #0f172a;">${email}</strong>
          </div>
          <div style="font-size: 13.5px;">
            <span style="color: #64748b; display: inline-block; width: 140px;">Temporary Password:</span>
            <code style="font-family: monospace; font-size: 14px; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-weight: 700; color: #0f172a;">${password}</code>
          </div>
        </div>

        <div style="margin: 24px 0;">
          <a href="${loginUrl}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 6px;">
            Log in to Portal →
          </a>
        </div>

        <p style="font-size: 14px; color: #334155; margin: 0 0 16px 0;">
          Once logged in, you can update your password in Profile settings, add project details, and review applications as students apply.
        </p>

        <p style="font-size: 14px; color: #334155; margin: 0 0 24px 0;">
          If you have any questions or need assistance, please feel free to reply to this email or reach us at <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none;">${SENDER_EMAIL}</a>.
        </p>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; color: #64748b; font-size: 13px;">
          Best regards,<br/>
          <strong>Foreign Exposure Programme Team</strong><br/>
          International Relations Wing<br/>
          Indian Institute of Technology Kanpur
        </div>
      </div>
    </body>
    </html>
  `;
};

// Builder: Professor Password Reset Notification Email
const buildProfessorPasswordResetEmailHtml = ({
  fullName,
  email,
  password,
}) => {
  const loginUrl = "https://iriitk.com/fep/login";
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Notice - FEP IIT Kanpur</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 32px 16px; margin: 0; background-color: #f8fafc; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background-color: #0f294a; padding: 22px 28px; text-align: left;">
          <h1 style="color: #ffffff; margin: 0; font-size: 19px; font-weight: 600; letter-spacing: 0.3px;">
            Foreign Exposure Programme (FEP)
          </h1>
          <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">
            International Relations Wing • Indian Institute of Technology Kanpur
          </p>
        </div>

        <div style="padding: 28px; color: #1e293b; text-align: left;">
          <p style="font-size: 16px; margin: 0 0 16px 0; font-weight: 600; color: #0f294a;">
            Dear ${fullName || "Professor"},
          </p>
          <p style="font-size: 14.5px; margin: 0 0 20px 0; color: #334155; line-height: 1.6;">
            Your account password has been updated by the Foreign Exposure Programme administrator. You can now use your updated credentials to access the portal.
          </p>

          <div style="background-color: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 18px 20px; margin-bottom: 24px;">
            <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #0f294a; margin-bottom: 12px;">
              Updated Login Credentials
            </div>
            <div style="margin-bottom: 12px;">
              <span style="font-size: 12px; color: #64748b; display: block; margin-bottom: 3px;">Login Email:</span>
              <strong style="font-size: 14px; color: #0f172a; font-family: monospace;">${email}</strong>
            </div>
            <div>
              <span style="font-size: 12px; color: #64748b; display: block; margin-bottom: 3px;">New Temporary Password:</span>
              <code style="font-size: 15px; color: #0f172a; background: #f1f5f9; padding: 5px 12px; border-radius: 4px; font-family: monospace; display: inline-block; font-weight: 700; border: 1px solid #e2e8f0;">${password}</code>
            </div>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 6px;">
              Log In to FEP Portal →
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
          <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
            International Relations Wing, Indian Institute of Technology Kanpur.<br/>
            If you did not request this update or have any questions, please contact <a href="mailto:${SENDER_EMAIL}" style="color: #0284c7; text-decoration: none;">${SENDER_EMAIL}</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Main processing logic for sending professor application digests
const sendProfessorDigestLogic = async () => {
  console.log("Starting Professor Digest Logic...");
  const snapshot = await db
    .collection("applications")
    .where("adminApprovalStatus", "==", "approved")
    .where("notificationEmailSent", "==", false)
    .get();

  if (snapshot.empty) {
    console.log("No new approved applications found for digest.");
    return { sentCount: 0, message: "No applications found." };
  }

  const appsByProfessor = {};
  const projectIds = new Set();
  const studentIds = new Set();
  const professorIds = new Set();

  snapshot.docs.forEach((docSnap) => {
    const app = { id: docSnap.id, ...docSnap.data() };
    const profId = app.professorId;
    if (profId) {
      if (!appsByProfessor[profId]) {
        appsByProfessor[profId] = [];
      }
      appsByProfessor[profId].push(app);
      projectIds.add(app.projectId);
      studentIds.add(app.studentId);
      professorIds.add(profId);
    }
  });

  const [projectsMap, studentsMap, professorsMap] = await Promise.all([
    fetchDocsMap("projects", Array.from(projectIds)),
    fetchDocsMap("users", Array.from(studentIds)),
    fetchDocsMap("users", Array.from(professorIds)),
  ]);

  let emailedProfessorsCount = 0;
  const batch = db.batch();

  for (const profId of Object.keys(appsByProfessor)) {
    const professor = professorsMap[profId] || {};
    const professorEmail = professor.email;
    if (!professorEmail) {
      console.warn(`No email found for professor ${profId}`);
      continue;
    }

    const apps = appsByProfessor[profId];
    const newAppsList = [];

    for (const app of apps) {
      const project = projectsMap[app.projectId] || {};
      const student = studentsMap[app.studentId] || {};
      newAppsList.push({
        app,
        projectTitle: project.title || "Untitled Project",
        studentName: app.studentName || student.fullName || "A student",
        studentEmail: student.email || "N/A",
        cpi: app.cpi || "Not specified",
        experience: app.experience || "N/A",
        coverNote: app.coverNote || "N/A",
        resumeUrl: app.resumeUrl || null,
        link: `https://iriitk.com/fep/dashboard/applications/${app.id}`,
      });
    }

    if (newAppsList.length === 0) continue;

    const emailSubject = `[FEP IITK] New Applications Digest — ${newAppsList.length} New Application(s)`;
    const emailHtml = buildProfessorDigestEmailHtml(professor.fullName || "Faculty Member", newAppsList);

    await transporter.sendMail({
      from: `"Foreign Exposure Programme" <${SENDER_EMAIL}>`,
      to: professorEmail,
      subject: emailSubject,
      html: emailHtml,
    });

    emailedProfessorsCount++;

    apps.forEach((app) => {
      const ref = db.collection("applications").doc(app.id);
      batch.update(ref, {
        notificationEmailSent: true,
        notificationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  }

  await batch.commit();
  console.log(`Successfully sent digest to ${emailedProfessorsCount} professor(s).`);
  return { sentCount: emailedProfessorsCount };
};

// NOTE: professorApplicationsDigest and onApplicationStatusUpdate have been
// migrated to HTTP routes (/send-professor-digest and /notify-status-change)
// inside the main Express app above. This avoids Eventarc/Cloud Scheduler
// IAM permission requirements and keeps everything in a single Gen 2 function.
//
// The digest is now triggered by GitHub Actions (.github/workflows/professor-digest.yml).
// The status notification is called directly from the Admin panel frontend.

if (require.main === module) {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`Local Functions API server running on http://localhost:${PORT}`);
  });
}