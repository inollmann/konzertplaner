// ══════════════════════════════════════════════════════════════════════
// catalogues.js — artist & venue catalogue management
//
// Renders the artist/venue catalogue lists and popups and owns the
// artist-detail image upload flow. The user drops/clicks/pastes an image
// into the universal dropzone (#adm-dropzone), which opens a destination
// popup (#adm-upload-choice-modal) offering "Logo" (opens the monochrome
// logo editor on the blob) or "Bandfoto" (stages it directly as the photo).
// The logo/photo display zones are display-only.
//
// `_admStore` is a throwaway array rebuilt on every `renderArtistList()`
// so the inline `onclick="openArtistDetailById(N)"` handlers can address
// artist objects by a stable index without leaking object references into
// the HTML.
// ══════════════════════════════════════════════════════════════════════

import { state, getEvent } from './state.js';
import { esc, localIso, parseDate, fmtDateShort, eventLatestDate, artistLogoSrc, artistLogoClass } from './utils.js';
import { openModal, closeModal, closeDrawer, showAlert, showConfirm } from './ui.js';
import { reloadCatalogue, uploadArtistImg, toggleFollow } from './api.js';
import { artistRatingsSummary, artistDetailRatingsHtml } from './ratings.js';
import { icon } from './icons.js';
import { openLogoEditorFromBlob } from './logo-editor.js';

let _admStore = [];  // temp array to pass artist objects safely via index
let _admCurrentArtist = null;
let _admPendingBlob   = null;
let _admChoiceBlob     = null;  // blob staged in the destination-choice popup
let _admPendingLogoMono = null;  // pending mono blob (derived artist, persisted on saveArtistDetail)
let _artistListWired = false;

/** Open the artist catalogue modal: close drawer, (re)render the list, show the modal. */
export function openArtistCatalogue() {
  closeDrawer();
  renderArtistList();
  openModal('artist-modal');
}

/**
 * (Re)render the artist list into `#artist-list`, rebuilding the `_admStore`
 * index map so inline `openArtistDetailById(N)` handlers resolve to the
 * right artist objects.
 */
export function renderArtistList() {
  _admStore = [];
  const el = document.getElementById('artist-list');
  if (!_artistListWired) {
    _artistListWired = true;
    el.addEventListener('click', e => {
      const card = e.target.closest('[data-artist-idx]');
      if (card) window.openArtistDetailById?.(parseInt(card.dataset.artistIdx));
    });
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-artist-idx]');
      if (card) { e.preventDefault(); window.openArtistDetailById?.(parseInt(card.dataset.artistIdx)); }
    });
  }
  if (!state.artists.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">'+icon('mic')+'</div><h3>Noch keine Artists gespeichert</h3><p>Füge Artists über die Suche oder Eventim hinzu.</p></div>';
    return;
  }
  el.innerHTML = state.artists.map(a => {
    const logoSrc = artistLogoSrc(a);
    const logoEl = logoSrc
      ? `<div class="logo-drop-zone" style="border-style:solid"><img class="${artistLogoClass(a)}" src="/api/img/${logoSrc}" alt=""></div>`
      : `<div class="logo-drop-zone">\uD83C\uDFAD</div>`;
    const nameEl = `<span style="flex:1;font-size:14px">${esc(a.name)}</span>`;
    const ratingsSummary = artistRatingsSummary(a.name);
    if (a.derived) {
      const followStar = a.followed ? icon('star-filled') : icon('star');
      const followStyle = a.followed ? 'color:var(--accent)' : 'color:var(--muted)';
      return `<div class="cat-item" style="flex-wrap:wrap" role="button" tabindex="0" data-artist-idx="${_admStore.push(a)-1}" aria-label="${esc(a.name)}">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          ${logoEl}${nameEl}
        </div>
        <div class="cat-item-actions" onclick="event.stopPropagation()">
          <button class="follow-btn" title="${a.followed?'Entfolgen':'Folgen'}" style="${followStyle}"
            onclick="toggleFollow('${a.id}',${!a.followed})">${followStar}</button>
        </div>
        ${ratingsSummary ? `<div style="width:100%;padding:6px 0 2px 60px">${ratingsSummary}</div>` : ''}
      </div>`;
    }
    const followStar = a.followed ? icon('star-filled') : icon('star');
    const followStyle = a.followed ? 'color:var(--accent)' : 'color:var(--muted)';
    return `<div class="cat-item" style="flex-wrap:wrap" role="button" tabindex="0" data-artist-idx="${_admStore.push(a)-1}" aria-label="${esc(a.name)}">
      <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
        ${logoEl}${nameEl}
      </div>
      <div class="cat-item-actions" onclick="event.stopPropagation()">
        <button class="follow-btn" title="${a.followed?'Entfolgen':'Folgen'}" style="${followStyle}"
          onclick="toggleFollow('${a.id}',${!a.followed})">${followStar}</button>
      </div>
      ${ratingsSummary ? `<div style="width:100%;padding:6px 0 2px 60px;font-size:12px;color:var(--muted)">${ratingsSummary}</div>` : ''}
    </div>`;
  }).join('');
}

/** Open the artist-detail popup for the artist at `_admStore[idx]`. @param {number} idx */
export function openArtistDetailById(idx) { openArtistDetail(_admStore[idx]); }

/**
 * Open the artist-detail popup for artist `a`, resetting the pending image
 * blobs and the active slot, then render the ratings block.
 * @param {object|string} a artist object or JSON string of one
 */
export function openArtistDetail(a) {
  _admCurrentArtist = typeof a === 'string' ? JSON.parse(a) : a;
  _admPendingBlob     = { logo: null, photo: null };
  _admPendingLogoMono = null;
  _admChoiceBlob      = null;
  document.getElementById('adm-title').textContent = _admCurrentArtist.derived ? 'Artist speichern' : 'Artist bearbeiten';
  document.getElementById('adm-name').value = _admCurrentArtist.name;
  const logoZone  = document.getElementById('adm-logo-zone');
  const photoZone = document.getElementById('adm-photo-zone');
  if (_admCurrentArtist.logo) {
    const logoSrc = artistLogoSrc(_admCurrentArtist);
    const logoCls = artistLogoClass(_admCurrentArtist);
    // Sparkles overlay button: opens the monochrome logo editor on the
    // original `logo`. The button stops propagation so the zone's own
    // onclick (file picker) isn't triggered.
    const editBtn = `<button class="logo-edit-btn" type="button"
        title="Logo auf weiß/transparent bearbeiten"
        onclick="event.stopPropagation(); openLogoEditorById('${_admCurrentArtist.id}')">${icon('sparkles')}</button>`;
    logoZone.classList.add('has-img');
    document.getElementById('adm-logo-inner').innerHTML =
      `<img class="${logoCls}" src="/api/img/${logoSrc}" alt="">${editBtn}`;
  } else {
    logoZone.classList.remove('has-img');
    document.getElementById('adm-logo-inner').innerHTML = '\uD83C\uDFAD';
  }
  if (_admCurrentArtist.photo) {
    photoZone.classList.add('has-img');
    document.getElementById('adm-photo-inner').innerHTML = `<img src="/api/img/${_admCurrentArtist.photo}" alt="">`;
  } else {
    photoZone.classList.remove('has-img');
    document.getElementById('adm-photo-inner').innerHTML = '\uD83D\uDCF7';
  }
  document.getElementById('adm-ratings').innerHTML = artistDetailRatingsHtml(_admCurrentArtist.name);
  openModal('artist-detail-modal');
}

/** Open a file picker; the chosen image goes to the destination popup. */
export function admPickFile() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = () => { if (input.files[0]) admNewImage(input.files[0]); };
  input.click();
}

/** Mark the dropzone as an active drop target. @param {DragEvent} e */
export function admDragEnter(e) { /** @type {Element} */ (e.currentTarget).classList.add('drag-over'); }
/** Clear the active drop-target state. @param {DragEvent} e */
export function admDragLeave(e) { /** @type {Element} */ (e.currentTarget).classList.remove('drag-over'); }
/** Handle a drop onto the universal dropzone → destination popup. @param {DragEvent} e */
export function admHandleDrop(e) {
  e.preventDefault();
  /** @type {Element} */ (e.currentTarget).classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) admNewImage(f);
}

/**
 * Stage `blob` and open the destination-choice popup showing a preview and
 * the Logo / Bandfoto buttons. Entry point for all image inputs (click,
 * drop, paste).
 * @param {Blob} blob
 */
export function admNewImage(blob) {
  _admChoiceBlob = blob;
  document.getElementById('adm-choice-preview').src = URL.createObjectURL(blob);
  openModal('adm-upload-choice-modal');
}

/**
 * Handle the user's destination choice from the popup. Closes the popup,
 * then either opens the logo editor (Logo) or stages the photo (Bandfoto).
 * If the target slot already has an image (persisted or pending), confirm
 * the replacement first. The staged `_admChoiceBlob` is consumed and cleared.
 * @param {string} slot 'logo' | 'photo'
 */
export function admChooseDest(slot) {
  const blob = _admChoiceBlob;
  _admChoiceBlob = null;
  closeModal('adm-upload-choice-modal');
  if (!blob) return;
  if (slot === 'logo') {
    _confirmReplace('logo', () => openLogoEditorFromBlob(_admCurrentArtist, blob));
  } else {
    _confirmReplace('photo', () => setPhotoPreview(blob));
  }
}

/**
 * If the given slot already has an image (persisted on the artist or staged
 * as a pending blob), ask before replacing; otherwise call `onYes` directly.
 * @param {string} slot 'logo' | 'photo'
 * @param {() => void} onYes
 */
function _confirmReplace(slot, onYes) {
  const existing = _admCurrentArtist[slot] || _admPendingBlob[slot];
  if (existing) {
    showConfirm(`Aktuelles ${slot === 'logo' ? 'Logo' : 'Foto'} ersetzen?`, onYes);
  } else {
    onYes();
  }
}

/** Stage `blob` as the pending photo and update the photo display zone. @param {Blob} blob */
function setPhotoPreview(blob) {
  _admPendingBlob.photo = blob;
  const zone = document.getElementById('adm-photo-zone');
  zone.classList.add('has-img');
  document.getElementById('adm-photo-inner').innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
}

/**
 * Delete the currently-open artist after confirmation, reload the
 * catalogue, re-render the list and close the popup. Derived artists are
 * not persisted, so they just close the popup.
 * @returns {Promise<void>}
 */
export async function deleteCurrentArtist() {
  const a = _admCurrentArtist;
  if (!a || a.derived) {
    closeModal('artist-detail-modal');
    return;
  }
  showConfirm(`Artist "${a.name}" löschen?`, async () => {
    await fetch('/api/artists/'+a.id, { method:'DELETE' });
    await reloadCatalogue();
    renderArtistList();
    closeModal('artist-detail-modal');
  });
}

/**
 * Persist the open artist detail — creating it when derived/new, otherwise
 * updating — uploading any pending logo/photo blobs first, then reload the
 * catalogue, re-render the list and close the popup.
 * @returns {Promise<void>}
 */
export async function saveArtistDetail() {
  const name = document.getElementById('adm-name').value.trim();
  if (!name) { showAlert('Bitte einen Namen eingeben.'); return; }
  const a = _admCurrentArtist;
  const logoFilename    = _admPendingBlob.logo  ? await uploadArtistImg(_admPendingBlob.logo,  name, 'logo',     'logo.png')     : (a.logo     || null);
  const logoMonoFilename = _admPendingLogoMono  ? await uploadArtistImg(_admPendingLogoMono, name, 'logo-mono', 'logo-mono.png') : (a.logo_mono || null);
  const photoFilename   = _admPendingBlob.photo ? await uploadArtistImg(_admPendingBlob.photo, name, 'photo')                   : (a.photo    || null);
  const payload = { name, logo: logoFilename, logo_mono: logoMonoFilename, photo: photoFilename };
  if (a.derived || !a.id) {
    await fetch('/api/artists', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  } else {
    await fetch('/api/artists/'+a.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  }
  await reloadCatalogue();
  renderArtistList();
  closeModal('artist-detail-modal');
}

/** Create a new artist from `#new-artist-name`, clear the field, reload & re-render. @returns {Promise<void>} */
export async function addArtist() {
  const name = document.getElementById('new-artist-name').value.trim();
  if (!name) return;
  await fetch('/api/artists', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name}) });
  document.getElementById('new-artist-name').value = '';
  await reloadCatalogue();
  renderArtistList();
}

/** Delete the artist `id` after confirmation, then reload & re-render. @param {string} id @returns {Promise<void>} */
export async function deleteArtist(id) {
  showConfirm('Artist löschen?', async () => {
    await fetch('/api/artists/'+id, { method:'DELETE' });
    await reloadCatalogue();
    renderArtistList();
  });
}

/** Open the venue catalogue modal: close drawer, (re)render the list, show the modal. */
export function openVenueCatalogue() { closeDrawer(); renderVenueList(); openModal('venue-modal'); }

/** (Re)render the venue list into `#venue-list`. */
export function renderVenueList() {
  const el = document.getElementById('venue-list');
  if (!state.venuesCat.length) { el.innerHTML = '<div class="empty-state"><div class="icon">'+icon('building-2')+'</div><h3>Noch keine Venues gespeichert</h3><p>Venues werden automatisch aus Events angelegt.</p></div>'; return; }
  el.innerHTML = state.venuesCat.map(v => {
    if (v.derived) {
      return `<div class="cat-item" style="opacity:.75">
        <div class="cat-logo">${icon('building-2')}</div>
        <span style="flex:1;font-size:14px;color:var(--muted)">${esc(v.name)}</span>
        <span style="font-size:12px;color:var(--muted);min-width:80px">${esc(v.city)}</span>
        <div class="cat-item-actions">
          <button class="btn-sm" onclick="promoteVenue('${esc(v.name).replace(/'/g,"\'")}','${esc(v.city).replace(/'/g,"\'")}')">${icon('plus')} Speichern</button>
        </div>
      </div>`;
    }
    return `<div class="cat-item">
      <div class="cat-logo">${icon('building-2')}</div>
      <input class="cat-name-input" value="${esc(v.name)}" id="vn-${v.id}" onblur="saveVenue('${v.id}')">
      <input class="cat-city-input" value="${esc(v.city)}" id="vc-${v.id}" placeholder="Stadt" onblur="saveVenue('${v.id}')">
      <div class="cat-item-actions">
        <button class="btn-sm danger" onclick="deleteVenue('${v.id}')">${icon('trash-2')}</button>
      </div>
    </div>`;
  }).join('');
}

/** Persist a derived venue (name, city) into the catalogue, then reload & re-render. @param {string} name @param {string} city @returns {Promise<void>} */
export async function promoteVenue(name, city) {
  await fetch('/api/venues-catalogue', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, city}) });
  await reloadCatalogue();
  renderVenueList();
}

/** Create a new venue from `#new-venue-name`/`#new-venue-city`, clear the fields, reload & re-render. @returns {Promise<void>} */
export async function addVenue() {
  const name = document.getElementById('new-venue-name').value.trim();
  const city = document.getElementById('new-venue-city').value.trim();
  if (!name) return;
  await fetch('/api/venues-catalogue', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name,city}) });
  document.getElementById('new-venue-name').value = '';
  document.getElementById('new-venue-city').value = '';
  await reloadCatalogue();
  renderVenueList();
}

/** PUT the edited name/city for venue `id`, then reload the catalogue. @param {string} id @returns {Promise<void>} */
export async function saveVenue(id) {
  const name = document.getElementById('vn-'+id).value.trim();
  const city = document.getElementById('vc-'+id).value.trim();
  await fetch('/api/venues-catalogue/'+id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name,city}) });
  await reloadCatalogue();
}

/** Delete venue `id` after confirmation, then reload & re-render. @param {string} id @returns {Promise<void>} */
export async function deleteVenue(id) {
  showConfirm('Venue löschen?', async () => {
    await fetch('/api/venues-catalogue/'+id, { method:'DELETE' });
    await reloadCatalogue();
    renderVenueList();
  });
}

document.addEventListener('paste', e => {
  if (!document.getElementById('artist-detail-modal').classList.contains('open')) return;
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) { admNewImage(item.getAsFile()); break; }
  }
}, true);

// Logo editor dispatches `logo-pending` when the user applies an edit on a
// derived/new artist (no `id`): the mono canvas blob + raw upload blob are
// staged here as pending and persisted when the artist card is saved.
window.addEventListener('logo-pending', (e) => {
  const { monoBlob, rawBlob } = /** @type {CustomEvent} */ (e).detail;
  _admPendingLogoMono = monoBlob;
  _admPendingBlob.logo = rawBlob;
  const zone = document.getElementById('adm-logo-zone');
  zone.classList.add('has-img');
  document.getElementById('adm-logo-inner').innerHTML =
    `<img class="mono-logo" src="${URL.createObjectURL(monoBlob)}" alt="">`;
});
