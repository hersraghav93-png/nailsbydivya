/**
 * ==============================================================================
 * NAILS BY DIVYA — AUTHENTICATION MODAL CONTROLLER (`auth-modal.js`)
 * Nails by Divya Platform — Phase 1D
 *
 * Implements accessible, mobile-first phone number input and OTP verification
 * adhering to Modern Web Guidance using native <dialog> semantics.
 * ==============================================================================
 */

(function () {
  "use strict";

  let dialogEl = null;
  let phoneInputEl = null;
  let otpInputs = [];
  let phoneStepEl = null;
  let otpStepEl = null;
  let successStepEl = null;
  let errorBannerEl = null;
  let sendOtpBtn = null;
  let verifyOtpBtn = null;
  let resendBtn = null;
  let resendTimerEl = null;
  let countdownInterval = null;
  let currentPhone = "";

  const RESEND_COUNTDOWN_SECONDS = 30;

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

          <!-- STEP 1: PHONE INPUT -->
          <div class="auth-step is-active" id="auth-step-phone">
            <h2 id="auth-dialog-title" class="auth-step-title">Sign In or Register</h2>
            <p class="auth-step-subtitle">Enter your mobile number to access your bespoke nail measurements and saved delivery addresses.</p>

            <form id="auth-phone-form" class="auth-form" onsubmit="return false;">
              <div class="auth-phone-field">
                <span class="auth-phone-prefix" aria-label="Country Code India">+91</span>
                <input
                  type="tel"
                  id="auth-phone-input"
                  class="auth-input auth-phone-input"
                  placeholder="98765 43210"
                  maxlength="10"
                  inputmode="numeric"
                  autocomplete="tel-national"
                  aria-label="10-digit mobile number"
                  required
                />
              </div>

              <div id="recaptcha-container"></div>

              <button type="submit" id="auth-send-otp-btn" class="button primary-button auth-submit-btn">
                <span class="auth-btn-text">Get Verification Code</span>
                <span class="auth-btn-spinner" style="display: none;"></span>
              </button>
            </form>

            <p class="auth-step-note">
              We'll send a 6-digit verification code. No password required.
            </p>
          </div>

          <!-- STEP 2: OTP VERIFICATION -->
          <div class="auth-step" id="auth-step-otp" style="display: none;">
            <button type="button" class="auth-back-btn" id="auth-back-btn" aria-label="Change phone number">
              &larr; <span id="auth-display-phone">+91 XXXXX XXXXX</span> (Edit)
            </button>
            
            <h2 class="auth-step-title">Verify Verification Code</h2>
            <p class="auth-step-subtitle" id="auth-otp-subtitle">Enter the 6-digit verification code sent to your mobile.</p>

            <form id="auth-otp-form" class="auth-form" onsubmit="return false;">
              <div class="auth-otp-grid" id="auth-otp-grid">
                <input type="text" class="auth-otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]*" aria-label="Digit 1" autofocus />
                <input type="text" class="auth-otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]*" aria-label="Digit 2" />
                <input type="text" class="auth-otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]*" aria-label="Digit 3" />
                <input type="text" class="auth-otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]*" aria-label="Digit 4" />
                <input type="text" class="auth-otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]*" aria-label="Digit 5" />
                <input type="text" class="auth-otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]*" aria-label="Digit 6" />
              </div>

              <button type="submit" id="auth-verify-otp-btn" class="button primary-button auth-submit-btn">
                <span class="auth-btn-text">Verify &amp; Continue</span>
                <span class="auth-btn-spinner" style="display: none;"></span>
              </button>
            </form>

            <div class="auth-resend-row">
              <span id="auth-resend-timer" class="auth-timer-text">Resend code in 0:30</span>
              <button type="button" id="auth-resend-btn" class="auth-resend-link" style="display: none;">Resend Code</button>
            </div>
          </div>

          <!-- STEP 3: SUCCESS FEEDBACK -->
          <div class="auth-step" id="auth-step-success" style="display: none;">
            <div class="auth-success-icon">✓</div>
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
   * Binds modal controls, event listeners, and input formatting.
   */
  function bindDialogEvents() {
    if (!dialogEl) return;

    phoneStepEl = document.getElementById("auth-step-phone");
    otpStepEl = document.getElementById("auth-step-otp");
    successStepEl = document.getElementById("auth-step-success");
    errorBannerEl = document.getElementById("auth-error-banner");
    phoneInputEl = document.getElementById("auth-phone-input");
    sendOtpBtn = document.getElementById("auth-send-otp-btn");
    verifyOtpBtn = document.getElementById("auth-verify-otp-btn");
    resendBtn = document.getElementById("auth-resend-btn");
    resendTimerEl = document.getElementById("auth-resend-timer");
    const closeBtn = document.getElementById("auth-dialog-close");
    const backBtn = document.getElementById("auth-back-btn");
    const phoneForm = document.getElementById("auth-phone-form");
    const otpForm = document.getElementById("auth-otp-form");

    otpInputs = Array.from(dialogEl.querySelectorAll(".auth-otp-box"));

    // Close button
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

    // Phone input formatting (strictly numeric, max 10 digits)
    if (phoneInputEl) {
      phoneInputEl.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
        clearError();
      });
    }

    // Phone submit form
    if (phoneForm) {
      phoneForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSendOtp();
      });
    }

    // Back to phone button
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        showStep("phone");
        clearError();
      });
    }

    // OTP 6-box input management
    otpInputs.forEach((box, idx) => {
      box.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\D/g, "");
        e.target.value = val ? val[0] : "";
        clearError();

        // Advance to next input
        if (val && idx < otpInputs.length - 1) {
          otpInputs[idx + 1].focus();
        }

        // If all 6 digits entered, auto-verify
        const fullCode = getOtpCode();
        if (fullCode.length === 6) {
          handleVerifyOtp();
        }
      });

      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && idx > 0) {
          otpInputs[idx - 1].focus();
        }
      });

      // Handle paste across all 6 boxes
      box.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "");
        if (pasted) {
          otpInputs.forEach((input, i) => {
            input.value = pasted[i] || "";
          });
          const lastIdx = Math.min(pasted.length - 1, otpInputs.length - 1);
          if (lastIdx >= 0) {
            otpInputs[lastIdx].focus();
          }
          if (pasted.length >= 6) {
            handleVerifyOtp();
          }
        }
      });
    });

    // OTP submit form
    if (otpForm) {
      otpForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleVerifyOtp();
      });
    }

    // Resend button
    if (resendBtn) {
      resendBtn.addEventListener("click", () => {
        handleResendOtp();
      });
    }
  }

  /**
   * Collects 6 digits from input boxes.
   * @returns {string}
   */
  function getOtpCode() {
    return otpInputs.map((b) => b.value.trim()).join("");
  }

  /**
   * Displays errors in the modal alert banner.
   * @param {string} msg
   */
  function showError(msg) {
    if (errorBannerEl) {
      errorBannerEl.textContent = msg;
      errorBannerEl.style.display = "block";
    }
  }

  /**
   * Displays a prominent, user-friendly maintenance banner when SMS auth is offline.
   */
  function showMaintenanceNotice() {
    if (!errorBannerEl) return;
    errorBannerEl.innerHTML = `
      <div class="auth-maintenance-notice" style="display: flex; flex-direction: column; gap: 0.45rem;">
        <span style="font-weight: 700; color: #9b1c1c;">Online Client Accounts Notice</span>
        <span>SMS authentication is currently undergoing maintenance. Online accounts are temporarily offline, but you can complete your order as a guest or contact Nails by Divya on WhatsApp.</span>
        <a href="https://wa.me/918447391310?text=Hi%20Divya!%20I%20have%20an%20enquiry%20about%20my%20order." target="_blank" rel="noopener" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; margin-top: 0.25rem; padding: 0.45rem 0.85rem; background: #25D366; color: #ffffff; border-radius: 6px; font-weight: 600; font-size: 0.84rem; text-decoration: none;">
          <span>Contact on WhatsApp &rarr;</span>
        </a>
      </div>
    `;
    errorBannerEl.style.display = "block";
  }

  /**
   * Displays a prominent, user-friendly notice when phone verification is unavailable due to disabled SMS billing.
   */
  function showBillingNotice() {
    if (!errorBannerEl) return;
    errorBannerEl.innerHTML = `
      <div class="auth-maintenance-notice" style="display: flex; flex-direction: column; gap: 0.45rem;">
        <span style="font-weight: 700; color: #9b1c1c;">Phone Verification Temporarily Unavailable</span>
        <span>SMS verification is currently unavailable because SMS delivery is not enabled for this project. No verification code was sent to your phone.</span>
        <span style="font-size: 0.82rem; color: #4b5563;">You can complete bespoke press-on orders as a guest or reach out directly to Nails by Divya on WhatsApp for booking enquiries and custom sets.</span>
        <a href="https://wa.me/918447391310?text=Hi%20Divya!%20I'd%20like%20to%20enquire%20about%20an%20order%20or%20booking." target="_blank" rel="noopener" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; margin-top: 0.35rem; padding: 0.5rem 0.85rem; background: #25D366; color: #ffffff; border-radius: 6px; font-weight: 600; font-size: 0.84rem; text-decoration: none;">
          <span>Contact on WhatsApp &rarr;</span>
        </a>
      </div>
    `;
    errorBannerEl.style.display = "block";
  }

  /**
   * Clears the error banner.
   */
  function clearError() {
    if (errorBannerEl) {
      errorBannerEl.textContent = "";
      errorBannerEl.style.display = "none";
    }
  }

  /**
   * Sets loading spinner on button.
   * @param {HTMLButtonElement} btn
   * @param {boolean} isLoading
   */
  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    const textEl = btn.querySelector(".auth-btn-text");
    const spinnerEl = btn.querySelector(".auth-btn-spinner");
    btn.disabled = isLoading;
    if (textEl) textEl.style.opacity = isLoading ? "0.3" : "1";
    if (spinnerEl) spinnerEl.style.display = isLoading ? "inline-block" : "none";
  }

  /**
   * Toggles between modal steps ('phone', 'otp', 'success').
   * @param {'phone' | 'otp' | 'success'} stepName
   */
  function showStep(stepName) {
    if (!phoneStepEl || !otpStepEl || !successStepEl) return;
    phoneStepEl.style.display = stepName === "phone" ? "block" : "none";
    otpStepEl.style.display = stepName === "otp" ? "block" : "none";
    successStepEl.style.display = stepName === "success" ? "block" : "none";

    if (stepName === "otp") {
      const displayPhone = document.getElementById("auth-display-phone");
      if (displayPhone) displayPhone.textContent = currentPhone;
      const subtitleEl = document.getElementById("auth-otp-subtitle");
      if (subtitleEl) {
        subtitleEl.textContent = `Enter the 6-digit code sent to ${currentPhone}.`;
      }
      setTimeout(() => {
        otpInputs.forEach((b) => (b.value = ""));
        if (otpInputs[0]) otpInputs[0].focus();
      }, 100);
      startResendCountdown();
    } else if (stepName === "phone") {
      clearInterval(countdownInterval);
      if (phoneInputEl) {
        if (!phoneInputEl.value && currentPhone) {
          phoneInputEl.value = currentPhone.replace(/\D/g, "").slice(-10);
        }
        phoneInputEl.disabled = false;
        setTimeout(() => phoneInputEl.focus(), 100);
      }
    }
  }

  /**
   * Starts a 30-second countdown before enabling the Resend OTP button.
   */
  function startResendCountdown() {
    clearInterval(countdownInterval);
    let secondsLeft = RESEND_COUNTDOWN_SECONDS;
    if (resendTimerEl) resendTimerEl.style.display = "inline-block";
    if (resendBtn) resendBtn.style.display = "none";

    const updateDisplay = () => {
      const secStr = secondsLeft < 10 ? `0${secondsLeft}` : `${secondsLeft}`;
      if (resendTimerEl) resendTimerEl.textContent = `Resend code in 0:${secStr}`;
    };

    updateDisplay();

    countdownInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
        if (resendTimerEl) resendTimerEl.style.display = "none";
        const isBillingOff = window.NailsAuth && typeof window.NailsAuth.isBillingDisabled === "function" && window.NailsAuth.isBillingDisabled();
        if (resendBtn && !isBillingOff) {
          resendBtn.style.display = "inline-block";
        }
      } else {
        updateDisplay();
      }
    }, 1000);
  }

  /**
   * Handles sending the OTP to the provided phone number.
   * Ensures the OTP screen opens ONLY after Firebase confirms acceptance.
   * Keeps phone number visible and editable if rejected.
   */
  async function handleSendOtp() {
    clearError();
    const phone = phoneInputEl ? phoneInputEl.value.trim() : "";
    const cleanDigits = phone.replace(/\D/g, "");

    if (!cleanDigits || cleanDigits.length !== 10) {
      showError("Please enter your 10-digit mobile number.");
      if (phoneInputEl) phoneInputEl.focus();
      return;
    }

    if (window.NailsAuth && typeof window.NailsAuth.isBillingDisabled === "function" && window.NailsAuth.isBillingDisabled()) {
      showBillingNotice();
      if (sendOtpBtn) {
        sendOtpBtn.disabled = true;
        sendOtpBtn.title = "Phone verification is temporarily unavailable (SMS billing disabled).";
      }
      return;
    }

    setButtonLoading(sendOtpBtn, true);

    try {
      const res = await window.NailsAuth.sendOtp(cleanDigits, "recaptcha-container");
      if (!res || !res.success) {
        throw new Error("Unable to confirm verification code dispatch.");
      }
      currentPhone = res.phone;
      // Only advance to OTP screen once Firebase has actually confirmed acceptance
      showStep("otp");
    } catch (err) {
      // CRITICAL: Stay on phone step so phone number remains visible and editable
      showStep("phone");
      if (phoneInputEl) {
        phoneInputEl.value = cleanDigits;
        phoneInputEl.disabled = false;
      }

      const isBilling = err.isBillingDisabled || err.code === "BILLING_NOT_ENABLED" ||
        (window.NailsAuth && typeof window.NailsAuth.isBillingDisabled === "function" && window.NailsAuth.isBillingDisabled());

      if (isBilling) {
        showBillingNotice();
        if (sendOtpBtn) {
          sendOtpBtn.disabled = true;
          sendOtpBtn.title = "Phone verification is temporarily unavailable (SMS billing disabled).";
        }
      } else {
        showError(err.message || "Phone verification is temporarily unavailable. Please try again later.");
      }
    } finally {
      const isBilling = window.NailsAuth && typeof window.NailsAuth.isBillingDisabled === "function" && window.NailsAuth.isBillingDisabled();
      if (!isBilling) {
        setButtonLoading(sendOtpBtn, false);
      } else {
        if (sendOtpBtn) {
          sendOtpBtn.disabled = true;
          const textEl = sendOtpBtn.querySelector(".auth-btn-text");
          const spinnerEl = sendOtpBtn.querySelector(".auth-btn-spinner");
          if (textEl) {
            textEl.style.opacity = "0.7";
            textEl.textContent = "SMS Unavailable";
          }
          if (spinnerEl) spinnerEl.style.display = "none";
        }
      }
    }
  }

  /**
   * Handles resending the OTP code.
   * Prevents repeated attempts if billing is disabled.
   */
  async function handleResendOtp() {
    clearError();
    if (!currentPhone) return;

    if (window.NailsAuth && typeof window.NailsAuth.isBillingDisabled === "function" && window.NailsAuth.isBillingDisabled()) {
      showBillingNotice();
      if (resendBtn) resendBtn.disabled = true;
      if (resendTimerEl) {
        resendTimerEl.textContent = "SMS verification unavailable";
        resendTimerEl.style.display = "inline-block";
      }
      return;
    }

    if (resendBtn) resendBtn.disabled = true;
    try {
      const res = await window.NailsAuth.sendOtp(currentPhone, "recaptcha-container");
      if (!res || !res.success) {
        throw new Error("Unable to confirm verification code dispatch.");
      }
      startResendCountdown();
    } catch (err) {
      const isBilling = err.isBillingDisabled || err.code === "BILLING_NOT_ENABLED" ||
        (window.NailsAuth && typeof window.NailsAuth.isBillingDisabled === "function" && window.NailsAuth.isBillingDisabled());

      if (isBilling) {
        showBillingNotice();
        if (resendBtn) resendBtn.disabled = true;
        if (resendTimerEl) {
          resendTimerEl.textContent = "SMS verification unavailable";
          resendTimerEl.style.display = "inline-block";
        }
        clearInterval(countdownInterval);
      } else {
        showError(err.message || "Could not resend verification code. Please try again later.");
        if (resendBtn) resendBtn.disabled = false;
      }
    }
  }

  /**
   * Handles verifying the 6-digit OTP code.
   */
  async function handleVerifyOtp() {
    clearError();
    const code = getOtpCode();

    if (code.length !== 6) {
      showError("Please enter all 6 digits of the code.");
      return;
    }

    setButtonLoading(verifyOtpBtn, true);

    try {
      const result = await window.NailsAuth.verifyOtp(code);
      showStep("success");

      // After 900ms, close dialog and navigate to account page or update UI
      setTimeout(() => {
        closeDialog();
        // If on admin portal, stay on admin page so admin.js transitions into dashboard
        if (window.location.pathname.includes("admin")) {
          return;
        }
        // If not already on account.html, navigate there
        if (!window.location.pathname.endsWith("account.html")) {
          window.location.href = "account.html";
        }
      }, 900);
    } catch (err) {
      showError(err.message || "Incorrect verification code. Please try again.");
      otpInputs.forEach((b) => (b.value = ""));
      if (otpInputs[0]) otpInputs[0].focus();
    } finally {
      setButtonLoading(verifyOtpBtn, false);
    }
  }

  /**
   * Opens the authentication dialog.
   * @param {string} [initialPhone] Optional phone number to prefill
   */
  function openDialog(initialPhone = "") {
    ensureDialogMarkup();
    bindDialogEvents();
    clearError();
    showStep("phone");

    const isBilling = window.NailsAuth && typeof window.NailsAuth.isBillingDisabled === "function" && window.NailsAuth.isBillingDisabled();
    const isConfigured = window.NailsAuth && typeof window.NailsAuth.isConfigured === "function" && window.NailsAuth.isConfigured();
    const isLocal = window.NailsAuth && typeof window.NailsAuth.isLocalEnvironment === "function" ? window.NailsAuth.isLocalEnvironment() : false;

    if (isBilling) {
      showBillingNotice();
      if (sendOtpBtn) {
        sendOtpBtn.disabled = true;
        sendOtpBtn.title = "Phone verification is temporarily unavailable (SMS billing disabled).";
      }
    } else if (!isConfigured && !isLocal) {
      showMaintenanceNotice();
      if (sendOtpBtn) {
        sendOtpBtn.disabled = true;
        sendOtpBtn.title = "SMS authentication is currently undergoing maintenance.";
      }
    } else {
      if (sendOtpBtn) {
        sendOtpBtn.disabled = false;
        sendOtpBtn.title = "";
      }
    }

    if (phoneInputEl && initialPhone) {
      phoneInputEl.value = initialPhone.replace(/\D/g, "").slice(-10);
    }

    if (typeof dialogEl.showModal === "function") {
      dialogEl.showModal();
    } else {
      dialogEl.setAttribute("open", "");
    }
  }

  /**
   * Closes the authentication dialog.
   */
  function closeDialog() {
    if (!dialogEl) return;
    clearInterval(countdownInterval);
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
      // Helper to close mobile drawer if open
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

  // Auto-initialize when DOM is ready
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
