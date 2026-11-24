/**
 * ==============================================================================
 * NAILS BY DIVYA — ACCOUNT & COMMERCE API CLIENT (`account-api.js`)
 * Nails by Divya Platform — Phase 3B Storefront & Commerce Integration
 *
 * Provides typed, Bearer-authenticated client operations for customer accounts,
 * commerce cart, order checkout, at-home service bookings, and product catalog:
 * - GET    /api/auth/me               -> Current user identity & claims
 * - GET    /api/customer/profile      -> Customer nail sizing & preferences
 * - PUT    /api/customer/profile      -> Update customer profile details
 * - GET    /api/customer/addresses    -> List customer saved addresses
 * - POST   /api/customer/addresses    -> Add new customer address
 * - PUT    /api/customer/addresses/:id-> Update existing customer address
 * - DELETE /api/customer/addresses/:id-> Remove customer address
 * - GET    /api/products              -> Public product catalog with pricing & hero images
 * - GET    /api/products/:sku         -> Product details, images gallery & variants
 * - GET    /api/cart                  -> Get active cart details & totals
 * - POST   /api/cart/items            -> Add press-on set to cart
 * - PUT    /api/cart/items/:id        -> Update cart item quantity or sizing
 * - DELETE /api/cart/items/:id        -> Remove item from cart
 * - DELETE /api/cart                  -> Clear cart
 * - POST   /api/cart/claim            -> Associate guest cart with customer
 * - POST   /api/orders                -> Create order from validated cart
 * - GET    /api/orders                -> Customer order history
 * - GET    /api/orders/:id            -> Order details (owner or guest claim)
 * - POST   /api/orders/:id/cancel     -> Cancel pending order
 * - GET    /api/services              -> Approved service menu & active add-ons
 * - GET    /api/services/:id          -> Service details
 * - POST   /api/bookings              -> Submit at-home appointment request
 * - GET    /api/bookings              -> Customer appointment requests
 * - GET    /api/bookings/:id          -> Appointment request details
 * - POST   /api/bookings/:id/cancel   -> Cancel requested appointment
 * ==============================================================================
 */

(function () {
  "use strict";

  const CART_SESSION_KEY = "nbd_cart_session";

  /**
   * Resolves the active backend API base URL based on explicit environment detection.
   * Unknown/unrecognized hostnames fail closed and never fall back to production.
   * @param {string} [hostnameOverride]
   * @returns {string}
   */
  function resolveBackendApiUrl(hostnameOverride) {
    const host = (
      hostnameOverride ||
      (typeof window !== "undefined" && window.location ? window.location.hostname : "") ||
      ""
    ).toLowerCase().trim();

    // 1. Local development
    if (host === "localhost" || host === "127.0.0.1" || host === "") {
      return "http://localhost:3000";
    }

    // 2. Explicit Staging and Preview Environments
    if (
      host === "staging.nailsbydivya.store" ||
      host === "preview.nailsbydivya.store" ||
      host === "staging-admin.nailsbydivya.store" ||
      host.endsWith(".pages.dev") ||
      host === "pages.dev" ||
      host.includes("staging") ||
      host.includes("preview")
    ) {
      return "https://nailsbydivya-staging-api.onrender.com";
    }

    // 3. Explicit Production Website
    if (host === "nailsbydivya.store" || host === "www.nailsbydivya.store") {
      return "https://nails-ai-backend.onrender.com";
    }

    // 4. Fail closed on unknown/unrecognized hosts (Never fall back to production)
    throw new Error(
      `[Nails API Error] Unrecognized environment hostname: "${host}". Refusing to route to production backend.`
    );
  }

  const NailsApi = {
    /**
     * Resolves the active backend API base URL.
     * @param {string} [hostnameOverride]
     * @returns {string}
     */
    getBaseUrl(hostnameOverride) {
      if (!hostnameOverride && typeof window !== "undefined" && window.NAILS_CONFIG && window.NAILS_CONFIG.apiUrl) {
        return window.NAILS_CONFIG.apiUrl.replace(/\/+$/, "");
      }
      return resolveBackendApiUrl(hostnameOverride);
    },

    /**
     * Gets stored guest cart session token from localStorage.
     * @returns {string|null}
     */
    getCartSessionToken() {
      try {
        return localStorage.getItem(CART_SESSION_KEY) || null;
      } catch {
        return null;
      }
    },

    /**
     * Stores cart session token into localStorage.
     * @param {string} token
     */
    setCartSessionToken(token) {
      if (!token) return;
      try {
        localStorage.setItem(CART_SESSION_KEY, token);
      } catch (err) {
        console.warn("Could not persist cart session token:", err);
      }
    },

    /**
     * Clears cart session token from localStorage.
     */
    clearCartSessionToken() {
      try {
        localStorage.removeItem(CART_SESSION_KEY);
      } catch {}
    },

    /**
     * Executes an HTTP request to the Express backend with auth and cart session propagation.
     *
     * @param {string} endpoint API endpoint path (e.g. '/api/cart')
     * @param {object} [options] Fetch options (method, headers, body)
     * @returns {Promise<any>}
     */
    async request(endpoint, options = {}) {
      const baseUrl = this.getBaseUrl();
      const url = `${baseUrl}${endpoint}`;

      const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      };

      // 1. Attach cart session header if available and not explicitly provided
      const cartSession = this.getCartSessionToken();
      if (cartSession && !headers["X-Cart-Session"]) {
        headers["X-Cart-Session"] = cartSession;
      }

      // 2. Retrieve Firebase ID token from NailsAuth if available
      if (window.NailsAuth && typeof window.NailsAuth.getToken === "function") {
        try {
          const token = await window.NailsAuth.getToken();
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
        } catch (authErr) {
          console.debug("Silent auth token retrieval error:", authErr.message);
        }
      }

      const fetchOptions = {
        method: options.method || "GET",
        headers,
      };

      if (options.body) {
        fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      }

      let res;
      try {
        res = await fetch(url, fetchOptions);
      } catch (networkErr) {
        const err = new Error(
          "Unable to connect to the Nails by Divya server. Please check your internet connection."
        );
        err.code = "NETWORK_ERROR";
        err.status = 0;
        throw err;
      }

      // 3. Capture returned X-Cart-Session header from backend response
      const returnedSession = res.headers.get("x-cart-session");
      if (returnedSession) {
        this.setCartSessionToken(returnedSession);
      }

      let data = null;
      let rawText = "";
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const isJson = contentType.includes("application/json");

      if (isJson) {
        try {
          data = await res.json();
        } catch (jsonErr) {
          console.debug("[Nails API] JSON parse error:", jsonErr);
          data = null;
        }
      } else {
        try {
          rawText = await res.text();
        } catch {
          rawText = "";
        }
      }

      if (!res.ok) {
        // Detailed diagnostic information strictly preserved in developer logs only
        console.error(`[Nails API Diagnostic Error] HTTP ${res.status} from ${options.method || "GET"} ${url}`, {
          status: res.status,
          contentType,
          body: data || rawText,
        });

        let customerErrorMessage = "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
        let errorCode = (data && data.code) || "HTTP_ERROR";

        // Preserve meaningful JSON validation/domain errors returned by the actual API
        if (isJson && data) {
          const apiMsg = (typeof data.error === "string" && data.error) ||
                         (typeof data.message === "string" && data.message) || "";
          
          // Never display raw HTML, server error pages, or unhandled Express route errors to customers
          if (apiMsg && !apiMsg.includes("<") && !apiMsg.toLowerCase().startsWith("cannot ")) {
            customerErrorMessage = apiMsg;
          }
        }

        const err = new Error(customerErrorMessage);
        err.code = errorCode;
        err.status = res.status;
        err.details = (data && data.details) || null;
        err.rawResponse = rawText || (data ? JSON.stringify(data) : "");
        throw err;
      }

      return data;
    },

    // --------------------------------------------------------------------------
    // AUTH & CURRENT USER
    // --------------------------------------------------------------------------

    /**
     * Retrieves current authenticated user claims, profile, roles, and permissions.
     * @returns {Promise<{ user: object }>}
     */
    async getCurrentUser() {
      return this.request("/api/auth/me");
    },

    /**
     * Verifies authenticated Firebase ID token and binds user record in PostgreSQL.
     * @param {string} [idToken] Optional explicit token; defaults to NailsAuth.getToken()
     * @returns {Promise<{ status: string, user: object }>}
     */
    async verifyPhone(idToken) {
      const options = {
        method: "POST",
      };
      if (idToken) {
        options.headers = { Authorization: `Bearer ${idToken}` };
        options.body = { idToken };
      }
      return this.request("/api/auth/verify-phone", options);
    },

    /**
     * Requests a passwordless customer sign-in link sent via Resend email.
     * @param {string} email
     * @returns {Promise<{ status: string, message: string }>}
     */
    async requestEmailLoginLink(email) {
      return this.request("/api/auth/email/request-link", {
        method: "POST",
        body: { email },
      });
    },

    /**
     * Exchanges a single-use email login token for a Firebase custom token and user profile.
     * @param {string} token
     * @returns {Promise<{ status: string, customToken: string, linkedOrdersCount: number, linkedBookingsCount: number, user: object }>}
     */
    async verifyEmailLoginToken(token) {
      return this.request("/api/auth/email/verify-link", {
        method: "POST",
        body: { token },
      });
    },

    // --------------------------------------------------------------------------
    // CUSTOMER PROFILE
    // --------------------------------------------------------------------------

    /**
     * Retrieves customer nail preferences, sizing preset, and measurements.
     * @returns {Promise<{ profile: object }>}
     */
    async getCustomerProfile() {
      return this.request("/api/customer/profile");
    },

    /**
     * Updates customer profile details.
     *
     * @param {object} profileData
     * @returns {Promise<{ profile: object, message: string }>}
     */
    async updateCustomerProfile(profileData) {
      return this.request("/api/customer/profile", {
        method: "PUT",
        body: profileData,
      });
    },

    // --------------------------------------------------------------------------
    // CUSTOMER ADDRESSES
    // --------------------------------------------------------------------------

    /**
     * Retrieves all saved addresses for the authenticated customer.
     * @returns {Promise<{ addresses: Array<object> }>}
     */
    async getCustomerAddresses() {
      return this.request("/api/customer/addresses");
    },

    /**
     * Adds a new delivery or appointment address.
     *
     * @param {object} addressData
     * @returns {Promise<{ address: object, message: string }>}
     */
    async addCustomerAddress(addressData) {
      return this.request("/api/customer/addresses", {
        method: "POST",
        body: addressData,
      });
    },

    /**
     * Updates an existing customer address.
     *
     * @param {string} addressId UUID of the address
     * @param {object} addressData
     * @returns {Promise<{ address: object, message: string }>}
     */
    async updateCustomerAddress(addressId, addressData) {
      return this.request(`/api/customer/addresses/${encodeURIComponent(addressId)}`, {
        method: "PUT",
        body: addressData,
      });
    },

    /**
     * Deletes a customer address.
     *
     * @param {string} addressId UUID of the address
     * @returns {Promise<{ message: string }>}
     */
    async deleteCustomerAddress(addressId) {
      return this.request(`/api/customer/addresses/${encodeURIComponent(addressId)}`, {
        method: "DELETE",
      });
    },

    // --------------------------------------------------------------------------
    // PUBLIC PRODUCT CATALOG
    // --------------------------------------------------------------------------

    /**
     * Retrieves active product catalog.
     *
     * @param {object} [params] { category, search, limit, offset }
     * @returns {Promise<{ status: string, count: number, total: number, products: Array<object> }>}
     */
    async listProducts(params = {}) {
      const queryParts = [];
      if (params.category) queryParts.push(`category=${encodeURIComponent(params.category)}`);
      if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
      if (params.limit) queryParts.push(`limit=${encodeURIComponent(params.limit)}`);
      if (params.offset) queryParts.push(`offset=${encodeURIComponent(params.offset)}`);
      const qs = queryParts.length ? `?${queryParts.join("&")}` : "";
      return this.request(`/api/products${qs}`);
    },

    /**
     * Retrieves full product details by SKU with image gallery and variants.
     *
     * @param {string} sku
     * @returns {Promise<{ status: string, product: object }>}
     */
    async getProductBySku(sku) {
      return this.request(`/api/products/${encodeURIComponent(sku)}`);
    },

    // --------------------------------------------------------------------------
    // COMMERCE SHOPPING CART
    // --------------------------------------------------------------------------

    /**
     * Retrieves or initializes active cart for guest or authenticated customer.
     * @returns {Promise<{ cart: object, items: Array<object>, totals: object }>}
     */
    async getCart() {
      return this.request("/api/cart");
    },

    /**
     * Adds an item to the shopping cart.
     *
     * @param {object} itemData { sku, shape, length, sizing_preset, custom_measurements, quantity }
     * @returns {Promise<{ status: string, message: string, cart: object, items: Array<object>, totals: object }>}
     */
    async addToCart(itemData) {
      const res = await this.request("/api/cart/items", {
        method: "POST",
        body: itemData,
      });
      window.dispatchEvent(new CustomEvent("nbd_cart_updated", { detail: res }));
      return res;
    },

    /**
     * Alias for addToCart.
     */
    async addItemToCart(itemData) {
      return this.addToCart(itemData);
    },

    /**
     * Updates an existing cart item quantity or sizing.
     *
     * @param {string} itemId Cart item UUID
     * @param {object} itemData { quantity, shape, length, sizing_preset, custom_measurements }
     * @returns {Promise<{ status: string, message: string, cart: object, items: Array<object>, totals: object }>}
     */
    async updateCartItem(itemId, itemData) {
      const res = await this.request(`/api/cart/items/${encodeURIComponent(itemId)}`, {
        method: "PUT",
        body: itemData,
      });
      window.dispatchEvent(new CustomEvent("nbd_cart_updated", { detail: res }));
      return res;
    },

    /**
     * Removes an item from the cart.
     *
     * @param {string} itemId Cart item UUID
     * @returns {Promise<{ status: string, message: string, cart: object, items: Array<object>, totals: object }>}
     */
    async removeCartItem(itemId) {
      const res = await this.request(`/api/cart/items/${encodeURIComponent(itemId)}`, {
        method: "DELETE",
      });
      window.dispatchEvent(new CustomEvent("nbd_cart_updated", { detail: res }));
      return res;
    },

    /**
     * Clears all items from the cart.
     * @returns {Promise<{ status: string, message: string, cart: object, items: Array, totals: object }>}
     */
    async clearCart() {
      const res = await this.request("/api/cart", {
        method: "DELETE",
      });
      window.dispatchEvent(new CustomEvent("nbd_cart_updated", { detail: res }));
      return res;
    },

    /**
     * Claims a guest cart after authentication, transferring ownership to customer.
     *
     * @param {string} [guestSessionToken] Guest cart session token
     * @returns {Promise<{ status: string, message: string, cart: object }>}
     */
    async claimGuestCart(guestSessionToken) {
      const token = guestSessionToken || this.getCartSessionToken();
      if (!token) return null;
      try {
        const res = await this.request("/api/cart/claim", {
          method: "POST",
          body: { guest_session_token: token },
        });
        window.dispatchEvent(new CustomEvent("nbd_cart_updated", { detail: res }));
        return res;
      } catch (err) {
        console.debug("Could not claim guest cart:", err.message);
        return null;
      }
    },

    // --------------------------------------------------------------------------
    // COMMERCE ORDERS
    // --------------------------------------------------------------------------

    /**
     * Creates an order from the active validated cart.
     * Supports guest checkout and authenticated customer checkout.
     * Orders enter PENDING status (no payment processed online).
     *
     * @param {object} orderData
     * @param {object} orderData.customer { name, phone, email }
     * @param {object} orderData.shipping_address { recipient_name, phone, address_line1, address_line2, landmark, city, state, postal_code }
     * @param {string} [orderData.customer_notes]
     * @param {string} [orderData.idempotency_key]
     * @returns {Promise<{ status: string, message: string, order: object, claimSecret?: string }>}
     */
    async createOrder(orderData) {
      const res = await this.request("/api/orders", {
        method: "POST",
        body: orderData,
      });
      window.dispatchEvent(new CustomEvent("nbd_cart_updated", { detail: null }));
      return res;
    },

    /**
     * Retrieves customer order history (authenticated).
     *
     * @param {object} [options] { limit, offset, status }
     * @returns {Promise<{ status: string, count: number, total: number, orders: Array<object> }>}
     */
    async getCustomerOrders(options = {}) {
      const queryParts = [];
      if (options.limit) queryParts.push(`limit=${encodeURIComponent(options.limit)}`);
      if (options.offset) queryParts.push(`offset=${encodeURIComponent(options.offset)}`);
      if (options.status) queryParts.push(`status=${encodeURIComponent(options.status)}`);
      const qs = queryParts.length ? `?${queryParts.join("&")}` : "";
      return this.request(`/api/orders${qs}`);
    },

    /**
     * Retrieves detailed order by ID (customer or guest with claim secret).
     *
     * @param {string} orderId UUID of the order
     * @param {string} [claimSecret] Secret for guest orders
     * @returns {Promise<{ status: string, order: object }>}
     */
    async getOrderDetails(orderId, claimSecret = null) {
      const headers = {};
      if (claimSecret) headers["X-Claim-Secret"] = claimSecret;
      return this.request(`/api/orders/${encodeURIComponent(orderId)}`, { headers });
    },

    /**
     * Cancels an eligible unpaid order before production begins.
     *
     * @param {string} orderId
     * @param {string} [reason]
     * @returns {Promise<{ status: string, message: string, order: object }>}
     */
    async cancelOrder(orderId, reason = "") {
      return this.request(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        body: { reason },
      });
    },

    // --------------------------------------------------------------------------
    // AT-HOME SERVICES & APPOINTMENTS
    // --------------------------------------------------------------------------

    /**
     * Retrieves all active salon services with approved pricing and addons.
     * Preserves NULL prices without converting them to zero.
     * @returns {Promise<{ status: string, count: number, services: Array<object> }>}
     */
    async listServices() {
      return this.request("/api/services");
    },

    /**
     * Retrieves detailed info for an individual service with its active add-ons.
     *
     * @param {string} serviceId
     * @returns {Promise<{ status: string, service: object }>}
     */
    async getServiceDetails(serviceId) {
      return this.request(`/api/services/${encodeURIComponent(serviceId)}`);
    },

    /**
     * Submits an at-home appointment request (guest or authenticated).
     * Enters REQUESTED status (never confirmed automatically).
     *
     * @param {object} bookingData
     * @param {object} bookingData.customer { name, phone, email }
     * @param {string} bookingData.service_id Service ID (e.g. 'gel_extensions')
     * @param {Array<string>} [bookingData.addon_ids] Selected addon IDs
     * @param {object} bookingData.service_address { address_line1, address_line2, landmark, city, state, postal_code }
     * @param {string} bookingData.requested_date YYYY-MM-DD
     * @param {string} bookingData.requested_time_slot
     * @param {string} [bookingData.customer_notes]
     * @param {string} [bookingData.idempotency_key]
     * @returns {Promise<{ status: string, message: string, booking: object, claimSecret?: string }>}
     */
    async createBooking(bookingData) {
      return this.request("/api/bookings", {
        method: "POST",
        body: bookingData,
      });
    },

    /**
     * Retrieves customer's own appointment requests (authenticated).
     *
     * @param {object} [options] { limit, offset, status }
     * @returns {Promise<{ status: string, count: number, total: number, bookings: Array<object> }>}
     */
    async getCustomerBookings(options = {}) {
      const queryParts = [];
      if (options.limit) queryParts.push(`limit=${encodeURIComponent(options.limit)}`);
      if (options.offset) queryParts.push(`offset=${encodeURIComponent(options.offset)}`);
      if (options.status) queryParts.push(`status=${encodeURIComponent(options.status)}`);
      const qs = queryParts.length ? `?${queryParts.join("&")}` : "";
      return this.request(`/api/bookings${qs}`);
    },

    /**
     * Retrieves detailed appointment view (owner isolated or guest claim).
     *
     * @param {string} bookingId UUID of the booking
     * @param {string} [claimSecret]
     * @returns {Promise<{ status: string, booking: object }>}
     */
    async getBookingDetails(bookingId, claimSecret = null) {
      const headers = {};
      if (claimSecret) headers["X-Claim-Secret"] = claimSecret;
      return this.request(`/api/bookings/${encodeURIComponent(bookingId)}`, { headers });
    },

    /**
     * Cancels an eligible pending appointment request.
     *
     * @param {string} bookingId
     * @param {string} [reason]
     * @returns {Promise<{ status: string, message: string, booking: object }>}
     */
    async cancelBooking(bookingId, reason = "") {
      return this.request(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: "POST",
        body: { reason },
      });
    },
  };

  // Auto-claim guest cart when NailsAuth authenticates a user
  if (typeof window !== "undefined") {
    window.addEventListener("NBD_AUTH_CHANGED", (e) => {
      if (e.detail && e.detail.user) {
        NailsApi.claimGuestCart();
      }
    });
  }

  if (typeof window !== "undefined") {
    window.NailsApi = NailsApi;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { NailsApi, resolveBackendApiUrl };
  }
})();
