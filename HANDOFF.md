# Developer Handoff — Capella University Homepage (v2)

Engineering notes for anyone picking up this build. Covers the toolchain, the
animation system, responsive behavior, accessibility, asset handling, and the
edge cases / gotchas that aren't obvious from the code alone.

> See also: [`README.md`](README.md) for the quick-start, and
> [`DEBUGGING.md`](DEBUGGING.md) for symptom-first troubleshooting — start there
> when something *looks* broken; this file explains how things are *built*.

**This is the second version of the homepage**, living at
[`camila-go/CU-Homepage-Test-v2`](https://github.com/camila-go/CU-Homepage-Test-v2).
What changed from v1, and where the details are:

| Area | Change | §  |
| --- | --- | --- |
| Featured-story cards | Rebuilt to the **Card Update** Figma (`1440 × 600`, new copy and people, Figma-variable type scale, portraits that break out above the card) | §3, §6 |
| Hero | Two-layer red-wall parallax + ambient drift; `initContentParallax` rewritten to be scroll-keyed so the headline no longer rides up over the faces | §3a, §7 |
| Carousel motion | Scroll-driven, ratcheted card slide-in (the card's text does not animate) | §7 |
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
  assets/         # Images + SVGs (served from /assets/... at runtime)
    videos/       # CTA band background loops (MP4 + WebM) — see §12
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
- **CTA background video:** the closing "what are you waiting for?" section
  plays a single full-bleed TV-spot clip (`public/assets/videos/cta-tvspot*`)
  — see §12. The reduced-motion fallback is the clip's own poster frame, so no
  extra image is fetched. The previous three-clip set
  (`{leftLady,middleMan,rightLady}_loop.{webm,mp4}`, ~6.4 MB) plus
  `cta-people.png` / `cta-mobile.jpg` are now **unreferenced** — safe to delete.

### 3d. Committed but unreferenced assets

Nothing in the page loads these — they're kept, not wired up. Listed so you
don't go hunting for the code that uses them:

| File(s) | Size | Note |
| --- | --- | --- |
| `hero-base.png` | 12.2 MB | Superseded by the two WebP hero layers (§3a). |
| `hero.png` | 6.1 MB | **Keep** — the regeneration source for those layers. |
| `footer-partner-{sei,strayer,jwmi}.svg` | ~30 KB | **In use** by the footer partner carousel (§13). |
| `footer-partner-devmountain.svg` | ~8 KB | **⚠️ Mislabelled — this is the SOPHIA wordmark, not Devmountain.** Don't wire it up by filename. |
| `footer-partner-sophia.svg` | ~1 KB | Sophia droplet **mark only**, not the wordmark lockup. |
| `footer-logos-strip.png`, `footer-partners-strip.png` | ~46 KB | The old flat 4320×210 strip, with the arrows *painted into the image*. Superseded by the carousel; kept as the slice source for `partners/{devmountain,sophia}.png`. |
| `footer-arrow-{next,prev}.svg` | ~0 KB | Empty files. |
| `cta-1/2/3.png` | ~2.2 MB | Legacy, see above. |

Everything except `hero.png` is safe to delete; that's ~14.8 MB of the repo's
~47 MB of assets. Left in place because a few are plausible future art rather
than clearly dead.

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
| Main nav links — **activated** | — | solid `--nav-pill-current` `#5e6361` pill, via `aria-current="page"` |
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

### Buttons and chips invert on hover

The same "invert" language runs through the rest of the UI — a **filled** rest
state becomes an **outlined** hover state, not a darker fill. Two places
implement it:

- **`.btn--white`** (hero *Get started*, both *Apply now* buttons): solid white
  → transparent with a 2px white ring and white text
  ([hero `2001:456`](https://www.figma.com/design/mqSJTp9qWvsAU8n08FFlk9/UI-Elements-for-Homepage-Proto--Copy-?node-id=2001-448)).
  The rule lives on the variant so all three behave identically. ⚠️ It assumes a
  **dark or photo backdrop** — true of all three current usages. A white button
  on a light background would need its own hover.
- **`.btn--secondary`** (the two carousel card buttons): the same move
  dark-on-light — solid black → transparent with a 2px black ring and black
  text, since these sit on the card's light grey panel.
- **`.btn--dark`** (action-CTA *Get started*): dark pill → transparent with a
  2px white ring.
- **`.btn--outline`** (*See all accreditations*): the reverse — the outline
  **fills white** and the text flips dark. Its 2px border exists at rest, so
  nothing resizes.
- **`.btn--primary`** (both red buttons — stats *See all Capella programs* and
  the program finder's *Explore my program*): red fill → **white fill with red
  text**, matching the utility bar's *Request information*. This is on the
  variant, so both red buttons behave the same; it replaced an earlier
  stats-only rule that inverted to a transparent white ring.
- **`.chip`** (program finder,
  [`2001:335`](https://www.figma.com/design/mqSJTp9qWvsAU8n08FFlk9/UI-Elements-for-Homepage-Proto--Copy-?node-id=2001-335)):

  | State | Fill | Border |
  | --- | --- | --- |
  | rest | `--color-chip-rest` `#4f4f4f` | none (transparent) |
  | hover | transparent | 2px `--color-chip-hover-border` `#8e8e8e` |
  | selected (`.chip--active`) | transparent | 2px `--color-stat-blue` `#94b7bb` |

  This is the **inverse** of the original implementation (which was outlined at
  rest and filled on hover) — don't "fix" it back.

### Stats section hover states

Specced in
[UI Elements `2001:548`](https://www.figma.com/design/mqSJTp9qWvsAU8n08FFlk9/UI-Elements-for-Homepage-Proto--Copy-?node-id=2001-548):

| Element | Rest | Hover |
| --- | --- | --- |
| `.stats-section__program` | dark glass card | **solid white fill**, eyebrow `#767676`, name `#505050`, arrow `--color-uni-red` |
| `.stats-section__cta` ("See all Capella programs") | red fill, white text | **white fill, red text** — now on `.btn--primary`, see above |
| `.stats-section__source a` (fact sheet) | underlined | **bold**, still underlined |

- The card rule is `.stats-section__program.glass-card:hover` — **two classes on
  purpose**, so it outranks `.glass-card:hover`, which would otherwise keep its
  translucent white wash and defeat the solid fill.
- The arrow is `stroke="currentColor"`, so setting `color` recolours it.
- The CTA's hover was later moved **onto `.btn--primary`** by request, so it and
  the program finder's red button match. There is no stats-specific rule for it
  any more.
- `.glass-card`'s diagonal shine sweep was **removed** (it was invisible against
  the new white fill). `.glass-card` is used only by these four cards, so the
  `::before` rules were deleted outright rather than scoped.

⚠️ **Rings are inset `box-shadow`s, and the chip's rest border is a transparent
2px, both for the same reason:** the element must not change size between
states. A real 0→2px border makes buttons resize and the whole chip row jiggle
on hover.
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
- **The activated state is keyed to `aria-current="page"`**, not a presentational
  class, so assistive tech gets the same "you are here" signal the fill gives
  sighted users. **No item carries it in `index.html`** — this is the homepage,
  and none of the four nav destinations is the current page; marking one would
  announce the wrong page to a screen reader. Add the attribute to a link (also
  works on `.main-nav__mobile-links`) when the nav is reused on a real section
  page. Its rule sits *after* `:hover`/`:active` at equal specificity so the
  current item keeps the stronger fill instead of appearing to downgrade to the
  hover wash when pointed at.

### Megamenus (`initMegaMenu`)

All four nav items open a dropdown. The information architecture — every label
and grouping — was lifted from the live **capella.edu** nav so the prototype
matches production; the `href`s are all `#` because this is a single page.

- **Degrees & Programs** is the two-column one (`.megamenu--split`): a dark rail
  of degree levels on the left driving a light panel of areas of study on the
  right, plus the red *Find your program* CTA. Left rail is `role="tablist"`,
  each level a `role="tab"` owning a `role="tabpanel"`.
- **Capella Experience / Financing / Admissions** are single-row
  (`.megamenu__inner--columns`): grouped link lists, one column per group.
- Only the **areas** level is reproduced under each degree level, not the
  individual programs (capella.edu reveals those at a third level). That
  matches the reference screenshot and keeps `index.html` reasonable — the full
  program lists would be 60+ more links.

Gotchas:
- ⚠️ **`.main-nav__item` is `position: static` on purpose.** The panel is
  absolutely positioned against `.main-nav` (sticky, so it's the containing
  block) to span the full header width. Give the `li` `position: relative` and
  the panel collapses into that one nav item's box.
- ⚠️ **`.megamenu[hidden] { display: none }` is required.** `.megamenu__inner`
  sets `display: flex`, which otherwise beats the `hidden` attribute and the
  panels never close.
- Triggers stay `<a aria-haspopup>` rather than `<button>` — this is what
  capella.edu does, and it keeps all the existing `.main-nav__links a` styling
  (pill, hover, focus) applying unchanged.
- An open trigger holds the `--nav-pill-current` fill via
  `[aria-expanded="true"]`, so you can see which menu you're in while the
  pointer is down inside the panel.
- The degree rail responds to **`mouseenter` as well as click**, matching the
  real site. It is deliberately *not* wired to `focus`, or keyboard-arrowing
  through the rail would fight the roving selection.
- Dismissal: click outside, or `Escape` (which returns focus to the trigger).
- Hidden below the 1024px hamburger breakpoint — the mobile panel is the
  navigation there, and it is untouched by this.
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
    - ⚠️ **The phone mockup is the exception — do NOT re-derive its `left` and
      `width` from the Figma render.** `.carousel__image--mockup` inside it is
      positioned in *percentages of the mockup box*, so resizing that box
      rescales the phone within its crop and drags the phone's visible top edge
      down, silently killing the overhang. Only `top` and the bottom
      `clip-path` should change when the card's height changes. Also note
      `top` positions the **box**, whose top sits ~78px above the phone's
      visible top: `-119` is what puts the phone 41px above the card.
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
| `initTextReveal()` | Splits target headings into per-word spans (`.word` mask + `.word__inner`) that rise up from behind a clip mask, staggered via `--word-index`. **`TEXT_REVEAL_SELECTORS` is deliberately down to two headings** — hero + stats. The tiles, accreditation, action-CTA and program-finder ("Catch what you're chasing") headings were all removed by request; don't add them back unless asked. | IntersectionObserver (per heading) |
| `initRevealAnimations()` | Fade-up for elements with `.reveal`. Optional stagger via `data-reveal-delay="N"` (× 80ms). | IntersectionObserver |
| Carousel card reveal (in `initCarousel()`) | Marks the card `.is-visible`; the movement itself is `initCardScroll()` below. The card's **inner text does not animate** — it rides in with the card. (An earlier version staggered title → body → button; removed by request.) | IntersectionObserver (first view) + `goTo()` + safety timeout |
| `initCardScroll()` | **Scroll-driven** (scrubbed, not timed) slide-in for the carousel cards: their `translate` tracks the carousel's position in the viewport, spread over ~90% of a viewport height so it's slow. **Ratcheted** — it only ever moves toward settled, so scrolling back up never pushes the cards out again. | `scroll`/`resize`, throttled with `requestAnimationFrame` |
| `initCountUp()` | Animates the stats numbers (40 / 80 / 1,530+ / 63%) counting up with a custom cubic-bezier ease. Preserves prefixes/suffixes/grouping. | IntersectionObserver (threshold 0.4) |
| `initParallax()` | Translates the content-band background image on scroll for depth. | `scroll`/`resize`, throttled with `requestAnimationFrame` |
| `initHeroParallax()` | Subtle parallax on the hero's **red wall only** (`.hero__bg-red`) — the people layer never moves. Driven off `window.scrollY` so it responds from the first scroll pixel; drifts the wall down up to 70px. See §3a + §5. | `scroll`/`resize`, throttled with `requestAnimationFrame` |
| `initContentParallax()` | Floats `.hero__content` (factor **0.6**) and `.program-finder` (0.2) up as you scroll, layering them over the hero art. **Driven off `window.scrollY`, NOT off each element's `getBoundingClientRect().top`** — a viewport-relative formula is already non-zero for anything on screen at load, which shoved the hero headline ~100px above its laid-out position and put the CTA over the faces. Must read 0 at `scrollY === 0`. The hero's travel is capped at its own `offsetTop - 16` because `.hero` is `overflow: hidden`: the mobile hero only leaves ~117px of room before the headline would clip, versus ~170 on desktop. Don't replace that with a fixed cap. | `scroll`/`resize`, throttled with `requestAnimationFrame` |
| Hero wall Ken Burns | CSS-only ambient zoom+pan on `.hero__bg-red` only (`@keyframes hero-wall-drift`, 13s alternate) — plays on its own (no scroll), people stay still. Zoom only grows past the base so no edge is exposed. Disabled under reduced-motion. | autoplay |
| Card hover scale | CSS-only `transform: scale(1.02)` on `.stats-section__program:hover` (replaced the removed VanillaTilt 3D tilt — it caused a "jiggle"). Kept deliberately, on top of the card's white hover fill. Disabled under reduced-motion. | hover |

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

### Carousel card motion details / gotchas
- **All of the card's motion comes from `initCardScroll()`**, which writes an
  inline `translate` every scroll frame. `.carousel-reveal` itself is only
  `will-change: translate` — there is **no** opacity fade, no CSS transition and
  no reduced-motion block on it, because there is nothing timed to disable.
- **It animates the `translate` property, not `transform`.** Deliberate: the
  carousel **track** uses `transform: translateX()` for navigation, so a
  `transform`-based card animation would clobber it. `translate` is a separate
  property, so the card's offset composes with the track's transform instead of
  fighting it. The card starts at `translate: 45% 0` (`START_OFFSET`) and scrubs
  to `0`.
- **The slide-in is ratcheted.** `initCardScroll` keeps a `revealed` value that
  only ever moves toward 0, so scrolling back up never pushes the cards out
  again.
- Reduced motion: `initCardScroll()` returns early, so no inline `translate` is
  ever written and the cards simply sit where they're laid out.
- ⚠️ **The `is-visible` reveal path is now vestigial.** `revealSlide()`, the
  one-shot IntersectionObserver on `.carousel__viewport` (`carouselSeen`), the
  2.5s safety `setTimeout`, and `goTo()`'s call into `revealSlide()` all still
  run, but **no CSS reads `.carousel__card.is-visible` any more** — the only
  `.is-visible` rules left are `.reveal.is-visible` and
  `.reveal-text.is-visible .word__inner`, neither of which matches a card. That
  machinery existed to drive the per-element text stagger, which was removed. It
  is harmless but dead: either wire new hover/reveal CSS to it or delete it —
  don't assume it is doing something.

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

## 12. CTA background video

The closing "what are you waiting for?" section plays a single full-bleed
TV-spot clip (Figma UI Elements `2008:19373`). It replaced an earlier three-clip
strip.

- **Files** (all in `public/assets/videos/`, encoded from a 1440×750 / 45s /
  24fps / silent 84 MB master):

  | file | size | serves |
  | --- | --- | --- |
  | `cta-tvspot.webm` | 4.5 MB | > 1024px — VP9 CRF 36, tried first |
  | `cta-tvspot.mp4` | 5.3 MB | > 1024px — H.264 CRF 28, Safari fallback |
  | `cta-tvspot-sm.webm` | 2.1 MB | 769–1024px — 960-wide VP9 CRF 40 |
  | `cta-tvspot-sm.mp4` | 2.3 MB | 769–1024px — 960-wide H.264 CRF 30 |
  | `cta-tvspot-portrait.webm` | 1.5 MB | ≤ 768px — 374×686 VP9 CRF 40 |
  | `cta-tvspot-portrait.mp4` | 1.5 MB | ≤ 768px — 374×686 H.264 CRF 30 |
  | `cta-tvspot-poster.jpg` | 79 KB | landscape poster + reduced-motion still |
  | `cta-tvspot-portrait-poster.webp` | 10 KB | portrait poster + reduced-motion still |

  The portrait pair is a separately shot 374×686 crop (the Figma mobile frame),
  not the landscape master squeezed by `object-fit`. Its aspect ratio is 0.545
  against the container's 0.546, so `cover` trims essentially nothing.

  Audio is stripped (`-an`) — the master is silent and an audio track would only
  add bytes. `+faststart` puts the moov atom first so playback can begin while
  the file is still streaming.
- **Source order:** WebM first, MP4 second — the browser takes WebM where
  supported (Chrome/Firefox/Edge) and falls back to MP4 (Safari).
- **Autoplay-as-background:** `muted` + `playsinline` + `loop` (required for
  autoplay, incl. iOS). There is **no `autoplay` attribute** — see lazy-load.
- **Lazy-load (`initCtaVideos()`):** `preload="none"` plus an
  IntersectionObserver that calls `play()` only when the section is within
  ~200px of the viewport and `pause()`s when it leaves. Nothing is fetched on
  initial load — the section is far below the fold.
- **⚠️ The variant is chosen in JS, not `media` attributes.** `initCtaVideos()`
  picks a tier — portrait ≤768, `-sm` ≤1024, master above — rewrites the
  `<source>` srcs (and the mp4's codec string, which differs per encode), swaps
  the poster on the portrait tier, then calls `load()`. This is safe because
  `preload="none"` means nothing has been requested yet. `media` on `<source>`
  is *not* reliably honoured for `<video>`; if a browser ignored it, the small
  file would be served to desktops instead.
- **Placeholder:** the `poster` paints instantly, over a
  `.action-cta__video { background: #6f7472 }` so there's no black flash.
- **Reduced motion:** `initCtaVideos()` bails, so `play()` is never called and
  `preload="none"` means the video bytes are never fetched. The poster frame is
  the fallback image, set as a `background-image` scoped to the media query.
- **Layout:** full-bleed 1440×750 on desktop; on phones the section takes the
  design's 375×687 portrait ratio and plays the dedicated portrait encode.
- **Re-encoding:** there is no `ffmpeg` on this machine by default;
  `pip install --user imageio-ffmpeg` provides a static binary at
  `~/Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries/`.

## 13. Footer partner carousel

The five Strategic Education brand logos sit in a real carousel, mirroring the
behaviour on capella.edu: **manual arrows only, no autoplay**, paging by a whole
view.

- **Slides per view** is driven entirely by `--per-view` on `.footer__partners`
  (6 desktop / 3 ≤1280 / 1 ≤768, matching the live site). `initFooterPartners()`
  reads that value back out of the computed style, so adding a breakpoint means
  touching CSS only.
- **Arrows disable rather than hide** at each end, so the viewport width never
  changes and the logos don't shift. With 5 logos in 6 desktop slots everything
  fits, so both arrows are correctly disabled there; they become active as soon
  as a 6th brand is added.
- `aria-hidden` and `tabindex` track which slides are in view, so off-screen
  logos aren't announced or tab-focusable.
- **Logo provenance is not what the filenames suggest** — see §3d. Devmountain
  and Sophia are PNGs sliced from the old strip because no correct SVG exists
  for either. Each was checked visually before being wired up.
- **All 10 live brands are present**, in the same order as capella.edu, using the
  official exports pulled from `capella.edu/content/dam/...` into
  `public/assets/partners/`. The three oversized PNGs (Sophia, JWMI,
  Degrees@Work — up to 7185px wide) were trimmed, resized to 176px tall and
  converted to greyscale+alpha; they are pure white artwork, so dropping colour
  is lossless. Adding an 11th brand is one `<li>` — no JS or CSS change.
- The older `footer-partner-*.svg` files are now fully superseded and unused.
