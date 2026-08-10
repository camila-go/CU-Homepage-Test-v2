# Developer Handoff — Capella University Homepage (v2)

Engineering notes for anyone picking up this build. Covers the toolchain, the
animation system, responsive behavior, accessibility, asset handling, and the
edge cases / gotchas that aren't obvious from the code alone.

> See also: [`README.md`](README.md) for the quick-start.

**This is the second version of the homepage**, living at
[`camila-go/CU-Homepage-Test-v2`](https://github.com/camila-go/CU-Homepage-Test-v2).
What changed from v1, and where the details are:

| Area | Change | §  |
| --- | --- | --- |
| Featured-story cards | Rebuilt to the **Card Update** Figma (`1440 × 600`, new copy and people, Figma-variable type scale, portraits that break out above the card) | §3, §6 |
| Hero | Two-layer red-wall parallax + ambient drift; `initContentParallax` rewritten to be scroll-keyed so the headline no longer rides up over the faces | §3a, §7 |
| Carousel motion | Scroll-driven, ratcheted card slide-in + staggered card text | §7 |
| Nav | Rounded pill hover with full press / keyboard-focus states; scroll shrink now uses hysteresis | §5 |
| Assets | Carousel portraits re-cut as transparent WebP (2.5 MB of PNGs → 136 KB); hero split into WebP layers | §3 |

---

## 1. Stack & tooling

| Thing | Detail |
| --- | --- |
| Build tool | [Vite 6](https://vitejs.dev) (`vite`, `vite build`, `vite preview`) |
| Language | Vanilla HTML + CSS + ES modules. **No framework, no CSS preprocessor.** |
| JS deps | None used at runtime. `vanilla-tilt` is still in `package.json` but **no longer imported** (the 3D tilt was removed — popular-program cards now use a CSS-only hover scale). Safe to `npm uninstall vanilla-tilt`. |
| Icons | Font Awesome Kit loaded via `<script src="https://kit.fontawesome.com/...">` in `<head>` |
| Fonts | Adobe Typekit (`acumin-pro-extra-condensed`, `acumin-pro`) + Google Fonts (`Inter`) |
| Dev server | `npm run dev` → http://localhost:5173 |

```bash
npm install
npm run dev      # local dev w/ HMR
npm run build    # production build → dist/
npm run preview  # serve the production build
```

`vite.config.js` is intentionally minimal (`root: '.'`). If this is ever
deployed under a sub-path (e.g. GitHub Pages project site), set `base` in
`vite.config.js` **and** note the absolute `/assets/...` paths below.

---

## 2. Project structure

```
index.html        # All page markup (single page)
css/
  tokens.css      # Design tokens (colors, type scale, spacing, easings) — imported first
  styles.css      # All component styles, mobile-first with desktop overrides
js/
  main.js         # All interactivity + animations (init* functions)
public/
  assets/         # Images, SVGs (served from /assets/... at runtime)
```

- `public/` is Vite's static dir, so files there are referenced with an
  **absolute path** (`/assets/hero.png`), not a relative one. Don't "fix" these
  to `./assets/...` — that will break the production build.
- `css/tokens.css` is `@import`-ed at the top of `styles.css`. All design
  primitives (color, type scale, radii, durations, easing curves) live there.
  Prefer adding/modifying tokens over hard-coded values.

---

## 3. Assets — read before touching images

### 3a. Hero is two layers (for the red-only parallax)

The hero background is split so the red wall can parallax independently of the
people (who must stay put — see §5 / §7 `initHeroParallax`):

- **`hero-red.webp`** — the wall, reconstructed from `hero.png` with the people
  removed. Sits at the back; this is the layer that moves. `.hero__bg-red`
  scales it up (`scale(1.5)`) for parallax overshoot room.
- **`hero-people.webp`** — a transparent cutout of the five people. Sits on top,
  never moves; keeps the balance transform (`scale(1.07) translateX(-2.6%)`,
  §5). `fetchpriority="high"` (it's the LCP subject).
- **`hero.png`** (6.3 MB) is kept only as the **regeneration source** — it is no
  longer referenced at runtime. `.hero__background` has a `background-color`
  (wall red) so the hero never flashes black before the layers paint.

⚠️ **Don't add a mobile override for the people layer's size.** `object-fit:
cover` is already right at portrait aspect ratios — at 375×360 it renders the
2.11:1 source 759px wide, putting the group at ~94% of the hero width with the
heads ~17% down and the legs cropped at the hero's bottom edge, which is the
Figma mobile composition. If the mobile hero ever looks wrong, check
`initContentParallax` (§7) **first**: when it displaces `.hero__content` at
rest, the headline rides up off the torsos and the CTA lands on the faces, which
reads as "the people are wrong" when the art is actually fine. Sizing the layer
to a fixed percentage to compensate makes the people smaller than the design.

⚠️ **The wall reconstruction must preserve real texture in the margins, not
just patch the gap.** A first attempt filled the people-shaped gap, then blurred
the *entire* canvas to hide the seam — which also blurred the margins (the only
area actually visible beside the people), leaving a flat, textureless field. The
parallax was technically running but **invisible**, because a human eye can't
perceive vertical motion in a near-uniform color. Fixed pipeline:
1. `rembg` (`u2net_human_seg`) for the people cutout.
2. Fit a smooth quadratic gradient (least-squares, not per-row interpolation —
   per-row leaves visible horizontal banding, and a local blur-diffusion fill
   leaves a faint ghost of the silhouette) to the known wall pixels, for the
   *gap's* base color/vignette only.
3. Sample real grain/mottling from a people-free strip of the original wall and
   tile it down the canvas, add to the gap's base color.
4. Composite: **keep the original pixels everywhere outside the gap** (mask
   feathered a few px at the edge) — only the actual gap is synthetic. This is
   what keeps the margins' real texture intact.

Regenerating (if the source art changes): re-run this pipeline against
`hero.png`, then re-export both layers as WebP (`hero-people` PNG 3 MB → ~200 KB;
`hero-red` → ~145 KB). The throwaway scripts lived in `/tmp`. After
regenerating, sanity-check texture is visible in the margins (not just the
gap) — e.g. crop a clearly-people-free region and eyeball it; a flat/smooth
result there means the parallax will be invisible again.

- **Cache-busting query strings:** Some `<img src>` values carry `?v=N`. These
  were bumped each time an asset on disk was replaced to defeat browser/Vite
  caching. If you replace one of these images, **bump the number**.
- **Carousel portraits are transparent WebP, cut at the exact card scale, and
  are TALLER than the card on purpose.** `carousel-portrait-alumni.webp`
  (720×**641**, Dr. Compton Moore) and `carousel-portrait-faculty.webp`
  (786×**628**, Lisa Kraeger) were extracted from the Card Update Figma render
  at 1:1 with the 1440×600 card, with the panel background keyed out. The extra
  height is the part of each person that **breaks out above the card's top
  edge** — 41px alumni, 28px faculty — so the CSS positions them at a negative
  `top` and the card keeps `overflow: visible`. The phone on the student slide
  does the same (41px). Do not "fix" the overflow or re-crop these to 600.
  Because they are already card-scale, the desktop CSS drops them in at
  `left: 0` with `object-fit: fill` and **no** cropping or `object-position`
  tricks. They must stay truly transparent; a gray or black box behind a
  portrait means the asset was flattened on export, not a CSS bug.
  These are 1× extractions from the Figma render (the Figma MCP's
  `get_design_context`, which serves the original asset URLs, was erroring); for
  production, re-export the originals from Figma at 2× and keep the same pixel
  dimensions doubled.
- **Asset aspect ratios are tuned to their CSS slots.** The carousel portrait
  crops rely on each asset's ratio being close to its slot ratio (so
  `object-position: bottom` doesn't clip heads, and the alumni `object-fit: fill`
  doesn't visibly warp). Swapping in an asset with a very different aspect ratio
  will reintroduce warping/clipping — re-check the carousel at all breakpoints.
- **Figma-sourced assets expire.** Original art was pulled via Figma MCP URLs
  that expire (~7 days). The committed copies in `public/assets/` are the source
  of truth now; don't expect the Figma URLs to still resolve.
- **CTA background videos:** the closing "what are you waiting for?" section
  plays three looping clips (`public/assets/videos/{leftLady,middleMan,rightLady}_loop.{webm,mp4}`)
  — see §12. The static `cta-people.png` (desktop) and `cta-mobile.jpg` (mobile)
  are now used **only** as the reduced-motion fallback (loaded via CSS
  `background-image` scoped to the reduced-motion media query). `cta-mobile`
  was recompressed PNG→JPEG (928 KB → 140 KB). The old per-person `cta-1/2/3.png`
  are unused legacy art (safe to delete).

---

## 4. Responsive breakpoints

Mobile-first base styles, with these override breakpoints (see `styles.css`):

| Breakpoint | Purpose |
| --- | --- |
| `max-width: 768px` | Mobile layout: stacked nav + mobile header, sticky utility bar, mobile type sizes, mobile carousel coordinates, **program-finder top stacks (title above chips)** |
| `max-width: 640px` | Phone: program-finder chips become a **2×2 grid** (`minmax(0,1fr) minmax(0,1fr)` — plain `1fr` won't shrink below the chips' content width and overflows; reduced chip `padding-inline` so labels fit), stats grid single-column |
| `max-width: 1023px` | **Phone/tablet carousel layout** (fixed `294 × 583` aspect card, absolutely-positioned elements scaled via container query) |
| `max-width: 1024px` | Tablet: hamburger nav, **program-finder top is the row layout** (title beside 2×2 chips) |
| `min-width: 641px and max-width: 1199px` | **Tablet/large-phone hero**: floor raised to **520px** (capped `--hero-height-tablet-max` = 640) — the headline is ~98px here, so a short hero would let it ride onto the faces; the 520 floor keeps it on the torsos (finder scrolls below the fold on short viewports, like mobile) |
| `min-width: 1024px` | **Wide carousel layout** (`1440 × 600` card; the portraits and the phone overflow above the card top) |
| `min-width: 1200px` | Desktop refinements: hero capped at **755px** (`--hero-height`, Figma) + 4-across program-finder chips, content-band bg crop, etc. |
| `max-width: 1280px` / `min-width: 1920px` | `--page-gutter` adjustments only (in `tokens.css`) |

⚠️ **The 1023 / 1024 boundary is load-bearing for the carousel.** The phone and
wide carousel layouts are mutually exclusive and split exactly here. If you
shift this boundary, audit both carousel layouts — they use different
positioning systems (see §6).

---

## 5. Sticky header — edge cases

Two stacked sticky elements, on **both** mobile and desktop:

- `.utility-bar` → `position: sticky; top: 0; z-index: 101;` (height **40px**)
- `.main-nav` → `position: sticky; top: 40px; z-index: 100;`

The `top: 40px` on the nav is intentional — it pins the nav directly **below**
the 40px utility bar so both stay visible while scrolling. If you change the
utility bar height, **update the nav's `top` to match** (base rule + the
`≤768px` override both set this).

**Nav height = `.main-nav__bar` `min-height` (no vertical padding).** Per Figma
the global nav is **90px** (desktop, content 88), **72px** tablet, **67px**
mobile. The bar carries **no top/bottom padding** — content is centered by the
`min-height`, which alone sets the height (`88 / 72 / 67`). Don't re-add
`padding-block` to `.main-nav` or `.main-nav__bar`: it stacks on top of the
`min-height` (and the 44px hamburger) and inflated the header to 168px. So the
header total is **~128px** (40 + 88), not 168 — note the hero
`--hero-fold-reserve` values (§5 hero) were tightened ~40px to match the shorter
nav (desktop 360→320, tablet 460→420), so the hero now reaches its 755px cap on
standard desktops (≥~1075px tall) while the program finder stays above the fold.

`initNavScroll()` toggles `.main-nav--scrolled` (shrinks the nav) using
**hysteresis — on above 40px, off below 16px**, not one 24px threshold. A single
threshold made the nav flicker whenever the scroll position hovered on it
(trackpad momentum, rubber-banding), and the height change is transitioned, so
each flip was visible. Keep the two thresholds apart. `z-index: 100/101` on the
header sits above the parallax band (`z-index: 1`) and carousel content — keep
new stacking contexts below 100.

### Nav interaction states

Every interactive element in the header has hover / press / keyboard-focus
feedback, built from tokens in `tokens.css` (`--nav-pill-*`, `--nav-focus-ring`)
so they stay consistent — change the token, not the individual rules.

Specced in the **UI Elements** Figma
([utility bar `2001:2`](https://www.figma.com/design/mqSJTp9qWvsAU8n08FFlk9/UI-Elements-for-Homepage-Proto--Copy-?node-id=2001-2),
[global nav `2001:78`](https://www.figma.com/design/mqSJTp9qWvsAU8n08FFlk9/UI-Elements-for-Homepage-Proto--Copy-?node-id=2001-78)).
⚠️ **The two bars behave differently — don't unify them:**

| Element | Rest | Hover |
| --- | --- | --- |
| Utility links (phone, Log in) | plain | **underline** — *not* a pill |
| Request information | red fill, white text | **inverts**: white fill, `#c10016` text |
| Main nav links | plain | **rounded pill**, 48px tall, white @ 10% |
| Apply now | white fill, dark text | **inverts**: transparent + 2px white ring, white text |

- The main-nav pill is `48px` tall (Figma `gl-size-4xl`) — that's `12px` of
  block padding on a 24px line, not the padding you'd guess from the text.
- Its fill is white at **10%**, sampled from the Figma (the pill renders
  `#373b39` over the `#212322` bar).
- **Apply now's ring is an inset `box-shadow`, not a `border`** — a real border
  would change the button's size on hover and shift the whole bar. Its rule
  also resets `.btn:hover`'s `opacity`, which would otherwise just dim the
  outline once the fill is gone.
- Press adds a stronger fill plus a slight scale-down; `:focus-visible` is a
  white ring everywhere. The logo and hamburger have their own equivalents.
- ⚠️ **The pill's padding replaces the list gap — don't "restore" the gap.**
  `.main-nav__links` went from `gap: 30px` to `gap: 2px` when the links took on
  their own inline padding, which keeps text-to-text spacing at the same 30px
  *without widening the bar*. Adding the gap back overflows the bar at ~1025px.
  The same trick is in the utility bar: `.utility-bar__inner`'s `padding-left`
  is `5px` (not the Figma's 15px) because the links now carry 10px of their own,
  so the **text** still starts at 15px.
- **Inline pill padding is fluid** (`clamp(12px, 1.2vw, 24px)`) on purpose. The
  design's roomy ~26px only fits on a 1440-wide nav; this page's nav is
  narrower (the page gutter caps the container at 1080 on a 1440 viewport), and
  a fixed value overflows at ~1025px — the tightest width where the links are
  still shown rather than the hamburger.
- `.main-nav__links a` is `inline-flex` on purpose: `transform` is ignored on
  inline non-replaced boxes, so the press state would silently do nothing.
- The mobile hamburger is a bare icon at rest but keeps `border-radius: 50%`,
  so its hover / press / open fills render as a circle rather than a square.
- Press feedback (the only motion) is disabled under `prefers-reduced-motion`;
  hover and focus colours still apply so nothing loses its affordance.

### Hero height is "fill the fold" (keeps the program finder above the fold)

The hero's `min-height` is **not** a fixed value — it's
`max(<floor>, min(<cap>, calc(100svh - var(--hero-fold-reserve))))`. The hero
fills the viewport minus the sticky header above it and the program-finder top
row below it, so the program finder is always above the fold. `--hero-fold-reserve`
is tuned per breakpoint (≈ header + program-finder top area). The cap/floor use
the Figma height tokens in `tokens.css`: `--hero-height` (755, desktop ≥1200px
cap), `--hero-height-tablet-max` (640, 769–1199px cap), `--hero-height-mobile`
(360, the `<769px` floor). On the shortest phones the 360 floor pushes the
(4-chip) program finder a few px below the fold — fine on a scrolling mobile
page and matches the design. Uses `svh` so mobile browser chrome doesn't break
it. If you change the header height, re-tune the reserve values (search
`--hero-fold-reserve`); to change the design heights, edit the tokens.

**Image crop is centered (`object-position: center center`) at every width** —
the 5 people are horizontally centered in the source with headroom above, so
centering keeps heads uncropped even on ultra-wide viewports (e.g. 2560px) while
the bottom-anchored headline still lands on the torsos. There are intentionally
**no per-breakpoint `object-position` overrides** — a non-centered crop clipped
heads on wide viewports. If you ever reintroduce one, re-check head-cropping at
2560px-wide and headline-on-faces at the short desktop heights (1920×1000).

> Note: the crop centering + balance transform now live on **`.hero__bg-people`**
> (the cutout layer), not the base `.hero__bg-image`, since the hero is split
> into two layers (§3a). The `.hero__bg-red` wall layer is centered + scaled for
> parallax and has no balance translate.

---

## 6. Carousel — the trickiest component

`initCarousel()` in `main.js`. Pointer-based drag/swipe with snap.

- **Drag vs. scroll intent:** the first few px of a pointer move decide whether
  the gesture is horizontal (carousel drag) or vertical (let the page scroll).
  Don't remove the `Math.abs(dx) > Math.abs(dy)` check or vertical scrolling
  breaks on touch.
- **Click suppression:** a real drag sets `moved`, and a capture-phase `click`
  handler cancels the click so links/buttons inside a slide don't fire after a
  swipe. Keep this if you add interactive elements to slides.
- **Two layout systems, by breakpoint:**
  - **≤1023px:** card is a fixed `294 × 583` aspect box. Children are
    absolutely positioned using a container-query unit:
    `--px: calc(100cqi / 294)`, e.g. `top: calc(284 * var(--px))`. This keeps the
    card from ballooning in height on narrow screens. Coordinates map directly
    to Figma pixel values.
    - **Don't use fluid font scaling for the card body text here** — it was
      capped to a fixed size because large fluid text overflowed the fixed-height
      card.
  - **≥1024px:** card is `1440 × 600` — the card **is** the panel (the old
    `1440 × 642` box with a 42px top inset is gone). `overflow: visible`, so the
    portrait figures intentionally **extend above** the card top.
    - **Content is anchored to exact Figma coordinates**, not flex gaps. Each
      slide's content (`--student` / `--alumni` / `--faculty` modifier on
      `.carousel__content`) absolutely positions its title / body / attribution /
      button at the Figma `y` via the `--px` unit, which avoids vertical drift
      from accumulated line-height. Measured off the Card Update render:

      | | title | body / attribution | button |
      |---|---|---|---|
      | student | 184 | 254 | 346 |
      | alumni | 184 | name 374 · role 412 · disclaimer 469 | — |
      | faculty | 184 | name 337 · role 375 | 463 |

      All three content columns start at `x 758` and are `600` wide (the student
      body alone is `557`, which is what makes it wrap where the design does).
    - **Type scale comes from the Figma file's own variables** — quote `20`
      Inter *italic* / 1.5, body `16`, name `40` Acumin Extra Condensed
      Semibold / 0.9 uppercase, role `16`, disclaimer `12` italic, button `20`
      bold. The quote is **not** the big condensed display face; if it starts
      rendering as large uppercase display type, a `.carousel__title` override
      has crept back in.
    - **Buttons** ("Is FlexPath right for you?", "Full bio") are scaled to the
      Figma `60px` pill (`padding 16/28`, `font 20`, `radius 32`) via `--px` —
      do **not** let them fall back to the unscaled `.btn--lg`, which stretches
      full-width.
    - **Portrait sizing.** The assets are pre-cut at exact card scale, so each
      `.carousel__portrait` is simply `left: 0` at its asset's own dimensions
      with `object-fit: fill` and a **negative `top`** for the overhang (alumni
      `-41`, faculty `-28`). There are no crop slots, scales or
      `object-position` tricks any more — if you find yourself adding one, the
      asset is probably the wrong size. See §3 for the asset contract.
    - **The faculty attribution needs an explicit `width`.** Its children are
      absolutely positioned, so without it they inherit the wrapper's
      shrink-to-fit width (the name) and the two-line role wraps into a narrow
      column.
- **People are bottom-anchored at every width.** Portrait containers pin to the
  card's bottom edge. Below 1024 the images use `object-fit: cover` with
  `object-position: center bottom`; at ≥1024 the pre-cut assets sit 1:1 with
  `object-fit: fill`. If figures float off the bottom after an edit, check these
  two properties.
- `goTo(activeIndex, false)` re-runs on `resize` to recompute the step width.

---

## 7. Animations & microinteractions

All live in `main.js`, initialized on `DOMContentLoaded`. Every one is
**gated on `prefers-reduced-motion`** (see §8).

| Function | What it does | Trigger |
| --- | --- | --- |
| `initTextReveal()` | Splits target headings into per-word spans (`.word` mask + `.word__inner`) that rise up from behind a clip mask, staggered via `--word-index`. | IntersectionObserver (per heading) |
| `initRevealAnimations()` | Fade-up for elements with `.reveal`. Optional stagger via `data-reveal-delay="N"` (× 80ms). | IntersectionObserver |
| Carousel card reveal (in `initCarousel()`) | The whole featured-story card (`.carousel__card.carousel-reveal`) **slides in from the right** + fades (1.8s). Its inner text (title → body/attribution → button) then **staggers in** (fade+rise, 1.5s, delays 0.35/0.55/0.75s), driven by CSS off the card's `.is-visible`. Fires on first scroll-in, then **re-animates on every slide change**. See note below. | IntersectionObserver (first view) + `goTo()` + safety timeout |
| `initCardScroll()` | **Scroll-driven** (scrubbed, not timed) slide-in for the carousel cards: their `translate` tracks the carousel's position in the viewport, spread over ~90% of a viewport height so it's slow. **Ratcheted** — it only ever moves toward settled, so scrolling back up never pushes the cards out again. | `scroll`/`resize`, throttled with `requestAnimationFrame` |
| `initCountUp()` | Animates the stats numbers (40 / 80 / 1,530+ / 63%) counting up with a custom cubic-bezier ease. Preserves prefixes/suffixes/grouping. | IntersectionObserver (threshold 0.4) |
| `initParallax()` | Translates the content-band background image on scroll for depth. | `scroll`/`resize`, throttled with `requestAnimationFrame` |
| `initHeroParallax()` | Subtle parallax on the hero's **red wall only** (`.hero__bg-red`) — the people layer never moves. Driven off `window.scrollY` so it responds from the first scroll pixel; drifts the wall down up to 70px. See §3a + §5. | `scroll`/`resize`, throttled with `requestAnimationFrame` |
| `initContentParallax()` | Drifts `.hero__content` and `.program-finder` up as you scroll, layering them over the hero art. **Driven off `window.scrollY` (factor 0.2, capped 120px), NOT off each element's `getBoundingClientRect().top`** — a viewport-relative formula is already non-zero for anything on screen at load, which shoved the hero headline ~100px above its laid-out position and put the CTA over the faces. Must read 0 at `scrollY === 0`. | `scroll`/`resize`, throttled with `requestAnimationFrame` |
| Hero wall Ken Burns | CSS-only ambient zoom+pan on `.hero__bg-red` only (`@keyframes hero-wall-drift`, 13s alternate) — plays on its own (no scroll), people stay still. Zoom only grows past the base so no edge is exposed. Disabled under reduced-motion. | autoplay |
| Card hover scale | CSS-only `transform: scale(1.02)` on `.stats-section__program:hover` (replaced the removed VanillaTilt 3D tilt — it caused a "jiggle"). Disabled under reduced-motion. | hover |
| Glass shine | CSS-only diagonal sheen sweep on `.glass-card:hover` (`::before`). | hover |

> **Removed:** `initTilt()` / VanillaTilt. The cursor-following 3D tilt on the
> popular-program cards read as a jiggle and was replaced by the CSS hover scale
> above. The dependency is still in `package.json` but unused (§1).

### Text-reveal details / gotchas
- Headings that get the effect are listed in `TEXT_REVEAL_SELECTORS`. To add
  one, append its selector — `splitWords()` preserves `<br>` line breaks and
  inter-word spacing automatically.
- **Carousel titles are intentionally excluded from `splitWords()`** — they
  contain a decorative quote-mark span and live in an absolutely-positioned
  layout, so word-splitting would break them. They still move — they ride along
  with the whole-card **carousel card reveal** below (no per-word splitting).
- `.word` uses `overflow: hidden` with `padding-bottom: 0.12em` +
  `margin-bottom: -0.12em` so the clip mask has room for descenders without
  shifting layout. Keep this if you change heading line-heights.

### Carousel card reveal details / gotchas
- The `.carousel-reveal` class sits on **`.carousel__card`** (the whole card),
  not the individual text elements — the card slides in from the right + fades
  as one unit (content rides along, no per-element stagger).
- **It animates with the `translate` property, not `transform`.** This is
  deliberate: the carousel **track** uses `transform: translateX()` for
  navigation, so a `transform`-based card reveal would clobber it. `translate`
  is a separate property (the alumni portrait already uses `scale:` the same
  way), so the card's `translate: 56px 0 → 0` composes with the track's
  transform instead of fighting it.
- Driven from `initCarousel()` (not the page-wide `initRevealAnimations()`): a
  one-shot IntersectionObserver on `.carousel__viewport` reveals the active card
  on first scroll-in (`carouselSeen`), and `goTo()` re-runs `revealSlide()` on
  every real navigation (dot/swipe/arrow — the `animate=false` init/resize calls
  are skipped). `revealSlide()` resets with `transition: none` before re-adding
  `is-visible` so a revisited card doesn't animate *out* while it slides in.
- **Cards start at `opacity: 0`, so a stuck reveal = an invisible card.** A
  safety `setTimeout` (2.5s) in `initCarousel()` reveals the active card even if
  the observer never fires. Keep it — it's the guard against a blank card.
- **Inner text stagger is CSS-only, keyed off `.carousel__card.is-visible`** (no
  per-element classes) — title/body/attribution/button. Because those elements
  have their own transitions, `revealSlide()` resets THEM too (via `TEXT_SEL`),
  not just the card, so a revisited slide doesn't animate its text *out* first.
  If you add a new text element to a card, add its selector to `TEXT_SEL` and
  the CSS reveal group, or it won't reset cleanly on slide change.
- Reduced motion: a `@media (prefers-reduced-motion: reduce)` block forces
  `.carousel-reveal` visible (opacity 1, no translate/transition); JS sets
  `carouselSeen = true` and skips observing. **Per-slide IntersectionObserver is
  not used** for the reveal — off-screen slides are clipped by the viewport's
  `overflow: hidden`, so the slide-change hook is what makes non-active cards
  animate when you reach them.

### Parallax details / gotchas
- The bg image has built-in **vertical overshoot** (`height: 116%; top: -8%`),
  giving the transform room to move without exposing a band edge.
- JS amplitude (`rect.height * 0.06`) is deliberately **less than** the 8% CSS
  overshoot. If you increase the amplitude, increase the overshoot too or the
  band edge will show.
- **The desk image starts partway down the band, not at the top.** Per Figma the
  "Content Section Background Image" begins ~lower-third of the carousel, so
  `.content-band__bg` is offset (`top: var(--content-bg-top, 26%)`) with a top
  mask fade — the area above stays page-black. Adjust `--content-bg-top` to move
  the desk's start up/down.

---

## 8. Accessibility notes

- **Reduced motion:** `prefers-reduced-motion: reduce` is honored everywhere.
  - JS: each `init*` animation early-returns or jumps to the final state. Text
    reveals render fully visible; counters skip to final values; parallax/tilt
    are disabled.
  - CSS: a `@media (prefers-reduced-motion: reduce)` block neutralizes `.reveal`,
    `.reveal-text .word__inner`, and the glass-card sheen.
  - **When adding any new animation, add both the JS guard and (if CSS-driven) a
    reduced-motion override.** This is a hard requirement for this project.
- **Screen readers & split text:** `splitWords()` keeps real space text nodes
  between words, so headings still read as normal sentences. Don't strip the
  whitespace nodes.
- **Semantics already in place:**
  - Carousel dots are `role="tab"` with `aria-selected`; the viewport is
    keyboard-focusable (`tabindex=0`) with ←/→ arrow support.
  - Program-finder chips are `role="tab"` controlling a `role="tabpanel"` that is
    `hidden` until expanded.
  - Mobile menu button uses `aria-expanded` / `aria-controls`; the panel toggles
    the `hidden` attribute.
  - Decorative images use `alt=""`; meaningful images have descriptive `alt`.
    Decorative background containers use `aria-hidden="true"`.
- **Things to watch / improve:**
  - Focus styles: confirm visible focus rings on all interactive elements
    (links, chips, dots, buttons) before launch — verify against brand styling.
  - Color contrast: the carousel disclaimer / legal copy sits on imagery with a
    gradient scrim; re-check contrast if you change the scrim opacity.
  - The carousel auto-snaps on drag but has **no autoplay** (good for a11y —
    don't add autoplay without a pause control + reduced-motion handling).
  - Headings: keep a single `<h1>` (hero) and logical `<h2>`/`<h3>` order if you
    add sections.

---

## 9. Image / performance optimizations already applied

- **Hero (LCP):** `<link rel="preload" as="image" fetchpriority="high">` in
  `<head>` + `fetchpriority="high"` on the `<img>`.
- **Below-the-fold images:** `loading="lazy"` + `decoding="async"`.
- **Above-the-fold / prominent images** (nav logos, content-band bg): eager but
  `decoding="async"` (the parallax band is kept eager on purpose to avoid
  pop-in during scroll).
- Images with intrinsic `width`/`height` keep them to avoid layout shift (CLS);
  the rest are CSS-sized via `object-fit`.

- **Tile images were downsized.** `tile-finish.png` (was 4096×4096 / 28 MB) and
  `tile-apply.png` (was 3000×2112 / 8.6 MB) rendered in ~380px boxes and loaded
  far slower than the others; they're now ~1000–1200px / ~1.6–1.8 MB, in line
  with the rest. If you re-export these, keep them ≲1200px on the long edge.

### Suggested next steps (not yet done)
- Convert large PNGs (`hero.png`, `content-band-desk.png`, carousel portraits,
  `cta-*.png`) to **WebP/AVIF** with PNG fallback via `<picture>`. These are the
  biggest payloads on the page. (The tiles are now reasonable — see above.)
- Add `srcset`/`sizes` for the hero and CTA art to serve smaller files to phones.
- Self-host fonts (or add `&display=swap` is already set for Inter) and consider
  preloading the primary display font to reduce FOUT on the hero headline.

---

## 10. Browser support & assumptions

Relies on reasonably modern browser features — verify if you must support older
browsers:

- **CSS container queries** (`container-type`, `cqi` unit) — core to the ≤1023px
  carousel. No fallback is provided.
- **CSS `@import`** of `tokens.css`, custom properties, `clamp()`,
  `aspect-ratio`, `object-fit`/`object-position`, `backdrop-filter` (glass UI;
  has `-webkit-` prefix), `inset`.
- **JS:** ES modules, `IntersectionObserver`, Pointer Events, `matchMedia`.
- `backdrop-filter` is the one most likely to degrade — on unsupported browsers
  the glass panels fall back to their semi-transparent background (acceptable).

---

## 11. Quick "where do I change…?" index

| I want to change… | Go to |
| --- | --- |
| Colors, type scale, spacing, easings | `css/tokens.css` |
| A breakpoint's layout | the matching `@media` block in `css/styles.css` (§4) |
| Which headings animate in | `TEXT_REVEAL_SELECTORS` in `js/main.js` |
| Carousel behavior / drag | `initCarousel()` in `js/main.js` |
| Carousel card slide-in (direction / distance / trigger) | `.carousel-reveal` on `.carousel__card` in `index.html`; `.carousel-reveal` rule in `css/styles.css` (`translate: 18% 0`); `revealSlide()` + safety timeout in `initCarousel()` (§7) |
| Stat numbers or count-up speed | the markup values + `data-count-duration` attr (`js/main.js`) |
| Stat number size / overlap | `.stats-section__value` font is `min(clamp(…12.8vw…), 44cqi)`; each `.stats-section__stat` is a container so the value scales to its cell and can't overflow into the next stat |
| Hero height / above-the-fold reserve | `--hero-fold-reserve` + the `min-height` `max(floor, min(cap, …))` on `.hero` (§5) |
| Where the desk background starts | `--content-bg-top` on `.content-band__bg` (§7) |
| Parallax strength | amplitude factor in `initParallax()` + CSS overshoot (§7) |
| Hero red-wall parallax (amount / cap) | `initHeroParallax()` in `js/main.js` (factor `0.25` + 70px cap, driven off `window.scrollY`); overshoot = `scale()` on `.hero__bg-red` — sized for the **shortest** hero across breakpoints (mobile's 360px floor is worst-case for overshoot, not desktop — see §3a) |
| Hero layers / regenerate the cutout + wall | `.hero__bg-red` / `.hero__bg-people` in `index.html` + CSS; regen pipeline in §3a |
| Sticky header offsets | `.utility-bar` / `.main-nav` `top`/`z-index` (§5) |
| Program-finder dropdown options | `SPECIALIZATIONS` map in `js/main.js` |
| "See all Capella programs" button alignment | `.stats-section__cta { align-self }` (right-aligned/flush with cards on desktop) |
| CTA background videos | `.action-cta__video` markup in `index.html` + `initCtaVideos()` in `js/main.js` (§12) |

---

## 12. CTA background videos

The closing "what are you waiting for?" section plays three looping clips
(left lady / middle man / right lady) instead of a static image.

- **Files:** `public/assets/videos/{leftLady,middleMan,rightLady}_loop.{webm,mp4}`.
  Each clip starts and ends on the empty stool so the `loop` is seamless (no
  jump cut). Each `<video>` lists the **WebM source first, MP4 second** — the
  browser picks WebM where supported (Chrome/Firefox/Edge) and falls back to
  MP4 (Safari).
- **Autoplay-as-background:** `muted` + `playsinline` + `loop` (required for
  autoplay, incl. iOS). There is **no `autoplay` attribute** — see lazy-load.
- **Lazy-load (`initCtaVideos()`):** videos use `preload="none"`; an
  IntersectionObserver calls `play()` only when the section is within ~200px of
  the viewport and `pause()`s when it leaves. So the ~2.7 MB of WebM is not
  fetched on initial page load (the section is below the fold). Hidden videos
  are skipped (`offsetParent === null`), so the 2nd/3rd clips never download on
  mobile.
- **Layout:** 3-up grid on desktop; on phones (`≤768px`) only the **first**
  clip is shown full-bleed (`nth-child(n+2)` hidden) — three strips would be too
  narrow at 375px.
- **Placeholder:** `.action-cta__video { background: #d5a461 }` (sampled from the
  clip backdrop) avoids a black flash before the first frame paints.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, `initCtaVideos()`
  bails and the CSS hides the videos and shows the static image
  (`cta-people.png` desktop / `cta-mobile.jpg` mobile) via a `background-image`
  scoped to the media query — so that image is only fetched by reduced-motion
  users; everyone else skips it.
- **If you swap the clips:** keep the seamless empty-stool loop point, re-export
  both WebM + MP4, and keep them small (right lady is currently the heaviest at
  ~1.4 MB WebM — a good target if you trim further).
