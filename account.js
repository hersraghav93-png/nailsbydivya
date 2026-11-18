/**
 * ==============================================================================
 * NAILS BY DIVYA — CUSTOMER ACCOUNT CONTROLLER (`account.js`)
 * Nails by Divya Platform — Phase 3B Commerce & Booking Integration
 *
 * Manages customer profile preferences, custom nail measurements, address book,
 * real press-on orders, at-home appointments, and session state on account.html.
 * ==============================================================================
 */

(function () {
  "use strict";

  let currentUser = null;
  let currentProfile = null;
  let savedAddresses = [];
  let savedOrders = [];
  let savedBookings = [];
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
  let ordersListEl = null;
  let bookingsListEl = null;
  let orderDetailsDialogEl = null;
  let bookingDetailsDialogEl = null;

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
    ordersListEl = document.getElementById("account-orders-list");
    bookingsListEl = document.getElementById("account-bookings-list");
    orderDetailsDialogEl = document.getElementById("order-details-dialog");
    bookingDetailsDialogEl = document.getElementById("booking-details-dialog");

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
   * Loads profile, addresses, press-on orders, and at-home appointments from the backend.
   */
  async function loadAccountData() {
    renderUserOverview();

    try {
      if (window.NailsApi) {
        const [profileRes, addressesRes, ordersRes, bookingsRes] = await Promise.all([
          window.NailsApi.getCustomerProfile().catch(() => ({ profile: null })),
          window.NailsApi.getCustomerAddresses().catch(() => ({ addresses: [] })),
          window.NailsApi.getCustomerOrders().catch(() => ({ orders: [] })),
          window.NailsApi.getCustomerBookings().catch(() => ({ bookings: [] })),
        ]);

        currentProfile = profileRes.profile;
        savedAddresses = addressesRes.addresses || [];
        savedOrders = ordersRes.orders || [];
        savedBookings = bookingsRes.bookings || [];
      }
    } catch (err) {
      console.warn("Could not load backend data, using local state:", err);
    }

    renderProfileForm();
    renderAddresses();
    renderOrders();
    renderBookings();
  }

  const PRESET_DETAILS = {
    "XS": "Thumb 14mm · Index 11mm · Middle 12mm · Ring 10mm · Pinky 8mm",
    "S": "Thumb 15mm · Index 12mm · Middle 13mm · Ring 11mm · Pinky 8mm",
    "M": "Thumb 16mm · Index 12mm · Middle 13mm · Ring 11mm · Pinky 9mm (Most Common)",
    "L": "Thumb 17mm · Index 13mm · Middle 14mm · Ring 12mm · Pinky 10mm",
    "Custom": "Tailored sizing — enter exact measurements in millimeters below.",
  };

  const PRESET_MEASUREMENTS = {
    "XS": { thumb: 14, index: 11, middle: 12, ring: 10, pinky: 8 },
    "S": { thumb: 15, index: 12, middle: 13, ring: 11, pinky: 8 },
    "M": { thumb: 16, index: 12, middle: 13, ring: 11, pinky: 9 },
    "L": { thumb: 17, index: 13, middle: 14, ring: 12, pinky: 10 },
  };

  function updatePresetGuide(preset) {
    const guideEl = document.getElementById("preset-details-guide");
    if (!guideEl) return;
    const detail = PRESET_DETAILS[preset] || "";
    guideEl.innerHTML = detail ? `✦ <strong>${preset} Preset Sizing:</strong> ${detail}` : "";
    
    // Suggest millimeter values into inputs as placeholders if empty
    const presetMm = PRESET_MEASUREMENTS[preset];
    if (presetMm) {
      const thumb = document.getElementById("measure-thumb");
      const index = document.getElementById("measure-index");
      const middle = document.getElementById("measure-middle");
      const ring = document.getElementById("measure-ring");
      const pinky = document.getElementById("measure-pinky");
      if (thumb) thumb.placeholder = String(presetMm.thumb);
      if (index) index.placeholder = String(presetMm.index);
      if (middle) middle.placeholder = String(presetMm.middle);
      if (ring) ring.placeholder = String(presetMm.ring);
      if (pinky) pinky.placeholder = String(presetMm.pinky);
    }

    const measurementsContainer = document.querySelector(".measurements-container");
    if (measurementsContainer) {
      if (preset === "Custom") {
        measurementsContainer.style.borderColor = "var(--accent-strong, #d9899b)";
        measurementsContainer.style.background = "rgba(255, 240, 243, 0.75)";
      } else {
        measurementsContainer.style.borderColor = "rgba(125, 86, 92, 0.25)";
        measurementsContainer.style.background = "rgba(255, 248, 246, 0.7)";
      }
    }
  }

  /**
   * Renders header overview with user initials, name, and verified phone.
   */
  function renderUserOverview() {
    if (!currentUser) return;

    const rawName =
      (currentProfile && currentProfile.full_name) ||
      (currentUser.profile && currentUser.profile.full_name) ||
      "";

    const isSynthetic = !rawName ||
      rawName.trim().toLowerCase() === "customer" ||
      rawName.trim().toLowerCase() === "bespoke client";

    const hasRealName = !isSynthetic && rawName.trim().length > 0;
    const greetingName = hasRealName ? rawName.trim() : "";
    const greetingText = hasRealName ? `Welcome, ${greetingName}` : "Welcome";
    const initial = hasRealName ? greetingName.charAt(0).toUpperCase() : "💅🏻";
    const phone = currentUser.phone || "+91 Mobile";

    if (clientNameDisplayEl) clientNameDisplayEl.textContent = greetingText;
    if (clientPhoneDisplayEl) clientPhoneDisplayEl.textContent = phone;
    if (clientInitialsEl) clientInitialsEl.textContent = initial;
  }

  /**
   * Renders and pre-fills the customer nail preferences form.
   */
  function renderProfileForm() {
    if (!profileFormEl) return;

    const p = currentProfile || (currentUser && currentUser.profile) || {};

    const rawName = p.full_name || (currentUser && currentUser.profile && currentUser.profile.full_name) || "";
    const isSynthetic = !rawName || rawName.trim().toLowerCase() === "customer" || rawName.trim().toLowerCase() === "bespoke client";
    const nameInput = document.getElementById("profile-name-input");
    if (nameInput) nameInput.value = isSynthetic ? "" : rawName.trim();

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

    // Sizing Preset Selection Pills
    const presetContainer = document.getElementById("profile-presets-grid");
    if (presetContainer) {
      const selectedPreset = p.sizing_preset || "M";
      presetContainer.innerHTML = SIZING_PRESETS.map((preset) => `
        <label class="pref-pill ${preset === selectedPreset ? "is-selected" : ""}">
          <input type="radio" name="sizing_preset" value="${preset}" ${preset === selectedPreset ? "checked" : ""} />
          <span>${preset}</span>
        </label>
      `).join("");

      updatePresetGuide(selectedPreset);

      presetContainer.querySelectorAll(".pref-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          presetContainer.querySelectorAll(".pref-pill").forEach((el) => el.classList.remove("is-selected"));
          pill.classList.add("is-selected");
          const radio = pill.querySelector("input");
          if (radio) updatePresetGuide(radio.value);
        });
      });
    }

    // Custom Millimeter Measurements
    const measurements = p.custom_nail_measurements || {};
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

    // Notes
    const notesInput = document.getElementById("profile-notes-input");
    if (notesInput) notesInput.value = p.allergies_or_notes || "";
  }

  /**
   * Handles saving customer profile changes.
   */
  async function handleSaveProfile(e) {
    e.preventDefault();
    clearAddressFeedback();

    const saveBtn = document.getElementById("save-profile-btn");
    setButtonLoading(saveBtn, true);

    const nameInput = document.getElementById("profile-name-input");
    const shapeRadio = profileFormEl.querySelector('input[name="preferred_nail_shape"]:checked');
    const lengthRadio = profileFormEl.querySelector('input[name="preferred_nail_length"]:checked');
    const presetRadio = profileFormEl.querySelector('input[name="sizing_preset"]:checked');

    const thumb = parseFloat(document.getElementById("measure-thumb")?.value);
    const index = parseFloat(document.getElementById("measure-index")?.value);
    const middle = parseFloat(document.getElementById("measure-middle")?.value);
    const ring = parseFloat(document.getElementById("measure-ring")?.value);
    const pinky = parseFloat(document.getElementById("measure-pinky")?.value);

    const custom_measurements = {};
    if (!isNaN(thumb) && thumb > 0) custom_measurements.thumb = thumb;
    if (!isNaN(index) && index > 0) custom_measurements.index = index;
    if (!isNaN(middle) && middle > 0) custom_measurements.middle = middle;
    if (!isNaN(ring) && ring > 0) custom_measurements.ring = ring;
    if (!isNaN(pinky) && pinky > 0) custom_measurements.pinky = pinky;

    const enteredName = nameInput ? nameInput.value.trim() : "";
    const payload = {
      preferred_nail_shape: (shapeRadio && shapeRadio.value) || "Almond",
      preferred_nail_length: (lengthRadio && lengthRadio.value) || "Medium",
      sizing_preset: (presetRadio && presetRadio.value) || "M",
      custom_nail_measurements: Object.keys(custom_measurements).length ? custom_measurements : null,
      allergies_or_notes: (document.getElementById("profile-notes-input")?.value.trim()) || null,
    };

    if (enteredName) {
      payload.full_name = enteredName;
    } else if (currentProfile && currentProfile.full_name && currentProfile.full_name.trim().toLowerCase() !== "customer") {
      payload.full_name = currentProfile.full_name;
    }

    try {
      if (window.NailsApi) {
        const res = await window.NailsApi.updateCustomerProfile(payload);
        currentProfile = res.profile;
        showProfileFeedback("✓ Bespoke nail preferences saved successfully.", true);
        renderUserOverview();
      } else {
        showProfileFeedback("✓ Preferences updated locally.", true);
      }
    } catch (err) {
      let msg = err.message || "Failed to update profile.";
      if (msg.includes("<") || msg.toLowerCase().startsWith("cannot ")) {
        msg = "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
      }
      showProfileFeedback(msg, false);
    } finally {
      setButtonLoading(saveBtn, false);
    }
  }

  /**
   * Renders customer saved addresses.
   */
  function renderAddresses() {
    if (!addressListEl) return;

    if (!savedAddresses || savedAddresses.length === 0) {
      addressListEl.innerHTML = `
        <div class="empty-state-card">
          <span class="empty-state-icon" aria-hidden="true">📍</span>
          <h4>No Saved Delivery Addresses</h4>
          <p>Save your home address for rapid press-on dispatch and seamless at-home appointment scheduling across Delhi NCR.</p>
          <button type="button" class="button secondary-button" id="empty-add-address-btn" style="min-height: 40px; padding: 0.5rem 1.25rem; font-size: 0.88rem; margin-top: 0.5rem;">
            + Add First Address
          </button>
        </div>
      `;
      const emptyBtn = document.getElementById("empty-add-address-btn");
      if (emptyBtn) emptyBtn.addEventListener("click", () => openAddressModal());
      return;
    }

    addressListEl.innerHTML = savedAddresses.map((addr) => {
      const isDefault = addr.isDefault || addr.is_default_shipping;
      const isService = addr.isDefaultService || addr.is_default_service;
      const recipientName = addr.recipientName || addr.recipient_name || "";
      const displayRecipient = (recipientName && recipientName.toLowerCase() !== "customer") ? recipientName : "Delivery Address";
      const phone = addr.recipientPhone || addr.recipient_phone || "";
      const line1 = addr.addressLine1 || addr.address_line1 || "";
      const line2 = addr.addressLine2 || addr.address_line2 || "";
      const landmark = addr.landmark || "";
      const city = addr.city || "";
      const state = addr.state || "";
      const pin = addr.postalCode || addr.postal_code || "";

      return `
        <div class="address-card" data-id="${addr.id}">
          <div class="address-card-header">
            <h4 class="addr-recipient-name">${escapeHtml(displayRecipient)}</h4>
            <div class="addr-badges">
              ${isDefault ? '<span class="addr-badge badge-shipping">Default Press-On Delivery</span>' : ""}
              ${isService ? '<span class="addr-badge badge-service">Default At-Home Location</span>' : ""}
            </div>
          </div>
          ${phone ? `<p class="addr-phone">Phone: ${escapeHtml(phone)}</p>` : ""}
          <p class="addr-lines">
            ${escapeHtml(line1)}${line2 ? `, ${escapeHtml(line2)}` : ""}${landmark ? `<br><span style="font-size: 0.82rem; color: var(--text-muted);">Landmark: ${escapeHtml(landmark)}</span>` : ""}<br>
            ${escapeHtml(city)}, ${escapeHtml(state)} — ${escapeHtml(pin)}
          </p>
          <div class="address-card-actions">
            <button type="button" class="addr-action-btn edit-addr-btn" data-id="${addr.id}" aria-label="Edit address">Edit</button>
            <span style="color: rgba(125, 86, 92, 0.25);">&bull;</span>
            <button type="button" class="addr-action-btn delete-addr-btn" data-id="${addr.id}" aria-label="Delete address" style="color: #9b1c1c;">Delete</button>
          </div>
        </div>
      `;
    }).join("");

    addressListEl.querySelectorAll(".edit-addr-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        openAddressModal(id);
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
   * Renders customer press-on orders history.
   */
  function renderOrders() {
    if (!ordersListEl) return;

    if (!savedOrders || savedOrders.length === 0) {
      ordersListEl.innerHTML = `
        <div class="empty-state-card">
          <span class="empty-state-icon" aria-hidden="true">🛍️</span>
          <h4>No Press-On Orders Placed Yet</h4>
          <p>Explore our collectible handcrafted press-on sets. Each set is custom hand-painted by Divya with salon-grade soft gel and delivered across India.</p>
          <a href="index.html#shop" class="button secondary-button" style="min-height: 40px; padding: 0.5rem 1.25rem; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
            <span>Explore Press-On Sets</span>
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      `;
      return;
    }

    ordersListEl.innerHTML = savedOrders.map((ord) => {
      const orderNum = ord.orderNumber || ord.order_number || `ORD-${ord.id.slice(0, 8)}`;
      const orderDate = new Date(ord.createdAt || ord.created_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const orderStatus = (ord.orderStatus || ord.order_status || "PENDING").toUpperCase();
      const paymentStatus = (ord.paymentStatus || ord.payment_status || "PENDING").toUpperCase();
      const totalAmount = parseFloat(ord.totalAmount || ord.total_amount) || 0;

      // Status pill styling
      let statusClass = "status-pending";
      let statusLabel = "Order Placed (Pending)";
      if (orderStatus === "CONFIRMED") { statusClass = "status-confirmed"; statusLabel = "Confirmed"; }
      else if (orderStatus === "IN_PRODUCTION") { statusClass = "status-in_production"; statusLabel = "In Production"; }
      else if (orderStatus === "COMPLETED") { statusClass = "status-delivered"; statusLabel = "Completed"; }
      else if (orderStatus === "CANCELLED") { statusClass = "status-cancelled"; statusLabel = "Cancelled"; }

      const businessPhone = (window.NAILS_CONFIG && window.NAILS_CONFIG.business && window.NAILS_CONFIG.business.phoneRaw) || "918447391310";
      const waText = encodeURIComponent(`Hi Divya! Regarding my press-on order *${orderNum}* (₹${totalAmount}): please let me know the current status and payment/sizing verification.`);
      const waUrl = `https://wa.me/${businessPhone}?text=${waText}`;

      return `
        <article class="order-history-card">
          <div class="order-history-header">
            <div>
              <span class="order-code-text">${escapeHtml(orderNum)}</span>
              <div class="order-date-text">Placed on ${orderDate} &bull; Pan-India Delivery</div>
            </div>
            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
              <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
              <span class="status-pill status-pending" title="Payment confirmed via studio concierge">Payment: ${escapeHtml(paymentStatus)}</span>
            </div>
          </div>

          <div class="order-items-snippet">
            <strong>Bespoke Handcrafted Set</strong> &bull; Delivery: Confirmed by studio &bull; Amount: <strong>₹${totalAmount}</strong>
          </div>

          <div class="order-card-footer">
            <span style="font-size: 0.78rem; color: var(--text-muted);">
              Sizing &amp; payment confirmed via studio concierge
            </span>
            <div style="display: flex; gap: 0.5rem;">
              <button type="button" class="button secondary-button view-order-btn" data-id="${ord.id}" style="min-height: 34px; padding: 0.35rem 0.85rem; font-size: 0.8rem;">
                View Details
              </button>
              <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="button secondary-button whatsapp-button" style="min-height: 34px; padding: 0.35rem 0.85rem; font-size: 0.8rem;">
                WhatsApp &rarr;
              </a>
            </div>
          </div>
        </article>
      `;
    }).join("");

    ordersListEl.querySelectorAll(".view-order-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        openOrderDetailsModal(id);
      });
    });
  }

  /**
   * Renders customer at-home appointments history.
   */
  function renderBookings() {
    if (!bookingsListEl) return;

    if (!savedBookings || savedBookings.length === 0) {
      bookingsListEl.innerHTML = `
        <div class="empty-state-card">
          <span class="empty-state-icon" aria-hidden="true">💅🏻</span>
          <h4>No Salon Appointments Scheduled</h4>
          <p>Enjoy luxury salon-grade nail extensions &amp; overlays in the comfort of your home across Delhi NCR.</p>
          <a href="index.html#services" class="button secondary-button" style="min-height: 40px; padding: 0.5rem 1.25rem; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
            <span>Explore At-Home Services</span>
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      `;
      return;
    }

    bookingsListEl.innerHTML = savedBookings.map((bkg) => {
      const bookingNum = bkg.bookingNumber || bkg.booking_number || `BKG-${bkg.id.slice(0, 8)}`;
      const serviceName = bkg.serviceName || bkg.service_name || "At-Home Nail Service";
      const requestedDate = bkg.requestedDate || bkg.requested_date;
      const requestedSlot = bkg.requestedTimeSlot || bkg.requested_time_slot || "Preferred Slot";
      const bookingStatus = (bkg.bookingStatus || bkg.booking_status || "REQUESTED").toUpperCase();
      const estimatedTotal = bkg.estimatedTotal !== null && bkg.estimatedTotal !== undefined
        ? `₹${parseFloat(bkg.estimatedTotal)}`
        : "Custom Quotation";

      let statusClass = "status-requested";
      let statusLabel = "Requested (Under Review)";
      if (bookingStatus === "CONFIRMED") { statusClass = "status-confirmed"; statusLabel = "Confirmed"; }
      else if (bookingStatus === "ALTERNATIVE_PROPOSED") { statusClass = "status-pending"; statusLabel = "Alternative Slot Proposed"; }
      else if (bookingStatus === "DECLINED" || bookingStatus.includes("CANCEL")) { statusClass = "status-declined"; statusLabel = "Declined / Cancelled"; }
      else if (bookingStatus === "COMPLETED") { statusClass = "status-delivered"; statusLabel = "Completed"; }

      const businessPhone = (window.NAILS_CONFIG && window.NAILS_CONFIG.business && window.NAILS_CONFIG.business.phoneRaw) || "918447391310";
      const waText = encodeURIComponent(`Hi Divya! Regarding my at-home appointment *${bookingNum}* for *${serviceName}* on ${requestedDate} (${requestedSlot}): please let me know your availability.`);
      const waUrl = `https://wa.me/${businessPhone}?text=${waText}`;

      return `
        <article class="booking-history-card">
          <div class="booking-history-header">
            <div>
              <span class="booking-code-text">${escapeHtml(bookingNum)}</span>
              <div class="booking-date-text">Appointment Date: <strong>${escapeHtml(requestedDate)}</strong> &bull; ${escapeHtml(requestedSlot)}</div>
            </div>
            <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
          </div>

          <div class="order-items-snippet">
            <strong>${escapeHtml(serviceName)}</strong> &bull; Location: Delhi NCR &bull; Estimated Pricing: <strong>${escapeHtml(estimatedTotal)}</strong>
          </div>

          <div class="booking-card-footer">
            <span style="font-size: 0.78rem; color: var(--text-muted);">
              Manual scheduling review by Divya &bull; No online payment
            </span>
            <div style="display: flex; gap: 0.5rem;">
              <button type="button" class="button secondary-button view-booking-btn" data-id="${bkg.id}" style="min-height: 34px; padding: 0.35rem 0.85rem; font-size: 0.8rem;">
                View Details
              </button>
              <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="button secondary-button whatsapp-button" style="min-height: 34px; padding: 0.35rem 0.85rem; font-size: 0.8rem;">
                WhatsApp &rarr;
              </a>
            </div>
          </div>
        </article>
      `;
    }).join("");

    bookingsListEl.querySelectorAll(".view-booking-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        openBookingDetailsModal(id);
      });
    });
  }

  /**
   * Opens the Order Details modal snapshot.
   */
  async function openOrderDetailsModal(orderId) {
    if (!orderDetailsDialogEl) return;
    const bodyEl = document.getElementById("order-details-body");
    const subTitleEl = document.getElementById("order-details-subtitle");
    if (bodyEl) bodyEl.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading order details...</div>`;
    orderDetailsDialogEl.showModal();

    try {
      const res = await window.NailsApi.getOrderDetails(orderId);
      const o = res.order;
      if (subTitleEl) subTitleEl.textContent = `Order ${o.orderNumber || orderId.slice(0, 8)} &bull; ${new Date(o.createdAt).toLocaleDateString()}`;

      if (bodyEl) {
        bodyEl.innerHTML = `
          <div style="background: var(--bg-soft); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.85rem; font-size: 0.85rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
              <span>Order Status:</span>
              <strong class="status-pill status-${(o.orderStatus || "pending").toLowerCase()}">${escapeHtml(o.orderStatus)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
              <span>Payment Status:</span>
              <strong class="status-pill status-pending">${escapeHtml(o.paymentStatus || "PENDING")}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Total Amount:</span>
              <strong>₹${parseFloat(o.totalAmount || 0)} (Delivery confirmed by studio)</strong>
            </div>
          </div>

          <div style="font-size: 0.85rem;">
            <span style="font-weight: 700; text-transform: uppercase; font-size: 0.76rem; color: var(--heading);">Delivery Address</span>
            <p style="margin: 0.25rem 0 0; color: var(--text-muted); line-height: 1.45;">
              ${escapeHtml(o.shippingAddress?.recipient_name || "")}<br>
              ${escapeHtml(o.shippingAddress?.address_line1 || "")}${o.shippingAddress?.address_line2 ? `, ${escapeHtml(o.shippingAddress.address_line2)}` : ""}<br>
              ${escapeHtml(o.shippingAddress?.city || "")}, ${escapeHtml(o.shippingAddress?.state || "")} — ${escapeHtml(o.shippingAddress?.postal_code || "")}<br>
              Phone: ${escapeHtml(o.shippingAddress?.phone || "")}
            </p>
          </div>

          ${o.customerNotes ? `
            <div style="font-size: 0.85rem; background: var(--bg-cream); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.65rem;">
              <span style="font-weight: 700; font-size: 0.74rem; text-transform: uppercase; color: var(--heading);">Customer Notes:</span>
              <p style="margin: 0.2rem 0 0; color: var(--text);">${escapeHtml(o.customerNotes)}</p>
            </div>
          ` : ""}

          <div class="cart-payment-notice">
            <strong>Studio Concierge Note:</strong> All handmade press-on sets are hand-painted by Divya. Payment instructions and sizing double-checks are completed directly via WhatsApp before production.
          </div>

          <a href="https://wa.me/${(window.NAILS_CONFIG && window.NAILS_CONFIG.business && window.NAILS_CONFIG.business.phoneRaw) || '918447391310'}?text=${encodeURIComponent(`Hi Divya! Regarding my order ${o.orderNumber}: I am checking in on sizing and payment confirmation.`)}" target="_blank" rel="noopener noreferrer" class="button primary-button" style="width: 100%; text-align: center;">
            Contact Studio Concierge on WhatsApp &rarr;
          </a>
        `;
      }
    } catch (err) {
      if (bodyEl) bodyEl.innerHTML = `<div style="color: #d32f2f; padding: 1.5rem; text-align: center;">Could not load order details: ${escapeHtml(err.message)}</div>`;
    }
  }

  /**
   * Opens the Booking Details modal snapshot.
   */
  async function openBookingDetailsModal(bookingId) {
    if (!bookingDetailsDialogEl) return;
    const bodyEl = document.getElementById("booking-details-body");
    const subTitleEl = document.getElementById("booking-details-subtitle");
    if (bodyEl) bodyEl.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading appointment details...</div>`;
    bookingDetailsDialogEl.showModal();

    try {
      const res = await window.NailsApi.getBookingDetails(bookingId);
      const b = res.booking;
      if (subTitleEl) subTitleEl.textContent = `Booking ${b.bookingNumber || bookingId.slice(0, 8)} &bull; ${escapeHtml(b.serviceName || "")}`;

      if (bodyEl) {
        bodyEl.innerHTML = `
          <div style="background: var(--bg-soft); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.85rem; font-size: 0.85rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
              <span>Booking Status:</span>
              <strong class="status-pill status-${(b.bookingStatus || "requested").toLowerCase()}">${escapeHtml(b.bookingStatus)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
              <span>Requested Date:</span>
              <strong>${escapeHtml(b.requestedDate || "")}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
              <span>Time Window:</span>
              <strong>${escapeHtml(b.requestedTimeSlot || "")}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Estimated Total:</span>
              <strong>${b.estimatedTotal !== null ? `₹${b.estimatedTotal}` : "Custom Quotation Required"}</strong>
            </div>
          </div>

          <div style="font-size: 0.85rem;">
            <span style="font-weight: 700; text-transform: uppercase; font-size: 0.76rem; color: var(--heading);">Appointment Address</span>
            <p style="margin: 0.25rem 0 0; color: var(--text-muted); line-height: 1.45;">
              ${escapeHtml(b.serviceAddress?.address_line1 || "")}${b.serviceAddress?.address_line2 ? `, ${escapeHtml(b.serviceAddress.address_line2)}` : ""}<br>
              ${escapeHtml(b.serviceAddress?.city || "")}, ${escapeHtml(b.serviceAddress?.state || "")} — ${escapeHtml(b.serviceAddress?.postal_code || "")}
            </p>
          </div>

          ${b.customerNotes ? `
            <div style="font-size: 0.85rem; background: var(--bg-cream); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.65rem;">
              <span style="font-weight: 700; font-size: 0.74rem; text-transform: uppercase; color: var(--heading);">Customer Notes:</span>
              <p style="margin: 0.2rem 0 0; color: var(--text);">${escapeHtml(b.customerNotes)}</p>
            </div>
          ` : ""}

          <div class="cart-payment-notice">
            <strong>Travel &amp; Scheduling Protocol:</strong> Divya personally confirms appointment slots based on travel logistics across Delhi NCR. No prepayment is taken online.
          </div>

          <a href="https://wa.me/${(window.NAILS_CONFIG && window.NAILS_CONFIG.business && window.NAILS_CONFIG.business.phoneRaw) || '918447391310'}?text=${encodeURIComponent(`Hi Divya! Regarding my appointment ${b.bookingNumber} for ${b.serviceName} on ${b.requestedDate}: let me know your availability.`)}" target="_blank" rel="noopener noreferrer" class="button primary-button" style="width: 100%; text-align: center;">
            Confirm Appointment via WhatsApp &rarr;
          </a>
        `;
      }
    } catch (err) {
      if (bodyEl) bodyEl.innerHTML = `<div style="color: #d32f2f; padding: 1.5rem; text-align: center;">Could not load appointment details: ${escapeHtml(err.message)}</div>`;
    }
  }

  /**
   * Opens the address modal dialog.
   */
  function openAddressModal(addressId = null) {
    if (!addressDialogEl) return;
    editingAddressId = addressId;
    clearAddressFeedback();

    const titleEl = document.getElementById("address-modal-title");
    const nameInput = document.getElementById("addr-name");
    const phoneInput = document.getElementById("addr-phone-input");
    const line1Input = document.getElementById("addr-line1");
    const line2Input = document.getElementById("addr-line2");
    const landmarkInput = document.getElementById("addr-landmark");
    const pinInput = document.getElementById("addr-pin");
    const cityInput = document.getElementById("addr-city");
    const stateInput = document.getElementById("addr-state");
    const shipDefault = document.getElementById("addr-is-shipping");
    const srvDefault = document.getElementById("addr-is-service");

    if (addressId) {
      const addr = savedAddresses.find((a) => a.id === addressId);
      if (titleEl) titleEl.textContent = "Edit Address";
      if (addr) {
        if (nameInput) nameInput.value = addr.recipientName || addr.recipient_name || "";
        if (phoneInput) phoneInput.value = addr.recipientPhone || addr.recipient_phone || "";
        if (line1Input) line1Input.value = addr.addressLine1 || addr.address_line1 || "";
        if (line2Input) line2Input.value = addr.addressLine2 || addr.address_line2 || "";
        if (landmarkInput) landmarkInput.value = addr.landmark || "";
        if (pinInput) pinInput.value = addr.postalCode || addr.postal_code || "";
        if (cityInput) cityInput.value = addr.city || "";
        if (stateInput) stateInput.value = addr.state || "";
        if (shipDefault) shipDefault.checked = Boolean(addr.isDefaultShipping || addr.is_default_shipping);
        if (srvDefault) srvDefault.checked = Boolean(addr.isDefaultService || addr.is_default_service);
      }
    } else {
      if (titleEl) titleEl.textContent = "Add New Address";
      if (addressFormEl) addressFormEl.reset();
      if (nameInput && currentProfile && currentProfile.full_name) {
        nameInput.value = currentProfile.full_name;
      }
      if (phoneInput && currentUser && currentUser.phone) {
        phoneInput.value = currentUser.phone;
      }
      if (cityInput && !cityInput.value) cityInput.value = "Delhi";
      if (stateInput && !stateInput.value) stateInput.value = "Delhi";
      if (shipDefault) shipDefault.checked = savedAddresses.length === 0;
    }

    addressDialogEl.showModal();
  }

  function closeAddressModal() {
    if (!addressDialogEl) return;
    addressDialogEl.close();
    editingAddressId = null;
  }

  /**
   * Handles saving (create or update) address.
   */
  async function handleSaveAddress(e) {
    e.preventDefault();
    clearAddressFeedback();

    const saveBtn = document.getElementById("save-address-btn");
    setButtonLoading(saveBtn, true);

    const name = document.getElementById("addr-name")?.value.trim();
    const phone = document.getElementById("addr-phone-input")?.value.trim();
    const line1 = document.getElementById("addr-line1")?.value.trim();
    const line2 = document.getElementById("addr-line2")?.value.trim();
    const landmark = document.getElementById("addr-landmark")?.value.trim();
    const pin = document.getElementById("addr-pin")?.value.trim();
    const city = document.getElementById("addr-city")?.value.trim();
    const state = document.getElementById("addr-state")?.value.trim();
    const isShip = document.getElementById("addr-is-shipping")?.checked;
    const isSrv = document.getElementById("addr-is-service")?.checked;

    const payload = {
      recipient_name: name,
      recipient_phone: phone,
      address_line1: line1,
      address_line2: line2 || null,
      landmark: landmark || null,
      city,
      state,
      postal_code: pin,
      is_default_shipping: isShip,
      is_default_service: isSrv,
    };

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
      }
      renderAddresses();
      closeAddressModal();
    } catch (err) {
      showAddressFeedback(err.message || "Failed to save address.", false);
    } finally {
      setButtonLoading(saveBtn, false);
    }
  }

  async function handleDeleteAddress(addressId) {
    if (!confirm("Are you sure you want to remove this saved address?")) return;
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
    const gateLoginBtn = document.getElementById("gate-login-btn");
    if (gateLoginBtn) {
      gateLoginBtn.addEventListener("click", () => {
        if (window.NailsAuthModal) window.NailsAuthModal.open();
      });
    }

    const logoutBtn = document.getElementById("client-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to sign out?")) {
          if (window.NailsAuth) await window.NailsAuth.signOut();
        }
      });
    }

    if (profileFormEl) {
      profileFormEl.addEventListener("submit", handleSaveProfile);
    }

    const openAddBtn = document.getElementById("open-add-address-btn");
    if (openAddBtn) {
      openAddBtn.addEventListener("click", () => openAddressModal());
    }

    if (addressFormEl) {
      addressFormEl.addEventListener("submit", handleSaveAddress);
    }

    const closeAddrBtn = document.getElementById("address-dialog-close");
    if (closeAddrBtn) {
      closeAddrBtn.addEventListener("click", closeAddressModal);
    }

    const closeOrderDetailsBtn = document.getElementById("order-details-close");
    if (closeOrderDetailsBtn) {
      closeOrderDetailsBtn.addEventListener("click", () => {
        if (orderDetailsDialogEl) orderDetailsDialogEl.close();
      });
    }

    const closeBookingDetailsBtn = document.getElementById("booking-details-close");
    if (closeBookingDetailsBtn) {
      closeBookingDetailsBtn.addEventListener("click", () => {
        if (bookingDetailsDialogEl) bookingDetailsDialogEl.close();
      });
    }

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
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
