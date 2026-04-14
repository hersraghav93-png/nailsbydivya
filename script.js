const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const navAnchors = document.querySelectorAll(".nav-links a");
const animatedItems = document.querySelectorAll(".fade-up");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navAnchors.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.18,
  });

  animatedItems.forEach((item) => observer.observe(item));
} else {
  animatedItems.forEach((item) => item.classList.add("is-visible"));
}

const portfolioSlider = document.querySelector("[data-portfolio-slider]");

if (portfolioSlider) {
  const slides = Array.from(portfolioSlider.querySelectorAll(".portfolio-item"));
  const dots = Array.from(portfolioSlider.querySelectorAll(".portfolio-dot"));
  const autoplayDelay = 3500;
  const swipeThreshold = 45;
  let autoplayTimer = null;
  let isHovered = false;
  let isTouchActive = false;
  let isMouseDragging = false;
  let previousUserSelect = "";
  let touchStartX = 0;
  let touchStartY = 0;
  let touchDeltaX = 0;
  let touchDeltaY = 0;
  let activeIndex = slides.findIndex((slide) => slide.classList.contains("is-active"));

  if (activeIndex < 0) {
    activeIndex = 0;
  }

  const updatePortfolioSlide = (nextIndex) => {
    activeIndex = (nextIndex + slides.length) % slides.length;

    slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
    });

    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-current", isActive ? "true" : "false");
    });
  };

  const stopAutoplay = () => {
    if (autoplayTimer) {
      window.clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  };

  const startAutoplay = () => {
    stopAutoplay();

    if (slides.length < 2 || isHovered || isTouchActive || isMouseDragging) {
      return;
    }

    autoplayTimer = window.setInterval(() => {
      updatePortfolioSlide(activeIndex + 1);
    }, autoplayDelay);
  };

  const handleManualNavigation = (nextIndex) => {
    updatePortfolioSlide(nextIndex);

    if (!isHovered && !isTouchActive) {
      startAutoplay();
    }
  };

  const beginSwipeInteraction = (clientX, clientY, isTouch = false) => {
    portfolioSlider.classList.add("is-pressing");
    stopAutoplay();

    if (isTouch) {
      isTouchActive = true;
    }

    touchStartX = clientX;
    touchStartY = clientY;
    touchDeltaX = 0;
    touchDeltaY = 0;
  };

  const updateSwipeInteraction = (clientX, clientY) => {
    touchDeltaX = clientX - touchStartX;
    touchDeltaY = clientY - touchStartY;
  };

  const endSwipeInteraction = (clientX, clientY, isTouch = false) => {
    portfolioSlider.classList.remove("is-pressing");

    if (typeof clientX === "number" && typeof clientY === "number") {
      updateSwipeInteraction(clientX, clientY);
    }

    if (isTouch) {
      isTouchActive = false;
    }

    if (Math.abs(touchDeltaX) > swipeThreshold && Math.abs(touchDeltaX) > Math.abs(touchDeltaY)) {
      handleManualNavigation(touchDeltaX < 0 ? activeIndex + 1 : activeIndex - 1);
    } else {
      startAutoplay();
    }

    touchDeltaX = 0;
    touchDeltaY = 0;
  };

  const cancelSwipeInteraction = (isTouch = false) => {
    portfolioSlider.classList.remove("is-pressing");

    if (isTouch) {
      isTouchActive = false;
    }

    touchDeltaX = 0;
    touchDeltaY = 0;
    startAutoplay();
  };

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      handleManualNavigation(index);
    });
  });

  portfolioSlider.addEventListener("mouseenter", () => {
    isHovered = true;
    stopAutoplay();
  });

  portfolioSlider.addEventListener("mouseleave", () => {
    isHovered = false;
    if (!isMouseDragging) {
      startAutoplay();
    }
  });

  portfolioSlider.addEventListener("focusin", () => {
    stopAutoplay();
  });

  portfolioSlider.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!portfolioSlider.contains(document.activeElement) && !isHovered && !isTouchActive) {
        startAutoplay();
      }
    }, 0);
  });

  portfolioSlider.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  portfolioSlider.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    beginSwipeInteraction(touch.clientX, touch.clientY, true);
  }, { passive: true });

  portfolioSlider.addEventListener("touchmove", (event) => {
    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    updateSwipeInteraction(touch.clientX, touch.clientY);
  }, { passive: true });

  portfolioSlider.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];

    endSwipeInteraction(touch?.clientX, touch?.clientY, true);
  }, { passive: true });

  portfolioSlider.addEventListener("touchcancel", () => {
    cancelSwipeInteraction(true);
  }, { passive: true });

  portfolioSlider.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    isMouseDragging = true;
    previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    beginSwipeInteraction(event.clientX, event.clientY);
  });

  window.addEventListener("mousemove", (event) => {
    if (!isMouseDragging) {
      return;
    }

    updateSwipeInteraction(event.clientX, event.clientY);

    if (Math.abs(touchDeltaX) > 2) {
      event.preventDefault();
    }
  });

  window.addEventListener("mouseup", (event) => {
    if (!isMouseDragging) {
      return;
    }

    isMouseDragging = false;
    document.body.style.userSelect = previousUserSelect;
    endSwipeInteraction(event.clientX, event.clientY);
  });

  window.addEventListener("blur", () => {
    if (!isMouseDragging) {
      return;
    }

    isMouseDragging = false;
    document.body.style.userSelect = previousUserSelect;
    cancelSwipeInteraction();
  });

  updatePortfolioSlide(activeIndex);
  startAutoplay();
}
