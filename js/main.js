const SPECIALIZATIONS = {
  business: ['Accounting', 'Business Administration', 'Human Resource Management', 'Marketing'],
  counseling: ['Clinical Mental Health Counseling', 'School Counseling'],
  education: ['Curriculum and Instruction', 'Educational Leadership', 'Special Education'],
  'health-sciences': ['Health Administration', 'Public Health'],
  nursing: ['RN-to-BSN', 'MSN', 'Doctor of Nursing Practice'],
  psychology: ['Applied Behavior Analysis', 'Clinical Psychology', 'Industrial/Organizational Psychology'],
  technology: ['Information Assurance', 'Information Technology', 'Software Development'],
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initCarousel() {
  const track = document.querySelector('.carousel__track');
  const viewport = document.querySelector('.carousel__viewport');
  const slides = document.querySelectorAll('.carousel__slide');
  const dots = document.querySelectorAll('.carousel__dot');

  if (!track || !viewport || !slides.length || !dots.length) return;

  const lastIndex = slides.length - 1;
  let activeIndex = 0;
  let carouselSeen = false;

  // Mark a slide's card as revealed. The card itself slides in (scroll-driven,
  // see initCardScroll); its inner text does NOT animate, so there are no
  // per-element transitions to reset here any more.
  function revealSlide(slide) {
    if (!slide) return;
    const card = slide.querySelector('.carousel-reveal');
    if (card) card.classList.add('is-visible');
  }

  function getStep() {
    const slide = slides[0];
    if (!slide) return 0;
    const gap = parseFloat(getComputedStyle(track).gap) || 24;
    return slide.offsetWidth + gap;
  }

  function setOffset(px, animate) {
    track.style.transition = animate ? '' : 'none';
    track.style.transform = `translateX(${px}px)`;
  }

  function goTo(index, animate = true) {
    activeIndex = Math.max(0, Math.min(index, lastIndex));
    setOffset(-activeIndex * getStep(), animate);

    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle('carousel__slide--active', slideIndex === activeIndex);
    });

    dots.forEach((button, buttonIndex) => {
      const isActive = buttonIndex === activeIndex;
      button.classList.toggle('carousel__dot--active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    // Re-animate the card text on real navigation (not the initial/resize
    // layout calls, which pass animate=false), once the carousel is in view.
    if (animate && carouselSeen) revealSlide(slides[activeIndex]);
  }

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => goTo(index));
  });

  // --- Drag / swipe to scroll ---
  let dragging = false;
  let horizontal = null; // null = undecided, true/false once intent is known
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let baseOffset = 0;
  let delta = 0;
  let moved = false;

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    horizontal = null;
    moved = false;
    delta = 0;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    baseOffset = -activeIndex * getStep();
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      horizontal = Math.abs(dx) > Math.abs(dy);
      if (horizontal) {
        viewport.setPointerCapture(pointerId);
        track.classList.add('is-dragging');
      } else {
        dragging = false; // vertical intent -> let the page scroll
        return;
      }
    }

    delta = dx;
    if (Math.abs(dx) > 4) moved = true;

    const min = -lastIndex * getStep();
    let offset = baseOffset + dx;
    if (offset > 0) offset *= 0.35; // rubber-band past the first slide
    else if (offset < min) offset = min + (offset - min) * 0.35; // past the last
    setOffset(offset, false);
    event.preventDefault();
  }

  function endDrag(event) {
    if (!dragging || (pointerId !== null && event.pointerId !== pointerId)) return;
    dragging = false;
    track.classList.remove('is-dragging');

    if (horizontal) {
      const threshold = Math.min(getStep() * 0.2, 80);
      if (delta <= -threshold) goTo(activeIndex + 1);
      else if (delta >= threshold) goTo(activeIndex - 1);
      else goTo(activeIndex);
    }
    pointerId = null;
  }

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // Suppress the click that follows a real drag (so links/buttons don't fire).
  viewport.addEventListener(
    'click',
    (event) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }
    },
    true
  );

  // Native image drag-ghost gets in the way of pointer dragging.
  viewport.querySelectorAll('img').forEach((img) => {
    img.addEventListener('dragstart', (event) => event.preventDefault());
  });

  // Keyboard support.
  viewport.setAttribute('tabindex', '0');
  viewport.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      goTo(activeIndex + 1);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      goTo(activeIndex - 1);
      event.preventDefault();
    }
  });

  window.addEventListener('resize', () => goTo(activeIndex, false));

  goTo(0, false);

  // Slide the active card in from the right the first time the carousel scrolls
  // into view. Reduced-motion users get it shown immediately (CSS keeps it
  // visible). Cards start hidden (opacity 0), so a safety timeout reveals the
  // active card even if the observer never fires — the card must never get
  // stuck invisible.
  if (prefersReducedMotion) {
    carouselSeen = true;
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          carouselSeen = true;
          revealSlide(slides[activeIndex]);
          revealObserver.disconnect();
        });
      },
      { threshold: 0.25 }
    );
    revealObserver.observe(viewport);

    window.setTimeout(() => {
      if (!carouselSeen) {
        carouselSeen = true;
        revealSlide(slides[activeIndex]);
      }
    }, 2500);
  }
}

function initProgramFinder() {
  const section = document.querySelector('.program-finder');
  const chips = document.querySelectorAll('.program-finder__chips .chip');
  const panel = document.getElementById('program-finder-panel');
  const areaSelect = document.getElementById('area-of-study');
  const specSelect = document.getElementById('specialization');

  if (!section || !chips.length || !panel || !areaSelect || !specSelect) return;

  function resetSpecialization() {
    specSelect.innerHTML = '<option value="">Specialization</option>';
    specSelect.disabled = true;
    specSelect.value = '';
  }

  function populateSpecializations(area) {
    resetSpecialization();
    const options = SPECIALIZATIONS[area];
    if (!options) return;

    options.forEach((label) => {
      const option = document.createElement('option');
      option.value = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      option.textContent = label;
      specSelect.appendChild(option);
    });
    specSelect.disabled = false;
  }

  function openPanel(chip) {
    chips.forEach((button) => {
      const isActive = button === chip;
      button.classList.toggle('chip--active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    panel.hidden = false;
    section.classList.add('program-finder--expanded');
    areaSelect.focus();
  }

  function closePanel() {
    chips.forEach((button) => {
      button.classList.remove('chip--active');
      button.setAttribute('aria-selected', 'false');
    });
    panel.hidden = true;
    section.classList.remove('program-finder--expanded');
    areaSelect.value = '';
    resetSpecialization();
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const isActive = chip.classList.contains('chip--active');
      const isExpanded = !panel.hidden;

      if (isActive && isExpanded) {
        closePanel();
        return;
      }

      openPanel(chip);
    });
  });

  areaSelect.addEventListener('change', () => {
    if (areaSelect.value) {
      populateSpecializations(areaSelect.value);
      return;
    }
    resetSpecialization();
  });
}

function initRevealAnimations() {
  if (prefersReducedMotion) {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const delay = Number(entry.target.dataset.revealDelay || 0) * 80;
        window.setTimeout(() => {
          entry.target.classList.add('is-visible');
        }, delay);

        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  reveals.forEach((el) => observer.observe(el));
}

// Headings that get the masked, word-by-word rise-in-on-scroll effect.
// Deliberately short: the tiles, accreditation, action-CTA, program-finder
// ("Catch what you're chasing") and carousel headings were all removed from
// this list by request — add back only if asked.
const TEXT_REVEAL_SELECTORS = [
  '.hero__title',
  '.stats-section__title',
];

// Wrap every word of an element in a clip-masked span so it can slide up from
// behind its own line box. Preserves <br> line breaks and inter-word spacing.
function splitWords(el) {
  const fragment = document.createDocumentFragment();
  let wordIndex = 0;

  const pushWord = (text) => {
    const word = document.createElement('span');
    word.className = 'word';
    const inner = document.createElement('span');
    inner.className = 'word__inner';
    inner.textContent = text;
    inner.style.setProperty('--word-index', String(wordIndex));
    word.appendChild(inner);
    fragment.appendChild(word);
    wordIndex += 1;
  };

  Array.from(el.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = node.textContent.split(/(\s+)/);
      parts.forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(' '));
        } else {
          pushWord(part);
        }
      });
    } else if (node.nodeName === 'BR') {
      fragment.appendChild(node.cloneNode());
    } else {
      // Unknown inline element — keep it intact so nothing is lost.
      fragment.appendChild(node.cloneNode(true));
    }
  });

  el.textContent = '';
  el.appendChild(fragment);
  el.classList.add('reveal-text');
}

function initTextReveal() {
  const targets = document.querySelectorAll(TEXT_REVEAL_SELECTORS.join(','));
  if (!targets.length) return;

  if (prefersReducedMotion) {
    targets.forEach((el) => el.classList.add('reveal-text', 'is-visible'));
    return;
  }

  targets.forEach((el) => splitWords(el));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.2, rootMargin: '0px 0px -10% 0px' }
  );

  targets.forEach((el) => observer.observe(el));
}

// Browser-accurate cubic-bezier easing solver (Newton-Raphson + bisection fallback).
function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x) => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const dx = sampleX(t);
      if (Math.abs(dx - x) < 1e-6) break;
      if (x > dx) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveX(t)));
}

function initCountUp() {
  const els = document.querySelectorAll('.stats-section__value');
  if (!els.length) return;

  const ease = cubicBezier(0.1, 1, 0.1, 1);

  const items = Array.from(els).map((el) => {
    const raw = el.textContent.trim();
    const match = raw.match(/[\d,]*\.?\d+/);
    const numStr = match ? match[0] : '0';
    const start = match ? match.index : 0;
    const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
    return {
      el,
      raw,
      prefix: raw.slice(0, start),
      suffix: raw.slice(start + numStr.length),
      target: parseFloat(numStr.replace(/,/g, '')) || 0,
      grouped: numStr.includes(',') || decimals > 0,
      decimals,
      duration: Number(el.dataset.countDuration) || 1900,
      startTime: 0,
    };
  });

  const format = (item, value) =>
    `${item.prefix}${
      item.grouped
        ? value.toLocaleString('en-US', {
            minimumFractionDigits: item.decimals,
            maximumFractionDigits: item.decimals,
          })
        : String(Math.round(value))
    }${item.suffix}`;

  if (prefersReducedMotion) return;

  items.forEach((item) => {
    item.el.textContent = format(item, 0);
  });

  // One shared rAF loop drives every active counter (write-only, no layout reads).
  const active = new Set();
  let rafId = null;

  const tick = (now) => {
    active.forEach((item) => {
      if (!item.startTime) item.startTime = now;
      const progress = Math.min((now - item.startTime) / item.duration, 1);
      item.el.textContent =
        progress >= 1 ? item.raw : format(item, item.target * ease(progress));
      if (progress >= 1) active.delete(item);
    });
    rafId = active.size ? requestAnimationFrame(tick) : null;
  };

  const start = (item) => {
    active.add(item);
    if (rafId === null) rafId = requestAnimationFrame(tick);
  };

  // Single observer auto-handles each target; cascade them for an elegant stagger.
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const item = items.find((it) => it.el === entry.target);
        observer.unobserve(entry.target);
        if (item) window.setTimeout(() => start(item), items.indexOf(item) * 130);
      });
    },
    { threshold: 0.4 }
  );

  items.forEach((item) => observer.observe(item.el));
}

function initParallax() {
  if (prefersReducedMotion) return;

  const band = document.querySelector('.content-band');
  const img = document.querySelector('.content-band__bg-image');
  if (!band || !img) return;

  let ticking = false;

  const update = () => {
    ticking = false;
    const rect = band.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.bottom < 0 || rect.top > vh) return; // off-screen, skip work

    // progress goes -1 → 1 as the band transits from bottom to top of viewport.
    const t = (vh - rect.top) / (vh + rect.height);
    const progress = Math.min(Math.max(t, 0), 1) * 2 - 1;
    // Amplitude stays under the 8% CSS overshoot so no edge is ever exposed.
    const shift = -progress * rect.height * 0.06;
    img.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0)`;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

// Subtle parallax on the hero's red wall only — the people layer stays put.
function initHeroParallax() {
  if (prefersReducedMotion) return;

  const hero = document.querySelector('.hero');
  const red = document.querySelector('.hero__bg-red');
  if (!hero || !red) return;

  let ticking = false;

  const update = () => {
    ticking = false;
    const rect = hero.getBoundingClientRect();
    if (rect.bottom < 0) return; // hero fully scrolled past — skip work

    // Driven straight off scroll position (the hero is the first section) so the
    // wall starts drifting from the very first pixel of scroll — not only after
    // the hero clears the ~128px sticky header, which read as "no parallax".
    const scrolled = window.scrollY || window.pageYOffset || 0;
    // The wall drifts down as you scroll, lagging the page for depth. Capped at
    // 70px — comfortably inside the scale(1.5) overshoot so no wall edge is ever
    // exposed (mobile's 360px hero is the worst case, see .hero__bg-red). Uses
    // the `translate` property so it composes with (doesn't clobber) the CSS
    // `transform: scale()` on .hero__bg-red.
    const shift = Math.min(scrolled * 0.25, 70);
    red.style.translate = `0 ${shift.toFixed(2)}px`;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

// Scroll-driven slide-in for the featured-story cards: the card's horizontal
// offset tracks how far the carousel has scrolled up the viewport, so it scrubs
// in from the right as you scroll (not a fixed-duration transition). Spread over
// a large scroll range so it's slow. The inner text keeps its own triggered
// stagger (see the reveal in initCarousel).
function initCardScroll() {
  if (prefersReducedMotion) return; // cards sit in place (no inline translate)

  const carousel = document.querySelector('.carousel');
  const cards = document.querySelectorAll('.carousel__card');
  if (!carousel || !cards.length) return;

  const START_OFFSET = 45; // % of card width — where the card starts, off-right

  // Ratchet: once the card has slid in this far, never let it slide back out
  // again on an upward scroll. Only forward (scrolling down) progress counts.
  let revealed = START_OFFSET;

  let ticking = false;
  const update = () => {
    ticking = false;
    const rect = carousel.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;

    let x;
    if (rect.top >= vh) {
      x = START_OFFSET; // still below the fold — parked off to the right
    } else if (rect.bottom <= 0) {
      x = 0; // scrolled well past — settled
    } else {
      // 0 when the carousel top is at the bottom of the viewport, 1 once it has
      // risen ~90% of a viewport height. The wide range makes the slide slow.
      const e = Math.min(Math.max((vh - rect.top) / (vh * 0.9), 0), 1);
      x = (1 - e) * START_OFFSET;
    }
    revealed = Math.min(revealed, x); // ratchet: only ever move toward 0
    const value = `${revealed.toFixed(2)}% 0`;
    cards.forEach((c) => {
      c.style.translate = value;
    });
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

// Scroll-driven upward parallax for hero content and program-finder: as you
// scroll down, these sections move up, layering above the people. The offset
// tracks how far each element has scrolled up the viewport.
function initContentParallax() {
  if (prefersReducedMotion) return;

  const heroContent = document.querySelector('.hero__content');
  const programFinder = document.querySelector('.program-finder');
  if (!heroContent && !programFinder) return;

  // Drive both off window.scrollY, NOT off each element's viewport position.
  // Deriving the offset from `vh - rect.top` is non-zero the moment an element
  // is on screen, so at scrollY 0 the hero content started ~100px above its
  // laid-out position — the headline rode up off the torsos and the button
  // covered the faces. Keyed to scrollY, both sit exactly where they're laid
  // out at the top of the page and only drift as you actually scroll.
  const HERO_FACTOR = 0.4; // hero text floats up ~twice as fast as the page
  const HERO_MAX = 260;
  const FINDER_FACTOR = 0.2;
  const FINDER_MAX = 120;

  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY || document.documentElement.scrollTop || 0;

    if (heroContent) {
      // The hero has `overflow: hidden`, so cap the travel at the content's own
      // laid-out distance from the hero's top edge (less a little breathing
      // room). Without this the headline clips against the hero's top on short
      // heroes — the mobile hero only leaves ~110px of room, versus ~290 on
      // desktop. offsetTop is a layout value, so `translate` doesn't skew it.
      const room = Math.max(0, heroContent.offsetTop - 16);
      const offset = Math.min(y * HERO_FACTOR, room, HERO_MAX);
      heroContent.style.translate = `0 ${-offset.toFixed(2)}px`;
    }

    if (programFinder) {
      const offset = Math.min(y * FINDER_FACTOR, FINDER_MAX);
      programFinder.style.translate = `0 ${-offset.toFixed(2)}px`;
    }
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

function initNavScroll() {
  const nav = document.querySelector('.main-nav');
  if (!nav) return;

  // Hysteresis (enter above 40px, exit below 16px) so hovering near a single
  // threshold — trackpad momentum, rubber-banding — can't flicker the class
  // on/off. The CSS transition on .main-nav / .main-nav__bar smooths the
  // height change itself; this stops it from being retriggered rapidly.
  let ticking = false;
  const update = () => {
    ticking = false;
    const scrolled = nav.classList.contains('main-nav--scrolled');
    if (!scrolled && window.scrollY > 40) {
      nav.classList.add('main-nav--scrolled');
    } else if (scrolled && window.scrollY < 16) {
      nav.classList.remove('main-nav--scrolled');
    }
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initMobileNav() {
  const button = document.querySelector('.main-nav__menu-btn');
  const panel = document.getElementById('mobile-nav-panel');
  if (!button || !panel) return;

  button.addEventListener('click', () => {
    const isOpen = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!isOpen));
    button.setAttribute('aria-label', isOpen ? 'Open menu' : 'Close menu');
    panel.hidden = isOpen;
  });

  panel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Open menu');
      panel.hidden = true;
    });
  });
}

// Lazy-load the CTA background videos: with preload="none" + no autoplay
// attribute, nothing downloads until we call play() as the section nears the
// viewport. Pause when it leaves to save CPU/battery. Reduced-motion users
// never load them (the CSS shows a static image instead). Hidden videos
// (the 2nd/3rd on mobile) are skipped, so only what's on screen downloads.
function initCtaVideos() {
  const section = document.querySelector('.action-cta');
  if (!section) return;

  const videos = [...section.querySelectorAll('.action-cta__video')];
  if (!videos.length || prefersReducedMotion) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        videos.forEach((video) => {
          if (video.offsetParent === null) return; // display:none (e.g. mobile)
          if (entry.isIntersecting) {
            if (video.paused) video.play().catch(() => {});
          } else if (!video.paused) {
            video.pause();
          }
        });
      });
    },
    { rootMargin: '200px 0px', threshold: 0.01 }
  );

  observer.observe(section);
}

document.addEventListener('DOMContentLoaded', () => {
  initCarousel();
  initProgramFinder();
  initTextReveal();
  initRevealAnimations();
  initCountUp();
  initParallax();
  initHeroParallax();
  initCardScroll();
  initContentParallax();
  initNavScroll();
  initMobileNav();
  initCtaVideos();
});
