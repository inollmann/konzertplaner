# Zeitstrahl Re-Implementation Plan

## 1. Problem Analysis (current bugs)

| # | Bug | Location |
|---|-----|----------|
| 1 | Zoom buttons don't actually zoom — day width is derived from the full span of all events (`timelineFullMonths`), not from the zoom level. `zoomMonths` only toggles tick density. | [`getDayWidth()`](static/app.js:2020), [`renderTimeline()`](static/app.js:2041) |
| 2 | 5 zoom levels incl. "2 Wochen"; default is "1 Jahr". Spec wants 4 levels, default "6 Monate". | [`zoomLabels`](static/app.js:19) / [`zoomMonths`](static/app.js:20) |
| 3 | Zoom does not remember the visible position (no center anchor preserved across re-render). | [`timelineZoom()`](static/app.js:1945) |
| 4 | Whole event range rendered at once; drag stops at the data edges — not virtually infinite. | [`initTimeline()`](static/app.js:1841), [`renderTimeline()`](static/app.js:2041) |
| 5 | "Heute at 10%" math is coupled to the broken day width, so it lands in the wrong place. | [`timelineToday()`](static/app.js:2028) |
| 6 | Festival logos not implemented at all; band logos only show at zoom level ≥ 3. | [`renderTimeline()`](static/app.js:2238) |
| 7 | Festival model has no `logo` field; no upload endpoint; no form UI. | [`Festival`](concert.py:180), [`main.py`](main.py:480) |

## 2. New Architecture: Epoch-based Virtual Timeline

### 2.1 State (single source of truth)
```js
const TIMELINE_EPOCH = new Date(2000, 0, 1);          // fixed pixel origin
const DAY_MS = 86400000;

const ZOOM_LEVELS = [
  { label: '1 Jahr',   days: 365 },
  { label: '6 Monate', days: 183 },   // DEFAULT
  { label: '3 Monate', days: 91  },
  { label: '1 Monat',  days: 30  },
];
let tlZoom = 1;                  // index into ZOOM_LEVELS, default 6 Monate
let tlCenterDate = new Date();   // date shown at viewport center; preserved on zoom
let tlMinDate, tlMaxDate;        // track span (all events + buffer, min ±years)
```

### 2.2 Pixel mapping (independent of scroll)
```js
dayWidth  = viewportWidth / ZOOM_LEVELS[tlZoom].days
dateToPx(d) = (d - TIMELINE_EPOCH) / DAY_MS * dayWidth
pxToDate(p) = TIMELINE_EPOCH + (p / dayWidth) * DAY_MS
```
Track width = `dateToPx(tlMaxDate) - dateToPx(tlMinDate)`.

### 2.3 Position memory
- On **drag/scroll**: `tlCenterDate = pxToDate(scrollLeft + viewportWidth/2)` (rAF-throttled).
- On **zoom change**: `tlCenterDate` stays; set `scrollLeft = dateToPx(tlCenterDate) - viewportWidth/2`.
- On **tab open** and **Heute button**: place today at 10% →
  `tlCenterDate = today + (0.5 - 0.10) * ZOOM_LEVELS[tlZoom].days`, then scroll.

### 2.4 Virtualization
On render + on scroll (throttled):
1. `visLeft  = pxToDate(scrollLeft - BUFFER_PX)`
2. `visRight = pxToDate(scrollLeft + viewportWidth + BUFFER_PX)` (BUFFER_PX ≈ 1 viewport)
3. Render only: month/day ticks, the today line, and events whose `[start,end]` overlaps `[visLeft, visRight]`.

Track span is generous (`tlMinDate = min(today, earliestEvent) - 3y`, `tlMaxDate = max(today, latestEvent) + 10y`) so dragging always has room; if the user scrolls within `BUFFER` of an edge, extend `tlMin/MaxDate` by another buffer chunk and re-render (true infinite feel).

### 2.5 Next/previous event navigation
- Reference = current `tlCenterDate` (lets you walk forward/backward through events with repeated clicks).
- Next: smallest event date > center. Prev: largest event date < center.
- On jump: `tlCenterDate = eventDate`, re-scroll to center it.

### 2.6 Zoom levels & ticks
| Zoom | Visible | Axis rendering |
|------|---------|----------------|
| 1 Jahr | 365 d | 12 month labels |
| 6 Monate | 183 d | 6 month labels + light week ticks |
| 3 Monate | 91 d | month labels + day ticks (no numbers) |
| 1 Monat | 30 d | month label + day ticks with day numbers |

## 3. Festival Logo Feature (new)

### 3.1 Backend
- [`Festival`](concert.py:180): add `logo: str | None` to `__init__`, `_base_dict`/`to_dict`, `from_dict`.
- [`main.py`](main.py:13): add `FESTIVAL_LOGO_DIR = static/festival-logos`; mkdir.
- New endpoint `POST /api/upload-festival-logo` (reuse [`_save_upload`](main.py:264)).
- [`create_event`](main.py:480) / [`update_event`](main.py:533): read & persist `logo` for festivals (so logos can be added to **existing** festivals later).
- [`get_event_invite`](main.py:597) / [`import_event_invite`](main.py:683): include `fl` (festival logo) key.

### 3.2 Frontend form
- [`festival-form`](static/index.html:316): add a logo upload zone (click / drag-drop / Strg+V) next to the poster zone (restructure `tour-form-top` to two upload columns for festivals).
- Mirror the poster pattern: `pendingFestLogo`, `savedFestLogo`, `setFestivalLogoPreview()`, `previewFestivalLogo()`, paste handler, `uploadFestivalLogoIfNeeded()`.
- [`openEventModal`](static/app.js:2356): populate logo preview from `ev?.logo`.
- [`saveEvent`](static/app.js:2649): upload pending blob, include `logo` in festival payload.

### 3.3 Frontend display
- [`buildDetailHTML`](static/app.js:1202): render festival logo next to the title (and in the header row).
- Timeline festival entries: render `ev.logo` image (not poster, not band logos).
- **Scope (confirmed)**: festival logo appears in the **timeline**, the **edit form**, and the **festival detail view** next to the name. Not added to the concert list view.

## 4. Timeline Event Rendering (logos & colors)

- **Logo visibility rule (confirmed)**: logos render at zoom levels **6 Monate, 3 Monate, 1 Monat**; at **1 Jahr** show compact vertical text to avoid clutter.
- **Tour/concert** entry: stack logos of all acts (headliners + `support_present`), resolved via [`artists`](static/app.js:7) catalogue by name.
- **Festival** entry: render `ev.logo` if present, else fallback to name text.
- **Colors**: festival → `.festival` (`--festival`); tour → `.tour` (`--tour`). Keep tickets/watchlist as a subtle accent (border dot) without overriding the type color.

## 5. UI Controls (index.html)
Replace the zoom label + 🔍± with explicit zoom buttons or a 4-step segmented control; keep `Heute`, `‹‹`/`››` (prev/next event), and `‹`/`›` (step by visible range). Wire all to the new functions.

## 6. CSS (style.css)
- Update `.timeline-controls` for the new button layout.
- Add `.timeline-event-logo`, `.timeline-event-logos` (flex wrap, circular logos).
- Ensure `.timeline-event.festival` / `.timeline-event.tour` color rules are the single source of type color.
- Add festival-logo styles for the form + detail view.

## 7. Test/Verify
- Open calendar tab → today at 10%, default 6 Monate.
- Switch zoom → January 2027 stays centered.
- Drag past the last event → keeps scrolling (virtualization).
- ‹‹ / ›› walk through events; Heute resets.
- Add a festival logo to an existing festival, see it in detail + timeline.
- Tours show band logos; festivals show festival logo; colors correct.
