/**
 * ==============================================================================
 * NAILS BY DIVYA — LUXURY ADMIN PORTAL & CMS CONTROLLER (`admin.js`)
 * Nails by Divya Platform — Phase 5.1B
 *
 * Implements:
 * - Real Firebase / Bearer token authentication & PostgreSQL RBAC derivation
 * - Real-time operational overview & financial ground-truth metrics
 * - Order lifecycle management & line item inspection (with nail sizing & mm measurements)
 * - Dedicated Phase 5.1A payment verification (exact payable amount, UTR, idempotency)
 * - Courier dispatch & customer WhatsApp tracking notification links
 * - Delhi NCR at-home salon booking confirmation & alternative slot proposal
 * - Product CMS: Full create, update, image upload, availability toggle, and archiving
 * - Portfolio CMS: Lookbook artwork upload, categorization, reordering, and publishing
 * - Review Moderation: Approve/reject submitted customer reviews with audit logging
 * - WhatsApp notification queue inspection & manual operator fallback links
 * ==============================================================================
 */

(function () {
  "use strict";

  // State Management
  const state = {
    token: sessionStorage.getItem("nbd_admin_token") || null,
    adminUser: null,
    currentTab: "overview",
    orders: [],
    bookings: [],
    products: [],
    portfolio: [],
    reviews: [],
    notifications: [],
    overview: null,
  };

  /**
   * Resolves the backend base URL using account-api logic.
   */
  function getApiBaseUrl() {
    if (typeof NailsApi !== "undefined" && NailsApi.getBaseUrl) {
      try {
        return NailsApi.getBaseUrl();
      } catch (e) {
        // Fallback
      }
    }
    const host = (window.location.hostname || "").toLowerCase().trim();
    if (host === "localhost" || host === "127.0.0.1" || host === "") {
      return "http://localhost:3000";
    }
    if (host === "nailsbydivya.store" || host === "www.nailsbydivya.store") {
      return "https://nails-ai-backend.onrender.com";
    }
    return "https://nailsbydivya-staging-api.onrender.com";
  }

  const API_BASE = getApiBaseUrl();

  /**
   * Makes an authenticated HTTP request to the admin backend.
   */
  async function adminFetch(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (state.token) {
      headers["Authorization"] = `Bearer ${state.token}`;
    }
    if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      state.token = null;
      sessionStorage.removeItem("nbd_admin_token");
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : {};
    if (!res.ok) {
      const apiErr = isJson && typeof data.error === "string" && !data.error.includes("<")
        ? data.error
        : `Server returned HTTP ${res.status}. Please verify backend availability.`;
      const err = new Error(apiErr);
      err.code = data.code || "HTTP_ERROR";
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // 1. AUTHENTICATION & IDENTITY DERIVATION
  // ---------------------------------------------------------------------------
  let adminResendInterval = null;
  let authServiceBlocked = false;
  let adminSessionCheckInFlight = false;

  function formatSessionIdentity(user) {
    if (!user) return "Authenticated Account";
    return user.email || user.phone || user.displayName || "Authenticated Account";
  }

  function hideSessionSyncBoxes() {
    const syncBox = document.getElementById("storefront-auth-sync-box");
    const custBox = document.getElementById("admin-customer-session-box");
    if (syncBox) syncBox.style.display = "none";
    if (custBox) custBox.style.display = "none";
  }

  function showAuthStatus(msg, isError = true) {
    const statusMsg = document.getElementById("auth-status-msg");
    if (!statusMsg) return;
    statusMsg.style.display = "block";
    statusMsg.className = "auth-status-banner";
    if (isError === true || isError === "error") {
      statusMsg.classList.add("is-error");
    } else if (isError === "success") {
      statusMsg.classList.add("is-success");
    } else {
      statusMsg.classList.add("is-info");
    }
    statusMsg.textContent = msg;
  }

  function clearAuthStatus() {
    const statusMsg = document.getElementById("auth-status-msg");
    if (statusMsg) {
      statusMsg.style.display = "none";
      statusMsg.className = "auth-status-banner";
      statusMsg.textContent = "";
    }
  }

  async function verifyAdminToken(token) {
    state.token = token;
    const data = await adminFetch("/api/admin/me");
    authServiceBlocked = false;
    state.adminUser = data.admin;
    sessionStorage.setItem("nbd_admin_token", token);
    hideSessionSyncBoxes();
    renderAdminUserPill();
    showAppView();
    loadActiveTabData();
    return data;
  }

  function handleAdminVerificationError(err, user = null) {
    state.token = null;
    sessionStorage.removeItem("nbd_admin_token");
    const syncBox = document.getElementById("storefront-auth-sync-box");
    const custBox = document.getElementById("admin-customer-session-box");
    const custPhone = document.getElementById("customer-session-phone");

    if (err && (err.status === 503 || err.code === "AUTH_SERVICE_UNCONFIGURED")) {
      authServiceBlocked = true;
      if (syncBox) syncBox.style.display = "none";
      if (custBox) custBox.style.display = "none";
      showAuthStatus(
        "Studio authentication service is currently initializing. Please try again shortly or contact the studio administrator.",
        true
      );
      return;
    }

    if (err && (err.status === 403 || err.code === "FORBIDDEN_ROLE")) {
      authServiceBlocked = true;
      if (syncBox) syncBox.style.display = "none";
      if (custBox) {
        custBox.style.display = "block";
        if (custPhone) custPhone.textContent = formatSessionIdentity(user);
      }
      showAuthStatus(
        "Access Denied: The signed-in account does not have administrator privileges (requires artist_divya or super_operator).",
        true
      );
      return;
    }

    if (syncBox) syncBox.style.display = "none";
    if (err && err.status === 401) {
      showAuthStatus("Your studio session has expired or could not be verified. Please sign in again.", true);
      return;
    }

    showAuthStatus(
      (err && err.message) || "Unable to verify administrator credentials. Please try again.",
      true
    );
  }

  async function checkAuth() {
    adminSessionCheckInFlight = true;
    hideSessionSyncBoxes();

    try {
      // 1. If we already have a session token stored in sessionStorage, verify it directly
      if (state.token) {
        try {
          await verifyAdminToken(state.token);
          return;
        } catch (err) {
          console.warn("[Admin Auth] Stored session invalid or unverified:", err.message);
          state.token = null;
          sessionStorage.removeItem("nbd_admin_token");
          if (err.status === 503 || err.code === "AUTH_SERVICE_UNCONFIGURED") {
            handleAdminVerificationError(err);
            showAuthView();
            return;
          }
        }
      }

      // 2. Check if user is logged into Firebase/NailsAuth
      if (typeof NailsAuth !== "undefined") {
        if (typeof NailsAuth.init === "function") {
          NailsAuth.init();
        }
        if (typeof NailsAuth.isLoggedIn === "function" && NailsAuth.isLoggedIn()) {
          const user = NailsAuth.getUser ? NailsAuth.getUser() : null;

          try {
            const token = await NailsAuth.getToken();
            if (token) {
              // Verify backend session and role BEFORE showing any active session box
              const data = await adminFetch("/api/admin/me", {
                headers: { Authorization: `Bearer ${token}` }
              });
              const roles = data.admin?.roles || [];
              const isAuthorized = roles.includes("super_operator") || roles.includes("artist_divya");
              if (isAuthorized) {
                state.token = token;
                state.adminUser = data.admin;
                const syncBox = document.getElementById("storefront-auth-sync-box");
                const userLabel = document.getElementById("storefront-auth-user-label");
                if (syncBox) {
                  syncBox.style.display = "block";
                  const roleName = roles.includes("super_operator") ? "Owner / Super Operator" : "Lead Artist (Divya)";
                  if (userLabel) userLabel.textContent = `Verified Studio Account: ${formatSessionIdentity(data.admin)} (${roleName})`;
                }
                showAuthView();
                return;
              } else {
                handleAdminVerificationError({ status: 403, code: "FORBIDDEN_ROLE" }, user);
                showAuthView();
                return;
              }
            }
          } catch (autoErr) {
            console.debug("[Admin Auth] Session check notice:", autoErr.message);
            handleAdminVerificationError(autoErr, user);
          }
        }
      }

      showAuthView();
    } finally {
      adminSessionCheckInFlight = false;
    }
  }

  function showAuthView() {
    document.getElementById("admin-auth-view").style.display = "flex";
    document.getElementById("admin-app-view").style.display = "none";
  }

  function showAppView() {
    document.getElementById("admin-auth-view").style.display = "none";
    document.getElementById("admin-app-view").style.display = "flex";
  }

  function renderAdminUserPill() {
    if (!state.adminUser) return;
    const nameEl = document.getElementById("user-display-name");
    const roleEl = document.getElementById("user-role-tag") || document.getElementById("user-role-badge");
    const roles = state.adminUser.roles || [];
    const isOwner = roles.includes("super_operator");
    const isArtist = roles.includes("artist_divya");

    if (nameEl) {
      const realDisplayName = state.adminUser.displayName || state.adminUser.name || "";
      if (realDisplayName) {
        nameEl.textContent = realDisplayName;
      } else if (isOwner) {
        nameEl.textContent = state.adminUser.email || "Studio Administrator";
      } else if (isArtist) {
        nameEl.textContent = "Divya (Artist)";
      } else {
        nameEl.textContent = state.adminUser.email || state.adminUser.phone || "Administrator";
      }
    }
    if (roleEl) {
      roleEl.textContent = isOwner
        ? "Owner / Super Operator"
        : (isArtist ? "Lead Artist (Divya)" : (roles[0] || "Staff"));
    }

    // Toggle Owner-only navigation items
    document.querySelectorAll(".owner-only-nav").forEach((el) => {
      el.style.display = isOwner ? "" : "none";
    });
  }

  function logout() {
    state.token = null;
    state.adminUser = null;
    authServiceBlocked = false;
    sessionStorage.removeItem("nbd_admin_token");
    hideSessionSyncBoxes();
    if (typeof NailsAuth !== "undefined" && typeof NailsAuth.signOut === "function") {
      NailsAuth.signOut().catch(() => {});
    }
    clearAuthStatus();
    showAuthView();
  }

  // Subscribe to NailsAuth state changes — never show "Active Studio Session" box
  // unless backend has verified the session and confirmed an administrator role.
  if (typeof NailsAuth !== "undefined" && typeof NailsAuth.onAuthChange === "function") {
    NailsAuth.onAuthChange(async (user) => {
      const syncBox = document.getElementById("storefront-auth-sync-box");
      const userLabel = document.getElementById("storefront-auth-user-label");
      if (!syncBox) return;
      if (!user || state.token || authServiceBlocked || adminSessionCheckInFlight) {
        syncBox.style.display = "none";
        return;
      }
      try {
        const token = await NailsAuth.getToken();
        if (!token) {
          syncBox.style.display = "none";
          return;
        }
        const data = await adminFetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const roles = data.admin?.roles || [];
        const isAuthorized = roles.includes("super_operator") || roles.includes("artist_divya");
        if (isAuthorized) {
          state.token = token;
          state.adminUser = data.admin;
          syncBox.style.display = "block";
          const roleName = roles.includes("super_operator") ? "Owner / Super Operator" : "Lead Artist (Divya)";
          if (userLabel) userLabel.textContent = `Verified Studio Account: ${formatSessionIdentity(data.admin)} (${roleName})`;
        } else {
          syncBox.style.display = "none";
          handleAdminVerificationError({ status: 403, code: "FORBIDDEN_ROLE" }, user);
        }
      } catch (err) {
        syncBox.style.display = "none";
        handleAdminVerificationError(err, user);
      }
    });
  }

  // Handle Storefront Session Sync Button (verifies token directly in memory without touching DOM inputs)
  const syncBtn = document.getElementById("btn-sync-storefront-auth");
  if (syncBtn) {
    syncBtn.addEventListener("click", async () => {
      syncBtn.disabled = true;
      const originalText = syncBtn.innerHTML;
      syncBtn.innerHTML = "<span>Entering Studio Dashboard...</span>";
      clearAuthStatus();
      try {
        const token = state.token || (typeof NailsAuth !== "undefined" && typeof NailsAuth.getToken === "function" ? await NailsAuth.getToken() : null);
        if (token) {
          await verifyAdminToken(token);
        } else {
          hideSessionSyncBoxes();
          showAuthStatus("No verified studio session token found. Please sign in below.", true);
        }
      } catch (err) {
        console.error("Token sync error:", err);
        const user = typeof NailsAuth !== "undefined" && NailsAuth.getUser ? NailsAuth.getUser() : null;
        handleAdminVerificationError(err, user);
      } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = originalText;
      }
    });
  }

  const syncSignoutBtn = document.getElementById("btn-sync-signout");
  if (syncSignoutBtn) {
    syncSignoutBtn.addEventListener("click", () => {
      logout();
      clearAuthStatus();
    });
  }

  // Handle Customer Session Switch Button
  const custSwitchBtn = document.getElementById("btn-customer-logout-switch");
  if (custSwitchBtn) {
    custSwitchBtn.addEventListener("click", () => {
      logout();
      const custBox = document.getElementById("admin-customer-session-box");
      if (custBox) custBox.style.display = "none";
      clearAuthStatus();
    });
  }

  // --- AUTH METHOD TABS (EMAIL vs PHONE) ---
  const tabEmail = document.getElementById("tab-admin-email");
  const tabPhone = document.getElementById("tab-admin-phone");
  const emailAuthContainer = document.getElementById("admin-email-auth-container");
  const phoneAuthContainer = document.getElementById("admin-phone-auth-container");

  if (tabEmail && tabPhone) {
    tabEmail.addEventListener("click", () => {
      clearAuthStatus();
      tabEmail.classList.add("is-active");
      tabEmail.setAttribute("aria-selected", "true");

      tabPhone.classList.remove("is-active");
      tabPhone.setAttribute("aria-selected", "false");

      if (emailAuthContainer) emailAuthContainer.style.display = "block";
      if (phoneAuthContainer) phoneAuthContainer.style.display = "none";
    });

    tabPhone.addEventListener("click", () => {
      clearAuthStatus();
      tabPhone.classList.add("is-active");
      tabPhone.setAttribute("aria-selected", "true");

      tabEmail.classList.remove("is-active");
      tabEmail.setAttribute("aria-selected", "false");

      if (phoneAuthContainer) phoneAuthContainer.style.display = "block";
      if (emailAuthContainer) emailAuthContainer.style.display = "none";
    });
  }

  // --- EMAIL & PASSWORD LOGIN CONTROLLER ---
  const emailLoginBtn = document.getElementById("btn-admin-email-login");
  const googleLoginBtn = document.getElementById("btn-admin-google-login");
  const emailInput = document.getElementById("admin-email-input");
  const passwordInput = document.getElementById("admin-password-input");

  if (emailLoginBtn) {
    emailLoginBtn.addEventListener("click", async () => {
      clearAuthStatus();
      const email = emailInput ? emailInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";

      if (!email || !email.includes("@")) {
        showAuthStatus("Please enter your registered administrator email address.", true);
        if (emailInput) emailInput.focus();
        return;
      }
      if (!password) {
        showAuthStatus("Please enter your administrator password.", true);
        if (passwordInput) passwordInput.focus();
        return;
      }

      emailLoginBtn.disabled = true;
      const origHtml = emailLoginBtn.innerHTML;
      emailLoginBtn.innerHTML = "<span>Authenticating...</span>";

      try {
        if (typeof NailsAuth === "undefined") {
          throw new Error("Authentication service is not loaded.");
        }
        const res = await NailsAuth.signInWithEmail(email, password);
        const token = res.token || (await NailsAuth.getToken());
        if (!token) throw new Error("Failed to retrieve authentication token.");

        await verifyAdminToken(token);
      } catch (err) {
        console.error("[Admin Auth Error]:", err);
        const user = typeof NailsAuth !== "undefined" && NailsAuth.getUser ? NailsAuth.getUser() : { email };
        handleAdminVerificationError(err, user);
      } finally {
        emailLoginBtn.disabled = false;
        emailLoginBtn.innerHTML = origHtml;
      }
    });
  }

  if (emailInput) {
    emailInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (passwordInput && !passwordInput.value) {
          passwordInput.focus();
        } else if (emailLoginBtn) {
          emailLoginBtn.click();
        }
      }
    });
  }

  if (passwordInput && emailLoginBtn) {
    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        emailLoginBtn.click();
      }
    });
  }

  const emailLoginForm = document.getElementById("admin-email-login-form");
  if (emailLoginForm) {
    emailLoginForm.addEventListener("submit", (e) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      if (emailLoginBtn) emailLoginBtn.click();
    });
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", async () => {
      clearAuthStatus();
      googleLoginBtn.disabled = true;
      const origHtml = googleLoginBtn.innerHTML;
      googleLoginBtn.innerHTML = "<span>Signing in with Google...</span>";

      try {
        if (typeof NailsAuth === "undefined") {
          throw new Error("Authentication service is not loaded.");
        }
        const res = await NailsAuth.signInWithGoogle();
        const token = res.token || (await NailsAuth.getToken());
        if (!token) throw new Error("Failed to retrieve authentication token.");

        await verifyAdminToken(token);
      } catch (err) {
        console.error("[Admin Google Auth Error]:", err);
        const user = typeof NailsAuth !== "undefined" && NailsAuth.getUser ? NailsAuth.getUser() : null;
        handleAdminVerificationError(err, user);
      } finally {
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerHTML = origHtml;
      }
    });
  }

  // --- DIRECT PHONE SMS OTP CONTROLLER FOR ADMIN ---
  const sendOtpBtn = document.getElementById("btn-admin-send-otp");
  const verifyOtpBtn = document.getElementById("btn-admin-verify-otp");
  const changePhoneBtn = document.getElementById("btn-admin-change-phone");
  const resendBtn = document.getElementById("btn-admin-resend-otp");
  const resendTimerEl = document.getElementById("admin-resend-timer");
  const stepPhoneEl = document.getElementById("admin-step-phone");
  const stepOtpEl = document.getElementById("admin-step-otp");
  const phoneInputEl = document.getElementById("admin-phone-input");
  const otpInputEl = document.getElementById("admin-otp-input");
  const otpPhoneDisplay = document.getElementById("admin-otp-phone-display");

  let isBillingDisabled = false;

  function startResendCountdown(seconds = 30) {
    if (adminResendInterval) clearInterval(adminResendInterval);
    if (!resendBtn || !resendTimerEl) return;

    if (isBillingDisabled || (typeof NailsAuth !== "undefined" && NailsAuth.isBillingDisabled && NailsAuth.isBillingDisabled())) {
      resendBtn.style.display = "none";
      resendTimerEl.style.display = "inline";
      resendTimerEl.textContent = "SMS verification unavailable";
      return;
    }

    resendBtn.style.display = "none";
    resendTimerEl.style.display = "inline";
    let left = seconds;
    resendTimerEl.textContent = `Resend SMS in ${left}s`;

    adminResendInterval = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(adminResendInterval);
        resendTimerEl.style.display = "none";
        const isBillingOff = isBillingDisabled || (typeof NailsAuth !== "undefined" && NailsAuth.isBillingDisabled && NailsAuth.isBillingDisabled());
        if (!isBillingOff) {
          resendBtn.style.display = "inline";
        }
      } else {
        resendTimerEl.textContent = `Resend SMS in ${left}s`;
      }
    }, 1000);
  }

  if (phoneInputEl) {
    phoneInputEl.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
      clearAuthStatus();
    });
  }

  if (sendOtpBtn) {
    sendOtpBtn.addEventListener("click", async () => {
      clearAuthStatus();
      const rawPhone = phoneInputEl ? phoneInputEl.value.trim() : "";
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length !== 10) {
        showAuthStatus("Please enter a valid 10-digit mobile number.", true);
        if (phoneInputEl) phoneInputEl.focus();
        return;
      }

      if (isBillingDisabled || (typeof NailsAuth !== "undefined" && NailsAuth.isBillingDisabled && NailsAuth.isBillingDisabled())) {
        showAuthStatus(
          "Mobile phone SMS verification is currently unavailable. Please sign in using your Administrator Email & Password above.",
          true
        );
        sendOtpBtn.disabled = true;
        return;
      }

      sendOtpBtn.disabled = true;
      const originalText = sendOtpBtn.innerHTML;
      sendOtpBtn.innerHTML = "<span>Sending SMS Code...</span>";

      try {
        if (typeof NailsAuth === "undefined") {
          throw new Error("Authentication service is not loaded.");
        }
        const res = await NailsAuth.sendOtp(rawPhone, "admin-recaptcha-container");
        if (!res || !res.success) {
          throw new Error("SMS verification was not confirmed by provider.");
        }

        // Only transition to OTP step after provider has successfully confirmed acceptance
        if (stepPhoneEl) stepPhoneEl.style.display = "none";
        if (stepOtpEl) stepOtpEl.style.display = "block";
        if (otpPhoneDisplay) otpPhoneDisplay.textContent = res.phone || `+91 ${digits}`;
        const subtext = document.getElementById("admin-otp-subtext");
        if (subtext) {
          subtext.innerHTML = `Verification code sent to <strong id="admin-otp-phone-display">${res.phone || `+91 ${digits}`}</strong>`;
        }
        if (otpInputEl) {
          otpInputEl.value = "";
          otpInputEl.focus();
        }
        startResendCountdown(30);
      } catch (err) {
        console.error("Admin sendOtp error:", err);
        // CRITICAL: Stay on phone step and keep phone number visible and editable
        if (stepPhoneEl) stepPhoneEl.style.display = "block";
        if (stepOtpEl) stepOtpEl.style.display = "none";
        if (phoneInputEl) {
          phoneInputEl.value = digits;
          phoneInputEl.disabled = false;
        }

        const isBilling = err.isBillingDisabled || err.code === "BILLING_NOT_ENABLED" ||
          (typeof NailsAuth !== "undefined" && NailsAuth.isBillingDisabled && NailsAuth.isBillingDisabled());

        if (isBilling) {
          isBillingDisabled = true;
          sendOtpBtn.disabled = true;
          sendOtpBtn.innerHTML = "<span>SMS Verification Unavailable</span>";
          sendOtpBtn.title = "SMS billing is disabled on the Firebase project.";
          showAuthStatus(
            "Mobile phone SMS verification is currently unavailable. Please sign in using your Administrator Email & Password above.",
            true
          );
        } else {
          sendOtpBtn.disabled = false;
          sendOtpBtn.innerHTML = originalText;
          showAuthStatus(err.message || "Failed to send verification code. Please try again.", true);
        }
      }
    });
  }

  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", async () => {
      clearAuthStatus();
      const code = otpInputEl ? otpInputEl.value.trim() : "";
      if (!/^\d{6}$/.test(code)) {
        showAuthStatus("Please enter the complete 6-digit verification code.", true);
        if (otpInputEl) otpInputEl.focus();
        return;
      }

      verifyOtpBtn.disabled = true;
      const originalText = verifyOtpBtn.innerHTML;
      verifyOtpBtn.innerHTML = "<span>Verifying Code & Roles...</span>";

      try {
        if (typeof NailsAuth === "undefined") {
          throw new Error("Authentication service is not loaded.");
        }
        await NailsAuth.verifyOtp(code);
        const token = await NailsAuth.getToken();
        if (!token) {
          throw new Error("Failed to acquire verified authentication token.");
        }
        state.token = token;
        const data = await adminFetch("/api/admin/me");
        state.adminUser = data.admin;
        sessionStorage.setItem("nbd_admin_token", token);
        renderAdminUserPill();
        showAppView();
        loadActiveTabData();
      } catch (err) {
        console.error("Admin verifyOtp error:", err);
        let msg = err.message || "Verification failed.";
        if (err.status === 403 || err.code === "FORBIDDEN_ROLE") {
          msg = "Access Denied: This account does not have administrator privileges for Nails by Divya. Required role: artist_divya or super_operator.";
        }
        showAuthStatus(msg, true);
      } finally {
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.innerHTML = originalText;
      }
    });
  }

  if (changePhoneBtn) {
    changePhoneBtn.addEventListener("click", () => {
      clearAuthStatus();
      if (stepOtpEl) stepOtpEl.style.display = "none";
      if (stepPhoneEl) stepPhoneEl.style.display = "block";
      if (phoneInputEl) {
        phoneInputEl.disabled = false;
        phoneInputEl.focus();
      }
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      clearAuthStatus();
      const rawPhone = phoneInputEl ? phoneInputEl.value.trim() : "";

      if (isBillingDisabled || (typeof NailsAuth !== "undefined" && NailsAuth.isBillingDisabled && NailsAuth.isBillingDisabled())) {
        showAuthStatus("SMS verification is unavailable because billing is not enabled.", true);
        resendBtn.disabled = true;
        if (resendTimerEl) resendTimerEl.style.display = "none";
        return;
      }

      resendBtn.disabled = true;
      try {
        const res = await NailsAuth.sendOtp(rawPhone, "admin-recaptcha-container");
        if (!res || !res.success) {
          throw new Error("Unable to confirm verification code dispatch.");
        }
        startResendCountdown(30);
        showAuthStatus("A new verification code has been dispatched.", false);
      } catch (err) {
        const isBilling = err.isBillingDisabled || err.code === "BILLING_NOT_ENABLED" ||
          (typeof NailsAuth !== "undefined" && NailsAuth.isBillingDisabled && NailsAuth.isBillingDisabled());

        if (isBilling) {
          isBillingDisabled = true;
          resendBtn.disabled = true;
          if (adminResendInterval) clearInterval(adminResendInterval);
          if (resendTimerEl) {
            resendTimerEl.textContent = "SMS verification unavailable";
            resendTimerEl.style.display = "inline";
          }
        } else {
          resendBtn.disabled = false;
        }
        showAuthStatus(err.message || "Failed to resend verification code.", true);
      }
    });
  }

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // ---------------------------------------------------------------------------
  // 2. TAB NAVIGATION
  // ---------------------------------------------------------------------------
  window.adminNavigateTo = function (tabId) {
    const ownerOnlyTabs = ["staff", "settings", "audit-logs"];
    if (ownerOnlyTabs.includes(tabId)) {
      const roles = (state.adminUser && state.adminUser.roles) || [];
      if (!roles.includes("super_operator")) {
        alert("Access Restricted: This section is restricted to the Owner (super_operator).");
        return;
      }
    }

    state.currentTab = tabId;

    document.querySelectorAll(".nav-link").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
    });

    document.querySelectorAll(".tab-content").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${tabId}`);
    });

    const titleEl = document.getElementById("page-title");
    if (titleEl) {
      const titles = {
        overview: "Operational Overview",
        orders: "Order Management",
        payments: "Payment Verification",
        bookings: "Delhi NCR Appointments",
        products: "Product Catalog CMS",
        portfolio: "Nail Art Lookbook CMS",
        reviews: "Review Moderation",
        communications: "WhatsApp Dispatch Queue",
        staff: "Staff & Role Permissions",
        settings: "Studio Operational Settings",
        "audit-logs": "Security Audit Trail",
      };
      titleEl.textContent = titles[tabId] || "Dashboard";
    }

    // Close mobile sidebar if open
    const sidebar = document.getElementById("admin-sidebar");
    if (sidebar) sidebar.classList.remove("open");

    loadActiveTabData();
  };

  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab) adminNavigateTo(tab);
    });
  });

  const mobileBtn = document.getElementById("mobile-menu-btn");
  if (mobileBtn) {
    mobileBtn.addEventListener("click", () => {
      const sidebar = document.getElementById("admin-sidebar");
      if (sidebar) sidebar.classList.toggle("open");
    });
  }

  const refreshBtn = document.getElementById("btn-refresh-data");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadActiveTabData(true);
    });
  }

  function loadActiveTabData(force = false) {
    switch (state.currentTab) {
      case "overview":
        loadOverview();
        break;
      case "orders":
        loadOrders();
        break;
      case "payments":
        loadPayments();
        break;
      case "bookings":
        loadBookings();
        break;
      case "products":
        loadProducts();
        break;
      case "portfolio":
        loadPortfolio();
        break;
      case "reviews":
        loadReviews();
        break;
      case "communications":
        loadCommunications();
        break;
      case "staff":
        loadStaff();
        break;
      case "settings":
        loadSettings();
        break;
      case "audit-logs":
        loadAuditLogs();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST DATA COHORT DISTINCTION HELPERS
  // ---------------------------------------------------------------------------
  const KNOWN_TEST_CUSTOMERS = new Set([
    "Ananya Roy",
    "Ops Customer",
    "Cancel Customer",
    "Customer A",
    "Aditi Sharma",
    "Idem User",
    "Rhea Sen",
    "Verified Customer",
    "Aanya Verma",
    "Staging Test Customer",
    "Ops Booking Customer",
    "Meera Kapoor",
    "Aarti Verma",
    "Radhika Mehra",
    "Pooja Malhotra",
    "Pooja Verma",
  ]);

  function isSmokeTestRecord(item) {
    if (!item) return false;
    const name = (item.customer_name || item.customerName || "").toLowerCase().trim();
    const phone = (item.customer_phone || item.customerPhone || "").replace(/\D/g, "");
    const orderNum = (item.order_number || item.orderNumber || "").trim();
    const bkgNum = (item.booking_number || item.bookingNumber || "").trim();
    return name.includes("raghavendra") || phone.includes("7307622189") ||
      orderNum === "NBD-ORD-1241" || orderNum === "NBD-ORD-1298" || bkgNum === "NBD-BKG-599";
  }

  function isTestRecord(item) {
    if (!item) return false;
    if (isSmokeTestRecord(item)) return false;
    const name = (item.customer_name || item.customerName || "").trim();
    const orderNum = (item.order_number || item.orderNumber || "").trim();
    const bkgNum = (item.booking_number || item.bookingNumber || "").trim();
    if (KNOWN_TEST_CUSTOMERS.has(name)) return true;
    if (orderNum.startsWith("NBD-ORD-PAY-") || orderNum.startsWith("NBD-ORD-OPS-")) return true;
    if (bkgNum.startsWith("NBD-BKG-OPS-")) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // 3. OVERVIEW METRICS & FINANCIALS
  // ---------------------------------------------------------------------------
  async function loadOverview() {
    const errorBanner = document.getElementById("overview-error-banner");
    if (errorBanner) {
      errorBanner.style.display = "none";
      errorBanner.innerHTML = "";
    }

    try {
      const data = await adminFetch("/api/admin/overview");
      state.overview = data.overview;
      renderOverview();
    } catch (err) {
      console.error("[Overview Error]:", err.message);
      // DO NOT DISPLAY MISLEADING ZEROES ON API FAILURE
      const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      setText("metric-new-orders", "—");
      setText("metric-pending-payments", "—");
      setText("metric-confirmed-orders", "—");
      setText("metric-booking-requests", "—");
      setText("metric-awaiting-dispatch", "—");
      setText("fin-paid-revenue", "—");
      setText("fin-pending-amount", "—");
      setText("fin-aov", "—");

      if (errorBanner) {
        errorBanner.style.display = "block";
        errorBanner.innerHTML = `
          <div style="background: rgba(158, 61, 72, 0.08); border: 1px solid rgba(158, 61, 72, 0.28); border-radius: var(--radius-sm); padding: 0.9rem 1.15rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <strong style="color: var(--danger); font-size: 0.88rem;">Failed to retrieve live operational metrics</strong>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">${escapeHtml(err.message || "The studio API server could not be reached.")}</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="loadOverview()">
              <span>↻ Retry Metrics</span>
            </button>
          </div>
        `;
      }
    }
  }

  function renderOverview() {
    const ov = state.overview;
    if (!ov) return;

    // Metrics
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val !== undefined ? val : "0";
    };

    // Metrics: support both camelCase descriptive keys and compact backend keys
    const pendingOrders = ov.orders ? (ov.orders.pendingOrders ?? ov.orders.pending ?? 0) : 0;
    const confirmedOrders = ov.orders ? (ov.orders.confirmedOrders ?? ov.orders.confirmed ?? 0) : 0;
    const requestedBookings = ov.bookings ? (ov.bookings.requestedBookings ?? ov.bookings.newRequests ?? 0) : 0;
    const awaitingDispatch = ov.orders ? (ov.orders.awaitingDispatchOrders ?? ov.orders.awaitingDispatch ?? 0) : 0;
    const pendingPaymentsCount = ov.orders ? (ov.orders.pendingPayments ?? ov.orders.pendingPaymentOrders ?? ov.orders.pending ?? 0) : 0;

    setText("metric-new-orders", pendingOrders);
    setText("metric-pending-payments", pendingPaymentsCount);
    setText("metric-confirmed-orders", confirmedOrders);
    setText("metric-booking-requests", requestedBookings);
    setText("metric-awaiting-dispatch", awaitingDispatch);

    // Badges in sidebar
    const setBadge = (id, count) => {
      const el = document.getElementById(id);
      if (el) {
        if (count > 0) {
          el.textContent = count;
          el.style.display = "inline-block";
        } else {
          el.style.display = "none";
        }
      }
    };

    setBadge("badge-pending-orders", pendingOrders);
    setBadge("badge-unverified-payments", pendingPaymentsCount);
    setBadge("badge-requested-bookings", requestedBookings);

    // Financials
    if (ov.financials) {
      const paidRev = Number(ov.financials.paidRevenue || 0);
      const pendingAmt = Number(ov.financials.pendingPaymentAmount || 0);
      const calculatedAov = Number(ov.financials.averageOrderValue || 0);

      setText("fin-paid-revenue", `₹${paidRev.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
      setText("fin-pending-amount", `₹${pendingAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
      setText("fin-aov", `₹${calculatedAov.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    }

    // Update Ground-Truth ledger badge
    const cohortBadge = document.getElementById("overview-cohort-badge");
    if (cohortBadge) {
      const totalOrd = ov.orders?.total ?? 0;
      const totalBkg = ov.bookings?.total ?? 0;
      cohortBadge.textContent = `${totalOrd} Total Orders • ${totalBkg} Bookings`;
      cohortBadge.title = `Staging database holds ${totalOrd} total orders (including historical test suites and smoke test records) and ${totalBkg} bookings.`;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. ORDER MANAGEMENT
  // ---------------------------------------------------------------------------
  async function loadOrders() {
    const tbody = document.getElementById("orders-table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty-cell"><span class="spinner-sm"></span> Loading customer orders...</td></tr>`;
    }

    const status = document.getElementById("orders-filter-status")?.value || "";
    const paymentStatus = document.getElementById("orders-filter-payment")?.value || "";
    const search = document.getElementById("orders-search-input")?.value || "";

    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (paymentStatus) params.append("payment_status", paymentStatus);
    if (search) params.append("search", search);
    params.append("limit", "100");

    try {
      const data = await adminFetch(`/api/admin/orders?${params.toString()}`);
      state.orders = data.orders || [];
      renderOrdersTable();
    } catch (err) {
      console.error("[Orders Error]:", err.message);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-error-cell">Failed to load orders: ${escapeHtml(err.message || "Network error")}. <button type="button" class="btn btn-secondary btn-sm" onclick="loadOrders()" style="margin-left: 0.5rem;">↻ Retry</button></td></tr>`;
      }
    }
  }

  function renderOrdersTable() {
    const tbody = document.getElementById("orders-table-body");
    if (!tbody) return;

    const cohortFilter = document.getElementById("orders-filter-cohort")?.value || "";
    let ordersToDisplay = state.orders;
    if (cohortFilter === "live") {
      ordersToDisplay = ordersToDisplay.filter((o) => !isTestRecord(o));
    } else if (cohortFilter === "test") {
      ordersToDisplay = ordersToDisplay.filter((o) => isTestRecord(o));
    }

    if (ordersToDisplay.length === 0) {
      const emptyMsg = cohortFilter === "live"
        ? "No live customer orders found matching current filters."
        : (cohortFilter === "test" ? "No test cohort records found matching current filters." : "No orders found matching current filters.");
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty-cell">${emptyMsg}</td></tr>`;
      return;
    }

    tbody.innerHTML = ordersToDisplay.map((order) => {
      const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";
      const totalStr = `₹${parseFloat(order.total_amount).toFixed(2)}`;
      const paymentBadgeClass = order.payment_status === "VERIFIED" ? "badge-verified" : (order.payment_status === "FAILED" ? "badge-failed" : "badge-pending");
      const orderBadgeClass = order.order_status === "CONFIRMED" || order.order_status === "DELIVERED" ? "badge-confirmed" : (order.order_status === "CANCELLED" ? "badge-cancelled" : (order.order_status === "IN_PRODUCTION" ? "badge-production" : "badge-pending"));

      let cohortBadge = `<span class="badge badge-live" title="Live Customer Order">Live</span>`;
      if (isSmokeTestRecord(order)) {
        cohortBadge = `<span class="badge badge-smoke" title="Developer Smoke-Test Order (Preserved)">Smoke</span>`;
      } else if (isTestRecord(order)) {
        cohortBadge = `<span class="badge badge-test" title="Automated Synthetic Test Order">Test</span>`;
      }

      return `
        <tr>
          <td><strong style="color: var(--gold-primary);">${escapeHtml(order.order_number)}</strong></td>
          <td>${dateStr}</td>
          <td>
            <div style="font-weight: 600; display: flex; align-items: center; gap: 0.35rem;">
              <span>${escapeHtml(order.customer_name)}</span>
              ${cohortBadge}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(order.customer_phone || "")}</div>
          </td>
          <td>${order.item_count || 1} sets</td>
          <td><strong>${totalStr}</strong></td>
          <td><span class="badge ${orderBadgeClass}">${order.order_status}</span></td>
          <td><span class="badge ${paymentBadgeClass}">${order.payment_status}</span></td>
          <td><span class="badge ${order.fulfilment_status === 'DISPATCHED' ? 'badge-dispatched' : 'badge-pending'}">${order.fulfilment_status}</span></td>
          <td>
            <div class="actions-cell">
              <button type="button" class="btn btn-secondary btn-sm" onclick="adminViewOrder('${order.id}')">View</button>
              ${order.payment_status !== "VERIFIED" ? `<button type="button" class="btn btn-primary btn-sm" onclick="adminOpenPaymentModal('${order.id}', '${escapeHtml(order.order_number)}', ${order.total_amount})">Verify ₹</button>` : ""}
              ${order.order_status === "IN_PRODUCTION" || order.order_status === "READY_FOR_DISPATCH" ? `<button type="button" class="btn btn-outline btn-sm" onclick="adminOpenDispatchModal('${order.id}', '${escapeHtml(order.customer_phone)}')">Dispatch</button>` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Filter Listeners
  ["orders-filter-status", "orders-filter-payment", "orders-filter-cohort"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", (id === "orders-filter-cohort" ? renderOrdersTable : loadOrders));
  });
  const orderSearch = document.getElementById("orders-search-input");
  if (orderSearch) {
    let timer;
    orderSearch.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(loadOrders, 300);
    });
  }

  // Order Details Modal Viewer
  window.adminViewOrder = async function (orderId) {
    try {
      const data = await adminFetch(`/api/admin/orders/${orderId}`);
      const o = data.order;
      const items = data.items || [];
      const history = data.statusHistory || [];
      const payment = data.payment || null;

      const titleEl = document.getElementById("order-modal-title");
      if (titleEl) titleEl.textContent = `Order ${o.order_number}`;

      const bodyEl = document.getElementById("order-modal-body");
      if (!bodyEl) return;

      const addr = typeof o.shipping_address === "string" ? JSON.parse(o.shipping_address) : o.shipping_address;

      bodyEl.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
          <div>
            <h5 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem;">Customer</h5>
            <div style="font-weight: 600;">${escapeHtml(o.customer_name)}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${o.customer_phone} &bull; ${o.customer_email || ""}</div>
          </div>
          <div>
            <h5 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem;">Shipping Address</h5>
            <div style="font-size: 0.85rem; line-height: 1.4;">
              ${addr.addressLine1 || addr.address_line1 || ""}<br>
              ${addr.landmark ? `Landmark: ${addr.landmark}<br>` : ""}
              ${addr.city || ""}, ${addr.state || ""} ${addr.postalCode || addr.postal_code || ""}
            </div>
          </div>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <h5 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">Selected Items &amp; Sizing</h5>
          <div style="border: 1px solid var(--border-light); border-radius: var(--radius-sm); overflow: hidden;">
            ${items.map((it) => {
              const snap = it.sizing_snapshot || {};
              const customDims = snap.customNailMeasurements
                ? `Custom mm: T:${snap.customNailMeasurements.thumb} I:${snap.customNailMeasurements.index} M:${snap.customNailMeasurements.middle} R:${snap.customNailMeasurements.ring} P:${snap.customNailMeasurements.pinky}`
                : "";
              return `
                <div style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 600;">${escapeHtml(it.product_name)} (${it.product_sku})</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                      Shape: <strong>${it.nail_shape || "Standard"}</strong> &bull; Length: <strong>${it.nail_length || "Medium"}</strong>
                      ${snap.sizingPreset ? ` &bull; Preset: <strong>${snap.sizingPreset}</strong>` : ""}
                      ${customDims ? `<br><span style="color: var(--gold-primary);">${customDims}</span>` : ""}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-weight: 600;">₹${parseFloat(it.unit_price).toFixed(2)} &times; ${it.quantity}</div>
                    <div style="font-size: 0.85rem; color: var(--gold-primary);">₹${parseFloat(it.subtotal).toFixed(2)}</div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <div style="text-align: right; margin-top: 0.75rem; font-size: 1.1rem; font-weight: 700;">
            Total Payable: <span style="color: var(--gold-primary);">₹${parseFloat(o.total_amount).toFixed(2)}</span>
          </div>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 1.5rem;">
          <h5 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem;">Payment Details</h5>
          <div style="font-size: 0.85rem;">
            Payment Status: <strong>${o.payment_status}</strong>
            ${payment && payment.gateway_payment_id ? `<br>UTR Reference: <strong>${payment.gateway_payment_id}</strong>` : ""}
            ${payment && payment.verified_at ? `<br>Verified: ${new Date(payment.verified_at).toLocaleString("en-IN")}` : ""}
          </div>
        </div>

        <div>
          <h5 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">Update Order Progress</h5>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${o.order_status === "CONFIRMED" ? `<button type="button" class="btn btn-secondary btn-sm" onclick="adminAdvanceOrderStatus('${o.id}', 'IN_PRODUCTION')">Move to In Production</button>` : ""}
            ${o.order_status === "IN_PRODUCTION" ? `<button type="button" class="btn btn-secondary btn-sm" onclick="adminAdvanceOrderStatus('${o.id}', 'READY_FOR_DISPATCH')">Mark Ready for Dispatch</button>` : ""}
            ${o.order_status === "READY_FOR_DISPATCH" ? `<button type="button" class="btn btn-primary btn-sm" onclick="adminCloseModal('modal-order-detail'); adminOpenDispatchModal('${o.id}', '${o.customer_phone}')">Enter Courier &amp; Dispatch</button>` : ""}
            ${o.order_status !== "CANCELLED" && o.order_status !== "DELIVERED" ? `<button type="button" class="btn btn-danger btn-sm" onclick="adminCancelOrder('${o.id}')">Cancel Order</button>` : ""}
          </div>
        </div>
      `;

      adminOpenModal("modal-order-detail");
    } catch (err) {
      alert("Failed to load order details: " + err.message);
    }
  };

  window.adminAdvanceOrderStatus = async function (orderId, nextStatus) {
    try {
      await adminFetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          order_status: nextStatus,
        }),
      });
      adminCloseModal("modal-order-detail");
      loadOrders();
      loadOverview();
    } catch (err) {
      alert("Failed to advance order status: " + err.message);
    }
  };

  window.adminCancelOrder = async function (orderId) {
    const reason = prompt("Enter explicit cancellation reason:");
    if (!reason) return;

    try {
      await adminFetch(`/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      adminCloseModal("modal-order-detail");
      loadOrders();
      loadOverview();
    } catch (err) {
      alert("Failed to cancel order: " + err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // 5. PAYMENT VERIFICATION (PHASE 5.1A DEDICATED)
  // ---------------------------------------------------------------------------
  async function loadPayments() {
    const tbody = document.getElementById("payments-table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell"><span class="spinner-sm"></span> Loading payment verification records...</td></tr>`;
    }

    const filter = document.getElementById("payments-filter-status")?.value || "";
    const params = new URLSearchParams();
    if (filter) params.append("payment_status", filter);
    params.append("limit", "100");

    try {
      const data = await adminFetch(`/api/admin/orders?${params.toString()}`);
      renderPaymentsTable(data.orders || []);
    } catch (err) {
      console.error("[Payments Error]:", err.message);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-error-cell">Failed to load payments: ${escapeHtml(err.message || "Network error")}. <button type="button" class="btn btn-secondary btn-sm" onclick="loadPayments()" style="margin-left: 0.5rem;">↻ Retry</button></td></tr>`;
      }
    }
  }

  const payFilter = document.getElementById("payments-filter-status");
  if (payFilter) payFilter.addEventListener("change", loadPayments);

  function renderPaymentsTable(orders) {
    const tbody = document.getElementById("payments-table-body");
    if (!tbody) return;

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell">No payment records found matching current filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map((o) => {
      const isVerified = o.payment_status === "VERIFIED";
      const total = parseFloat(o.total_amount).toFixed(2);
      let cohortBadge = `<span class="badge badge-live" title="Live Customer Order">Live</span>`;
      if (isSmokeTestRecord(o)) {
        cohortBadge = `<span class="badge badge-smoke" title="Developer Smoke-Test Order (Preserved)">Smoke</span>`;
      } else if (isTestRecord(o)) {
        cohortBadge = `<span class="badge badge-test" title="Automated Synthetic Test Order">Test</span>`;
      }

      return `
        <tr>
          <td><strong style="color: var(--gold-primary);">${escapeHtml(o.order_number)}</strong></td>
          <td>
            <div style="font-weight: 600; display: flex; align-items: center; gap: 0.35rem;">
              <span>${escapeHtml(o.customer_name)}</span>
              ${cohortBadge}
            </div>
          </td>
          <td>${escapeHtml(o.customer_phone || "-")}</td>
          <td><strong>₹${total}</strong></td>
          <td><span class="badge ${isVerified ? 'badge-verified' : 'badge-pending'}">${escapeHtml(o.payment_status)}</span></td>
          <td>${escapeHtml(o.transaction_reference || "-")}</td>
          <td>${o.verified_at ? new Date(o.verified_at).toLocaleDateString("en-IN") : "-"}</td>
          <td>
            ${!isVerified
              ? `<button type="button" class="btn btn-primary btn-sm" onclick="adminOpenPaymentModal('${o.id}', '${escapeHtml(o.order_number)}', ${o.total_amount})">Verify Payment</button>`
              : `<span style="color: var(--success); font-size: 0.8rem; font-weight: 600;">✓ Verified</span>`
            }
          </td>
        </tr>
      `;
    }).join("");
  }

  window.adminOpenPaymentModal = function (orderId, orderNum, payableAmount) {
    document.getElementById("vpay-order-id").value = orderId;
    document.getElementById("vpay-payable-amount").value = payableAmount;
    document.getElementById("vpay-order-number").textContent = orderNum;
    document.getElementById("vpay-display-amount").textContent = `₹${parseFloat(payableAmount).toFixed(2)}`;
    document.getElementById("vpay-amount-input").value = parseFloat(payableAmount).toFixed(2);
    document.getElementById("vpay-utr-input").value = "";
    document.getElementById("vpay-notes-input").value = "";

    const errEl = document.getElementById("vpay-error-msg");
    if (errEl) errEl.style.display = "none";

    adminOpenModal("modal-verify-payment");
  };

  const submitPayBtn = document.getElementById("btn-submit-payment-verification");
  if (submitPayBtn) {
    submitPayBtn.addEventListener("click", async () => {
      const orderId = document.getElementById("vpay-order-id").value;
      const expectedAmount = parseFloat(document.getElementById("vpay-payable-amount").value);
      const enteredAmount = parseFloat(document.getElementById("vpay-amount-input").value);
      const utr = document.getElementById("vpay-utr-input").value.trim();
      const method = document.getElementById("vpay-method-select").value;
      const notes = document.getElementById("vpay-notes-input").value.trim();
      const errEl = document.getElementById("vpay-error-msg");

      if (!utr) {
        showPayError("Bank or UPI transaction reference (UTR) is required.");
        return;
      }

      if (Math.round(enteredAmount * 100) !== Math.round(expectedAmount * 100)) {
        showPayError(`Verified amount (₹${enteredAmount}) must equal the exact order total (₹${expectedAmount}). Underpayment or overpayment verification is not permitted.`);
        return;
      }

      submitPayBtn.disabled = true;
      submitPayBtn.textContent = "Verifying...";

      try {
        await adminFetch(`/api/admin/orders/${orderId}/payment-status`, {
          method: "PATCH",
          body: JSON.stringify({
            payment_status: "VERIFIED",
            payment_method: method,
            transaction_reference: utr,
            amount: enteredAmount,
            notes: notes || `Verified via Admin Portal by Divya`,
            idempotency_key: `adm_pay_${orderId}_${Date.now()}`,
          }),
        });

        adminCloseModal("modal-verify-payment");
        alert("Payment verified successfully! Order is now confirmed and ready for production.");
        loadActiveTabData();
      } catch (err) {
        showPayError(err.message || "Failed to verify payment.");
      } finally {
        submitPayBtn.disabled = false;
        submitPayBtn.textContent = "Confirm & Verify Payment";
      }
    });
  }

  function showPayError(msg) {
    const errEl = document.getElementById("vpay-error-msg");
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = msg;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. DISPATCH & COURIER TRACKING
  // ---------------------------------------------------------------------------
  window.adminOpenDispatchModal = function (orderId, phone) {
    document.getElementById("disp-order-id").value = orderId;
    document.getElementById("disp-customer-phone").value = phone || "";
    document.getElementById("disp-tracking-number").value = "";
    document.getElementById("disp-tracking-url").value = "";
    document.getElementById("disp-notes").value = "";

    const errEl = document.getElementById("disp-error-msg");
    if (errEl) errEl.style.display = "none";

    adminOpenModal("modal-dispatch-order");
  };

  const submitDispBtn = document.getElementById("btn-submit-dispatch");
  if (submitDispBtn) {
    submitDispBtn.addEventListener("click", async () => {
      const orderId = document.getElementById("disp-order-id").value;
      const phone = document.getElementById("disp-customer-phone").value;
      const courier = document.getElementById("disp-courier-name").value;
      const awb = document.getElementById("disp-tracking-number").value.trim();
      const trackingUrl = document.getElementById("disp-tracking-url").value.trim();
      const notes = document.getElementById("disp-notes").value.trim();
      const errEl = document.getElementById("disp-error-msg");

      if (!awb) {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Courier tracking number is required.";
        }
        return;
      }

      submitDispBtn.disabled = true;
      submitDispBtn.textContent = "Dispatching...";

      try {
        await adminFetch(`/api/admin/orders/${orderId}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            order_status: "DISPATCHED",
            fulfilment_status: "DISPATCHED",
            courier_name: courier,
            tracking_number: awb,
            tracking_url: trackingUrl || undefined,
            notes: notes || `Dispatched via ${courier} (AWB: ${awb})`,
          }),
        });

        adminCloseModal("modal-dispatch-order");

        // Prepare client WhatsApp notification link
        if (phone) {
          const cleanPhone = phone.replace(/[^0-9]/g, "");
          const waMsg = `Hi! Great news from Nails by Divya ✨ Your handmade press-on nail set has been dispatched via *${courier}* with tracking number *${awb}*${trackingUrl ? ` (${trackingUrl})` : ""}. Thank you for ordering! 💅🏻`;
          const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}`;
          if (confirm("Order marked as DISPATCHED! Would you like to open WhatsApp to send tracking details to the client?")) {
            window.open(waUrl, "_blank");
          }
        } else {
          alert("Order successfully marked as DISPATCHED!");
        }

        loadActiveTabData();
      } catch (err) {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = err.message || "Failed to update dispatch status.";
        }
      } finally {
        submitDispBtn.disabled = false;
        submitDispBtn.textContent = "Mark Dispatched & Generate Link";
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 7. APPOINTMENTS & BOOKINGS (DELHI NCR)
  // ---------------------------------------------------------------------------
  async function loadBookings() {
    const tbody = document.getElementById("bookings-table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell"><span class="spinner-sm"></span> Loading appointment bookings...</td></tr>`;
    }

    const status = document.getElementById("bookings-filter-status")?.value || "";
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    params.append("limit", "100");

    try {
      const data = await adminFetch(`/api/admin/bookings?${params.toString()}`);
      state.bookings = data.bookings || data.appointments || [];
      renderBookingsTable();
    } catch (err) {
      console.error("[Bookings Error]:", err.message);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-error-cell">Failed to load bookings: ${escapeHtml(err.message || "Network error")}. <button type="button" class="btn btn-secondary btn-sm" onclick="loadBookings()" style="margin-left: 0.5rem;">↻ Retry</button></td></tr>`;
      }
    }
  }

  const bkgFilter = document.getElementById("bookings-filter-status");
  if (bkgFilter) bkgFilter.addEventListener("change", loadBookings);
  const bkgCohortFilter = document.getElementById("bookings-filter-cohort");
  if (bkgCohortFilter) bkgCohortFilter.addEventListener("change", renderBookingsTable);

  function renderBookingsTable() {
    const tbody = document.getElementById("bookings-table-body");
    if (!tbody) return;

    const cohortFilter = document.getElementById("bookings-filter-cohort")?.value || "";
    let bookingsToDisplay = state.bookings;
    if (cohortFilter === "live") {
      bookingsToDisplay = bookingsToDisplay.filter((b) => !isTestRecord(b));
    } else if (cohortFilter === "test") {
      bookingsToDisplay = bookingsToDisplay.filter((b) => isTestRecord(b));
    }

    if (bookingsToDisplay.length === 0) {
      const emptyMsg = cohortFilter === "live"
        ? "No live customer bookings found matching current filters."
        : (cohortFilter === "test" ? "No test cohort bookings found matching current filters." : "No bookings found matching current filters.");
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty-cell">${emptyMsg}</td></tr>`;
      return;
    }

    tbody.innerHTML = bookingsToDisplay.map((b) => {
      const bookingNumber = b.bookingNumber || b.booking_number || "-";
      const requestedDateRaw = b.requestedDate || b.requested_date;
      const dateStr = requestedDateRaw ? new Date(requestedDateRaw).toLocaleDateString("en-IN") : "-";
      const timeSlot = b.requestedTimeSlot || b.requested_time_slot || "-";
      const customerName = b.customerName || b.customer_name || "Guest Client";
      const customerPhone = b.customerPhone || b.customer_phone || "";
      const serviceName = b.serviceName || b.service_name || b.serviceId || b.service_id || "-";
      const addr = b.serviceAddress || b.service_address || {};
      const locality =
        b.locality ||
        addr.locality ||
        addr.landmark ||
        [addr.city, addr.postalCode || addr.postal_code].filter(Boolean).join(" ") ||
        "Delhi NCR";
      const status = b.bookingStatus || b.booking_status || "REQUESTED";
      const isReq = status === "REQUESTED";
      const isConf = status === "CONFIRMED";

      let cohortBadge = `<span class="badge badge-live" title="Live Customer Booking">Live</span>`;
      if (isSmokeTestRecord(b)) {
        cohortBadge = `<span class="badge badge-smoke" title="Developer Smoke-Test Booking (Preserved)">Smoke</span>`;
      } else if (isTestRecord(b)) {
        cohortBadge = `<span class="badge badge-test" title="Automated Synthetic Test Booking">Test</span>`;
      }

      return `
        <tr>
          <td><strong style="color: var(--gold-primary);">${escapeHtml(bookingNumber)}</strong></td>
          <td><strong>${escapeHtml(dateStr)}</strong></td>
          <td>${escapeHtml(timeSlot)}</td>
          <td>
            <div style="font-weight: 600; display: flex; align-items: center; gap: 0.35rem;">
              <span>${escapeHtml(customerName)}</span>
              ${cohortBadge}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(customerPhone)}</div>
          </td>
          <td>${escapeHtml(serviceName)}</td>
          <td>${escapeHtml(locality)}</td>
          <td><span class="badge ${isConf ? 'badge-confirmed' : (isReq ? 'badge-pending' : 'badge-completed')}">${escapeHtml(status)}</span></td>
          <td>
            <div class="actions-cell">
              ${isReq ? `
                <button type="button" class="btn btn-primary btn-sm" onclick="adminConfirmBooking('${b.id}')">Confirm</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="adminProposeBookingSlot('${b.id}')">Alt Slot</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="adminRejectBooking('${b.id}')">Decline</button>
              ` : `
                <button type="button" class="btn btn-outline btn-sm" onclick="adminContactBookingClient('${escapeHtml(customerPhone)}', '${escapeHtml(bookingNumber)}')">WhatsApp</button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.adminConfirmBooking = async function (bookingId) {
    const startTime = prompt("Enter confirmed start time (e.g. 14:00):", "14:00");
    if (!startTime) return;
    const endTime = prompt("Enter confirmed end time (e.g. 16:00):", "16:00");

    try {
      await adminFetch(`/api/admin/bookings/${bookingId}/confirm`, {
        method: "PATCH",
        body: JSON.stringify({
          confirmed_start_time: startTime,
          confirmed_end_time: endTime || undefined,
        }),
      });
      alert("Appointment confirmed! Schedule locked.");
      loadBookings();
      loadOverview();
    } catch (err) {
      alert("Failed to confirm booking: " + err.message);
    }
  };

  window.adminProposeBookingSlot = async function (bookingId) {
    const date = prompt("Enter alternative date (YYYY-MM-DD):");
    if (!date) return;
    const slot = prompt("Enter proposed time window (e.g. 15:00 - 17:00):");
    if (!slot) return;
    const reason = prompt("Reason for reschedule:", "Artist schedule conflict for original slot");

    try {
      await adminFetch(`/api/admin/bookings/${bookingId}/propose-slot`, {
        method: "PATCH",
        body: JSON.stringify({
          alternative_date: date,
          alternative_time_slot: slot,
          reschedule_reason: reason,
        }),
      });
      alert("Alternative slot proposed! Action token generated for client.");
      loadBookings();
    } catch (err) {
      alert("Failed to propose alternative slot: " + err.message);
    }
  };

  window.adminRejectBooking = async function (bookingId) {
    const reason = prompt("Enter reason for declining appointment:");
    if (!reason) return;

    try {
      await adminFetch(`/api/admin/bookings/${bookingId}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      alert("Appointment request declined.");
      loadBookings();
      loadOverview();
    } catch (err) {
      alert("Failed to decline booking: " + err.message);
    }
  };

  window.adminContactBookingClient = function (phone, bookingNum) {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const text = `Hi! This is Divya from Nails by Divya. I am contacting you regarding your at-home appointment request *${bookingNum}*.`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  // ---------------------------------------------------------------------------
  // 8. PRODUCT CATALOG CMS
  // ---------------------------------------------------------------------------
  async function loadProducts() {
    const tbody = document.getElementById("products-table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell"><span class="spinner-sm"></span> Loading product catalog...</td></tr>`;
    }

    const cat = document.getElementById("products-filter-category")?.value || "";
    const search = document.getElementById("products-search-input")?.value || "";
    const params = new URLSearchParams();
    if (cat) params.append("category", cat);
    if (search) params.append("search", search);
    params.append("limit", "100");

    try {
      const data = await adminFetch(`/api/admin/products?${params.toString()}`);
      state.products = data.products || [];
      renderProductsTable();
    } catch (err) {
      console.error("[Products Error]:", err.message);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-error-cell">Failed to load products: ${escapeHtml(err.message || "Network error")}. <button type="button" class="btn btn-secondary btn-sm" onclick="loadProducts()" style="margin-left: 0.5rem;">↻ Retry</button></td></tr>`;
      }
    }
  }

  const prodCatFilter = document.getElementById("products-filter-category");
  if (prodCatFilter) prodCatFilter.addEventListener("change", loadProducts);
  const prodSearch = document.getElementById("products-search-input");
  if (prodSearch) {
    let timer;
    prodSearch.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(loadProducts, 300);
    });
  }

  function renderProductsTable() {
    const tbody = document.getElementById("products-table-body");
    if (!tbody) return;

    if (state.products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No products found.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.products.map((p) => {
      const imgUrl = p.primary_image_url || p.primaryImageUrl || "assets/press-on/1.png";
      const isAvail = Boolean(p.isAvailable !== undefined ? p.isAvailable : p.is_available);
      const isArch = Boolean(p.isArchived || p.is_archived);

      return `
        <tr style="${isArch ? 'opacity: 0.5;' : ''}">
          <td>
            <img src="${imgUrl}" alt="${escapeHtml(p.name)}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: #eee;">
          </td>
          <td><strong>${p.sku}</strong></td>
          <td>
            <div style="font-weight: 600;">${escapeHtml(p.name)}</div>
            ${p.is_made_to_order ? `<span style="font-size: 0.72rem; color: var(--text-muted);">Made-to-Order</span>` : ""}
          </td>
          <td>${p.categoryName || p.categoryId}</td>
          <td><strong>₹${p.basePrice || p.base_price}</strong></td>
          <td>
            <button type="button" class="btn btn-sm ${isAvail ? 'btn-success' : 'btn-secondary'}" onclick="adminToggleProduct('${p.id}', ${!isAvail})">
              ${isAvail ? 'Available' : 'Paused'}
            </button>
          </td>
          <td>
            <div class="actions-cell">
              <button type="button" class="btn btn-secondary btn-sm" onclick="adminOpenEditProduct('${p.id}')">Edit</button>
              ${!isArch ? `<button type="button" class="btn btn-outline btn-sm" onclick="adminArchiveProduct('${p.id}')">Archive</button>` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.adminToggleProduct = async function (productId, nextStatus) {
    try {
      await adminFetch(`/api/admin/products/${productId}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ is_available: nextStatus }),
      });
      loadProducts();
    } catch (err) {
      alert("Failed to toggle availability: " + err.message);
    }
  };

  window.adminArchiveProduct = async function (productId) {
    if (!confirm("Are you sure you want to archive this product? It will be unpublished while preserving historical orders.")) return;
    try {
      await adminFetch(`/api/admin/products/${productId}/archive`, {
        method: "POST",
      });
      loadProducts();
    } catch (err) {
      alert("Failed to archive product: " + err.message);
    }
  };

  const createProdBtn = document.getElementById("btn-open-create-product");
  if (createProdBtn) {
    createProdBtn.addEventListener("click", () => {
      document.getElementById("prod-id").value = "";
      document.getElementById("product-form-title").textContent = "Create New Handcrafted Set";
      document.getElementById("prod-name").value = "";
      document.getElementById("prod-sku").value = "";
      document.getElementById("prod-price").value = "";
      document.getElementById("prod-desc").value = "";
      document.getElementById("prod-craft").value = "";
      document.getElementById("prod-image-url").value = "";
      document.getElementById("prod-image-file").value = "";
      document.getElementById("prod-available").checked = true;
      document.getElementById("prod-made-to-order").checked = true;
      adminOpenModal("modal-product-form");
    });
  }

  window.adminOpenEditProduct = function (productId) {
    const p = state.products.find((prod) => prod.id === productId);
    if (!p) return;

    document.getElementById("prod-id").value = p.id;
    document.getElementById("product-form-title").textContent = `Edit Product: ${p.sku}`;
    document.getElementById("prod-name").value = p.name;
    document.getElementById("prod-sku").value = p.sku;
    document.getElementById("prod-category").value = p.categoryId || p.category_id || "wedding";
    document.getElementById("prod-price").value = p.basePrice || p.base_price;
    document.getElementById("prod-desc").value = p.description || "";
    document.getElementById("prod-craft").value = p.craftsmanshipDetails || p.craftsmanship_details || "";
    document.getElementById("prod-image-url").value = p.primary_image_url || p.primaryImageUrl || "";
    document.getElementById("prod-image-file").value = "";
    document.getElementById("prod-available").checked = Boolean(p.isAvailable !== undefined ? p.isAvailable : p.is_available);
    document.getElementById("prod-made-to-order").checked = Boolean(p.isMadeToOrder !== undefined ? p.isMadeToOrder : p.is_made_to_order);

    adminOpenModal("modal-product-form");
  };

  const saveProdBtn = document.getElementById("btn-save-product");
  if (saveProdBtn) {
    saveProdBtn.addEventListener("click", async () => {
      const prodId = document.getElementById("prod-id").value;
      const name = document.getElementById("prod-name").value.trim();
      const sku = document.getElementById("prod-sku").value.trim();
      const categoryId = document.getElementById("prod-category").value;
      const basePrice = parseFloat(document.getElementById("prod-price").value);
      const description = document.getElementById("prod-desc").value.trim();
      const craft = document.getElementById("prod-craft").value.trim();
      const isAvailable = document.getElementById("prod-available").checked;
      const isMadeToOrder = document.getElementById("prod-made-to-order").checked;
      const fileInput = document.getElementById("prod-image-file");
      let imageUrl = document.getElementById("prod-image-url").value.trim();
      const errEl = document.getElementById("prod-error-msg");

      if (!name || !sku || isNaN(basePrice) || !description) {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Please fill in all required fields (Name, SKU, Price, Description).";
        }
        return;
      }

      saveProdBtn.disabled = true;
      saveProdBtn.textContent = "Saving...";

      try {
        // Upload photo if file selected
        if (fileInput && fileInput.files && fileInput.files[0]) {
          imageUrl = await uploadFile(fileInput.files[0]);
        }

        const payload = {
          name,
          sku,
          category_id: categoryId,
          base_price: basePrice,
          description,
          craftsmanship_details: craft || undefined,
          is_available: isAvailable,
          is_made_to_order: isMadeToOrder,
        };

        if (imageUrl) {
          payload.images = [{ image_url: imageUrl, alt_text: name, is_hero: true }];
        }

        if (prodId) {
          await adminFetch(`/api/admin/products/${prodId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        } else {
          await adminFetch("/api/admin/products", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }

        adminCloseModal("modal-product-form");
        loadProducts();
      } catch (err) {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = err.message || "Failed to save product.";
        }
      } finally {
        saveProdBtn.disabled = false;
        saveProdBtn.textContent = "Save Product";
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 9. PORTFOLIO LOOKBOOK CMS
  // ---------------------------------------------------------------------------
  async function loadPortfolio() {
    const grid = document.getElementById("portfolio-grid");
    if (grid) {
      grid.innerHTML = `<div class="table-empty-cell" style="grid-column: 1 / -1;"><span class="spinner-sm"></span> Loading portfolio artworks...</div>`;
    }

    const cat = document.getElementById("portfolio-filter-category")?.value || "";
    const params = new URLSearchParams();
    if (cat) params.append("category", cat);
    params.append("limit", "150");

    try {
      const data = await adminFetch(`/api/admin/portfolio?${params.toString()}`);
      state.portfolio = data.artworks || [];
      renderPortfolioGrid();
    } catch (err) {
      console.error("[Portfolio Error]:", err.message);
      if (grid) {
        grid.innerHTML = `<div class="table-error-cell" style="grid-column: 1 / -1;">Failed to load portfolio: ${escapeHtml(err.message || "Network error")}. <button type="button" class="btn btn-secondary btn-sm" onclick="loadPortfolio()" style="margin-left: 0.5rem;">↻ Retry</button></div>`;
      }
    }
  }

  const portFilter = document.getElementById("portfolio-filter-category");
  if (portFilter) portFilter.addEventListener("change", loadPortfolio);

  function renderPortfolioGrid() {
    const grid = document.getElementById("portfolio-grid");
    if (!grid) return;

    if (state.portfolio.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">No artworks found.</div>`;
      return;
    }

    grid.innerHTML = state.portfolio.map((art) => {
      const isActive = Boolean(art.is_active);
      return `
        <div class="cms-card" style="${!isActive ? 'opacity: 0.6;' : ''}">
          <img src="${art.image_url}" alt="${escapeHtml(art.alt_text || art.name)}" class="cms-card-image">
          <div class="cms-card-body">
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--gold-primary); font-weight: 600;">#${art.design_number} &bull; ${art.category_name || art.category_id}</div>
            <h4 class="cms-card-title">${escapeHtml(art.name)}</h4>
            <div class="cms-card-footer">
              <button type="button" class="btn btn-sm ${isActive ? 'btn-success' : 'btn-secondary'}" onclick="adminTogglePortfolio('${art.id}', ${!isActive})">
                ${isActive ? 'Published' : 'Hidden'}
              </button>
              <div style="display: flex; gap: 0.35rem;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="adminOpenEditPortfolio('${art.id}')">Edit</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="adminDeletePortfolio('${art.id}')">✕</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  window.adminTogglePortfolio = async function (id, nextStatus) {
    try {
      await adminFetch(`/api/admin/portfolio/${id}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: nextStatus }),
      });
      loadPortfolio();
    } catch (err) {
      alert("Failed to toggle artwork visibility: " + err.message);
    }
  };

  window.adminDeletePortfolio = async function (id) {
    if (!confirm("Are you sure you want to remove this artwork from the lookbook?")) return;
    try {
      await adminFetch(`/api/admin/portfolio/${id}`, {
        method: "DELETE",
      });
      loadPortfolio();
    } catch (err) {
      alert("Failed to delete artwork: " + err.message);
    }
  };

  const createPortBtn = document.getElementById("btn-open-create-portfolio");
  if (createPortBtn) {
    createPortBtn.addEventListener("click", () => {
      document.getElementById("port-id").value = "";
      document.getElementById("portfolio-form-title").textContent = "Upload Lookbook Artwork";
      document.getElementById("port-name").value = "";
      document.getElementById("port-alt").value = "";
      document.getElementById("port-image-url").value = "";
      document.getElementById("port-image-file").value = "";
      document.getElementById("port-active").checked = true;
      adminOpenModal("modal-portfolio-form");
    });
  }

  window.adminOpenEditPortfolio = function (id) {
    const art = state.portfolio.find((a) => a.id === id);
    if (!art) return;

    document.getElementById("port-id").value = art.id;
    document.getElementById("portfolio-form-title").textContent = `Edit Artwork: ${art.name}`;
    document.getElementById("port-name").value = art.name;
    document.getElementById("port-category").value = art.category_id || "chrome";
    document.getElementById("port-image-url").value = art.image_url;
    document.getElementById("port-image-file").value = "";
    document.getElementById("port-alt").value = art.alt_text || "";
    document.getElementById("port-active").checked = Boolean(art.is_active);

    adminOpenModal("modal-portfolio-form");
  };

  const savePortBtn = document.getElementById("btn-save-portfolio");
  if (savePortBtn) {
    savePortBtn.addEventListener("click", async () => {
      const portId = document.getElementById("port-id").value;
      const name = document.getElementById("port-name").value.trim();
      const categoryId = document.getElementById("port-category").value;
      const alt = document.getElementById("port-alt").value.trim();
      const isActive = document.getElementById("port-active").checked;
      const fileInput = document.getElementById("port-image-file");
      let imageUrl = document.getElementById("port-image-url").value.trim();
      const errEl = document.getElementById("port-error-msg");

      if (!name) {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Artwork title is required.";
        }
        return;
      }

      savePortBtn.disabled = true;
      savePortBtn.textContent = "Saving...";

      try {
        if (fileInput && fileInput.files && fileInput.files[0]) {
          imageUrl = await uploadFile(fileInput.files[0]);
        }

        if (!imageUrl) {
          throw new Error("Artwork photograph is required. Please upload an image or enter a URL.");
        }

        const payload = {
          name,
          category_id: categoryId,
          image_url: imageUrl,
          alt_text: alt || name,
          is_active: isActive,
        };

        if (portId) {
          await adminFetch(`/api/admin/portfolio/${portId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        } else {
          await adminFetch("/api/admin/portfolio", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }

        adminCloseModal("modal-portfolio-form");
        loadPortfolio();
      } catch (err) {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = err.message || "Failed to save artwork.";
        }
      } finally {
        savePortBtn.disabled = false;
        savePortBtn.textContent = "Save Artwork";
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 10. REVIEWS MODERATION CMS
  // ---------------------------------------------------------------------------
  async function loadReviews() {
    const tbody = document.getElementById("reviews-table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell"><span class="spinner-sm"></span> Loading customer reviews...</td></tr>`;
    }

    const status = document.getElementById("reviews-filter-status")?.value || "all";
    const params = new URLSearchParams();
    if (status) params.append("status", status);

    try {
      const data = await adminFetch(`/api/admin/reviews?${params.toString()}`);
      state.reviews = data.reviews || [];
      renderReviewsTable();
    } catch (err) {
      console.error("[Reviews Error]:", err.message);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-error-cell">Failed to load reviews: ${escapeHtml(err.message || "Network error")}. <button type="button" class="btn btn-secondary btn-sm" onclick="loadReviews()" style="margin-left: 0.5rem;">↻ Retry</button></td></tr>`;
      }
    }
  }

  const revFilter = document.getElementById("reviews-filter-status");
  if (revFilter) revFilter.addEventListener("change", loadReviews);

  function renderReviewsTable() {
    const tbody = document.getElementById("reviews-table-body");
    if (!tbody) return;

    if (state.reviews.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No reviews found.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.reviews.map((r) => {
      const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "-";
      const stars = "★".repeat(Math.min(Math.max(r.rating || 5, 1), 5));
      const statusBadge = r.is_approved ? '<span class="badge badge-verified">Approved</span>' : (r.moderated_at ? '<span class="badge badge-failed">Rejected</span>' : '<span class="badge badge-pending">Pending</span>');

      const verificationBadge = r.order_id
        ? '<span style="display:inline-block; margin-top: 4px; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: rgba(40, 167, 69, 0.12); color: #218838; font-weight: 600;">Contact-Matched Order Feedback</span>'
        : (r.booking_id
            ? '<span style="display:inline-block; margin-top: 4px; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: rgba(40, 167, 69, 0.12); color: #218838; font-weight: 600;">Contact-Matched Appointment Feedback</span>'
            : '<span style="display:inline-block; margin-top: 4px; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: rgba(108, 117, 125, 0.12); color: #6c757d; font-weight: 500;">Storefront Feedback</span>');

      return `
        <tr>
          <td>${dateStr}</td>
          <td><strong>${escapeHtml(r.customer_name)}</strong></td>
          <td>${r.customer_phone || "-"}</td>
          <td><span style="color: var(--gold-primary); font-size: 1.1rem;">${stars}</span></td>
          <td>
            ${escapeHtml(r.service_or_product_tag || "-")}
            <br>${verificationBadge}
          </td>
          <td>
            <div style="max-width: 280px; font-size: 0.85rem; line-height: 1.4;">
              ${escapeHtml(r.review_text)}
            </div>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="actions-cell">
              ${!r.is_approved ? `
                <button type="button" class="btn btn-success btn-sm" onclick="adminApproveReview('${r.id}')">Approve</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="adminRejectReview('${r.id}')">Reject</button>
              ` : `
                <button type="button" class="btn btn-outline btn-sm" onclick="adminRejectReview('${r.id}')">Unpublish</button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.adminApproveReview = async function (id) {
    try {
      await adminFetch(`/api/admin/reviews/${id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ notes: "Approved for publication by Divya" }),
      });
      loadReviews();
    } catch (err) {
      alert("Failed to approve review: " + err.message);
    }
  };

  window.adminRejectReview = async function (id) {
    const reason = prompt("Enter moderation note for rejection:");
    if (reason === null) return;
    try {
      await adminFetch(`/api/admin/reviews/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ notes: reason || "Declined during moderation" }),
      });
      loadReviews();
    } catch (err) {
      alert("Failed to reject review: " + err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // 11. COMMUNICATIONS & WHATSAPP QUEUE
  // ---------------------------------------------------------------------------
  async function loadCommunications() {
    const tbody = document.getElementById("comms-table-body");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty-cell"><span class="spinner-sm"></span> Loading notifications log...</td></tr>`;
    }

    const status = document.getElementById("comms-filter-status")?.value || "";
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    params.append("limit", "50");

    try {
      const data = await adminFetch(`/api/admin/communications/notifications?${params.toString()}`);
      state.notifications = data.notifications || [];
      renderCommunicationsTable();
    } catch (err) {
      console.error("[Communications Error]:", err.message);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-error-cell">Failed to load communications: ${escapeHtml(err.message || "Network error")}. <button type="button" class="btn btn-secondary btn-sm" onclick="loadCommunications()" style="margin-left: 0.5rem;">↻ Retry</button></td></tr>`;
      }
    }
  }

  const commsFilter = document.getElementById("comms-filter-status");
  if (commsFilter) commsFilter.addEventListener("change", loadCommunications);

  function renderCommunicationsTable() {
    const tbody = document.getElementById("comms-table-body");
    if (!tbody) return;

    if (state.notifications.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No notification records in queue.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.notifications.map((n) => {
      const dateStr = n.created_at ? new Date(n.created_at).toLocaleString("en-IN") : "-";
      const statusBadge = n.status === "DELIVERED" ? "badge-verified" : (n.status === "FAILED" ? "badge-failed" : "badge-pending");

      return `
        <tr>
          <td>${dateStr}</td>
          <td><strong>${n.recipient}</strong></td>
          <td>${n.template_name || n.templateName || "order_update"}</td>
          <td><span class="badge ${statusBadge}">${n.status}</span></td>
          <td><span style="font-family: monospace; font-size: 0.8rem;">${n.provider_message_id || "-"}</span></td>
          <td>
            <div class="actions-cell">
              ${n.wa_link || n.waLink ? `
                <a href="${n.wa_link || n.waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">
                  <span>Send via WhatsApp ↗</span>
                </a>
              ` : ""}
              ${n.status === "FAILED" ? `
                <button type="button" class="btn btn-secondary btn-sm" onclick="adminRetryNotification('${n.id}')">Retry</button>
              ` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.adminRetryNotification = async function (id) {
    try {
      await adminFetch(`/api/admin/communications/notifications/${id}/retry`, {
        method: "POST",
      });
      loadCommunications();
    } catch (err) {
      alert("Failed to retry notification: " + err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // 11B. OWNER OPERATIONS: STAFF, SETTINGS, AUDIT LOGS (super_operator)
  // ---------------------------------------------------------------------------
  async function loadStaff() {
    const tbody = document.getElementById("staff-table-body");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading staff accounts...</td></tr>`;

    try {
      const data = await adminFetch("/api/admin/staff");
      const staff = data.staff || [];
      if (staff.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No administrative staff records found.</td></tr>`;
        return;
      }

      tbody.innerHTML = staff.map((s) => {
        const rolePillClass = s.roleId === "super_operator" ? "badge-verified" : (s.roleId === "artist_divya" ? "badge-pending" : "badge-outline");
        const statusClass = s.isActive ? "badge-verified" : "badge-failed";
        const perms = Array.isArray(s.permissions) ? s.permissions : [];
        const permSnippet = perms.slice(0, 3).join(", ") + (perms.length > 3 ? ` +${perms.length - 3} more` : "");

        return `
          <tr>
            <td><strong>${escapeHtml(s.displayName || "Admin User")}</strong></td>
            <td><code style="font-size: 0.82rem;">${escapeHtml(s.phone || "—")}</code></td>
            <td><span class="badge ${rolePillClass}">${escapeHtml(s.roleName || s.roleId)}</span></td>
            <td style="font-size: 0.76rem; color: var(--text-sidebar-muted); max-width: 320px;" title="${escapeHtml(perms.join(', '))}">
              ${escapeHtml(permSnippet || "None")}
            </td>
            <td><span class="badge ${statusClass}">${s.isActive ? "Active" : "Inactive"}</span></td>
          </tr>
        `;
      }).join("");
    } catch (err) {
      console.error("[Staff Load Error]:", err.message);
      tbody.innerHTML = `<tr><td colspan="5" style="color: #c62828; text-align: center; padding: 1.5rem;">Failed to load staff accounts: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function loadSettings() {
    const tbody = document.getElementById("settings-table-body");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading studio configuration...</td></tr>`;

    try {
      const data = await adminFetch("/api/admin/settings");
      const settings = data.settings || [];
      if (settings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">No configuration settings found.</td></tr>`;
        return;
      }

      tbody.innerHTML = settings.map((st) => {
        const valStr = typeof st.value === "object" ? JSON.stringify(st.value, null, 2) : String(st.value);
        const updatedStr = st.updatedAt ? new Date(st.updatedAt).toLocaleDateString("en-IN") : "—";

        return `
          <tr>
            <td><strong style="font-family: monospace; font-size: 0.82rem; color: var(--gold-primary);">${escapeHtml(st.key)}</strong></td>
            <td style="font-size: 0.8rem; color: var(--text-light); max-width: 260px;">${escapeHtml(st.description || "—")}</td>
            <td>
              <pre style="margin: 0; font-size: 0.72rem; background: rgba(0,0,0,0.25); padding: 0.4rem 0.6rem; border-radius: 4px; max-width: 380px; max-height: 120px; overflow: auto; color: var(--text-sidebar-muted); font-family: monospace;">${escapeHtml(valStr)}</pre>
            </td>
            <td style="font-size: 0.78rem; color: var(--text-sidebar-muted);">${updatedStr}</td>
          </tr>
        `;
      }).join("");
    } catch (err) {
      console.error("[Settings Load Error]:", err.message);
      tbody.innerHTML = `<tr><td colspan="4" style="color: #c62828; text-align: center; padding: 1.5rem;">Failed to load configuration settings: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function loadAuditLogs() {
    const tbody = document.getElementById("audit-table-body");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading immutable audit logs...</td></tr>`;

    try {
      const data = await adminFetch("/api/admin/audit-logs?limit=50");
      const logs = data.logs || [];
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No security audit events recorded.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map((l) => {
        const tsStr = l.createdAt ? new Date(l.createdAt).toLocaleString("en-IN") : "—";
        const actor = l.actorPhone || (l.actorUserId ? l.actorUserId.slice(0, 8) : "System");
        const detailsStr = typeof l.details === "object" ? JSON.stringify(l.details) : String(l.details || "");

        return `
          <tr>
            <td style="font-size: 0.78rem; white-space: nowrap;">${tsStr}</td>
            <td><code style="font-size: 0.82rem;">${escapeHtml(actor)}</code></td>
            <td><span class="badge badge-outline">${escapeHtml(l.action)}</span></td>
            <td><strong style="font-size: 0.82rem;">${escapeHtml(l.targetEntity || "—")}</strong></td>
            <td><code style="font-size: 0.76rem;">${escapeHtml(l.targetId ? l.targetId.slice(0, 8) : "—")}</code></td>
            <td style="font-size: 0.74rem; color: var(--text-sidebar-muted); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(detailsStr)}">
              ${escapeHtml(detailsStr || "—")}
            </td>
          </tr>
        `;
      }).join("");
    } catch (err) {
      console.error("[Audit Logs Load Error]:", err.message);
      tbody.innerHTML = `<tr><td colspan="6" style="color: #c62828; text-align: center; padding: 1.5rem;">Failed to load security audit logs: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // ---------------------------------------------------------------------------
  // 12. FILE UPLOADER (TEMPORARY STAGING STORAGE)
  // ---------------------------------------------------------------------------
  async function uploadFile(file) {
    if (!file) throw new Error("No file selected.");
    if (file.size > 2 * 1024 * 1024) {
      throw new Error("Image exceeds maximum allowed size of 2MB.");
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result;
          const res = await adminFetch("/api/admin/uploads", {
            method: "POST",
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
              image: base64Data,
            }),
          });
          resolve(res.url);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file from disk."));
      reader.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------------------
  // 13. MODAL HELPERS & UTILITIES
  // ---------------------------------------------------------------------------
  window.adminOpenModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  };

  window.adminCloseModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
  };

  // Close modals on overlay background click
  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "";
      }
    });
  });

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initialize Admin Portal
  checkAuth();
})();
