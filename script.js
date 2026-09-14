document.addEventListener("DOMContentLoaded", () => {
  // GoatCounter: count in-page section navigation (hash changes) as pageviews.
  // count.js loads async and only records the initial path, so hash sections
  // like #artworks/#about/#cv/#contact would otherwise never be captured.
  const countHash = () => {
    if (!window.location.hash) return;
    const send = (tries = 0) => {
      if (window.goatcounter && typeof window.goatcounter.count === "function") {
        window.goatcounter.count({
          path: window.location.pathname + window.location.hash,
          title: `${document.title} ${window.location.hash}`,
          event: false,
        });
      } else if (tries < 50) {
        window.setTimeout(() => send(tries + 1), 100);
      }
    };
    send();
  };
  window.addEventListener("hashchange", countHash);
  countHash();

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

      // Navigation is interruptible: each call resets the three slots to their
      // canonical prev/current/next state synchronously, so tapping mid-slide
      // just retargets the in-flight CSS transitions from wherever they are.
      const go = direction => {
        if (slides.length < 2 || direction === 0) return;
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

      // --- Touch drag navigation (mobile/tablet) ---
      // The slides follow the finger 1:1 while dragging, then a medium-light
      // snap settles the nearest image on release. Transforms drive the drag,
      // then hand off to the class-based slide transition for the snap.
      let dragStartX = 0;
      let dragStartY = 0;
      let dragDelta = 0;
      let dragging = false;
      let dragAxis = null; // null = undecided, "x" = horizontal, "y" = vertical
      let stageWidth = 0;
      let draggedSlots = [];

      const applyDrag = dx => {
        for (const slot of draggedSlots) {
          slot.style.transform = `translateX(${dx}px)`;
        }
      };
      const releaseDrag = () => {
        for (const slot of draggedSlots) {
          slot.style.transform = "";
        }
        draggedSlots = [];
      };
      const endSnap = () => {
        window.setTimeout(() => lightbox.classList.remove("is-snapping"), 480);
      };

      stage.addEventListener("touchstart", event => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        dragStartX = touch.clientX;
        dragStartY = touch.clientY;
        dragDelta = 0;
        dragging = true;
        dragAxis = null;
        stageWidth = stage.clientWidth || lightbox.clientWidth || 1;
        draggedSlots = [prevSlot, currentSlot, nextSlot].filter(Boolean);
      }, { passive: true });

      stage.addEventListener("touchmove", event => {
        if (!dragging || event.touches.length !== 1) return;
        const touch = event.touches[0];
        const dx = touch.clientX - dragStartX;
        const dy = touch.clientY - dragStartY;
        if (dragAxis === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          dragAxis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (dragAxis === "x") lightbox.classList.add("is-dragging");
          else { dragging = false; releaseDrag(); return; }
        }
        if (dragAxis !== "x") return;
        event.preventDefault();
        dragDelta = dx;
        applyDrag(dx);
      }, { passive: false });

      const finishDrag = event => {
        if (!dragging) return;
        dragging = false;
        if (dragAxis !== "x") { releaseDrag(); return; }
        // Suppress the synthetic click that follows a real drag.
        if (Math.abs(dragDelta) > 6 && event.cancelable) event.preventDefault();
        lightbox.classList.remove("is-dragging");
        lightbox.classList.add("is-snapping");
        const threshold = Math.max(44, stageWidth * 0.18);
        const delta = dragDelta;
        releaseDrag();
        if (delta <= -threshold) go(1);
        else if (delta >= threshold) go(-1);
        endSnap();
      };

      stage.addEventListener("touchend", finishDrag, { passive: false });
      stage.addEventListener("touchcancel", () => {
        if (!dragging && !draggedSlots.length) return;
        dragging = false;
        dragAxis = null;
        lightbox.classList.remove("is-dragging");
        lightbox.classList.add("is-snapping");
        releaseDrag();
        endSnap();
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
