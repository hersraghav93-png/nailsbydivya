/**
 * ==============================================================================
 * NAILS BY DIVYA — CLIENT AUTHENTICATION SERVICE (`auth.js`)
 * Nails by Divya Platform — Phase 1D
 *
 * Integrates Firebase Phone Authentication with graceful fallback:
 * - Real Mode: Uses Firebase Client SDK (Phone Auth with SMS OTP & Recaptcha)
 * - Demo Mode: When Firebase credentials are unconfigured, operates in a
 *   safe simulator mode allowing full UI & local backend testing without crashing.
 * ==============================================================================
 */

(function () {
  "use strict";

  const STORAGE_KEY = "NAILS_AUTH_SESSION_V1";
  const TEST_OTP_CODE = "123456";

  let firebaseApp = null;
  let firebaseAuth = null;
  let recaptchaVerifier = null;
  let confirmationResult = null;
  let isConfigured = false;
  let currentUser = null;
  let currentToken = null;
  let pendingPhone = null;

  const authChangeListeners = [];

  /**
   * Dispatches auth change notification to all registered listeners and window events.
   * @param {object|null} user
   */
  function notifyAuthChange(user) {
    currentUser = user;
    for (const listener of authChangeListeners) {
      try {
        listener(user);
      } catch (err) {
        console.error("Auth change listener error:", err);
      }
    }
    document.dispatchEvent(
      new CustomEvent("nails:auth-changed", {
        detail: { user, isAuthenticated: Boolean(user) },
      })
    );
  }

  /**
   * Saves current session snapshot to localStorage.
   */
  function persistSession() {
    if (currentUser && currentToken) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: currentUser,
            token: currentToken,
            savedAt: Date.now(),
          })
        );
      } catch (err) {
        console.warn("Could not save session to localStorage:", err);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /**
   * Restores cached session from localStorage on startup.
   */
  function restoreCachedSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.user && parsed.token) {
          currentUser = parsed.user;
          currentToken = parsed.token;
          notifyAuthChange(currentUser);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /**
   * Identifies whether the client is operating in a local development environment.
   * Simulator mode is strictly restricted to local development to prevent OTP bypasses in production.
   * @returns {boolean}
   */
  function isLocalEnvironment() {
    try {
      const host = (window.location && window.location.hostname) || "";
      const protocol = (window.location && window.location.protocol) || "";
      return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "" ||
        host.endsWith(".local") ||
        protocol === "file:"
      );
    } catch {
      return false;
    }
  }

  /**
   * Initializes the Firebase client SDK if credentials are provided.
   */
  function init() {
    const config = window.NAILS_CONFIG && window.NAILS_CONFIG.firebase;

    // Check if real Firebase config is provided
    if (
      config &&
      config.apiKey &&
      config.apiKey !== "your_firebase_web_api_key_here" &&
      config.projectId &&
      config.projectId !== "your_firebase_project_id" &&
      window.firebase
    ) {
      try {
        if (!window.firebase.apps.length) {
          firebaseApp = window.firebase.initializeApp(config);
        } else {
          firebaseApp = window.firebase.apps[0];
        }
        firebaseAuth = window.firebase.auth();
        isConfigured = true;

        // Listen to Firebase auth state changes
        firebaseAuth.onAuthStateChanged(async (fbUser) => {
          if (fbUser) {
            try {
              currentToken = await fbUser.getIdToken();
              // Synchronize with PostgreSQL backend
              if (window.NailsApi) {
                try {
                  const meRes = await window.NailsApi.getCurrentUser();
                  currentUser = (meRes && meRes.user) || {
                    id: fbUser.uid,
                    phone: fbUser.phoneNumber,
                    firebase_uid: fbUser.uid,
                  };
                } catch {
                  currentUser = {
                    id: fbUser.uid,
                    phone: fbUser.phoneNumber,
                    firebase_uid: fbUser.uid,
                  };
                }
              } else {
                currentUser = {
                  id: fbUser.uid,
                  phone: fbUser.phoneNumber,
                  firebase_uid: fbUser.uid,
                };
              }
              persistSession();
              notifyAuthChange(currentUser);
            } catch (err) {
              console.error("Firebase auth sync error:", err);
            }
          } else {
            currentToken = null;
            currentUser = null;
            persistSession();
            notifyAuthChange(null);
          }
        });

        console.log("🔥 [NailsAuth] Initialized with real Firebase Phone Auth.");
        return;
      } catch (err) {
        console.warn("⚠️ [NailsAuth] Firebase initialization failed:", err.message);
      }
    }

    // Default: Simulator / Demo mode (strictly gated to local development)
    isConfigured = false;
    restoreCachedSession();

    if (isLocalEnvironment()) {
      console.log(
        "✨ [NailsAuth] Local development detected: Running in Simulator mode. " +
        "Use any 10-digit number and OTP '123456' to test the full UI & local backend integration."
      );
    } else {
      console.warn(
        "⚠️ [NailsAuth] Production environment detected without Firebase configuration. " +
        "Simulator mode is strictly disabled in production. Real SMS authentication requires valid credentials."
      );
    }
  }

  const NailsAuth = {
    /**
     * Initializes the authentication client.
     */
    init() {
      init();
    },

    /**
     * Indicates whether the client is operating in a local development environment.
     * @returns {boolean}
     */
    isLocalEnvironment() {
      return isLocalEnvironment();
    },

    /**
     * Indicates whether real Firebase Auth credentials are active.
     * @returns {boolean}
     */
    isConfigured() {
      return isConfigured;
    },

    /**
     * Returns true if a customer is currently signed in.
     * @returns {boolean}
     */
    isAuthenticated() {
      return Boolean(currentUser);
    },

    /**
     * Returns current customer user profile.
     * @returns {object|null}
     */
    getUser() {
      return currentUser;
    },

    /**
     * Retrieves current valid Firebase ID token for Authorization header.
     * @returns {Promise<string|null>}
     */
    async getToken() {
      if (isConfigured && firebaseAuth && firebaseAuth.currentUser) {
        try {
          currentToken = await firebaseAuth.currentUser.getIdToken(true);
          return currentToken;
        } catch (err) {
          console.warn("Failed refreshing Firebase token:", err.message);
        }
      }
      return currentToken;
    },

    /**
     * Subscribes to authentication state changes.
     * @param {(user: object|null) => void} callback
     */
    onAuthChange(callback) {
      if (typeof callback === "function") {
        authChangeListeners.push(callback);
        // Fire immediately with current state
        callback(currentUser);
      }
    },

    /**
     * Formats 10-digit Indian mobile number to E.164 (+91XXXXXXXXXX).
     * @param {string} phone
     * @returns {string}
     */
    formatPhone(phone) {
      if (!phone || typeof phone !== "string") return "";
      const digits = phone.replace(/\D/g, "");
      if (digits.length === 10) {
        return `+91${digits}`;
      }
      if (digits.length === 12 && digits.startsWith("91")) {
        return `+${digits}`;
      }
      return phone.trim();
    },

    /**
     * Sends verification SMS OTP to Indian phone number.
     *
     * @param {string} rawPhone 10-digit phone number or E.164
     * @param {HTMLElement|string} [recaptchaContainer] Container element or ID for Recaptcha
     * @returns {Promise<{ success: boolean, isDemo: boolean, phone: string }>}
     */
    async sendOtp(rawPhone, recaptchaContainer = "recaptcha-container") {
      const formatted = this.formatPhone(rawPhone);
      const cleanDigits = rawPhone.replace(/\D/g, "");

      if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
        const err = new Error("Please enter a valid 10-digit Indian mobile number.");
        err.code = "INVALID_PHONE";
        throw err;
      }

      pendingPhone = formatted;

      // 1. Live Firebase Phone Auth
      if (isConfigured && firebaseAuth) {
        try {
          if (!recaptchaVerifier) {
            recaptchaVerifier = new window.firebase.auth.RecaptchaVerifier(recaptchaContainer, {
              size: "invisible",
              callback: () => {
                // reCAPTCHA solved
              },
            });
          }

          confirmationResult = await firebaseAuth.signInWithPhoneNumber(formatted, recaptchaVerifier);
          return { success: true, isDemo: false, phone: formatted };
        } catch (fbErr) {
          if (recaptchaVerifier && typeof recaptchaVerifier.clear === "function") {
            try {
              recaptchaVerifier.clear();
              recaptchaVerifier = null;
            } catch {
              // Ignore cleanup error
            }
          }

          let message = fbErr.message || "Failed to send SMS verification code.";
          if (fbErr.code === "auth/too-many-requests") {
            message = "Too many requests. Please wait a few minutes before requesting another code.";
          } else if (fbErr.code === "auth/invalid-phone-number") {
            message = "The phone number format is invalid.";
          }

          const err = new Error(message);
          err.code = fbErr.code || "SEND_OTP_FAILED";
          throw err;
        }
      }

      // 2. Demo / Simulator Mode (strictly restricted to local development)
      if (!isLocalEnvironment()) {
        const err = new Error(
          "SMS authentication is currently undergoing maintenance. Please reach out to Nails by Divya directly via WhatsApp for enquiries and bookings."
        );
        err.code = "AUTH_UNAVAILABLE";
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, 600)); // Simulate brief network delay
      confirmationResult = {
        isDemo: true,
        phone: formatted,
        async confirm(code) {
          if (!isLocalEnvironment()) {
            const err = new Error("Simulator authentication is strictly prohibited outside of local development.");
            err.code = "auth/operation-not-allowed";
            throw err;
          }
          if (code === TEST_OTP_CODE || code === "123456") {
            return {
              user: {
                uid: `demo_cust_${cleanDigits}`,
                phoneNumber: formatted,
                async getIdToken() {
                  return `demo_token_for_${cleanDigits}`;
                },
              },
            };
          }
          const err = new Error("Incorrect verification code. For local dev mode, enter '123456'.");
          err.code = "auth/invalid-verification-code";
          throw err;
        },
      };

      return { success: true, isDemo: true, phone: formatted, testCode: TEST_OTP_CODE };
    },

    /**
     * Verifies the 6-digit OTP code.
     *
     * @param {string} code 6-digit OTP string
     * @returns {Promise<{ success: boolean, user: object }>}
     */
    async verifyOtp(code) {
      if (!confirmationResult) {
        const err = new Error("No active verification session. Please request a new code.");
        err.code = "NO_SESSION";
        throw err;
      }

      // Security check: Simulator mode must never authenticate in production
      if (confirmationResult.isDemo && !isLocalEnvironment()) {
        const err = new Error("Simulator authentication is strictly prohibited outside of local development.");
        err.code = "auth/operation-not-allowed";
        throw err;
      }

      const cleanCode = (code || "").trim();
      if (!/^\d{6}$/.test(cleanCode)) {
        const err = new Error("Please enter the complete 6-digit verification code.");
        err.code = "INVALID_CODE_FORMAT";
        throw err;
      }

      try {
        const result = await confirmationResult.confirm(cleanCode);
        const fbUser = result.user;
        currentToken = await fbUser.getIdToken();

        // Sync with PostgreSQL backend if available
        if (window.NailsApi) {
          try {
            const meRes = await window.NailsApi.getCurrentUser();
            currentUser = (meRes && meRes.user) || {
              id: fbUser.uid,
              phone: fbUser.phoneNumber || pendingPhone,
              firebase_uid: fbUser.uid,
            };
          } catch {
            currentUser = {
              id: fbUser.uid,
              phone: fbUser.phoneNumber || pendingPhone,
              firebase_uid: fbUser.uid,
              profile: { full_name: "Customer" },
            };
          }
        } else {
          currentUser = {
            id: fbUser.uid,
            phone: fbUser.phoneNumber || pendingPhone,
            firebase_uid: fbUser.uid,
            profile: { full_name: "Customer" },
          };
        }

        persistSession();
        notifyAuthChange(currentUser);
        confirmationResult = null;
        pendingPhone = null;

        return { success: true, user: currentUser };
      } catch (confirmErr) {
        let message = confirmErr.message || "Invalid verification code.";
        if (confirmErr.code === "auth/invalid-verification-code") {
          message = "Incorrect verification code. Please check and try again.";
        } else if (confirmErr.code === "auth/code-expired") {
          message = "Verification code has expired. Please request a new code.";
        }

        const err = new Error(message);
        err.code = confirmErr.code || "VERIFY_FAILED";
        throw err;
      }
    },

    /**
     * Signs out the user and clears all cached sessions.
     * @returns {Promise<void>}
     */
    async signOut() {
      if (isConfigured && firebaseAuth) {
        try {
          await firebaseAuth.signOut();
        } catch (err) {
          console.warn("Firebase sign out error:", err);
        }
      }

      currentUser = null;
      currentToken = null;
      confirmationResult = null;
      pendingPhone = null;
      persistSession();
      notifyAuthChange(null);
    },
  };

  window.NailsAuth = NailsAuth;
})();
