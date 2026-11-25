/**
 * ==============================================================================
 * NAILS BY DIVYA — STAGING FIREBASE RUNTIME CONFIGURATION TEMPLATE
 * (`firebase-config.staging.example.js`)
 * Nails by Divya Platform — Phase 4A Staging Integration
 * ==============================================================================
 *
 * Setup Instructions:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Select your staging project (e.g., 'nails-by-divya-staging').
 * 3. Open Project Settings -> General -> Your apps -> Web app.
 * 4. Copy the public configuration object properties below.
 * 5. Under Authentication -> Sign-in method:
 *    - Customer login uses backend-issued Firebase Custom Tokens from Resend magic links.
 *    - Enable Email/Password and Google providers for isolated staging Admin portal testing.
 * 6. Under Authentication -> Settings -> Authorized domains:
 *    - Add `staging.nailsbydivya.store`
 *    - Add `staging-admin.nailsbydivya.store`
 *    - Add `*.pages.dev` (Cloudflare Pages preview deployments)
 *    - Add `localhost`
 * 7. Populate STAGING_FIREBASE_CONFIG in `firebase-config.js` on your staging branch (keeping PRODUCTION_FIREBASE_CONFIG untouched).
 */

window.NAILS_CONFIG = window.NAILS_CONFIG || {
  // Staging Express Backend API URL (Isolated Staging Backend on Render)
  apiUrl: (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://nailsbydivya-staging-api.onrender.com",

  // Staging Firebase Web App Identifiers (Public)
  firebase: {
    apiKey: "AIzaSy_YOUR_STAGING_API_KEY_HERE",
    authDomain: "nails-by-divya-staging.firebaseapp.com",
    projectId: "nails-by-divya-staging",
    storageBucket: "nails-by-divya-staging.firebasestorage.app",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890",
  },
};
