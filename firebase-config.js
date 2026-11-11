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

window.NAILS_CONFIG = window.NAILS_CONFIG || {
  // Backend Express API URL (Local, Staging, or Production)
  apiUrl: (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : (window.location.hostname.includes("staging") || window.location.hostname.includes("preview")
        ? "https://staging-api.nailsbydivya.store"
        : "https://nails-ai-backend.onrender.com"),

  // Firebase Web App Configuration (Populate from Firebase Console in staging/prod)
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  },
};
