// ══════════════════════════════════════════════════════════════════════
// road.js — 3D-Zeitstrahl als gerade Straße (Three.js)
//
// Ersetzt den alten horizontalen 2D-Zeitstrahl (timeline.js). Eine gerade
// 3D-Straße verläuft vom Betrachter weg in Richtung Horizont. Die Tiefe
// (Z) ist die Zeit: Heute ist beim Startpunkt, die Zukunft reicht bis zum
// Horizont. Man "fährt" per Scrollen entlang der Straße — das bewegt die
// Kamera entlang Z, ein Scroll-Schritt entspricht ≈ 1 Tag.
//
// Kern-Idee (aus dem OpenDesign-Referenz-Konzept):
//   - Eine Kamera sitzt AUF der Fahrbahn (Höhe CAM_HEIGHT) und blickt
//     entlang +Z in die Ferne → klassische 1-Punkt-Perspektive.
//   - Fahren = Kamerabewegung entlang Z (nicht Objekte verschieben).
//   - Distanz-Nebel (scene.fog) lässt Linien/Schilder am fernen Ende
//     ausblenden, statt sie im Fluchtpunkt kollidieren zu lassen.
//   - Der gestrichelte Mittelstreifen IST der Datums-Indikator: Jeder
//     Strich = 1 Tag, jede Lücke = 1 Tag. In jeden Strich / jede Lücke
//     wird die Tageszahl direkt auf die Fahrbahn geschrieben (Font in der
//     jeweils kontrastierenden Farbe). Am Monatsanfang steht der Monats-
//     name auf der Fahrbahn. (Straßenrand-Tages-Ticks entfallen.)
//   - Event-Schilder an beiden Straßenseiten, alternierend; Farbe nach
//     Kategorie: Tour = Cyan (--tour), Festival = Pink (--festival).
//   - Wichtig: Der sichtbare Tages-Abstand wird durch die Kameraposition
//     bestimmt, nicht durch Welt-Skalierung. Die Kamera steht so dicht
//     auf der Straße, dass im Vordergrund nur wenige Tage gleichzeitig
//     sichtbar sind.
//
// Exportierte Oberfläche (alles andere ist modul-privat):
//   initRoad / renderRoad            — aus main.js
//   roadToday / roadNavEvent         — aus index.html (inline onclick)
//   sowie pure Helfer für road.test.js (dayOffsetDays, worldZ,
//   visibleDayWindow, formatRoadDate).
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc } from './utils.js';
import { eventVisible } from './filters.js';

// ── Konstanten ─────────────────────────────────────────────────────────
export const DAY_MS = 86400000;
export const ROAD_VISIBLE_DAYS = 90;   // sichtbare Tage vor der Kamera
const DAY_SCALE = 1.0;                 // Welt-Einheiten (Z) pro Tag
const CAM_HEIGHT = 1.6;                // Kamera-Höhe über der Fahrbahn (näher am Konzept CAMH=1.55)
const CAM_LOOK_Y = -10;                // Blickziel-Y: Kamera neigt sich nach unten → Horizont steigt, Straße füllt mehr Bild
const ROAD_WIDTH = 6.4;
const ROAD_HALF = ROAD_WIDTH / 2;
const SIGN_X = ROAD_HALF + 2.0;        // Schilder seitlich der Straße
const FOG_NEAR = 40;                   // Nebel beginnt (Z ab Kamera)
const FOG_FAR = ROAD_VISIBLE_DAYS + 4; // Nebel voll (Z ab Kamera)
// Fester Welt-Anker: Z-Werte werden relativ zu diesem Datum berechnet,
// damit die Welt beim Scrollen stabil bleibt (Kamera fährt, Objekte stehen).
const EPOCH = Date.UTC(2020, 0, 1);
const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// ── Pure Logik (für Tests) ──────────────────────────────────────────────
/** Differenz in Tagen zwischen einem ms-Timestamp und dem Straßen-Mittelpunkt. */
export function dayOffsetDays(ms, centerMs) { return (ms - centerMs) / DAY_MS; }

/**
 * Welt-Z eines Tages-Offsets relativ zum aktuellen Straßen-Mittelpunkt.
 * Zukunft (offset > 0) = größeres Z (Richtung Horizont), Vergangenheit
 * (offset < 0) = kleineres Z (hinter der Kamera). Linear, 1 Einheit pro Tag.
 */
export function worldZ(offsetDays) { return offsetDays * DAY_SCALE; }

/**
 * Liste der im Fenster zu rendernden Tage (offsetDays), inkl. Puffer.
 * Rein (für Tests): nimmt `centerMs` als Parameter statt Modul-Zustand.
 * @param {number} centerMs Straßen-Mittelpunkt (ms)
 * @param {number} bufferDays
 * @returns {{offset:number, isMonthStart:boolean}[]}
 */
export function visibleDayWindow(centerMs, bufferDays) {
  const out = [];
  for (let i = -bufferDays; i <= ROAD_VISIBLE_DAYS + bufferDays; i++) {
    const d = new Date(centerMs + i * DAY_MS);
    out.push({ offset: i, isMonthStart: d.getDate() === 1 });
  }
  return out;
}

/**
 * Kopf-Datum formatieren: Tag/Monat (weiß) + Jahr (Akzentfarbe).
 * @param {number} ms
 * @returns {{dmy:string, year:number}}
 */
export function formatRoadDate(ms) {
  const d = new Date(ms);
  return { dmy: `${d.getDate()}. ${MONTHS[d.getMonth()]}`, year: d.getFullYear() };
}

// ── Three.js-Szene ─────────────────────────────────────────────────────
let scene, camera, renderer, raycaster;
let ro = null;            // ResizeObserver für den Canvas
let dayCellPool = [];     // gepoolte Tages-Zellen (Mittelstreifen-Striche + Tageszahl)
let monthLabelPool = [];  // gepoolte Monatsnamen auf der Fahrbahn
let yearLabelPool = [];   // gepoolte Jahreszahlen auf der Fahrbahn (rechte Seite)
let signPool = [];        // gepoolte Event-Schilder (Groups)
let roadMesh = null;
let roadGroup = null;     // Gruppiert Fahrbahn + Linien, wandert mit der Kamera
let posLine = null;       // Akzent-Querlinie an der aktuellen Fahrtposition
let todayMarker = null;   // "Heute"-Pfosten am heutigen Datum
let canvasEl = null;
let running = false;
let dirty = true;
let disposed = false;

let roadCenterMs = 0;     // Zeit an der aktuellen Fahrtposition (Kamera)
let roadTargetMs = 0;     // Ziel beim Scrollen (glatt)
let reducedMotion = false;
let fontsReady = false;   // true, sobald Bebas Neue/DM Sans geladen sind
let roadColHex = '#27272a'; // Fahrbahnfarbe (als Hex, für Kontrast-Font)
let pointer = { downX: 0, downY: 0, down: false, moved: false };

// Theme-Farben (aus CSS-Variablen gelesen)
function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return fallback;
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return new THREE.Color('#' + m[1]);
  const rgb = v.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return new THREE.Color(parseInt(rgb[1], 10) / 255, parseInt(rgb[2], 10) / 255, parseInt(rgb[3], 10) / 255);
  return fallback;
}

/** Welt-Z eines ms-Datums (absolut, relativ zu EPOCH). */
function dateZ(ms) { return (ms - EPOCH) / DAY_MS * DAY_SCALE; }

/** 12:00-Ortszeit-Date aus ms (offset-agnostisch, verhindert Datums-Shift). */
function noonDate(ms) { return new Date(new Date(ms).setHours(12, 0, 0, 0)); }

/** Sammelt sichtbare Event-Einträge (Festival = ein Datum, Tour = je Konzert). */
function collectEntries() {
  const entries = [];
  state.allEvents.filter(ev => eventVisible(ev)).forEach(ev => {
    if (ev.event_type === 'festival') {
      entries.push({ iso: ev.date, type: 'festival', label: ev.name, id: ev.id, poster: ev.poster || null });
    } else {
      const label = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
      (ev.concerts || []).forEach(c => {
        entries.push({ iso: c.date, type: 'tour', label, id: ev.id, poster: ev.poster || null, data: c });
      });
    }
  });
  entries.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
  return entries;
}

// ── Initialisierung ────────────────────────────────────────────────────
export function initRoad() {
  const canvas = document.getElementById('road-canvas');
  if (!canvas) return;
  canvasEl = canvas;

  const bgColor = cssColor('--surface2', new THREE.Color(0x14161a));
  scene = new THREE.Scene();
  scene.background = bgColor;
  // Distanz-Nebel: ferne Linien/Schilder verlaufen sich sanft im Horizont.
  // Nebelfarbe = Hintergrundfarbe, damit der ferne Straßenverlauf sauber mit
  // dem Horizont verschmilzt (Fog färbt nur Geometrie, nicht den Hintergrund).
  scene.fog = new THREE.Fog(bgColor, FOG_NEAR, FOG_FAR);

  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const fov = 70;
  camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 400);
  // Kamera AUF der Fahrbahn, leicht hinter "Heute", blickt entlang +Z
  camera.position.set(0, CAM_HEIGHT, -6);
  camera.lookAt(0, CAM_LOOK_Y, 60);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvas.appendChild(renderer.domElement);
  // Größe setzen — auch wenn der Tab beim Boot noch versteckt ist (Width 0),
  // damit der Canvas nicht 0×0 bleibt und nichts gezeichnet wird.
  resizeRenderer();

  raycaster = new THREE.Raycaster();

  buildRoad();
  buildTodayMarker();
  buildPosLine();

  // initialer Zustand = heute
  roadCenterMs = new Date().setHours(0, 0, 0, 0);
  roadTargetMs = roadCenterMs;

  reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Schriftarten für die Schild-Texturen vorladen. Ohne das werden die
  // Texturen beim ersten Render mit einer breiteren Fallback-Schrift
  // gezeichnet → Text zu groß / läuft über. Sobald die echten Webfonts
  // geladen sind, alle Schilder neu zeichnen lassen.
  if (document.fonts && document.fonts.ready) {
    Promise.all([
      document.fonts.load('bold 74px "Bebas Neue"'),
      document.fonts.load('38px "DM Sans"'),
    ]).catch(() => {}).then(() => {
      fontsReady = true;
      for (const g of signPool) { g.userData.label = ''; g.userData.type = ''; }
      // Tages-/Monatstexture mit der echten Webfont neu zeichnen
      for (const c of dayCellPool) c.userData.key = '';
      for (const l of monthLabelPool) l.userData.key = '';
      for (const y of yearLabelPool) y.userData.key = '';
      dirty = true;
    });
  } else {
    fontsReady = true;
  }

  wireInput(canvas);
  window.addEventListener('resize', onResize);
  // Größenänderungen beobachten: Wenn der Kalender-Tab sichtbar wird, wächst
  // das Panel von 0 auf seine echte Breite → Renderer muss angepasst werden.
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { resizeRenderer(); dirty = true; });
    ro.observe(canvas);
  }

  running = true;
  dirty = true;
  requestAnimationFrame(tick);
}

function buildRoad() {
  roadGroup = new THREE.Group();
  // Fahrbahnfläche: langes, flaches Plane, verläuft hinter die Kamera.
  // Lokale Koordinaten: Z von -40 (hinter Kamera) bis FOG_FAR (Horizont);
  // die Group wird pro Frame auf die Kameraposition (camZ) gesetzt, sodass
  // die Straße immer unter der Kamera verläuft.
  const roadLen = FOG_FAR + 40;
  const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, roadLen);
  const roadCol = cssColor('--surface3', new THREE.Color(0x27272a));
  roadColHex = '#' + roadCol.getHexString(); // für kontrastierende Tageszahlen
  const roadMat = new THREE.MeshBasicMaterial({ color: roadCol });
  roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.set(0, -0.01, roadLen / 2 - 40);
  roadGroup.add(roadMesh);

  // Seitenlinien: Akzentlinien an beiden Rändern (durch Nebel auslaufend)
  const edgeMat = new THREE.MeshBasicMaterial({ color: cssColor('--accent', new THREE.Color(0xe8ff47)), transparent: true, opacity: 0.6 });
  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, roadLen), edgeMat);
    line.position.set(side * (ROAD_HALF - 0.3), 0.0, roadLen / 2 - 40);
    roadGroup.add(line);
  }

  // Der gestrichelte Mittelstreifen ist der Datums-Indikator und wird pro
  // Frame als Tages-Zellen-Pool neu aufgebaut (siehe makeDayCell/renderRoad),
  // damit jeder Strich/jede Lücke genau einem Tag entspricht.

  scene.add(roadGroup);
}

function buildTodayMarker() {
  // "Heute"-Pfosten: Akzent-Stab am Straßenrand mit Beschriftung
  const mat = new THREE.MeshBasicMaterial({ color: cssColor('--accent', new THREE.Color(0xe8ff47)) });
  todayMarker = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.0, 0.2), mat);
  todayMarker.position.set(-ROAD_HALF - 0.8, 1.5, 0);
  scene.add(todayMarker);
}

function buildPosLine() {
  // Akzent-Querlinie über die Fahrbahn an der aktuellen Fahrtposition
  const mat = new THREE.MeshBasicMaterial({ color: cssColor('--accent', new THREE.Color(0xe8ff47)) });
  posLine = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 0.3, 0.05, 0.15), mat);
  scene.add(posLine);
}

// ── Pool-Helfer ─────────────────────────────────────────────────────────
/** Distanzbasierte Deckkraft (Fernwirkung): Elemente verblassen zum Horizont.
 *  Kurve analog zum OpenDesign-Konzept: fog(dz) = max(0, 1-(dz/FOG_FAR)^2.3) */
function fogOpacity(z, camZ) {
  const dz = (z - camZ) / DAY_SCALE;
  if (dz <= 0) return 1;
  const t = Math.max(0, Math.min(1, dz / (FOG_FAR - 6)));
  return Math.max(0.06, 1 - Math.pow(t, 2.6));
}
/** Tages-Zelle des Mittelstreifens: eine flache Plane (1×1 Welt-Einheiten)
 *  direkt auf der Fahrbahn, deren Textur entweder ein heller Strich
 *  (gerade Tage) oder die dunkle Lücke (ungerade Tage) mit der jeweils
 *  kontrastierenden Tageszahl ist. Ein Tag = 1 Einheit Z. */
function makeDayCell() {
  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2; // flach auf die Fahrbahn legen
  m.visible = false;
  m.userData = { cv, ctx: cv.getContext('2d'), tex, key: '' };
  scene.add(m);
  return m;
}

/** Monatsname als flache Plane, direkt auf die Fahrbahn geschrieben. */
function makeMonthLabel() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.15), mat);
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  m.userData = { cv, ctx: cv.getContext('2d'), tex, key: '' };
  scene.add(m);
  return m;
}

/** Jahreszahl als flache Plane, rechts auf die Fahrbahn geschrieben
 *  (Spiegelbild der Monatsnamen, sodass "OKT 1 2026" entsteht). */
function makeYearLabel() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.15), mat);
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  m.userData = { cv, ctx: cv.getContext('2d'), tex, key: '' };
  scene.add(m);
  return m;
}

/** Zeichnet eine Tages-Zelle: Hintergrund (heller Strich ODER dunkle Lücke)
 *  plus die Tageszahl in der kontrastierenden Schriftfarbe. Die Textur wird
 *  so gedreht gezeichnet, dass die Zahl auf der flach liegenden Plane in
 *  Fahrtrichtung (+Z, zum Horizont) aufrecht lesbar ist. */
function drawDayCellTexture(cv, ctx, day, isDash, dashHex, roadHex) {
  const s = cv.width, h = cv.height;
  ctx.clearRect(0, 0, s, h);
  ctx.save();
  // PlaneGeometry(-90°): V der Textur zeigt nach -Z (hinten). Damit die Zahl
  // für den entlang +Z blickenden Betrachter aufrecht steht, muss sie in der
  // Textur um 180° gedreht gezeichnet werden.
  ctx.translate(s / 2, h / 2);
  ctx.rotate(Math.PI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isDash) {
    // Heller Strich als abgerundetes Rechteck über fast die ganze Zelle
    // (≈ 1 Tag lang), damit Strich : Lücke ≈ 1 : 1 ist.
    ctx.fillStyle = dashHex;
    roundRect(ctx, -s * 0.14, -h * 0.48, s * 0.28, h * 0.96, s * 0.14);
    ctx.fill();
  }
  ctx.fillStyle = isDash ? roadHex : dashHex; // Strich → dunkle Zahl; Lücke → helle Zahl
  const font = '"Bebas Neue", sans-serif';
  // Schriftgröße so wählen, dass die Zahl IN die Zelle passt (Strich ist nur
  // s*0.28 breit) und nicht über die Kanten hinausläuft.
  const maxW = s * 0.24;
  let size = String(day).length > 1 ? 66 : 84;
  ctx.font = `bold ${size}px ${font}`;
  while (ctx.measureText(String(day)).width > maxW && size > 18) {
    size -= 3;
    ctx.font = `bold ${size}px ${font}`;
  }
  ctx.fillText(String(day), 0, 4);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Zeichnet einen Text (z.B. "OKT" oder "2026") auf eine flache Fahrbahn-
 *  Label-Textur. Ebenfalls 180° gedreht, damit der Text auf der Straße
 *  aufrecht steht. `align` = 'start' richtet linksbündig aus (Monat auf der
 *  linken Spur), 'end' rechtsbündig (Jahr auf der rechten Spur), sodass
 *  zusammen mit der mittigen Tageszahl "OKT 1 2026" entsteht. */
function drawMonthTexture(cv, ctx, label, fontCol, align = 'start') {
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI);
  // Nach der 180°-Drehung ist die horizontale Achse gespiegelt: textAlign
  // 'right' wirkt linksbündig, 'left' rechtsbündig.
  ctx.textAlign = align === 'end' ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fontCol;
  const font = '"Bebas Neue", sans-serif';
  let size = 92;
  ctx.font = `bold ${size}px ${font}`;
  const maxW = w - 48;
  while (ctx.measureText(label).width > maxW && size > 40) {
    size -= 4;
    ctx.font = `bold ${size}px ${font}`;
  }
  ctx.fillText(label, align === 'end' ? -(w / 2 - 20) : w / 2 - 20, 4);
  ctx.restore();
}

function makeSign() {
  const g = new THREE.Group();
  // Schild-Plane (Text) — doppelseitig, unlit (immer sichtbar)
  const tex = makeSignTexture('', '', '#888');
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 2.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
  plane.userData.sign = true;
  plane.position.set(0, 2.6, 0);
  // Plane zeigt standardmäßig mit der Vorderseite nach +Z (weg von der Kamera,
  // die entlang +Z blickt). Um 180° drehen, damit die Beschriftung zum
  // Betrachter zeigt und nicht gespiegelt von hinten sichtbar ist.
  plane.rotation.y = Math.PI;
  g.add(plane);
  // Schaft (Pfosten)
  const pole = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 2.6, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true })
  );
  pole.position.set(0, 1.3, 0);
  g.add(pole);
  g.visible = false;
  scene.add(g);
  g.userData = { plane, label: '', type: '' };
  return g;
}

/** Erzeugt eine Canvas-Textur für ein Event-Schild (Name + Datum, Kategorie-Farbe). */
function makeSignTexture(label, dateText, colorHex) {
  const w = 512, h = 240;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const col = colorHex || '#888';
  const font = '"Bebas Neue", sans-serif';
  // Dunkle Platte mit dezentem Verlauf (oben etwas heller)
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1c2026');
  grad.addColorStop(0.5, '#15181d');
  grad.addColorStop(1, '#0f1114');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Kräftige Kopfzeile (Kategorie) über die volle Breite
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, w, 50);
  // Leuchtender Außenrahmen in Kategorie-Farbe
  ctx.strokeStyle = col;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  // Dezenter Innenschatten unter der Kopfzeile (Tiefe)
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(3, 52, w - 6, 6);
  // Künstler-Name groß (Bebas Neue, weiß). Schriftgröße so weit verkleinern,
  // dass der (ggf. gekürzte) Text in die Schildbreite passt — sonst läuft er
  // über, solange die Webfont noch nicht geladen ist.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 8;
  let name = (label || '').toUpperCase();
  if (name.length > 18) name = name.slice(0, 17) + '…';
  const maxW = w - 60;
  let size = 78;
  do {
    ctx.font = `bold ${size}px ${font}`;
    if (ctx.measureText(name).width <= maxW) break;
    size -= 2;
  } while (size > 26);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, w / 2, 96);
  // Datum klein darunter — in der Kategorie-Farbe, kräftig
  ctx.shadowBlur = 4;
  ctx.fillStyle = col;
  ctx.font = 'bold 40px "DM Sans", sans-serif';
  ctx.fillText(dateText, w / 2, 172);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ── Interaktion (Scrollen, Klick) ───────────────────────────────────────
function wireInput(canvas) {
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', e => { pointer.down = true; pointer.moved = false; pointer.downX = e.clientX; pointer.downY = e.clientY; });
  canvas.addEventListener('mousemove', e => {
    if (!pointer.down) return;
    if (Math.abs(e.clientX - pointer.downX) + Math.abs(e.clientY - pointer.downY) > 6) pointer.moved = true;
  });
  window.addEventListener('mouseup', () => { pointer.down = false; });
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    pointer.down = true; pointer.moved = false; pointer.downX = t.clientX; pointer.downY = t.clientY;
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (pointer.down && Math.abs(t.clientX - pointer.downX) + Math.abs(t.clientY - pointer.downY) > 6) pointer.moved = true;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pointer.down = false; });
}

function onWheel(e) {
  e.preventDefault();
  // Normalisiere delta (Linien/Seiten = Zeilen) auf Pixel
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;      // Zeilen
  else if (e.deltaMode === 2) dy *= 100; // Seiten
  // ≈ 1 Tag pro Scroll-Schritt: 120px-Delta entspricht 1 Tag
  const days = dy / 120;
  roadTargetMs += days * DAY_MS;
  if (roadTargetMs < 0) roadTargetMs = 0;
  dirty = true;
}

function onClick(e) {
  if (pointer.moved) return; // kein Klick nach Drag
  const rect = canvasEl.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const h of hits) {
    const o = h.object;
    const g = findSignGroup(o);
    if (!g) continue;
    if (o.userData?.sign && g.userData.id) {
      window.openDetail?.(g.userData.id);
      return;
    }
  }
}

/** Findet die Schild-Group zu einem getroffenen Mesh (über die Parent-Kette). */
function findSignGroup(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData && cur.userData.id) return cur;
    cur = cur.parent;
  }
  return null;
}

// ── Rendern (rAF-throttled) ─────────────────────────────────────────────
function tick() {
  if (!running || disposed) return;
  requestAnimationFrame(tick);
  // glattes Scrollen: Kamera gleicht zum Ziel
  if (!reducedMotion) {
    const diff = roadTargetMs - roadCenterMs;
    if (Math.abs(diff) > 1) {
      roadCenterMs += diff * 0.18;
      dirty = true;
    }
  } else {
    if (roadTargetMs !== roadCenterMs) { roadCenterMs = roadTargetMs; dirty = true; }
  }
  if (dirty) { renderRoad(); dirty = false; }
}

export function renderRoad() {
  if (!scene || !renderer || !canvasEl) return;
  // Sicherstellen, dass der Renderer eine echte Größe hat (z.B. wenn der Tab
  // gerade erst sichtbar wurde und das Panel von 0 gewachsen ist).
  resizeRenderer();
  const camZ = dateZ(roadCenterMs);
  camera.position.z = camZ;
  camera.lookAt(0, CAM_LOOK_Y, camZ + 60);

  // Fahrbahn + Linien folgen der Kamera (lokale Z um 0), damit die Straße
  // immer direkt unter der Kamera in Richtung Horizont verläuft.
  if (roadGroup) roadGroup.position.z = camZ;

  const days = visibleDayWindow(roadCenterMs, 4);

  // ── Mittelstreifen als Datums-Indikator ───────────────────────────────
  // Jeder Tag = ein 1 Einheit langes Zellen-Intervall: gerade Offsets sind
  // ein heller Strich (dunkle Tageszahl in Straßenfarbe), ungerade eine
  // dunkle Lücke (helle Tageszahl). So wechselt die Schriftfarbe Tag für Tag
  // und passt sich der jeweils kontrastierenden Fläche an.
  const dashCol = cssColor('--text', new THREE.Color(0xdddddd));
  const dashHex = '#' + dashCol.getHexString();
  const dayCells = days.filter(d => d.offset >= -4);
  ensurePool(dayCellPool, dayCells.length, makeDayCell);
  for (let i = 0; i < dayCells.length; i++) {
    const m = dayCellPool[i];
    const d = dayCells[i];
    const z = camZ + d.offset * DAY_SCALE;
    const isDash = (d.offset % 2 === 0);
    const dt = noonDate(roadCenterMs + d.offset * DAY_MS);
    const day = dt.getDate();
    m.visible = true;
    m.position.set(0, 0.02, z);
    const key = `${day}|${isDash}|${dashHex}|${roadColHex}`;
    if (m.userData.key !== key) {
      drawDayCellTexture(m.userData.cv, m.userData.ctx, day, isDash, dashHex, roadColHex);
      m.userData.tex.needsUpdate = true;
      m.userData.key = key;
    }
    m.material.opacity = fogOpacity(z, camZ);
  }
  for (let i = dayCells.length; i < dayCellPool.length; i++) dayCellPool[i].visible = false;

  // ── Monatsnamen auf der Fahrbahn (Monatsanfang) ───────────────────────
  // Linksbündig auf der linken Fahrbahnhälfte platziert, damit die Namen
  // nicht die mittigen Tageszahlen überlagern. Schrift in der Akzentfarbe.
  const accentCol = cssColor('--accent', new THREE.Color(0xe8ff47));
  const accentHex = '#' + accentCol.getHexString();
  const months = days.filter(d => d.isMonthStart && d.offset >= 0);
  ensurePool(monthLabelPool, months.length, makeMonthLabel);
  for (let i = 0; i < months.length; i++) {
    const m = monthLabelPool[i];
    const d = months[i];
    const z = camZ + d.offset * DAY_SCALE;
    const dt = noonDate(roadCenterMs + d.offset * DAY_MS);
    const label = MONTHS[dt.getMonth()].toUpperCase();
    m.visible = true;
    m.position.set(ROAD_HALF * 0.85, 0.05, z);
    const key = `${label}|${accentHex}`;
    if (m.userData.key !== key) {
      drawMonthTexture(m.userData.cv, m.userData.ctx, label, accentHex);
      m.userData.tex.needsUpdate = true;
      m.userData.key = key;
    }
    m.material.opacity = fogOpacity(z, camZ);
  }
  for (let i = months.length; i < monthLabelPool.length; i++) monthLabelPool[i].visible = false;

  // ── Jahreszahl auf der Fahrbahn (rechte Seite, zu jedem Monatsanfang) ──
  // Spiegelbild des Monatsnamens auf der rechten Spur, sodass zusammen mit
  // der mittigen Tageszahl "OKT 1 2026" entsteht. Schrift in der Akzentfarbe.
  ensurePool(yearLabelPool, months.length, makeYearLabel);
  for (let i = 0; i < months.length; i++) {
    const m = yearLabelPool[i];
    const d = months[i];
    const z = camZ + d.offset * DAY_SCALE;
    const dt = noonDate(roadCenterMs + d.offset * DAY_MS);
    const label = String(dt.getFullYear());
    m.visible = true;
    m.position.set(-ROAD_HALF * 0.85, 0.05, z);
    const key = `${label}|${accentHex}`;
    if (m.userData.key !== key) {
      drawMonthTexture(m.userData.cv, m.userData.ctx, label, accentHex, 'end');
      m.userData.tex.needsUpdate = true;
      m.userData.key = key;
    }
    m.material.opacity = fogOpacity(z, camZ);
  }
  for (let i = months.length; i < yearLabelPool.length; i++) yearLabelPool[i].visible = false;

  // Heute-Marker am heutigen Datum positionieren
  if (todayMarker) todayMarker.position.z = dateZ(new Date().setHours(0, 0, 0, 0));

  // Positions-Querlinie an der aktuellen Fahrtposition (Akzent)
  if (posLine) posLine.position.z = camZ;

  // Event-Schilder (nur im Sichtfenster, alternierend links/rechts)
  const entries = collectEntries();
  const visible = entries.filter(e => {
    const z = dateZ(new Date(e.iso + 'T12:00:00').getTime());
    const off = z - camZ;
    return off > -2 && off < FOG_FAR - 6;
  });
  ensurePool(signPool, visible.length, makeSign);
  for (let i = 0; i < visible.length; i++) {
    const g = signPool[i];
    const e = visible[i];
    const z = dateZ(new Date(e.iso + 'T12:00:00').getTime());
    g.visible = true;
    // alternierend links/rechts
    const side = (i % 2 === 0) ? 1 : -1;
    g.position.set(side * SIGN_X, 0, z);
    g.userData.id = e.id;
    const color = e.type === 'festival' ? cssColor('--festival', new THREE.Color(0xff4d8d)) : cssColor('--tour', new THREE.Color(0x19c6e6));
    if (!fontsReady || g.userData.label !== e.label || g.userData.type !== e.type) {
      g.userData.label = e.label;
      g.userData.type = e.type;
      const oldMap = g.userData.plane.material.map;
      g.userData.plane.material.map = makeSignTexture(e.label, fmtIso(e.iso), '#' + color.getHexString());
      g.userData.plane.material.needsUpdate = true;
      if (oldMap && oldMap.dispose) oldMap.dispose();
    }
    // Fernwirkung: Schild verblasst zum Horizont
    const op = fogOpacity(z, camZ);
    g.userData.plane.material.opacity = op;
    g.children[1].material.opacity = op;
  }
  for (let i = visible.length; i < signPool.length; i++) signPool[i].visible = false;

  updateDateHeader();

  renderer.render(scene, camera);
}

function updateDateHeader() {
  const el = document.getElementById('road-date');
  if (!el) return;
  const { dmy, year } = formatRoadDate(Math.round(roadCenterMs / DAY_MS) * DAY_MS);
  el.innerHTML = `<span class="road-date-dmy">${esc(dmy)}</span> <span class="road-date-year">${esc(String(year))}</span>`;
}

function fmtIso(iso) {
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

function ensurePool(pool, count, make) {
  while (pool.length < count) pool.push(make());
  return pool;
}

// ── Navigation ──────────────────────────────────────────────────────────
/** Springe zu heute (Startpunkt). Gebunden an den "Heute"-Button. */
export function roadToday() {
  roadCenterMs = new Date().setHours(0, 0, 0, 0);
  roadTargetMs = roadCenterMs;
  dirty = true;
}

/**
 * Springe zum nächsten (1) / vorherigen (-1) sichtbaren Event relativ zur
 * aktuellen Fahrtposition.
 * @param {number} direction 1 = nächstes, -1 = vorheriges
 */
export function roadNavEvent(direction) {
  if (!state.allEvents.length) return;
  const center = roadCenterMs;
  const refs = [];
  state.allEvents.filter(ev => eventVisible(ev)).forEach(ev => {
    if (ev.event_type === 'festival') {
      refs.push(new Date(ev.date + 'T12:00:00').getTime());
    } else {
      (ev.concerts || []).forEach(c => refs.push(new Date(c.date + 'T12:00:00').getTime()));
    }
  });
  refs.sort((a, b) => a - b);
  if (!refs.length) return;
  let target;
  if (direction === 1) {
    target = refs.find(t => t > center) ?? refs[refs.length - 1];
  } else {
    target = [...refs].reverse().find(t => t < center) ?? refs[0];
  }
  // Event soll sichtbar im Fenster liegen → 10 Tage vor dem fernen Rand
  roadTargetMs = new Date(target).setHours(0, 0, 0, 0) - 10 * DAY_MS;
  roadCenterMs = roadTargetMs;
  dirty = true;
}

// ── Resize ──────────────────────────────────────────────────────────────
/** Passt Renderer und Kamera an die aktuelle Canvas-Größe an. */
function resizeRenderer() {
  if (!canvasEl || !renderer || !camera) return;
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  if (!w || !h) return; // Tab noch versteckt — beim Sichtbarwerden via RO nachholen
  if (renderer.domElement.width === w && renderer.domElement.height === h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}

function onResize() {
  resizeRenderer();
}
