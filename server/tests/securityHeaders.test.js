const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const express = require("express");
const cors = require("cors");
const securityHeaders = require("../../functions/securityHeaders");
const { hosting } = require("../../firebase.json");

const expectedHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
const hostingHeaders = Object.fromEntries(
  hosting.headers.find((rule) => rule.source === "**").headers.map(
    ({ key, value }) => [key, value]
  )
);
const serverRoot = path.resolve(__dirname, "..");
let temporaryRoot;
let backend;
let backendExit;
let baseUrl;
let functionServer;
let functionUrl;

function assertHeaders(response) {
  for (const [name, value] of Object.entries(expectedHeaders)) {
    assert.equal(response.headers.get(name), value, name);
  }
  const csp = response.headers.get("Content-Security-Policy");
  assert.ok(csp, "An enforcing CSP must be present");
  assert.equal(response.headers.get("Content-Security-Policy-Report-Only"), null);
  // Express's default HTML 404 handler replaces CSP with default-src 'none'.
  // That policy is also restrictive; X-Frame-Options still prevents framing.
  if (response.status === 404 && csp === "default-src 'none'") return;
  assert.equal(csp, hostingHeaders["Content-Security-Policy"]);
}

before(async () => {
  // Run the real backend against disposable data and static build fixtures.
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fep-security-"));
  const isolatedServer = path.join(temporaryRoot, "server");
  fs.cpSync(serverRoot, isolatedServer, {
    recursive: true,
    filter: (source) => !["node_modules", "data", "uploads", ".env"].includes(
      path.relative(serverRoot, source).split(path.sep)[0]
    ),
  });
  fs.symlinkSync(path.join(serverRoot, "node_modules"), path.join(isolatedServer, "node_modules"), "dir");
  fs.mkdirSync(path.join(temporaryRoot, "functions"));
  fs.copyFileSync(
    path.resolve(serverRoot, "../functions/securityHeaders.js"),
    path.join(temporaryRoot, "functions/securityHeaders.js")
  );
  fs.mkdirSync(path.join(temporaryRoot, "build"));
  fs.writeFileSync(path.join(temporaryRoot, "build/index.html"), "<!doctype html><title>FEP</title>");
  fs.writeFileSync(path.join(temporaryRoot, "build/app.js"), "console.log('FEP');");

  backend = spawn(process.execPath, [path.join(isolatedServer, "index.js")], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "0",
      JWT_SECRET: randomBytes(32).toString("hex"),
      INITIAL_ADMIN_EMAIL: "security-test@example.invalid",
      INITIAL_ADMIN_PASSWORD: randomBytes(24).toString("hex"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  backendExit = once(backend, "exit");
  await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Backend startup timed out: ${output}`)), 15000);
    backend.once("error", (error) => { clearTimeout(timeout); reject(error); });
    backend.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Backend exited (${code}): ${output}`)); });
    backend.stderr.on("data", (chunk) => { output += chunk; });
    backend.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/Server running on http:\/\/localhost:(\d+)/);
      if (match) {
        baseUrl = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  // Exercise the deployable middleware with the Cloud Function's CORS options.
  const functionApp = express();
  functionApp.use(securityHeaders);
  functionApp.use(cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  }));
  functionApp.get("/", (req, res) => res.json({ status: "ok" }));
  functionServer = functionApp.listen(0, "127.0.0.1");
  await once(functionServer, "listening");
  functionUrl = `http://127.0.0.1:${functionServer.address().port}`;
});

after(async () => {
  if (backend && backend.exitCode === null && backend.signalCode === null) backend.kill();
  if (backendExit) await backendExit;
  if (functionServer) await new Promise((resolve) => functionServer.close(resolve));
  if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

test("Firebase Hosting and backend policies protect scripts, forms and framing", () => {
  for (const [name, value] of Object.entries(expectedHeaders)) {
    assert.equal(hostingHeaders[name], value);
  }
  const directives = Object.fromEntries(
    hostingHeaders["Content-Security-Policy"].split(";").filter((item) => item.trim()).map((item) => {
      const [name, ...sources] = item.trim().split(/\s+/);
      return [name, sources];
    })
  );
  for (const name of ["default-src", "frame-ancestors", "base-uri", "form-action"]) {
    assert.deepEqual(directives[name], ["'self'"]);
  }
  assert.deepEqual(directives["object-src"], ["'none'"]);
  assert.deepEqual(directives["script-src"], ["'self'", "https://cdn.tailwindcss.com"]);
  // Existing fonts, inline styles, file previews and local development still work.
  assert.ok(directives["style-src"].includes("'unsafe-inline'"));
  assert.ok(directives["font-src"].includes("https://fonts.gstatic.com"));
  assert.ok(directives["img-src"].includes("blob:"));
  assert.ok(directives["connect-src"].includes("http://localhost:*"));
});

for (const [route, expectedStatus, method] of [
  ["/api/health", 200, "GET"],
  ["/fep/dashboard", 200, "GET"],
  ["/app.js", 200, "GET"],
  ["/app.js", 200, "HEAD"],
  ["/api/auth/me", 401, "GET"],
  ["/api/not-a-route", 404, "GET"],
]) {
  test(`backend sends security headers on ${method} ${route} (${expectedStatus})`, async () => {
    const response = await fetch(`${baseUrl}${route}`, { method });
    assert.equal(response.status, expectedStatus);
    assertHeaders(response);
    await response.arrayBuffer();
  });
}

test("backend retains headers when JSON parsing fails before routing", async () => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.ok(response.status >= 400);
  assertHeaders(response);
  await response.arrayBuffer();
});

for (const target of ["backend", "function middleware"]) {
  test(`${target} includes headers on CORS preflight responses`, async () => {
    const url = target === "backend" ? `${baseUrl}/api/login` : functionUrl;
    const response = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://iriitk.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://iriitk.com");
    assertHeaders(response);
  });
}

test("deployable function middleware sends the same enforcing headers", async () => {
  const response = await fetch(functionUrl);
  assert.equal(response.status, 200);
  assertHeaders(response);
  await response.arrayBuffer();
});
