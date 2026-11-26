/**
 * Public browser configuration for Nails by Divya.
 * Never put Firebase Admin credentials in this file.
 */
(function () {
  function isProductionHost(hostname) {
    const host = (hostname || "").toLowerCase().trim();
    return host === "nailsbydivya.store" || host === "www.nailsbydivya.store";
  }

  function resolveApiUrl(hostname) {
    const host = (hostname || "").toLowerCase().trim();
    if (isProductionHost(host)) return "https://nails-ai-backend.onrender.com";
    if (host === "localhost" || host === "127.0.0.1" || host === "") return "http://localhost:3000";
    return null;
  }

  // Public Firebase Web App identifiers for the production site.
  const PRODUCTION_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDGxiI91qUyV4d9yegCPBg9lrWqKocaXX4",
    authDomain: "nails-by-divya.firebaseapp.com",
    projectId: "nails-by-divya",
    storageBucket: "nails-by-divya.firebasestorage.app",
    messagingSenderId: "868470074827",
    appId: "1:868470074827:web:5dcfc99ffee2a4bc6c1a4e",
    measurementId: "G-WD4KQWS8DX",
  };

  function resolveFirebaseConfig(hostname) {
    return isProductionHost(hostname) ? { ...PRODUCTION_FIREBASE_CONFIG } : null;
  }

  if (typeof window !== "undefined") {
    const hostname = window.location?.hostname;
    const existingConfig = window.NAILS_CONFIG || {};
    const firebase = resolveFirebaseConfig(hostname);

    window.NAILS_CONFIG = {
      ...existingConfig,
      apiUrl: resolveApiUrl(hostname),

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

      firebase,
      firebaseError: firebase ? null : "Sign-in is unavailable on this hostname.",
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { resolveApiUrl, resolveFirebaseConfig, PRODUCTION_FIREBASE_CONFIG };
  }
})();
