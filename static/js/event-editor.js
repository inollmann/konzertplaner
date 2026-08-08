// ══════════════════════════════════════════════════════════════════════
// event-editor.js — the create/edit modal for tours and festivals
//
// Owns the #event-modal lifecycle: openEventModal seeds the form from an
// existing event (or a blank one), selectType swaps the tour/festival
// sub-forms, and saveEvent assembles the payload, uploads any pending
// poster/logo blobs, and PUTs/POSTs to /api/events. Concert-block and
// pill (artist/support/bands-to-watch) editing, venue autocomplete, and
// invite-link generation all live here.
//
// Module-local mutable state: `pendingBlob` / `savedPoster` (poster per
// type), `pendingFestLogo` / `savedFestLogo`, `blockCount` (concert-block
// id counter), and `pillState` (artist/support/bands tags + autocomplete
// highlight index). The canonical `editingId` / `currentType` live in
// `state` (from state.js) since other modules read them.
//
// Many form controls emit inline `onclick`/`oninput` handlers that call
// functions exposed on `window` by globals.js — selectType,
// addConcertBlock, toggleCbMulti, onVenueInput, onPillInput, onPillKey,
// onPillFocus, onPillBlur, pickVenue, closeAcDrop, saveEvent, focusPill,
// removePill, addPillTag. Keep those names stable or update globals.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc } from './utils.js';
import { openModal, closeModal, closeDrawer } from './ui.js';
import { fetchAll } from './api.js';
import { openDetail, closeDetail } from './list.js';
import { icon } from './icons.js';

let pendingBlob = { tour: null, festival: null };
let savedPoster = { tour: null, festival: null };
let pendingFestLogo = null;
let savedFestLogo = null;
let blockCount = 0;
const pillState = {
  artist:  { tags: [], hi: -1 },
  support: { tags: [], hi: -1 },
  bands:   { tags: [], hi: -1 },
};

document.addEventListener('paste', e => {
  if (!document.getElementById('event-modal').classList.contains('open')) return;
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) {
      if (state.currentType === 'festival') previewFestivalLogo(item.getAsFile());
      else previewBlob(state.currentType, item.getAsFile());
      break;
    }
  }
});

/**
 * Open the event editor for an existing event (`ev`) or a new one (`null`).
 * Seeds the type chooser, tour/festival fields, pills, concert blocks, and
 * poster/logo previews from `ev`, then shows the modal.
 * @param {any} ev Event dict to edit, or `null` to create a new one.
 */
export function openEventModal(ev) {
  closeDrawer();
  state.editingId = ev ? ev.id : null;
  pendingBlob = { tour: null, festival: null };
  savedPoster = { tour: ev?.poster||null, festival: ev?.poster||null };
  pendingFestLogo = null;
  savedFestLogo = ev?.logo || null;

  document.getElementById('type-chooser').style.display = ev ? 'none' : 'block';
  document.getElementById('event-modal-title').textContent = ev ? 'Event bearbeiten' : 'Neues Event';

  selectType(ev ? ev.event_type : 'tour', false);

  if (!ev || ev.event_type === 'tour') {
    const artistData = ev?.artist;
    if (Array.isArray(artistData)) {
      pillState.artist.tags = [...artistData];
    } else if (artistData) {
      pillState.artist.tags = [artistData];
    } else {
      pillState.artist.tags = [];
    }
    renderPills('artist');
    document.getElementById('f-tourname').value = ev?.tour_name || '';
    document.getElementById('f-tour-comment').value = ev?.comment || '';
    pillState.support.tags = [...(ev?.support||[])];
    renderPills('support');
    document.getElementById('concert-blocks').innerHTML = '';
    (ev?.concerts||[]).forEach(c => addConcertBlock(c));
    setPosterPreview('tour', ev?.poster||null);
  }
  if (!ev || ev.event_type === 'festival') {
    document.getElementById('f-fest-name').value     = ev?.name || '';
    document.getElementById('f-fest-city').value     = ev?.city || '';
    document.getElementById('f-fest-venue').value    = ev?.venue || '';
    document.getElementById('f-fest-date').value     = ev?.date || '';
    document.getElementById('f-fest-time').value     = ev?.time || '';
    document.getElementById('f-fest-price').value      = ev?.price != null ? ev.price : '';
    document.getElementById('f-fest-ticketlink').value = ev?.ticket_link || '';
    document.getElementById('f-fest-enddate').value  = ev?.end_date || '';
    const multi = !!(ev?.end_date);
    document.getElementById('f-fest-multi').checked  = multi;
    document.getElementById('fest-end-grp').classList.toggle('visible', multi);
    document.getElementById('f-fest-tag-tickets').checked   = (ev?.tags||[]).includes('tickets');
    document.getElementById('f-fest-tag-watchlist').checked = (ev?.tags||[]).includes('watchlist');
    document.getElementById('f-fest-comment').value = ev?.comment || '';
    pillState.bands.tags = [...(ev?.bands_to_watch||[])];
    renderPills('bands');
    setPosterPreview('festival', ev?.poster||null);
    setFestivalLogoPreview(ev?.logo||null);
  }

  openModal('event-modal');
}

/**
 * Switch the editor between the tour and festival sub-forms and record the
 * active type in `state.currentType`.
 * @param {'tour'|'festival'} type
 * @param {boolean} resetFields Unused here; kept for caller compatibility.
 */
export function selectType(type, resetFields = true) {
  state.currentType = type;
  document.getElementById('tour-form').style.display     = type === 'tour'     ? 'block' : 'none';
  document.getElementById('festival-form').style.display = type === 'festival' ? 'block' : 'none';
  document.getElementById('opt-tour').className     = 'type-option' + (type === 'tour'     ? ' sel-tour'     : '');
  document.getElementById('opt-festival').className = 'type-option' + (type === 'festival' ? ' sel-festival' : '');
}

/** Toggle the festival multi-day end-date field and sync its min date. */
export function toggleFestMulti() {
  const c = document.getElementById('f-fest-multi').checked;
  document.getElementById('fest-end-grp').classList.toggle('visible', c);
  if (c) syncEndDateMin('f-fest-date', 'f-fest-enddate');
}

// ── Poster ───────────────────────────────────────────────────────────
function setPosterPreview(which, filename) {
  const el = document.getElementById('pu-'+which);
  el.innerHTML = '';
  if (filename) {
    savedPoster[which] = filename;
    const img = document.createElement('img'); img.src = `/api/img/${filename}`; el.appendChild(img);
  } else {
    savedPoster[which] = null;
    el.innerHTML = `<div class="pu-icon">${icon('paintbrush')}</div><div class="pu-label">Poster hochladen</div>`;
  }
}
function previewBlob(which, blob) {
  pendingBlob[which] = blob;
  const url = URL.createObjectURL(blob);
  const el = document.getElementById('pu-'+which);
  el.innerHTML = ''; const img = document.createElement('img'); img.src = url; el.appendChild(img);
}
/** Handle a poster file picked from an `<input type=file>` for `which` type. */
export function handleFile(e, which) { const f = e.target.files[0]; if (f) previewBlob(which, f); }
/** Handle a poster file dropped onto the upload area for `which` type. */
export function handleDrop(e, which) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) previewBlob(which, f);
}

// ── Festival-Logo ────────────────────────────────────────────────────
function setFestivalLogoPreview(filename) {
  const el = document.getElementById('pu-festlogo');
  el.innerHTML = '';
  if (filename) {
    savedFestLogo = filename;
    const img = document.createElement('img'); img.src = `/api/img/${filename}`; el.appendChild(img);
  } else {
    savedFestLogo = null;
    el.innerHTML = `<div class="pu-icon">${icon('tag')}</div><div class="pu-label">Festival-Logo hochladen</div>`;
  }
}
function previewFestivalLogo(blob) {
  pendingFestLogo = blob;
  const url = URL.createObjectURL(blob);
  const el = document.getElementById('pu-festlogo');
  el.innerHTML = ''; const img = document.createElement('img'); img.src = url; el.appendChild(img);
}
/** Handle a festival logo picked from an `<input type=file>`. */
export function handleFestLogoFile(e) { const f = e.target.files[0]; if (f) previewFestivalLogo(f); }
/** Handle a festival logo dropped onto the upload area. */
export function handleFestLogoDrop(e) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) previewFestivalLogo(f);
}
/**
 * Upload the pending festival-logo blob (if any) and return its server
 * filename; otherwise return the previously saved filename.
 * @returns {Promise<string|null>}
 */
export async function uploadFestivalLogoIfNeeded() {
  const blob = pendingFestLogo;
  if (!blob) return savedFestLogo;
  const fd = new FormData(); fd.append('logo', blob);
  const r = await fetch('/api/upload-festival-logo', { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Upload fehlgeschlagen');
  return (await r.json()).id;
}

/**
 * Upload the pending poster blob for `which` type (if any) and return its
 * server filename; otherwise return the previously saved filename.
 * @param {'tour'|'festival'} which
 * @returns {Promise<string|null>}
 */
export async function uploadBlobIfNeeded(which) {
  const blob = pendingBlob[which];
  if (!blob) return savedPoster[which];
  const fd = new FormData(); fd.append('poster', blob);
  const r = await fetch('/api/upload-poster', { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Upload fehlgeschlagen');
  return (await r.json()).id;
}

// ── Concert blocks ───────────────────────────────────────────────────
/**
 * Append a new concert-block to the tour form, optionally prefilled from an
 * existing concert dict. Support-act checkboxes are seeded from the current
 * `pillState.support` tags.
 * @param {any} [prefill] Existing concert to prefill from.
 */
export function addConcertBlock(prefill) {
  blockCount++;
  const id = 'cb-'+blockCount;
  const div = document.createElement('div');
  div.className = 'concert-block'; div.id = id;
  if (prefill?.id) {
    div.dataset.concertId = prefill.id;
  }

  const currentSupport = pillState.support.tags;
  const presentList = prefill?.support_present ?? [...currentSupport];
  const supChecks = currentSupport.length
    ? `<div class="form-group full">
        <label>Support bei diesem Termin</label>
        <div class="support-checks">
          ${currentSupport.map(act => `
            <label class="sup-check">
              <input type="checkbox" class="cb-sup" data-act="${esc(act)}" ${presentList.includes(act)?'checked':''}>
              <div class="check-box">${icon('check')}</div>
              <span>${esc(act)}</span>
            </label>`).join('')}
        </div>
      </div>` : '';

  div.innerHTML = `
    <div class="cb-head">
      <span class="cb-title">Termin ${blockCount}</span>
      <button type="button" class="btn-remove" onclick="document.getElementById('${id}').remove()">${icon('x')}</button>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Datum *</label>
        <input type="date" class="cb-date" value="${prefill?.date||''}"
          oninput="syncEndDateMin(this, this.closest('.concert-block').querySelector('.cb-enddate'))">
      </div>
      <div class="form-group" style="justify-content:flex-end;padding-bottom:4px">
        <label class="toggle-row">
          <input type="checkbox" class="cb-multi" onchange="toggleCbMulti(this,'${id}')">
          <div class="toggle-track"></div>
          Mehrtägig
        </label>
      </div>
      <div class="form-group collapsible ${prefill?.end_date?'visible':''}" id="${id}-end">
        <label>Enddatum</label>
        <input type="date" class="cb-enddate" value="${prefill?.end_date||''}">
      </div>
      <div class="form-group">
        <label>Uhrzeit</label>
        <input type="time" class="cb-time" value="${prefill?.time||''}">
      </div>
      <div class="form-group">
        <label>Stadt *</label>
        <div class="pill-wrap">
          <input type="text" class="cb-city" placeholder="z.B. Berlin" value="${prefill?esc(prefill.city):''}"
            oninput="onVenueInput(this,'','venue-drop-${id}')"
            onblur="setTimeout(()=>closeAcDrop('venue-drop-${id}'),150)">
          <div class="ac-drop" id="venue-drop-${id}"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Venue *</label>
        <div class="pill-wrap">
          <input type="text" class="cb-venue" placeholder="z.B. Columbiahalle" value="${prefill?esc(prefill.venue):''}"
            oninput="onVenueInput(this,'','venue-drop2-${id}')"
            onblur="setTimeout(()=>closeAcDrop('venue-drop2-${id}'),150)">
          <div class="ac-drop" id="venue-drop2-${id}"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Preis (€)</label>
        <input type="number" class="cb-price" placeholder="Optional" min="0" step="0.01"
          value="${prefill?.price!=null?prefill.price:''}">
      </div>
      <div class="form-group">
        <label>Ticketlink</label>
        <input type="text" class="cb-ticketlink" placeholder="https://…"
          value="${prefill?.ticket_link||''}">
      </div>
      <div class="form-group">
        <label>Tags</label>
        <div class="tag-checks">
          <label class="tag-check"><input type="checkbox" class="cb-tag-tickets" ${prefill?.tags?.includes('tickets')?'checked':''}><div class="check-box">${icon('check')}</div><span>${icon('ticket')} Tickets</span></label>
          <label class="tag-check"><input type="checkbox" class="cb-tag-watchlist" ${prefill?.tags?.includes('watchlist')?'checked':''}><div class="check-box">${icon('check')}</div><span>${icon('bookmark')} Merkliste</span></label>
        </div>
      </div>
      ${supChecks}
    </div>`;
  document.getElementById('concert-blocks').appendChild(div);

  if (prefill?.end_date) {
    div.querySelector('.cb-multi').checked = true;
  }
}

/** Show/hide a concert-block's end-date field when its multi-day toggle flips. */
export function toggleCbMulti(cb, id) {
  document.getElementById(id+'-end').classList.toggle('visible', cb.checked);
  if (cb.checked) {
    const block = cb.closest('.concert-block');
    const startEl = block.querySelector('.cb-date');
    const endEl = block.querySelector('.cb-enddate');
    syncEndDateMin(startEl, endEl);
  }
}

/**
 * Set the min date of `endEl` to `startEl`'s value; clear/seed the end date
 * when it falls before the start. Both args accept an element or an id.
 * @param {HTMLElement|string} startEl
 * @param {HTMLElement|string} endEl
 */
export function syncEndDateMin(startEl, endEl) {
  const startInput = typeof startEl === 'string' ? document.getElementById(startEl) : startEl;
  const endInput   = typeof endEl   === 'string' ? document.getElementById(endEl)   : endEl;
  if (!startInput || !endInput) return;
  const val = startInput.value;
  if (val) {
    endInput.min = val;
    if (endInput.value && endInput.value < val) endInput.value = '';
    if (!endInput.value) endInput.value = val;
  }
}

// ── Venue autocomplete in concert blocks / festival ──────────────────
/**
 * Drive the venue/city autocomplete dropdown for a concert-block or
 * festival input, filtered by `state.knownVenues` (optionally scoped to a
 * matching city).
 * @param {HTMLElement|string} inputEl The city or venue input that fired.
 * @param {string} cityInputIdOrEl Id of the paired city input (or '' / element).
 * @param {string} dropId Id of the `ac-drop` dropdown to populate.
 */
export function onVenueInput(inputEl, cityInputIdOrEl, dropId) {
  const input = typeof inputEl === 'string' ? document.getElementById(inputEl) : inputEl;
  const q = input.value.trim().toLowerCase();
  const isCity = input.classList.contains('cb-city') || input.id === 'f-fest-city';
  const cityEl = typeof cityInputIdOrEl === 'string' && cityInputIdOrEl
    ? document.getElementById(cityInputIdOrEl)
    : (input.closest('.concert-block') ? input.closest('.concert-block').querySelector('.cb-city') : null);
  const city = cityEl ? cityEl.value.trim().toLowerCase() : '';
  const drop = document.getElementById(dropId);
  if (!drop) return;
  drop.dataset.fieldType = isCity ? 'city' : 'venue';
  if (!q) { drop.classList.remove('open'); return; }
  let suggestions = state.knownVenues.filter(v => {
    const matches = v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q);
    if (!matches) return false;
    if (city && !isCity) return v.city.toLowerCase() === city;
    return true;
  }).slice(0, 8);
  if (!suggestions.length) { drop.classList.remove('open'); return; }
  drop.innerHTML = suggestions.map(v =>
    `<div class="ac-item" onmousedown="event.preventDefault()"
      onclick="pickVenue(this,'${dropId}','${esc(v.name)}','${esc(v.city)}')">
      ${esc(v.name)}<span style="color:var(--muted);font-size:12px"> · ${esc(v.city)}</span>
    </div>`
  ).join('');
  drop.classList.add('open');
}

/** Re-run the festival venue autocomplete after its city field changes. */
export function onFestCityInput() {
  const venue = document.getElementById('f-fest-venue');
  if (venue.value) onVenueInput('f-fest-venue', 'f-fest-city', 'venue-drop-fest');
}

/**
 * Fill the triggering input (city or venue) from a picked autocomplete item
 * and backfill the paired city field when it's a venue pick.
 * @param {HTMLElement} itemEl The clicked dropdown item.
 * @param {string} dropId Id of the dropdown to close afterwards.
 * @param {string} venueName
 * @param {string} cityName
 */
export function pickVenue(itemEl, dropId, venueName, cityName) {
  const drop = document.getElementById(dropId);
  const fieldType = drop.dataset.fieldType || 'venue';
  const container = drop.previousElementSibling;
  if (container) {
    const input = container.tagName === 'INPUT' ? container : container.querySelector('input');
    if (input) {
      input.value = fieldType === 'city' ? cityName : venueName;
    }
    if (fieldType === 'venue') {
      const block = drop.closest('.concert-block');
      if (block) {
        const cityInput = block.querySelector('.cb-city');
        if (cityInput && !cityInput.value) cityInput.value = cityName;
      }
      const festCity = document.getElementById('f-fest-city');
      if (festCity && !festCity.value) festCity.value = cityName;
    }
  }
  closeAcDrop(dropId);
}

/** Close an autocomplete dropdown by id. */
export function closeAcDrop(id) {
  const el = document.getElementById(id); if (el) el.classList.remove('open');
}

// ── Save ─────────────────────────────────────────────────────────────
/**
 * Collect the form state, upload any pending poster/logo, and PUT (edit) or
 * POST (create) the event to `/api/events`. On success, refresh the event
 * list via `fetchAll` and re-open the detail panel for the edited event.
 */
export async function saveEvent() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Speichern…';
  try {
    const poster = await uploadBlobIfNeeded(state.currentType);
    const festivalLogo = state.currentType === 'festival' ? await uploadFestivalLogoIfNeeded() : null;
    let payload;
    if (state.currentType === 'festival') {
      const name = document.getElementById('f-fest-name').value.trim();
      const date = document.getElementById('f-fest-date').value;
      if (!name) { alert('Bitte Festivalnamen angeben.'); return; }
      if (!date) { alert('Bitte Startdatum angeben.'); return; }
      const tags = [];
      if (document.getElementById('f-fest-tag-tickets').checked)   tags.push('tickets');
      if (document.getElementById('f-fest-tag-watchlist').checked) tags.push('watchlist');
      payload = {
        event_type: 'festival', name,
        city:   document.getElementById('f-fest-city').value.trim(),
        venue:  document.getElementById('f-fest-venue').value.trim(),
        date,
        end_date: document.getElementById('f-fest-multi').checked ? document.getElementById('f-fest-enddate').value||null : null,
        time:  document.getElementById('f-fest-time').value||null,
        price: document.getElementById('f-fest-price').value||null,
        ticket_link: document.getElementById('f-fest-ticketlink').value.trim()||null,
        bands_to_watch: [...pillState.bands.tags],
        tags, poster,
        logo: festivalLogo,
        comment: document.getElementById('f-fest-comment').value.trim(),
      };
    } else {
      const artistList = [...pillState.artist.tags];
      if (!artistList.length) { alert('Bitte Artist angeben.'); return; }
      const blocks = document.querySelectorAll('.concert-block');
      const concerts = [];
      for (const b of blocks) {
        const date  = b.querySelector('.cb-date').value;
        const city  = b.querySelector('.cb-city').value.trim();
        const venue = b.querySelector('.cb-venue').value.trim();
        if (!date||!city||!venue) { alert('Bitte alle Pflichtfelder der Konzerttermine ausfüllen.'); return; }
        const tags = [];
        if (b.querySelector('.cb-tag-tickets').checked)   tags.push('tickets');
        if (b.querySelector('.cb-tag-watchlist').checked) tags.push('watchlist');
        const supPresent = [...b.querySelectorAll('.cb-sup:checked')].map(cb => cb.dataset.act);
        const concertId = b.dataset.concertId || null;
        concerts.push({
          id: concertId,
          date, city, venue,
          time:     b.querySelector('.cb-time').value||null,
          end_date: b.querySelector('.cb-multi').checked ? b.querySelector('.cb-enddate').value||null : null,
          price:    b.querySelector('.cb-price').value||null,
          ticket_link: b.querySelector('.cb-ticketlink')?.value?.trim()||null,
          tags, support_present: supPresent,
        });
      }
      payload = {
        event_type: 'tour', artist: artistList,
        tour_name: document.getElementById('f-tourname').value.trim()||'Tour',
        support: [...pillState.support.tags],
        concerts, poster,
        comment: document.getElementById('f-tour-comment').value.trim(),
      };
    }
    const url    = state.editingId ? `/api/events/${state.editingId}` : '/api/events';
    const method = state.editingId ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('Server error');
    closeModal('event-modal');
    await fetchAll();
    await new Promise(resolve => setTimeout(resolve, 50));
    if (state.editingId) {
      closeDetail();
      openDetail(state.editingId);
    }
  } catch(err) {
    alert('Fehler: '+err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Speichern';
  }
}

// ── Pill / autocomplete generic ──────────────────────────────────────
/** Focus the pill input with the given id. */
export function focusPill(id) { document.getElementById(id).focus(); }

/**
 * Re-render the tag pills for `which` (artist/support/bands) field, wiring
 * drag-to-reorder. When the support pills change, also refresh the
 * per-concert-block support checkboxes.
 * @param {'artist'|'support'|'bands'} which
 */
export function renderPills(which) {
  const field = document.getElementById(which+'-field');
  const input = document.getElementById(which+'-input');
  field.querySelectorAll('.pill').forEach(p => p.remove());
  pillState[which].tags.forEach((tag, i) => {
    const pill = document.createElement('div'); pill.className = 'pill';
    pill.draggable = true;
    pill.dataset.index = i;
    pill.innerHTML = `${esc(tag)}<button type="button" class="p-rm" onclick="removePill('${which}',${i})">${icon('x')}</button>`;

    pill.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', i.toString());
      e.dataTransfer.setData('which', which);
      pill.classList.add('dragging');
    });
    pill.addEventListener('dragend', () => {
      pill.classList.remove('dragging');
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('drag-over'));
    });
    pill.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!pill.classList.contains('dragging')) {
        pill.classList.add('drag-over');
      }
    });
    pill.addEventListener('dragleave', () => {
      pill.classList.remove('drag-over');
    });
    pill.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const fromWhich = e.dataTransfer.getData('which');
      const toIndex = parseInt(pill.dataset.index);

      if (fromWhich === which && fromIndex !== toIndex) {
        const tags = pillState[which].tags;
        const [moved] = tags.splice(fromIndex, 1);
        tags.splice(toIndex, 0, moved);
        renderPills(which);
      }
      pill.classList.remove('drag-over');
    });

    field.insertBefore(pill, input);
  });
  if (which === 'support') {
    updateConcertBlockSupportChecks();
  }
}

/**
 * Rebuild the per-concert-block support-act checkboxes to match the current
 * support pills, defaulting all present.
 */
export function updateConcertBlockSupportChecks() {
  const currentSupport = pillState.support.tags;
  document.querySelectorAll('.concert-block').forEach(block => {
    const existingGroup = block.querySelector('.form-group.full');
    if (existingGroup && existingGroup.querySelector('.support-checks')) {
      existingGroup.remove();
    }
    if (currentSupport.length > 0) {
      const presentList = [...currentSupport];
      const supChecks = `<div class="form-group full">
        <label>Support bei diesem Termin</label>
        <div class="support-checks">
          ${currentSupport.map(act => `
            <label class="sup-check">
              <input type="checkbox" class="cb-sup" data-act="${esc(act)}" ${presentList.includes(act)?'checked':''}>
              <div class="check-box">${icon('check')}</div>
              <span>${esc(act)}</span>
            </label>`).join('')}
        </div>
      </div>`;
      const firstFormGroup = block.querySelector('.form-grid > .form-group');
      if (firstFormGroup) {
        firstFormGroup.insertAdjacentHTML('afterend', supChecks);
      }
    }
  });
}

/** Remove the pill at index `i` from the `which` field and re-render. */
export function removePill(which, i) { pillState[which].tags.splice(i,1); renderPills(which); }

/**
 * Add `val` as a tag to the `which` field (if non-empty and not already
 * present), clear the input, re-render, and close the dropdown.
 * @param {'artist'|'support'|'bands'} which
 * @param {string} val
 */
export function addPillTag(which, val) {
  val = val.trim();
  if (val && !pillState[which].tags.includes(val)) pillState[which].tags.push(val);
  document.getElementById(which+'-input').value = '';
  renderPills(which);
  closeAcDrop(which+'-drop');
}

/**
 * Filter `state.knownBands` by the current input value and show up to eight
 * suggestions (prefix matches first, then substring) in the dropdown.
 * @param {'artist'|'support'|'bands'} which
 */
export function onPillInput(which) {
  const q = document.getElementById(which+'-input').value.trim().toLowerCase();
  if (!q) { closeAcDrop(which+'-drop'); return; }
  const starts   = state.knownBands.filter(b => b.toLowerCase().startsWith(q) && !pillState[which].tags.includes(b));
  const contains = state.knownBands.filter(b => b.toLowerCase().includes(q) && !b.toLowerCase().startsWith(q) && !pillState[which].tags.includes(b));
  const suggestions = [...starts, ...contains].slice(0,8);
  const drop = document.getElementById(which+'-drop');
  if (!suggestions.length) { drop.classList.remove('open'); return; }
  drop.innerHTML = suggestions.map(s => {
    const idx = s.toLowerCase().indexOf(q);
    const h = idx >= 0 ? esc(s.slice(0,idx))+'<span class="hi-text">'+esc(s.slice(idx,idx+q.length))+'</span>'+esc(s.slice(idx+q.length)) : esc(s);
    return `<div class="ac-item" onmousedown="event.preventDefault()" onclick="addPillTag('${which}','${s.replace(/'/g,"\\'")}')">
      ${h}</div>`;
  }).join('');
  drop.classList.add('open');
  pillState[which].hi = -1;
}

/** Show suggestions on focus (delegates to `onPillInput`). */
export function onPillFocus(which) { onPillInput(which); }

/** Close the dropdown shortly after the input loses focus. */
export function onPillBlur(which)  { setTimeout(() => closeAcDrop(which+'-drop'), 150); }

/**
 * Keyboard handler for a pill input: Enter selects the highlighted
 * suggestion or commits the typed value; Backspace on an empty input removes
 * the last tag; comma commits; ArrowUp/Down move the highlight.
 * @param {KeyboardEvent} e
 * @param {'artist'|'support'|'bands'} which
 */
export function onPillKey(e, which) {
  const items = document.querySelectorAll('#'+which+'-drop .ac-item');
  if (e.key === 'Enter') {
    e.preventDefault();
    const hi = pillState[which].hi;
    if (hi >= 0 && items[hi]) items[hi].click();
    else addPillTag(which, document.getElementById(which+'-input').value);
  } else if (e.key === 'Backspace' && !document.getElementById(which+'-input').value && pillState[which].tags.length) {
    pillState[which].tags.pop(); renderPills(which);
  } else if (e.key === ',' ) {
    e.preventDefault(); addPillTag(which, document.getElementById(which+'-input').value);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault(); pillState[which].hi = Math.min(pillState[which].hi+1, items.length-1);
    items.forEach((it,i) => it.classList.toggle('hi', i === pillState[which].hi));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); pillState[which].hi = Math.max(pillState[which].hi-1, -1);
    items.forEach((it,i) => it.classList.toggle('hi', i === pillState[which].hi));
  }
}

/**
 * Replace the tags of the `which` pill field (derived from `fieldId`) with
 * `tags` and re-render.
 * @param {string} fieldId Id ending in `-field`.
 * @param {string} inputId Id of the pill input (unused; kept for callers).
 * @param {string[]} tags
 */
export function updatePillDisplay(fieldId, inputId, tags) {
  const which = /** @type {any} */ (fieldId.replace('-field', ''));
  pillState[which].tags = [...tags];
  renderPills(which);
}

/**
 * Fetch the invite link for `eventId` from `/api/events/:id/invite`, copy the
 * full URL to the clipboard, and alert it.
 * @param {string} eventId
 */
export async function generateInvite(eventId) {
  try {
    const resp = await fetch('/api/events/' + eventId + '/invite');
    const data = await resp.json();

    if (!resp.ok) {
      alert(data.error || 'Einladung konnte nicht erstellt werden');
      return;
    }

    const fullUrl = window.location.origin + data.invite_url;
    await navigator.clipboard.writeText(fullUrl);
    alert('Einladungslink wurde in die Zwischenablage kopiert!\n\n' + fullUrl);

  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}
