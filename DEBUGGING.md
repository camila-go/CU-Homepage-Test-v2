# Debugging Runbook

Symptom-first troubleshooting for this prototype. Every entry below is a failure
that actually happened here, with the command or snippet that identifies it.

For *how a component works*, see [HANDOFF.md](HANDOFF.md) — this file is only
for "something looks broken, where do I start".

---

## When to use this

- The preview looks wrong, stale, or empty
- A change you made has no visible effect
- Something breaks only at one breakpoint, or only after scrolling
- A Figma or asset-tooling command fails

## Prerequisites

- The preview server is a **plain Python static server**, not Vite — there is no
  `node` on this machine. It serves `/tmp/cu_site`, a **copy** of the repo.
- Start it via the Browser pane with the launch config named `cu-home`
  (`.claude/launch.json` → `/tmp/cu_home_server.py`).
- Re-encoding video needs a local ffmpeg: `pip install --user imageio-ffmpeg`,
  then the binary lives under
  `~/Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries/`.

---

## Fast triage

| Symptom | Most likely cause | Section |
| --- | --- | --- |
| Edits have no effect in the preview | Serve directory not re-synced | [1](#1-edits-dont-show-up) |
| Preview shows "Directory listing for /" | Second `rsync` ran with `--delete` | [1](#1-edits-dont-show-up) |
| `/assets/*` 404s but files exist in the repo | `public/` must map to the web root | [1](#1-edits-dont-show-up) |
| A `position: fixed` element collapses to a sliver | Ancestor creates a containing block | [2](#2-a-fixed-element-collapses-or-anchors-to-the-wrong-box) |
| Dropdown floats with a gap under the nav | Header changed height after the panel was positioned | [3](#3-dropdown-detaches-from-the-nav-bar) |
| Button text wraps for no reason | `left: 50%` halved its available width | [4](#4-text-wraps-in-a-box-that-looks-wide-enough) |
| First items of a scrolling strip unreachable | `justify-content: center` centred the overflow | [5](#5-start-of-a-scrollable-strip-is-cut-off) |
| A section disappears on older Safari | `aspect-ratio` with `min-height: 0` | [6](#6-section-vanishes-on-older-safari) |
| Styles leak into a nested component | Descendant selector where a child selector was meant | [7](#7-styles-leak-into-nested-markup) |
| Figma MCP: "No node could be found" | Desktop-app tool only reads the *active* tab | [8](#8-figma-mcp-cant-find-a-node) |
| Screenshot is tiny, stale, or mid-transition | Preview-pane quirks | [9](#9-screenshots-mislead) |

---

## 1. Edits don't show up

**Cause.** The server serves `/tmp/cu_site`, not the repo. Editing a file
changes nothing until you re-sync. Verifying against an unsynced copy is worse
than not verifying — you get confident, wrong conclusions.

**Confirm** the served copy is behind:

```bash
diff -q /Users/camila.gonzalez/Documents/Code/CU-Home-Page-Test/css/styles.css /tmp/cu_site/css/styles.css
```

**Fix** — two rsyncs, because `public/` maps onto the web root (Vite would
normally do this):

```bash
cd /Users/camila.gonzalez/Documents/Code/CU-Home-Page-Test && rsync -a --delete --exclude .git --exclude node_modules --exclude public ./ /tmp/cu_site/ && rsync -a public/ /tmp/cu_site/
```

Then reload the tab. The server sends `Cache-Control: no-store`, so a plain
reload is enough.

### ⚠️ Never put `--delete` on the second rsync

`public/` contains only assets. `rsync -a --delete public/ /tmp/cu_site/` deletes
`index.html`, `css/` and `js/` from the serve directory, and the preview becomes
a bare directory listing. **The repo is untouched** — only the copy is destroyed.
Rebuild it:

```bash
rm -rf /tmp/cu_site && mkdir -p /tmp/cu_site && cd /Users/camila.gonzalez/Documents/Code/CU-Home-Page-Test && rsync -a --exclude .git --exclude node_modules --exclude public ./ /tmp/cu_site/ && rsync -a public/ /tmp/cu_site/
```

To remove a stale asset, delete it from `public/` and rebuild from scratch as
above rather than reaching for `--delete`.

### Assets 404 while present in the repo

A single `rsync --delete` of the whole repo puts assets at `/public/assets/*`,
but the markup requests `/assets/*`. That's what the second rsync fixes.

---

## 2. A fixed element collapses, or anchors to the wrong box

**Symptom.** A `position: fixed` overlay renders as a thin sliver, or sits
relative to a parent instead of the viewport.

**Cause.** `transform`, `filter`, **`backdrop-filter`**, `will-change` of those,
`contain`, `perspective` or `container-type` on *any* ancestor makes that
ancestor the containing block for fixed descendants. `top`/`bottom` then resolve
against it, not the viewport.

This bit the mobile menu: `.main-nav--scrolled` applies `backdrop-filter`, so
once you scrolled, the panel's `top: 107px; bottom: 0` resolved inside a 67px
header and collapsed to its 3px border.

**Confirm** — walk the ancestor chain in the console:

```js
let el = document.getElementById('mobile-nav-panel').parentElement, hits = [];
while (el && el !== document.documentElement) {
  const cs = getComputedStyle(el);
  ['transform','filter','backdropFilter','perspective','contain','containerType']
    .forEach(p => { const v = cs[p]; if (v && v !== 'none' && v !== 'normal') hits.push(el.className + ' → ' + p + ': ' + v); });
  el = el.parentElement;
}
hits;
```

Anything listed is your containing block.

**Fix.** Reparent the fixed element to `<body>` so no ancestor can trap it —
`initMobileNav()` does this on init. Removing the offending property also works
but is fragile: the next person to add a blur reintroduces the bug.

---

## 3. Dropdown detaches from the nav bar

**Symptom.** An open megamenu hangs with a visible gap below the header.

**Cause.** Megamenus are positioned from the nav bar's bottom edge *at the
moment they open*. Anything that changes the header's height afterwards leaves
the panel behind. The header used to shrink 88 → 72px on scroll, producing
exactly a 16px gap.

**Rule.** The scrolled state may change colour only — **never geometry**. See
the warning comment on `.main-nav--scrolled` in `css/styles.css`.

**Confirm** the header height is stable:

```js
const bar = document.querySelector('.main-nav__bar');
[0, 60, 600, 2500].forEach(y => { window.scrollTo(0, y); console.log(y, Math.round(bar.getBoundingClientRect().height)); });
```

All four must print the same height.

---

## 4. Text wraps in a box that looks wide enough

**Cause.** An absolutely-positioned, shrink-to-fit box with `left: 50%` and
`right: auto` only gets the space from the centre line to the right edge —
**half the container**. `transform: translateX(-50%)` then re-centres the
already-wrapped box, so it looks deliberate.

The carousel CTA ("Is FlexPath right for you?") broke onto two lines this way.

**Fix.** `width: max-content` plus a `max-width` guard:

```css
width: max-content;
max-width: calc(100% - 48px);
```

---

## 5. Start of a scrollable strip is cut off

**Cause.** In a horizontal scroll container, `justify-content: center` centres
the **overflow** too. Content pushed past the container's left edge is
unreachable, because `scrollLeft` can't go negative.

**Fix.** `justify-content: flex-start` (or `safe center`). If the content fits,
start-aligned and centred look identical, so there's no downside.

---

## 6. Section vanishes on older Safari

**Cause.** `aspect-ratio` combined with `min-height: 0`. Safari < 15 ignores
`aspect-ratio`, so the element resolves to zero height.

**Fix.** Guard the fallback so it only applies where the property is missing:

```css
@supports not (aspect-ratio: 1 / 1) {
  .action-cta__panels { min-height: 620px; }
}
```

Audit for others:

```bash
grep -n "aspect-ratio" css/styles.css
```

---

## 7. Styles leak into nested markup

**Symptom.** Nested links inherit pill radii, `white-space: nowrap`, or hover
states they should not have.

**Cause.** A descendant selector where a child selector was meant.
`.main-nav__links a` matched *every* anchor inside the megamenus — it needed to
be `.main-nav__item > a`. One character, three visible bugs (round corners, a
wrong hover, and text overflowing its panel).

**Confirm** how many elements a selector really matches:

```js
document.querySelectorAll('.main-nav__links a').length;   // every nested link
document.querySelectorAll('.main-nav__item > a').length;  // just the 4 triggers
```

---

## 8. Figma MCP can't find a node

**Symptom.** `No node could be found for the provided nodeId`, even though the
URL is correct.

**Cause.** The desktop-app Figma tools only read the **currently active tab** in
the Figma app. A node in any other file is invisible to them.

**Fix.** Use the connector that takes an explicit `fileKey` — it reaches any
file without switching tabs. Extract both parts from the URL:

```
https://figma.com/design/<fileKey>/<name>?node-id=<1-2>   →   nodeId "1:2"
```

Known-good file keys are listed in [HANDOFF.md](HANDOFF.md) under *Design
source*.

**If the call fails with an SSE / JSON parse error**, that file's metadata
endpoint is broken — `get_screenshot` still works. Fall back to rendering the
node at high `maxDimension` and measuring pixels; `get_variable_defs` also still
returns the token values.

---

## 9. Screenshots mislead

Three separate quirks, all preview-pane behaviour rather than page bugs:

- **Page renders into a corner of the screenshot.** The pane hasn't re-laid out
  after a resize. Reload the tab, then re-shoot.
- **Computed styles read as transition *start* values.** When the tab is
  backgrounded, transitions and rAF freeze. Inject
  `* { transition: none !important }` before measuring, or wait past the
  transition duration.
- **State looks one step behind.** Transitions run `--duration-med` (0.45s);
  a screenshot taken immediately after a click catches the old frame. Wait
  ~600ms.

**Prefer measurement over eyeballing.** Layout assertions in the console are far
more reliable than reading a scaled-down screenshot — that's how the carousel
was matched to the design to within 1–2px.

---

## Rollback

Everything here is either a working-copy edit or a serve-directory rebuild.
Nothing touches remote state.

| To undo | Command |
| --- | --- |
| Uncommitted source edits | `git restore <path>` |
| Everything since the last commit | `git restore .` |
| A file deleted in an earlier commit | `git checkout <sha>~1 -- <path>` |
| A broken serve directory | Rebuild — see [section 1](#1-edits-dont-show-up) |

The old CTA clips and `cta-people.png` / `cta-mobile.jpg` were removed in the
megamenu commit; recover them with the `git checkout` form above if needed.

## Escalation

1. Check [HANDOFF.md](HANDOFF.md) — most components carry a `⚠️` comment
   explaining a trap that has already been hit once.
2. Check the inline comments. Anything marked `⚠️` in `css/styles.css` or
   `js/main.js` documents a real regression; re-read it before "simplifying"
   that code.
3. Compare against production at <https://www.capella.edu/> — it is the source
   of truth for footer and nav *content*; the Figma files are the source of
   truth for *visual design*.
