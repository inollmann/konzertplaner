// ══════════════════════════════════════════════════════════════════════
// logo-editor.js — monochrome logo helper (background removal + recolor)
//
// Opens a canvas-based editor on an artist's original `logo` that lets the
// user sample the background color, dial in a tolerance, and produce a
// white-on-transparent PNG stored as the artist's `logo_mono` field. The
// light-mode "black" version is derived purely via CSS `filter: invert(1)`
// (see `.mono-logo` in style.css), so no second asset is stored.
//
// The original `logo` is never overwritten — re-editing always starts from
// the unmodified source. Opened from a sparkles overlay button injected
// onto `#adm-logo-inner` by `catalogues.js` when the artist has a logo.
//
// Inline handlers (`openLogoEditorById`, `saveLogoEdit`, `lePickColor`,
// `leReset`) are exposed on `window` via globals.js.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { openModal, closeModal, showAlert } from './ui.js';
import { reloadCatalogue, uploadArtistImg } from './api.js';

let _ieArtist = null;       // current Artist object
let _ieImage = null;        // HTMLImageElement of the source logo
let _ieCanvas, _ieCtx;      // preview canvas + 2d context
let _ieOrigData = null;     // Uint8ClampedArray of the (possibly cropped) pixels
let _ieSourceUrl = null;    // image source URL — '/api/img/<uuid>' or a 'blob:' URL
let _ieSourceBlob = null;   // pending upload blob (set when source is a new upload); null when re-editing a server logo
let _ieBgColor = [255, 255, 255]; // sampled background RGB
let _ieTolerance = 40;      // RGB Euclidean distance threshold
let _ieFeather = true;      // anti-alias the alpha edge
let _iePicking = false;     // true while pipette mode is active
let _ieCropping = false;    // true while crop mode is active
let _ieCropRect = null;      // {x,y,w,h} in canvas px, or null
let _ieDragMode = null;      // 'draw' | 'move' | 'resize-<dir>' during a drag
let _ieDragStart = null;     // {x, y, rect} snapshot at drag start

/**
 * Open the logo editor for the artist with the given id. Resolves the
 * artist from `state.artists` (refreshed by reloadCatalogue before this is
 * called from the overlay button, so the object is current). Requires the
 * artist to have an original `logo` to process.
 * @param {string} id artist id
 */
export function openLogoEditorById(id) {
  const a = state.artists.find(x => x.id === id);
  if (!a) { showAlert('Artist nicht gefunden.'); return; }
  openLogoEditor(a);
}

/**
 * Open the logo editor for artist `a`, load the original logo into the
 * canvas, auto-suggest a background color from the corner pixels, and
 * show the modal.
 * @param {any} a artist catalogue entry with a `logo` UUID
 */
export function openLogoEditor(a) {
  if (!a.logo) { showAlert('Bitte zuerst ein Logo hochladen.'); return; }
  _openEditor(a, '/api/img/' + a.logo);
}

/**
 * Open the logo editor for artist `a` using a pending upload `blob` as the
 * source — lets the user edit the monochrome logo immediately after picking
 * a file, without first saving the artist card. The `blob` is the staged
 * upload from the destination-choice popup in `catalogues.js`; it is NOT
 * yet persisted. On save, the raw blob is uploaded as `logo` and the
 * processed canvas as `logo_mono` (both fields in one PUT). Derived/new
 * artists have no `id`, so saving is blocked in `saveLogoEdit` with a hint.
 * @param {any} a artist catalogue entry (may be derived/new)
 * @param {Blob} blob pending logo upload
 */
export function openLogoEditorFromBlob(a, blob) {
  _openEditor(a, URL.createObjectURL(blob), blob);
}

/**
 * Shared open: reset state, prime the canvas + controls, set the image
 * source URL, and kick off loading. `_exitCrop()` first so any stale crop
 * state from a previous session closed mid-crop (closeModal doesn't call
 * _exitCrop) is cleared — otherwise the next open starts with a dimmed,
 * crosshair-over-canvas, highlighted-toggle state.
 * @param {any} a artist
 * @param {string} srcUrl image source URL (server or blob:)
 * @param {Blob | null} [srcBlob] pending upload blob (null when re-editing a server logo)
 */
function _openEditor(a, srcUrl, srcBlob = null) {
  _ieArtist = a;
  _exitCrop();
  _ieSourceUrl = srcUrl;
  _ieSourceBlob = srcBlob;
  _ieBgColor = [255, 255, 255];
  _ieTolerance = 40;
  _ieFeather = true;
  _ieCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('ie-canvas'));
  _ieCtx = /** @type {CanvasRenderingContext2D} */ (_ieCanvas.getContext('2d', { willReadFrequently: true }));
  document.getElementById('ie-tolerance').value = String(_ieTolerance);
  document.getElementById('ie-feather').checked = _ieFeather;
  document.getElementById('ie-pick-btn').classList.remove('active');
  _iePicking = false;
  document.getElementById('ie-hint').textContent =
    'Original wird geladen …';
  openModal('logo-edit-modal');
  void _loadAndDraw();
}

/** Load the source logo image, draw it to the canvas, and kick off the initial preview. */
async function _loadAndDraw() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    _ieImage = img;
    // Cap canvas dimensions so huge logos don't blow up memory; keep aspect.
    const maxDim = 700;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const s = maxDim / Math.max(w, h);
      w = Math.round(w * s); h = Math.round(h * s);
    }
    _ieCanvas.width = w; _ieCanvas.height = h;
    _ieCtx.drawImage(img, 0, 0, w, h);
    try {
      _ieOrigData = _ieCtx.getImageData(0, 0, w, h).data;
    } catch {
      document.getElementById('ie-hint').textContent =
        'Pixel-Zugriff blockiert (CORS). Logo muss von dieser Domain stammen.';
      _ieOrigData = null;
      return;
    }
    const single = _detectSingleColor(_ieOrigData);
    if (single) {
      _ieBgColor = [255 - single[0], 255 - single[1], 255 - single[2]];
      _syncControls();
      _render();
      document.getElementById('ie-hint').textContent =
        'Nur eine Farbe erkannt — als Vordergrund angenommen, Hintergrund auf Komplement gesetzt.';
    } else {
      _ieBgColor = _suggestBg(_ieOrigData, w, h);
      _syncControls();
      _render();
      document.getElementById('ie-hint').textContent =
        'Pipette auf den Hintergrund klicken, Toleranz anpassen, dann „Anwenden“.';
    }
  };
  img.onerror = () => {
    document.getElementById('ie-hint').textContent = 'Logo konnte nicht geladen werden.';
  };
  img.src = _ieSourceUrl;
}

/**
 * Detect whether the image is effectively single-color-on-transparent: at
 * least 5% of pixels are transparent, and ≥60% of the opaque pixels are
 * within Euclidean distance 48 of one dominant color. Returns that color so
 * the caller can treat it as the foreground and set the background to its
 * RGB complement (maximally distant, so tolerance can't eat the fg). Returns
 * null for the common 2-color or fully-opaque cases — those keep the corner
 * fallback. The 5% transparency gate targets the user's described scenario
 * (transparent bg + single fg color) and protects multi-color logos.
 * @param {Uint8ClampedArray} data
 * @returns {[number, number, number] | null}
 */
function _detectSingleColor(data) {
  const MIN_TRANSPARENT_FRAC = 0.05;  // require some transparent pixels
  const MATCH_DIST = 48;              // tolerance for "near dominant"
  const MIN_DOMINANT_FRAC = 0.60;     // majority of opaque pixels
  const BUCKET = 16;                 // color quantization for bucketing
  let opaque = 0, transparent = 0;
  /** @type {Record<string, number[]>} bucket key -> running [r,g,b,count] */
  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) { transparent++; continue; }
    opaque++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r - (r % BUCKET)) + ',' + (g - (g % BUCKET)) + ',' + (b - (b % BUCKET));
    const bkt = buckets[key];
    if (bkt) { bkt[0] += r; bkt[1] += g; bkt[2] += b; bkt[3]++; }
    else { buckets[key] = [r, g, b, 1]; }
  }
  const total = opaque + transparent;
  if (total === 0) return null;
  if (transparent / total < MIN_TRANSPARENT_FRAC) return null;
  if (opaque === 0) return null;
  let bestKey = null, bestN = 0;
  for (const [key, bkt] of Object.entries(buckets)) {
    if (bkt[3] > bestN) { bestN = bkt[3]; bestKey = key; }
  }
  const best = buckets[/** @type {string} */ (bestKey)];
  /** @type {[number, number, number]} */
  const dom = [Math.round(best[0] / best[3]), Math.round(best[1] / best[3]), Math.round(best[2] / best[3])];
  // Count opaque pixels within MATCH_DIST of the dominant color (distance-based,
  // not strict bucket equality, so anti-aliased edges fading toward transparent
  // don't fragment the foreground).
  let near = 0;
  const [dr, dg, db] = dom;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const pr = data[i] - dr, pg = data[i + 1] - dg, pb = data[i + 2] - db;
    if (Math.sqrt(pr * pr + pg * pg + pb * pb) <= MATCH_DIST) near++;
  }
  if (near / opaque < MIN_DOMINANT_FRAC) return null;
  return dom;
}

/**
 * Auto-suggest a background color from the canvas corners (the most common
 * corner color). Fully transparent corners are skipped so a logo that
 * already has a transparent background doesn't get a bogus (0,0,0)
 * suggestion; if every corner is transparent, fall back to white (the most
 * common solid background).
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} h
 * @returns {[number, number, number]}
 */
function _suggestBg(data, w, h) {
  const corners = [
    _pxa(data, w, 0, 0),
    _pxa(data, w, w - 1, 0),
    _pxa(data, w, 0, h - 1),
    _pxa(data, w, w - 1, h - 1),
  ];
  // Keep only opaque-ish corners (alpha > 0) for a meaningful color sample.
  const opaque = corners.filter(c => c[3] > 0);
  if (!opaque.length) return [255, 255, 255];
  // Pick the most frequent corner color — robust to a single off-corner pixel.
  const counts = {};
  /** @type {[number, number, number]} */
  let best = [opaque[0][0], opaque[0][1], opaque[0][2]];
  let bestN = 0;
  for (const c of opaque) {
    const key = c[0] + ',' + c[1] + ',' + c[2];
    counts[key] = (counts[key] || 0) + 1;
    if (counts[key] > bestN) { bestN = counts[key]; best = [c[0], c[1], c[2]]; }
  }
  return best;
}

/**
 * Read the RGBA quad at (x,y) from a flat pixel array of width w.
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} x
 * @param {number} y
 * @returns {[number, number, number, number]}
 */
function _pxa(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/**
 * Read the RGBA quad at (x,y) from a flat pixel array of width w.
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} x
 * @param {number} y
 * @returns {[number, number, number]}
 */
function _px(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

/** Push the current `_ieBgColor` into the color input + hex label. */
function _syncControls() {
  const hex = '#' + _ieBgColor.map(c => c.toString(16).padStart(2, '0')).join('');
  document.getElementById('ie-bg-color').value = hex;
  document.getElementById('ie-bg-hex').textContent = hex.toUpperCase();
}

/** Re-run the monochrome transform and repaint the canvas from `_ieOrigData`. */
function _render() {
  if (!_ieOrigData) return;
  const w = _ieCanvas.width, h = _ieCanvas.height;
  const out = new ImageData(w, h);
  const od = _ieOrigData, nd = out.data;
  const [br, bg, bb] = _ieBgColor;
  const tol = _ieTolerance;
  const lo = tol * 0.6;     // start of feather band
  const feather = _ieFeather && tol > lo;
  for (let i = 0; i < od.length; i += 4) {
    const dr = od[i] - br, dg = od[i + 1] - bg, db = od[i + 2] - bb;
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    const a = od[i + 3];
    if (d > tol) {
      // foreground → pure white, keep original alpha
      nd[i] = 255; nd[i + 1] = 255; nd[i + 2] = 255; nd[i + 3] = a;
    } else if (feather && d > lo) {
      // transition band → fade alpha so edges anti-alias
      const t = (tol - d) / (tol - lo);   // 1 (near fg) .. 0 (near bg)
      nd[i] = 255; nd[i + 1] = 255; nd[i + 2] = 255;
      nd[i + 3] = Math.round(a * t);
    } else {
      // background → transparent
      nd[i] = 0; nd[i + 1] = 0; nd[i + 2] = 0; nd[i + 3] = 0;
    }
  }
  _ieCtx.putImageData(out, 0, 0);
  // Mirror the processed canvas into the dark/light preview swatches so the
  // user sees the real result on both theme backgrounds. The light swatch's
  // inner img carries the `mono-logo` class so the CSS invert rule applies.
  try {
    const url = _ieCanvas.toDataURL('image/png');
    const d = document.getElementById('ie-preview-dark');
    const l = document.getElementById('ie-preview-light');
    if (d) d.src = url;
    if (l) l.src = url;
  } catch { /* toDataURL can throw if tainted; preview is non-critical */ }
}

/** Toggle pipette mode (click canvas to sample background color). @param {Event} e */
export function lePickColor(e) {
  e.preventDefault();
  _iePicking = !_iePicking;
  document.getElementById('ie-pick-btn').classList.toggle('active', _iePicking);
  _ieCanvas.style.cursor = _iePicking ? 'crosshair' : '';
}

/**
 * Canvas click handler: when pipette mode is on, sample the clicked
 * pixel as the new background color and re-render.
 * @param {MouseEvent} e
 */
export function leCanvasClick(e) {
  if (!_iePicking || !_ieOrigData) return;
  const rect = _ieCanvas.getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) * (_ieCanvas.width / rect.width));
  const y = Math.round((e.clientY - rect.top) * (_ieCanvas.height / rect.height));
  _ieBgColor = _px(_ieOrigData, _ieCanvas.width, x, y);
  _syncControls();
  _iePicking = false;
  document.getElementById('ie-pick-btn').classList.remove('active');
  _ieCanvas.style.cursor = '';
  _render();
}

/** Manual color-input change handler. @param {Event} e */
export function leColorChange(e) {
  const hex = /** @type {HTMLInputElement} */ (e.target).value;
  _ieBgColor = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  document.getElementById('ie-bg-hex').textContent = hex.toUpperCase();
  _render();
}

/** Tolerance slider input handler. @param {Event} e */
export function leToleranceChange(e) {
  _ieTolerance = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
  _render();
}

/** Feather checkbox change handler. @param {Event} e */
export function leFeatherChange(e) {
  _ieFeather = /** @type {HTMLInputElement} */ (e.target).checked;
  _render();
}

/**
 * Persist the processed canvas as the artist's `logo_mono`. When the source
 * was a new upload blob (`_ieSourceBlob`), the raw blob is also uploaded as
 * `logo` (original colors) and both fields are PUT in one request — so the
 * full "upload → bg-remove → crop → save" flow persists both the original
 * logo and its monochrome derivative. When re-editing a server logo (no
 * `_ieSourceBlob`), only `logo_mono` is PUT (the original `logo` is kept).
 * @returns {Promise<void>}
 */
export async function saveLogoEdit() {
  if (!_ieArtist || !_ieOrigData) { showAlert('Nichts zu speichern.'); return; }
  // Exit crop mode + repaint the processed canvas before exporting, so
  // saving while still cropping exports the monochrome result (crop mode
  // shows the original via _showOriginal, which would otherwise be saved).
  _exitCrop();
  _render();
  const monoBlob = await new Promise(resolve => _ieCanvas.toBlob(resolve, 'image/png'));
  if (!monoBlob) { showAlert('Export fehlgeschlagen.'); return; }
  // Derived/new artists have no `id` — can't PUT. Stage the mono canvas + raw
  // upload blob as pending; catalogues.js persists both when the card is saved.
  if (!_ieArtist.id) {
    window.dispatchEvent(new CustomEvent('logo-pending', {
      detail: { monoBlob, rawBlob: _ieSourceBlob }
    }));
    if (_ieSourceUrl && _ieSourceUrl.startsWith('blob:')) {
      URL.revokeObjectURL(/** @type {string} */ (_ieSourceUrl));
    }
    closeModal('logo-edit-modal');
    return;
  }
  // Canvas Blobs have no filename; pass one explicitly so the backend's
  // allowed_file() extension check passes (api.js uploadArtistImg default
  // would yield "blob", which has no extension and is rejected).
  const logoMonoId = await uploadArtistImg(monoBlob, _ieArtist.name, 'logo-mono', 'logo-mono.png');
  // When the source was a new upload, also persist the raw blob as `logo`
  // (original colors). Both fields go in one PUT.
  /** @type {Record<string, string>} */
  const payload = { logo_mono: logoMonoId };
  if (_ieSourceBlob) {
    const logoId = await uploadArtistImg(_ieSourceBlob, _ieArtist.name, 'logo', 'logo.png');
    payload.logo = logoId;
  }
  await fetch('/api/artists/' + _ieArtist.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await reloadCatalogue();
  // Re-seed the artist detail modal so the new logo + mono are visible.
  // Both fields are now persisted (when source was a blob, `logo` was just
  // uploaded too), so openArtistDetail(refreshed) won't lose any pending
  // upload — there is none. Revoke the blob URL if the source was a blob.
  const adm = document.getElementById('artist-detail-modal');
  if (adm && adm.classList.contains('open')) {
    const refreshed = state.artists.find(x => x.id === _ieArtist.id);
    if (refreshed) window.openArtistDetail?.(refreshed);
  }
  if (_ieSourceUrl && _ieSourceUrl.startsWith('blob:')) {
    URL.revokeObjectURL(/** @type {string} */ (_ieSourceUrl));
  }
  closeModal('logo-edit-modal');
}

// ══════════════════════════════════════════════════════════════════════
// Crop mode — non-destructive session crop of the working pixels.
//
// Toggled by the "Zuschneiden" button. While active, the canvas shows the
// (possibly already-cropped) original pixels so the user can see real
// content while drawing/moving/resizing the selection. The bg/tolerance/
// feather controls are disabled (they would have no visible effect on the
// unprocessed canvas). "Zuschneiden" commits the sub-rect into a new
// `_ieOrigData` and resizes the canvas; "Abbrechen" discards the selection.
// Reopening the editor always reloads the full original from the server,
// so crop never touches the stored `logo`.
// ══════════════════════════════════════════════════════════════════════

const CROP_MIN = 10; // minimum selection edge in canvas px

/** Toggle crop mode: enter if inactive; if active with a valid selection,
 *  apply it; if active with no selection, cancel. */
export function leToggleCrop() {
  if (!_ieCropping) { _enterCrop(); return; }
  const r = _ieCropRect;
  if (r && r.w >= CROP_MIN && r.h >= CROP_MIN) { leApplyCrop(); return; }
  _exitCrop();
  _render();
}

/** Enter crop mode: disable pipette, show original, reveal overlay + selection. */
function _enterCrop() {
  if (!_ieOrigData) return;
  _ieCropping = true;
  _iePicking = false;
  document.getElementById('ie-pick-btn').classList.remove('active');
  _ieCanvas.style.cursor = '';
  document.getElementById('logo-edit-modal').classList.add('cropping');
  document.getElementById('ie-crop-btn').classList.add('active');
  document.getElementById('ie-crop-actions').style.display = '';
  // No pre-placed selection — the user draws one on the overlay. A full-
  // canvas init would cover the overlay and swallow all mousedowns as
  // "move", making drawing impossible, and push the handles outside the
  // overlay's overflow:hidden clip (invisible). See _updateCropSelection
  // for the null case (box hidden, overlay receives the draw mousedown).
  _ieCropRect = null;
  document.getElementById('ie-crop-overlay').style.display = '';
  _showOriginal();
  _updateCropSelection();
  document.getElementById('ie-hint').textContent =
    'Bereich aufziehen, dann „Zuschneiden" klicken zum Anwenden — oder „Abbrechen" zum Verwerfen.';
}

/** Leave crop mode and hide the overlay + selection box. */
function _exitCrop() {
  _ieCropping = false;
  _ieCropRect = null;
  document.getElementById('logo-edit-modal').classList.remove('cropping');
  document.getElementById('ie-crop-btn').classList.remove('active');
  document.getElementById('ie-crop-actions').style.display = 'none';
  document.getElementById('ie-crop-overlay').style.display = 'none';
  const sel = document.getElementById('ie-crop-sel');
  if (sel) sel.style.display = 'none';
}

/**
 * Repaint the canvas with the unmodified working pixels (used while crop
 * mode is active, instead of the processed preview).
 */
function _showOriginal() {
  if (!_ieOrigData) return;
  const w = _ieCanvas.width, h = _ieCanvas.height;
  _ieCtx.putImageData(new ImageData(new Uint8ClampedArray(_ieOrigData), w, h), 0, 0);
}

/**
 * Position the selection box (in CSS px) from `_ieCropRect` (canvas px).
 * The canvas is displayed at a scaled size, so the selection must be scaled
 * to match.
 */
function _updateCropSelection() {
  const sel = document.getElementById('ie-crop-sel');
  if (!sel || !_ieCropRect) { if (sel) sel.style.display = 'none'; return; }
  sel.style.display = 'block';
  const rect = _ieCanvas.getBoundingClientRect();
  const sx = rect.width / _ieCanvas.width;
  const sy = rect.height / _ieCanvas.height;
  sel.style.left = (_ieCropRect.x * sx) + 'px';
  sel.style.top = (_ieCropRect.y * sy) + 'px';
  sel.style.width = (_ieCropRect.w * sx) + 'px';
  sel.style.height = (_ieCropRect.h * sy) + 'px';
}

/**
 * Mouse-down on the overlay background, the selection body, or a handle.
 * `zone` is 'draw' (overlay), 'move' (selection body), or a handle direction
 * ('nw','n','ne','e','se','s','sw','w'). Snapshots the drag start and
 * attaches window-level move/up listeners so the drag tracks the cursor
 * even outside the overlay.
 * @param {MouseEvent} e
 * @param {string} zone
 */
export function leCropDown(e, zone) {
  if (!_ieCropping) return;
  e.preventDefault();
  e.stopPropagation();
  const rect = _ieCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (_ieCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (_ieCanvas.height / rect.height);
  _ieDragStart = { x, y, rect: _ieCropRect ? { ..._ieCropRect } : null };
  if (zone === 'draw') {
    _ieDragMode = 'draw';
    _ieCropRect = { x, y, w: 0, h: 0 };
  } else if (zone === 'move') {
    if (!_ieCropRect) return;
    _ieDragMode = 'move';
  } else {
    _ieDragMode = 'resize-' + zone;
  }
  window.addEventListener('mousemove', _onCropMove);
  window.addEventListener('mouseup', _onCropUp);
  _updateCropSelection();
}

/** Window mousemove during a crop drag — recomputes `_ieCropRect`. @param {MouseEvent} e */
function _onCropMove(e) {
  if (!_ieDragMode || !_ieDragStart) return;
  const rect = _ieCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (_ieCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (_ieCanvas.height / rect.height);
  const dx = x - _ieDragStart.x;
  const dy = y - _ieDragStart.y;
  const cw = _ieCanvas.width, ch = _ieCanvas.height;
  if (_ieDragMode === 'draw') {
    let x0 = _ieDragStart.x, y0 = _ieDragStart.y, x1 = x, y1 = y;
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    const ix0 = Math.max(0, Math.round(x0));
    const iy0 = Math.max(0, Math.round(y0));
    _ieCropRect = {
      x: ix0, y: iy0,
      w: Math.min(cw, Math.round(x1)) - ix0,
      h: Math.min(ch, Math.round(y1)) - iy0,
    };
  } else if (_ieDragMode === 'move') {
    const r = _ieDragStart.rect;
    if (!r) return;
    _ieCropRect = {
      x: Math.round(Math.max(0, Math.min(cw - r.w, r.x + dx))),
      y: Math.round(Math.max(0, Math.min(ch - r.h, r.y + dy))),
      w: r.w, h: r.h,
    };
  } else {
    const r = _ieDragStart.rect;
    if (!r) return;
    const dir = _ieDragMode.slice(7);
    let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    if (dir.includes('w')) x0 = Math.max(0, Math.min(x1 - CROP_MIN, r.x + dx));
    if (dir.includes('e')) x1 = Math.min(cw, Math.max(x0 + CROP_MIN, x1 + dx));
    if (dir.includes('n')) y0 = Math.max(0, Math.min(y1 - CROP_MIN, r.y + dy));
    if (dir.includes('s')) y1 = Math.min(ch, Math.max(y0 + CROP_MIN, y1 + dy));
    _ieCropRect = {
      x: Math.round(x0), y: Math.round(y0),
      w: Math.round(x1 - x0), h: Math.round(y1 - y0),
    };
  }
  _updateCropSelection();
}

/** Window mouseup — end the drag; discard a too-small draw selection. */
function _onCropUp() {
  _ieDragMode = null;
  _ieDragStart = null;
  window.removeEventListener('mousemove', _onCropMove);
  window.removeEventListener('mouseup', _onCropUp);
  if (_ieCropRect && (_ieCropRect.w < CROP_MIN || _ieCropRect.h < CROP_MIN)) {
    _ieCropRect = null;
    _updateCropSelection();
  }
}

/**
 * Commit the crop: row-copy the selection from `_ieOrigData` into a new
 * buffer, replace `_ieOrigData`, resize the canvas, exit crop mode, and
 * re-render the processed preview (keeping the current bg/tolerance — no
 * re-suggest, predictable for the user).
 */
export function leApplyCrop() {
  if (!_ieCropping || !_ieOrigData) { _exitCrop(); return; }
  const r = _ieCropRect;
  if (!r || r.w < CROP_MIN || r.h < CROP_MIN) {
    showAlert('Bitte zuerst einen Bereich aufziehen.');
    return;
  }
  const cw = _ieCanvas.width;
  const cropped = new Uint8ClampedArray(r.w * r.h * 4);
  for (let row = 0; row < r.h; row++) {
    const srcOff = ((r.y + row) * cw + r.x) * 4;
    cropped.set(_ieOrigData.subarray(srcOff, srcOff + r.w * 4), row * r.w * 4);
  }
  _ieOrigData = cropped;
  _ieCanvas.width = r.w;
  _ieCanvas.height = r.h;
  _exitCrop();
  _render();
}

/** Discard the selection and leave crop mode (no pixel changes). */
export function leCancelCrop() {
  _exitCrop();
  _render();
}
