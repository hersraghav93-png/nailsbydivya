/**
 * ==============================================================================
 * NAILS BY DIVYA — ACCOUNT & BACKEND API CLIENT (`account-api.js`)
 * Nails by Divya Platform — Phase 1D
 *
 * Provides typed, Bearer-authenticated client operations for customer accounts:
 * - GET    /api/auth/me               -> Current user identity & claims
 * - GET    /api/customer/profile      -> Customer nail sizing & preferences
 * - PUT    /api/customer/profile      -> Update customer profile details
 * - GET    /api/customer/addresses    -> List customer saved addresses
 * - POST   /api/customer/addresses    -> Add new customer address
 * - PUT    /api/customer/addresses/:id-> Update existing customer address
 * - DELETE /api/customer/addresses/:id-> Remove customer address
 * ==============================================================================
 */

(function () {
  "use strict";

  const NailsApi = {
    /**
     * Resolves the active backend API base URL.
     * @returns {string}
     */
    getBaseUrl() {
      if (window.NAILS_CONFIG && window.NAILS_CONFIG.apiUrl) {
        return window.NAILS_CONFIG.apiUrl.replace(/\/+$/, "");
      }
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return "http://localhost:5000";
      }
      return "https://nails-ai-backend.onrender.com";
    },

    /**
     * Executes an authenticated HTTP request to the Express backend.
     *
     * @param {string} endpoint API endpoint path (e.g. '/api/auth/me')
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

      // Retrieve Firebase ID token from NailsAuth if available
      if (window.NailsAuth && typeof window.NailsAuth.getToken === "function") {
        const token = await window.NailsAuth.getToken();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
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

      let data;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        const text = await res.text();
        data = { message: text };
      }

      if (!res.ok) {
        const errorMessage = (data && (data.error || data.message)) || `Server returned status ${res.status}`;
        const err = new Error(errorMessage);
        err.code = (data && data.code) || "HTTP_ERROR";
        err.status = res.status;
        err.details = (data && data.details) || null;
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
     * @param {string} [profileData.full_name]
     * @param {string} [profileData.preferred_nail_shape]
     * @param {string} [profileData.preferred_nail_length]
     * @param {string} [profileData.sizing_preset]
     * @param {object} [profileData.custom_nail_measurements]
     * @param {string} [profileData.allergies_or_notes]
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
     * @param {string} addressData.recipient_name
     * @param {string} addressData.recipient_phone
     * @param {string} addressData.address_line1
     * @param {string} [addressData.address_line2]
     * @param {string} [addressData.landmark]
     * @param {string} addressData.city
     * @param {string} addressData.state
     * @param {string} addressData.postal_code 6-digit Indian PIN
     * @param {boolean} [addressData.is_default_shipping]
     * @param {boolean} [addressData.is_default_service]
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
  };

  window.NailsApi = NailsApi;
})();
