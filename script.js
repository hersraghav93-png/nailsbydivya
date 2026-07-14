/**
 * ==========================================================================
 * NAILS BY DIVYA — PRODUCT ARCHITECTURE & INTERACTION ENGINE (FINAL POLISH)
 * Architecture: Bifurcated Products vs. Services | Decoupled Checkout Config
 * ==========================================================================
 */

// ---------------------------------------------------------------------------
// 01. SINGLE SOURCE OF TRUTH — PRODUCT PRICING & SKU REGISTRY
// ---------------------------------------------------------------------------
const PRODUCT_PRICES = {
  // Casual Collection
  "CAS-004": "₹899",
  "CAS-005": "₹799",
  "CAS-007": "₹1199",
  "CAS-008": "₹1199",

  // Party & Evening Collection
  "PAR-003": "₹1299",
  "PAR-004": "₹1299",
  "PAR-008": "₹999",
  "PAR-009": "₹1199",
  "PAR-0010": "₹1299",

  // Wedding & Bridal Collection
  "WED-001": "₹999",
  "WED-002": "₹799",
  "WED-005": "₹999",
  "WED-006": "₹1399",
  "WED-007": "₹1299",
  "WED-008": "₹699",
  "WED-009": "₹1399",

  // Office & Daily Collection
  "WORK-002": "₹1099",
  "WORK-003": "₹799",
  "WORK-004": "₹999",
  "WORK-006": "₹1199",
  "WORK-007": "₹1299"
};

// ---------------------------------------------------------------------------
// 01B. CHECKOUT & COMMERCE CONFIGURATION (FUTURE-PROOF ABSTRACTION)
// ---------------------------------------------------------------------------
const CHECKOUT_CONFIG = {
  activeMethod: "whatsapp", // Options: "whatsapp" | "shopify_redirect"
  whatsappNumber: "917827437985",
  brandName: "Nails by Divya",

  /**
   * Generates a checkout action URL based on current active architecture.
   */
  getCheckoutUrl(productName, category, price = null, sku = null, customNote = "") {
    if (this.activeMethod === "whatsapp") {
      const skuStr = sku ? ` [SKU: ${sku}]` : "";
      const priceStr = price ? ` • Price: *${price}*` : "";
      const text = `Hi Divya! I would like to order the handmade press-on nail set: *${productName}*${skuStr} (${category})${priceStr}. ${customNote}\n\nPlease let me know how to share my nail measurements and confirm delivery across India.`;
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
  initHeaderScroll();
  initMobileNav();
  initHeroShowcase();
  initLuxuryCarousels();
  initShopFilters();
  initModals();
  initScrollAnimations();
});

/**
 * Ensures all product cards and prices stay synchronized to our Single Source of Truth (`PRODUCT_PRICES`).
 */
function initProductPrices() {
  document.querySelectorAll(".carousel-card[data-product-sku], article[data-product-sku]").forEach((card) => {
    const sku = card.getAttribute("data-product-sku");
    if (!sku || !PRODUCT_PRICES[sku]) return;

    const priceText = PRODUCT_PRICES[sku];
    let priceEl = card.querySelector(".product-price");
    if (!priceEl) {
      priceEl = document.createElement("p");
      priceEl.className = "product-price";
      const h4 = card.querySelector("h4");
      if (h4 && h4.nextSibling) {
        h4.parentNode.insertBefore(priceEl, h4.nextSibling);
      } else if (h4) {
        h4.parentNode.appendChild(priceEl);
      }
    }
    priceEl.textContent = priceText;

    const orderBtn = card.querySelector("button[data-action='order']");
    if (orderBtn && !orderBtn.getAttribute("data-product-sku")) {
      orderBtn.setAttribute("data-product-sku", sku);
    }
  });
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
    const isExpanded = open !== undefined ? open : navToggle.getAttribute("aria-expanded") !== "true";
    navToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    navToggle.classList.toggle("is-active", isExpanded);
    navLinks.classList.toggle("is-open", isExpanded);
    backdrop.classList.toggle("is-open", isExpanded);
    document.body.style.overflow = isExpanded ? "hidden" : "";
  };

  navToggle.addEventListener("click", () => toggleMenu());
  backdrop.addEventListener("click", () => toggleMenu(false));

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => toggleMenu(false));
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768 && navLinks.classList.contains("is-open")) {
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

  let currentIndex = 0;

  setInterval(() => {
    slides[currentIndex].classList.remove("is-active");
    currentIndex = (currentIndex + 1) % slides.length;
    slides[currentIndex].classList.add("is-active");
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
        if (isDown && typeof scrollLeftStart !== "undefined") {
          track.scrollLeft += halfWidth;
          scrollLeftStart += halfWidth;
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

    // Mouse drag support
    let isDown = false;
    let startX;
    let scrollLeftStart;
    let hasDragged = false;

    track.addEventListener("mousedown", (e) => {
      isDown = true;
      hasDragged = false;
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
    track.addEventListener("mouseup", () => {
      track.dataset.hasDragged = hasDragged ? "true" : "false";
    });

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
    track.addEventListener("touchstart", () => pauseAutoScroll(8000), { passive: true });
    track.addEventListener("touchend", () => pauseAutoScroll(6000), { passive: true });
    track.addEventListener("touchmove", () => pauseAutoScroll(8000), { passive: true });
    track.addEventListener("wheel", () => pauseAutoScroll(6000), { passive: true });

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
// 06. PRESS-ON COLLECTION CATEGORY FILTERS (`#shop`)
// ---------------------------------------------------------------------------
function initShopFilters() {
  const pills = document.querySelectorAll("[data-shop-filter]");
  const cards = document.querySelectorAll("#shop-carousel-track .carousel-card");
  const track = document.getElementById("shop-carousel-track");

  if (!pills.length || !cards.length) return;

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");

      const filter = pill.getAttribute("data-shop-filter");

      cards.forEach((card) => {
        const category = card.getAttribute("data-category");
        if (filter === "all" || category === filter) {
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

// ---------------------------------------------------------------------------
// 08. BIFURCATED MODAL ARCHITECTURE (STRICT PRODUCT VS SERVICE SEPARATION)
// ---------------------------------------------------------------------------
function initModals() {
  const productModal = document.getElementById("product-modal");
  const serviceModal = document.getElementById("service-modal");
  const productClose = document.getElementById("product-modal-close");
  const serviceClose = document.getElementById("service-modal-close");

  // Close triggers
  if (productClose) productClose.addEventListener("click", closeAllModals);
  if (serviceClose) serviceClose.addEventListener("click", closeAllModals);

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

  // 08A. PRODUCT CARD CLICK HANDLING (`.carousel-card`) -> PRODUCT MODAL ONLY
  document.querySelectorAll(".carousel-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      const track = card.closest(".luxury-carousel-track");
      if (track && track.dataset.hasDragged === "true") return;

      // Check if button was clicked directly (handle directly)
      if (e.target.closest("button[data-action='order']")) return;

      openProductModalFromCard(card);
    });
  });

  // Direct Order CTA Buttons inside Product Cards
  document.querySelectorAll("button[data-action='order']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const title = btn.getAttribute("data-product-title") || "Press-On Set";
      const category = btn.getAttribute("data-product-category") || "Handmade Collection";
      const cardEl = btn.closest(".carousel-card, article");
      const sku = btn.getAttribute("data-product-sku") || (cardEl ? cardEl.getAttribute("data-product-sku") : null);
      const price = sku && PRODUCT_PRICES[sku] ? PRODUCT_PRICES[sku] : null;
      window.open(CHECKOUT_CONFIG.getCheckoutUrl(title, category, price, sku), "_blank", "noopener,noreferrer");
    });
  });

  // 08B. PORTFOLIO CARD CLICK HANDLING (`.portfolio-card`) -> SERVICE CONSULTATION OR PRODUCT MODAL
  document.querySelectorAll(".portfolio-card").forEach((card) => {
    card.addEventListener("click", () => {
      const track = card.closest(".luxury-carousel-track");
      if (track && track.dataset.hasDragged === "true") return;

      const img = card.querySelector("img");
      const caption = card.querySelector(".portfolio-card-caption span:first-child");
      if (!img || !caption) return;

      // Open product modal with this artwork to view details or book exact set
      openProductModal({
        title: caption.textContent.trim(),
        category: "Exhibition Artistry • Handmade Set or At-Home Extension",
        imageSrc: img.src,
        imageAlt: img.alt || caption.textContent.trim(),
        description: `This custom hand-painted design (${caption.textContent.trim()}) can be crafted as a reusable luxury press-on set delivered anywhere across India, or sculpted as custom gel extensions during an at-home appointment in Delhi NCR.`
      });
    });
  });

  // 08C. SERVICE PILLAR CTA BUTTONS (`data-action="service-book"`) -> SERVICE MODAL ONLY
  document.querySelectorAll("button[data-action='service-book']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const title = btn.getAttribute("data-service-title") || "At-Home Appointment";
      openServiceModal(title, "Relax in the privacy and comfort of your home across Delhi NCR while we bring salon-grade equipment, electric drills, LED lamps, and top-tier soft gel collections directly to your doorstep.");
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

  openProductModal({
    title: titleElem.textContent.trim(),
    category: badgeElem ? `${badgeElem.textContent.trim()} • Handmade Press-On` : "Handmade Press-On • Pan-India",
    imageSrc: imgElem.src,
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
  const imgEl = document.getElementById("product-modal-image");
  const descEl = document.getElementById("product-modal-desc");
  const priceEl = document.getElementById("product-modal-price");
  const actionBtn = document.getElementById("product-modal-action-btn");

  if (titleEl) titleEl.textContent = title;
  if (catEl) catEl.textContent = category;
  if (imgEl) {
    imgEl.src = imageSrc;
    imgEl.alt = imageAlt || title;
  }
  if (descEl) descEl.textContent = description;

  const price = sku && PRODUCT_PRICES[sku] ? PRODUCT_PRICES[sku] : null;
  if (priceEl) {
    if (price) {
      priceEl.textContent = price;
      priceEl.style.display = "block";
    } else {
      priceEl.style.display = "none";
    }
  }

  if (actionBtn) {
    actionBtn.onclick = () => {
      window.open(CHECKOUT_CONFIG.getCheckoutUrl(title, category, price, sku), "_blank", "noopener,noreferrer");
    };
  }

  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

/**
 * Opens the Editorial Service Modal (`#service-modal`). Strictly NO product images.
 */
function openServiceModal(title, description) {
  const modal = document.getElementById("service-modal");
  if (!modal) return;

  const titleEl = document.getElementById("service-modal-title");
  const descEl = document.getElementById("service-modal-desc");
  const actionBtn = document.getElementById("service-modal-action-btn");

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = description;

  if (actionBtn) {
    actionBtn.onclick = () => {
      window.open(CHECKOUT_CONFIG.getServiceBookingUrl(title, "Delhi NCR At-Home / Event Service"), "_blank", "noopener,noreferrer");
    };
  }

  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeAllModals() {
  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modal.classList.remove("is-open");
  });
  document.body.style.overflow = "";
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
