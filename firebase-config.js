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

  const resolvedApiUrl = resolveApiUrl(
    typeof window !== "undefined" && window.location ? window.location.hostname : ""
  );

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
      firebase: {
        apiKey:
          (typeof window !== "undefined" && window.__ENV__ && window.__ENV__.FIREBASE_API_KEY) ||
          existingFirebase.apiKey ||
          "AIzaSyDGxiI91qUyV4d9yegCPBg9lrWqKocaXX4",
        authDomain:
          existingFirebase.authDomain || "nails-by-divya.firebaseapp.com",
        projectId:
          existingFirebase.projectId || "nails-by-divya",
        storageBucket:
          existingFirebase.storageBucket || "nails-by-divya.firebasestorage.app",
        messagingSenderId:
          existingFirebase.messagingSenderId || "868470074827",
        appId:
          (typeof window !== "undefined" && window.__ENV__ && window.__ENV__.FIREBASE_APP_ID) ||
          existingFirebase.appId ||
          "1:868470074827:web:5dcfc99ffee2a4bc6c1a4e",
        measurementId:
          existingFirebase.measurementId || "G-WD4KQWS8DX",
      },
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { resolveApiUrl };
  }
})();
