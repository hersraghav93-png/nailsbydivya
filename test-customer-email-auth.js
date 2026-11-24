/**
 * ==============================================================================
 * NAILS BY DIVYA — CUSTOMER EMAIL MAGIC-LINK & SMALL FIXES TEST SUITE
 * (`test-customer-email-auth.js`)
 * ==============================================================================
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     ${err.stack || err.message}`);
  }
}

async function run() {
  console.log("==================================================================");
  console.log("   FRONTEND PHASE 2: EMAIL AUTH, ARIA-HIDDEN, & CART LOCK TESTS");
  console.log("==================================================================\n");

  const authSrc = fs.readFileSync(path.join(__dirname, "auth.js"), "utf8");
  const authModalSrc = fs.readFileSync(path.join(__dirname, "auth-modal.js"), "utf8");
  const accountHtmlSrc = fs.readFileSync(path.join(__dirname, "account.html"), "utf8");
  const accountJsSrc = fs.readFileSync(path.join(__dirname, "account.js"), "utf8");
  const scriptSrc = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  const cssSrc = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");

  await test("1. style.css has clean 0 brace depth with zero unmatched closing braces", () => {
    const lines = cssSrc.split(/\r?\n/);
    let depth = 0;
    let inComment = false;
    const negLines = [];
    lines.forEach((l, i) => {
      for (let j = 0; j < l.length; j++) {
        if (!inComment && l[j] === "/" && l[j + 1] === "*") { inComment = true; j++; continue; }
        if (inComment && l[j] === "*" && l[j + 1] === "/") { inComment = false; j++; continue; }
        if (inComment) continue;
        if (l[j] === "{") depth++;
        if (l[j] === "}") {
          depth--;
          if (depth < 0) { negLines.push(i + 1); depth = 0; }
        }
      }
    });
    assert.strictEqual(negLines.length, 0, `Unexpected closing braces at lines: ${negLines.join(", ")}`);
    assert.strictEqual(depth, 0, `Unclosed braces left: depth=${depth}`);
  });

  await test("2. script.js synchronizes aria-hidden on product, cart, and checkout modals and prevents duplicate cart deletes", () => {
    assert(scriptSrc.includes('overlay.setAttribute("aria-hidden", "false")'), "openCartDrawer sets aria-hidden=false");
    assert(scriptSrc.includes('overlay.setAttribute("aria-hidden", "true")'), "closeCartDrawer sets aria-hidden=true");
    assert(scriptSrc.includes('modal.setAttribute("aria-hidden", "false")'), "openProductModal / openCheckoutModal set aria-hidden=false");
    assert(scriptSrc.includes('modal.setAttribute("aria-hidden", "true")'), "closeAllModals sets aria-hidden=true");
    assert(scriptSrc.includes("inFlightCartItemIds"), "Cart item mutations guarded against rapid duplicate clicks");
  });

  await test("3. NailsAuth email flow keeps secrets/tokens out of localStorage and completes Firebase custom token login + signout", async () => {
    const storageData = {};
    let firebaseCurrentUser = null;
    let authListener = null;

    const fakeFbAuth = {
      get currentUser() { return firebaseCurrentUser; },
      onAuthStateChanged(cb) {
        authListener = cb;
        cb(firebaseCurrentUser);
      },
      async signInWithCustomToken(customToken) {
        assert.strictEqual(customToken, "custom_firebase_tok_123");
        firebaseCurrentUser = {
          uid: "uid_email_1",
          email: "meera@example.com",
          getIdToken: async () => "id_token_mem_only_999",
        };
        return { user: firebaseCurrentUser };
      },
      async signOut() {
        firebaseCurrentUser = null;
      },
    };

    const mockDoc = { dispatchEvent: () => {} };
    const mockWin = {
      document: mockDoc,
      location: { hostname: "staging.nailsbydivya.store", pathname: "/account.html" },
      localStorage: {
        getItem: (k) => storageData[k] || null,
        setItem: (k, v) => { storageData[k] = String(v); },
        removeItem: (k) => { delete storageData[k]; },
      },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      NAILS_CONFIG: {
        apiUrl: "https://nailsbydivya-staging-api.onrender.com",
        firebase: { apiKey: "AIzaSyDGxiI91qUyV4d9yegCPBg9lrWqKocaXX4", projectId: "nails-by-divya" },
      },
      firebase: { apps: [], initializeApp: () => ({}), auth: () => fakeFbAuth },
      NailsApi: {
        async requestEmailLoginLink(email) {
          return { status: "success", message: `Sent to ${email}` };
        },
        async verifyEmailLoginToken(token) {
          assert.strictEqual(token, "raw_single_use_tok");
          return {
            status: "success",
            customToken: "custom_firebase_tok_123",
            linkedOrdersCount: 2,
            linkedBookingsCount: 1,
            user: { id: "pg_u1", email: "meera@example.com", firebase_uid: "uid_email_1", profile: { full_name: "Meera" } },
          };
        },
        async getCurrentUser() {
          return { user: { id: "pg_u1", email: "meera@example.com", firebase_uid: "uid_email_1", profile: { full_name: "Meera" } } };
        },
      },
    };

    const ctx = vm.createContext({ window: mockWin, document: mockDoc, console, CustomEvent: class {}, setTimeout, clearTimeout });
    vm.runInContext(authSrc, ctx);
    const NailsAuth = ctx.window.NailsAuth;
    NailsAuth.init();

    const reqRes = await NailsAuth.requestEmailLink("Meera@Example.com");
    assert.strictEqual(reqRes.status, "success");

    const loginRes = await NailsAuth.verifyEmailLinkToken("raw_single_use_tok");
    assert.strictEqual(loginRes.success, true);
    assert.strictEqual(loginRes.linkedOrdersCount, 2);
    assert.strictEqual(loginRes.user.email, "meera@example.com");

    // Security check: localStorage must NOT contain JWT / customToken / auth tokens
    const rawSaved = storageData.NAILS_AUTH_SESSION_V1;
    assert(rawSaved, "Non-secret UI snapshot stored");
    assert(!rawSaved.includes("id_token_mem_only_999"), "ID token must NOT be persisted in localStorage");
    assert(!rawSaved.includes("custom_firebase_tok_123"), "Custom token must NOT be persisted in localStorage");
    assert(!rawSaved.includes("raw_single_use_tok"), "Single-use login token must NOT be persisted in localStorage");
    assert.strictEqual(JSON.parse(rawSaved).token, undefined, "Session snapshot must have no token field");

    // In-memory token retrieval works
    const tok = await NailsAuth.getToken();
    assert.strictEqual(tok, "id_token_mem_only_999");

    // Signout clears state cleanly
    await NailsAuth.signOut();
    assert.strictEqual(NailsAuth.isAuthenticated(), false);
    assert.strictEqual(storageData.NAILS_AUTH_SESSION_V1, undefined);
  });

  await test("4. account.html, account.js, and auth-modal.js integrate email magic-link UI and URL token stripping", () => {
    assert(accountHtmlSrc.includes('id="gate-email-form"'), "account.html has inline email login form");
    assert(accountHtmlSrc.includes('id="client-email-display"'), "account.html renders verified customer email");
    assert(accountJsSrc.includes("window.history.replaceState"), "account.js strips single-use token from URL bar");
    assert(accountJsSrc.includes("handleIncomingEmailMagicLink"), "account.js auto-verifies incoming magic links");
    assert(authModalSrc.includes('id="auth-step-email"'), "auth-modal.js includes primary email sign-in view");
    assert(authModalSrc.includes('id="auth-step-email-sent"'), "auth-modal.js includes check-inbox confirmation view");
  });

  console.log("\n==================================================================");
  console.log(`FRONTEND EMAIL AUTH RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
