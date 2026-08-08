// ══════════════════════════════════════════════════════════════════════
// theme.js — runtime theming, color presets, design panel
//
// On boot: loadColors() applies per-token overrides from localStorage,
// loadTheme() toggles `.light`, applyCustomCss() injects any CSS string
// saved by the standalone /design-tool page.
// ══════════════════════════════════════════════════════════════════════

import { closeDrawer, openModal } from './ui.js';
import { icon } from './icons.js';

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

/** Full token sets per preset. `forest`/`rose` live only in /design-tool. */
export const THEMES = {
  dark: {
    '--bg': '#0d0d0d', '--surface': '#161616', '--surface2': '#1f1f1f',
    '--surface3': '#272727', '--border': '#2e2e2e44', '--text': '#f0f0f0',
    '--muted': '#777', '--accent': '#e8ff47', '--tour': '#19c6e6',
    '--festival': '#ff4d8d', '--tickets-color': '#1fc8a4', '--watch-color': '#ff9e2c',
    '--danger': '#f87171', '--link': '#99aecc', '--link-soldout': '#64748b',
    '--placeholder': '#444',
  },
  light: {
    '--bg': '#ececec', '--surface': '#ffffff', '--surface2': '#f3f3f3',
    '--surface3': '#e5e5e5', '--border': '#dddddddd', '--text': '#1a1a1a',
    '--muted': '#666', '--accent': '#006b66', '--tour': '#0e7c9c',
    '--festival': '#c8286a', '--tickets-color': '#0a7a5e', '--watch-color': '#b8650a',
    '--danger': '#dc2626', '--link': '#5b7a9e', '--link-soldout': '#475569',
    '--placeholder': '#999',
  },
  midnight: {
    '--bg': '#04040f', '--surface': '#0d0d2b', '--surface2': '#131340',
    '--surface3': '#1a1a55', '--border': '#252570', '--text': '#e8e8ff',
    '--muted': '#6666aa', '--accent': '#00ffcc', '--tour': '#ff6b9d',
    '--festival': '#ffd700', '--tickets-color': '#00e5ff', '--watch-color': '#ff9f43',
  },
};

/** Apply a named preset and persist the resulting per-token map. */
export function applyTheme(themeKey) {
  const theme = THEMES[themeKey];
  if (!theme) return;
  const saved = JSON.parse(localStorage.getItem('kp-colors') || '{}');
  Object.entries(theme).forEach(([k, v]) => {
    document.documentElement.style.setProperty(k, v);
    saved[k] = v;
  });
  localStorage.setItem('kp-colors', JSON.stringify(saved));
  localStorage.setItem('kp-theme', themeKey);
  // Toggle .light class so CSS :root.light cascades apply correctly
  document.documentElement.classList.toggle('light', themeKey === 'light');
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.innerHTML = themeKey === 'light' ? icon('moon') : icon('sun');
  buildColorGrid();
}

/** Apply saved per-token overrides (run on boot). */
export function loadColors() {
  const saved = JSON.parse(localStorage.getItem('kp-colors') || '{}');
  Object.entries(saved).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
}

/** Set one token and persist it. */
export function saveColors(key, val) {
  document.documentElement.style.setProperty(key, val);
  const saved = JSON.parse(localStorage.getItem('kp-colors') || '{}');
  saved[key] = val;
  localStorage.setItem('kp-colors', JSON.stringify(saved));
}

/** Clear all overrides, restoring style.css defaults. */
export function resetColors() {
  localStorage.removeItem('kp-colors');
  localStorage.removeItem('kp-theme');
  COLOR_VARS.forEach(c => document.documentElement.style.removeProperty(c.key));
  document.documentElement.classList.remove('light');
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.innerHTML = icon('sun');
  buildColorGrid();
}

/** Build the in-app Design modal's color grid + preset row. */
export function buildColorGrid() {
  const grid = document.getElementById('color-grid');
  if (!grid) return;
  const presets = `<div style="grid-column:1/-1;display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <span style="font-size:12px;color:var(--muted);align-self:center">Preset:</span>
    <button class="btn-sm" onclick="applyTheme('dark')">${icon('moon-star')} Dark (Standard)</button>
    <button class="btn-sm" onclick="applyTheme('light')">${icon('sun')} Light</button>
    <button class="btn-sm" onclick="applyTheme('midnight')">${icon('sparkles')} Midnight</button>
  </div>`;
  grid.innerHTML = presets + COLOR_VARS.map(c => {
    const val = getComputedStyle(document.documentElement).getPropertyValue(c.key).trim();
    return `<div class="color-row">
      <label>${c.label}</label>
      <input type="color" value="${val}" oninput="saveColors('${c.key}',this.value)">
    </div>`;
  }).join('');
}

/**
 * Toggle between dark and light by adding/removing `.light` on the root.
 * BUG FIX: original code referenced a non-existent `#theme-toggle` node.
 * Here we guard for its absence and fall back to no-op instead of throwing.
 */
export function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('kp-theme', isLight ? 'light' : 'dark');
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.innerHTML = isLight ? icon('moon') : icon('sun');
}

/** Apply persisted `.light` class on boot. */
export function loadTheme() {
  const theme = localStorage.getItem('kp-theme');
  if (theme === 'light') {
    document.documentElement.classList.add('light');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.innerHTML = icon('moon');
  }
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

export function openDesignPanel() {
  closeDrawer();
  buildColorGrid();
  openModal('design-modal');
}
