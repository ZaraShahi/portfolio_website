document.addEventListener("DOMContentLoaded", async () => {
  const sectionSlots = document.querySelectorAll("[data-section-src]");
  await Promise.all(Array.from(sectionSlots, async slot => {
    const source = slot.dataset.sectionSrc;
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Could not load ${source}: HTTP ${response.status}`);
      }
      slot.innerHTML = await response.text();
    } catch (error) {
      console.error(`Failed to load page section: ${source}`, error);
      const message = document.createElement("p");
      message.className = "section-message";
      message.setAttribute("role", "alert");
      message.textContent = `Unable to load ${source}. Please refresh the page to try again.`;
      slot.replaceChildren(message);
    }
  }));

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

  // ---------- Hanging thread (background decoration) ----------
  // One continuous thread drawn from the top of the Artwork section down into
  // Contact. It is three undistorted image pieces: the loop ("head"), a strand
  // segment that repeats seamlessly ("tile"), and the loose end ("tip"). Only
  // the number of repeated tiles changes with page length.
  // Each section gets its own clipped copy behind its content, offset so the
  // copies line up into one thread (sections are separate stacking contexts,
  // so a single page-wide layer can't sit behind all of their content).
  const threadStart = document.getElementById("artworks");
  const threadEnd = document.getElementById("contact");
  if (threadStart && threadEnd) {
    // Pixel heights of the pieces (all pieces are 1200px wide).
    const THREAD_ASSET_W = 1200;
    const THREAD_HEAD_H = 1440;
    const THREAD_TILE_H = 450;
    const THREAD_TIP_H = 488;
    const threadPath = "assets/decor/thread-2";
    const hosts = ["artworks", "about", "cv", "contact"]
      .map(id => document.getElementById(id))
      .filter(Boolean);

    const docTop = el => {
      // offsetTop ignores the .reveal translateY, unlike getBoundingClientRect.
      let top = 0;
      for (let node = el; node; node = node.offsetParent) top += node.offsetTop;
      return top;
    };

    const slices = hosts.map(host => {
      host.classList.add("thread-host");
      const slice = document.createElement("div");
      slice.className = "thread-slice";
      slice.setAttribute("aria-hidden", "true");
      slice.innerHTML =
        '<div class="thread">' +
        `<img class="thread__head" src="${threadPath}-head.webp" alt="" decoding="async" />` +
        `<div class="thread__tail" style="background-image: url('${threadPath}-tile.webp')"></div>` +
        `<img class="thread__tip" src="${threadPath}-tip.webp" alt="" decoding="async" />` +
        "</div>";
      host.prepend(slice);
      return { host, thread: slice.firstElementChild, tail: slice.querySelector(".thread__tail") };
    });

    let threadFrame = 0;
    const layoutThread = () => {
      threadFrame = 0;
      const width = slices[0].thread.offsetWidth;
      if (!width) return;
      const scale = width / THREAD_ASSET_W;
      const headH = THREAD_HEAD_H * scale;
      const tileH = THREAD_TILE_H * scale;
      const tipH = THREAD_TIP_H * scale;
      const top = docTop(threadStart);
      // Let the loose end finish halfway down the Contact bar.
      const end = docTop(threadEnd) + threadEnd.offsetHeight / 2;
      const tiles = Math.max(0, Math.round((end - top - headH - tipH) / tileH));
      slices.forEach(({ host, thread, tail }) => {
        thread.style.top = `${top - docTop(host)}px`;
        tail.style.height = `${tiles * tileH}px`;
      });
    };
    const scheduleThread = () => {
      if (!threadFrame) threadFrame = requestAnimationFrame(layoutThread);
    };
    scheduleThread();
    window.addEventListener("load", scheduleThread);
    window.addEventListener("resize", scheduleThread);
    // Images loading and layout changes move the sections; follow them.
    new ResizeObserver(scheduleThread).observe(document.querySelector("main") || document.body);
  }

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

  // Cover: the name stays pinned (CSS sticky) for the first 30% of the cover,
  // then fades out as the image continues to scroll. While the name is
  // visible the nav is collapsed into a hamburger tile; it expands into the
  // full bar in step with the name fading.
  const cover = document.querySelector(".cover");
  const coverName = cover?.querySelector(".cover__name");
  const burger = nav?.querySelector(".nav__burger");
  const drawer = nav?.querySelector(".nav__drawer");

  const setDrawer = open => {
    if (!burger || !drawer) return;
    drawer.hidden = !open;
    nav.classList.toggle("nav--drawer-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };

  if (burger && drawer) {
    // Mouse/trackpad devices: hover opens the menu, leaving it closes it.
    // Touch devices (phones, tablets): tap toggles it.
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    let closeTimer = 0;
    const openOnHover = () => {
      if (!hoverQuery.matches || !nav.classList.contains("nav--collapsed")) return;
      window.clearTimeout(closeTimer);
      setDrawer(true);
    };
    const closeOnLeave = () => {
      if (!hoverQuery.matches) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => setDrawer(false), 220);
    };
    [burger, drawer].forEach(el => {
      el.addEventListener("mouseenter", openOnHover);
      el.addEventListener("mouseleave", closeOnLeave);
    });

    burger.addEventListener("click", () => {
      // With hover the menu is already open, so a click shouldn't close it.
      setDrawer(hoverQuery.matches ? true : drawer.hidden);
    });
    nav.addEventListener("focusout", event => {
      if (!drawer.hidden && !nav.contains(event.relatedTarget)) setDrawer(false);
    });
    drawer.addEventListener("click", event => {
      if (event.target.closest("a")) setDrawer(false);
    });
    document.addEventListener("click", event => {
      if (!drawer.hidden && !nav.contains(event.target)) setDrawer(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !drawer.hidden) {
        setDrawer(false);
        burger.focus();
      }
    });
  }

  if (cover && coverName) {
    let ticking = false;
    const updateCover = () => {
      ticking = false;
      const rect = cover.getBoundingClientRect();
      const scrolled = -rect.top;
      const fadeStart = rect.height * 0.3;
      const fadeLength = Math.max(rect.height * 0.08, 1);
      const progress = Math.min(Math.max((scrolled - fadeStart) / fadeLength, 0), 1);
      coverName.style.opacity = String(1 - progress);

      if (nav?.classList.contains("nav--collapsible")) {
        nav.style.setProperty("--nav-expand", progress.toFixed(4));
        const collapsed = progress < 0.5;
        nav.classList.toggle("nav--collapsed", collapsed);
        if (!collapsed) setDrawer(false);
      }
    };
    const requestCoverUpdate = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateCover);
      }
    };
    updateCover();
    window.addEventListener("scroll", requestCoverUpdate, { passive: true });
    window.addEventListener("resize", requestCoverUpdate);
    window.addEventListener("load", requestCoverUpdate);
  } else if (nav?.classList.contains("nav--collapsible")) {
    nav.classList.remove("nav--collapsible", "nav--collapsed");
  }

  updateNavHeight();
  toggleNav();
  window.addEventListener("scroll", toggleNav, { passive: true });
  window.addEventListener("resize", updateNavHeight);
  window.addEventListener("load", updateNavHeight);

  // Fragment targets may not exist when the browser first processes the URL.
  if (sectionSlots.length && window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    const revealTarget = target?.closest(".reveal");
    if (revealTarget) {
      revealTarget.classList.add("visible");
      observer.unobserve(revealTarget);
    }
    target?.scrollIntoView({ behavior: "instant" });
  }

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

  const carousels = document.querySelectorAll(".portfolio-carousel");
  carousels.forEach(carousel => {
    const track = carousel.querySelector(".portfolio-grid--carousel");
    const prev = carousel.querySelector(".portfolio-carousel__arrow--prev");
    const next = carousel.querySelector(".portfolio-carousel__arrow--next");
    if (!track || !prev || !next) return;

    const stepSize = () => {
      const tile = track.querySelector(".portfolio-tile");
      if (!tile) return track.clientWidth * 0.8;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return tile.getBoundingClientRect().width + gap;
    };

    const updateArrows = () => {
      const maxScroll = track.scrollWidth - track.clientWidth - 1;
      prev.disabled = track.scrollLeft <= 0;
      next.disabled = track.scrollLeft >= maxScroll;
    };

    prev.addEventListener("click", () => {
      track.scrollBy({ left: -stepSize(), behavior: "smooth" });
    });
    next.addEventListener("click", () => {
      track.scrollBy({ left: stepSize(), behavior: "smooth" });
    });

    track.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    updateArrows();
  });

  const lightboxTriggers = document.querySelectorAll(".portfolio-tile--image");
  if (lightboxTriggers.length) {
    // Keep each medium's slide list independent while sharing one lightbox.
    const galleries = new Map();
    // Google Drive video: a "drive.google.com/file/d/<id>/preview" slide plays in
    // Drive's own player (Drive converts the video for every browser).
    const driveVideoId = url => url.match(/drive\.google\.com\/file\/d\/([^/?#]+)\/preview/)?.[1] || "";
    let slides = [];
    const triggerStartIndex = new WeakMap();
    const triggerGallery = new WeakMap();
    lightboxTriggers.forEach(trigger => {
      const urls = (trigger.dataset.slides || "")
        .split("|")
        .map(u => u.trim())
        .filter(Boolean);
      if (!urls.length) return;
      const gallery = trigger.closest(".portfolio-carousel");
      if (!galleries.has(gallery)) galleries.set(gallery, []);
      const gallerySlides = galleries.get(gallery);
      const caption = trigger.dataset.caption || "";
      const baseAlt = trigger.querySelector("img")?.alt || "";
      triggerStartIndex.set(trigger, gallerySlides.length);
      triggerGallery.set(trigger, gallerySlides);
      urls.forEach((url, i) => {
        const videoId = driveVideoId(url);
        const video = Boolean(videoId);
        gallerySlides.push({
          url,
          video,
          // Drive's still of the video, shown while the slide is beside the current one
          poster: video ? `https://drive.google.com/thumbnail?id=${videoId}&sz=s0` : "",
          ratio: trigger.dataset.videoRatio || "16 / 9",
          caption,
          alt: i === 0 ? baseAlt : `${baseAlt} ${video ? "video" : `detail ${i + 1}`}`,
        });
      });
    });

    if (galleries.size) {
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
        img.referrerPolicy = "no-referrer"; // Google Drive refuses images requested with another site as referrer
        img.src = url;
        preloadCache.set(url, img);
        return img;
      };
      const warmNeighbors = idx => {
        const n = slides.length;
        for (let d = -2; d <= 2; d++) {
          const slide = slides[((idx + d) % n + n) % n];
          preload(slide.video ? slide.poster : slide.url);
        }
      };

      const TRANSITION_MS = 780;
      let closeTimer = 0;
      let currentIndex = 0;
      let prevSlot;
      let currentSlot;
      let nextSlot;
      const zoomLevels = [1, 1.5, 2];
      let zoomStep = 0;
      let panX = 0;
      let panY = 0;
      let panGesture = null;
      let suppressClickUntil = 0;

      const updatePan = () => {
        const img = currentSlot.querySelector("img");
        const excess = zoomLevels[zoomStep] - 1;
        const maxX = img.offsetWidth * excess / 2;
        const maxY = img.offsetHeight * excess / 2;
        panX = Math.max(-maxX, Math.min(maxX, panX));
        panY = Math.max(-maxY, Math.min(maxY, panY));
        img.style.setProperty("--image-pan-x", `${panX}px`);
        img.style.setProperty("--image-pan-y", `${panY}px`);
      };

      const finishPan = () => {
        if (!panGesture) return;
        const { img, pointerId, moved } = panGesture;
        panGesture = null;
        img.classList.remove("is-panning");
        if (img.hasPointerCapture(pointerId)) img.releasePointerCapture(pointerId);
        if (moved) suppressClickUntil = performance.now() + 400;
      };

      const updateZoom = () => {
        const img = currentSlot.querySelector("img");
        const nextZoom = zoomLevels[(zoomStep + 1) % zoomLevels.length] * 100;
        img.style.setProperty("--image-zoom", zoomLevels[zoomStep]);
        img.setAttribute("role", "button");
        img.tabIndex = 0;
        img.setAttribute("aria-label", `${img.alt}. Zoom to ${nextZoom}%`);
        img.classList.toggle("is-max-zoom", zoomStep === zoomLevels.length - 1);
        lightbox.classList.toggle("is-zoomed", zoomStep > 0);
        updatePan();
      };

      const resetZoom = () => {
        finishPan();
        zoomStep = 0;
        panX = 0;
        panY = 0;
        lightbox.classList.remove("is-zoomed");
        if (!currentSlot) return;
        const img = currentSlot.querySelector("img");
        img.style.removeProperty("--image-zoom");
        img.style.removeProperty("--image-pan-x");
        img.style.removeProperty("--image-pan-y");
        img.classList.remove("is-max-zoom");
        img.removeAttribute("role");
        img.removeAttribute("tabindex");
        img.removeAttribute("aria-label");
      };

      const cycleZoom = () => {
        zoomStep = (zoomStep + 1) % zoomLevels.length;
        updateZoom();
      };

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
        img.referrerPolicy = "no-referrer";
        img.draggable = false;
        fig.appendChild(img);
        return fig;
      };

      const fillSlot = (slot, index) => {
        const data = slides[index];
        const img = slot.querySelector("img");
        let frame = slot.querySelector("iframe");
        slot.classList.toggle("is-video", data.video);
        if (data.video) {
          // The still stays in the slot; the player is only loaded while the
          // slide is current (see syncVideos).
          img.src = data.poster;
          if (!frame) {
            frame = document.createElement("iframe");
            frame.className = "lightbox__slide-video";
            frame.allow = "autoplay; fullscreen; picture-in-picture";
            frame.allowFullscreen = true;
            slot.appendChild(frame);
          }
          frame.title = data.alt;
          frame.dataset.src = data.url;
          frame.style.setProperty("--video-ratio", data.ratio);
        } else {
          frame?.remove();
          img.src = data.url;
        }
        img.alt = data.alt;
        slot.dataset.index = String(index);
      };

      // Load the player on the current slide; unload it everywhere else so a
      // video stops when you move on.
      const syncVideos = () => {
        stage.querySelectorAll("iframe.lightbox__slide-video").forEach(frame => {
          const current = Boolean(currentSlot && currentSlot.contains(frame));
          if (current && frame.getAttribute("src") !== frame.dataset.src) frame.src = frame.dataset.src;
          else if (!current && frame.hasAttribute("src")) frame.removeAttribute("src");
        });
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
        syncVideos();
        zoomStep = 0;
        updateZoom();
        updateCaption();
      };

      // Navigation is interruptible: each call resets the three slots to their
      // canonical prev/current/next state synchronously, so tapping mid-slide
      // just retargets the in-flight CSS transitions from wherever they are.
      const go = direction => {
        if (slides.length < 2 || direction === 0) return;
        resetZoom();
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
        syncVideos();
        updateZoom();
      };

      const openLightbox = trigger => {
        const gallerySlides = triggerGallery.get(trigger);
        const startIndex = triggerStartIndex.get(trigger);
        if (!gallerySlides || startIndex === undefined) {
          console.error("Artwork is missing its slide list.", trigger);
          return;
        }
        window.clearTimeout(closeTimer);
        slides = gallerySlides;
        currentIndex = startIndex;
        warmNeighbors(currentIndex);
        layoutInitial();
        document.body.classList.add("lightbox-open");
        requestAnimationFrame(() => lightbox.classList.add("is-open"));
        closeButton?.focus({ preventScroll: true });
      };

      const closeLightbox = () => {
        resetZoom();
        stage.querySelectorAll("iframe.lightbox__slide-video").forEach(f => f.removeAttribute("src"));
        lightbox.classList.remove("is-open");
        document.body.classList.remove("lightbox-open");
        window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(() => {
          stage.innerHTML = "";
          preloadCache.clear();
        }, 550);
      };

      prevButton?.addEventListener("click", () => go(-1));
      nextButton?.addEventListener("click", () => go(1));

      stage.addEventListener("click", event => {
        if (performance.now() < suppressClickUntil) return;
        const slot = event.target.closest?.(".lightbox__slide");
        if (!slot) return;
        if (slot.classList.contains("is-prev")) go(-1);
        else if (slot.classList.contains("is-next")) go(1);
        else if (slot === currentSlot && event.target.matches(".lightbox__slide-img")) cycleZoom();
      });

      stage.addEventListener("pointerdown", event => {
        if (zoomStep === 0 || !event.isPrimary || event.button !== 0 ||
            event.target !== currentSlot.querySelector("img")) return;
        const img = event.target;
        panGesture = {
          img,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: panX,
          originY: panY,
          moved: false,
        };
        img.setPointerCapture(event.pointerId);
      });

      stage.addEventListener("pointermove", event => {
        if (!panGesture || event.pointerId !== panGesture.pointerId) return;
        const dx = event.clientX - panGesture.startX;
        const dy = event.clientY - panGesture.startY;
        if (!panGesture.moved && Math.hypot(dx, dy) < 6) return;
        panGesture.moved = true;
        panGesture.img.classList.add("is-panning");
        panX = panGesture.originX + dx;
        panY = panGesture.originY + dy;
        updatePan();
      });

      const endPanPointer = event => {
        if (panGesture && event.pointerId === panGesture.pointerId) finishPan();
      };
      stage.addEventListener("pointerup", endPanPointer);
      stage.addEventListener("pointercancel", endPanPointer);
      stage.addEventListener("lostpointercapture", endPanPointer);
      window.addEventListener("resize", () => {
        if (lightbox.classList.contains("is-open")) updatePan();
      });

      stage.addEventListener("keydown", event => {
        if (event.target !== currentSlot?.querySelector("img")) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          cycleZoom();
        }
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
      const SNAP_MS = 480; // keep in sync with --lb-snap
      const endSnap = () => {
        window.setTimeout(() => lightbox.classList.remove("is-snapping"), SNAP_MS + 40);
      };

      // Snap back to the current image when the drag didn't cross the threshold.
      const snapBack = () => {
        lightbox.classList.remove("is-dragging");
        lightbox.classList.add("is-snapping");
        releaseDrag();
        endSnap();
      };

      // Navigate one image with a FLIP so ONLY transform animates on release.
      // Animating left/right (main-thread layout) alongside transform (compositor)
      // is what made fast drags vibrate; here the class swap is applied instantly
      // and the settle is a single composited transform that just decelerates.
      const snapNavigate = direction => {
        const slots = draggedSlots.slice();
        const firstLeft = new Map();
        for (const slot of slots) firstLeft.set(slot, slot.getBoundingClientRect().left);

        // FIRST is captured; apply the class swap instantly with no transition.
        lightbox.classList.add("is-instant");
        lightbox.classList.remove("is-dragging");
        for (const slot of slots) slot.style.transform = "";
        go(direction);

        // INVERT: offset the surviving slots back to where the finger left them.
        const active = [prevSlot, currentSlot, nextSlot].filter(Boolean);
        for (const slot of active) {
          if (!firstLeft.has(slot)) { slot.style.transform = ""; continue; }
          const dxInv = firstLeft.get(slot) - slot.getBoundingClientRect().left;
          slot.style.transform = `translateX(${dxInv}px)`;
        }
        void lightbox.offsetWidth;
        lightbox.classList.remove("is-instant");
        lightbox.classList.add("is-snapping");
        // PLAY: settle every slot to its resting spot via transform alone.
        requestAnimationFrame(() => {
          for (const slot of active) slot.style.transform = "";
        });
        draggedSlots = [];
        endSnap();
      };

      stage.addEventListener("touchstart", event => {
        if (zoomStep > 0 || event.touches.length !== 1) return;
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
        const threshold = Math.max(44, stageWidth * 0.18);
        const delta = dragDelta;
        if (slides.length > 1 && delta <= -threshold) snapNavigate(1);
        else if (slides.length > 1 && delta >= threshold) snapNavigate(-1);
        else snapBack();
      };

      stage.addEventListener("touchend", finishDrag, { passive: false });
      stage.addEventListener("touchcancel", () => {
        if (!dragging && !draggedSlots.length) return;
        dragging = false;
        dragAxis = null;
        snapBack();
      });
    }
  }

  // "Download full CV" cloth. Two damped springs (energy for hover, press for
  // the click) drive the fabric; while it has energy, several slow waves at
  // unrelated speeds make it lift, sway and ripple without visibly repeating.
  // The loop sleeps when the cloth has settled.
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const cloth = {
      el: null, turb: null, disp: null, raf: 0, last: 0, t: Math.random() * 100,
      e: 0, ev: 0, eTarget: 0,
      p: 0, pv: 0, pTarget: 0
    };

    const bind = el => {
      if (cloth.el === el) return true;
      const filter = document.getElementById("cloth-ripple");
      if (!filter) return false;
      cloth.el = el;
      cloth.turb = filter.querySelector("feTurbulence");
      cloth.disp = filter.querySelector("feDisplacementMap");
      return true;
    };

    const frame = now => {
      const dt = Math.min(0.05, (now - cloth.last) / 1000 || 0.016);
      cloth.last = now;
      cloth.t += dt;
      // springs: slightly under-damped so the cloth overshoots and settles
      cloth.ev += (60 * (cloth.eTarget - cloth.e) - 9 * cloth.ev) * dt;
      cloth.e += cloth.ev * dt;
      cloth.pv += (320 * (cloth.pTarget - cloth.p) - 16 * cloth.pv) * dt;
      cloth.p += cloth.pv * dt;

      const { t, e, p } = cloth;
      const wave = Math.sin(t * 1.7 + 0.3) * 0.5 + Math.sin(t * 2.9 + 1.1) * 0.25 + Math.sin(t * 0.73) * 0.35;
      const sway = Math.sin(t * 1.3 + Math.sin(t * 0.47) * 1.6);
      const breath = Math.sin(t * 2.2 + Math.sin(t * 0.61));
      const s = cloth.el.style;
      s.setProperty("--cloth-rx", `${(e * (5 + 4 * wave)).toFixed(3)}deg`);
      s.setProperty("--cloth-sk", `${(e * 1.1 * sway).toFixed(3)}deg`);
      s.setProperty("--cloth-sy", (1 + e * 0.03 * (1 + breath) - p * 0.08).toFixed(4));
      s.setProperty("--cloth-sx", (1 - p * 0.018).toFixed(4));
      s.setProperty("--cloth-ty", `${(p * 1.2 - e * 1).toFixed(3)}px`);
      cloth.disp.setAttribute("scale", (2 + e * (6 + 2 * breath) - p * 1.5).toFixed(2));
      cloth.turb.setAttribute(
        "baseFrequency",
        `${(0.011 + e * 0.002 * Math.sin(t * 0.6)).toFixed(5)} ${(0.045 + e * 0.008 * Math.sin(t * 0.9 + 1)).toFixed(5)}`
      );

      const settled = cloth.eTarget === 0 && cloth.pTarget === 0 &&
        Math.abs(e) < 0.002 && Math.abs(cloth.ev) < 0.01 && Math.abs(p) < 0.002 && Math.abs(cloth.pv) < 0.01;
      cloth.raf = settled ? 0 : requestAnimationFrame(frame);
    };

    const wake = () => {
      if (cloth.raf) return;
      cloth.last = performance.now();
      cloth.raf = requestAnimationFrame(frame);
    };

    const set = (event, key, value) => {
      const el = event.target.closest?.(".cv-ribbon");
      if (!el || !bind(el)) return;
      cloth[key] = value;
      wake();
    };

    const leaving = event => !event.relatedTarget || !event.target.closest(".cv-ribbon")?.contains(event.relatedTarget);

    document.addEventListener("pointerover", event => set(event, "eTarget", 1));
    document.addEventListener("pointerout", event => {
      if (!leaving(event)) return;
      set(event, "eTarget", 0);
      set(event, "pTarget", 0);
    });
    document.addEventListener("focusin", event => set(event, "eTarget", 1));
    document.addEventListener("focusout", event => set(event, "eTarget", 0));
    document.addEventListener("pointerdown", event => set(event, "pTarget", 1));
    ["pointerup", "pointercancel"].forEach(type =>
      document.addEventListener(type, () => {
        if (!cloth.el || cloth.pTarget === 0) return;
        cloth.pTarget = 0;
        wake();
      })
    );
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
