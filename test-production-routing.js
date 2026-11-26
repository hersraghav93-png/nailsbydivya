const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { resolveApiUrl, resolveFirebaseConfig } = require("./firebase-config");
const { NailsApi, resolveBackendApiUrl } = require("./account-api");

const productionBackend = "https://nails-ai-backend.onrender.com";
const localBackend = "http://localhost:3000";

test("Both production domains use the production API and Firebase project", () => {
  for (const host of ["nailsbydivya.store", "www.nailsbydivya.store", " NAILSBYDIVYA.STORE "]) {
    assert.equal(resolveApiUrl(host), productionBackend);
    assert.equal(resolveBackendApiUrl(host), productionBackend);
    assert.equal(NailsApi.getBaseUrl(host), productionBackend);
    const firebase = resolveFirebaseConfig(host);
    assert.equal(firebase.projectId, "nails-by-divya");
    assert.equal(firebase.authDomain, "nails-by-divya.firebaseapp.com");
    assert.ok(firebase.apiKey && firebase.appId);
  }
});

test("Local development retains local API routing", () => {
  for (const host of ["localhost", "127.0.0.1", ""]) {
    assert.equal(resolveApiUrl(host), localBackend);
    assert.equal(resolveBackendApiUrl(host), localBackend);
    assert.equal(resolveFirebaseConfig(host), null);
  }
});

test("Other hosts do not get an API or Firebase configuration", () => {
  for (const host of ["example.invalid", "another.nailsbydivya.store", "nailsbydivya.store.example.invalid"]) {
    assert.equal(resolveApiUrl(host), null);
    assert.throws(() => resolveBackendApiUrl(host), /unrecognized environment hostname/i);
    assert.equal(resolveFirebaseConfig(host), null);
  }
});

test("The browser bootstrap pins production and discards injected service settings", () => {
  const source = fs.readFileSync(path.join(__dirname, "firebase-config.js"), "utf8");
  for (const host of ["nailsbydivya.store", "other.example.invalid"]) {
    const window = {
      location: { hostname: host },
      __ENV__: { FIREBASE_API_KEY: "fixture", FIREBASE_APP_ID: "fixture" },
      NAILS_CONFIG: { apiUrl: "https://example.invalid", firebase: { projectId: "other-project" } },
    };
    vm.runInNewContext(source, { window });
    assert.equal(window.NAILS_CONFIG.apiUrl, resolveApiUrl(host));
    assert.equal(JSON.stringify(window.NAILS_CONFIG.firebase), JSON.stringify(resolveFirebaseConfig(host)));
    assert.equal(Boolean(window.NAILS_CONFIG.firebaseError), host !== "nailsbydivya.store");
  }
});

test("Each public page and the admin portal load configuration before the API client", () => {
  for (const file of fs.readdirSync(__dirname).filter(file => file.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(__dirname, file), "utf8");
    const configuration = html.indexOf('src="firebase-config.js?');
    const accountApi = html.indexOf('src="account-api.js?');
    const consumer = html.search(/src="(?:script|admin)\.js\?/);
    assert.ok(configuration >= 0 && configuration < accountApi && accountApi < consumer, file);
  }
});
