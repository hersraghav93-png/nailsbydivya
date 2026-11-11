/**
 * ==============================================================================
 * NAILS BY DIVYA — FIREBASE CLIENT RUNTIME CONFIGURATION TEMPLATE
 * (`firebase-config.example.js`)
 * ==============================================================================
 * Copy this file to `firebase-config.js` and populate with your project credentials:
 *
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Open Project Settings -> General -> Your apps -> Web app
 * 3. Copy the firebaseConfig object properties below.
 * 4. Enable Phone Authentication in Firebase Console:
 *    Authentication -> Sign-in method -> Phone -> Enable.
 * 5. Add your domain (e.g. localhost, nailsbydivya.store) to:
 *    Authentication -> Settings -> Authorized domains.
 */

window.NAILS_CONFIG = window.NAILS_CONFIG || {
  apiUrl: "http://localhost:5000",
  firebase: {
    apiKey: "AIzaSyYourFirebaseApiKeyHere",
    authDomain: "nails-by-divya.firebaseapp.com",
    projectId: "nails-by-divya",
    storageBucket: "nails-by-divya.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890",
  },
};
