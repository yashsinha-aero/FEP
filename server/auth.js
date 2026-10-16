const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db, formatUser } = require("./db");
const { verifyFirebaseScryptPassword } = require("./firebaseScrypt");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to a random value of at least 32 characters.");
}
const JWT_EXPIRES_IN = "7d";

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hash) => {
  const firebaseResult = await verifyFirebaseScryptPassword(password, hash);
  if (firebaseResult !== null) return firebaseResult;
  return bcrypt.compare(password, hash);
};

const generateToken = (user) => {
  const payload = {
    uid: user.id || user.uid,
    id: user.id || user.uid,
    email: user.email,
    role: user.role,
    isAdmin: Boolean(user.is_admin || user.isAdmin),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1]) {
    return res.status(401).json({ error: "Authentication required. Missing token." });
  }

  const token = match[1].trim();
  try {
    const decoded = verifyToken(token);
    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.uid);

    if (!userRow) {
      return res.status(401).json({ error: "User account no longer exists." });
    }

    req.user = formatUser(userRow);
    req.decodedToken = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session token." });
  }
};

// Optional auth: attaches req.user if token is present, continues otherwise
const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1]) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyToken(match[1].trim());
    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.uid);
    req.user = userRow ? formatUser(userRow) : null;
  } catch {
    req.user = null;
  }
  next();
};

const adminMiddleware = (req, res, next) => {
  if (!req.user || (!req.user.isAdmin && req.user.role !== "admin")) {
    return res.status(403).json({ error: "Forbidden: Administrator privileges required." });
  }
  next();
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
  JWT_SECRET,
};
