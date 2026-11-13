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
  let isBillingDisabledState = false;
  let currentUser = null;
  let currentToken = null;
  let pendingPhone = null;

  const authChangeListeners = [];

  /**
   * Centralized mapping of Firebase Auth and network errors to clean, truthful,
   * human-readable messages. Never claims an SMS was sent when the request failed.
   *
   * @param {any} err
   * @returns {{
   *   code: string,
   *   isBillingDisabled: boolean,
   *   isBlockedPolicy: boolean,
   *   isQuotaExceeded: boolean,
   *   isRateLimited: boolean,
   *   userMessage: string,
   *   technicalDetail: string
   * }}
   */
  function mapAuthError(err) {
    if (!err) {
      return {
        code: "UNKNOWN_ERROR",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage: "Phone verification is temporarily unavailable. Please try again later.",
        technicalDetail: "",
      };
    }

    const code = String(err.code || "");
    const rawMsg = String(err.message || "");
    const customData = err.customData || {};
    const serverResponse = typeof customData.serverResponse === "string" ? customData.serverResponse : "";
    let stringified = "";
    try {
      stringified = JSON.stringify(err);
    } catch {}

    const combinedUpper = `${code} ${rawMsg} ${serverResponse} ${stringified}`.toUpperCase();

    // 1. BILLING NOT ENABLED (Google Cloud Identity Platform telecom billing requirement)
    if (
      err.isBillingDisabled ||
      code === "BILLING_NOT_ENABLED" ||
      code === "auth/billing-not-enabled" ||
      combinedUpper.includes("BILLING_NOT_ENABLED") ||
      combinedUpper.includes("BILLING-NOT-ENABLED") ||
      combinedUpper.includes("BILLING NOT ENABLED")
    ) {
      return {
        code: "BILLING_NOT_ENABLED",
        isBillingDisabled: true,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage:
          "Phone verification is temporarily unavailable: SMS billing (Blaze plan) is not enabled on this environment. Verification codes cannot be sent at this time.",
        technicalDetail: "Google Identity Platform returned 400 Bad Request BILLING_NOT_ENABLED.",
      };
    }

    // 2. OPERATION NOT ALLOWED (e.g. Region not permitted or Phone Auth provider disabled)
    if (
      code === "auth/operation-not-allowed" ||
      combinedUpper.includes("OPERATION_NOT_ALLOWED")
    ) {
      return {
        code: "OPERATION_NOT_ALLOWED",
        isBillingDisabled: false,
        isBlockedPolicy: true,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage:
          "Phone verification is temporarily unavailable for this region (+91) due to project policy. Please contact studio administration.",
        technicalDetail: "Firebase SMS region policy or provider is disabled.",
      };
    }

    // 3. QUOTA EXCEEDED
    if (
      code === "auth/quota-exceeded" ||
      combinedUpper.includes("QUOTA_EXCEEDED") ||
      combinedUpper.includes("EXCEEDED_QUOTA")
    ) {
      return {
        code: "QUOTA_EXCEEDED",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: true,
        isRateLimited: false,
        userMessage:
          "Daily SMS verification limit reached. No verification code was sent. Please try again tomorrow or contact studio administration.",
        technicalDetail: "Firebase SMS daily tier quota exceeded.",
      };
    }

    // 4. TOO MANY REQUESTS
    if (
      code === "auth/too-many-requests" ||
      combinedUpper.includes("TOO_MANY_ATTEMPTS") ||
      combinedUpper.includes("TOO_MANY_REQUESTS")
    ) {
      return {
        code: "TOO_MANY_REQUESTS",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: true,
        userMessage:
          "Too many verification requests. Please wait a few minutes before requesting another code.",
        technicalDetail: "Firebase rate limit triggered.",
      };
    }

    // 5. INVALID PHONE NUMBER
    if (
      code === "auth/invalid-phone-number" ||
      code === "INVALID_PHONE" ||
      combinedUpper.includes("INVALID_PHONE_NUMBER")
    ) {
      return {
        code: "INVALID_PHONE",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage: "The mobile number format is invalid. Please enter a valid 10-digit Indian phone number.",
        technicalDetail: rawMsg,
      };
    }

    // 6. CAPTCHA / RECAPTCHA FAILED
    if (
      code === "auth/captcha-check-failed" ||
      combinedUpper.includes("CAPTCHA_CHECK_FAILED")
    ) {
      return {
        code: "CAPTCHA_CHECK_FAILED",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage: "Security verification (reCAPTCHA) could not be completed. Please refresh the page and try again.",
        technicalDetail: rawMsg,
      };
    }

    // 7. NETWORK / CONNECTIVITY ERROR
    if (
      code === "auth/network-request-failed" ||
      combinedUpper.includes("NETWORK_REQUEST_FAILED")
    ) {
      return {
        code: "NETWORK_ERROR",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage: "Network connection error. Unable to connect to verification servers. Please check your internet connection.",
        technicalDetail: rawMsg,
      };
    }

    // 8. INVALID OTP CODE
    if (
      code === "auth/invalid-verification-code" ||
      combinedUpper.includes("INVALID_VERIFICATION_CODE")
    ) {
      return {
        code: "INVALID_OTP",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage: "Incorrect verification code. Please check the 6-digit code and try again.",
        technicalDetail: rawMsg,
      };
    }

    // 9. CODE / SESSION EXPIRED
    if (
      code === "auth/code-expired" ||
      code === "auth/session-expired" ||
      combinedUpper.includes("CODE_EXPIRED") ||
      combinedUpper.includes("SESSION_EXPIRED")
    ) {
      return {
        code: "CODE_EXPIRED",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage: "The verification code or session has expired. Please enter your number to request a new code.",
        technicalDetail: rawMsg,
      };
    }

    // 10. AUTH UNAVAILABLE (Maintenance / unconfigured)
    if (code === "AUTH_UNAVAILABLE" || combinedUpper.includes("MAINTENANCE")) {
      return {
        code: "AUTH_UNAVAILABLE",
        isBillingDisabled: false,
        isBlockedPolicy: false,
        isQuotaExceeded: false,
        isRateLimited: false,
        userMessage:
          "Phone verification is temporarily offline for maintenance. Please reach out to Nails by Divya directly via WhatsApp for enquiries and bookings.",
        technicalDetail: rawMsg,
      };
    }

    // Default
    return {
      code: code || "AUTH_FAILED",
      isBillingDisabled: false,
      isBlockedPolicy: false,
      isQuotaExceeded: false,
      isRateLimited: false,
      userMessage: rawMsg || "Phone verification is temporarily unavailable. Please try again later.",
      technicalDetail: rawMsg,
    };
  }

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
   * Helper to safely access browser localStorage.
   */
  function getLocalStorage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
      if (typeof localStorage !== "undefined") return localStorage;
    } catch {}
    return null;
  }

  /**
   * Saves current session snapshot to localStorage.
   */
  function persistSession() {
    const storage = getLocalStorage();
    if (!storage) return;

    if (currentUser && currentToken) {
      try {
        storage.setItem(
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
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }

  /**
   * Restores cached session from localStorage on startup.
   */
  function restoreCachedSession() {
    const storage = getLocalStorage();
    if (!storage) return;

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.user && parsed.token) {
          currentUser = parsed.user;
          currentToken = parsed.token;
          notifyAuthChange(currentUser);
        }
      }
    } catch {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {}
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
    // Prevent duplicate Firebase initialization
    if (isConfigured && firebaseApp && firebaseAuth) {
      return;
    }

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

        // Restore cached session immediately from localStorage for instant UI responsiveness
        restoreCachedSession();

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
     * Alias for isAuthenticated() for admin/storefront session compatibility.
     * @returns {boolean}
     */
    isLoggedIn() {
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
     * Only resolves successfully if Firebase confirms acceptance of the SMS request.
     * Never claims an SMS was sent if the provider rejected or failed.
     *
     * @param {string} rawPhone 10-digit phone number or E.164
     * @param {HTMLElement|string} [recaptchaContainer] Container element or ID for Recaptcha
     * @returns {Promise<{ success: boolean, isDemo: boolean, phone: string, confirmationResult: object }>}
     */
    async sendOtp(rawPhone, recaptchaContainer = "recaptcha-container") {
      const formatted = this.formatPhone(rawPhone);
      const cleanDigits = rawPhone.replace(/\D/g, "");

      if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
        const err = new Error("Please enter a valid 10-digit Indian mobile number.");
        err.code = "INVALID_PHONE";
        throw err;
      }

      // Auto-initialize if not yet configured
      if (!isConfigured) {
        init();
      }

      // Safeguard: Prevent repeated futile requests if billing was already reported disabled
      if (isBillingDisabledState) {
        const err = new Error(
          "Phone verification is temporarily unavailable: SMS billing (Blaze plan) is not enabled on this environment. Verification codes cannot be sent at this time."
        );
        err.code = "BILLING_NOT_ENABLED";
        err.isBillingDisabled = true;
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
          if (!confirmationResult || typeof confirmationResult.confirm !== "function") {
            throw new Error("SMS verification request was not confirmed by provider.");
          }
          return { success: true, isDemo: false, phone: formatted, confirmationResult };
        } catch (fbErr) {
          if (recaptchaVerifier && typeof recaptchaVerifier.clear === "function") {
            try {
              recaptchaVerifier.clear();
              recaptchaVerifier = null;
            } catch {
              // Ignore cleanup error
            }
          }

          const mapped = mapAuthError(fbErr);
          if (mapped.isBillingDisabled) {
            isBillingDisabledState = true;
          }

          const err = new Error(mapped.userMessage);
          err.code = mapped.code;
          err.isBillingDisabled = mapped.isBillingDisabled;
          err.isBlockedPolicy = mapped.isBlockedPolicy;
          err.isQuotaExceeded = mapped.isQuotaExceeded;
          err.isRateLimited = mapped.isRateLimited;
          err.technicalDetail = mapped.technicalDetail;
          err.originalError = fbErr;
          throw err;
        }
      }

      // 2. Unconfigured / offline environment: strictly fail closed with clear truthful message
      const err = new Error(
        "Phone verification is temporarily unavailable: authentication service is not configured. Please contact Nails by Divya directly via WhatsApp for enquiries and bookings."
      );
      err.code = "AUTH_UNAVAILABLE";
      throw err;
    },

    /**
     * Verifies the 6-digit OTP code.
     *
     * @param {string} code 6-digit OTP string
     * @returns {Promise<{ success: boolean, user: object }>}
     */
    async verifyOtp(code) {
      if (!confirmationResult || typeof confirmationResult.confirm !== "function") {
        const err = new Error("No active verification session. Please enter your mobile number to request a new code.");
        err.code = "NO_SESSION";
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

        // Sync with PostgreSQL backend if available (links UID and resolves roles/profile)
        if (window.NailsApi) {
          try {
            const syncRes = typeof window.NailsApi.verifyPhone === "function"
              ? await window.NailsApi.verifyPhone(currentToken)
              : await window.NailsApi.getCurrentUser();
            currentUser = (syncRes && syncRes.user) || {
              id: fbUser.uid,
              phone: fbUser.phoneNumber || pendingPhone,
              firebase_uid: fbUser.uid,
            };
          } catch {
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
        const mapped = mapAuthError(confirmErr);
        const err = new Error(mapped.userMessage);
        err.code = mapped.code;
        err.originalError = confirmErr;
        throw err;
      }
    },

    /**
     * Signs in using email and password (for administrative accounts).
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{ success: boolean, user: object, token: string }>}
     */
    async signInWithEmail(email, password) {
      if (!isConfigured || !firebaseAuth) {
        throw new Error("Authentication service is not configured.");
      }
      const cleanEmail = (email || "").trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        throw new Error("Please enter a valid email address.");
      }
      if (!password || !password.trim()) {
        throw new Error("Please enter your password.");
      }

      try {
        const userCredential = await firebaseAuth.signInWithEmailAndPassword(cleanEmail, password);
        const fbUser = userCredential.user;
        currentToken = await fbUser.getIdToken();

        if (window.NailsApi) {
          try {
            const syncRes = typeof window.NailsApi.verifyPhone === "function"
              ? await window.NailsApi.verifyPhone(currentToken)
              : await window.NailsApi.getCurrentUser();
            currentUser = (syncRes && syncRes.user) || {
              id: fbUser.uid,
              email: fbUser.email,
              firebase_uid: fbUser.uid,
            };
          } catch {
            currentUser = {
              id: fbUser.uid,
              email: fbUser.email,
              firebase_uid: fbUser.uid,
            };
          }
        } else {
          currentUser = {
            id: fbUser.uid,
            email: fbUser.email,
            firebase_uid: fbUser.uid,
          };
        }

        persistSession();
        notifyAuthChange(currentUser);
        return { success: true, user: currentUser, token: currentToken };
      } catch (err) {
        let msg = err.message || "Failed to sign in with email and password.";
        if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
          msg = "Invalid email or password. Please check your credentials.";
        } else if (err.code === "auth/operation-not-allowed") {
          msg = "Email/Password sign-in is not enabled in Firebase Console. Please enable Email/Password provider under Authentication -> Sign-in method.";
        } else if (err.code === "auth/too-many-requests") {
          msg = "Access to this account has been temporarily disabled due to many failed login attempts. Please try again later or reset your password.";
        }
        const error = new Error(msg);
        error.code = err.code || "AUTH_FAILED";
        error.originalError = err;
        throw error;
      }
    },

    /**
     * Signs in using Google Authentication.
     * @returns {Promise<{ success: boolean, user: object, token: string }>}
     */
    async signInWithGoogle() {
      if (!isConfigured || !firebaseAuth) {
        throw new Error("Authentication service is not configured.");
      }
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await firebaseAuth.signInWithPopup(provider);
        const fbUser = result.user;
        currentToken = await fbUser.getIdToken();

        if (window.NailsApi) {
          try {
            const syncRes = typeof window.NailsApi.verifyPhone === "function"
              ? await window.NailsApi.verifyPhone(currentToken)
              : await window.NailsApi.getCurrentUser();
            currentUser = (syncRes && syncRes.user) || {
              id: fbUser.uid,
              email: fbUser.email,
              firebase_uid: fbUser.uid,
            };
          } catch {
            currentUser = {
              id: fbUser.uid,
              email: fbUser.email,
              firebase_uid: fbUser.uid,
            };
          }
        } else {
          currentUser = {
            id: fbUser.uid,
            email: fbUser.email,
            firebase_uid: fbUser.uid,
          };
        }

        persistSession();
        notifyAuthChange(currentUser);
        return { success: true, user: currentUser, token: currentToken };
      } catch (err) {
        let msg = err.message || "Google sign-in was cancelled or failed.";
        if (err.code === "auth/popup-closed-by-user") {
          msg = "Google sign-in popup was closed before completing.";
        } else if (err.code === "auth/operation-not-allowed") {
          msg = "Google Sign-in is not enabled in Firebase Console. Please enable Google provider under Authentication -> Sign-in method.";
        }
        const error = new Error(msg);
        error.code = err.code || "AUTH_FAILED";
        error.originalError = err;
        throw error;
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
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem("nbd_admin_token");
        }
      } catch {}
      persistSession();
      notifyAuthChange(null);
    },

    /**
     * Exposes current billing status.
     * @returns {boolean}
     */
    isBillingDisabled() {
      return isBillingDisabledState;
    },

    /**
     * Programmatically sets or resets billing status (for tests/resets).
     * @param {boolean} val
     */
    setBillingDisabled(val) {
      isBillingDisabledState = Boolean(val);
    },

    /**
     * Exposes error mapping utility.
     */
    mapAuthError,

    /**
     * Internal test helper for mock injection.
     * @private
     */
    _setConfirmationResultForTesting(mock) {
      confirmationResult = mock;
    },
  };

  window.NailsAuth = NailsAuth;
})();
