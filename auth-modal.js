/**
 * ==============================================================================
 * NAILS BY DIVYA — CUSTOMER EMAIL AUTHENTICATION MODAL (`auth-modal.js`)
 * Nails by Divya Platform — Phase 2 Passwordless Email Authentication
 *
 * Implements accessible, email-only passwordless magic-link customer sign-in
 * adhering to Modern Web Guidance using native <dialog> semantics.
 * ==============================================================================
 */

(function () {
  "use strict";

  const LAST_LOGIN_EMAIL_KEY = "nbd_last_login_email";

  let dialogEl = null;
  let emailStepEl = null;
  let emailSentStepEl = null;
  let emailInputEl = null;
  let sendEmailBtn = null;
  let resendEmailBtn = null;
  let emailSentTargetEl = null;
  let successStepEl = null;
  let errorBannerEl = null;
  let currentEmail = "";

  /**
   * Injects the native <dialog> modal markup into the DOM if not already present.
   */
  function ensureDialogMarkup() {
    if (document.getElementById("auth-dialog")) {
      dialogEl = document.getElementById("auth-dialog");
      return;
    }

    const modalHtml = `
      <dialog id="auth-dialog" class="auth-dialog" aria-labelledby="auth-dialog-title" closedby="any">
        <div class="auth-dialog-content">
          <button type="button" class="auth-dialog-close" id="auth-dialog-close" aria-label="Close sign in dialog">&times;</button>

          <div class="auth-dialog-brand">
            <img src="assets/branding/icon1submark%20gold.png" alt="" class="auth-brand-icon" aria-hidden="true">
            <span class="auth-brand-name">Nails by Divya</span>
          </div>

          <div class="auth-error-banner" id="auth-error-banner" role="alert" style="display: none;"></div>

          <!-- STEP 1: EMAIL MAGIC-LINK INPUT (EMAIL-ONLY CUSTOMER SIGN-IN) -->
          <div class="auth-step is-active" id="auth-step-email">
            <h2 id="auth-dialog-title" class="auth-step-title">Sign In with Email</h2>
            <p class="auth-step-subtitle">
              Enter your email address and we'll send a secure, single-use sign-in link directly to your inbox. View your press-on orders, appointments, and bespoke nail sizing.
            </p>

            <form id="auth-email-form" class="auth-form" onsubmit="return false;">
              <div class="auth-email-field">
                <input
                  type="email"
                  id="auth-email-input"
                  class="auth-input auth-email-input"
                  placeholder="you@example.com"
                  autocomplete="email"
                  aria-label="Email address"
                  required
                />
              </div>

              <button type="submit" id="auth-send-email-btn" class="button primary-button auth-submit-btn">
                <span class="auth-btn-text">Send Sign-In Link &rarr;</span>
                <span class="auth-btn-spinner" style="display: none;"></span>
              </button>
            </form>

            <p class="auth-step-note">
              Passwordless email verification link valid for 15 minutes. No password required.
            </p>
          </div>

          <!-- STEP 2: EMAIL SENT CONFIRMATION -->
          <div class="auth-step" id="auth-step-email-sent" style="display: none;">
            <div class="auth-success-icon" aria-hidden="true">&#9993;</div>
            <h2 class="auth-step-title">Check Your Inbox</h2>
            <p class="auth-step-subtitle">
              If an inbox exists at <strong id="auth-email-sent-target">your email</strong>, we have sent a single-use sign-in link valid for 15 minutes.
            </p>
            <div class="auth-resend-row" style="justify-content: center; gap: 1rem;">
              <button type="button" id="auth-resend-email-btn" class="auth-resend-link">Send Another Link</button>
              <span aria-hidden="true" style="color: rgba(125,86,92,0.35);">&bull;</span>
              <button type="button" id="auth-change-email-btn" class="auth-resend-link">Use Another Email</button>
            </div>
          </div>

          <!-- STEP 3: SUCCESS FEEDBACK -->
          <div class="auth-step" id="auth-step-success" style="display: none;">
            <div class="auth-success-icon">&#10003;</div>
            <h2 class="auth-step-title">Signed In!</h2>
            <p class="auth-step-subtitle">Welcome to Nails by Divya. Loading your account...</p>
          </div>
        </div>
      </dialog>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
    dialogEl = document.getElementById("auth-dialog");
  }

  /**
   * Binds modal controls and email submission events.
   */
  function bindDialogEvents() {
    if (!dialogEl) return;

    emailStepEl = document.getElementById("auth-step-email");
    emailSentStepEl = document.getElementById("auth-step-email-sent");
    emailInputEl = document.getElementById("auth-email-input");
    sendEmailBtn = document.getElementById("auth-send-email-btn");
    resendEmailBtn = document.getElementById("auth-resend-email-btn");
    emailSentTargetEl = document.getElementById("auth-email-sent-target");
    successStepEl = document.getElementById("auth-step-success");
    errorBannerEl = document.getElementById("auth-error-banner");

    const closeBtn = document.getElementById("auth-dialog-close");
    const emailForm = document.getElementById("auth-email-form");
    const changeEmailBtn = document.getElementById("auth-change-email-btn");

    if (dialogEl.dataset.eventsBound === "true") return;
    dialogEl.dataset.eventsBound = "true";

    if (closeBtn) {
      closeBtn.addEventListener("click", () => closeDialog());
    }

    // Light dismiss fallback for browsers without native `closedby="any"`
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e) => {
        const r = dialogEl.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      dialogEl.addEventListener("pointerdown", (e) => {
        pressedOutside = isOutside(e);
      });
      dialogEl.addEventListener("pointerup", (e) => {
        if (pressedOutside && isOutside(e)) {
          closeDialog();
        }
      });
    }

    if (emailInputEl) {
      emailInputEl.addEventListener("input", () => clearError());
    }
    if (emailForm) {
      emailForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSendEmailLink();
      });
    }
    if (resendEmailBtn) {
      resendEmailBtn.addEventListener("click", () => {
        if (currentEmail) handleSendEmailLink(currentEmail);
      });
    }
    if (changeEmailBtn) {
      changeEmailBtn.addEventListener("click", () => {
        clearError();
        showStep("email");
      });
    }
  }

  function showError(msg) {
    if (errorBannerEl) {
      errorBannerEl.textContent = msg;
      errorBannerEl.style.display = "block";
    }
  }

  function clearError() {
    if (errorBannerEl) {
      errorBannerEl.textContent = "";
      errorBannerEl.style.display = "none";
    }
  }

  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    const textEl = btn.querySelector(".auth-btn-text");
    const spinnerEl = btn.querySelector(".auth-btn-spinner");
    btn.disabled = isLoading;
    if (textEl) textEl.style.opacity = isLoading ? "0.3" : "1";
    if (spinnerEl) spinnerEl.style.display = isLoading ? "inline-block" : "none";
  }

  /**
   * Toggles between modal steps ('email', 'email-sent', 'success').
   * @param {'email' | 'email-sent' | 'success'} stepName
   */
  function showStep(stepName) {
    if (!emailStepEl || !successStepEl) return;
    emailStepEl.style.display = stepName === "email" ? "block" : "none";
    if (emailSentStepEl) emailSentStepEl.style.display = stepName === "email-sent" ? "block" : "none";
    successStepEl.style.display = stepName === "success" ? "block" : "none";

    if (stepName === "email" && emailInputEl) {
      if (!emailInputEl.value && currentEmail) emailInputEl.value = currentEmail;
      setTimeout(() => emailInputEl.focus(), 100);
    } else if (stepName === "email-sent" && emailSentTargetEl && currentEmail) {
      emailSentTargetEl.textContent = currentEmail;
    }
  }

  /**
   * Handles sending a passwordless email sign-in link via Resend.
   */
  async function handleSendEmailLink(explicitEmail = null) {
    clearError();
    const rawEmail = explicitEmail || (emailInputEl ? emailInputEl.value.trim() : "");
    const cleanEmail = rawEmail.toLowerCase();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      showError("Please enter a valid email address.");
      if (emailInputEl) emailInputEl.focus();
      return;
    }

    setButtonLoading(sendEmailBtn, true);
    if (resendEmailBtn) resendEmailBtn.disabled = true;

    try {
      await window.NailsAuth.requestEmailLink(cleanEmail);
      currentEmail = cleanEmail;
      try {
        sessionStorage.setItem(LAST_LOGIN_EMAIL_KEY, cleanEmail);
      } catch {}
      showStep("email-sent");
    } catch (err) {
      showError(err.message || "Unable to send sign-in link. Please try again.");
    } finally {
      setButtonLoading(sendEmailBtn, false);
      if (resendEmailBtn) resendEmailBtn.disabled = false;
    }
  }

  /**
   * Opens the email-only customer authentication dialog.
   * @param {string} [initialEmail] Optional email address to prefill
   */
  function openDialog(initialEmail = "") {
    ensureDialogMarkup();
    bindDialogEvents();
    clearError();

    if (typeof initialEmail === "string" && initialEmail.includes("@")) {
      currentEmail = initialEmail.trim().toLowerCase();
      if (emailInputEl) emailInputEl.value = currentEmail;
    }

    showStep("email");

    if (typeof dialogEl.showModal === "function") {
      dialogEl.showModal();
    } else {
      dialogEl.setAttribute("open", "");
    }
  }

  function closeDialog() {
    if (!dialogEl) return;
    if (typeof dialogEl.close === "function") {
      dialogEl.close();
    } else {
      dialogEl.removeAttribute("open");
    }
  }

  /**
   * Injects header Account / Sign In buttons into navigation across all pages.
   */
  function updateNavAuthButtons(user) {
    document.querySelectorAll(".nav-auth-btn").forEach((btn) => {
      const closeMobileDrawerIfOpen = () => {
        const navToggle = document.querySelector(".nav-toggle");
        if (navToggle && (navToggle.getAttribute("aria-expanded") === "true" || navToggle.classList.contains("is-active"))) {
          navToggle.click();
        }
      };

      if (user) {
        btn.classList.add("is-logged-in");
        const rawName = (user.profile && user.profile.full_name) || "";
        const isSynthetic = !rawName || rawName.trim().toLowerCase() === "customer" || rawName.trim().toLowerCase() === "bespoke client";
        const displayName = isSynthetic ? "My Account" : rawName.trim();
        const initial = isSynthetic ? "D" : displayName.charAt(0).toUpperCase();
        btn.innerHTML = `
          <span class="nav-auth-avatar" aria-hidden="true">${initial}</span>
          <span class="nav-auth-label">Account</span>
        `;
        btn.setAttribute("aria-label", `Account for ${displayName}`);
        btn.onclick = (e) => {
          e.preventDefault();
          closeMobileDrawerIfOpen();
          window.location.href = "account.html";
        };
      } else {
        btn.classList.remove("is-logged-in");
        btn.innerHTML = `
          <span class="nav-auth-label">Sign In</span>
        `;
        btn.setAttribute("aria-label", "Sign In or Register");
        btn.onclick = (e) => {
          e.preventDefault();
          closeMobileDrawerIfOpen();
          openDialog();
        };
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureDialogMarkup();
    bindDialogEvents();

    if (window.NailsAuth) {
      window.NailsAuth.init();
      window.NailsAuth.onAuthChange((user) => {
        updateNavAuthButtons(user);
      });
    }
  });

  window.NailsAuthModal = {
    open: openDialog,
    close: closeDialog,
  };
})();
