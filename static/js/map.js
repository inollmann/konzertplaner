// ══════════════════════════════════════════════════════════════════════
// map.js — Leaflet map tab: instance, markers, geocoding, manual placement
//
// Owns the `#map` Leaflet instance, the venue-marker array, the
// Nominatim geocoding cache (localStorage `kp-venue-cache`), and the
// manual-venue-placement flow (unrecognised venues, marker edit/delete).
// `L` is the global injected by the Leaflet CDN <script> in index.html.
//
// Inline `onclick` handlers embedded in popup HTML call
//   editVenueMarker / saveEditedVenueMarker / deleteVenueMarker /
//   addUnrecognizedVenueMarker / saveUnrecognizedVenueMarker
// which main.js exposes on `window` (see globals wiring). This module
// therefore exports all of them; it never imports the global layer.
//
// `resetMap()` is the canonical replacement for the 12-line
// "remove markers → mapInstance.remove() → setTimeout(initMap, 100)"
// block that was duplicated across three filter functions in the
// original single-file app.js. The filter toggles in filters.js now
// dispatch a `filterchange` event; main.js calls `resetMap()` from that
// listener instead of each filter reaching into the map directly.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc } from './utils.js';
import { eventVisible } from './filters.js';
import { icon } from './icons.js';
import { saveKv } from './api.js';

// ── Module-local state ───────────────────────────────────────────────
let mapInstance = null;
let mapMarkers = [];
let mapInitialized = false;

let pendingEditMarker = null;
let pendingEditVenue = null;
let pendingEditCity = null;
let editMarkerClickHandler = null;

let pendingUnrecognizedVenue = null;
let tempMarkerInstance = null;
let tempMarkerClickHandler = null;

// ── Venue geocoding cache (localStorage `kp-venue-cache`) ─────────────
function getVenueCache() {
  try { return JSON.parse(localStorage.getItem('kp-venue-cache') || '{}'); }
  catch { return {}; }
}
function saveVenueCache(cache) {
  localStorage.setItem('kp-venue-cache', JSON.stringify(cache));
  saveKv('venueCache', cache);
}

/**
 * Geocode a venue via Nominatim, caching the result in localStorage
 * (`kp-venue-cache`) keyed by `venue|city`. Returns `{lat, lon}` or
 * `null` when no result is found / the request fails.
 * @param {string} venue
 * @param {string} city
 * @returns {Promise<{lat:number, lon:number}|null>}
 */
export async function geocodeVenue(venue, city) {
  const cache = getVenueCache();
  const key = `${venue}|${city}`;
  if (cache[key]) return cache[key];
  const query = encodeURIComponent(`${venue}, ${city || ''}`.replace(/,\s*$/, ''));
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
      headers: { 'User-Agent': 'Konzertplaner/1.0' }
    });
    const data = await resp.json();
    if (data && data.length > 0) {
      const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      cache[key] = coords;
      saveVenueCache(cache);
      return coords;
    }
  } catch (e) { console.error('Geocoding error:', e); }
  return null;
}

/**
 * Initialise the Leaflet map on `#map` if not already initialised, then
 * geocode every visible event's venues and place grouped markers. On a
 * repeat call (already initialised) it just invalidates the size. Venues
 * that fail to geocode are listed under `#unrecognized-venues` with a
 * button to place them manually. Inline popup `onclick`s call the
 * marker-edit/delete globals exposed by main.js.
 */
export async function initMap() {
  if (mapInitialized) {
    setTimeout(() => mapInstance?.invalidateSize(), 100);
    return;
  }
  if (typeof L === 'undefined') {
    document.getElementById('map').innerHTML = '<div style="padding:20px;color:red">Leaflet konnte nicht geladen werden. Bitte Seite neu laden.</div>';
    return;
  }
  mapInitialized = true;
  await new Promise(r => setTimeout(r, 100));
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  if (mapInstance) {
    try { mapInstance.remove(); } catch (e) {}
    mapInstance = null;
  }

  try {
    mapInstance = L.map('map').setView([51.1657, 10.4515], 6);
  } catch (e) {
    document.getElementById('map').innerHTML = '<div style="padding:20px;color:red">Fehler beim Erstellen der Karte: ' + e.message + '</div>';
    return;
  }
  try {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18
    }).addTo(mapInstance);
  } catch (e) {
    console.error('Error adding tile layer:', e);
  }

  const events = state.allEvents.filter(ev => eventVisible(ev));
  const venueGroups = {};
  const unrecognizedVenues = [];
  for (const ev of events) {
    if (ev.event_type === 'festival') {
      if (ev.venue && ev.city) {
        const coords = await geocodeVenue(ev.venue, ev.city);
        if (coords) {
          const key = `${coords.lat},${coords.lon}`;
          if (!venueGroups[key]) {
            venueGroups[key] = { lat: coords.lat, lon: coords.lon, venue: ev.venue, city: ev.city, concerts: [] };
          }
          venueGroups[key].concerts.push({ title: ev.name, date: ev.date, type: 'festival' });
        } else {
          const key = `${ev.venue}|${ev.city}`;
          if (!unrecognizedVenues.some(v => `${v.venue}|${v.city}` === key)) {
            unrecognizedVenues.push({ venue: ev.venue, city: ev.city });
          }
        }
      }
    } else {
      for (const c of ev.concerts || []) {
        if (c.venue && c.city) {
          const coords = await geocodeVenue(c.venue, c.city);
          if (coords) {
            const key = `${coords.lat},${coords.lon}`;
            if (!venueGroups[key]) {
              venueGroups[key] = { lat: coords.lat, lon: coords.lon, venue: c.venue, city: c.city, concerts: [] };
            }
            venueGroups[key].concerts.push({ title: Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist, date: c.date, type: 'tour' });
          } else {
            const key = `${c.venue}|${c.city}`;
            if (!unrecognizedVenues.some(v => `${v.venue}|${v.city}` === key)) {
              unrecognizedVenues.push({ venue: c.venue, city: c.city });
            }
          }
        }
      }
    }
  }

  const unrecognizedDiv = document.getElementById('unrecognized-venues');
  const unrecognizedList = document.getElementById('unrecognized-venues-list');
  if (unrecognizedVenues.length > 0) {
    unrecognizedDiv.style.display = 'block';
    unrecognizedList.innerHTML = unrecognizedVenues.map(v =>
      `<div class="unrecognized-item">
        <div class="unrecognized-info"><span>${esc(v.venue)}</span> <span>${esc(v.city)}</span></div>
        <button class="btn-sm" onclick="addUnrecognizedVenueMarker('${esc(v.venue)}', '${esc(v.city)}')">${icon('map-pin')} Markieren</button>
      </div>`
    ).join('');
  } else {
    unrecognizedDiv.style.display = 'none';
    unrecognizedList.innerHTML = '';
  }

  Object.values(venueGroups).forEach(vg => {
    const count = vg.concerts.length;
    const hasTours = vg.concerts.some(c => c.type === 'tour');
    const hasFestivals = vg.concerts.some(c => c.type === 'festival');
    let typeClass;
    if (hasTours && hasFestivals) {
      typeClass = 'mixed';
    } else if (hasFestivals) {
      typeClass = 'festival';
    } else {
      typeClass = 'tour';
    }
    const markerIcon = L.divIcon({
      className: 'venue-marker',
      html: `<div class="venue-marker-inner ${typeClass}"><span>${count}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    const marker = L.marker([vg.lat, vg.lon], {
      icon: markerIcon,
      venueKey: `${vg.venue}|${vg.city}`,
      draggable: true
    }).addTo(mapInstance);

    if (marker.dragging) {
      marker.dragging.disable();
    }

    const concertsList = vg.concerts.map(c =>
      `<div class="venue-popup-concert">
        <span class="venue-popup-type ${c.type}">${c.type === 'festival' ? icon('disc') : icon('music')}</span>
        <span class="venue-popup-title">${esc(c.title)}</span>
        <span class="venue-popup-date">${c.date}</span>
      </div>`
    ).join('');
    const popupContent = `
      <div class="venue-popup">
        <div class="venue-popup-header">${esc(vg.venue)}</div>
        <div class="venue-popup-city">${icon('map-pin')} ${esc(vg.city)}</div>
        <div class="venue-popup-list">${concertsList}</div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="venue-popup-edit" onclick="editVenueMarker(this, '${esc(vg.venue)}', '${esc(vg.city)}')">${icon('map-pin')} Bearbeiten</button>
          <button class="venue-popup-delete" onclick="deleteVenueMarker('${esc(vg.venue)}', '${esc(vg.city)}')">${icon('trash-2')} Löschen</button>
        </div>
      </div>
    `;
    marker.bindPopup(popupContent);

    marker.venueKey = `${vg.venue}|${vg.city}`;
    mapMarkers.push(marker);
  });

  if (mapMarkers.length > 0) {
    const group = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.1));
  }
  if (mapEl && mapEl.firstChild && mapEl.firstChild.tagName === 'DIV') {
    mapEl.innerHTML = '';
  }
  setTimeout(() => mapInstance?.invalidateSize(), 300);
}

/**
 * Force a full re-render of the map: drop the `mapInitialized` guard and
 * call `initMap()`, which tears down any existing instance and re-geocodes
 * / re-places all markers. Synchronous counterpart to `resetMap` (which
 * destroys the instance first and re-inits after a short delay).
 */
export function renderMap() {
  mapInitialized = false;
  initMap();
}

/**
 * Tear down the current map (remove all markers, destroy the Leaflet
 * instance) and re-initialise after a 100 ms delay. This is the
 * canonical replacement for the 12-line "map re-init" block that was
 * duplicated across `toggleFilter`, `toggleEventTypeFilter`, and
 * `toggleDateFilter` in the original app.js. No-op when the map tab is
 * not active or no instance exists.
 */
export function resetMap() {
  if (!mapInstance || state.currentTab !== 'map') return;
  mapMarkers.forEach(m => mapInstance.removeLayer(m));
  mapMarkers = [];
  mapInstance.remove();
  mapInstance = null;
  mapInitialized = false;
  setTimeout(() => initMap(), 100);
}

/**
 * Open the edit popup for a venue marker: enables dragging, listens for
 * map clicks to reposition the marker, and shows a Save button that
 * calls the global `saveEditedVenueMarker`. Called from an inline popup
 * `onclick`; main.js exposes it on `window`.
 * @param {HTMLButtonElement} btn
 * @param {string} venue
 * @param {string} city
 */
export function editVenueMarker(btn, venue, city) {
  const marker = mapMarkers.find(m => m.venueKey === `${venue}|${city}`);
  if (!marker) {
    console.error('Marker not found for:', venue, city);
    return;
  }

  if (editMarkerClickHandler) {
    mapInstance.off('click', editMarkerClickHandler);
    editMarkerClickHandler = null;
  }
  if (pendingEditMarker && pendingEditMarker.dragging) {
    pendingEditMarker.dragging.disable();
  }

  mapInstance.closePopup();

  pendingEditMarker = marker;
  pendingEditVenue = venue;
  pendingEditCity = city;

  if (marker.dragging) {
    marker.dragging.enable();
  }

  const popupContent = `
    <div style="min-width: 150px; text-align: center;">
      <b>${venue}</b><br>
      <span style="color: #666; font-size: 12px;">${city}</span><br><br>
      <span style="font-size: 11px; color: var(--muted);">Ziehe den Marker oder klicke auf die Karte</span><br><br>
      <button class="btn-save-marker" onclick="saveEditedVenueMarker()">${icon('save')} Speichern</button>
    </div>
  `;
  marker.bindPopup(popupContent).openPopup();

  editMarkerClickHandler = function (e) {
    marker.setLatLng(e.latlng);
  };

  mapInstance.on('click', editMarkerClickHandler);
}

/**
 * Persist the dragged position of the marker being edited to the
 * geocoding cache, clean up the edit handler, confirm to the user, and
 * re-render the map. Called from the inline Save-button `onclick`.
 */
export function saveEditedVenueMarker() {
  if (!pendingEditMarker || !pendingEditVenue || !pendingEditCity) {
    console.error('No pending edit to save');
    return;
  }

  const { venue, city } = { venue: pendingEditVenue, city: pendingEditCity };
  const latLng = pendingEditMarker.getLatLng();
  const newLat = latLng.lat;
  const newLon = latLng.lng;

  const cache = getVenueCache();
  cache[`${venue}|${city}`] = { lat: newLat, lon: newLon };
  saveVenueCache(cache);

  if (editMarkerClickHandler) {
    mapInstance.off('click', editMarkerClickHandler);
    editMarkerClickHandler = null;
  }
  if (pendingEditMarker.dragging) {
    pendingEditMarker.dragging.disable();
  }
  pendingEditMarker.closePopup();
  pendingEditMarker = null;
  pendingEditVenue = null;
  pendingEditCity = null;

  alert(`Position von "${venue}" gespeichert:\n${newLat.toFixed(5)}, ${newLon.toFixed(5)}`);

  mapInitialized = false;
  initMap();
}

/**
 * Begin manual placement of an unrecognised venue: tries Google's
 * geocode endpoint for an initial position (falling back to the map
 * centre), drops a draggable temp marker with a Save button, and listens
 * for map clicks to reposition it. Called from the inline `onclick` of
 * the "Markieren" button (map-pin icon) in the unrecognised-venues list.
 * @param {string} venue
 * @param {string} city
 */
export async function addUnrecognizedVenueMarker(venue, city) {
  if (!mapInstance) {
    alert('Bitte wechsle zuerst zur Karten-Ansicht.');
    return;
  }

  if (tempMarkerInstance) {
    if (tempMarkerClickHandler) {
      mapInstance.off('click', tempMarkerClickHandler);
      tempMarkerClickHandler = null;
    }
    tempMarkerInstance.remove();
    tempMarkerInstance = null;
  }

  mapInstance.closePopup();

  pendingUnrecognizedVenue = { venue, city };

  let initialLatLng = null;
  const query = encodeURIComponent(`${venue}, ${city || ''}`.replace(/,\s*$/, ''));

  try {
    const googleResp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&sensor=false`);
    const googleData = await googleResp.json();
    if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
      initialLatLng = {
        lat: googleData.results[0].geometry.location.lat,
        lng: googleData.results[0].geometry.location.lng
      };
      console.log('Google geocoding found:', initialLatLng);
    }
  } catch (e) {
    console.log('Google geocoding failed, trying manual placement:', e);
  }

  if (!initialLatLng) {
    initialLatLng = mapInstance.getCenter();
  }

  tempMarkerInstance = L.marker(initialLatLng, { draggable: true }).addTo(mapInstance);

  const popupContent = `
    <div style="min-width: 150px; text-align: center;">
      <b>${venue}</b><br>
      <span style="color: #666; font-size: 12px;">${city}</span><br><br>
      <button class="btn-save-marker" onclick="saveUnrecognizedVenueMarker()">${icon('save')} Speichern</button>
    </div>
  `;
  tempMarkerInstance.bindPopup(popupContent).openPopup();

  tempMarkerClickHandler = function (e) {
    tempMarkerInstance.setLatLng(e.latlng);
  };

  mapInstance.on('click', tempMarkerClickHandler);
}

/**
 * Persist the manually placed temp marker to the geocoding cache, remove
 * the temp marker, confirm to the user, and re-render the map so the
 * venue now appears as a regular marker. Called from the inline Save
 * button `onclick`.
 */
export function saveUnrecognizedVenueMarker() {
  if (!pendingUnrecognizedVenue || !tempMarkerInstance) {
    console.error('No pending venue to save');
    return;
  }

  const { venue, city } = pendingUnrecognizedVenue;
  const latLng = tempMarkerInstance.getLatLng();
  const newLat = latLng.lat;
  const newLon = latLng.lng;

  const cache = getVenueCache();
  cache[`${venue}|${city}`] = { lat: newLat, lon: newLon };
  saveVenueCache(cache);

  if (tempMarkerClickHandler) {
    mapInstance.off('click', tempMarkerClickHandler);
    tempMarkerClickHandler = null;
  }
  tempMarkerInstance.closePopup();
  tempMarkerInstance.remove();
  tempMarkerInstance = null;
  pendingUnrecognizedVenue = null;

  alert(`Position von "${venue}" gespeichert:\n${newLat.toFixed(5)}, ${newLon.toFixed(5)}`);

  mapInitialized = false;
  initMap();
}

/**
 * Remove a venue's marker and delete its cached coordinates (confirming
 * first), then re-render so the venue drops back into the
 * unrecognised-venues list. Called from the inline "Löschen" popup (trash-2 icon)
 * `onclick`.
 * @param {string} venue
 * @param {string} city
 */
export function deleteVenueMarker(venue, city) {
  if (!confirm(`Möchtest du den Marker für "${venue}" in ${city} wirklich löschen? Der Veranstaltungsort wird wieder in die Liste der unbekannten Orte aufgenommen.`)) {
    return;
  }

  const cache = getVenueCache();
  delete cache[`${venue}|${city}`];
  saveVenueCache(cache);

  const markerIndex = mapMarkers.findIndex(m => m.venueKey === `${venue}|${city}`);
  if (markerIndex !== -1) {
    const marker = mapMarkers[markerIndex];
    mapInstance.removeLayer(marker);
    mapMarkers.splice(markerIndex, 1);
  }

  mapInitialized = false;
  initMap();
}
