/**
 * settings.js — Settings modal management (proxy, export/import, clear data)
 */

import { $, toast, openModal, closeModal } from './ui.js';
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
 * Open settings modal and populate current proxy URL
 */
export function open() {
  const input = $('proxyUrl');
  if (input) input.value = state.proxyUrl;
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
 * Export channels as JSON file
 */
export function doExport() {
  importExport.exportJSON(state.channels, state.categories);
}

/**
 * Handle JSON file import
 * @param {File} file
 */
export async function doImportJson(file) {
  const text = await importExport.readFileAsText(file);
  const result = importExport.importJSON(text, state.channels);
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
  if (!confirm('Delete all channels and categories? This cannot be undone.')) return;
  state.channels = [];
  state.categories = ['Sports', 'News', 'Animation'];
  state.activeCategory = 'all';
  await storage.clearAll();
  if (renderFn) renderFn();
  toast('All data cleared', 'ok');
}
