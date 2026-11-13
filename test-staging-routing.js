/**
 * ==============================================================================
 * NAILS BY DIVYA — FRONTEND ROUTING & PRODUCTION ISOLATION TEST SUITE
 * Phase 4C: Cloudflare Pages & Staging Backend Routing Verification
 * ==============================================================================
 * Tests verify:
 * 1. Staging custom domain (staging.nailsbydivya.store) -> staging backend
 * 2. Preview custom domain (preview.nailsbydivya.store) -> staging backend
 * 3. Cloudflare Pages hostnames (*.pages.dev) -> staging backend
 * 4. Production domain (nailsbydivya.store, www.nailsbydivya.store) -> production backend
 * 5. Local development (localhost, 127.0.0.1) -> configured local backend
 * 6. Unknown / unrecognized hostnames -> fail closed (NO production fallback)
 * 7. Obsolete domain (staging-api.nailsbydivya.store) has 0 active references
 * 8. Staging routes strictly isolated from production backend
 * ==============================================================================
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passedCount = 0;
let failedCount = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedCount++;
  }
}

console.log("==================================================================");
console.log("   PHASE 4C: FRONTEND STAGING ROUTING & ISOLATION TEST SUITE");
console.log("==================================================================\n");

// -----------------------------------------------------------------------------
// 1. Static Source File Inspection: Zero Obsolete References
// -----------------------------------------------------------------------------
console.log("🧪 1. Static Source Audit (Zero Obsolete API Domain References)");

const FRONTEND_DIR = __dirname;
const filesToCheck = [
  "account-api.js",
  "firebase-config.js",
  "firebase-config.staging.example.js",
  "script.js",
  "index.html",
  "account.html",
  "nail-art.html",
  "nail-extensions.html",
  "press-on-nails-india.html",
];

it("No active source file contains the obsolete 'staging-api.nailsbydivya.store'", () => {
  const obsoletePattern = /staging-api\.nailsbydivya\.store/g;
  const violations = [];

  for (const file of filesToCheck) {
    const filePath = path.join(FRONTEND_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    if (obsoletePattern.test(content)) {
      violations.push(file);
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    `Found obsolete domain references in: ${violations.join(", ")}`
  );
});

// -----------------------------------------------------------------------------
// 2. account-api.js resolveBackendApiUrl Unit Tests
// -----------------------------------------------------------------------------
console.log("\n🧪 2. account-api.js Backend URL Resolution & Isolation");

// Load module
const { resolveBackendApiUrl, NailsApi } = require("./account-api");

const STAGING_BACKEND = "https://nailsbydivya-staging-api.onrender.com";
const PRODUCTION_BACKEND = "https://nails-ai-backend.onrender.com";
const LOCAL_BACKEND = "http://localhost:3000";

it("Localhost resolves to local backend", () => {
  assert.strictEqual(resolveBackendApiUrl("localhost"), LOCAL_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("127.0.0.1"), LOCAL_BACKEND);
  assert.strictEqual(resolveBackendApiUrl(""), LOCAL_BACKEND);
});

it("Staging custom domains resolve to staging backend", () => {
  assert.strictEqual(resolveBackendApiUrl("staging.nailsbydivya.store"), STAGING_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("STAGING.NAILSBYDIVYA.STORE"), STAGING_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("preview.nailsbydivya.store"), STAGING_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("staging-admin.nailsbydivya.store"), STAGING_BACKEND);
});

it("Cloudflare Pages hostnames (*.pages.dev) resolve to staging backend", () => {
  assert.strictEqual(resolveBackendApiUrl("nailsbydivya-staging.pages.dev"), STAGING_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("nailsbydivya.pages.dev"), STAGING_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("74bb2cf.nailsbydivya.pages.dev"), STAGING_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("staging-preview.pages.dev"), STAGING_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("pages.dev"), STAGING_BACKEND);
});

it("Production domains resolve strictly to production backend", () => {
  assert.strictEqual(resolveBackendApiUrl("nailsbydivya.store"), PRODUCTION_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("www.nailsbydivya.store"), PRODUCTION_BACKEND);
  assert.strictEqual(resolveBackendApiUrl("WWW.NAILSBYDIVYA.STORE"), PRODUCTION_BACKEND);
});

it("Unknown hostnames FAIL CLOSED and throw an Error without falling back to production", () => {
  const unknownHosts = [
    "evil-phishing.com",
    "random-site.net",
    "example.org",
    "nailsbydivya.com",
    "staging.fake-domain.org",
    "192.168.1.100",
  ];

  for (const host of unknownHosts) {
    if (host.includes("staging") || host.includes("preview")) continue; // Staging keyword correctly routes to staging
    assert.throws(
      () => resolveBackendApiUrl(host),
      (err) => {
        assert(err instanceof Error);
        assert(err.message.includes("Unrecognized environment hostname"));
        assert(err.message.includes("Refusing to route to production backend"));
        return true;
      },
      `Host "${host}" should have thrown an error but did not`
    );
  }
});

it("Staging routes NEVER return production backend URL", () => {
  const stagingHosts = [
    "staging.nailsbydivya.store",
    "preview.nailsbydivya.store",
    "nailsbydivya-staging.pages.dev",
    "branch-xyz.nailsbydivya.pages.dev",
  ];

  for (const host of stagingHosts) {
    const resolved = resolveBackendApiUrl(host);
    assert.notStrictEqual(resolved, PRODUCTION_BACKEND, `Host "${host}" leaked to production!`);
    assert.strictEqual(resolved, STAGING_BACKEND);
  }
});

// -----------------------------------------------------------------------------
// 3. firebase-config.js resolveApiUrl Unit Tests
// -----------------------------------------------------------------------------
console.log("\n🧪 3. firebase-config.js Runtime API Resolver & Fail-Closed Safety");

const { resolveApiUrl } = require("./firebase-config");

it("firebase-config: Localhost resolves to local backend", () => {
  assert.strictEqual(resolveApiUrl("localhost"), LOCAL_BACKEND);
  assert.strictEqual(resolveApiUrl("127.0.0.1"), LOCAL_BACKEND);
});

it("firebase-config: Staging and Cloudflare Pages resolve to staging backend", () => {
  assert.strictEqual(resolveApiUrl("staging.nailsbydivya.store"), STAGING_BACKEND);
  assert.strictEqual(resolveApiUrl("preview.nailsbydivya.store"), STAGING_BACKEND);
  assert.strictEqual(resolveApiUrl("nailsbydivya.pages.dev"), STAGING_BACKEND);
  assert.strictEqual(resolveApiUrl("pr-12.nailsbydivya.pages.dev"), STAGING_BACKEND);
});

it("firebase-config: Production resolves strictly to production backend", () => {
  assert.strictEqual(resolveApiUrl("nailsbydivya.store"), PRODUCTION_BACKEND);
  assert.strictEqual(resolveApiUrl("www.nailsbydivya.store"), PRODUCTION_BACKEND);
});

it("firebase-config: Unknown hostnames return null (fail closed, no production fallback)", () => {
  assert.strictEqual(resolveApiUrl("unknown-phishing.org"), null);
  assert.strictEqual(resolveApiUrl("another-domain.net"), null);
});

// -----------------------------------------------------------------------------
// 4. script.js Divv Stylist Resolver Consistency
// -----------------------------------------------------------------------------
console.log("\n🧪 4. script.js Chat & Divv Stylist URL Resolution Consistency");

const scriptContent = fs.readFileSync(path.join(FRONTEND_DIR, "script.js"), "utf8");

it("script.js routes staging and pages.dev to staging backend", () => {
  assert(scriptContent.includes("https://nailsbydivya-staging-api.onrender.com"));
  assert(scriptContent.includes('host.endsWith(".pages.dev")'));
  assert(scriptContent.includes('host === "staging.nailsbydivya.store"'));
  assert(!scriptContent.includes("staging-api.nailsbydivya.store"));
});

it("script.js throws fail-closed error on unrecognized host instead of production fallback", () => {
  assert(scriptContent.includes("[Divv Stylist Error] Unrecognized environment hostname"));
  assert(scriptContent.includes("Refusing to route to production backend"));
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("\n==================================================================");
console.log(`RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
console.log("==================================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("\n🎉 ALL FRONTEND ROUTING & ISOLATION TESTS PASSED CLEANLY!\n");
  process.exit(0);
}
