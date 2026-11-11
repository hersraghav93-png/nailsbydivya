/**
 * ==============================================================================
 * NAILS BY DIVYA — CUSTOMER ACCOUNT CONTROLLER (`account.js`)
 * Nails by Divya Platform — Phase 1D
 *
 * Manages customer profile preferences, custom nail measurements, address book,
 * and session state on account.html.
 * ==============================================================================
 */

(function () {
  "use strict";

  let currentUser = null;
  let currentProfile = null;
  let savedAddresses = [];
  let editingAddressId = null;

  const NAIL_SHAPES = ["Almond", "Square", "Coffin", "Stiletto", "Oval", "Round", "Squoval", "Ballerina"];
  const NAIL_LENGTHS = ["Extra Short", "Short", "Medium", "Long", "Extra Long"];
  const SIZING_PRESETS = ["XS", "S", "M", "L", "Custom"];

  // DOM Elements
  let authGateEl = null;
  let accountContentEl = null;
  let clientNameDisplayEl = null;
  let clientPhoneDisplayEl = null;
  let clientInitialsEl = null;
  let profileFormEl = null;
  let profileFeedbackEl = null;
  let addressListEl = null;
  let addressDialogEl = null;
  let addressFormEl = null;
  let addressFeedbackEl = null;

  /**
   * Initializes the account page controller.
   */
  async function init() {
    authGateEl = document.getElementById("account-auth-gate");
    accountContentEl = document.getElementById("account-content");
    clientNameDisplayEl = document.getElementById("client-name-display");
    clientPhoneDisplayEl = document.getElementById("client-phone-display");
    clientInitialsEl = document.getElementById("client-initials");
    profileFormEl = document.getElementById("customer-profile-form");
    profileFeedbackEl = document.getElementById("profile-feedback");
    addressListEl = document.getElementById("saved-addresses-list");
    addressDialogEl = document.getElementById("address-dialog");
    addressFormEl = document.getElementById("address-form");
    addressFeedbackEl = document.getElementById("address-modal-feedback");

    // Listen to authentication changes
    if (window.NailsAuth) {
      window.NailsAuth.init();
      window.NailsAuth.onAuthChange(handleAuthChange);
    }

    bindEventListeners();
  }

  /**
   * Handles user sign-in or sign-out state change.
   * @param {object|null} user
   */
  async function handleAuthChange(user) {
    currentUser = user;

    if (!user) {
      // Show login required state
      if (authGateEl) authGateEl.style.display = "block";
      if (accountContentEl) accountContentEl.style.display = "none";
      return;
    }

    // User is logged in
    if (authGateEl) authGateEl.style.display = "none";
    if (accountContentEl) accountContentEl.style.display = "block";

    await loadAccountData();
  }

  /**
   * Loads profile and addresses from the backend.
   */
  async function loadAccountData() {
    renderUserOverview();

    try {
      if (window.NailsApi) {
        const [profileRes, addressesRes] = await Promise.all([
          window.NailsApi.getCustomerProfile().catch(() => ({ profile: null })),
          window.NailsApi.getCustomerAddresses().catch(() => ({ addresses: [] })),
        ]);

        currentProfile = profileRes.profile;
        savedAddresses = addressesRes.addresses || [];
      }
    } catch (err) {
      console.warn("Could not load backend data, using local state:", err);
    }

    renderProfileForm();
    renderAddresses();
  }

  /**
   * Renders header overview with user initials, name, and verified phone.
   */
  function renderUserOverview() {
    if (!currentUser) return;

    const fullName =
      (currentProfile && currentProfile.full_name) ||
      (currentUser.profile && currentUser.profile.full_name) ||
      "Bespoke Client";

    const phone = currentUser.phone || "+91 Mobile";
    const initial = fullName.charAt(0).toUpperCase();

    if (clientNameDisplayEl) clientNameDisplayEl.textContent = fullName;
    if (clientPhoneDisplayEl) clientPhoneDisplayEl.textContent = phone;
    if (clientInitialsEl) clientInitialsEl.textContent = initial;
  }

  /**
   * Renders and pre-fills the customer nail preferences form.
   */
  function renderProfileForm() {
    if (!profileFormEl) return;

    const p = currentProfile || (currentUser && currentUser.profile) || {};

    const nameInput = document.getElementById("profile-name-input");
    if (nameInput) nameInput.value = p.full_name || "Customer";

    // Nail Shape Selection Pills
    const shapeContainer = document.getElementById("profile-shapes-grid");
    if (shapeContainer) {
      const selectedShape = p.preferred_nail_shape || "Almond";
      shapeContainer.innerHTML = NAIL_SHAPES.map((shape) => `
        <label class="pref-pill ${shape === selectedShape ? "is-selected" : ""}">
          <input type="radio" name="preferred_nail_shape" value="${shape}" ${shape === selectedShape ? "checked" : ""} />
          <span>${shape}</span>
        </label>
      `).join("");

      shapeContainer.querySelectorAll(".pref-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          shapeContainer.querySelectorAll(".pref-pill").forEach((el) => el.classList.remove("is-selected"));
          pill.classList.add("is-selected");
        });
      });
    }

    // Nail Length Selection Pills
    const lengthContainer = document.getElementById("profile-lengths-grid");
    if (lengthContainer) {
      const selectedLength = p.preferred_nail_length || "Medium";
      lengthContainer.innerHTML = NAIL_LENGTHS.map((len) => `
        <label class="pref-pill ${len === selectedLength ? "is-selected" : ""}">
          <input type="radio" name="preferred_nail_length" value="${len}" ${len === selectedLength ? "checked" : ""} />
          <span>${len}</span>
        </label>
      `).join("");

      lengthContainer.querySelectorAll(".pref-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          lengthContainer.querySelectorAll(".pref-pill").forEach((el) => el.classList.remove("is-selected"));
          pill.classList.add("is-selected");
        });
      });
    }

    // Sizing Preset Pills
    const presetContainer = document.getElementById("profile-presets-grid");
    if (presetContainer) {
      const selectedPreset = p.sizing_preset || "M";
      presetContainer.innerHTML = SIZING_PRESETS.map((preset) => `
        <label class="pref-pill ${preset === selectedPreset ? "is-selected" : ""}">
          <input type="radio" name="sizing_preset" value="${preset}" ${preset === selectedPreset ? "checked" : ""} />
          <span>${preset}</span>
        </label>
      `).join("");

      presetContainer.querySelectorAll(".pref-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          presetContainer.querySelectorAll(".pref-pill").forEach((el) => el.classList.remove("is-selected"));
          pill.classList.add("is-selected");
        });
      });
    }

    // Custom measurements in mm
    const measurements = p.custom_nail_measurements || { thumb: 14, index: 11, middle: 12, ring: 10, pinky: 8 };
    const thumbInput = document.getElementById("measure-thumb");
    const indexInput = document.getElementById("measure-index");
    const middleInput = document.getElementById("measure-middle");
    const ringInput = document.getElementById("measure-ring");
    const pinkyInput = document.getElementById("measure-pinky");

    if (thumbInput) thumbInput.value = measurements.thumb || "";
    if (indexInput) indexInput.value = measurements.index || "";
    if (middleInput) middleInput.value = measurements.middle || "";
    if (ringInput) ringInput.value = measurements.ring || "";
    if (pinkyInput) pinkyInput.value = measurements.pinky || "";

    // Allergies & Notes
    const notesInput = document.getElementById("profile-notes-input");
    if (notesInput) notesInput.value = p.allergies_or_notes || "";
  }

  /**
   * Handles saving customer profile updates.
   */
  async function handleSaveProfile(e) {
    if (e) e.preventDefault();
    if (!profileFormEl) return;

    const saveBtn = document.getElementById("save-profile-btn");
    const nameInput = document.getElementById("profile-name-input");
    const notesInput = document.getElementById("profile-notes-input");

    const shapeInput = profileFormEl.querySelector('input[name="preferred_nail_shape"]:checked');
    const lengthInput = profileFormEl.querySelector('input[name="preferred_nail_length"]:checked');
    const presetInput = profileFormEl.querySelector('input[name="sizing_preset"]:checked');

    const thumbInput = document.getElementById("measure-thumb");
    const indexInput = document.getElementById("measure-index");
    const middleInput = document.getElementById("measure-middle");
    const ringInput = document.getElementById("measure-ring");
    const pinkyInput = document.getElementById("measure-pinky");

    const customMeasurements = {
      thumb: parseFloat(thumbInput?.value) || null,
      index: parseFloat(indexInput?.value) || null,
      middle: parseFloat(middleInput?.value) || null,
      ring: parseFloat(ringInput?.value) || null,
      pinky: parseFloat(pinkyInput?.value) || null,
    };

    const payload = {
      full_name: (nameInput?.value || "").trim() || "Customer",
      preferred_nail_shape: shapeInput?.value || "Almond",
      preferred_nail_length: lengthInput?.value || "Medium",
      sizing_preset: presetInput?.value || "M",
      custom_nail_measurements: customMeasurements,
      allergies_or_notes: (notesInput?.value || "").trim() || null,
    };

    setButtonLoading(saveBtn, true);
    showProfileFeedback("", false);

    try {
      if (window.NailsApi) {
        const updateRes = await window.NailsApi.updateCustomerProfile(payload);
        currentProfile = updateRes.profile || payload;
      } else {
        currentProfile = payload;
      }

      renderUserOverview();
      showProfileFeedback("✓ Nail preferences and sizing saved successfully!", true);
    } catch (err) {
      showProfileFeedback(err.message || "Could not save profile. Please try again.", false);
    } finally {
      setButtonLoading(saveBtn, false);
    }
  }

  /**
   * Renders the saved delivery and service addresses grid.
   */
  function renderAddresses() {
    if (!addressListEl) return;

    if (!savedAddresses || savedAddresses.length === 0) {
      addressListEl.innerHTML = `
        <div class="empty-address-card">
          <div class="empty-address-icon">📍</div>
          <h4>No Saved Addresses Yet</h4>
          <p>Add your shipping or appointment location for effortless checkout across India and Delhi NCR.</p>
          <button type="button" class="button secondary-button" id="empty-add-address-btn">+ Add Address</button>
        </div>
      `;
      const addBtn = document.getElementById("empty-add-address-btn");
      if (addBtn) addBtn.onclick = () => openAddressModal();
      return;
    }

    addressListEl.innerHTML = savedAddresses.map((addr) => {
      const defaultBadges = [];
      if (addr.is_default_shipping) defaultBadges.push('<span class="addr-badge badge-shipping">Default Shipping</span>');
      if (addr.is_default_service) defaultBadges.push('<span class="addr-badge badge-service">Default Delhi NCR Service</span>');

      const fullAddress = [
        addr.address_line1,
        addr.address_line2,
        addr.landmark ? `Landmark: ${addr.landmark}` : null,
        `${addr.city}, ${addr.state} — ${addr.postal_code}`,
      ].filter(Boolean).join("<br>");

      return `
        <div class="address-card" data-address-id="${addr.id}">
          <div class="address-card-header">
            <h4 class="addr-recipient-name">${escapeHtml(addr.recipient_name)}</h4>
            <div class="addr-badges">${defaultBadges.join(" ")}</div>
          </div>
          <p class="addr-phone">📞 ${escapeHtml(addr.recipient_phone)}</p>
          <p class="addr-lines">${fullAddress}</p>
          <div class="address-card-actions">
            <button type="button" class="addr-action-btn edit-addr-btn" data-id="${addr.id}">Edit</button>
            <button type="button" class="addr-action-btn delete-addr-btn" data-id="${addr.id}">Delete</button>
          </div>
        </div>
      `;
    }).join("");

    // Bind edit/delete handlers
    addressListEl.querySelectorAll(".edit-addr-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const found = savedAddresses.find((a) => a.id === id);
        if (found) openAddressModal(found);
      });
    });

    addressListEl.querySelectorAll(".delete-addr-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        handleDeleteAddress(id);
      });
    });
  }

  /**
   * Opens the Address Modal for Add or Edit.
   * @param {object|null} address
   */
  function openAddressModal(address = null) {
    editingAddressId = address ? address.id : null;
    clearAddressFeedback();

    const titleEl = document.getElementById("address-modal-title");
    if (titleEl) {
      titleEl.textContent = address ? "Edit Address" : "Add New Address";
    }

    const nameInput = document.getElementById("addr-name");
    const phoneInput = document.getElementById("addr-phone-input");
    const line1Input = document.getElementById("addr-line1");
    const line2Input = document.getElementById("addr-line2");
    const landmarkInput = document.getElementById("addr-landmark");
    const cityInput = document.getElementById("addr-city");
    const stateInput = document.getElementById("addr-state");
    const pinInput = document.getElementById("addr-pin");
    const isShipCheck = document.getElementById("addr-is-shipping");
    const isServCheck = document.getElementById("addr-is-service");

    if (address) {
      if (nameInput) nameInput.value = address.recipient_name || "";
      if (phoneInput) phoneInput.value = address.recipient_phone || "";
      if (line1Input) line1Input.value = address.address_line1 || "";
      if (line2Input) line2Input.value = address.address_line2 || "";
      if (landmarkInput) landmarkInput.value = address.landmark || "";
      if (cityInput) cityInput.value = address.city || "";
      if (stateInput) stateInput.value = address.state || "";
      if (pinInput) pinInput.value = address.postal_code || "";
      if (isShipCheck) isShipCheck.checked = Boolean(address.is_default_shipping);
      if (isServCheck) isServCheck.checked = Boolean(address.is_default_service);
    } else {
      if (nameInput) nameInput.value = (currentProfile && currentProfile.full_name) || "";
      if (phoneInput) phoneInput.value = (currentUser && currentUser.phone) || "";
      if (line1Input) line1Input.value = "";
      if (line2Input) line2Input.value = "";
      if (landmarkInput) landmarkInput.value = "";
      if (cityInput) cityInput.value = "New Delhi";
      if (stateInput) stateInput.value = "Delhi";
      if (pinInput) pinInput.value = "";
      if (isShipCheck) isShipCheck.checked = savedAddresses.length === 0;
      if (isServCheck) isServCheck.checked = savedAddresses.length === 0;
    }

    if (addressDialogEl) {
      if (typeof addressDialogEl.showModal === "function") {
        addressDialogEl.showModal();
      } else {
        addressDialogEl.setAttribute("open", "");
      }
    }
  }

  /**
   * Closes the Address modal.
   */
  function closeAddressModal() {
    if (!addressDialogEl) return;
    if (typeof addressDialogEl.close === "function") {
      addressDialogEl.close();
    } else {
      addressDialogEl.removeAttribute("open");
    }
    editingAddressId = null;
  }

  /**
   * Handles saving a new address or updating an existing address.
   */
  async function handleSaveAddress(e) {
    if (e) e.preventDefault();

    const saveBtn = document.getElementById("save-address-btn");
    const name = document.getElementById("addr-name")?.value.trim();
    const phone = document.getElementById("addr-phone-input")?.value.trim();
    const line1 = document.getElementById("addr-line1")?.value.trim();
    const line2 = document.getElementById("addr-line2")?.value.trim() || null;
    const landmark = document.getElementById("addr-landmark")?.value.trim() || null;
    const city = document.getElementById("addr-city")?.value.trim();
    const state = document.getElementById("addr-state")?.value.trim();
    const pin = document.getElementById("addr-pin")?.value.trim();
    const isShip = Boolean(document.getElementById("addr-is-shipping")?.checked);
    const isServ = Boolean(document.getElementById("addr-is-service")?.checked);

    if (!name || name.length > 100) {
      showAddressFeedback("Recipient name is required (up to 100 characters).", false);
      return;
    }

    if (!phone || !/^(?:\+91)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ""))) {
      showAddressFeedback("Please enter a valid 10-digit mobile number.", false);
      return;
    }

    if (!line1 || line1.length < 3) {
      showAddressFeedback("Address line 1 is required (at least 3 characters).", false);
      return;
    }

    if (!city || !state) {
      showAddressFeedback("City and State are required.", false);
      return;
    }

    if (!pin || !/^[1-9]\d{5}$/.test(pin)) {
      showAddressFeedback("Please enter a valid 6-digit Indian PIN code.", false);
      return;
    }

    const payload = {
      recipient_name: name,
      recipient_phone: phone,
      address_line1: line1,
      address_line2: line2,
      landmark: landmark,
      city: city,
      state: state,
      postal_code: pin,
      is_default_shipping: isShip,
      is_default_service: isServ,
    };

    setButtonLoading(saveBtn, true);

    try {
      if (window.NailsApi) {
        if (editingAddressId) {
          const res = await window.NailsApi.updateCustomerAddress(editingAddressId, payload);
          const idx = savedAddresses.findIndex((a) => a.id === editingAddressId);
          if (idx !== -1) savedAddresses[idx] = res.address;
        } else {
          const res = await window.NailsApi.addCustomerAddress(payload);
          savedAddresses.unshift(res.address);
        }
      } else {
        if (editingAddressId) {
          const idx = savedAddresses.findIndex((a) => a.id === editingAddressId);
          if (idx !== -1) savedAddresses[idx] = { id: editingAddressId, ...payload };
        } else {
          savedAddresses.unshift({ id: `addr_${Date.now()}`, ...payload });
        }
      }

      closeAddressModal();
      renderAddresses();
    } catch (err) {
      showAddressFeedback(err.message || "Failed to save address.", false);
    } finally {
      setButtonLoading(saveBtn, false);
    }
  }

  /**
   * Handles deleting an address with confirmation.
   * @param {string} addressId
   */
  async function handleDeleteAddress(addressId) {
    if (!confirm("Are you sure you want to remove this address?")) return;

    try {
      if (window.NailsApi) {
        await window.NailsApi.deleteCustomerAddress(addressId);
      }
      savedAddresses = savedAddresses.filter((a) => a.id !== addressId);
      renderAddresses();
    } catch (err) {
      alert(`Could not delete address: ${err.message || "Please try again."}`);
    }
  }

  /**
   * Binds page level interactive elements.
   */
  function bindEventListeners() {
    // Top sign in button in auth gate
    const gateLoginBtn = document.getElementById("gate-login-btn");
    if (gateLoginBtn) {
      gateLoginBtn.addEventListener("click", () => {
        if (window.NailsAuthModal) window.NailsAuthModal.open();
      });
    }

    // Logout button
    const logoutBtn = document.getElementById("client-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to sign out?")) {
          if (window.NailsAuth) await window.NailsAuth.signOut();
        }
      });
    }

    // Profile form submit
    if (profileFormEl) {
      profileFormEl.addEventListener("submit", handleSaveProfile);
    }

    // Add address button
    const openAddBtn = document.getElementById("open-add-address-btn");
    if (openAddBtn) {
      openAddBtn.addEventListener("click", () => openAddressModal());
    }

    // Address form submit
    if (addressFormEl) {
      addressFormEl.addEventListener("submit", handleSaveAddress);
    }

    // Address modal close button
    const closeAddrBtn = document.getElementById("address-dialog-close");
    if (closeAddrBtn) {
      closeAddrBtn.addEventListener("click", closeAddressModal);
    }

    // PIN code auto-fill helper (Delhi NCR PINs default to Delhi)
    const pinInput = document.getElementById("addr-pin");
    if (pinInput) {
      pinInput.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
        e.target.value = val;
        if (val.startsWith("110")) {
          const cityEl = document.getElementById("addr-city");
          const stateEl = document.getElementById("addr-state");
          if (cityEl && !cityEl.value) cityEl.value = "New Delhi";
          if (stateEl && !stateEl.value) stateEl.value = "Delhi";
        }
      });
    }
  }

  function showProfileFeedback(msg, isSuccess) {
    if (!profileFeedbackEl) return;
    profileFeedbackEl.textContent = msg;
    profileFeedbackEl.className = `form-feedback ${isSuccess ? "feedback-success" : "feedback-error"}`;
    profileFeedbackEl.style.display = msg ? "block" : "none";
  }

  function showAddressFeedback(msg, isSuccess) {
    if (!addressFeedbackEl) return;
    addressFeedbackEl.textContent = msg;
    addressFeedbackEl.className = `form-feedback ${isSuccess ? "feedback-success" : "feedback-error"}`;
    addressFeedbackEl.style.display = msg ? "block" : "none";
  }

  function clearAddressFeedback() {
    if (!addressFeedbackEl) return;
    addressFeedbackEl.textContent = "";
    addressFeedbackEl.style.display = "none";
  }

  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    const textEl = btn.querySelector(".btn-text");
    if (textEl) textEl.textContent = isLoading ? "Saving..." : textEl.getAttribute("data-default") || "Save";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
