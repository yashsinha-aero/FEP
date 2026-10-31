// Keep this module inside functions/ so it is included in Firebase deployments.
// The local Express server reuses it; tests check parity with Firebase Hosting.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' https://cdn.tailwindcss.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://us-central1-fep-iitk.cloudfunctions.net " +
    "https://*.googleapis.com https://*.firebaseapp.com https://*.firebase.com " +
    "wss://*.firebaseio.com http://localhost:* ws://localhost:*",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ") + ";";

const securityHeaders = (req, res, next) => {
  res.set({
    "Content-Security-Policy": contentSecurityPolicy,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
};

module.exports = securityHeaders;
