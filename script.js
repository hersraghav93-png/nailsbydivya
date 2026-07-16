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
  initTrustFaq();
  initDivvStylist();
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

  window.DivvCurrentProductContext = `${title}${sku ? ` [SKU: ${sku}]` : ""}${price ? ` (${price})` : ""}`;
  if (typeof window.updateDivvProductBanner === "function") window.updateDivvProductBanner();

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

  const formatTextWithBreaks = (text) => {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
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
      document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.remove("is-open"));
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
        <span class="divv-welcome-badge">✨ Luxury AI Consultation</span>
        <h4 class="divv-welcome-title">Welcome to Nails by Divya</h4>
        <p class="divv-welcome-text">Hi! I'm Divv 💅🏻 — Your Nail Stylist. I'm here to help you discover the perfect press-on set, explain customisations, or guide you through our at-home services.</p>
        <div class="divv-chips-grid">
          <button type="button" class="divv-chip" data-chip="How do I choose my perfect press-on nails?">💅 Find my perfect nails</button>
          <button type="button" class="divv-chip" data-chip="What press-on nail sets do you offer?">✨ Browse Press-On Nails</button>
          <button type="button" class="divv-chip" data-chip="Can I customize lengths, shapes, or chrome art?">🎨 Custom Designs</button>
          <button type="button" class="divv-chip" data-chip="How does delivery and the 10-minute prep kit work?">📦 Delivery Questions</button>
          <button type="button" class="divv-chip" data-chip="How do at-home nail appointments work across Delhi NCR?">📅 Book an Appointment</button>
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
      const formattedContent = formatTextWithBreaks(turn.content);
      const handoffKeywordRegex = /(chat directly with divya|please chat directly|chat with the artist|personal guidance|divya will personally assist)/i;
      const showHandoff = !isUser && (turn.hasHandoff || handoffKeywordRegex.test(turn.content));

      let handoffMarkup = "";
      if (showHandoff) {
        handoffMarkup = `
          <a href="https://wa.me/917827437985?text=Hi%20Divya!%20I%20was%20chatting%20with%20Divv%20and%20I'd%20love%20some%20help%20with%20my%20nails." target="_blank" rel="noopener noreferrer" class="divv-handoff-btn">
            <span>💬 Chat with the Artist</span>
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
      const apiUrl = window.DIVV_API_URL || "https://nails-ai-backend.onrender.com/chat";
      const payload = {
        message: text,
        productContext: window.DivvCurrentProductContext || null,
        history: sessionHistory.slice(0, -1)
      };

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

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

