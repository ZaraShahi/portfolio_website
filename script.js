document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("a[href]").forEach(link => {
    link.addEventListener("click", event => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target ||
        link.hasAttribute("download")
      ) {
        return;
      }

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const nextUrl = new URL(href, window.location.href);
      if (nextUrl.protocol === "mailto:" || nextUrl.protocol === "tel:") return;

      const currentUrl = new URL(window.location.href);
      const samePage =
        nextUrl.origin === currentUrl.origin &&
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search;

      if (samePage && nextUrl.hash) return;

      event.preventDefault();
      document.body.classList.add("is-leaving");
      window.setTimeout(() => {
        window.location.href = nextUrl.href;
      }, 280);
    });
  });

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
  );

  document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

  const nav = document.querySelector(".nav");
  const updateNavHeight = () => {
    if (!nav) return;
    document.documentElement.style.setProperty(
      "--nav-height",
      `${nav.offsetHeight}px`
    );
  };
  const toggleNav = () => {
    if (window.scrollY > 30) {
      nav.classList.add("nav--solid");
    } else {
      nav.classList.remove("nav--solid");
    }
  };

  updateNavHeight();
  toggleNav();
  window.addEventListener("scroll", toggleNav, { passive: true });
  window.addEventListener("resize", updateNavHeight);
  window.addEventListener("load", updateNavHeight);

  const hoverVideos = document.querySelectorAll(".card__media--video video");
  hoverVideos.forEach(video => {
    const card = video.closest(".card");
    const loopEnd = parseFloat(video.dataset.loopEnd) || 5;
    let stopTimer = 0;

    if (!card) return;
    const playVideo = () => {
      clearTimeout(stopTimer);
      card.classList.add("is-hovered");
      video.currentTime = 0;
      video.play().catch(() => {});
      stopTimer = window.setTimeout(() => {
        video.pause();
        video.currentTime = 0;
        card.classList.remove("is-hovered");
      }, loopEnd * 1000);
    };
    const stopVideo = () => {
      clearTimeout(stopTimer);
      video.pause();
      video.currentTime = 0;
      card.classList.remove("is-hovered");
    };

    card.addEventListener("mouseenter", playVideo);
    card.addEventListener("mouseleave", stopVideo);
  });

  const lightboxTriggers = document.querySelectorAll(".portfolio-tile--image");
  if (lightboxTriggers.length) {
    const lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Expanded artwork image");
    lightbox.innerHTML = `
      <button class="lightbox__close" type="button" aria-label="Close expanded image">&times;</button>
      <div class="lightbox__content">
        <div class="lightbox__media">
          <button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="Previous image">‹</button>
          <img class="lightbox__image" alt="" />
          <button class="lightbox__nav lightbox__nav--next" type="button" aria-label="Next image">›</button>
        </div>
        <div class="lightbox__caption"></div>
      </div>
    `;
    document.body.appendChild(lightbox);

    const lightboxImage = lightbox.querySelector(".lightbox__image");
    const lightboxCaption = lightbox.querySelector(".lightbox__caption");
    const previousButton = lightbox.querySelector(".lightbox__nav--prev");
    const nextButton = lightbox.querySelector(".lightbox__nav--next");
    const closeButton = lightbox.querySelector(".lightbox__close");
    let slideUrls = [];
    let currentSlideIndex = 0;
    // In-memory cache so already-fetched images stay decoded across slides
    // for the current set; cleared when the lightbox closes to release RAM.
    const preloadCache = new Map();

    const preloadSlide = url => {
      if (!url || preloadCache.has(url)) return preloadCache.get(url);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      preloadCache.set(url, img);
      return img;
    };

    const preloadAllSlides = () => {
      slideUrls.forEach(preloadSlide);
    };

    const waitForImage = url =>
      new Promise(resolve => {
        const img = preloadSlide(url);
        if (img.complete && img.naturalWidth > 0) {
          resolve();
          return;
        }
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });

    const applySlide = () => {
      if (!lightboxImage || !slideUrls.length) return;
      lightboxImage.src = slideUrls[currentSlideIndex];
      lightboxImage.alt =
        currentSlideIndex === 0
          ? lightboxImage.dataset.baseAlt || ""
          : `${lightboxImage.dataset.baseAlt || "Artwork"} detail ${currentSlideIndex + 1}`;
    };

    const updateSlideButtons = () => {
      const hasSlides = slideUrls.length > 1;
      if (previousButton) previousButton.hidden = !hasSlides;
      if (nextButton) nextButton.hidden = !hasSlides;
    };

    const FADE_MS = 220;
    let slideToken = 0;

    const showSlide = async direction => {
      if (slideUrls.length < 2) return;
      const token = ++slideToken;
      currentSlideIndex =
        (currentSlideIndex + direction + slideUrls.length) % slideUrls.length;
      const nextUrl = slideUrls[currentSlideIndex];
      // Start decoding the next image and warm up its neighbors in the
      // background so subsequent clicks are instant.
      const decoded = waitForImage(nextUrl);
      preloadSlide(
        slideUrls[(currentSlideIndex + 1) % slideUrls.length]
      );
      preloadSlide(
        slideUrls[(currentSlideIndex - 1 + slideUrls.length) % slideUrls.length]
      );

      lightboxImage?.classList.add("is-dissolving");
      const fadeOut = new Promise(resolve => setTimeout(resolve, FADE_MS));
      await Promise.all([fadeOut, decoded]);
      if (token !== slideToken) return; // superseded by a newer click
      applySlide();
      // Ensure the new src is committed before we lift the dissolve class.
      requestAnimationFrame(() => {
        if (token !== slideToken) return;
        lightboxImage?.classList.remove("is-dissolving");
      });
    };

    const openLightbox = trigger => {
      const image = trigger.querySelector("img");
      if (!image || !lightboxImage) return;
      slideUrls = (trigger.dataset.slides || image.currentSrc || image.src)
        .split("|")
        .map(slideUrl => slideUrl.trim())
        .filter(Boolean);
      currentSlideIndex = 0;
      slideToken++;
      lightboxImage.dataset.baseAlt = image.alt;
      preloadAllSlides();
      applySlide();
      updateSlideButtons();
      if (lightboxCaption) {
        lightboxCaption.textContent = trigger.dataset.caption || "";
        lightboxCaption.hidden = !trigger.dataset.caption;
      }
      document.body.classList.add("lightbox-open");
      requestAnimationFrame(() => lightbox.classList.add("is-open"));
      closeButton?.focus();
    };

    const closeLightbox = () => {
      lightbox.classList.remove("is-open");
      document.body.classList.remove("lightbox-open");
      slideToken++;
      // Drop cached Image objects so their decoded bitmaps can be GC'd.
      preloadCache.clear();
      if (lightboxImage) {
        lightboxImage.removeAttribute("src");
        lightboxImage.classList.remove("is-dissolving");
      }
    };

    previousButton?.addEventListener("click", () => showSlide(-1));
    nextButton?.addEventListener("click", () => showSlide(1));

    lightboxTriggers.forEach(trigger => {
      trigger.addEventListener("click", () => openLightbox(trigger));
    });

    lightbox.addEventListener("click", event => {
      if (event.target === lightbox || event.target === closeButton) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
        closeLightbox();
      }
      if (event.key === "ArrowLeft" && lightbox.classList.contains("is-open")) {
        showSlide(-1);
      }
      if (event.key === "ArrowRight" && lightbox.classList.contains("is-open")) {
        showSlide(1);
      }
    });
  }

  const contactForm = document.querySelector(".contact-form");
  contactForm?.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(contactForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      message
    ].join("\n");
    const mailtoUrl = new URL("mailto:imzarashahi@gmail.com");
    mailtoUrl.searchParams.set("subject", "Website inquiry");
    mailtoUrl.searchParams.set("body", body);
    window.location.href = mailtoUrl.href;
  });
});
