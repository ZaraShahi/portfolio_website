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

  // ---------- Analytics (GoatCounter events) ----------
  // Everything a visitor does is sent to GoatCounter as an "event" (the normal
  // page view is still counted by count.js itself). Paths are grouped so the
  // dashboard reads well:
  //   section/<id>                 a section was really looked at (>=1 s, half on screen)
  //   scroll/<25|50|75|100>        how far down the page people get
  //   nav/<place>/<target>         menu, logo, footer and other in-page links
  //   artwork/open/<medium>/<work> a tile was clicked
  //   artwork/view/<medium>/<work> the work was shown in the gallery (also when reached by arrows)
  //   artwork/image/<medium>/<work>/<n>  each image of a work that was shown
  //   artwork/zoom/<medium>/<work>/<n>   an image was zoomed into
  //   artwork/time/<medium>/<work>/<bucket>  time spent on a work in the gallery
  //   gallery/<close|next|prev|swipe>    how people move through the gallery
  //   carousel/<medium>/<next|prev|scroll>
  //   video/<work>/<start|pause|resume|25|50|75|complete|replay|seek|mute|unmute|fullscreen|error>
  //   click/<email|cv-download|instagram|linkedin|location-map|...>
  //   outbound/<site>/<section>    links to other websites (press, catalogues...)
  //   contact/form-submit, landing/<#hash>, time-on-page/<bucket>, error/image/<host>
  const slugify = text =>
    String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled";

  const trackQueue = [];
  let trackTimer = 0;
  const flushTrack = (tries = 0) => {
    const gc = window.goatcounter;
    if (gc && typeof gc.count === "function") {
      while (trackQueue.length) gc.count(trackQueue.shift());
      trackTimer = 0;
    } else if (tries < 150) {
      // count.js loads async (and may be blocked); keep events for up to ~15 s
      trackTimer = window.setTimeout(() => flushTrack(tries + 1), 100);
    } else {
      trackQueue.length = 0;
      trackTimer = 0;
    }
  };
  const track = (path, title) => {
    trackQueue.push({ path, title: title || path, event: true });
    if (!trackTimer) flushTrack();
  };
  const trackEvent = (path, title) => track(path, title); // for scopes where "track" is a local name
  const trackOnce = (() => {
    const sent = new Set();
    return (path, title) => {
      if (sent.has(path)) return;
      sent.add(path);
      track(path, title);
    };
  })();
  const timeBucket = seconds =>
    seconds < 5 ? "under-5s" :
    seconds < 15 ? "5-15s" :
    seconds < 60 ? "15-60s" :
    seconds < 180 ? "1-3min" :
    seconds < 600 ? "3-10min" : "over-10min";

  // Arrived through a link to a section (e.g. someone shared .../#cv)
  if (window.location.hash.length > 1) {
    track(`landing/${slugify(window.location.hash)}`, `Arrived at ${window.location.hash}`);
  }

  // Link clicks, classified by where they lead and where they sit on the page.
  const linkPlace = link =>
    link.closest(".nav__drawer") ? "menu-drawer" :
    link.closest(".nav__links") ? "menu" :
    link.classList.contains("nav__brand") ? "logo" :
    link.closest(".footer") ? "footer" :
    link.closest("#cv") ? "cv" :
    link.closest("#contact, .contact") ? "contact" :
    link.closest("#about") ? "about" : "page";
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    const label = (link.getAttribute("aria-label") || link.textContent || "").trim().replace(/\s+/g, " ");
    let url;
    try { url = new URL(href, window.location.href); } catch { return; }
    const place = linkPlace(link);
    if (url.protocol === "mailto:") return track(`click/email/${place}`, `Email link (${place})`);
    if (url.protocol === "tel:") return track(`click/phone/${place}`, `Phone link (${place})`);
    if (link.hasAttribute("download") || /\.pdf$/i.test(url.pathname) && url.origin === window.location.origin) {
      return track(`click/cv-download/${place}`, `Downloaded CV (${place})`);
    }
    if (url.origin !== window.location.origin) {
      const host = url.hostname.replace(/^www\./, "");
      if (/instagram\.com$/.test(host)) return track(`click/instagram/${place}`, `Instagram (${place})`);
      if (/linkedin\.com$/.test(host)) return track(`click/linkedin/${place}`, `LinkedIn (${place})`);
      if (/^maps\.google\./.test(host) || url.pathname.startsWith("/maps")) {
        return track(`click/location-map/${place}`, `Location map (${place})`);
      }
      const first = url.pathname.split("/").filter(Boolean)[0] || "";
      return track(`outbound/${host}${first ? `/${slugify(first)}` : ""}`, `${label || host} (${place})`);
    }
    const samePage = url.pathname === window.location.pathname;
    if (samePage && url.hash) {
      return track(`nav/${place}/${slugify(url.hash) || "top"}`, `${label || url.hash} (${place})`);
    }
    track(`nav/${place}/page-${slugify(url.pathname.split("/").pop() || "home")}`, `${label} (${place})`);
  }, true);

  // Sections actually looked at: at least half of the section (or half the
  // screen, for sections taller than it) visible for a full second.
  const sectionTargets = [
    [".cover", "cover"],
    ["#weaving", "weaving"],
    ["#installation", "installation"],
    ["#photography", "photography"],
    ["#about", "about"],
    ["#cv", "cv"],
    ["#contact", "contact"],
  ];
  const sectionTimers = new Map();
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const el = entry.target;
      const visible = entry.intersectionRect.height;
      const needed = Math.min(entry.boundingClientRect.height, window.innerHeight) * 0.5;
      const name = el.dataset.trackSection;
      if (entry.isIntersecting && visible >= needed) {
        if (!sectionTimers.has(el)) {
          sectionTimers.set(el, window.setTimeout(() => {
            trackOnce(`section/${name}`, `Looked at ${name}`);
            sectionObserver.unobserve(el);
          }, 1000));
        }
      } else if (sectionTimers.has(el)) {
        window.clearTimeout(sectionTimers.get(el));
        sectionTimers.delete(el);
      }
    });
  }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
  sectionTargets.forEach(([selector, name]) => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.dataset.trackSection = name;
    sectionObserver.observe(el);
  });

  // Scroll depth
  let depthFrame = 0;
  const checkDepth = () => {
    depthFrame = 0;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 100;
    [25, 50, 75, 100].forEach(mark => {
      if (pct >= mark - 1) trackOnce(`scroll/${mark}`, `Scrolled ${mark}% of the page`);
    });
  };
  window.addEventListener("scroll", () => {
    if (!depthFrame) depthFrame = requestAnimationFrame(checkDepth);
  }, { passive: true });

  // Time on page (only while the tab is visible), sent when the visitor leaves.
  let visibleSince = document.visibilityState === "visible" ? performance.now() : 0;
  let visibleTotal = 0;
  let timeSent = false;
  const sendTimeOnPage = () => {
    if (visibleSince) visibleTotal += performance.now() - visibleSince;
    visibleSince = 0;
    if (timeSent) return;
    timeSent = true;
    const gc = window.goatcounter;
    if (gc && typeof gc.count === "function") {
      const path = `time-on-page/${timeBucket(visibleTotal / 1000)}`;
      gc.count({ path, title: path, event: true }); // count.js uses sendBeacon, safe on exit
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (!visibleSince) visibleSince = performance.now();
    } else if (visibleSince) {
      visibleTotal += performance.now() - visibleSince;
      visibleSince = 0;
    }
  });
  window.addEventListener("pagehide", sendTimeOnPage);

  // Images that fail to load (e.g. Google Drive refusing or rate-limiting)
  document.addEventListener("error", event => {
    const el = event.target;
    if (!(el instanceof HTMLImageElement) || !el.getAttribute("src")) return;
    let host = "";
    try { host = new URL(el.src).hostname; } catch { return; }
    trackOnce(`error/image/${host}`, `An image from ${host} failed to load`);
  }, true);

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
      if (drawer.hidden) track("nav/menu-open", "Opened the menu");
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

    const medium = carousel.closest(".artwork-section")?.id || "carousel";
    let arrowScrollUntil = 0;
    prev.addEventListener("click", () => {
      arrowScrollUntil = performance.now() + 900;
      trackEvent(`carousel/${medium}/prev`, `${medium}: previous arrow`);
      track.scrollBy({ left: -stepSize(), behavior: "smooth" });
    });
    next.addEventListener("click", () => {
      arrowScrollUntil = performance.now() + 900;
      trackEvent(`carousel/${medium}/next`, `${medium}: next arrow`);
      track.scrollBy({ left: stepSize(), behavior: "smooth" });
    });

    track.addEventListener("scroll", () => {
      // scrolled by hand (swipe / trackpad), counted once per visit
      if (performance.now() > arrowScrollUntil) trackOnce(`carousel/${medium}/scroll`, `${medium}: scrolled by hand`);
    }, { passive: true });
    track.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    updateArrows();
  });

  // ---------- Video player (gallery) ----------
  // One minimal control bar: play/pause, a single progress bar, time, sound and
  // full screen. While playing, the controls fade out after 3 s; tapping the
  // video only shows/hides them (it never pauses). Pausing is the pause button.
  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const formatTime = t => {
    if (!Number.isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  function createVideoPlayer({ sources, poster, label, ratioW, ratioH, trackId = "video", fallbackEmbed = "" }) {
    const HIDE_AFTER = 3000;
    const root = document.createElement("div");
    // is-fresh: not started yet (or finished) -> only the big play button shows
    root.className = "vplayer is-paused is-fresh";
    root.style.setProperty("--video-w", ratioW);
    root.style.setProperty("--video-h", ratioH);
    root.innerHTML = `
      <video class="vplayer__video" playsinline preload="metadata"></video>
      <img class="vplayer__poster" alt="" referrerpolicy="no-referrer" decoding="async" />
      <button class="vplayer__big" type="button" aria-label="Play video">${ICONS.play}</button>
      <div class="vplayer__bar">
        <button class="vplayer__btn vplayer__toggle" type="button" aria-label="Play">${ICONS.play}</button>
        <input class="vplayer__progress" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek" />
        <span class="vplayer__time">0:00 / 0:00</span>
        <button class="vplayer__btn vplayer__mute" type="button" aria-label="Mute">${ICONS.sound}</button>
        <button class="vplayer__btn vplayer__full" type="button" aria-label="Full screen">${ICONS.full}</button>
      </div>`;
    const video = root.querySelector("video");
    const big = root.querySelector(".vplayer__big");
    const toggle = root.querySelector(".vplayer__toggle");
    const progress = root.querySelector(".vplayer__progress");
    const time = root.querySelector(".vplayer__time");
    const mute = root.querySelector(".vplayer__mute");
    const full = root.querySelector(".vplayer__full");

    video.setAttribute("aria-label", label);
    // The still is a plain <img> (not video.poster) so it can be requested
    // without a referrer, which Google Drive requires.
    const posterImg = root.querySelector(".vplayer__poster");
    if (poster) posterImg.src = poster;
    else posterImg.remove();
    posterImg.addEventListener("click", () => play());
    // analytics: video/<work>/...
    const vt = (what, title) => track(`video/${trackId}/${what}`, `${label}: ${title || what}`);
    let started = false;
    let endedOnce = false;
    let failedSources = 0;
    const milestones = new Set();
    sources.forEach(({ src, type }) => {
      const source = document.createElement("source");
      source.src = src;
      source.type = type;
      // a <source> that can't be loaded or decoded; when all fail, the video can't play
      source.addEventListener("error", () => {
        failedSources += 1;
        if (failedSources === sources.length) {
          trackOnce(`video/${trackId}/error`, `${label}: could not be loaded or played`);
          useFallback();
        }
      });
      video.appendChild(source);
    });

    let hideTimer = 0;
    let seeking = false;
    const scheduleHide = () => {
      clearTimeout(hideTimer);
      if (!video.paused && !seeking) {
        hideTimer = setTimeout(() => root.classList.remove("is-controls"), HIDE_AFTER);
      }
    };
    const showControls = () => {
      root.classList.add("is-controls");
      scheduleHide();
    };
    const hideControls = () => {
      clearTimeout(hideTimer);
      root.classList.remove("is-controls");
    };

    const renderTime = () => {
      const d = video.duration;
      if (!seeking && Number.isFinite(d) && d > 0) {
        progress.value = String(Math.round((video.currentTime / d) * 1000));
      }
      progress.style.setProperty("--progress", `${(Number(progress.value) / 10).toFixed(2)}%`);
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(d)}`;
    };
    let raf = 0;
    const tick = () => {
      renderTime();
      raf = video.paused ? 0 : requestAnimationFrame(tick);
    };

    const play = () => {
      const attempt = video.play();
      attempt?.catch?.(() => root.classList.add("is-paused"));
    };

    video.addEventListener("play", () => {
      if (!started) vt("start", "started");
      else if (root.classList.contains("is-fresh")) vt("replay", "watched again");
      else vt("resume", "resumed");
      started = true;
      root.classList.remove("is-paused", "is-fresh");
      toggle.innerHTML = ICONS.pause;
      toggle.setAttribute("aria-label", "Pause");
      if (!raf) raf = requestAnimationFrame(tick);
      showControls();
    });
    video.addEventListener("pause", () => {
      root.classList.add("is-paused");
      toggle.innerHTML = ICONS.play;
      toggle.setAttribute("aria-label", "Play");
      root.classList.add("is-controls");
      clearTimeout(hideTimer);
    });
    video.addEventListener("ended", () => {
      if (!endedOnce) vt("complete", "watched to the end");
      endedOnce = true;
      root.classList.add("is-fresh");
      root.classList.remove("is-controls");
    });
    video.addEventListener("waiting", () => root.classList.add("is-waiting"));
    ["playing", "canplay", "pause"].forEach(type =>
      video.addEventListener(type, () => root.classList.remove("is-waiting"))
    );
    ["loadedmetadata", "durationchange", "timeupdate", "seeked"].forEach(type =>
      video.addEventListener(type, renderTime)
    );
    video.addEventListener("timeupdate", () => {
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      [25, 50, 75].forEach(mark => {
        if (!milestones.has(mark) && video.currentTime / d >= mark / 100) {
          milestones.add(mark);
          vt(String(mark), `watched ${mark}%`);
        }
      });
    });
    video.addEventListener("volumechange", () => {
      mute.innerHTML = video.muted ? ICONS.muted : ICONS.sound;
      mute.setAttribute("aria-label", video.muted ? "Unmute" : "Mute");
    });

    // Tapping the picture: starts a paused video; while playing it only
    // shows or hides the controls.
    video.addEventListener("click", () => {
      if (video.paused) play();
      else if (root.classList.contains("is-controls")) hideControls();
      else showControls();
    });
    big.addEventListener("click", play);
    toggle.addEventListener("click", () => {
      if (video.paused) play();
      else {
        vt("pause", "paused");
        video.pause();
      }
    });
    mute.addEventListener("click", () => {
      video.muted = !video.muted;
      vt(video.muted ? "mute" : "unmute", video.muted ? "sound off" : "sound on");
      showControls();
    });
    full.addEventListener("click", () => {
      const doc = document;
      if (!(doc.fullscreenElement || doc.webkitFullscreenElement)) vt("fullscreen", "full screen");
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
      } else if (root.requestFullscreen) {
        root.requestFullscreen().catch(() => {});
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen(); // iPhone: only the video element can go full screen
      }
      showControls();
    });

    const seekTo = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) video.currentTime = (Number(progress.value) / 1000) * d;
      renderTime();
    };
    progress.addEventListener("input", () => {
      seeking = true;
      clearTimeout(hideTimer);
      seekTo();
    });
    progress.addEventListener("change", () => {
      vt("seek", "jumped to another point");
      seeking = false;
      seekTo();
      showControls();
    });
    // Keep scrubbing and arrow keys on the bar from swiping/stepping the gallery.
    ["touchstart", "touchmove", "touchend", "keydown"].forEach(type =>
      progress.addEventListener(type, event => event.stopPropagation(), { passive: true })
    );

    // Any pointer movement or focus inside the player brings the controls back
    // (once the video has started).
    root.addEventListener("pointermove", event => {
      if (event.pointerType === "mouse" && !root.classList.contains("is-fresh")) showControls();
    });
    root.addEventListener("focusin", () => {
      if (!root.classList.contains("is-fresh")) showControls();
    });

    // If this browser can't play the file (e.g. an HEVC .mov on Drive), show
    // Drive's own player instead, which converts the video for every browser.
    // Its frame is only loaded while the slide is current (see syncVideos).
    const useFallback = () => {
      if (!fallbackEmbed || root.classList.contains("is-embed")) return;
      trackOnce(`video/${trackId}/fallback-drive-player`, `${label}: shown in Drive's player`);
      clearTimeout(hideTimer);
      root.classList.add("is-embed");
      root.replaceChildren();
      const frame = document.createElement("iframe");
      frame.className = "vplayer__embed";
      frame.title = label;
      frame.allow = "autoplay; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      frame.dataset.src = fallbackEmbed;
      root.appendChild(frame);
      root.syncEmbed?.();
    };
    root.syncEmbed = () => {
      const frame = root.querySelector(".vplayer__embed");
      if (!frame) return;
      const current = Boolean(root.closest(".lightbox__slide.is-current"));
      if (current && frame.getAttribute("src") !== frame.dataset.src) frame.src = frame.dataset.src;
      else if (!current && frame.hasAttribute("src")) frame.removeAttribute("src");
    };

    root.pauseVideo = () => {
      if (!video.paused) video.pause();
      root.syncEmbed();
    };
    renderTime();
    return root;
  }

  const lightboxTriggers = document.querySelectorAll(".portfolio-tile--image");
  if (lightboxTriggers.length) {
    // Keep each medium's slide list independent while sharing one lightbox.
    const galleries = new Map();
    // Video slides: a Google Drive file link (drive.google.com/file/d/<id>/...)
    // or a direct .mp4/.webm URL. Drive files are streamed straight from Drive's
    // download address into the site's own player (see createVideoPlayer).
    const driveFileId = url => url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)?.[1] || "";
    const isVideoSlide = url => Boolean(driveFileId(url)) || /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
    const streamUrl = url => {
      const id = driveFileId(url);
      return id ? `https://drive.usercontent.google.com/download?id=${id}&export=download` : url;
    };
    const videoType = url => (/\.webm(\?|#|$)/i.test(url) ? "video/webm" : "video/mp4");
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
      // for analytics: which work (title = caption up to the first comma) in which medium
      const artwork = {
        medium: trigger.closest(".artwork-section")?.id || "artwork",
        title: caption.split(",")[0].trim() || baseAlt,
      };
      artwork.slug = slugify(artwork.title);
      artwork.key = `${artwork.medium}/${artwork.slug}`;
      trigger.addEventListener("click", () =>
        track(`artwork/open/${artwork.key}`, `Opened ${artwork.title} (${artwork.medium})`)
      );
      triggerStartIndex.set(trigger, gallerySlides.length);
      triggerGallery.set(trigger, gallerySlides);
      urls.forEach((url, i) => {
        const video = isVideoSlide(url);
        const id = driveFileId(url);
        // Sources in order of preference: the slide's file (H.264 .mp4), then an
        // optional data-video-webm (VP9), for browsers without H.264 (VS Code's).
        const sources = video
          ? [
              { src: streamUrl(url), type: id ? "video/mp4" : videoType(url) },
              ...(trigger.dataset.videoWebm
                ? [{ src: streamUrl(trigger.dataset.videoWebm), type: "video/webm" }]
                : []),
            ]
          : [];
        gallerySlides.push({
          url,
          video,
          sources,
          // the still shown before playing and while the slide is beside the current one
          poster: video
            ? trigger.dataset.videoPoster || (id ? `https://drive.google.com/thumbnail?id=${id}&sz=s0` : "")
            : "",
          ratio: trigger.dataset.videoRatio || "16 / 9",
          // Drive's own player, used if the browser can't play the file itself
          embed: video && id ? `https://drive.google.com/file/d/${id}/preview` : "",
          caption,
          artwork,
          part: i + 1,
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
        if (zoomStep === 1) {
          const data = slides[currentIndex];
          track(`artwork/zoom/${data.artwork.key}/${data.part}`, `${data.artwork.title}: zoomed into image ${data.part}`);
        }
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
        slot.querySelector(".vplayer")?.remove();
        slot.classList.toggle("is-video", data.video);
        if (data.video) {
          // The still stays in the slot for the neighbouring positions; the
          // player replaces it while the slide is current.
          if (data.poster) img.src = data.poster;
          else img.removeAttribute("src");
          const [w, h] = data.ratio.split("/").map(n => parseFloat(n));
          slot.appendChild(createVideoPlayer({
            sources: data.sources,
            poster: data.poster,
            label: data.alt,
            ratioW: w || 16,
            ratioH: h || 9,
            trackId: data.artwork.slug,
            fallbackEmbed: data.embed,
          }));
        } else {
          img.src = data.url;
        }
        img.alt = data.alt;
        slot.dataset.index = String(index);
      };

      // A video stops as soon as its slide is no longer the current one.
      const syncVideos = () => {
        stage.querySelectorAll(".vplayer").forEach(player => {
          if (!currentSlot || !currentSlot.contains(player)) player.pauseVideo?.();
          else player.syncEmbed?.();
        });
      };

      // Analytics for the gallery: which work is on screen, for how long, and
      // which of its images were shown (each once per opening of the gallery).
      let viewing = null; // { artwork, since }
      let shownImages = new Set();
      const endViewing = () => {
        if (!viewing) return;
        const seconds = (performance.now() - viewing.since) / 1000;
        const { artwork } = viewing;
        track(`artwork/time/${artwork.key}/${timeBucket(seconds)}`, `${artwork.title}: viewed ${timeBucket(seconds)}`);
        viewing = null;
      };
      const slideShown = () => {
        const data = slides[currentIndex];
        if (!data) return;
        const { artwork } = data;
        if (!viewing || viewing.artwork !== artwork) {
          endViewing();
          viewing = { artwork, since: performance.now() };
          track(`artwork/view/${artwork.key}`, `Viewed ${artwork.title} (${artwork.medium})`);
        }
        const imageKey = `${artwork.key}/${data.part}`;
        if (!shownImages.has(imageKey)) {
          shownImages.add(imageKey);
          track(
            `artwork/image/${imageKey}`,
            `${artwork.title}: ${data.video ? "video" : `image ${data.part}`} shown`
          );
        }
      };

      const updateCaption = () => {
        const cap = slides[currentIndex].caption;
        captionEl.textContent = cap || "";
        captionEl.hidden = !cap;
        slideShown();
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
        endViewing();
        shownImages = new Set();
        slides = gallerySlides;
        currentIndex = startIndex;
        warmNeighbors(currentIndex);
        layoutInitial();
        document.body.classList.add("lightbox-open");
        requestAnimationFrame(() => lightbox.classList.add("is-open"));
        closeButton?.focus({ preventScroll: true });
      };

      const closeLightbox = () => {
        if (!lightbox.classList.contains("is-open")) return;
        endViewing();
        track("gallery/close", "Closed the gallery");
        resetZoom();
        stage.querySelectorAll(".vplayer").forEach(player => player.pauseVideo?.());
        lightbox.classList.remove("is-open");
        document.body.classList.remove("lightbox-open");
        window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(() => {
          stage.innerHTML = "";
          preloadCache.clear();
        }, 550);
      };

      window.addEventListener("pagehide", endViewing);

      prevButton?.addEventListener("click", () => {
        track("gallery/prev", "Gallery: previous arrow");
        go(-1);
      });
      nextButton?.addEventListener("click", () => {
        track("gallery/next", "Gallery: next arrow");
        go(1);
      });

      stage.addEventListener("click", event => {
        if (performance.now() < suppressClickUntil) return;
        const slot = event.target.closest?.(".lightbox__slide");
        if (!slot) return;
        if (slot.classList.contains("is-prev")) {
          track("gallery/side-image", "Gallery: clicked a side image");
          go(-1);
        } else if (slot.classList.contains("is-next")) {
          track("gallery/side-image", "Gallery: clicked a side image");
          go(1);
        }
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
        else if (event.key === "ArrowLeft") {
          track("gallery/keyboard", "Gallery: arrow keys");
          go(-1);
        } else if (event.key === "ArrowRight") {
          track("gallery/keyboard", "Gallery: arrow keys");
          go(1);
        }
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
        track("gallery/swipe", "Gallery: swiped");
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
    track("contact/form-submit", "Sent the contact form"); // only the fact, never the content
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
