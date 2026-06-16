document.addEventListener("DOMContentLoaded", () => {
  const statementImage = document.querySelector(".statement__image img");
  const statementLine = document.querySelector(".statement__line");
  const statementSection = document.querySelector(".statement");
  const worksSection = document.querySelector("#works");
  const worksLabel = worksSection?.querySelector(".panel__content");
  const worksGrid = worksSection?.querySelector(".grid");
  let worksRaf = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const getTranslateX = element => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 0;
    const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
    if (matrixMatch) {
      const values = matrixMatch[1].split(",").map(value => parseFloat(value));
      return values[4] || 0;
    }
    const matrix3dMatch = transform.match(/matrix3d\(([^)]+)\)/);
    if (matrix3dMatch) {
      const values = matrix3dMatch[1]
        .split(",")
        .map(value => parseFloat(value));
      return values[12] || 0;
    }
    return 0;
  };
  const getContentBounds = element => {
    const rect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    return {
      left: rect.left + paddingLeft,
      right: rect.right - paddingRight,
      width: rect.width - paddingLeft - paddingRight
    };
  };

  const getContainedImageBox = img => {
    const rect = img.getBoundingClientRect();
    if (!img.naturalWidth || !img.naturalHeight || !rect.width || !rect.height) {
      return rect;
    }
    const scale = Math.min(
      rect.width / img.naturalWidth,
      rect.height / img.naturalHeight
    );
    const drawnWidth = img.naturalWidth * scale;
    const drawnHeight = img.naturalHeight * scale;
    return {
      left: rect.left,
      top: rect.top + (rect.height - drawnHeight) / 2,
      width: drawnWidth,
      height: drawnHeight
    };
  };

  const updateWorksAlignment = () => {
    if (
      !statementImage ||
      !statementLine ||
      !statementSection ||
      !worksSection ||
      !worksLabel ||
      !worksGrid
    ) {
      return;
    }
    const isDesktop = window.matchMedia("(min-width: 801px)").matches;
    if (!isDesktop) {
      worksSection.style.removeProperty("--works-label-offset");
      worksSection.style.removeProperty("--works-grid-offset");
      statementSection.style.removeProperty("--statement-image-offset");
      return;
    }

    const imageBox = getContainedImageBox(statementImage);
    const labelRect = worksLabel.getBoundingClientRect();
    const currentLabelOffset = getTranslateX(worksLabel);
    if (!imageBox.width || !labelRect.width) return;

    const imageCenter = imageBox.left + imageBox.width / 2;
    const labelCenter = labelRect.left + labelRect.width / 2;
    const unshiftedLabelCenter = labelCenter - currentLabelOffset;
    let labelOffset = imageCenter - unshiftedLabelCenter;

    const worksBounds = getContentBounds(worksSection);
    const leftColumnWidth = Math.max(240, worksBounds.width * 0.38);
    const leftColumnRight = worksBounds.left + leftColumnWidth;
    const labelLeft = labelRect.left - currentLabelOffset;
    const labelRight = labelRect.right - currentLabelOffset;
    const labelMin = worksBounds.left - labelLeft;
    const labelMax = leftColumnRight - labelRight;
    labelOffset = clamp(labelOffset, labelMin, labelMax);
    worksSection.style.setProperty(
      "--works-label-offset",
      `${labelOffset.toFixed(1)}px`
    );

    const cards = worksGrid.querySelectorAll(".card");
    const currentGridOffset = getTranslateX(worksGrid);
    const targetRect =
      cards.length > 1
        ? cards[1].getBoundingClientRect()
        : worksGrid.getBoundingClientRect();
    const targetCenter = targetRect.left + targetRect.width / 2;
    const unshiftedTargetCenter = targetCenter - currentGridOffset;
    const lineRect = statementLine.getBoundingClientRect();
    const lineCenter = lineRect.left + lineRect.width / 2;
    let gridOffset = lineCenter - unshiftedTargetCenter;
    const gridRect = worksGrid.getBoundingClientRect();
    const gridLeft = gridRect.left - currentGridOffset;
    const gridRight = gridRect.right - currentGridOffset;
    const gridMin = worksBounds.left - gridLeft;
    const gridMax = worksBounds.right - gridRight;
    gridOffset = clamp(gridOffset, gridMin, gridMax);
    worksSection.style.setProperty(
      "--works-grid-offset",
      `${gridOffset.toFixed(1)}px`
    );

    if (statementSection) {
      statementSection.style.setProperty("--statement-image-offset", "0px");
    }
  };

  const scheduleWorksAlignment = () => {
    if (worksRaf) cancelAnimationFrame(worksRaf);
    worksRaf = requestAnimationFrame(updateWorksAlignment);
  };

  if (statementImage) {
    if (statementImage.complete && statementImage.naturalWidth) {
      scheduleWorksAlignment();
    } else {
      statementImage.addEventListener("load", scheduleWorksAlignment, {
        once: true
      });
    }
  }
  window.addEventListener("resize", scheduleWorksAlignment);
  window.addEventListener("load", scheduleWorksAlignment);

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
});
