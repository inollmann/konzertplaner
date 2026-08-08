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
  { key: '--bg',            label: 'Hintergrund' },
  { key: '--surface',       label: 'Oberfläche 1' },
  { key: '--surface2',      label: 'Oberfläche 2' },
  { key: '--surface3',      label: 'Oberfläche 3' },
  { key: '--text',          label: 'Text' },
  { key: '--muted',         label: 'Gedämpft' },
  { key: '--border',        label: 'Rahmen' },
];

/** Full token sets per preset. `forest`/`rose` live only in /design-tool. */
export const THEMES = {
  dark: {
    '--bg': '#0d0d0d', '--surface': '#161616', '--surface2': '#1f1f1f',
    '--surface3': '#272727', '--border': '#2a2a2a', '--text': '#f0f0f0',
    '--muted': '#777', '--accent': '#e8ff47', '--tour': '#38bdf8',
    '--festival': '#a78bfa', '--tickets-color': '#4ade80', '--watch-color': '#fb923c',
  },
  light: {
    '--bg': '#f5f5f5', '--surface': '#ffffff', '--surface2': '#f0f0f0',
    '--surface3': '#e8e8e8', '--border': '#d0d0d0', '--text': '#111111',
    '--muted': '#666666', '--accent': '#1a7a00', '--tour': '#0066cc',
    '--festival': '#7c3aed', '--tickets-color': '#16a34a', '--watch-color': '#ea580c',
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
  COLOR_VARS.forEach(c => document.documentElement.style.removeProperty(c.key));
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
