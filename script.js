/**
 * ==========================================================================
 * NAILS BY DIVYA — PRODUCT ARCHITECTURE & INTERACTION ENGINE (FINAL POLISH)
 * Architecture: Bifurcated Products vs. Services | Decoupled Checkout Config
 * ==========================================================================
 */

/**
 * ==============================================================================
 * PRIVACY-FIRST LIGHTWEIGHT ANALYTICS EVENT BUS (`window.NBD_Analytics`)
 * Nails by Divya Platform — Phase 5.2
 *
 * Implements a local, client-side event bus for conversion & funnel tracking:
 * - product_view, add_to_cart, checkout_start, order_submission,
 *   booking_submission, whatsapp_click
 * - Strictly strips all customer PII (names, phones, emails, addresses, notes)
 * - Zero external paid trackers or third-party cookies
 * ==============================================================================
 */
window.NBD_Analytics = (function () {
  const subscribers = [];
  const eventHistory = [];

  function sanitize(data) {
    if (!data || typeof data !== "object") return {};
    const clean = { ...data };
    const piiKeys = [
      "customer", "name", "customerName", "phone", "customerPhone",
      "email", "customerEmail", "address", "shippingAddress", "serviceAddress",
      "notes", "customerNotes", "token", "password", "idToken",
      "addressLine1", "address_line1", "address_line2"
    ];
    piiKeys.forEach((k) => delete clean[k]);
    return clean;
  }

  function track(eventName, payload = {}) {
    const properties = sanitize(payload);
    const eventRecord = {
      event: eventName,
      timestamp: new Date().toISOString(),
      properties,
    };

    eventHistory.push(eventRecord);
    if (eventHistory.length > 50) eventHistory.shift();

    const host = (typeof window !== "undefined" && window.location ? window.location.hostname : "") || "";
    if (host === "localhost" || host === "127.0.0.1") {
      console.log(`[NBD Analytics] ${eventName}:`, properties);
    }

    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("nbd_analytics", { detail: eventRecord }));
      }
    } catch {}

    // Asynchronous privacy-safe persistence to backend
    try {
      const apiUrl = window.NailsApi.getBaseUrl();
      const endpoint = `${apiUrl}/api/analytics/events`;
      const body = JSON.stringify({
        event: eventName,
        timestamp: eventRecord.timestamp,
        properties,
      });

      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(endpoint, blob);
      } else if (typeof fetch === "function") {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}

    subscribers.forEach((fn) => {
      try {
        fn(eventRecord);
      } catch (err) {
        console.warn("[Analytics Subscriber Error]:", err);
      }
    });

    return eventRecord;
  }

  function subscribe(fn) {
    if (typeof fn === "function") subscribers.push(fn);
  }

  function getHistory() {
    return [...eventHistory];
  }

  return {
    track,
    subscribe,
    getHistory,
  };
})();

// Global delegated listener for WhatsApp interaction analytics
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const waTarget = e.target.closest('a[href*="wa.me"], button.whatsapp-button, .whatsapp-floating-btn, #floating-whatsapp-btn');
    if (waTarget && window.NBD_Analytics) {
      const href = waTarget.getAttribute("href") || "";
      const source = waTarget.id || waTarget.className || "whatsapp_link";
      const context = waTarget.getAttribute("data-wa-context") || (href.includes("text=") ? "custom_inquiry" : "general_inquiry");
      window.NBD_Analytics.track("whatsapp_click", {
        source,
        context,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// 01. SINGLE SOURCE OF TRUTH — PRODUCT PRICING & SKU REGISTRY
// ---------------------------------------------------------------------------
const catalogPrices = new Map();
let catalogPriceRequest;
let productPricingView = 0;

function formatCatalogPrice(price) {
  return "₹" + price.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function renderCatalogPrice(element, price, emptyLabel = "Price unavailable") {
  if (!element) return;
  const promo = price?.isPromoApplied && price.basePrice > price.effectivePrice;
  element.classList.toggle("festive-pricing", Boolean(promo));
  if (!price) {
    element.textContent = emptyLabel;
    return;
  }

  const effectivePrice = formatCatalogPrice(price.effectivePrice);
  element.innerHTML = promo
    ? `<div class="product-price-row">
        <span class="product-price-promo">${effectivePrice}</span>
        <del class="product-price-original">${formatCatalogPrice(price.basePrice)}</del>
      </div>
      <span class="festive-offer-label">${escapeHtml(price.promoName || "Offer")}</span>`
    : `<div class="product-price-row"><strong class="product-price-regular">${effectivePrice}</strong></div>`;
}

function getCatalogPrices() {
  if (!catalogPriceRequest) {
    catalogPriceRequest = window.NailsApi.listProducts().then(({ products }) => {
      for (const product of products) {
        if (product.isAvailable !== false && Number.isFinite(product.effectivePrice) &&
            Number.isFinite(product.basePrice) && product.effectivePrice >= 0) {
          catalogPrices.set(product.sku, product);
        }
      }
    }).catch(() => {
      catalogPriceRequest = null;
    });
  }
  return catalogPriceRequest;
}

// ---------------------------------------------------------------------------
// 01B. CHECKOUT & COMMERCE CONFIGURATION (FUTURE-PROOF ABSTRACTION)
// ---------------------------------------------------------------------------
const CHECKOUT_CONFIG = {
  activeMethod: "whatsapp", // Options: "whatsapp" | "shopify_redirect"
  whatsappNumber: (typeof window !== "undefined" && window.NAILS_CONFIG && window.NAILS_CONFIG.business && window.NAILS_CONFIG.business.phoneRaw) || "918447391310",
  brandName: "Nails by Divya",

  /**
   * Generates a checkout action URL based on current active architecture.
   */
  getCheckoutUrl(productName, category, price = null, sku = null, customNote = "") {
    if (this.activeMethod === "whatsapp") {
      const skuStr = sku ? ` [SKU: ${sku}]` : "";
      const priceStr = price ? ` • Price: *${price}*` : "";
      const noteStr = customNote ? `\n• ${customNote}` : "";
      const text = `Hi Divya! I would like to order the handmade press-on nail set: *${productName}*${skuStr} (${category})${priceStr}.${noteStr}\n\nPlease let me know how to share my nail measurements and confirm delivery across India.`;
      const encodedText = encodeURIComponent(text);
      return `https://wa.me/${this.whatsappNumber}?text=${encodedText}`;
    }
    // Future-proofing for Shopify or E-commerce platform
    return `/checkout?sku=${encodeURIComponent(sku || "")}&product=${encodeURIComponent(productName)}`;
  },

  /**
   * Generates a service appointment consultation URL.
   */
  getServiceBookingUrl(serviceTitle, locationNote = "Delhi NCR") {
    const text = `Hi Divya! I would like to inquire about *${serviceTitle}* (${locationNote}).\n\nPlease let me know your availability and how we can proceed.`;
    const encodedText = encodeURIComponent(text);
    return `https://wa.me/${this.whatsappNumber}?text=${encodedText}`;
  }
};

// ---------------------------------------------------------------------------
// 02. DOM READY INITIALIZATION
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initProductPrices();
  initCheckoutPhoneValidation();
  initHeaderScroll();
  initMobileNav();
  initHeroShowcase();
  initLuxuryCarousels();
  initShopFilters();
  initModals();
  initScrollAnimations();
  initTrustFaq();
  initMomentCarousel();
  initDivvStylist();
  initDiwaliCards();
});

/**
 * Enables subtle firework visual feedback on mobile touch/tap for Diwali offer cards.
 * Uses a passive event listener so WhatsApp navigation is never blocked or delayed.
 */
function initDiwaliCards() {
  document.querySelectorAll(".diwali-offer-card").forEach((card) => {
    let startY = 0;
    let timer = null;

    card.addEventListener("pointerdown", (e) => {
      startY = e.clientY;
      card.classList.add("firework-active");
      clearTimeout(timer);
      timer = setTimeout(() => {
        card.classList.remove("firework-active");
      }, 900);
    }, { passive: true });

    card.addEventListener("pointermove", (e) => {
      // If user drags/scrolls > 10px, dismiss firework state immediately
      if (Math.abs(e.clientY - startY) > 10) {
        card.classList.remove("firework-active");
      }
    }, { passive: true });

    card.addEventListener("pointercancel", () => {
      card.classList.remove("firework-active");
    }, { passive: true });
  });
}

async function initProductPrices() {
  const cards = document.querySelectorAll("article[data-product-sku], aside[data-product-sku], .carousel-card[data-product-sku]");
  if (!cards.length || !window.NailsApi) return;
  await getCatalogPrices();
  for (const card of cards) {
    renderCatalogPrice(card.querySelector(".product-price"), catalogPrices.get(card.dataset.productSku));
  }
}

// ---------------------------------------------------------------------------
// 03. HEADER SCROLL & MOBILE NAVIGATION
// ---------------------------------------------------------------------------
function initHeaderScroll() {
  const header = document.getElementById("site-header");
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 30) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function initMobileNav() {
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.getElementById("nav-links");
  if (!navToggle || !navLinks) return;

  let backdrop = document.getElementById("mobile-nav-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "mobile-nav-backdrop";
    backdrop.className = "mobile-nav-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);
  }

  const toggleMenu = (open) => {
    const isExpanded = open !== undefined ? open : !navLinks.classList.contains("is-open");
    navToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    navToggle.classList.toggle("is-active", isExpanded);
    navLinks.classList.toggle("is-open", isExpanded);
    backdrop.classList.toggle("is-open", isExpanded);

    // Prevent background scrolling while open, restore cleanly when closed
    if (isExpanded) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
  };

  navToggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  // Close button inside mobile drawer
  const closeBtn = document.getElementById("mobile-drawer-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu(false);
    });
  }

  // Quick Cart trigger on mobile header
  const mobileCartBtn = document.getElementById("mobile-nav-cart-btn");
  if (mobileCartBtn) {
    mobileCartBtn.addEventListener("click", (e) => {
      toggleMenu(false);
      const overlay = document.getElementById("cart-drawer-overlay");
      if (overlay) {
        e.preventDefault();
        if (typeof openCartDrawer === "function") openCartDrawer();
      } else {
        window.location.href = "index.html#shop";
      }
    });
  }

  // Shopping Bag action inside mobile drawer
  const drawerCartBtn = document.getElementById("mobile-drawer-cart-btn");
  if (drawerCartBtn) {
    drawerCartBtn.addEventListener("click", (e) => {
      toggleMenu(false);
      const overlay = document.getElementById("cart-drawer-overlay");
      if (overlay) {
        e.preventDefault();
        if (typeof openCartDrawer === "function") openCartDrawer();
      } else {
        window.location.href = "index.html#shop";
      }
    });
  }

  // Dismiss on backdrop click or touch
  const onBackdropDismiss = (e) => {
    if (e) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      if (typeof e.stopPropagation === "function") e.stopPropagation();
    }
    toggleMenu(false);
  };
  backdrop.addEventListener("click", onBackdropDismiss);
  backdrop.addEventListener("touchstart", onBackdropDismiss, { passive: true });

  // Auto-close menu when tapping navigation links
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => toggleMenu(false));
  });

  // Escape-key closing
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navLinks.classList.contains("is-open")) {
      toggleMenu(false);
    }
  });

  // Responsive guard on resize
  window.addEventListener("resize", () => {
    if (window.innerWidth > 980 && navLinks.classList.contains("is-open")) {
      toggleMenu(false);
    }
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// 04. HERO ROTATING SHOWCASE (POLISHED 5-SECOND ROTATION)
// ---------------------------------------------------------------------------
function initHeroShowcase() {
  const showcase = document.getElementById("hero-showcase");
  if (!showcase) return;

  const slides = Array.from(showcase.querySelectorAll(".hero-slide"));
  if (slides.length <= 1) return;

  const dots = Array.from(document.querySelectorAll("#hero-showcase-indicators .showcase-dot"));

  let currentIndex = 0;

  function goToSlide(index) {
    slides.forEach((s, i) => s.classList.toggle("is-active", i === index));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === index));
    currentIndex = index;
  }

  dots.forEach((dot, idx) => {
    dot.addEventListener("click", () => {
      goToSlide(idx);
    });
  });

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  setInterval(() => {
    const nextIndex = (currentIndex + 1) % slides.length;
    goToSlide(nextIndex);
  }, 5000);
}

// ---------------------------------------------------------------------------
// 05. LUXURY HORIZONTAL CAROUSELS (TRUE INFINITE SEAMLESS LOOP & AUTO-SCROLL)
// ---------------------------------------------------------------------------
function initLuxuryCarousels() {
  const carousels = document.querySelectorAll(".luxury-carousel-wrapper");

  carousels.forEach((wrapper) => {
    const track = wrapper.querySelector(".luxury-carousel-track");
    const prevBtn = wrapper.querySelector(".carousel-prev");
    const nextBtn = wrapper.querySelector(".carousel-next");
    const progressBar = wrapper.querySelector(".carousel-progress-bar");
    const targetId = wrapper.dataset.carousel;

    if (!track) return;

    // Clone all children once to create a true, zero-jump infinite loop
    const originalChildren = Array.from(track.children);
    if (originalChildren.length > 0) {
      originalChildren.forEach((child) => {
        const clone = child.cloneNode(true);
        clone.classList.add("is-clone");
        clone.setAttribute("aria-hidden", "true");
        track.appendChild(clone);
      });
    }

    const getHalfScrollWidth = () => {
      if (track.children.length > originalChildren.length) {
        const firstClone = track.children[originalChildren.length];
        return firstClone.offsetLeft - track.children[0].offsetLeft;
      }
      return track.scrollWidth / 2;
    };

    const checkInfiniteLoop = () => {
      const halfWidth = getHalfScrollWidth();
      if (halfWidth <= 0) return;

      if (track.scrollLeft >= halfWidth) {
        track.scrollLeft -= halfWidth;
        if (isDown && typeof scrollLeftStart !== "undefined") scrollLeftStart -= halfWidth;
      } else if (track.scrollLeft <= 1) {
        // When user scrolls backwards past start, wrap to second half
        if ((isDown && typeof scrollLeftStart !== "undefined") || touchMoved) {
          track.scrollLeft += halfWidth;
          if (typeof scrollLeftStart !== "undefined") scrollLeftStart += halfWidth;
        }
      }
    };

    // Scroll progress bar logic (based on position inside single loop half)
    const updateProgress = () => {
      if (!progressBar) return;
      const scrollLeft = track.scrollLeft;
      const halfWidth = getHalfScrollWidth();
      if (halfWidth <= 0) {
        progressBar.style.width = "100%";
        return;
      }

      const loopPosition = scrollLeft % halfWidth;
      const progressRatio = Math.min(1, Math.max(0.12, (loopPosition / halfWidth) * 0.88 + 0.12));
      progressBar.style.width = `${progressRatio * 100}%`;

      const progressContainer = wrapper.querySelector(".carousel-progress");
      if (progressContainer) {
        const maxVal = parseInt(progressContainer.getAttribute("aria-valuemax"), 10) || 60;
        const currentVal = Math.min(maxVal, Math.max(1, Math.round(progressRatio * maxVal)));
        progressContainer.setAttribute("aria-valuenow", String(currentVal));
      }

      if (prevBtn) prevBtn.disabled = false;
      if (nextBtn) nextBtn.disabled = false;
    };

    track.addEventListener("scroll", () => {
      updateProgress();
      checkInfiniteLoop();
    }, { passive: true });

    window.addEventListener("resize", updateProgress, { passive: true });
    updateProgress();

    // Arrow navigation
    const scrollAmount = () => Math.min(600, track.clientWidth * 0.75);

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        pauseAutoScroll(8000);
        if (track.scrollLeft <= scrollAmount()) {
          track.scrollLeft += getHalfScrollWidth();
        }
        track.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        pauseAutoScroll(8000);
        checkInfiniteLoop();
        track.scrollBy({ left: scrollAmount(), behavior: "smooth" });
      });
    }

    // Mouse & Touch drag support
    let isDown = false;
    let startX;
    let scrollLeftStart;
    let hasDragged = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;

    track.addEventListener("mousedown", (e) => {
      isDown = true;
      hasDragged = false;
      track.dataset.hasDragged = "false";
      pauseAutoScroll(10000);
      track.classList.add("is-dragging");
      startX = e.pageX - track.offsetLeft;
      scrollLeftStart = track.scrollLeft;
    });

    track.addEventListener("mouseleave", () => {
      if (isDown) {
        isDown = false;
        track.classList.remove("is-dragging");
      }
    });

    track.addEventListener("mouseup", () => {
      isDown = false;
      track.classList.remove("is-dragging");
      track.dataset.hasDragged = hasDragged ? "true" : "false";
    });

    track.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - track.offsetLeft;
      const walk = (x - startX) * 1.5;
      if (Math.abs(walk) > 6) {
        hasDragged = true;
      }
      track.scrollLeft = scrollLeftStart - walk;
      checkInfiniteLoop();
    });

    track.dataset.hasDragged = "false";

    // -----------------------------------------------------------------------
    // TRUE INFINITE SEAMLESS HORIZONTAL AUTO-SCROLL (ZERO JUMP OR RESET)
    // -----------------------------------------------------------------------
    let autoScrollInterval = null;
    let isInteracting = false;
    let pauseTimeout = null;

    // Slower, museum-grade calm movement on mobile viewports while preserving exact desktop timing
    const getStepInterval = () => {
      const isMobile = window.innerWidth <= 768;
      if (targetId === "portfolio") {
        return isMobile ? 54 : 36;
      }
      return isMobile ? 42 : 24;
    };

    const startAutoScroll = () => {
      if (autoScrollInterval || isInteracting) return;
      track.classList.add("is-auto-scrolling");
      autoScrollInterval = setInterval(() => {
        if (isInteracting || isDown) return;
        const scrollWidth = track.scrollWidth - track.clientWidth;
        if (scrollWidth <= 0) return;

        checkInfiniteLoop();
        track.scrollLeft += 1;
      }, getStepInterval());
    };

    const stopAutoScroll = () => {
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
      }
      track.classList.remove("is-auto-scrolling");
    };

    const pauseAutoScroll = (resumeDelay = 6000) => {
      isInteracting = true;
      stopAutoScroll();
      if (pauseTimeout) clearTimeout(pauseTimeout);
      pauseTimeout = setTimeout(() => {
        isInteracting = false;
        startAutoScroll();
      }, resumeDelay);
    };

    track.addEventListener("mouseenter", () => pauseAutoScroll(6000));
    track.addEventListener("wheel", () => pauseAutoScroll(6000), { passive: true });

    track.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].pageX;
        touchStartY = e.touches[0].pageY;
        touchMoved = false;
      }
      pauseAutoScroll(8000);
    }, { passive: true });

    track.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length > 0) {
        const dx = e.touches[0].pageX - touchStartX;
        const dy = e.touches[0].pageY - touchStartY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          touchMoved = true;
          track.dataset.hasDragged = "true";
        }
      }
      pauseAutoScroll(8000);
    }, { passive: true });

    track.addEventListener("touchend", () => {
      pauseAutoScroll(6000);
      if (touchMoved) {
        setTimeout(() => {
          track.dataset.hasDragged = "false";
          touchMoved = false;
        }, 150);
      } else {
        track.dataset.hasDragged = "false";
      }
    }, { passive: true });

    window.addEventListener("resize", () => {
      if (autoScrollInterval) {
        stopAutoScroll();
        startAutoScroll();
      }
    }, { passive: true });

    // Start auto-scroll smoothly after initial gentle delay
    setTimeout(startAutoScroll, 2000);
  });
}

// ---------------------------------------------------------------------------
// 06. PRESS-ON COLLECTION & LOOKBOOK CATEGORY FILTERS
// ---------------------------------------------------------------------------
/**
 * Progressive Disclosure for Mobile Press-On Collection
 * Initially collapses product grid to first 3 designs on mobile,
 * revealing the full collection smoothly upon tapping the floating CTA or any filter.
 */
/**
 * Progressive Disclosure for Mobile Press-On Collection
 * - Initially collapses product grid to first 3 designs on mobile with "Explore Our Entire Collection ↓"
 * - Expands to reveal full 22-item collection upon tapping the floating CTA or any filter
 * - Displays "↑ Show Featured Designs" at the very end of the expanded collection
 * - Tapping collapse returns visitor smoothly to the beginning of the Press-On collection and collapses back to 3
 * - Ensures expand and collapse controls never appear simultaneously
 */
function initMobileShopExpand() {
  const grid = document.getElementById("product-grid");
  const expandWrap = document.getElementById("shop-mobile-expand-wrap");
  const expandBtn = document.getElementById("shop-mobile-expand-btn");
  const collapseWrap = document.getElementById("shop-mobile-collapse-wrap");
  const collapseBtn = document.getElementById("shop-mobile-collapse-btn");
  if (!grid || !expandBtn) return;

  function isMobile() {
    return window.innerWidth <= 640;
  }

  function expand(scrollIntoView = true) {
    if (!grid.classList.contains("is-collapsed-mobile")) return;
    grid.classList.remove("is-collapsed-mobile");
    if (expandWrap) {
      expandWrap.style.display = "none";
    }
    if (collapseWrap && isMobile()) {
      collapseWrap.style.display = "flex";
    }
    expandBtn.setAttribute("aria-expanded", "true");
    if (scrollIntoView) {
      const fourthCard = grid.querySelector(".product-card:nth-child(4)");
      if (fourthCard) {
        fourthCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  function collapse() {
    grid.classList.add("is-collapsed-mobile");
    if (collapseWrap) {
      collapseWrap.style.display = "none";
    }
    if (expandWrap && isMobile()) {
      expandWrap.style.display = "flex";
    }
    expandBtn.setAttribute("aria-expanded", "false");

    // Smoothly return visitor to the beginning of the Press-On collection
    const shopSection = document.getElementById("shop") || grid;
    shopSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  expandBtn.addEventListener("click", () => {
    expand(true);
  });

  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      collapse();
    });
  }

  const shopTabs = document.querySelectorAll(".shop-category-nav .category-tab, [data-shop-filter]");
  shopTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      expand(false);
    });
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      if (expandWrap) expandWrap.style.display = "none";
      if (collapseWrap) collapseWrap.style.display = "none";
    } else {
      if (grid.classList.contains("is-collapsed-mobile")) {
        if (expandWrap) expandWrap.style.display = "flex";
        if (collapseWrap) collapseWrap.style.display = "none";
      } else {
        if (expandWrap) expandWrap.style.display = "none";
        if (collapseWrap) collapseWrap.style.display = "flex";
      }
    }
  });
}

function initShopFilters() {
  initMobileShopExpand();
  // Shop Category Tabs
  const shopTabs = document.querySelectorAll(".shop-category-nav .category-tab, [data-shop-filter]");
  const productCards = document.querySelectorAll(".product-card, .carousel-card");
  const track = document.getElementById("shop-carousel-track");

  if (shopTabs.length && productCards.length) {
    shopTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        shopTabs.forEach((t) => {
          t.classList.remove("is-active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");

        const filter = tab.getAttribute("data-filter") || tab.getAttribute("data-shop-filter") || "all";

        productCards.forEach((card) => {
          const cat = card.getAttribute("data-category");
          if (filter === "all" || cat === filter) {
            card.classList.add("is-active");
            card.style.display = "flex";
          } else {
            card.classList.remove("is-active");
            card.style.display = "none";
          }
        });

        if (track) {
          track.scrollTo({ left: 0, behavior: "smooth" });
          track.dispatchEvent(new Event("scroll"));
        }
      });
    });
  }

  // Lookbook Gallery Filter Tabs
  const galleryTabs = document.querySelectorAll(".gallery-filter-tabs .filter-tab");
  const lookbookCards = document.querySelectorAll(".lookbook-card, .portfolio-card");

  if (galleryTabs.length && lookbookCards.length) {
    galleryTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        galleryTabs.forEach((t) => {
          t.classList.remove("is-active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");

        const filter = tab.getAttribute("data-filter") || "all";

        lookbookCards.forEach((card) => {
          const cat = card.getAttribute("data-category");
          if (filter === "all" || cat === filter) {
            card.style.display = "block";
          } else {
            card.style.display = "none";
          }
        });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// 08. BIFURCATED MODAL ARCHITECTURE (STRICT PRODUCT VS SERVICE SEPARATION)
// ---------------------------------------------------------------------------
function initModals() {
  const productModal = document.getElementById("product-modal");
  const serviceModal = document.getElementById("service-modal");
  const checkoutModal = document.getElementById("checkout-modal");
  const cartDrawerOverlay = document.getElementById("cart-drawer-overlay");

  const productClose = document.getElementById("product-modal-close");
  const serviceClose = document.getElementById("service-modal-close");
  const checkoutClose = document.getElementById("checkout-modal-close");
  const cartDrawerClose = document.getElementById("cart-drawer-close");

  // Close triggers
  if (productClose) productClose.addEventListener("click", closeAllModals);
  if (serviceClose) serviceClose.addEventListener("click", closeAllModals);
  if (checkoutClose) checkoutClose.addEventListener("click", closeAllModals);
  if (cartDrawerClose) cartDrawerClose.addEventListener("click", closeCartDrawer);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });

  if (productModal) {
    productModal.addEventListener("click", (e) => {
      if (e.target === productModal) closeAllModals();
    });
  }

  if (serviceModal) {
    serviceModal.addEventListener("click", (e) => {
      if (e.target === serviceModal) closeAllModals();
    });
  }

  if (checkoutModal) {
    checkoutModal.addEventListener("click", (e) => {
      if (e.target === checkoutModal) closeAllModals();
    });
  }

  if (cartDrawerOverlay) {
    cartDrawerOverlay.addEventListener("click", (e) => {
      if (e.target === cartDrawerOverlay) closeCartDrawer();
    });
  }

  // Navigation Cart Button
  const navCartBtn = document.getElementById("nav-cart-btn");
  if (navCartBtn) {
    navCartBtn.addEventListener("click", (e) => {
      const overlay = document.getElementById("cart-drawer-overlay");
      if (overlay) {
        e.preventDefault();
        openCartDrawer();
      }
    });
  }

  // Cart Drawer Checkout CTA
  const cartCheckoutCta = document.getElementById("cart-checkout-cta");
  if (cartCheckoutCta) {
    cartCheckoutCta.addEventListener("click", () => {
      openCheckoutModal();
    });
  }

  document.getElementById("cart-check-receipt")?.addEventListener("click", openCheckoutModal);
  let lastBuyer = window.NailsApi?.getBuyerId?.() || null;
  document.addEventListener("nails:auth-changed", () => {
    const buyer = window.NailsApi?.getBuyerId?.() || null;
    if (buyer !== lastBuyer) {
      lastBuyer = buyer;
      if (pendingCheckout && pendingCheckout.buyer !== buyer) saveCheckout(null);
      closeAllModals();
      checkoutSubmitting = null;
      const place = document.getElementById("checkout-place-order-btn");
      if (place) place.disabled = false;
      document.getElementById("checkout-order-form")?.reset();
      document.getElementById("checkout-confirmation-order-number")?.replaceChildren();
      document.getElementById("checkout-confirmation-whatsapp-btn")?.removeAttribute("href");
      document.getElementById("cart-drawer-items")?.replaceChildren();
    }
    // Resolving the cart atomically claims an eligible guest bag on sign-in.
    refreshCartBadge();
  });

  // Cart Empty Shop CTA
  const cartEmptyShopBtn = document.getElementById("cart-empty-shop-btn");
  if (cartEmptyShopBtn) {
    cartEmptyShopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeCartDrawer();
      const shopSec = document.getElementById("shop");
      if (shopSec) shopSec.scrollIntoView({ behavior: "smooth" });
    });
  }

  // Refresh cart badge on load and on custom cart updates
  refreshCartBadge();
  window.addEventListener("nbd_cart_updated", refreshCartBadge);

  // 08A. PRODUCT CARD CLICK HANDLING (`.carousel-card, .product-card`) -> PRODUCT MODAL ONLY
  document.querySelectorAll(".carousel-card, .product-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      const track = card.closest(".luxury-carousel-track");
      if (track && track.dataset.hasDragged === "true") return;

      // Check if button was clicked directly
      if (e.target.closest("button[data-action='order']")) return;

      openProductModalFromCard(card);
    });

    const detailsBtn = card.querySelector("button[data-action='details']");
    if (detailsBtn) {
      detailsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openProductModalFromCard(card);
      });
    }
  });

  // Direct Order CTA Buttons inside Product Cards
  document.querySelectorAll("button[data-action='order']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const title = btn.getAttribute("data-product-title") || "Press-On Set";
      const category = btn.getAttribute("data-product-category") || "Handmade Collection";
      const cardEl = btn.closest(".carousel-card, article");
      const sku = btn.getAttribute("data-product-sku") || (cardEl ? cardEl.getAttribute("data-product-sku") : null);
      const price = catalogPrices.get(sku);
      const effectivePrice = price ? formatCatalogPrice(price.effectivePrice) : null;
      window.open(CHECKOUT_CONFIG.getCheckoutUrl(title, category, effectivePrice, sku), "_blank", "noopener,noreferrer");
    });
  });

  // 08B. PORTFOLIO CARD CLICK HANDLING -> Managed centrally via bindCardFilters() in initLookbookEngine()

  // 08C. SERVICE PILLAR CTA BUTTONS (`data-action="service-book"`) -> SERVICE MODAL ONLY
  document.querySelectorAll("button[data-action='service-book']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const title = btn.getAttribute("data-service-title") || "At-Home Appointment";
      const card = btn.closest(".service-card");
      const cardDesc = card ? card.querySelector("p") : null;
      const desc = cardDesc ? cardDesc.textContent.trim() : "Relax in the privacy and comfort of your home across Delhi NCR while we bring salon-grade equipment directly to your doorstep.";
      openServiceModal(title, desc);
    });
  });

  // 08D. EVENTS & COLLABORATIONS CTA BUTTON (`data-action="service-events"`)
  document.querySelectorAll("button[data-action='service-events']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const title = btn.getAttribute("data-service-title") || "Events & Collaborations Inquiry";
      openServiceModal(title, "Divya is available for tailored on-location nail services, brand activations, store pop-ups, and bridal sangeet stations across Delhi NCR. Elevate your event with bespoke nail artistry.");
    });
  });
}

function openProductModalFromCard(card) {
  const titleElem = card.querySelector("h4");
  const descElem = card.querySelector(".product-description");
  const imgElem = card.querySelector("img");
  const badgeElem = card.querySelector(".product-badge");
  const sku = card.getAttribute("data-product-sku");

  if (!titleElem || !imgElem) return;

  const imgSrc = imgElem.currentSrc || imgElem.src || imgElem.getAttribute("src") || imgElem.getAttribute("data-src") || "";

  openProductModal({
    title: titleElem.textContent.trim(),
    category: badgeElem ? `${badgeElem.textContent.trim()} • Handmade Press-On` : "Handmade Press-On • Pan-India",
    imageSrc: imgSrc,
    imageAlt: imgElem.alt || titleElem.textContent.trim(),
    description: descElem ? descElem.textContent.trim() : "Individually hand-painted by Divya using salon-grade soft gel after your order is confirmed.",
    sku: sku
  });
}

/**
 * Opens the Imagery-Led Product Modal (`#product-modal`).
 */
function openProductModal({ title, category, imageSrc, imageAlt, description, sku }) {
  const modal = document.getElementById("product-modal");
  if (!modal) return;

  const titleEl = document.getElementById("product-modal-title");
  const catEl = document.getElementById("product-modal-category");
  const skuEl = document.getElementById("product-modal-sku");
  const imgEl = document.getElementById("product-modal-image");
  const descEl = document.getElementById("product-modal-desc");
  const priceEl = document.getElementById("product-modal-price");
  const addBagBtn = document.getElementById("product-modal-add-bag");
  const addBagLabel = document.getElementById("product-modal-add-label");
  const checkoutBtn = document.getElementById("product-modal-checkout-btn");
  const actionBtn = document.getElementById("product-modal-action-btn");
  const feedbackEl = document.getElementById("product-modal-feedback");
  const sizingGuideText = document.getElementById("modal-sizing-guide-text");
  const customBox = document.getElementById("modal-custom-measurements");

  // Synchronously update all text fields so information never carries over from previously opened design
  if (titleEl) titleEl.textContent = title || "Bespoke Artistry";
  if (catEl) catEl.textContent = category || "Handmade Collection";
  if (skuEl) {
    if (sku) {
      skuEl.textContent = `SKU: ${sku}`;
      skuEl.style.display = "inline-block";
    } else {
      skuEl.textContent = "";
      skuEl.style.display = "none";
    }
  }
  if (descEl) descEl.textContent = description || "";
  if (feedbackEl) { feedbackEl.textContent = ""; feedbackEl.style.display = "none"; }

  const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'><rect width='100%' height='100%' fill='%23faf7f2'/><text x='50%' y='48%' font-family='sans-serif' font-size='16' fill='%239e8a78' text-anchor='middle'>Design Imagery</text><text x='50%' y='54%' font-family='sans-serif' font-size='12' fill='%23c2b2a3' text-anchor='middle'>Nails by Divya</text></svg>";

  if (imgEl) {
    imgEl.onerror = null;
    imgEl.alt = imageAlt || title || "Nails by Divya Design";
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = placeholderSvg;
    };
    imgEl.src = (imageSrc && String(imageSrc).trim()) ? imageSrc : placeholderSvg;
  }

  const priceView = ++productPricingView;
  let effectivePrice = null;

  function updatePrice(price, emptyLabel) {
    effectivePrice = price ? formatCatalogPrice(price.effectivePrice) : null;
    if (priceEl) priceEl.style.display = sku ? "" : "none";
    renderCatalogPrice(priceEl, price, emptyLabel);
    for (const button of [addBagBtn, checkoutBtn]) {
      if (button) button.disabled = Boolean(sku && !price);
    }
    if (addBagLabel) {
      addBagLabel.textContent = sku
        ? (effectivePrice ? `Add to Bag • ${effectivePrice}` : "Add to Bag")
        : "Order Bespoke Set on WhatsApp →";
    }
  }

  const price = catalogPrices.get(sku);
  updatePrice(price, sku && !price ? "Loading price…" : undefined);
  if (sku && !price && window.NailsApi) {
    initProductPrices().then(() => {
      if (priceView === productPricingView) updatePrice(catalogPrices.get(sku));
    });
  }

  // Privacy-first product view analytics tracking
  if (window.NBD_Analytics) {
    window.NBD_Analytics.track("product_view", {
      sku: sku || "LOOKBOOK",
      title: title || "Press-On Set",
      category: category || "Handmade Collection",
      price: effectivePrice || (sku ? "Unavailable" : "Custom Quotation"),
    });
  }

  if (checkoutBtn) {
    const checkoutSpan = checkoutBtn.querySelector("span");
    if (checkoutSpan) {
      checkoutSpan.textContent = sku ? "Direct Checkout →" : "Book Salon Service →";
    }
  }
  if (actionBtn) {
    actionBtn.style.display = sku ? "block" : "none";
  }

  // Active attributes
  let activeShape = "Almond";
  let activeLength = "Medium";
  let activeSize = "M";

  // Wire shape pills
  const shapePills = modal.querySelectorAll("#modal-shape-pills .option-pill");
  shapePills.forEach((pill) => {
    const isAlmond = pill.getAttribute("data-shape") === "Almond";
    pill.classList.toggle("is-active", isAlmond);
    pill.onclick = () => {
      shapePills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      activeShape = pill.getAttribute("data-shape") || "Almond";
      updateOrderAction();
    };
  });

  // Wire length pills
  const lengthPills = modal.querySelectorAll("#modal-length-pills .option-pill");
  lengthPills.forEach((pill) => {
    const isMedium = pill.getAttribute("data-length") === "Medium";
    pill.classList.toggle("is-active", isMedium);
    pill.onclick = () => {
      lengthPills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      activeLength = pill.getAttribute("data-length") || "Medium";
      updateOrderAction();
    };
  });

  // Sizing chart details
  const SIZING_INFO = {
    "XS": "Thumb: 14mm, Index: 11mm, Middle: 12mm, Ring: 10mm, Pinky: 8mm",
    "S": "Thumb: 15mm, Index: 12mm, Middle: 13mm, Ring: 11mm, Pinky: 8mm",
    "M": "Thumb: 16mm, Index: 12mm, Middle: 13mm, Ring: 11mm, Pinky: 9mm",
    "L": "Thumb: 17mm, Index: 13mm, Middle: 14mm, Ring: 12mm, Pinky: 10mm",
    "Custom": "Tailored sizing — enter exact measurements below or share on WhatsApp",
  };

  const sizeChips = modal.querySelectorAll(".size-chip");

  function getCustomMeasurements() {
    if (activeSize !== "Custom") return null;
    const thumb = parseFloat(document.getElementById("modal-measure-thumb")?.value);
    const index = parseFloat(document.getElementById("modal-measure-index")?.value);
    const middle = parseFloat(document.getElementById("modal-measure-middle")?.value);
    const ring = parseFloat(document.getElementById("modal-measure-ring")?.value);
    const pinky = parseFloat(document.getElementById("modal-measure-pinky")?.value);
    const custom = {};
    if (!isNaN(thumb)) custom.thumb = thumb;
    if (!isNaN(index)) custom.index = index;
    if (!isNaN(middle)) custom.middle = middle;
    if (!isNaN(ring)) custom.ring = ring;
    if (!isNaN(pinky)) custom.pinky = pinky;
    return Object.keys(custom).length ? custom : null;
  }

  function renderSizingGuide() {
    if (!sizingGuideText) return;
    if (activeSize === "Custom") {
      sizingGuideText.innerHTML = `Selected: <strong>Custom Sizing</strong> &bull; Tailored to your natural nail beds. Enter your millimeter measurements below or share photos with measuring tape on WhatsApp before crafting. Divya verifies everything directly!`;
      if (customBox) customBox.style.display = "block";
    } else {
      const detail = SIZING_INFO[activeSize] || "";
      sizingGuideText.innerHTML = `Selected Size: <strong>${activeSize}</strong> &bull; ${detail}.<br><span style="color: var(--accent-strong); font-weight: 600;">✦ Sizing Verification:</span> Divya confirms your exact nail measurements directly on WhatsApp before hand-painting your set!`;
      if (customBox) customBox.style.display = "none";
    }
  }

  function updateOrderAction() {
    if (actionBtn) {
      actionBtn.onclick = () => {
        const sizeDetail = activeSize === "Custom"
          ? `Custom Sizing (${activeShape}, ${activeLength})`
          : `Size ${activeSize} (${activeShape}, ${activeLength})`;
        window.open(CHECKOUT_CONFIG.getCheckoutUrl(title, category, effectivePrice, sku, sizeDetail), "_blank", "noopener,noreferrer");
      };
    }
  }

  sizeChips.forEach((chip) => {
    const isM = chip.getAttribute("data-size") === "M";
    chip.classList.toggle("is-active", isM);
    chip.setAttribute("aria-checked", isM ? "true" : "false");

    chip.onclick = (e) => {
      e.preventDefault();
      activeSize = chip.getAttribute("data-size") || "M";
      sizeChips.forEach((c) => {
        const isSelected = c.getAttribute("data-size") === activeSize;
        c.classList.toggle("is-active", isSelected);
        c.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
      renderSizingGuide();
      updateOrderAction();
    };
  });

  // Add to Bag Button
  if (addBagBtn) {
    addBagBtn.onclick = async () => {
      if (!sku) {
        // Bespoke Lookbook / Portfolio design: order directly via WhatsApp concierge
        const sizeDetail = activeSize === "Custom"
          ? `Custom Sizing (${activeShape}, ${activeLength})`
          : `Size ${activeSize} (${activeShape}, ${activeLength})`;
        const waText = encodeURIComponent(`Hi Divya! I would like to order the bespoke Lookbook design: *${title || "Bespoke Nail Art"}* [${category || "Bespoke Portfolio"}] with ${sizeDetail}. Please let me know the pricing and turnaround time.`);
        window.open(`https://wa.me/${CHECKOUT_CONFIG.whatsappNumber}?text=${waText}`, "_blank", "noopener,noreferrer");
        return;
      }
      if (!window.NailsApi) return;
      const targetSku = sku;
      const custom_measurements = getCustomMeasurements();

      try {
        addBagBtn.disabled = true;
        await window.NailsApi.addToCart({
          sku: targetSku,
          shape: activeShape,
          length: activeLength,
          sizing_preset: activeSize,
          custom_measurements,
          quantity: 1,
        });

        // Track add to cart event
        if (window.NBD_Analytics) {
          window.NBD_Analytics.track("add_to_cart", {
            sku: targetSku,
            title: title || "Press-On Set",
            shape: activeShape,
            length: activeLength,
            size: activeSize,
            hasCustomMeasurements: !!custom_measurements,
            quantity: 1,
          });
        }

        if (feedbackEl) {
          feedbackEl.textContent = `✓ "${title}" added to your bag (${activeShape}, ${activeLength}, Size ${activeSize})`;
          feedbackEl.style.display = "block";
        }
        openCartDrawer();
      } catch (err) {
        let msg = err.message || "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
        if (msg.includes("<") || msg.toLowerCase().startsWith("cannot ")) {
          msg = "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
        }
        alert(msg);
      } finally {
        addBagBtn.disabled = false;
      }
    };
  }

  // Direct Checkout Button
  if (checkoutBtn) {
    checkoutBtn.onclick = async () => {
      if (checkoutBtn.disabled) return;
      if (sku && currentCheckout()) {
        closeAllModals();
        await openCheckoutModal();
        return;
      }
      if (!sku) {
        // Lookbook design: transition directly to at-home salon appointment consultation
        closeAllModals();
        openServiceModal(title, description);
        return;
      }
      if (!window.NailsApi) return;
      const targetSku = sku;
      const custom_measurements = getCustomMeasurements();

      try {
        checkoutBtn.disabled = true;
        await window.NailsApi.addToCart({
          sku: targetSku,
          shape: activeShape,
          length: activeLength,
          sizing_preset: activeSize,
          custom_measurements,
          quantity: 1,
        });
        closeAllModals();
        openCheckoutModal();
      } catch (err) {
        let msg = err.message || "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
        if (msg.includes("<") || msg.toLowerCase().startsWith("cannot ")) {
          msg = "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
        }
        if (err.code === "NETWORK_ERROR" || err.status >= 500) {
          alert("Your bag update could not be confirmed. Check the quantity in your bag before continuing.");
          closeAllModals();
          await openCartDrawer();
        } else {
          alert(msg);
        }
      } finally {
        checkoutBtn.disabled = false;
      }
    };
  }

  renderSizingGuide();
  updateOrderAction();

  window.DivvCurrentProductContext = `${title}${sku ? ` [SKU: ${sku}]` : ""}${effectivePrice ? ` (${effectivePrice})` : ""}`;
  if (typeof window.updateDivvProductBanner === "function") window.updateDivvProductBanner();

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

// ---------------------------------------------------------------------------
// 08B. AT-HOME SERVICE APPOINTMENT MODAL & BOOKING REQUEST
// ---------------------------------------------------------------------------

const CANONICAL_SERVICES_MAP = {
  "nail extensions": { id: "gel_extensions", name: "Nail Extensions", price: "From ₹999", isCustomQuote: false },
  "bespoke gel extensions": { id: "gel_extensions", name: "Nail Extensions", price: "From ₹999", isCustomQuote: false },
  "natural nail overlay": { id: "natural_overlay", name: "Natural Nail Overlay", price: "From ₹999", isCustomQuote: false },
  "natural nail overlay & strengthening": { id: "natural_overlay", name: "Natural Nail Overlay", price: "From ₹999", isCustomQuote: false },
  "power polish / shellac": { id: "power_polish", name: "Power Polish / Shellac", price: "From ₹999", isCustomQuote: false },
  "power polish": { id: "power_polish", name: "Power Polish / Shellac", price: "From ₹999", isCustomQuote: false },
  "signature manicure & power polish": { id: "power_polish", name: "Power Polish / Shellac", price: "From ₹999", isCustomQuote: false },
  "3d & custom nail art": { id: "custom_3d_art", name: "3D & Custom Nail Art", price: "Custom Quotation", isCustomQuote: true },
  "3d, chrome & custom artistry": { id: "custom_3d_art", name: "3D & Custom Nail Art", price: "Custom Quotation", isCustomQuote: true },
  "french nails": { id: "gel_extensions", name: "French Nails (Design Add-On)", price: "Design Add-On", isCustomQuote: true },
  "safe extension removal": { id: "extension_removal", name: "Safe Extension Removal", price: "Price on Enquiry", isCustomQuote: true },
  "extension removal": { id: "extension_removal", name: "Safe Extension Removal", price: "Price on Enquiry", isCustomQuote: true },
  "nail extension removal": { id: "extension_removal", name: "Safe Extension Removal", price: "Price on Enquiry", isCustomQuote: true },
};

let cachedServiceCatalog = null;

async function getLiveServiceCatalog() {
  if (Array.isArray(cachedServiceCatalog) && cachedServiceCatalog.length > 0) {
    return cachedServiceCatalog;
  }
  if (window.NailsApi && typeof window.NailsApi.listServices === "function") {
    try {
      const res = await window.NailsApi.listServices();
      if (res && Array.isArray(res.services)) {
        cachedServiceCatalog = res.services;
        return cachedServiceCatalog;
      }
    } catch (err) {
      console.warn("[Booking] Could not load live service catalog:", err.message);
    }
  }
  return null;
}

function escapeBookingHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Opens the Editorial Service Modal (`#service-modal`) with interactive booking request.
 */
async function openServiceModal(title, description) {
  const modal = document.getElementById("service-modal");
  if (!modal) return;

  const titleEl = document.getElementById("service-modal-title");
  const descEl = document.getElementById("service-modal-desc");
  const priceValEl = document.getElementById("service-price-value");
  const formEl = document.getElementById("service-booking-form");
  const confirmationView = document.getElementById("service-confirmation-view");
  const errorEl = document.getElementById("service-booking-error");
  const dateInput = document.getElementById("service-requested-date");
  const addonsWrapper = document.getElementById("service-addons-wrapper");
  const addonsContainer = document.getElementById("service-addons-container");

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = description;
  if (formEl) { formEl.style.display = "flex"; formEl.reset(); }
  if (confirmationView) confirmationView.style.display = "none";
  if (errorEl) { errorEl.textContent = ""; errorEl.style.display = "none"; }

  // Resolve service mapping
  const normalizedKey = title.toLowerCase().trim();
  const matchedService = CANONICAL_SERVICES_MAP[normalizedKey] || {
    id: "gel_extensions",
    name: title,
    price: "From ₹999",
    isCustomQuote: false,
  };

  if (priceValEl) priceValEl.textContent = matchedService.price;

  // Set min date to tomorrow and max date to +60 days (matching backend validation window)
  if (dateInput) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const maxDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    dateInput.min = tomorrow.toISOString().split("T")[0];
    dateInput.max = maxDate.toISOString().split("T")[0];
    dateInput.value = tomorrow.toISOString().split("T")[0];
  }

  // Clear addons immediately while live database add-ons load
  if (addonsWrapper && addonsContainer) {
    addonsWrapper.style.display = "none";
    addonsContainer.innerHTML = "";
  }

  // Active time slot handling
  let activeSlot = "10:00 AM - 12:00 PM";
  const slotPills = modal.querySelectorAll(".slot-pill");
  slotPills.forEach((pill) => {
    pill.classList.toggle("is-active", pill.getAttribute("data-slot") === "10:00 AM - 12:00 PM");
    pill.onclick = () => {
      slotPills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      activeSlot = pill.getAttribute("data-slot") || "10:00 AM - 12:00 PM";
    };
  });

  // Handle appointment submission
  if (formEl) {
    formEl.onsubmit = async (e) => {
      e.preventDefault();
      if (!window.NailsApi) return;

      const submitBtn = document.getElementById("service-submit-btn");
      const name = document.getElementById("service-customer-name")?.value.trim();
      const rawPhone = document.getElementById("service-customer-phone")?.value.trim();
      const email = document.getElementById("service-customer-email")?.value.trim();
      const line1 = document.getElementById("service-addr-line1")?.value.trim();
      const landmark = document.getElementById("service-addr-landmark")?.value.trim();
      const city = document.getElementById("service-addr-city")?.value.trim() || "Delhi NCR";
      const pin = document.getElementById("service-addr-pin")?.value.trim();
      const reqDate = document.getElementById("service-requested-date")?.value;
      const notes = document.getElementById("service-customer-notes")?.value.trim();

      // Check selected addons (populated directly from live /api/services UUIDs)
      const selectedAddons = [];
      formEl.querySelectorAll('input[name="service_addon"]:checked').forEach((cb) => {
        if (cb.value) selectedAddons.push(cb.value);
      });

      const showBookingError = (msg) => {
        if (errorEl) {
          errorEl.textContent = msg;
          errorEl.style.display = "block";
        }
      };

      if (!name || !rawPhone || !line1 || !pin || !reqDate) {
        showBookingError("Please fill in all required fields (Name, Phone, Address, PIN, Date).");
        return;
      }

      if (name.length < 2) {
        showBookingError("Please enter your full name (at least 2 characters).");
        return;
      }

      const phoneDigits = rawPhone.replace(/\D/g, "");
      const tenDigitPhone = phoneDigits.length === 12 && phoneDigits.startsWith("91")
        ? phoneDigits.slice(2)
        : (phoneDigits.length === 11 && phoneDigits.startsWith("0") ? phoneDigits.slice(1) : phoneDigits);
      if (!/^[6-9]\d{9}$/.test(tenDigitPhone)) {
        showBookingError("Please provide a valid 10-digit Indian mobile number.");
        return;
      }
      const normalizedPhone = `+91${tenDigitPhone}`;

      if (line1.length < 5) {
        showBookingError("Please enter a complete street/flat address (at least 5 characters).");
        return;
      }

      if (!/^[1-9][0-9]{5}$/.test(pin)) {
        showBookingError("Please provide a valid 6-digit Indian PIN code.");
        return;
      }

      const origBtnHtml = submitBtn ? submitBtn.innerHTML : "";
      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = "<span>Submitting Request...</span>";
        }
        if (errorEl) errorEl.style.display = "none";

        const bookingPayload = {
          serviceId: matchedService.id,
          service_id: matchedService.id,
          addonIds: selectedAddons,
          addon_ids: selectedAddons,
          customer: {
            name,
            phone: normalizedPhone,
            email: email || null,
          },
          serviceAddress: {
            address_line1: line1,
            landmark: landmark || null,
            city,
            state: "Delhi",
            postal_code: pin,
          },
          service_address: {
            address_line1: line1,
            landmark: landmark || null,
            city,
            state: "Delhi",
            postal_code: pin,
          },
          requestedDate: reqDate,
          requested_date: reqDate,
          requestedTimeSlot: activeSlot,
          requested_time_slot: activeSlot,
          customerNotes: notes || null,
          customer_notes: notes || null,
        };

        const result = await window.NailsApi.createBooking(bookingPayload);
        const bookingNum = result.booking?.bookingNumber || "NBD-BKG-REQUESTED";

        // Privacy-first booking submission analytics (strictly zero customer PII)
        if (window.NBD_Analytics) {
          window.NBD_Analytics.track("booking_submission", {
            bookingNumber: bookingNum,
            serviceId: matchedService.id,
            serviceTitle: title,
            requestedDate: reqDate,
            requestedTimeSlot: activeSlot,
            addonCount: selectedAddons.length,
          });
        }

        formEl.style.display = "none";
        if (confirmationView) {
          confirmationView.style.display = "flex";
          const bkgNumEl = document.getElementById("service-confirmation-booking-number");
          if (bkgNumEl) bkgNumEl.textContent = bookingNum;

          const waBtn = document.getElementById("service-confirmation-whatsapp-btn");
          if (waBtn) {
            const waText = encodeURIComponent(`Hi Divya! I have submitted appointment request *${bookingNum}* for *${title}* on ${reqDate} (${activeSlot}) in Delhi NCR. Please confirm your availability.`);
            waBtn.href = `https://wa.me/${CHECKOUT_CONFIG.whatsappNumber}?text=${waText}`;
          }

          const closeBtn = document.getElementById("service-confirmation-close-btn");
          if (closeBtn) closeBtn.onclick = closeAllModals;
        }
      } catch (err) {
        let msg = err.message || "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
        if (msg.includes("<") || msg.toLowerCase().startsWith("cannot ")) {
          msg = "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
        }
        showBookingError(msg);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHtml;
        }
      }
    };
  }

  // Open modal immediately without blocking on background API calls
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";

  // Populate live service add-ons from backend catalog so UUIDs always match production DB
  getLiveServiceCatalog().then((services) => {
    if (!services || !addonsWrapper || !addonsContainer) return;
    const liveSvc = services.find((s) => s.id === matchedService.id);
    if (liveSvc && priceValEl && liveSvc.pricingDisplay && !matchedService.isCustomQuote) {
      priceValEl.textContent = liveSvc.pricingDisplay;
    }
    const addons = liveSvc && Array.isArray(liveSvc.addons) ? liveSvc.addons : [];
    if (addons.length > 0) {
      addonsWrapper.style.display = "block";
      addonsContainer.innerHTML = addons
        .map(
          (addon) => `
        <label class="addon-checkbox-card">
          <div class="addon-checkbox-left">
            <input type="checkbox" name="service_addon" value="${escapeBookingHtml(addon.id)}" />
            <span>${escapeBookingHtml(addon.name)}</span>
          </div>
          <span class="addon-checkbox-price">${escapeBookingHtml(addon.priceDisplay || "Custom Quote")}</span>
        </label>
      `
        )
        .join("");
    } else {
      addonsWrapper.style.display = "none";
      addonsContainer.innerHTML = "";
    }
  });

  // Pre-fill customer details only when an authenticated client session is active
  if (window.NailsApi && window.NailsAuth && typeof window.NailsAuth.isAuthenticated === "function" && window.NailsAuth.isAuthenticated()) {
    (async () => {
      try {
        const userRes = await window.NailsApi.getCurrentUser().catch(() => null);
        if (userRes && userRes.user) {
          const u = userRes.user;
          const nameInput = document.getElementById("service-customer-name");
          const phoneInput = document.getElementById("service-customer-phone");
          const emailInput = document.getElementById("service-customer-email");
          if (nameInput && !nameInput.value) {
            const rawName = (u.profile && u.profile.full_name) || "";
            const isSynthetic = !rawName || rawName.trim().toLowerCase() === "customer" || rawName.trim().toLowerCase() === "bespoke client";
            nameInput.value = isSynthetic ? "" : rawName.trim();
          }
          if (phoneInput && !phoneInput.value) phoneInput.value = (u.phone || "").replace(/^\+91/, "");
          if (emailInput && !emailInput.value) emailInput.value = u.email || "";

          const addrRes = await window.NailsApi.getCustomerAddresses().catch(() => null);
          if (addrRes && addrRes.addresses && addrRes.addresses.length) {
            const srvAddr = addrRes.addresses.find((a) => a.isDefaultService || a.is_default_service) || addrRes.addresses[0];
            if (srvAddr) {
              const l1 = document.getElementById("service-addr-line1");
              const lm = document.getElementById("service-addr-landmark");
              const city = document.getElementById("service-addr-city");
              const pin = document.getElementById("service-addr-pin");
              if (l1 && !l1.value) l1.value = srvAddr.addressLine1 || srvAddr.address_line1 || "";
              if (lm && !lm.value) lm.value = srvAddr.landmark || "";
              if (city && !city.value) city.value = srvAddr.city || "Delhi NCR";
              if (pin && !pin.value) pin.value = srvAddr.postalCode || srvAddr.postal_code || "";
            }
          }
        }
      } catch {}
    })();
  }
}

// ---------------------------------------------------------------------------
// 08C. COMMERCE CART DRAWER MANAGEMENT
// ---------------------------------------------------------------------------

const inFlightCartItemIds = new Set();

function lockCartCardControls(cardEl, locked) {
  if (!cardEl) return;
  cardEl.style.opacity = locked ? "0.6" : "";
  cardEl.querySelectorAll("button").forEach((b) => {
    b.disabled = locked;
  });
}

async function openCartDrawer() {
  const overlay = document.getElementById("cart-drawer-overlay");
  if (!overlay) return;

  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";

  const receiptButton = document.getElementById("cart-check-receipt");
  if (receiptButton) receiptButton.style.display = currentCheckout() ? "inline-flex" : "none";
  await refreshCartView();
}

function closeCartDrawer() {
  const overlay = document.getElementById("cart-drawer-overlay");
  if (overlay) {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = "";
}

async function refreshCartBadge() {
  if (!window.NailsApi) return;
  try {
    const res = await window.NailsApi.getCart();
    const count = (res.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0);
    const badges = document.querySelectorAll("#nav-cart-count, #cart-drawer-count, #mobile-cart-count");
    badges.forEach((b) => {
      b.textContent = count;
      b.style.display = count > 0 ? "inline-block" : "none";
    });
  } catch {}
}

async function refreshCartView() {
  if (!window.NailsApi) return;
  const itemsContainer = document.getElementById("cart-drawer-items");
  const footer = document.getElementById("cart-drawer-footer");
  const emptyState = document.getElementById("cart-empty-state");

  try {
    const res = await window.NailsApi.getCart();
    const items = res.items || [];
    const totals = res.totals || {};

    refreshCartBadge();

    if (items.length === 0) {
      if (emptyState) emptyState.style.display = "flex";
      if (footer) footer.style.display = "none";
      if (itemsContainer) itemsContainer.innerHTML = "";
      if (itemsContainer && emptyState) itemsContainer.appendChild(emptyState);
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    if (footer) footer.style.display = "flex";

    // Update totals
    const subtotalEl = document.getElementById("cart-subtotal-val");
    const discountRow = document.getElementById("cart-discount-row");
    const discountVal = document.getElementById("cart-discount-val");
    const totalEl = document.getElementById("cart-total-val");

    if (subtotalEl) subtotalEl.textContent = `₹${totals.subtotal || 0}`;
    if (totals.discountAmount > 0) {
      if (discountRow) discountRow.style.display = "flex";
      if (discountVal) discountVal.textContent = `-₹${totals.discountAmount}`;
    } else {
      if (discountRow) discountRow.style.display = "none";
    }
    if (totalEl) totalEl.textContent = `₹${totals.totalAmount || 0}`;

    // Render items list
    if (itemsContainer) {
      itemsContainer.innerHTML = items.map((it) => {
        const specParts = [it.shape, it.length, `Size ${it.sizingPreset}`];
        if (it.sizingPreset === "Custom" && it.customMeasurements) {
          const m = it.customMeasurements;
          specParts.push(`Custom (${m.thumb || 0}/${m.index || 0}/${m.middle || 0}/${m.ring || 0}/${m.pinky || 0}mm)`);
        }

        return `
          <div class="cart-item-card" data-item-id="${it.id}">
            <img src="${it.heroImageUrl || "assets/branding/icon1submark%20gold.png"}" alt="${escapeHtml(it.productName)}" class="cart-item-img" onerror="this.src='assets/branding/icon1submark%20gold.png'" />
            <div class="cart-item-details">
              <h4 class="cart-item-title">${escapeHtml(it.productName)}</h4>
              <span class="cart-item-spec">${escapeHtml(specParts.join(" • "))}</span>
              <div class="cart-item-price-row">
                <span class="cart-item-price">₹${it.unitPrice}</span>
                ${it.isPromoApplied ? `<span class="cart-item-original">₹${it.basePrice}</span><span class="cart-item-promo-tag">${escapeHtml(it.promoName || "Offer")}</span>` : ""}
              </div>
            </div>
            <div class="cart-item-controls">
              <button type="button" class="cart-remove-btn" data-action="remove-item" data-id="${it.id}" aria-label="Remove item">&times;</button>
              <div class="qty-stepper">
                <button type="button" class="qty-btn" data-action="qty-minus" data-id="${it.id}" data-qty="${it.quantity}">-</button>
                <span class="qty-val">${it.quantity}</span>
                <button type="button" class="qty-btn" data-action="qty-plus" data-id="${it.id}" data-qty="${it.quantity}">+</button>
              </div>
            </div>
          </div>
        `;
      }).join("");

      // Wire controls with rapid-click lock per item ID to prevent duplicate 404 requests
      itemsContainer.querySelectorAll('button[data-action="qty-minus"]').forEach((btn) => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-id");
          if (!id || inFlightCartItemIds.has(id)) return;
          inFlightCartItemIds.add(id);
          lockCartCardControls(btn.closest(".cart-item-card"), true);
          try {
            const currentQty = parseInt(btn.getAttribute("data-qty"), 10) || 1;
            if (currentQty <= 1) {
              await window.NailsApi.removeCartItem(id);
            } else {
              await window.NailsApi.updateCartItem(id, { quantity: currentQty - 1 });
            }
            await refreshCartView();
          } catch (err) {
            if (err && err.status === 404) {
              await refreshCartView();
            } else {
              console.warn("Could not update cart item quantity:", err && err.message ? err.message : err);
            }
          } finally {
            inFlightCartItemIds.delete(id);
            lockCartCardControls(btn.closest(".cart-item-card"), false);
          }
        };
      });

      itemsContainer.querySelectorAll('button[data-action="qty-plus"]').forEach((btn) => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-id");
          if (!id || inFlightCartItemIds.has(id)) return;
          const currentQty = parseInt(btn.getAttribute("data-qty"), 10) || 1;
          if (currentQty >= 20) return;
          inFlightCartItemIds.add(id);
          lockCartCardControls(btn.closest(".cart-item-card"), true);
          try {
            await window.NailsApi.updateCartItem(id, { quantity: currentQty + 1 });
            await refreshCartView();
          } catch (err) {
            console.warn("Could not increment cart item quantity:", err && err.message ? err.message : err);
          } finally {
            inFlightCartItemIds.delete(id);
            lockCartCardControls(btn.closest(".cart-item-card"), false);
          }
        };
      });

      itemsContainer.querySelectorAll('button[data-action="remove-item"]').forEach((btn) => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-id");
          if (!id || inFlightCartItemIds.has(id)) return;
          inFlightCartItemIds.add(id);
          lockCartCardControls(btn.closest(".cart-item-card"), true);
          try {
            await window.NailsApi.removeCartItem(id);
            await refreshCartView();
          } catch (err) {
            if (err && err.status === 404) {
              await refreshCartView();
            } else {
              console.warn("Could not remove cart item:", err && err.message ? err.message : err);
            }
          } finally {
            inFlightCartItemIds.delete(id);
            lockCartCardControls(btn.closest(".cart-item-card"), false);
          }
        };
      });
    }
  } catch (err) {
    console.warn("Could not refresh cart:", err);
  }
}

// ---------------------------------------------------------------------------
// 08D. CHECKOUT MODAL & ORDER CREATION
// ---------------------------------------------------------------------------

const CHECKOUT_PHONE_MESSAGE = "Enter a valid 10-digit Indian mobile number, with or without +91.";
const CHECKOUT_MOBILE_PATTERN = /^(?:(?:\+91|0091|91|0)[ \u00a0\u202f-]?)?[6-9](?:[ \u00a0\u202f-]?\d){9}$/;

function updateCheckoutPhoneValidity(input) {
  const invalid = Boolean(input.value && !CHECKOUT_MOBILE_PATTERN.test(input.value.trim()));
  input.setCustomValidity(invalid ? CHECKOUT_PHONE_MESSAGE : "");
  input.setAttribute("aria-invalid", String(invalid));
  const error = document.getElementById("checkout-phone-error");
  if (error) error.hidden = !invalid;
  return !invalid;
}

function initCheckoutPhoneValidation() {
  const input = document.getElementById("checkout-phone");
  if (!input) return;
  input.addEventListener("input", () => updateCheckoutPhoneValidity(input));
  input.addEventListener("change", () => updateCheckoutPhoneValidity(input));
}

const CHECKOUT_STORAGE_KEY = "nbd_pending_checkout";
let pendingCheckout;
try { pendingCheckout = JSON.parse(sessionStorage.getItem(CHECKOUT_STORAGE_KEY)); } catch {}
let checkoutSubmitting = null;
let checkoutView = 0;

function currentCheckout() {
  return pendingCheckout && pendingCheckout.buyer === window.NailsApi?.getBuyerId?.() ? pendingCheckout : null;
}

function saveCheckout(attempt) {
  pendingCheckout = attempt;
  try {
    if (attempt) sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(attempt));
    else sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
  } catch {} // The in-memory attempt still covers retries while this tab is open.
}

function showCheckoutReceipt(result) {
  if (!result?.order?.id || !result.order.orderNumber) {
    throw new Error("Confirmation was interrupted. Check your previous checkout in your bag.");
  }
  const order = result.order;
  const number = document.getElementById("checkout-confirmation-order-number");
  if (number) number.textContent = order.orderNumber;
  document.getElementById("checkout-confirmation-status").textContent = order.orderStatus;
  document.getElementById("checkout-confirmation-payment").textContent = order.paymentStatus;
  const wa = document.getElementById("checkout-confirmation-whatsapp-btn");
  if (wa) {
    const text = `Hi Divya! I have placed order *${order.orderNumber}* for ₹${order.totalAmount} with delivery to ${order.shippingAddress?.city || "my address"}. Please verify my nail measurements and share studio UPI payment details.`;
    wa.href = `https://wa.me/${CHECKOUT_CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`;
  }
  document.getElementById("checkout-form-view").style.display = "none";
  document.getElementById("checkout-confirmation-view").style.display = "flex";
  saveCheckout(null);
  refreshCartBadge();
}

async function openCheckoutModal() {
  if (checkoutSubmitting) return;
  closeCartDrawer();
  const modal = document.getElementById("checkout-modal");
  if (!modal) return;

  const formView = document.getElementById("checkout-form-view");
  const confirmationView = document.getElementById("checkout-confirmation-view");
  const errorEl = document.getElementById("checkout-error-feedback");
  const itemsListEl = document.getElementById("checkout-summary-items-list");
  const subtotalEl = document.getElementById("checkout-subtotal-val");
  const discountLine = document.getElementById("checkout-discount-line");
  const discountVal = document.getElementById("checkout-discount-val");
  const totalEl = document.getElementById("checkout-total-val");

  if (formView) formView.style.display = "block";
  if (confirmationView) confirmationView.style.display = "none";
  if (errorEl) { errorEl.textContent = ""; errorEl.style.display = "none"; }

  const api = window.NailsApi;
  const buyer = api.getBuyerId();
  const view = ++checkoutView;
  const isCurrent = () => view === checkoutView && buyer === api.getBuyerId();
  const showModal = () => {
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
  };
  let attempt = currentCheckout();
  if (attempt) {
    try {
      const receipt = await api.createOrder({
        cart_id: attempt.cartId, idempotency_key: attempt.key, retry_only: true,
      }, attempt);
      if (!isCurrent()) return;
      showCheckoutReceipt(receipt);
      showModal();
      return;
    } catch (err) {
      if (!isCurrent()) return;
      if (err.code !== "CHECKOUT_ATTEMPT_NOT_FOUND") {
        if (err.code === "FORBIDDEN_ORDER_ACCESS") saveCheckout(null);
        alert(err.message || "Could not confirm your checkout. Please check again from your bag.");
        await openCartDrawer();
        return;
      }
    }
  }
  let cartData;
  try {
    cartData = await api.getCart();
  } catch (err) {
    if (isCurrent()) alert(err.message || "Could not load your bag. Please try again.");
    return;
  }
  if (!isCurrent()) return;
  if (attempt && attempt.cartId !== cartData.cart.id) {
    saveCheckout(null);
    attempt = null;
  }
  const items = cartData.items || [];
  if (items.length === 0) {
    alert("Your bag is empty. Please add a handcrafted press-on set before checking out.");
    openCartDrawer();
    return;
  }

  const totals = cartData.totals || {};

  // Track checkout initiation analytics
  if (window.NBD_Analytics) {
    window.NBD_Analytics.track("checkout_start", {
      itemCount: items.length,
      subtotalAmount: totals.subtotal || 0,
      totalAmount: totals.totalAmount || 0,
    });
  }

  // Render items snippet
  if (itemsListEl) {
    itemsListEl.innerHTML = items.map((it) => `
      <div class="checkout-summary-item" style="padding: 0.25rem 0;">
        <span>${escapeHtml(it.productName)} (${escapeHtml(it.shape)}, ${escapeHtml(it.length)}, Size ${escapeHtml(it.sizingPreset)}) × ${it.quantity}</span>
        <strong>₹${it.itemTotal}</strong>
      </div>
    `).join("");
  }

  if (subtotalEl) subtotalEl.textContent = `₹${totals.subtotal || 0}`;
  if (totals.discountAmount > 0) {
    if (discountLine) discountLine.style.display = "flex";
    if (discountVal) discountVal.textContent = `-₹${totals.discountAmount}`;
  } else {
    if (discountLine) discountLine.style.display = "none";
  }
  if (totalEl) totalEl.textContent = `₹${totals.totalAmount || 0}`;

  // Pre-fill customer details from authentication / addresses
  try {
    if (buyer) {
      const context = { buyer, sessionToken: null };
      const userRes = await api.getCurrentUser(context).catch(() => null);
      if (!isCurrent()) return;
      if (userRes && userRes.user) {
        const u = userRes.user;
        const nameInput = document.getElementById("checkout-name");
        const phoneInput = document.getElementById("checkout-phone");
        const emailInput = document.getElementById("checkout-email");
        if (nameInput && !nameInput.value) {
          const rawName = (u.profile && u.profile.full_name) || "";
          const isSynthetic = !rawName || rawName.trim().toLowerCase() === "customer" || rawName.trim().toLowerCase() === "bespoke client";
          nameInput.value = isSynthetic ? "" : rawName.trim();
        }
        if (phoneInput && !phoneInput.value) phoneInput.value = (u.phone || "").replace(/^\+91/, "");
        if (emailInput && !emailInput.value) emailInput.value = u.email || "";

        const addrRes = await api.getCustomerAddresses(context).catch(() => null);
        if (!isCurrent()) return;
        if (addrRes && addrRes.addresses && addrRes.addresses.length) {
          const shipAddr = addrRes.addresses.find((a) => a.isDefaultShipping || a.is_default_shipping) || addrRes.addresses[0];
          if (shipAddr) {
            const l1 = document.getElementById("checkout-addr-line1");
            const l2 = document.getElementById("checkout-addr-line2");
            const city = document.getElementById("checkout-addr-city");
            const state = document.getElementById("checkout-addr-state");
            const pin = document.getElementById("checkout-addr-pin");
            if (l1 && !l1.value) l1.value = shipAddr.addressLine1 || shipAddr.address_line1 || "";
            if (l2 && !l2.value) l2.value = shipAddr.addressLine2 || shipAddr.address_line2 || shipAddr.landmark || "";
            if (city && !city.value) city.value = shipAddr.city || "";
            if (state && !state.value) state.value = shipAddr.state || "";
            if (pin && !pin.value) pin.value = shipAddr.postalCode || shipAddr.postal_code || "";
          }
        }
      }
    }
  } catch {}

  if (!isCurrent()) return;
  let confirmed = false;
  // Handle order submission
  const checkoutForm = document.getElementById("checkout-order-form");
  if (checkoutForm) {
    const phoneInput = document.getElementById("checkout-phone");
    updateCheckoutPhoneValidity(phoneInput);
    checkoutForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!isCurrent() || confirmed || checkoutSubmitting) return;
      const placeBtn = document.getElementById("checkout-place-order-btn");
      const name = document.getElementById("checkout-name")?.value.trim();
      const phone = phoneInput.value.trim();
      const email = document.getElementById("checkout-email")?.value.trim();
      const line1 = document.getElementById("checkout-addr-line1")?.value.trim();
      const line2 = document.getElementById("checkout-addr-line2")?.value.trim();
      const city = document.getElementById("checkout-addr-city")?.value.trim();
      const state = document.getElementById("checkout-addr-state")?.value.trim();
      const pin = document.getElementById("checkout-addr-pin")?.value.trim();
      const notes = document.getElementById("checkout-notes")?.value.trim();

      if (!name || !phone || !line1 || !city || !state || !pin) {
        if (errorEl) {
          errorEl.textContent = "Please fill in all required customer and delivery address fields.";
          errorEl.style.display = "block";
        }
        return;
      }

      if (!updateCheckoutPhoneValidity(phoneInput)) {
        phoneInput.reportValidity();
        return;
      }

      if (!/^[1-9][0-9]{5}$/.test(pin)) {
        if (errorEl) {
          errorEl.textContent = "Please enter a valid 6-digit Indian PIN code.";
          errorEl.style.display = "block";
        }
        return;
      }

      const submission = Symbol();
      checkoutSubmitting = submission;
      try {
        if (placeBtn) placeBtn.disabled = true;
        if (errorEl) errorEl.style.display = "none";

        if (!attempt) {
          attempt = {
            key: crypto.randomUUID(), cartId: cartData.cart.id, buyer,
            sessionToken: buyer ? null : cartData.cart.sessionToken,
          };
          saveCheckout(attempt);
        }
        const orderPayload = {
          cart_id: attempt.cartId,
          idempotency_key: attempt.key,
          customer: {
            name,
            phone,
            email: email || null,
          },
          shipping_address: {
            recipient_name: name,
            phone,
            address_line1: line1,
            address_line2: line2 || null,
            city,
            state,
            postal_code: pin,
          },
          customer_notes: notes || null,
        };

        const result = await api.createOrder(orderPayload, attempt);
        if (!isCurrent()) return;
        showCheckoutReceipt(result);
        confirmed = true;
        if (window.NBD_Analytics && !result.isDuplicate) {
          window.NBD_Analytics.track("order_submission", {
            orderNumber: result.order.orderNumber,
            totalAmount: result.order.totalAmount,
            itemCount: result.items?.length || items.length,
            hasDiscount: (totals.discountAmount || 0) > 0,
          });
        }
      } catch (err) {
        if (!isCurrent()) return;
        if (errorEl) {
          let msg = err.message || "Failed to place order. Please try again.";
          if (msg.includes("<") || msg.toLowerCase().startsWith("cannot ")) {
            msg = "We're having trouble connecting. Please try again or contact Divya on WhatsApp.";
          }
          errorEl.textContent = msg;
          errorEl.style.display = "block";
        }
      } finally {
        if (checkoutSubmitting === submission) {
          checkoutSubmitting = null;
          if (placeBtn) placeBtn.disabled = false;
        }
      }
    };
  }

  showModal();
}

function closeAllModals() {
  checkoutView++;
  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  });
  closeCartDrawer();
  document.body.style.overflow = "";
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

// ---------------------------------------------------------------------------
// 09. VIEWPORT REVEAL ANIMATIONS (`IntersectionObserver`)
// ---------------------------------------------------------------------------
function initScrollAnimations() {
  const elements = document.querySelectorAll(".fade-up");
  if (!elements.length) return;

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    elements.forEach((el) => observer.observe(el));
  } else {
    elements.forEach((el) => el.classList.add("is-visible"));
  }
}

// ---------------------------------------------------------------------------
// 10. WHY CHOOSE OUR SERVICE - FAQ ACCORDION (`#trust-faq-card`)
// ---------------------------------------------------------------------------
function initTrustFaq() {
  const faqCard = document.getElementById("trust-faq-card");
  const faqTrigger = document.getElementById("trust-faq-trigger");
  const faqAccordion = document.getElementById("trust-faq-accordion");
  if (!faqCard || !faqTrigger || !faqAccordion) return;

  const indicatorText = faqTrigger.querySelector(".indicator-text");
  let isExpanded = false;
  let expandTimeout = null;

  const updateCardMaxHeight = () => {
    if (!isExpanded) return;
    if (faqAccordion.style.maxHeight === "none") return;
    faqAccordion.style.maxHeight = faqAccordion.scrollHeight + "px";
  };

  const toggleCard = (open) => {
    const targetState = open !== undefined ? open : !isExpanded;
    if (targetState === isExpanded) return;

    isExpanded = targetState;
    faqTrigger.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    faqAccordion.setAttribute("aria-hidden", isExpanded ? "false" : "true");
    faqCard.classList.toggle("is-expanded", isExpanded);

    if (indicatorText) {
      indicatorText.textContent = isExpanded ? "Close Questions" : "Explore Questions";
    }

    if (expandTimeout) clearTimeout(expandTimeout);

    if (isExpanded) {
      faqAccordion.style.maxHeight = faqAccordion.scrollHeight + "px";
      expandTimeout = setTimeout(() => {
        if (isExpanded) {
          faqAccordion.style.maxHeight = "none";
        }
      }, 580);
    } else {
      if (faqAccordion.style.maxHeight === "none") {
        faqAccordion.style.maxHeight = faqAccordion.scrollHeight + "px";
        // Force reflow before collapsing
        faqAccordion.offsetHeight;
      }
      requestAnimationFrame(() => {
        faqAccordion.style.maxHeight = "0px";
      });
    }
  };

  faqTrigger.addEventListener("click", () => {
    toggleCard();
  });

  faqTrigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCard();
    }
  });

  // Exclusive Accordion Logic for Inner Questions
  const faqItems = faqCard.querySelectorAll(".faq-item");
  faqItems.forEach((item) => {
    const btn = item.querySelector(".faq-item-button");
    const answer = item.querySelector(".faq-item-answer");
    if (!btn || !answer) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isActive = item.classList.contains("is-active");

      // Close all other currently active questions (exclusive accordion)
      faqItems.forEach((otherItem) => {
        if (otherItem !== item && otherItem.classList.contains("is-active")) {
          const otherBtn = otherItem.querySelector(".faq-item-button");
          const otherAnswer = otherItem.querySelector(".faq-item-answer");
          otherItem.classList.remove("is-active");
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
          if (otherAnswer) {
            otherAnswer.style.maxHeight = otherAnswer.scrollHeight + "px";
            otherAnswer.offsetHeight; // reflow
            requestAnimationFrame(() => {
              otherAnswer.style.maxHeight = "0px";
            });
          }
        }
      });

      // Toggle current question
      if (isActive) {
        item.classList.remove("is-active");
        btn.setAttribute("aria-expanded", "false");
        answer.style.maxHeight = answer.scrollHeight + "px";
        answer.offsetHeight; // reflow
        requestAnimationFrame(() => {
          answer.style.maxHeight = "0px";
          if (faqAccordion.style.maxHeight !== "none") updateCardMaxHeight();
        });
      } else {
        item.classList.add("is-active");
        btn.setAttribute("aria-expanded", "true");
        answer.style.maxHeight = answer.scrollHeight + "px";
        if (faqAccordion.style.maxHeight !== "none") {
          setTimeout(updateCardMaxHeight, 20);
        }
      }
    });
  });

  window.addEventListener("resize", () => {
    if (isExpanded && faqAccordion.style.maxHeight !== "none") {
      updateCardMaxHeight();
    }
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// 10B. THE MOMENT EDIT — CLIENT STORY CAROUSEL (`#moment-carousel`)
// ---------------------------------------------------------------------------
// Native scroll-snap does the swiping; this only wires the minimal controls and
// keeps them in sync. Slides are authored in index.html — add one <article
// class="moment-slide"> and everything below adapts on its own.
function initMomentCarousel() {
  const carousel = document.getElementById("moment-carousel");
  const track = document.getElementById("moment-track");
  const dotsWrap = document.getElementById("moment-dots");
  if (!carousel || !track) return;

  const slides = Array.from(track.querySelectorAll(".moment-slide"));
  if (slides.length < 2) return; // a single story needs no controls or peek

  carousel.classList.add("is-multi");

  const prevBtn = carousel.querySelector(".moment-prev");
  const nextBtn = carousel.querySelector(".moment-next");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stepSize = () => slides[1].offsetLeft - slides[0].offsetLeft || track.clientWidth;
  const currentIndex = () =>
    Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / stepSize())));

  const goTo = (index) => {
    const target = Math.max(0, Math.min(slides.length - 1, index));
    track.scrollTo({
      left: slides[target].offsetLeft - slides[0].offsetLeft,
      behavior: reduceMotion ? "auto" : "smooth"
    });
  };

  const dots = slides.map((slide, i) => {
    const title = slide.querySelector("h3");
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "moment-dot";
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", title ? title.textContent.trim() : "Story " + (i + 1));
    dot.addEventListener("click", () => goTo(i));
    if (dotsWrap) dotsWrap.appendChild(dot);
    return dot;
  });

  const sync = () => {
    const i = currentIndex();
    dots.forEach((dot, n) => {
      dot.classList.toggle("is-active", n === i);
      dot.setAttribute("aria-selected", n === i ? "true" : "false");
    });
    if (prevBtn) prevBtn.disabled = i === 0;
    if (nextBtn) nextBtn.disabled = i === slides.length - 1;
  };

  let ticking = false;
  track.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      sync();
      ticking = false;
    });
  }, { passive: true });

  window.addEventListener("resize", sync, { passive: true });
  if (prevBtn) prevBtn.addEventListener("click", () => goTo(currentIndex() - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => goTo(currentIndex() + 1));

  sync();
}

// ---------------------------------------------------------------------------
// 11. DIVV — THE OFFICIAL AI NAIL STYLIST (FLAGSHIP LUXURY WIDGET)
// ---------------------------------------------------------------------------
function initDivvStylist() {
  const triggerBtn = document.getElementById("divv-floating-trigger");
  const navBtn = document.getElementById("nav-divv-btn");
  const modal = document.getElementById("divv-widget-modal");
  const overlay = document.getElementById("divv-widget-overlay");
  const closeBtn = document.getElementById("divv-close-btn");
  const resetBtn = document.getElementById("divv-reset-btn");
  const bodyEl = document.getElementById("divv-widget-body");
  const formEl = document.getElementById("divv-input-form");
  const inputEl = document.getElementById("divv-input-field");
  const unreadBadge = document.getElementById("divv-unread-badge");
  const bannerEl = document.getElementById("divv-product-banner");
  const bannerText = document.getElementById("divv-banner-text");
  const bannerClear = document.getElementById("divv-banner-clear");

  if (!triggerBtn || !modal || !bodyEl || !formEl) return;

  let isOpen = false;
  let isTyping = false;
  let unreadCount = 0;
  let sessionHistory = [];

  // Load session from storage if present
  try {
    const saved = sessionStorage.getItem("DIVV_SESSION_HISTORY");
    if (saved) sessionHistory = JSON.parse(saved);
  } catch (e) {
    console.warn("Could not load Divv session history:", e);
  }

  const saveSession = () => {
    try {
      sessionStorage.setItem("DIVV_SESSION_HISTORY", JSON.stringify(sessionHistory));
    } catch (e) {}
  };

  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDivvMarkdown = (text) => {
    if (!text) return "";

    // 1. Strict HTML Entity Escaping (Prevents XSS / script injection)
    let safe = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    // 2. Inline Code: `code`
    safe = safe.replace(/`([^`\n]+)`/g, "<code>$1</code>");

    // 3. Bold: **text** or __text__
    safe = safe.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/__([^_]+?)__/g, "<strong>$1</strong>");

    // 4. Italic: *text* or _text_ (excluding previously processed <strong> tags)
    safe = safe.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
    safe = safe.replace(/(^|[^_])_([^_ \n]+?)_(?!_)/g, "$1<em>$2</em>");

    // 5. Line-by-line formatting for lists and breaks
    const lines = safe.split("\n");
    const formattedLines = lines.map((line) => {
      const trimmed = line.trim();
      // Bullet list: * item or - item or • item
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        return `• ${bulletMatch[1]}`;
      }
      // Numbered list: 1. item
      const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (numMatch) {
        return `${numMatch[1]}. ${numMatch[2]}`;
      }
      return line;
    });

    // 6. Paragraphs and line breaks
    return formattedLines
      .join("\n")
      .replace(/\n\n+/g, "<br><br>")
      .replace(/\n/g, "<br>");
  };

  const updateProductBanner = () => {
    if (window.DivvCurrentProductContext && bannerEl && bannerText) {
      bannerText.textContent = `Current Context: ${window.DivvCurrentProductContext}`;
      bannerEl.style.display = "flex";
    } else if (bannerEl) {
      bannerEl.style.display = "none";
    }
  };
  window.updateDivvProductBanner = updateProductBanner;

  if (bannerClear) {
    bannerClear.addEventListener("click", () => {
      window.DivvCurrentProductContext = null;
      updateProductBanner();
    });
  }

  const openDivv = () => {
    isOpen = true;
    modal.classList.add("is-open");
    overlay.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-hidden", "false");

    // Close other modals if active
    if (typeof closeAllModals === "function") {
      document.querySelectorAll(".modal-overlay").forEach((m) => {
        m.classList.remove("is-open");
        m.setAttribute("aria-hidden", "true");
      });
      document.body.style.overflow = "hidden";
    }

    unreadCount = 0;
    if (unreadBadge) unreadBadge.style.display = "none";

    updateProductBanner();

    if (sessionHistory.length === 0) {
      renderWelcomeScreen();
    } else {
      renderMessages();
    }

    setTimeout(() => {
      if (inputEl) inputEl.focus();
    }, 320);
  };

  const closeDivv = () => {
    isOpen = false;
    modal.classList.remove("is-open");
    overlay.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  triggerBtn.addEventListener("click", openDivv);
  if (navBtn) {
    navBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openDivv();
    });
  }
  if (closeBtn) closeBtn.addEventListener("click", closeDivv);
  if (overlay) overlay.addEventListener("click", closeDivv);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) closeDivv();
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      sessionHistory = [];
      sessionStorage.removeItem("DIVV_SESSION_HISTORY");
      window.DivvCurrentProductContext = null;
      updateProductBanner();
      renderWelcomeScreen();
    });
  }

  const renderWelcomeScreen = () => {
    bodyEl.innerHTML = `
      <div class="divv-welcome-screen">
        <span class="divv-welcome-badge">✦ Studio AI Consultation</span>
        <h4 class="divv-welcome-title">Welcome to Nails by Divya</h4>
        <p class="divv-welcome-text">Hi! I'm Divv — Your Nail Stylist. I'm here to help you discover the perfect press-on set, explain customisations, or guide you through our at-home services.</p>
        <div class="divv-chips-grid">
          <button type="button" class="divv-chip" data-chip="How do I choose my perfect press-on nails?">Find My Perfect Nails</button>
          <button type="button" class="divv-chip" data-chip="What press-on nail sets do you offer?">Browse Press-On Nails</button>
          <button type="button" class="divv-chip" data-chip="Can I customize lengths, shapes, or chrome art?">Custom Designs</button>
          <button type="button" class="divv-chip" data-chip="How does delivery and the 10-minute prep kit work?">Delivery &amp; Application</button>
          <button type="button" class="divv-chip" data-chip="How do at-home nail appointments work across Delhi NCR?">Book At-Home Appointment</button>
        </div>
      </div>
    `;
    bodyEl.querySelectorAll(".divv-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const text = chip.getAttribute("data-chip");
        if (text) sendUserMessage(text);
      });
    });
  };

  const renderMessages = () => {
    bodyEl.innerHTML = sessionHistory.map((turn) => {
      const isUser = turn.role === "user";
      const formattedContent = formatDivvMarkdown(turn.content);
      const handoffKeywordRegex = /(chat directly with divya|please chat directly|chat with the artist|personal guidance|divya will personally assist)/i;
      const showHandoff = !isUser && (turn.hasHandoff || handoffKeywordRegex.test(turn.content));

      let handoffMarkup = "";
      if (showHandoff) {
        handoffMarkup = `
          <a href="https://wa.me/${CHECKOUT_CONFIG.whatsappNumber}?text=Hi%20Divya!%20I%20was%20chatting%20with%20Divv%20and%20I'd%20love%20some%20help%20with%20my%20nails." target="_blank" rel="noopener noreferrer" class="divv-handoff-btn">
            <span>Consult Divya on WhatsApp &rarr;</span>
          </a>
        `;
      }

      return `
        <div class="divv-message ${isUser ? "is-user" : "is-ai"}">
          <div class="divv-bubble">
            <div>${formattedContent}</div>
            ${handoffMarkup}
          </div>
          <span class="divv-timestamp">${turn.timestamp || ""}</span>
        </div>
      `;
    }).join("");

    bodyEl.scrollTo({ top: bodyEl.scrollHeight, behavior: "smooth" });
  };

  const showTyping = () => {
    if (document.getElementById("divv-typing-indicator")) return;
    const typingDiv = document.createElement("div");
    typingDiv.id = "divv-typing-indicator";
    typingDiv.className = "divv-typing";
    typingDiv.innerHTML = `<span></span><span></span><span></span>`;
    bodyEl.appendChild(typingDiv);
    bodyEl.scrollTo({ top: bodyEl.scrollHeight, behavior: "smooth" });
  };

  const hideTyping = () => {
    const el = document.getElementById("divv-typing-indicator");
    if (el) el.remove();
  };

  const sendUserMessage = async (text) => {
    if (!text || isTyping) return;

    if (sessionHistory.length === 0) {
      bodyEl.innerHTML = "";
    }

    const userTurn = { role: "user", content: text, timestamp: getTimestamp() };
    sessionHistory.push(userTurn);
    saveSession();
    renderMessages();

    if (inputEl) inputEl.value = "";
    isTyping = true;
    showTyping();

    try {
      const apiUrl = `${window.NailsApi.getBaseUrl()}/chat`;
      const payload = {
        message: text,
        productContext: window.DivvCurrentProductContext || null,
        history: sessionHistory.slice(0, -1)
      };

      // 45-second timeout — generous enough for cold-start Render + Gemini response latency
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`[Divv API HTTP ${res.status}] Service temporarily unavailable.`);
      }

      const data = await res.json();
      hideTyping();
      isTyping = false;

      const replyText = data.reply || "I couldn't find that exact detail. I'd love to help with that—since this needs personal guidance, please chat directly with Divya.";
      const aiTurn = { role: "assistant", content: replyText, timestamp: getTimestamp() };
      sessionHistory.push(aiTurn);
      saveSession();
      renderMessages();

      if (!isOpen) {
        unreadCount++;
        if (unreadBadge) {
          unreadBadge.textContent = unreadCount;
          unreadBadge.style.display = "inline-block";
        }
      }
    } catch (err) {
      console.error("Divv API error:", err);
      hideTyping();
      isTyping = false;
      const errorTurn = {
        role: "assistant",
        content: "I'm having trouble connecting right now. Please click the button below to chat directly with Divya via WhatsApp!",
        timestamp: getTimestamp(),
        hasHandoff: true
      };
      sessionHistory.push(errorTurn);
      saveSession();
      renderMessages();
    }
  };

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = inputEl ? inputEl.value.trim() : "";
    if (text) sendUserMessage(text);
  });
}

// ---------------------------------------------------------------------------
// 12. GENUINE REVIEWS & COMMUNITY FEEDBACK CONTROLLER (PHASE 5.1B)
// ---------------------------------------------------------------------------
function initReviewsEngine() {
  const reviewsContainer = document.getElementById("reviews-container");
  const openModalBtn = document.getElementById("btn-open-review-modal");
  const modal = document.getElementById("review-modal");
  const closeBtn = document.getElementById("review-modal-close");
  const form = document.getElementById("client-review-form");
  const formView = document.getElementById("review-form-view");
  const successView = document.getElementById("review-success-view");
  const submitBtn = document.getElementById("btn-submit-review");
  const statusEl = document.getElementById("rev-submit-status");
  const starBtns = document.querySelectorAll("#rev-star-rating-selector .star-btn");
  const ratingInput = document.getElementById("rev-selected-rating");
  const closeSuccessBtn = document.getElementById("btn-close-review-success");

  // Star selector interaction
  starBtns.forEach((star) => {
    star.addEventListener("click", () => {
      const val = parseInt(star.getAttribute("data-rating"), 10) || 5;
      if (ratingInput) ratingInput.value = val;
      starBtns.forEach((s) => {
        const sVal = parseInt(s.getAttribute("data-rating"), 10) || 1;
        s.style.opacity = sVal <= val ? "1" : "0.3";
      });
    });
  });

  // Modal open / close
  const openModal = () => {
    if (modal) {
      modal.setAttribute("aria-hidden", "false");
      modal.classList.add("is-visible");
      document.body.style.overflow = "hidden";
      if (formView) formView.style.display = "block";
      if (successView) successView.style.display = "none";
      if (statusEl) statusEl.style.display = "none";
    }
  };

  const closeModal = () => {
    if (modal) {
      modal.setAttribute("aria-hidden", "true");
      modal.classList.remove("is-visible");
      document.body.style.overflow = "";
    }
  };

  if (openModalBtn) {
    openModalBtn.addEventListener("click", (e) => {
      // Direct review link opens Divya's verified Google Business Profile review experience
      const googleReviewUrl = "https://search.google.com/local/writereview?placeid=ChIJk6z6ECgBDTkRZBHT8jwkMRU";
      if (!openModalBtn.getAttribute("href")) {
        e.preventDefault();
        window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
      }
    });
  }
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (closeSuccessBtn) closeSuccessBtn.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Submit genuine review
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const name = document.getElementById("rev-customer-name")?.value.trim();
      const phone = document.getElementById("rev-customer-phone")?.value.trim();
      const tag = document.getElementById("rev-service-tag")?.value;
      const rating = parseInt(ratingInput?.value, 10) || 5;
      const text = document.getElementById("rev-review-text")?.value.trim();

      const orderIdVal = document.getElementById("rev-order-id")?.value.trim();

      if (!name || name.length < 2) {
        showStatus("Please enter your name (minimum 2 characters).", true);
        return;
      }
      if (!text || text.length < 10) {
        showStatus("Please enter your feedback (minimum 10 characters).", true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = "<span>Submitting...</span>";

      try {
        const baseUrl = window.NailsApi.getBaseUrl();
        const payload = {
          customer_name: name,
          customer_phone: phone || undefined,
          service_or_product_tag: tag,
          rating,
          review_text: text,
        };
        if (orderIdVal) {
          payload.order_id = orderIdVal;
        }

        const res = await fetch(`${baseUrl}/api/reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to submit review.");
        }

        if (formView) formView.style.display = "none";
        if (successView) successView.style.display = "block";
        if (form) form.reset();
      } catch (err) {
        showStatus(err.message || "Failed to submit review. Please try again.", true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "<span>Submit Feedback for Verification &rarr;</span>";
      }
    });
  }

  function showStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.style.display = "block";
    statusEl.style.background = isError ? "rgba(220, 53, 69, 0.1)" : "rgba(40, 167, 69, 0.1)";
    statusEl.style.color = isError ? "#c82333" : "#218838";
    statusEl.style.border = isError ? "1px solid rgba(220, 53, 69, 0.3)" : "1px solid rgba(40, 167, 69, 0.3)";
    statusEl.textContent = msg;
  }

  // Load genuine approved reviews from API
  async function loadApprovedReviews() {
    if (!reviewsContainer) return;
    try {
      const baseUrl = window.NailsApi.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/reviews?limit=6`);
      if (!res.ok) return;
      const data = await res.json();
      const reviews = data.reviews || [];

      if (reviews.length === 0) {
        reviewsContainer.innerHTML = `
          <div class="review-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1.5rem; background: rgba(250, 247, 242, 0.6); border: 1px dashed rgba(212, 175, 55, 0.4); border-radius: 12px; max-width: 680px; margin: 0 auto;">
            <p style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.35rem; color: #2C2623; margin: 0 0 0.5rem 0;">Curated Client Voices</p>
            <p style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.6; margin: 0;">Our verified client reviews are published exclusively from genuine appointments and press-on deliveries. We never fabricate ratings or publish unverified testimonials.</p>
          </div>
        `;
        return;
      }

      reviewsContainer.innerHTML = reviews.map((r) => {
        const stars = "★".repeat(Math.min(Math.max(r.rating || 5, 1), 5));
        const author = r.customer_name ? r.customer_name.replace(/(\w+)\s+(.)\w*/, "$1 $2.") : "Client";
        const metaTag = r.service_or_product_tag || "Studio Service";
        const cleanText = (r.review_text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const verifiedTag = r.is_verified_purchase
          ? '<span style="display:inline-block; margin-left: 6px; font-size: 0.72rem; color: #D4AF37; font-weight: 600; letter-spacing: 0.04em;">✓ Verified Purchase</span>'
          : "";

        return `
          <div class="review-card">
            <div class="review-stars">${stars}</div>
            <p class="review-quote">&ldquo;${cleanText}&rdquo;</p>
            <div class="review-author">
              <span class="author-client">${author}${verifiedTag}</span>
              <span class="author-location">${metaTag}</span>
            </div>
          </div>
        `;
      }).join("");
    } catch (err) {
      console.warn("Could not fetch reviews:", err.message);
    }
  }

  loadApprovedReviews();
}

// ---------------------------------------------------------------------------
// 13. DYNAMIC LOOKBOOK & PORTFOLIO ENGINE (PHASE 5.1B.1)
// ---------------------------------------------------------------------------
function initLookbookEngine() {
  const grid = document.getElementById("lookbook-grid");
  const galleryTabs = document.querySelectorAll(".gallery-filter-tabs .filter-tab");
  if (!grid) return;

  function bindCardFilters() {
    const cards = grid.querySelectorAll(".lookbook-card, .portfolio-card");
    galleryTabs.forEach((tab) => {
      tab.onclick = () => {
        galleryTabs.forEach((t) => {
          t.classList.remove("is-active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");

        const filter = (tab.getAttribute("data-filter") || "all").toLowerCase().trim();

        cards.forEach((card) => {
          const cat = (card.getAttribute("data-category") || "").toLowerCase().trim();
          const match =
            filter === "all" ||
            cat === filter ||
            (filter === "chrome" && (cat === "chrome" || cat === "3d")) ||
            (filter === "nude" && (cat === "nude" || cat === "french")) ||
            (filter === "bridal" && (cat === "bridal" || cat === "wedding")) ||
            (filter === "art" && (cat === "art" || cat === "floral"));

          card.style.display = match ? "block" : "none";
        });

        if (typeof window.__updateLookbookPagination === "function") {
          window.__updateLookbookPagination();
        }
      };
    });

    cards.forEach((card) => {
      const openCardModal = () => {
        const track = card.closest(".luxury-carousel-track");
        if (track && track.dataset.hasDragged === "true") return;

        const img = card.querySelector("img");
        const titleEl = card.querySelector(".lookbook-caption .lookbook-title") || card.querySelector("h4");
        const tagEl = card.querySelector(".lookbook-caption .lookbook-tag") || card.querySelector(".lookbook-category");
        const title = titleEl ? titleEl.textContent.trim() : "Bespoke Nail Artistry";
        const category = tagEl ? `${tagEl.textContent.trim()} • Bespoke Portfolio` : "Bespoke Portfolio";
        const imgSrc = img ? (img.currentSrc || img.src || img.getAttribute("src") || img.getAttribute("data-src") || "") : "";
        const imgAlt = (img && img.alt) || title;
        const description = `This custom hand-painted design (${title}) can be crafted as a reusable luxury press-on set delivered anywhere across India, or sculpted as custom gel extensions during an at-home appointment in Delhi NCR.`;

        if (typeof openProductModal === "function") {
          openProductModal({
            title,
            category,
            imageSrc: imgSrc,
            imageAlt: imgAlt,
            description,
            sku: card.getAttribute("data-product-sku") || null,
          });
        }
      };

      card.onclick = openCardModal;
      card.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openCardModal();
        }
      };
    });
  }

  async function loadPortfolioDesigns() {
    try {
      const baseUrl = window.NailsApi.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/portfolio?limit=60`);
      if (!res.ok) return;
      const data = await res.json();
      const artworks = data.artworks || [];
      if (!Array.isArray(artworks) || artworks.length === 0) return;

      // Preserve verified 60 local client portfolio artworks from index.html if already loaded
      if (grid.querySelectorAll(".lookbook-card").length >= 60) {
        return;
      }

      grid.innerHTML = artworks.map((art) => {
        const cat = art.category_id || "chrome";
        const catName = art.category_name || cat;
        const cleanName = (art.name || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const cleanAlt = (art.alt_text || art.name || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        return `
          <div class="lookbook-card portfolio-card" data-category="${cat}" tabindex="0">
            <img src="${art.image_url}" alt="${cleanAlt}" loading="lazy">
            <div class="lookbook-caption">
              <span class="lookbook-tag">${catName}</span>
              <span class="lookbook-title">${cleanName}</span>
            </div>
          </div>
        `;
      }).join("");

      bindCardFilters();
    } catch (err) {
      console.warn("Could not load dynamic lookbook, using static gallery:", err.message);
    }
  }

  // Bind initial static fallback cards first
  bindCardFilters();
  // Initialize mobile lookbook carousel & auto-sliding engine
  initMobileLookbookCarousel();
  // Fetch live lookbook designs from backend
  loadPortfolioDesigns();
}

/**
 * Mobile Lookbook Carousel & Auto-Sliding Engine
 * - Smooth horizontal swipeable carousel with scroll snap on mobile (<= 768px)
 * - Auto-advances every 3.8s with smooth transition
 * - Pauses immediately on touch/pointer interaction and resumes after delay
 * - Dynamic pagination indicator (e.g. ✦ 1 / 60 • Swipe to explore)
 * - Respects prefers-reduced-motion
 * - Leaves desktop multi-column grid untouched
 */
function initMobileLookbookCarousel() {
  const grid = document.getElementById("lookbook-grid");
  const currentIdxEl = document.getElementById("lookbook-current-idx");
  const totalCountEl = document.getElementById("lookbook-total-count");

  if (!grid) return;

  let autoSlideTimer = null;
  let resumeTimer = null;
  let isInteracting = false;
  const SLIDE_INTERVAL = 3800; // 3.8s intervals
  const RESUME_DELAY = 2800; // 2.8s after touch/drag ends

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function getVisibleCards() {
    return Array.from(grid.querySelectorAll(".lookbook-card")).filter(
      (c) => c.style.display !== "none" && !c.hasAttribute("hidden")
    );
  }

  function updatePagination() {
    const cards = getVisibleCards();
    if (!cards.length) return;

    if (totalCountEl) {
      totalCountEl.textContent = cards.length;
    }

    const gridCenter = grid.scrollLeft + grid.clientWidth / 2;
    let closestIndex = 0;
    let minDistance = Infinity;

    cards.forEach((card, idx) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - gridCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    if (currentIdxEl) {
      currentIdxEl.textContent = closestIndex + 1;
    }
  }

  function advanceSlide() {
    if (!isMobile() || prefersReducedMotion() || isInteracting) return;

    const cards = getVisibleCards();
    if (cards.length <= 1) return;

    const maxScrollLeft = grid.scrollWidth - grid.clientWidth;
    if (grid.scrollLeft >= maxScrollLeft - 15) {
      grid.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      const gridCenter = grid.scrollLeft + grid.clientWidth / 2;
      let currentIndex = 0;
      let minDistance = Infinity;

      cards.forEach((card, idx) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - gridCenter);
        if (distance < minDistance) {
          minDistance = distance;
          currentIndex = idx;
        }
      });

      const nextIndex = (currentIndex + 1) % cards.length;
      const targetCard = cards[nextIndex];
      if (targetCard) {
        const targetScroll = targetCard.offsetLeft - (grid.clientWidth - targetCard.offsetWidth) / 2;
        grid.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
      }
    }
  }

  function startAutoSlide() {
    stopAutoSlide();
    if (!isMobile() || prefersReducedMotion()) return;
    autoSlideTimer = setInterval(advanceSlide, SLIDE_INTERVAL);
  }

  function stopAutoSlide() {
    if (autoSlideTimer) {
      clearInterval(autoSlideTimer);
      autoSlideTimer = null;
    }
  }

  function handleInteractionStart() {
    isInteracting = true;
    stopAutoSlide();
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  }

  function handleInteractionEnd() {
    isInteracting = false;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      startAutoSlide();
    }, RESUME_DELAY);
  }

  grid.addEventListener("touchstart", handleInteractionStart, { passive: true });
  grid.addEventListener("touchend", handleInteractionEnd, { passive: true });
  grid.addEventListener("touchcancel", handleInteractionEnd, { passive: true });
  grid.addEventListener("pointerdown", handleInteractionStart, { passive: true });
  grid.addEventListener("pointerup", handleInteractionEnd, { passive: true });
  grid.addEventListener("pointercancel", handleInteractionEnd, { passive: true });

  grid.addEventListener("mouseenter", handleInteractionStart);
  grid.addEventListener("mouseleave", handleInteractionEnd);

  let ticking = false;
  grid.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updatePagination();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true }
  );

  if (window.matchMedia) {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener("change", () => {
        if (prefersReducedMotion()) {
          stopAutoSlide();
        } else {
          startAutoSlide();
        }
      });
    }
  }

  window.addEventListener("resize", () => {
    if (isMobile()) {
      startAutoSlide();
    } else {
      stopAutoSlide();
    }
    updatePagination();
  });

  window.__updateLookbookPagination = () => {
    grid.scrollTo({ left: 0, behavior: "smooth" });
    updatePagination();
  };

  updatePagination();
  if (isMobile() && !prefersReducedMotion()) {
    startAutoSlide();
  }
}


if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initReviewsEngine();
    initLookbookEngine();
  });
} else {
  initReviewsEngine();
  initLookbookEngine();
}

