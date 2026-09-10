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
    // Flatten every tile's slide list into one continuous gallery.
    const slides = [];
    const triggerStartIndex = new WeakMap();
    lightboxTriggers.forEach(trigger => {
      const urls = (trigger.dataset.slides || "")
        .split("|")
        .map(u => u.trim())
        .filter(Boolean);
      if (!urls.length) return;
      const caption = trigger.dataset.caption || "";
      const baseAlt = trigger.querySelector("img")?.alt || "";
      triggerStartIndex.set(trigger, slides.length);
      urls.forEach((url, i) => {
        slides.push({
          url,
          caption,
          alt: i === 0 ? baseAlt : `${baseAlt} detail ${i + 1}`,
        });
      });
    });

    if (slides.length) {
      const lightbox = document.createElement("div");
      lightbox.className = "lightbox";
      lightbox.setAttribute("role", "dialog");
      lightbox.setAttribute("aria-modal", "true");
      lightbox.setAttribute("aria-label", "Expanded artwork gallery");
      lightbox.innerHTML = `
        <button class="lightbox__close" type="button" aria-label="Close gallery">&times;</button>
        <button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="Previous artwork">‹</button>
        <button class="lightbox__nav lightbox__nav--next" type="button" aria-label="Next artwork">›</button>
        <div class="lightbox__stage"></div>
        <div class="lightbox__caption"></div>
      `;
      document.body.appendChild(lightbox);

      const stage = lightbox.querySelector(".lightbox__stage");
      const captionEl = lightbox.querySelector(".lightbox__caption");
      const prevButton = lightbox.querySelector(".lightbox__nav--prev");
      const nextButton = lightbox.querySelector(".lightbox__nav--next");
      const closeButton = lightbox.querySelector(".lightbox__close");

      // Persistent image cache so the browser keeps decoded bitmaps around
      // for near-instant slide transitions; cleared on close to release RAM.
      const preloadCache = new Map();
      const preload = url => {
        if (!url) return null;
        let img = preloadCache.get(url);
        if (img) return img;
        img = new Image();
        img.decoding = "async";
        img.src = url;
        preloadCache.set(url, img);
        return img;
      };
      const warmNeighbors = idx => {
        const n = slides.length;
        for (let d = -2; d <= 2; d++) {
          preload(slides[((idx + d) % n + n) % n].url);
        }
      };

      const TRANSITION_MS = 780;
      let currentIndex = 0;
      let transitioning = false;
      let prevSlot;
      let currentSlot;
      let nextSlot;

      const idxAt = offset => {
        const n = slides.length;
        return ((currentIndex + offset) % n + n) % n;
      };

      const makeSlot = () => {
        const fig = document.createElement("figure");
        fig.className = "lightbox__slide";
        const img = document.createElement("img");
        img.className = "lightbox__slide-img";
        img.decoding = "async";
        fig.appendChild(img);
        return fig;
      };

      const fillSlot = (slot, index) => {
        const data = slides[index];
        const img = slot.querySelector("img");
        img.src = data.url;
        img.alt = data.alt;
        slot.dataset.index = String(index);
      };

      const updateCaption = () => {
        const cap = slides[currentIndex].caption;
        captionEl.textContent = cap || "";
        captionEl.hidden = !cap;
      };

      const layoutInitial = () => {
        stage.innerHTML = "";
        prevSlot = makeSlot();
        currentSlot = makeSlot();
        nextSlot = makeSlot();
        prevSlot.classList.add("is-prev");
        currentSlot.classList.add("is-current");
        nextSlot.classList.add("is-next");
        fillSlot(prevSlot, idxAt(-1));
        fillSlot(currentSlot, idxAt(0));
        fillSlot(nextSlot, idxAt(1));
        stage.append(prevSlot, currentSlot, nextSlot);
        updateCaption();
      };

      const go = direction => {
        if (transitioning || slides.length < 2 || direction === 0) return;
        transitioning = true;
        currentIndex = idxAt(direction);
        updateCaption();
        warmNeighbors(currentIndex);

        if (direction > 0) {
          const exiting = prevSlot;
          const entering = makeSlot();
          entering.classList.add("is-enter-right");
          fillSlot(entering, idxAt(1));
          stage.appendChild(entering);
          void entering.offsetWidth;
          exiting.classList.replace("is-prev", "is-exit-left");
          currentSlot.classList.replace("is-current", "is-prev");
          nextSlot.classList.replace("is-next", "is-current");
          entering.classList.replace("is-enter-right", "is-next");
          prevSlot = currentSlot;
          currentSlot = nextSlot;
          nextSlot = entering;
          setTimeout(() => {
            exiting.remove();
            transitioning = false;
          }, TRANSITION_MS + 60);
        } else {
          const exiting = nextSlot;
          const entering = makeSlot();
          entering.classList.add("is-enter-left");
          fillSlot(entering, idxAt(-1));
          stage.appendChild(entering);
          void entering.offsetWidth;
          exiting.classList.replace("is-next", "is-exit-right");
          currentSlot.classList.replace("is-current", "is-next");
          prevSlot.classList.replace("is-prev", "is-current");
          entering.classList.replace("is-enter-left", "is-prev");
          nextSlot = currentSlot;
          currentSlot = prevSlot;
          prevSlot = entering;
          setTimeout(() => {
            exiting.remove();
            transitioning = false;
          }, TRANSITION_MS + 60);
        }
      };

      const openLightbox = trigger => {
        const startIndex = triggerStartIndex.get(trigger) ?? 0;
        currentIndex = startIndex;
        warmNeighbors(currentIndex);
        layoutInitial();
        document.body.classList.add("lightbox-open");
        requestAnimationFrame(() => lightbox.classList.add("is-open"));
        closeButton?.focus({ preventScroll: true });
      };

      const closeLightbox = () => {
        lightbox.classList.remove("is-open");
        document.body.classList.remove("lightbox-open");
        transitioning = false;
        setTimeout(() => {
          stage.innerHTML = "";
          preloadCache.clear();
        }, 550);
      };

      prevButton?.addEventListener("click", () => go(-1));
      nextButton?.addEventListener("click", () => go(1));

      stage.addEventListener("click", event => {
        const slot = event.target.closest?.(".lightbox__slide");
        if (!slot) return;
        if (slot.classList.contains("is-prev")) go(-1);
        else if (slot.classList.contains("is-next")) go(1);
      });

      lightboxTriggers.forEach(trigger => {
        trigger.addEventListener("click", () => openLightbox(trigger));
      });

      lightbox.addEventListener("click", event => {
        if (event.target.closest(".lightbox__slide, .lightbox__nav, .lightbox__caption")) {
          return;
        }
        closeLightbox();
      });

      document.addEventListener("keydown", event => {
        if (!lightbox.classList.contains("is-open")) return;
        if (event.key === "Escape") closeLightbox();
        else if (event.key === "ArrowLeft") go(-1);
        else if (event.key === "ArrowRight") go(1);
      });
    }
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
