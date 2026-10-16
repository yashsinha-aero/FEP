const crypto = require("crypto");

const FIREBASE_SCRYPT_PREFIX = "firebase-scrypt$";
const FIREBASE_SCRYPT_CONFIG = {
  signerKey: process.env.FIREBASE_SCRYPT_SIGNER_KEY,
  saltSeparator: process.env.FIREBASE_SCRYPT_SALT_SEPARATOR || "Bw==",
  rounds: Number(process.env.FIREBASE_SCRYPT_ROUNDS || 8),
  memCost: Number(process.env.FIREBASE_SCRYPT_MEM_COST || 14),
};

const decodeBase64 = (value) => {
  if (typeof value !== "string" || !value) {
    throw new Error("Invalid Firebase SCRYPT base64 value.");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length === 0 || decoded.toString("base64").replace(/=+$/, "") !== normalized.replace(/=+$/, "")) {
    throw new Error("Invalid Firebase SCRYPT base64 value.");
  }
  return decoded;
};

const getFirebaseScryptConfig = () => {
  if (!FIREBASE_SCRYPT_CONFIG.signerKey) {
    throw new Error("FIREBASE_SCRYPT_SIGNER_KEY is required to verify imported Firebase passwords.");
  }
  if (
    !Number.isInteger(FIREBASE_SCRYPT_CONFIG.rounds) ||
    FIREBASE_SCRYPT_CONFIG.rounds < 1 ||
    FIREBASE_SCRYPT_CONFIG.rounds > 8 ||
    !Number.isInteger(FIREBASE_SCRYPT_CONFIG.memCost) ||
    FIREBASE_SCRYPT_CONFIG.memCost < 1 ||
    FIREBASE_SCRYPT_CONFIG.memCost > 14
  ) {
    throw new Error("Invalid Firebase SCRYPT configuration.");
  }

  return {
    signerKey: decodeBase64(FIREBASE_SCRYPT_CONFIG.signerKey),
    saltSeparator: decodeBase64(FIREBASE_SCRYPT_CONFIG.saltSeparator),
    rounds: FIREBASE_SCRYPT_CONFIG.rounds,
    memCost: FIREBASE_SCRYPT_CONFIG.memCost,
  };
};

const encodeFirebaseScryptHash = (passwordHash, salt) => {
  decodeBase64(passwordHash);
  decodeBase64(salt);
  return `${FIREBASE_SCRYPT_PREFIX}${salt}$${passwordHash}`;
};

const parseFirebaseScryptHash = (storedHash) => {
  if (!storedHash.startsWith(FIREBASE_SCRYPT_PREFIX)) return null;

  const parts = storedHash.split("$");
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    throw new Error("Invalid stored Firebase SCRYPT password.");
  }

  return { salt: parts[1], passwordHash: parts[2] };
};

const verifyFirebaseScryptPassword = async (password, storedHash) => {
  const parsed = parseFirebaseScryptHash(storedHash);
  if (!parsed) return null;

  const config = getFirebaseScryptConfig();
  const salt = Buffer.concat([
    decodeBase64(parsed.salt),
    config.saltSeparator,
  ]);
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      32,
      {
        N: 2 ** config.memCost,
        r: config.rounds,
        p: 1,
        maxmem: 32 * 1024 * 1024,
      },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });

  const cipher = crypto.createCipheriv("aes-256-ctr", derivedKey, Buffer.alloc(16));
  const generatedHash = Buffer.concat([
    cipher.update(config.signerKey),
    cipher.final(),
  ]);
  const knownHash = decodeBase64(parsed.passwordHash);

  if (generatedHash.length !== knownHash.length) return false;
  return crypto.timingSafeEqual(generatedHash, knownHash);
};

module.exports = {
  encodeFirebaseScryptHash,
  verifyFirebaseScryptPassword,
};
