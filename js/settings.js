/**
 * settings.js — Settings modal management (proxy, custom proxies, export/import, clear data)
 */

import { $, toast, openModal, closeModal, escapeHtml } from './ui.js';
import * as storage from './storage.js';
import * as channels from './channels.js';
import * as categories from './categories.js';
import * as importExport from './import-export.js';

let state = null;
let renderFn = null;

/**
 * Initialize settings module
 * @param {object} appState
 * @param {Function} renderAll — re-render everything after changes
 */
export function init(appState, renderAll) {
  state = appState;
  renderFn = renderAll;
}

/**
 * Open settings modal and populate current proxy URL + presets
 */
export function open() {
  const input = $('proxyUrl');
  if (input) input.value = state.proxyUrl;
  renderProxyPresets();
  openModal('settingsModalOverlay');
}

/**
 * Close settings modal and persist proxy URL
 */
export function close() {
  const input = $('proxyUrl');
  if (input) state.proxyUrl = input.value.trim();
  storage.saveProxyUrl(state.proxyUrl);
  updateProxyPill();
  if (renderFn) renderFn();
  closeModal('settingsModalOverlay');
  toast('Settings saved', 'ok');
}

/**
 * Update the proxy status pill on the player
 */
export function updateProxyPill() {
  const pill = $('proxyPill');
  if (!pill) return;
  if (state.proxyUrl) {
    let host = '';
    try { host = new URL(state.proxyUrl).hostname; } catch { host = state.proxyUrl; }
    pill.textContent = 'Proxy: ' + host;
    pill.classList.add('ok');
  } else {
    pill.textContent = 'Proxy: off';
    pill.classList.remove('ok');
  }
}

/**
 * Set proxy URL from a preset button
 * @param {string} url
 */
export function setProxyPreset(url) {
  const input = $('proxyUrl');
  if (input) input.value = url;
}

/**
 * Render proxy preset buttons (built-in + custom)
 */
export function renderProxyPresets() {
  const container = $('proxyPresets');
  if (!container) return;

  const builtIn = [
    { name: 'Direct (No Proxy)', url: '' },
    { name: 'CF Worker', url: 'https://iptv-proxy-github.nikiali823.workers.dev/?url=' },
    { name: 'corsproxy.io', url: 'https://corsproxy.io/?' },
    { name: 'allorigins', url: 'https://api.allorigins.win/raw?url=' },
  ];

  const custom = storage.loadCustomProxies();

  let html = '';
  for (const p of builtIn) {
    html += `<button class="btn sm" data-set-proxy="${escapeHtml(p.url)}">${escapeHtml(p.name)}</button>`;
  }
  for (const p of custom) {
    html += `<button class="btn sm" data-set-proxy="${escapeHtml(p.url)}" data-custom-proxy="${escapeHtml(p.url)}" title="${escapeHtml(p.url)}">${escapeHtml(p.name)} <span data-remove-proxy="${escapeHtml(p.url)}" style="color:var(--bad);cursor:pointer;margin-left:.3rem;" title="Remove">&times;</span></button>`;
  }
  html += `<button class="btn sm" id="addCustomProxyBtn" title="Add custom proxy" style="border-style:dashed;">+</button>`;

  container.innerHTML = html;

  // Bind + button
  const addBtn = $('addCustomProxyBtn');
  if (addBtn) addBtn.addEventListener('click', addCustomProxy);
}

/**
 * Prompt user to add a custom proxy
 */
async function addCustomProxy() {
  const name = prompt('Proxy name (e.g. "My Proxy"):');
  if (!name || !name.trim()) return;
  const url = prompt('Proxy URL (must end with ? or = for URL appending):');
  if (!url || !url.trim()) return;

  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith('https://') && !trimmedUrl.startsWith('http://')) {
    toast('Proxy URL must start with http:// or https://', 'warn');
    return;
  }

  const custom = storage.loadCustomProxies();
  // Dedup by URL
  if (custom.some(p => p.url === trimmedUrl)) {
    toast('This proxy already exists', 'warn');
    return;
  }

  custom.push({ name: name.trim(), url: trimmedUrl });
  await storage.saveCustomProxies(custom);
  renderProxyPresets();
  toast('Custom proxy added: ' + name.trim(), 'ok');
}

/**
 * Remove a custom proxy by URL
 * @param {string} url
 */
async function removeCustomProxy(url) {
  const custom = storage.loadCustomProxies();
  const filtered = custom.filter(p => p.url !== url);
  await storage.saveCustomProxies(filtered);
  renderProxyPresets();
  toast('Proxy removed', 'ok');
}

/**
 * Export channels + settings as JSON file
 */
export function doExport() {
  const settings = storage.exportSettings();
  importExport.exportJSON(state.channels, state.categories, settings);
}

/**
 * Handle JSON file import (channels + categories + settings)
 * @param {File} file
 */
export async function doImportJson(file) {
  const text = await importExport.readFileAsText(file);
  const result = importExport.importJSON(text, state.channels);

  // Import proxy settings if present
  if (result.settings) {
    await storage.importSettings(result.settings);
    state.proxyUrl = storage.loadProxyUrl();
    updateProxyPill();
  }

  if (result.added > 0) {
    state.channels.push(...result.channels);
    categories.merge(result.categories, () => storage.saveAppState(state.channels, state.categories));
    categories.renderTabs();
    channels.renderList();
    storage.saveAppState(state.channels, state.categories);
    toast(`Imported ${result.added} channels`, 'ok');
  } else if (result.added === 0 && result.channels.length === 0) {
    // toast already shown by importJSON
  } else {
    toast('No new channels to import', 'info');
  }
}

/**
 * Handle M3U file import
 * @param {File} file
 */
export async function doImportM3U(file) {
  const text = await importExport.readFileAsText(file);
  const result = importExport.importM3U(text, state.channels);
  if (result.added > 0) {
    state.channels.push(...result.channels);
    categories.merge(result.categories, () => storage.saveAppState(state.channels, state.categories));
    categories.renderTabs();
    channels.renderList();
    storage.saveAppState(state.channels, state.categories);
    toast(`Imported ${result.added} channels from M3U`, 'ok');
  } else {
    toast('No new channels found in file', 'warn');
  }
}

/**
 * Clear all app data
 */
export async function doClearAll() {
  if (!confirm('Delete all channels, categories, and proxy settings? This cannot be undone.')) return;
  state.channels = [];
  state.categories = ['Sports', 'News', 'Animation'];
  state.activeCategory = 'all';
  state.proxyUrl = '';
  await storage.clearAll();
  updateProxyPill();
  if (renderFn) renderFn();
  toast('All data cleared', 'ok');
}

/**
 * Bind proxy-related click events (preset buttons, remove, add)
 * Call this from app.js after setupSettingsEvents
 */
export function bindProxyEvents() {
  document.addEventListener('click', (e) => {
    // Remove custom proxy
    const removeBtn = e.target.closest('[data-remove-proxy]');
    if (removeBtn) {
      e.stopPropagation();
      removeCustomProxy(removeBtn.dataset.removeProxy);
      return;
    }
    // Preset buttons (including custom)
    const presetBtn = e.target.closest('[data-set-proxy]');
    if (presetBtn && presetBtn.id !== 'addCustomProxyBtn') {
      setProxyPreset(presetBtn.dataset.setProxy);
    }
  });
}
