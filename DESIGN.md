# Konzertplaner — Design Reference

Living documentation of the visual language and theming architecture of the
Konzertplaner app. Captures the *current* identity so that future changes are
intentional rather than accidental. Source of truth is `static/style.css`
(tokens) and `static/js/theme.js` (runtime theming).

## 1. Identity

A personal concert/tour planner with a dark, high-contrast, "neon-on-black"
aesthetic. The default theme reads as a music-app: near-black background, a
single chartreuse accent (`#e8ff47`), stage-cyan for tours and festival-rose
for festivals. Typography pairs a condensed display face (Bebas Neue) for
headings/logo with a humanist sans (DM Sans) for body. The UI is in German.

Design goals:
- **Legibility first** on a dark surface: high text contrast, generous
  spacing, large tap targets.
- **Type colour as semantics**: tour vs festival is the central dichotomy and
  is signalled by colour everywhere (badges, timeline bars, map markers,
  histogram bars, calendar events).
- **Calm density**: a lot of information per card (date, venue, city, time,
  price, tags, support acts, ratings) but never cramped — soft corners via
  `--radius-*` tokens, 1px low-opacity borders, and surface layering carry the
  hierarchy instead of heavy rules.
- **Signature element**: the ZEITSTRAHL timeline — the app's distinctive
  view, announced by an accent-coloured title with an animated underline
  reveal (see §6 Motion).
- **No build step**: the SPA is plain ES modules served as-is by Flask. No
  framework, no bundler, no CSS preprocessor. This is a selling point and
  must be preserved.

## 2. Token system

All design tokens live as CSS custom properties on `:root` (dark default);
colour overrides live under `:root.light`. The design panel (`/design-tool`
and the in-app Design modal) mutates `document.documentElement.style` and
persists overrides to `localStorage['kp-colors']`.

### Colour tokens

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

### Typography tokens

Fluid display sizes (Bebas Neue) using `clamp()` for responsive scaling:

| Token            | Min     | Preferred           | Max     | Usage                           |
|-------------------|---------|---------------------|---------|---------------------------------|
| `--display-xl`    | 1.6rem  | `4vw + 1rem`        | 2.2rem  | `.stat-value`                   |
| `--display-lg`     | 1.4rem  | `3vw + .8rem`       | 2rem    | Logo, modal/detail titles, ZEITSTRAHL |
| `--display-md`     | 1.2rem  | `2vw + .7rem`       | 1.5rem  | `.cal-title`, `.event-title`, empty-state h3 |
| `--display-sm`     | 1.1rem  | `1vw + .8rem`       | 1.3rem  | Card titles, drawer, headers     |
| `--display-xs`     | 1rem    | `.5vw + .85rem`     | 1.1rem  | Popovers, type labels            |

Body sizes (DM Sans):

| Token         | Value                              | Usage                         |
|---------------|------------------------------------|-------------------------------|
| `--text-lg`   | `clamp(15px, .5vw + 14px, 16px)`   | Icon buttons, larger body     |
| `--text-md`   | `15px`                             | Default body (on `html, body`)|
| `--text-sm`   | `13px`                             | Labels, captions, chips       |
| `--text-xs`   | `11px`                             | Meta text, sub-labels         |

Letter-spacing:

| Token            | Value | Usage                               |
|------------------|-------|-------------------------------------|
| `--ls-wide`      | 3px   | Logo only                           |
| `--ls-display`   | 2px   | Most Bebas Neue headings             |
| `--ls-tight`     | 1px   | Popovers, type labels, tools.js     |

### Motion tokens

| Token         | Value                      | Usage                               |
|---------------|----------------------------|-------------------------------------|
| `--dur-fast`  | `.15s`                     | Hover states, pip hover, popovers   |
| `--dur-med`   | `.2s`                      | Border/colour transitions, tabs    |
| `--dur-slow`  | `.3s`                      | Modal/detail/lightbox slide-in     |
| `--ease-out`  | `cubic-bezier(.16,1,.3,1)` | Entrance/reveal animations         |
| `--ease-std`  | `ease`                     | Most transitions                   |

`@media (prefers-reduced-motion: reduce)` globally neutralises all
animations and transitions (style.css, after `:root.light`).

### Overlay tokens

| Token              | Value  | Usage                                    |
|--------------------|--------|------------------------------------------|
| `--overlay-dim`    | `#0007`| Drawer backdrop (lightest)               |
| `--overlay-std`    | `#000b`| Modal + detail backdrops                 |
| `--overlay-focus`  | `#000d`| Lightbox backdrop (darkest)              |
| `--blur-dim`       | `0`    | Drawer (no blur)                         |
| `--blur-std`       | `4px`  | Modal + detail backdrops                 |
| `--blur-focus`     | `6px`  | Lightbox backdrop                        |

### Radius scale
`--radius-sm` (4px) · `--radius-md` (8px) · `--radius-lg` (12px) · `--radius-xl` (16px) · `--radius-pill` (20px) · `--radius-full` (50%)
`--radius` is a legacy alias for `--radius-md`.

### Shadow scale
`--shadow-sm` (subtle) · `--shadow-md` (cards) · `--shadow-lg` (popovers) · `--shadow-xl` (lightbox) · `--shadow-accent` (accent glow) · `--shadow-stripe-tickets` / `--shadow-stripe-watch` (bottom inset stripes for poster-wall/timeline status)

### Spacing scale
`--space-1` (2px) through `--space-14` (36px): 1=2, 2=4, 3=6, 4=8, 5=10, 6=12, 7=14, 8=16, 9=20, 10=24, 12=32, 14=36

### Presets
- **dark** — the default, above.
- **light** — `:root.light`, see colour table.
- **midnight** — deep indigo background (`#04040f` / `#0d0d2b`), cyan accent
  (`#00ffcc`), pink/gold tour/festival. Available in the in-app Design modal.
- **forest** / **rose** — only in the standalone `/design-tool` page, not the
  in-app panel.

### Rating colour scale
Rating pips interpolate hue from `0°` (dark red) at rating 1 to `120°` (dark
green) at rating 10, fixed `sat 70% / light 35%`: see `pipColor()` in
`static/js/utils.js`. Pips above the rating value are transparent (grey
border only). This scale is independent of the secondary palette.

## 3. Typography

Two families, both via Google Fonts CDN (loaded in `index.html` `<link>`):

- **Bebas Neue** — display. Used for the logo `KONZERTPLANER`, section
  headings, modal titles, timeline title `ZEITSTRAHL`, date blocks,
  statistics values, poster-card titles. Letter-spacing via `--ls-*` tokens.
  Weight: 400 (the only weight). Sizes via `--display-*` tokens (fluid
  `clamp()` — see §2).
- **DM Sans** — body. `font-size: var(--text-md)` (15px) on `html, body`.
  Weights 300/400/500/600 + italic 300. Used for all UI text, labels,
  inputs, card content. Sizes via `--text-*` tokens.

No other families are used. The typographic hierarchy is token-driven:
`--display-xl` > `--display-lg` > `--display-md` > `--display-sm` >
`--display-xs` for display; `--text-lg` > `--text-md` > `--text-sm` >
`--text-xs` for body.

## 4. Icons

Icons are Lucide SVG glyphs served via an inline `<symbol>` sprite
(`#ic-sprite` in `index.html`). The `icon()` function in `static/js/icons.js`
generates `<svg class="ic"><use href="#i-NAME"/></svg>` references. Icons
inherit text colour via `stroke="currentColor"`; filled glyphs (e.g.
`star-filled`) use `fill="currentColor"` with a `.filled` class. Icons scale
in `em` units so they track their context's `font-size`.

Available glyphs include: `menu`, `x`, `pencil`, `trash-2`, `link`, `plus`,
`search`, `bell`, `music`, `mic`, `calendar`, `map-pin`, `clock`, `star`,
`star-filled`, `ticket`, `bookmark`, `guitar`, `tent`, `building-2`,
`chevron-left/right`, `chevrons-left/right`, `arrow-up/down`, `disc`,
`bar-chart-2`, `database`, `download`, `sun`, `moon`, `moon-star`,
`sparkles`, `palette`, `paintbrush`, `mail`, `check`, `circle-x`, and more.

## 5. Geometry & layout

- **Radius** — `--radius-md` (8px) for cards, modals, inputs, buttons via the
  `--radius` legacy alias. Larger elements use `--radius-lg` (12px) or
  `--radius-xl` (16px). Chips/tags use `--radius-pill` (20px). Pips use
  `--radius-sm` (4px).
- **Borders** 1px, `var(--border)` (semi-transparent by design — `#2e2e2e44`
  in dark mode). Never 2px.
- **Surfaces** layer via `--surface` → `--surface2` → `--surface3`. Modals
  sit on `--surface`; inputs on `--surface2`; active/hover on `--surface3`.
- **Layout shell**: sticky `<header>` (z 50), tabs row, filter bar, then
  `<main>` per tab. Detail panel is a centred backdrop overlay. Modals are
  centred backdrops. Drawer is a left slide-in.
- **Overlays** use a dimming hierarchy: drawer (lightest, `--overlay-dim`,
  no blur) < modal/detail (`--overlay-std`, 4px blur) < lightbox (darkest,
  `--overlay-focus`, 6px blur).
- **Breakpoints** (see §8 for details):
  - `≥900px` — desktop (3-column histograms, full controls)
  - `≤768px` — tablet (timeline header stacks, detail padding reduced)
  - `≤640px` — mobile (bottom-sheet detail, collapsible search, stacked
    grids, compact poster wall, full-width notifications)
  - `≤480px` — phone (tighter header, smaller logo, 2-column poster wall)

## 6. Components

- **Event card** (`renderTourCard` / `renderFestCard`) — poster thumb + meta
  (type badge, title, subtitle, support) + concert rows. Festival cards
  collapse to a single date row. Past events show inline rating bars.
- **Poster wall** (`renderWallCard`) — alternative list view: large
  poster-led cards in a responsive grid (`auto-fill, minmax(240px, 1fr)`).
  Title/date/venue overlaid at the bottom via `.poster-card-overlay` (z 2)
  over a `.poster-card::after` gradient scrim (z 1). Tickets/watchlist
  status shown as a 3px bottom inset stripe (`--shadow-stripe-*`).
  Placeholder cards show a gradient background with a music/disc icon.
- **Date block** — stacked `day / month / year` with optional `→ end` label.
  Day is large Bebas Neue (`--display-lg`); month is short uppercase German
  (`de-DE`).
- **Type badge** — small uppercase pill, coloured by `--tour` / `--festival`.
- **Tags** — SVG-icon chips: `ticket` icon (teal) / `bookmark` icon (orange).
  Toggle style in the detail view (`tag-toggle` with `active-*` states).
- **Filter chips** — `filter-chip` with `active-past`, `active-upcoming`,
  `active-tour`, `active-festival`, `active-tickets`, `active-watchlist`
  colour states. Toggle semantics: clicking the active date filter cycles
  through `past → upcoming → both`.
- **Rating bar** — 10 pips; click a pip to set the rating; `✕` to reset.
  See colour scale §2. Pip hover: `scaleY(1.35)` over `--dur-fast`.
- **Pills** — tag input with autocomplete (`pill-field`, `pill-input`,
  `ac-drop`). Supports drag-reorder, comma/enter to commit, backspace to
  delete.
- **Modals** — `modal-backdrop` + `modal` with a title row, body, and
  `form-actions`. Close on backdrop click, `Esc`, or `✕`. Backdrop uses
  `--overlay-std` + `--blur-std`.
- **Detail panel** — `detail-backdrop` + `detail-panel`, lower z-index
  (150) than modals (300). On mobile (≤640px) becomes a bottom sheet
  sliding from `translateY(100%)`.
- **Lightbox** — highest overlay (`--overlay-focus` + `--blur-focus`,
  z 500). Image scales 0.92 → 1 over `--dur-slow`.
- **Drawer** — left slide-in, lightest overlay (`--overlay-dim`, no blur),
  280px width.
- **Timeline** — epoch-based (2000-01-01 → 2100-01-01), virtualised,
  drag-to-scroll, zoom levels (1 Jahr / 6 Monate / 3 Monate / 1 Monat).
  Single-row layout with interval partitioning for overlaps. Logos/posters
  shown at 6M and below. Today line labelled `HEUTE`. The title `ZEITSTRAHL`
  is the app's signature element: `--display-lg` size, `--accent` colour,
  with an animated accent underline (`@keyframes drawIn`, 0 → 100% width
  over `--dur-slow` with `--ease-out` and 0.1s delay).
- **Map** — Leaflet + OpenStreetMap tiles. Markers grouped by geocoded
  venue, coloured tour/festival/mixed, with a count badge. Unrecognised
  venues fall into a manual-placement list. Geocoding via Nominatim,
  cached in `localStorage['kp-venue-cache']`. On mobile (≤640px) legend
  stacks vertically below the map.
- **Histograms** — rating / year / city bars, two-coloured by tour vs
  festival. Hover tooltip lists the events in the bucket.
- **Empty states** — unified `.empty-state` system across all 10 contexts:
  52px icon at 0.4 opacity + Bebas Neue headline (`--display-md`) + DM Sans
  invitation text (`--text-sm`, muted). German, action-oriented copy
  ("Leg dein erstes Event an" not "Keine Daten"). Used in: list (upcoming/
  past), shows, favourites, notifications, catalogues (artists/venues),
  Eventim search, fav-card body, histograms.

## 7. Motion

Motion is token-driven and minimal:

- **Duration tokens**: `--dur-fast` (.15s), `--dur-med` (.2s), `--dur-slow`
  (.3s) — applied to all `transition` and `animation` declarations.
- **Easing tokens**: `--ease-out` (cubic-bezier for entrances), `--ease-std`
  (ease for most transitions).
- **Entrance animations**: `@keyframes fadeUp` (opacity + translateY) on
  event cards, poster cards, favourite cards. `@keyframes drawIn` (width
  0 → 100%) on the ZEITSTRAHL title underline. `@keyframes spin` on the
  search spinner.
- **Hover micro-interactions**: colour/border transitions (`--dur-fast`),
  poster-card image zoom (scale 1.05, `--dur-slow`), pip hover (scaleY
  1.35, `--dur-fast`), timeline event hover (scale 1.02 + brightness 1.15).
- **Overlay transitions**: modal/detail/lightbox slide up 18px → 0
  (`--dur-slow`); drawer slide-in (`--dur-slow`); backdrop opacity fade
  (`--dur-med`).
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` globally
  sets all animation/transition durations to `.01ms`.
- **Timeline drag** uses native `scrollLeft` + `requestAnimationFrame`-
  throttled re-render (no JS animation libs).
- No page transitions, no skeleton screens, no toast animations. Loading
  states are text (`⏳ Lade …`) or a spinner dot (`search-spinner`).

## 8. Responsive design

The app is desktop-first with four breakpoints:

| Breakpoint | Target | Key changes |
|------------|--------|-------------|
| `≤900px` | Small desktop/tablet | Histograms collapse to 1 column |
| `≤768px` | Tablet | Timeline header stacks (title above controls); detail padding reduced; map height reduced |
| `≤640px` | Mobile | Bottom-sheet detail panel (`translateY(100%)` → `0`); collapsible search (40px → expandable); stacked detail header (poster 64px); stacked concert grid; compact timeline (160px viewport); full-width notifications; poster wall `minmax(160px)`; reduced modal padding |
| `≤480px` | Phone | Tighter header gaps; smaller logo (`--display-md`); 2-column poster wall (`minmax(140px)`); smaller tab padding; stacked histograms |

Display typography is fluid via `clamp()` in the `--display-*` tokens —
type scales smoothly with viewport width rather than jumping at
breakpoints. Body text uses `--text-md` (fixed 15px) as the base, with
`--text-lg` being fluid.

## 9. Theming architecture

Runtime theming, no build step:
1. `style.css` defines `:root` (dark) and `:root.light` defaults for colour
   tokens. Typography, motion, overlay, radius, shadow, and spacing tokens
   are theme-independent (same in dark and light).
2. On boot, `theme.js` runs `loadColors()` which reads
   `localStorage['kp-colors']` (a `{ '--token': '#hex' }` map) and applies
   each via `document.documentElement.style.setProperty`.
3. `loadTheme()` adds the `.light` class if `localStorage['kp-theme'] ===
   'light'`.
4. `applyCustomCss()` injects any CSS string saved by `/design-tool` as an
   inline `<style id="kp-custom-css">`.
5. `toggleTheme()` toggles the `.light` class on `<html>` and persists to
   `kp-theme`. Called from the drawer menu item. Guards against a missing
   `#theme-toggle` node (legacy dead reference, now no-op safe).
6. `applyTheme(themeKey)` applies a named preset ('dark', 'light',
   'midnight') by setting multiple colour tokens at once.
7. The in-app Design modal (`buildColorGrid`) lets the user pick colours
   per token and switch presets; changes persist to `kp-colors`.
8. `/design-tool` is a standalone page with the same token set plus two
   extra presets (`forest`, `rose`) and a custom-CSS editor; it exports
   via `/api/design/export-css`.

## 10. PWA

- `static/manifest.json` — `theme_color #e8ff47`, `background_color #0d0d0d`,
  standalone display, icons at 192/512.
- `static/service-worker.js` — cache-first with `CACHE_NAME
  'konzertplaner-v7'`. Registered at `/service-worker.js` (served by Flask
  via a dedicated route in `main.py`). The cache version must be bumped
  whenever shell files change.

## 11. Known issues / debt

- **Inline-style de-inlining**: ~113 inline `style="..."` blocks remain in
  JS-generated HTML. Deferred to future cleanup.
- **Legacy image UUIDs**: old UUID-named image files in
  `static/posters|logos|festival-logos/` from the pre-PostgreSQL era are no
  longer used but not yet cleaned up.
- **`fav-empty` class**: still used by 3 non-empty-state messages in
  `favourites.js` (error messages, search no-results). The class was kept
  when empty states were unified because these contexts are not true empty
  states.
- **Search on mobile**: `.search-wrap.expanded` CSS exists but JS toggle
  is not yet wired — search is collapsed to 40px on mobile (icon visible,
  input not easily accessible until tapped).
- `fmtPrice` was unified to the German-comma form in `utils.js`.
- `_statEvents` was consolidated into the `tools.js` module scope.
- The map re-init block was extracted into `resetMap()` in `map.js`.
- `window._eventimTours` was moved to module scope in `eventim.js`.
- `_admLastSlot` was moved to module scope in `catalogues.js`.
