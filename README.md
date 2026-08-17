# Capella University Homepage (v2)

Vanilla HTML, CSS, and JavaScript implementation of the Capella University
homepage from Figma. No framework, no CSS preprocessor — Vite is used only as
the dev server and bundler.

This is the **second version** of the homepage. See
[`HANDOFF.md`](HANDOFF.md) for what changed from v1 and for the engineering
detail behind everything below, and [`DEBUGGING.md`](DEBUGGING.md) when
something looks broken — it is a symptom-first runbook covering the traps this
codebase has already hit.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

To build for production:

```bash
npm run build
```

```bash
npm run preview
```

## Project structure

```
index.html         # Page markup (single page)
css/
  tokens.css       # Design tokens — colors, type scale, spacing, motion,
                   #   nav interaction states
  styles.css       # All styles (mobile-first, @imports tokens.css)
js/
  main.js          # Carousel, program finder, and all scroll/reveal animations
public/assets/     # Committed image assets (SVG / PNG / JPG / WebP)
  videos/          # CTA band background clip — 3 encodes, each MP4 + WebM
HANDOFF.md         # Engineering handoff: gotchas, breakpoints, asset contracts
```

`js/main.js` is a set of small `init*` functions, all called on
`DOMContentLoaded`. The motion ones bail early on `prefers-reduced-motion`; the
navigation and form ones always run, since they're behaviour rather than
animation:

| Function | Responsibility |
| --- | --- |
| `initCarousel` | Featured-story carousel — dots, swipe, keyboard, card reveal |
| `initProgramFinder` | Degree-level chips + dependent Area/Specialization selects |
| `initRevealAnimations` / `initTextReveal` | Fade-up on scroll; per-word masked heading reveal |
| `initCountUp` | Stat numbers counting up |
| `initParallax` / `initHeroParallax` / `initContentParallax` / `initCardScroll` | Scroll-driven motion (content band, hero red wall, hero + program-finder drift, carousel card slide-in) |
| `initNavScroll` / `initMobileNav` | Sticky-nav shrink; hamburger panel |
| `initMegaMenu` / `initMobileMenuTree` | Desktop dropdown positioning; the mobile panel's nested menus |
| `initCtaVideos` | Background video in the CTA band — encode tier, lazy-load, pause offscreen |
| `initFooterPartners` | Footer brand carousel — manual arrows, paging by a whole view |

## Assets

**All assets are committed under `public/assets/` and referenced as
`/assets/…`.** They are not fetched from Figma at runtime — an earlier version
of this project used Figma MCP asset URLs, which expire after ~7 days.

Two asset contracts are load-bearing and documented in `HANDOFF.md` §3 — read it
before replacing them:

- **`hero-red.webp` + `hero-people.webp`** — the hero is split into two layers so
  the red wall can parallax while the people stay still.
- **`carousel-portrait-faculty.webp`** — a pre-cut transparent portrait sized to
  the carousel card, and intentionally *taller* than the card because the figure
  breaks out above its top edge.
- **`wnba-capella-lockup*.webp`** — the partnership card's artwork. The logos,
  the divider rule *and* the "official higher learning partner" line are all
  baked into one image, so the `alt` text is the only accessible copy of that
  line. Two crops (wide / stacked), picked by a `<picture>` `media` query.

## Design source

- [Figma — Hi-fi Review](https://www.figma.com/design/6tdLZrCAiMSii7sMAUrRDs/Hi-fi---Review?node-id=5647-5140)
  — the homepage overall.
- [Figma — Card Update](https://www.figma.com/design/vkdlGCLzDrSK1crS3ZtT5A/Card-Update?node-id=6-194)
  — the featured-story cards (v2 rebuilt these against this file). The WNBA
  partnership card is
  [`55-62`](https://www.figma.com/design/vkdlGCLzDrSK1crS3ZtT5A/Card-Update?node-id=55-62)
  (desktop + mobile in one frame).
- **Jake's page updates** —
  [Figma — UI Elements for Homepage Proto](https://www.figma.com/design/h3IvZdQj2uH5bm7JPUD89a/UI-Elements-for-Homepage-Proto?node-id=50-21184)
  — the nav dropdown and its activated state, button and chip states, the closing
  CTA, and the mobile bottom bar / chat launcher.

## Browser notes

- Layout is mobile-first; the wide carousel layout takes over at `≥1024px` and
  the desktop hero at `≥1200px`.
- Every animation has a `prefers-reduced-motion: reduce` fallback.
