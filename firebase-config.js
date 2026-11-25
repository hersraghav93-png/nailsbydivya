/**
 * ==============================================================================
 * NAILS BY DIVYA — FIREBASE CLIENT RUNTIME CONFIGURATION (`firebase-config.js`)
 * Public Web App Configuration for Firebase Phone Authentication.
 * ==============================================================================
 * Found in: Firebase Console -> Project Settings -> General -> Your apps -> Web app
 *
 * NOTE:
 * - These are public client-side identifiers for the web browser.
 * - NEVER put Firebase Admin private keys or service account credentials here.
 * - When configured with valid credentials, real Firebase Phone Auth & SMS OTP are enabled.
 * - When empty (default), the website runs in an elegant demo/test mode allowing
 *   full UI and local backend interaction without crashing.
 */

(function () {
  /**
   * Resolves the active backend API base URL.
   * Explicitly maps local, staging, and production environments.
   * Unknown/unrecognized hostnames fail closed and never fall back to production.
   * @param {string} [hostname]
   * @returns {string|null}
   */
  function resolveApiUrl(hostname) {
    const host = (
      hostname ||
      (typeof window !== "undefined" && window.location ? window.location.hostname : "") ||
      ""
    ).toLowerCase().trim();

    // 1. Local Development
    if (host === "localhost" || host === "127.0.0.1" || host === "") {
      return "http://localhost:3000";
    }

    // 2. Explicit Staging & Preview Environments
    if (
      host === "staging.nailsbydivya.store" ||
      host === "preview.nailsbydivya.store" ||
      host === "staging-admin.nailsbydivya.store" ||
      host.endsWith(".pages.dev") ||
      host === "pages.dev" ||
      host.includes("staging") ||
      host.includes("preview")
    ) {
      return "https://nailsbydivya-staging-api.onrender.com";
    }

    // 3. Explicit Production Website
    if (host === "nailsbydivya.store" || host === "www.nailsbydivya.store") {
      return "https://nails-ai-backend.onrender.com";
    }

    // 4. Fail closed on unknown/unrecognized hostnames (Never fall back to production)
    console.error(
      `[Nails Config] Unrecognized environment hostname: "${host}". Refusing to route to production backend.`
    );
    return null;
  }

  /**
   * Resolves whether the current hostname belongs to an isolated staging or local environment.
   * Production domains always return false.
   * @param {string} [hostname]
   * @returns {boolean}
   */
  function isStagingOrLocalHost(hostname) {
    const host = (
      hostname ||
      (typeof window !== "undefined" && window.location ? window.location.hostname : "") ||
      ""
    ).toLowerCase().trim();

    if (host === "nailsbydivya.store" || host === "www.nailsbydivya.store") {
      return false;
    }

    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "" ||
      host === "staging.nailsbydivya.store" ||
      host === "preview.nailsbydivya.store" ||
      host === "staging-admin.nailsbydivya.store" ||
      host.endsWith(".pages.dev") ||
      host === "pages.dev" ||
      host.includes("staging") ||
      host.includes("preview")
    );
  }

  // Public Production Firebase Web App Config (nailsbydivya.store — NEVER alter for staging)
  const PRODUCTION_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDGxiI91qUyV4d9yegCPBg9lrWqKocaXX4",
    authDomain: "nails-by-divya.firebaseapp.com",
    projectId: "nails-by-divya",
    storageBucket: "nails-by-divya.firebasestorage.app",
    messagingSenderId: "868470074827",
    appId: "1:868470074827:web:5dcfc99ffee2a4bc6c1a4e",
    measurementId: "G-WD4KQWS8DX",
  };

  // Dedicated Staging Firebase Web App Config slot (populate with `nails-by-divya-staging` public Web App identifiers)
  const STAGING_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAASz88q9XYpqycDRN8amnynJF0FJGAwFo",
    authDomain: "nails-by-divya-staging.firebaseapp.com",
    projectId: "nails-by-divya-staging",
    storageBucket: "nails-by-divya-staging.firebasestorage.app",
    messagingSenderId: "283237857703",
    appId: "1:283237857703:web:1eaba5fc2675f477a4de82",
    measurementId: "",
  };

  /**
   * Resolves the environment-appropriate public Firebase Web App config.
   * Production always resolves strictly to PRODUCTION_FIREBASE_CONFIG.
   * Staging/Preview resolves to STAGING_FIREBASE_CONFIG / STAGING_FIREBASE_* env overrides when populated.
   */
  function resolveFirebaseConfig(hostname, env = {}, existingFirebase = {}) {
    const isStaging = isStagingOrLocalHost(hostname);

    if (!isStaging) {
      return {
        apiKey: env.FIREBASE_API_KEY || existingFirebase.apiKey || PRODUCTION_FIREBASE_CONFIG.apiKey,
        authDomain: existingFirebase.authDomain || PRODUCTION_FIREBASE_CONFIG.authDomain,
        projectId: existingFirebase.projectId || PRODUCTION_FIREBASE_CONFIG.projectId,
        storageBucket: existingFirebase.storageBucket || PRODUCTION_FIREBASE_CONFIG.storageBucket,
        messagingSenderId: existingFirebase.messagingSenderId || PRODUCTION_FIREBASE_CONFIG.messagingSenderId,
        appId: env.FIREBASE_APP_ID || existingFirebase.appId || PRODUCTION_FIREBASE_CONFIG.appId,
        measurementId: existingFirebase.measurementId || PRODUCTION_FIREBASE_CONFIG.measurementId,
      };
    }

    const stagingApiKey = env.STAGING_FIREBASE_API_KEY || STAGING_FIREBASE_CONFIG.apiKey;
    const stagingProjectId = env.STAGING_FIREBASE_PROJECT_ID || STAGING_FIREBASE_CONFIG.projectId;
    const stagingAppId = env.STAGING_FIREBASE_APP_ID || STAGING_FIREBASE_CONFIG.appId;

    if (stagingApiKey && stagingProjectId && stagingAppId) {
      return {
        apiKey: stagingApiKey,
        authDomain: env.STAGING_FIREBASE_AUTH_DOMAIN || STAGING_FIREBASE_CONFIG.authDomain || `${stagingProjectId}.firebaseapp.com`,
        projectId: stagingProjectId,
        storageBucket: env.STAGING_FIREBASE_STORAGE_BUCKET || STAGING_FIREBASE_CONFIG.storageBucket || `${stagingProjectId}.firebasestorage.app`,
        messagingSenderId: env.STAGING_FIREBASE_MESSAGING_SENDER_ID || STAGING_FIREBASE_CONFIG.messagingSenderId || "",
        appId: stagingAppId,
        measurementId: env.STAGING_FIREBASE_MEASUREMENT_ID || STAGING_FIREBASE_CONFIG.measurementId || "",
      };
    }

    return {
      apiKey: existingFirebase.apiKey || env.FIREBASE_API_KEY || PRODUCTION_FIREBASE_CONFIG.apiKey,
      authDomain: existingFirebase.authDomain || PRODUCTION_FIREBASE_CONFIG.authDomain,
      projectId: existingFirebase.projectId || PRODUCTION_FIREBASE_CONFIG.projectId,
      storageBucket: existingFirebase.storageBucket || PRODUCTION_FIREBASE_CONFIG.storageBucket,
      messagingSenderId: existingFirebase.messagingSenderId || PRODUCTION_FIREBASE_CONFIG.messagingSenderId,
      appId: existingFirebase.appId || env.FIREBASE_APP_ID || PRODUCTION_FIREBASE_CONFIG.appId,
      measurementId: existingFirebase.measurementId || PRODUCTION_FIREBASE_CONFIG.measurementId,
    };
  }

  const currentHostname =
    typeof window !== "undefined" && window.location ? window.location.hostname : "";
  const resolvedApiUrl = resolveApiUrl(currentHostname);

  if (typeof window !== "undefined") {
    const env =
      (typeof window !== "undefined" && (window.__ENV__ || (window.process && window.process.env))) ||
      {};
    const existingConfig = (typeof window !== "undefined" && window.NAILS_CONFIG) || {};
    const existingFirebase = existingConfig.firebase || {};

    window.NAILS_CONFIG = {
      ...existingConfig,

      // Backend Express API URL (Local, Staging, or Production)
      apiUrl: existingConfig.apiUrl || resolvedApiUrl,

      // Dedicated Nails by Divya Business Configuration (Single Source of Truth)
      business: {
        phone: "+91 84473 91310",
        phoneRaw: "918447391310",
        phoneFormatted: "+91 84473 91310",
        whatsappUrl: "https://wa.me/918447391310",
        email: "Nailsbydivyaa@gmail.com",
        brandName: "Nails by Divya",
        ...(existingConfig.business || {}),
      },

      // Firebase Web App Configuration (Public Web Client Identifiers)
      firebase: resolveFirebaseConfig(currentHostname, env, existingFirebase),
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { resolveApiUrl, isStagingOrLocalHost, resolveFirebaseConfig, PRODUCTION_FIREBASE_CONFIG };
  }
})();
