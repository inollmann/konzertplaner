// ══════════════════════════════════════════════════════════════════════
// theme.js — runtime theming, color presets, design panel
//
// Two-layer model:
//   • Preset base  — THEMES (built-in) + kp-custom-presets (user snapshots)
//   • Per-preset overrides — kp-colors = { themeKey: { token: hex } }
// applyTheme(key) clears all inline color tokens, applies the preset base,
// then layers the per-preset manual overrides on top. Switching presets
// preserves the tweaks made in each. "Standardfarben wiederherstellen"
// clears only the active preset's overrides; "Zurücksetzen" clears all.
// loadTheme() runs on boot to restore the full state from localStorage.
// ══════════════════════════════════════════════════════════════════════

import { closeDrawer, openModal, showConfirm } from './ui.js';
import { icon } from './icons.js';
import { esc } from './utils.js';

/** Token registry shown in the in-app Design modal. */
export const COLOR_VARS = [
  { key: '--accent',        label: 'Akzentfarbe' },
  { key: '--tour',          label: 'Tour-Farbe' },
  { key: '--festival',      label: 'Festival-Farbe' },
  { key: '--tickets-color', label: 'Tickets-Tag' },
  { key: '--watch-color',   label: 'Merkliste-Tag' },
  { key: '--danger',        label: 'Gefahr/Löschen' },
  { key: '--link',          label: 'Link' },
  { key: '--link-soldout',  label: 'Link (ausverkauft)' },
  { key: '--bg',            label: 'Hintergrund' },
  { key: '--surface',       label: 'Oberfläche 1' },
  { key: '--surface2',      label: 'Oberfläche 2' },
  { key: '--surface3',      label: 'Oberfläche 3' },
  { key: '--text',          label: 'Text' },
  { key: '--muted',         label: 'Gedämpft' },
  { key: '--border',        label: 'Rahmen' },
  { key: '--placeholder',   label: 'Platzhalter' },
];

/** Built-in preset base token sets. Custom presets live in localStorage. */
export const THEMES = {
  dark: {
    name: 'Dark', isLight: false,
    vars: {
      '--bg': '#0d0d0d', '--surface': '#161616', '--surface2': '#1f1f1f',
      '--surface3': '#272727', '--border': '#2e2e2e44', '--text': '#f0f0f0',
      '--muted': '#777', '--accent': '#e8ff47', '--tour': '#19c6e6',
      '--festival': '#ff4d8d', '--tickets-color': '#1fc8a4', '--watch-color': '#ff9e2c',
      '--danger': '#f87171', '--link': '#99aecc', '--link-soldout': '#64748b',
      '--placeholder': '#444',
    },
  },
  light: {
    name: 'Light', isLight: true,
    vars: {
      '--bg': '#ececec', '--surface': '#ffffff', '--surface2': '#f3f3f3',
      '--surface3': '#e5e5e5', '--border': '#dddddddd', '--text': '#1a1a1a',
      '--muted': '#666', '--accent': '#006b66', '--tour': '#0e7c9c',
      '--festival': '#c8286a', '--tickets-color': '#0a7a5e', '--watch-color': '#b8650a',
      '--danger': '#dc2626', '--link': '#5b7a9e', '--link-soldout': '#475569',
      '--placeholder': '#999',
    },
  },
  midnight: {
    name: 'Midnight', isLight: false,
    vars: {
      '--bg': '#04040f', '--surface': '#0d0d2b', '--surface2': '#131340',
      '--surface3': '#1a1a55', '--border': '#252570', '--text': '#e8e8ff',
      '--muted': '#6666aa', '--accent': '#00ffcc', '--tour': '#ff6b9d',
      '--festival': '#ffd700', '--tickets-color': '#00e5ff', '--watch-color': '#ff9f43',
      '--danger': '#ff6b6b', '--link': '#8ab4f8', '--link-soldout': '#555577',
      '--placeholder': '#4a4a7a',
    },
  },
};

const LS_COLORS = 'kp-colors';
const LS_THEME = 'kp-theme';
const LS_CUSTOM = 'kp-custom-presets';

function getCustomPresets() {
  return JSON.parse(localStorage.getItem(LS_CUSTOM) || '{}');
}
function saveCustomPresets(obj) {
  localStorage.setItem(LS_CUSTOM, JSON.stringify(obj));
}

function getOverrides(themeKey) {
  const all = JSON.parse(localStorage.getItem(LS_COLORS) || '{}');
  return all[themeKey] || {};
}
function setOverrides(themeKey, overrides) {
  const all = JSON.parse(localStorage.getItem(LS_COLORS) || '{}');
  if (Object.keys(overrides).length) all[themeKey] = overrides;
  else delete all[themeKey];
  localStorage.setItem(LS_COLORS, JSON.stringify(all));
}

/** Resolve a preset descriptor by key (built-in or custom). */
export function getPreset(key) {
  if (THEMES[key]) return THEMES[key];
  const custom = getCustomPresets()[key];
  if (custom) return { name: custom.name, isLight: false, vars: custom.vars };
  return null;
}

/** Active preset key (defaults to 'dark'). */
export function getActiveTheme() {
  return localStorage.getItem(LS_THEME) || 'dark';
}

/**
 * Apply a named preset: clear all inline color tokens, apply the preset
 * base, then layer any per-preset manual overrides. Persists the active
 * key and toggles `.light` for the light preset. Overrides are preserved.
 */
export function applyTheme(themeKey) {
  const preset = getPreset(themeKey);
  if (!preset) return;
  COLOR_VARS.forEach(c => document.documentElement.style.removeProperty(c.key));
  Object.entries(preset.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  Object.entries(getOverrides(themeKey)).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  localStorage.setItem(LS_THEME, themeKey);
  document.documentElement.classList.toggle('light', preset.isLight === true);
  buildColorGrid();
}

/** Set one token and persist it as an override for the active preset. */
export function saveColors(key, val) {
  document.documentElement.style.setProperty(key, val);
  const themeKey = getActiveTheme();
  const overrides = getOverrides(themeKey);
  overrides[key] = val;
  setOverrides(themeKey, overrides);
}

/** Clear the active preset's manual overrides (restore preset defaults). */
export function resetPresetColors() {
  const themeKey = getActiveTheme();
  setOverrides(themeKey, {});
  applyTheme(themeKey);
}

/** Snapshot the current 16 tokens into a new custom preset and apply it. */
export function createPreset() {
  const name = prompt('Name für neues Preset:');
  if (!name || !name.trim()) return;
  const key = 'custom-' + Date.now();
  const vars = {};
  COLOR_VARS.forEach(c => {
    const val = getComputedStyle(document.documentElement).getPropertyValue(c.key).trim();
    if (val) vars[c.key] = val;
  });
  const custom = getCustomPresets();
  custom[key] = { name: name.trim(), vars };
  saveCustomPresets(custom);
  applyTheme(key);
}

/** Delete a custom preset; if it was active, fall back to 'dark'. */
export function deletePreset(key) {
  if (!key.startsWith('custom-')) return;
  const custom = getCustomPresets();
  if (!custom[key]) return;
  showConfirm('Preset "' + custom[key].name + '" löschen?', () => {
    delete custom[key];
    saveCustomPresets(custom);
    if (getActiveTheme() === key) applyTheme('dark');
    else buildColorGrid();
  });
}

/** Clear all overrides + active key, restoring style.css :root defaults. */
export function resetColors() {
  localStorage.removeItem(LS_COLORS);
  localStorage.removeItem(LS_THEME);
  COLOR_VARS.forEach(c => document.documentElement.style.removeProperty(c.key));
  document.documentElement.classList.remove('light');
  buildColorGrid();
}

/** Apply persisted theme on boot (replaces the old loadColors+loadTheme pair). */
export function loadTheme() {
  applyTheme(getActiveTheme());
}

/** Inject any custom CSS saved by /design-tool as an inline <style>. */
export function applyCustomCss() {
  const css = localStorage.getItem('kp-custom-css');
  if (!css || !css.trim()) return;
  const style = document.createElement('style');
  style.id = 'kp-custom-css';
  style.textContent = css;
  document.head.appendChild(style);
}

function toHexColor(val) {
  if (!val) return '#000000';
  const el = document.createElement('div');
  el.style.color = val;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  document.body.removeChild(el);
  const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

/** Build the in-app Design modal's preset row + action buttons + color grid. */
export function buildColorGrid() {
  const grid = document.getElementById('color-grid');
  if (!grid) return;
  const activeKey = getActiveTheme();
  const presetButtons = [...Object.keys(THEMES), ...Object.keys(getCustomPresets())].map(k => {
    const p = getPreset(k);
    const active = k === activeKey ? ' preset-active' : '';
    const del = k.startsWith('custom-')
      ? ` <span class="preset-del" title="Preset löschen" onclick="event.stopPropagation();deletePreset('${k}');void 0">${icon('x')}</span>`
      : '';
    return `<button class="btn-sm preset-btn${active}" onclick="applyTheme('${k}');void 0">${esc(p.name)}${del}</button>`;
  }).join('');
  const presets = `<div style="grid-column:1/-1;display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <span style="font-size:12px;color:var(--muted)">Preset:</span>
    ${presetButtons}
  </div>`;
  const actions = `<div style="grid-column:1/-1;display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <button class="btn-sm" onclick="createPreset();void 0">${icon('plus')} Neues Preset</button>
    <button class="btn-sm" onclick="resetPresetColors();void 0">${icon('rotate-ccw')} Standardfarben wiederherstellen</button>
  </div>`;
  grid.innerHTML = presets + actions + COLOR_VARS.map(c => {
    const val = getComputedStyle(document.documentElement).getPropertyValue(c.key).trim();
    return `<div class="color-row">
      <label>${c.label}</label>
      <input type="color" value="${toHexColor(val)}" oninput="saveColors('${c.key}',this.value)">
    </div>`;
  }).join('');
}

export function openDesignPanel() {
  closeDrawer();
  buildColorGrid();
  openModal('design-modal');
}
