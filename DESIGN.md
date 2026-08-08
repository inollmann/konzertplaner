# Konzertplaner — Design Reference

Living documentation of the visual language and theming architecture of the
Konzertplaner app. Captures the *current* identity so that future changes are
intentional rather than accidental. Source of truth is `static/style.css`
(tokens) and `static/js/theme.js` (runtime theming).

## 1. Identity

A personal concert/tour planner with a dark, high-contrast, "neon-on-black"
aesthetic. The default theme reads as a music-app: near-black background, a
single acid-green accent, sky-blue for tours and lavender for festivals.
Typography pairs a condensed display face (Bebas Neue) for headings/logo with
a humanist sans (DM Sans) for body. The UI is in German.

Design goals:
- **Legibility first** on a dark surface: high text contrast, generous
  spacing, large tap targets.
- **Type colour as semantics**: tour vs festival is the central dichotomy and
  is signalled by colour everywhere (badges, timeline bars, map markers,
  histogram bars, calendar events).
- **Calm density**: a lot of information per card (date, venue, city, time,
  price, tags, support acts, ratings) but never cramped — `var(--radius)`
  soft corners, 1px low-opacity borders, and surface layering carry the
  hierarchy instead of heavy rules.
- **No build step**: the SPA is plain ES modules served as-is by Flask. No
  framework, no bundler, no CSS preprocessor. This is a selling point and
  must be preserved.

## 2. Color tokens

All colours live as CSS custom properties on `:root` (dark default) and are
overridden under `:root.light`. The design panel (`/design-tool` and the
in-app Design modal) mutates `document.documentElement.style` and persists
overrides to `localStorage['kp-colors']`.

| Token              | Dark (default) | Light        | Meaning                                |
|--------------------|----------------|--------------|----------------------------------------|
| `--bg`             | `#0d0d0d`      | `#ececec`    | Page background                        |
| `--surface`        | `#161616`      | `#ffffff`    | Cards, modals, dropdowns               |
| `--surface2`       | `#1f1f1f`      | `#f3f3f3`    | Inset surfaces (inputs, hover)         |
| `--surface3`       | `#272727`      | `#e5e5e5`    | Active/raised surface                  |
| `--border`         | `#2e2e2e44`    | `#dddddddd`  | Hairlines (low opacity by design)      |
| `--text`           | `#f0f0f0`      | `#1a1a1a`    | Primary text                           |
| `--muted`          | `#777`         | `#666`       | Secondary text, placeholders           |
| `--accent`         | `#e8ff47`      | `#006b66`    | Single brand accent (CTAs, highlights) |
| `--tour`           | `#19c6e6`      | `#0e7c9c`    | Tour / concert type                    |
| `--festival`       | `#ff4d8d`      | `#c8286a`    | Festival type                          |
| `--tickets-color`  | `#1fc8a4`      | `#0a7a5e`    | "Tickets gekauft" tag                  |
| `--watch-color`    | `#ff9e2c`      | `#b8650a`    | "Merkliste" tag                        |
| `--danger`         | `#f87171`      | `#dc2626`    | Delete/danger actions                  |
| `--link`           | `#99aecc`      | `#5b7a9e`    | Ticket links                           |
| `--link-soldout`   | `#64748b`      | `#475569`    | Sold-out ticket links                  |
| `--placeholder`    | `#444`         | `#999`       | Image/empty-state placeholders          |
| `--radius`         | `var(--radius-md)` | `var(--radius-md)` | Corner radius (legacy alias for `--radius-md`) |

#### Radius scale
`--radius-sm` (4px) · `--radius-md` (8px) · `--radius-lg` (12px) · `--radius-xl` (16px) · `--radius-pill` (20px) · `--radius-full` (50%)

#### Shadow scale
`--shadow-sm` (subtle) · `--shadow-md` (cards) · `--shadow-lg` (popovers) · `--shadow-xl` (lightbox) · `--shadow-accent` (accent glow) · `--shadow-stripe-tickets` / `--shadow-stripe-watch` (bottom inset stripes)

#### Spacing scale
`--space-1` (2px) through `--space-14` (36px): 1=2, 2=4, 3=6, 4=8, 5=10, 6=12, 7=14, 8=16, 9=20, 10=24, 12=32, 14=36

### Presets
- **dark** — the default, above.
- **light** — `:root.light`, see table.
- **midnight** — deep indigo background (`#04040f` / `#0d0d2b`), cyan accent
  (`#00ffcc`), pink/gold tour/festival. Available in the in-app Design modal.
- **forest** / **rose** — only in the standalone `/design-tool` page, not the
  in-app panel.

### Rating colour scale
Rating pips interpolate hue from `0°` (dark red) at rating 1 to `120°` (dark
green) at rating 10, fixed `sat 70% / light 35%`: see `pipColor()` in
`static/js/utils.js`. Pips above the rating value are transparent (grey
border only).

## 3. Typography

Two families, both via Google Fonts CDN (`style.css` loads them through
`index.html` `<link>`):

- **Bebas Neue** — display. Used for the logo `KONZERTPLANER`, section
  headings, modal titles, timeline title `ZEITSTRAHL`. `letter-spacing: 2–
  3px`, uppercase feel. Weight: 400 (the only weight).
- **DM Sans** — body. `font-size: 15px` on `html, body`. Weights 300/400/500/
  600 + italic 300. Used for all UI text, labels, inputs, card content.

No other families are used. Monospace only where the platform default is
acceptable (notably nowhere in the UI by design). Emoji are used as icons
throughout (🎤 🏟 🎸 🎪 🎟 🔖 📅 🕓 📍 🕓 ★ ☆ ✓ ✕ ➕ 🗑 ✏️ 🔗) — this is intentional and keeps
the zero-build-step constraint.

## 4. Geometry & layout

- **Radius** `--radius: 10px` for cards, modals, inputs, buttons. Smaller
  elements (chips, tags, pips) use `6px` or pill shapes (`border-radius: 999px`).
- **Borders** 1px, `var(--border)` (semi-transparent by design — `#2e2e2e44`
  in dark mode). Never 2px.
- **Surfaces** layer via `--surface` → `--surface2` → `--surface3`. Modals
  sit on `--surface`; inputs on `--surface2`; active/hover on `--surface3`.
- **Layout shell**: sticky `<header>` (z 50), tabs row, filter bar, then
  `<main>` per tab. Detail panel is a right-side drawer/backdrop overlay.
  Modals are centred backdrops. Drawer is a left slide-in.
- **Spacing** is mostly `8px / 12px / 16px / 22px / 24px`. Card padding
  `22px`. Section label `sec-label` has an accent-coloured bar.
- **Breakpoints**: the app is desktop-first; small screens degrade
  gracefully (filter bars wrap, cards stretch) but there is no dedicated
  mobile layout.

## 5. Components

- **Event card** (`renderTourCard` / `renderFestCard`) — poster thumb + meta
  (type badge, title, subtitle, support) + concert rows. Festival cards
  collapse to a single date row. Past events show inline rating bars.
- **Date block** — stacked `day / month / year` with optional `→ end` label.
  Day is large bold; month is short uppercase German (`de-DE`).
- **Type badge** — small uppercase pill, coloured by `--tour` / `--festival`.
- **Tags** — `🎟 Tickets` (green) / `☆ Merkliste` (orange). Toggle style in
  the detail view (`tag-toggle` with `active-*` states).
- **Filter chips** — `filter-chip` with `active-past`, `active-upcoming`,
  `active-tour`, `active-festival`, `active-tickets`, `active-watchlist`
  colour states. Toggle semantics: clicking the active date filter cycles
  through `past → upcoming → both`.
- **Rating bar** — 10 pips; click a pip to set the rating; `✕` to reset.
  See colour scale above.
- **Pills** — tag input with autocomplete (`pill-field`, `pill-input`,
  `ac-drop`). Supports drag-reorder, comma/enter to commit, backspace to
  delete.
- **Modals** — `modal-backdrop` + `modal` with a title row, body, and
  `form-actions`. Close on backdrop click, `Esc`, or `✕`.
- **Timeline** — epoch-based (2000-01-01 → 2100-01-01), virtualised,
  drag-to-scroll, zoom levels (1 Jahr / 6 Monate / 3 Monate / 1 Monat).
  Single-row layout with interval partitioning for overlaps. Logos/posters
  shown at 6M and below. Today line labelled `HEUTE`.
- **Map** — Leaflet + OpenStreetMap tiles. Markers grouped by geocoded
  venue, coloured tour/festival/mixed, with a count badge. Unrecognised
  venues fall into a manual-placement list. Geocoding via Nominatim,
  cached in `localStorage['kp-venue-cache']`.
- **Histograms** — rating / year / city bars, two-coloured by tour vs
  festival. Hover tooltip lists the events in the bucket.

## 6. Motion

Motion is minimal and functional:
- Modal/drawer/detail open via a CSS class toggle (`open`) with a short
  `transform`/`opacity` transition in `style.css` (no JS animation libs).
- Timeline drag uses native `scrollLeft` + `requestAnimationFrame`-throttled
  re-render.
- Filter chip colour changes are instant (CSS class swap).
- No page transitions, no skeleton screens, no toast animations. Loading
  states are text (`⏳ Lade …`) or a spinner dot (`search-spinner`).

## 7. Theming architecture

Runtime theming, no build step:
1. `style.css` defines `:root` (dark) and `:root.light` defaults.
2. On boot, `theme.js` runs `loadColors()` which reads
   `localStorage['kp-colors']` (a `{ '--token': '#hex' }` map) and applies
   each via `document.documentElement.style.setProperty`.
3. `loadTheme()` adds the `.light` class if `localStorage['kp-theme'] ===
   'light'`.
4. `applyCustomCss()` injects any CSS string saved by `/design-tool` as an
   inline `<style id="kp-custom-css">`.
5. The in-app Design modal (`buildColorGrid`) lets the user pick colours per
   token and switch presets; changes persist to `kp-colors`.
6. `/design-tool` is a standalone page with the same token set plus two
   extra presets (`forest`, `rose`) and a custom-CSS editor; it exports via
   `/api/design/export-css`.

**Known issue — `theme-toggle` is dead**: `toggleTheme()`/`loadTheme()`
reference a `#theme-toggle` DOM node that does not exist, and the drawer
item that would call it is commented out (`index.html`). Theme switching is
done via the Design panel presets, not a quick toggle.

## 8. PWA

- `static/manifest.json` — `theme_color #e8ff47`, `background_color #0d0d0d`,
  standalone display, icons at 192/512.
- `static/service-worker.js` — cache-first with `CACHE_NAME
  'konzertplaner-v3'`. Caches `/`, `index.html`, `manifest.json`, `style.css`.
  The cache version must be bumped whenever the shell files change
  (notably after the ES module split, since `app.js` is replaced by
  `static/js/*.js`).

## 9. Known issues / debt

- `theme-toggle` dead code (see §7).
- Two divergent `fmtPrice` implementations existed (no-comma vs
  German-comma); unified to the German-comma form in `utils.js`.
- `_statEvents` was declared both as a local in `renderStatsHtml` and as a
  module global; consolidated into the `tools.js` module scope.
- The map re-init block (remove markers → `mapInstance.remove()` →
  `setTimeout(initMap, 100)`) was duplicated across three filter handlers;
  extracted into `resetMap()` in `map.js`.
- `window._eventimTours` was a window side-channel; moved to module scope
  in `eventim.js`.
- `_admLastSlot` was a window side channel; moved to module scope in
  `catalogues.js`.
