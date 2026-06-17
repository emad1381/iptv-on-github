/**
 * app.js — Main application entry point
 * Orchestrates all modules: storage, ui, channels, categories, player, search, settings, shortcuts, diagnostics
 *
 * Architecture:
 *   1. storage.init() loads IndexedDB into memory cache (async, once)
 *   2. All reads from storage are synchronous (cache hit)
 *   3. All writes to storage fire-and-forget to IDB (async)
 *   4. Modules receive shared `state` object via init()
 *   5. Events use delegation on containers, not per-element bindings
 */

import * as storage from './storage.js';
import { $, bindClick, toast, applyTheme, openModal, closeModal, escapeHtml } from './ui.js';
import * as channels from './channels.js';
import * as categories from './categories.js';
import * as player from './player.js';
import * as search from './search.js';
import * as settings from './settings.js';
import * as shortcuts from './shortcuts.js';
import * as diagnostics from './diagnostics.js';

// === Shared Application State ===
// Single object passed to all modules — mutations are visible everywhere
const state = {
  channels: [],
  categories: ['Sports', 'News', 'Animation'],
  activeCategory: 'all',
  playingUrl: null,
  proxyUrl: '',
};

/**
 * Apply CORS proxy to a URL
 * @param {string} url
 * @returns {string}
 */
function getProxiedUrl(url) {
  if (!state.proxyUrl) return url;
  return state.proxyUrl + encodeURIComponent(url);
}

/**
 * Save current state to IndexedDB (fire-and-forget)
 */
function saveState() {
  storage.saveAppState(state.channels, state.categories);
}

/**
 * Render all UI components
 */
function renderAll() {
  categories.renderTabs();
  channels.renderList();
}

/**
 * Update the state pill on the player
 * @param {string} text
 * @param {string} kind
 */
function setPlayerState(text, kind) {
  const el = $('statePill');
  if (!el) return;
  el.textContent = 'State: ' + text;
  el.classList.remove('ok', 'warn', 'bad');
  if (kind) el.classList.add(kind);
}

/**
 * Update quality pill
 * @param {number|string} quality
 */
function setQuality(quality) {
  const el = $('qualityPill');
  if (el) el.textContent = 'Quality: ' + (typeof quality === 'number' ? quality + 'p' : quality);
}

/**
 * Play a channel by index
 * @param {number} index
 */
function playChannel(index) {
  const ch = state.channels[index];
  if (!ch) return;

  state.playingUrl = ch.url;
  const meta = $('playingMeta');
  if (meta) meta.textContent = 'Now playing: ' + ch.name;
  setPlayerState('loading...', 'warn');
  setQuality('auto');

  const video = $('video');
  if (!video) return;

  if (player.isDASH(ch.url)) {
    player.playDASH(video, ch.url, setPlayerState, (q) => setQuality(q));
  } else {
    const playUrl = getProxiedUrl(ch.url);
    player.playHLS(video, playUrl, setPlayerState, (q) => setQuality(q));
  }
}

// === Event Delegation ===

function setupChannelEvents() {
  const list = $('channels');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const playEl = e.target.closest('[data-play]');
    if (playEl) return playChannel(Number(playEl.dataset.play));

    const testEl = e.target.closest('[data-test]');
    if (testEl) return channels.test(Number(testEl.dataset.test));

    const uncatEl = e.target.closest('[data-uncat]');
    if (uncatEl) {
      categories.unassignChannel(Number(uncatEl.dataset.uncat), () => {
        categories.renderTabs();
        channels.renderList();
        saveState();
      });
      return;
    }

    const delEl = e.target.closest('[data-del]');
    if (delEl) return channels.remove(Number(delEl.dataset.del), saveState);

    if (e.target.id === 'catAssignBtn' || e.target.closest('#catAssignBtn')) {
      categories.showAssignPopup(() => {
        categories.renderTabs();
        channels.renderList();
        saveState();
      });
    }
  });
}

function setupCategoryEvents() {
  document.addEventListener('click', (e) => {
    const delCat = e.target.closest('[data-del-cat]');
    if (delCat) {
      e.stopPropagation();
      categories.remove(delCat.dataset.delCat, () => {
        categories.renderTabs();
        channels.renderList();
        saveState();
      });
      return;
    }

    const tab = e.target.closest('[data-cat]');
    if (tab) {
      categories.switchTo(tab.dataset.cat, saveState);
      categories.renderTabs();
      channels.renderList();
      return;
    }

    const pickCat = e.target.closest('[data-pick-cat]');
    if (pickCat) {
      categories.closePicker(pickCat.dataset.pickCat);
      return;
    }

    const assignIdx = e.target.closest('[data-assign-idx]');
    if (assignIdx) {
      categories.assignChannel(Number(assignIdx.dataset.assignIdx), state.activeCategory, () => {
        categories.renderTabs();
        channels.renderList();
        saveState();
      });
      categories.closePicker(null);
      const newInput = $('catPickerNew');
      const addBtn = $('catPickerAddBtn');
      if (newInput) newInput.style.display = '';
      if (addBtn) addBtn.style.display = '';
      return;
    }
  });
}

function setupCategoryPickerEvents() {
  bindClick('catPickerCancel', () => {
    categories.closePicker(null);
    const newInput = $('catPickerNew');
    const addBtn = $('catPickerAddBtn');
    if (newInput) newInput.style.display = '';
    if (addBtn) addBtn.style.display = '';
  });

  bindClick('catPickerAddBtn', () => categories.addFromPicker(saveState));
}

function setupSearchEvents() {
  bindClick('openSearchBtn', () => {
    openModal('searchModalOverlay');
    const q = $('searchQuery');
    if (q) q.focus();
    search.loadDatabase().catch(() => {});
  });

  bindClick('closeSearchBtn', () => closeModal('searchModalOverlay'));

  const overlay = $('searchModalOverlay');
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal('searchModalOverlay');
  });

  bindClick('searchBtn', () => executeSearch());

  const queryInput = $('searchQuery');
  if (queryInput) queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeSearch();
  });

  const results = $('searchResults');
  if (results) results.addEventListener('click', (e) => {
    const addEl = e.target.closest('[data-add-search]');
    if (addEl) {
      const payload = JSON.parse(decodeURIComponent(addEl.dataset.addSearch));
      if (payload && payload.name && payload.url) {
        categories.showPicker((cat) => {
          state.channels.unshift({ name: payload.name, url: payload.url, category: cat || null, test: null });
          categories.renderTabs();
          channels.renderList();
          saveState();
          toast('Added: ' + payload.name, 'ok');
        });
      }
    }
    const testEl = e.target.closest('[data-test-search]');
    if (testEl) search.testStream(testEl, testEl.dataset.testSearch);
  });
}

async function executeSearch() {
  const q = $('searchQuery') ? $('searchQuery').value : '';
  const country = $('searchCountry') ? $('searchCountry').value : '';
  if (!q.trim() && !country) {
    const r = $('searchResults');
    if (r) r.innerHTML = '<p class="muted tiny">Enter a search query or choose country.</p>';
    return;
  }
  try {
    const rows = await search.search(q, country);
    search.renderResults(rows);
  } catch (e) {
    const r = $('searchResults');
    if (r) r.innerHTML = `<p class="tiny" style="color:var(--bad)">Search failed: ${escapeHtml(e.message)}</p>`;
  }
}

function setupSettingsEvents() {
  bindClick('openSettingsBtn', () => settings.open());
  bindClick('closeSettingsBtn', () => settings.close());

  const overlay = $('settingsModalOverlay');
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) settings.close();
  });

  bindClick('exportBtn', () => settings.doExport());

  bindClick('importJsonBtn', () => $('jsonFileInput')?.click());
  const jsonInput = $('jsonFileInput');
  if (jsonInput) jsonInput.addEventListener('change', (e) => {
    if (e.target.files[0]) settings.doImportJson(e.target.files[0]);
    e.target.value = '';
  });

  bindClick('importM3UBtn', () => $('m3uFileInput')?.click());
  bindClick('importM3USettingsBtn', () => $('m3uFileInput')?.click());
  const m3uInput = $('m3uFileInput');
  if (m3uInput) m3uInput.addEventListener('change', (e) => {
    if (e.target.files[0]) settings.doImportM3U(e.target.files[0]);
    e.target.value = '';
  });

  bindClick('clearAllBtn', () => settings.doClearAll());
}

function setupDiagnosticsEvents() {
  bindClick('openDebugBtn', () => openModal('debugModalOverlay'));
  bindClick('closeDebugBtn', () => closeModal('debugModalOverlay'));

  const overlay = $('debugModalOverlay');
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal('debugModalOverlay');
  });

  bindClick('clearDebugBtn', () => diagnostics.clear());
}

function setupShortcutsEvents() {
  bindClick('openShortcutsBtn', () => openModal('shortcutsModalOverlay'));
  bindClick('closeShortcutsBtn', () => closeModal('shortcutsModalOverlay'));

  const overlay = $('shortcutsModalOverlay');
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal('shortcutsModalOverlay');
  });
}

function setupVideoEvents() {
  const video = $('video');
  if (!video) return;
  video.addEventListener('waiting', () => setPlayerState('buffering', 'warn'));
  video.addEventListener('playing', () => setPlayerState('playing', 'ok'));
  video.addEventListener('error', () => setPlayerState('video error', 'bad'));
  video.addEventListener('dblclick', () => player.toggleFullscreen());

  bindClick('fsBtn', () => player.toggleFullscreen());
}

function setupThemeToggle() {
  bindClick('themeBtn', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'night';
    applyTheme(current === 'night' ? 'day' : 'night', storage.saveTheme);
  });
}

function setupDragDrop() {
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    const file = files[0];
    if (file.name.indexOf('.m3u') !== -1 || file.name.indexOf('.txt') !== -1) {
      await settings.doImportM3U(file);
    } else if (file.name.indexOf('.json') !== -1) {
      await settings.doImportJson(file);
    }
  });
}

/**
 * Register the service worker for PWA offline support
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // SW registration failed — app still works without offline support
    });
  }
}

// === Bootstrap ===

async function bootstrap() {
  // Initialize IndexedDB storage (loads cache from IDB, migrates from localStorage if needed)
  await storage.init();

  // Load saved state into shared state object
  const saved = storage.loadAppState();
  state.channels = saved.channels;
  state.categories = saved.categories;
  state.proxyUrl = storage.loadProxyUrl();

  // Init modules with shared state reference
  categories.init(state);
  channels.init(state, getProxiedUrl, playChannel);
  search.init(getProxiedUrl);
  settings.init(state, () => {
    categories.renderTabs();
    channels.renderList();
  });
  diagnostics.init();

  // Apply theme
  applyTheme(storage.loadTheme(), storage.saveTheme);

  // Update proxy pill
  settings.updateProxyPill();

  // Render initial UI
  categories.renderTabs();
  channels.renderList();

  // Setup all event listeners
  setupChannelEvents();
  setupCategoryEvents();
  setupCategoryPickerEvents();
  setupSearchEvents();
  setupSettingsEvents();
  setupDiagnosticsEvents();
  setupShortcutsEvents();
  setupVideoEvents();
  setupThemeToggle();
  setupDragDrop();
  settings.bindProxyEvents();

  // Add channel button
  bindClick('addBtn', () => channels.add(saveState));

  // Register keyboard shortcuts
  shortcuts.register({
    onSearch: () => {
      openModal('searchModalOverlay');
      const q = $('searchQuery');
      if (q) q.focus();
      search.loadDatabase().catch(() => {});
    },
    onAddChannel: () => channels.add(saveState),
    onToggleTheme: () => {
      const current = document.documentElement.getAttribute('data-theme') || 'night';
      applyTheme(current === 'night' ? 'day' : 'night', storage.saveTheme);
    },
    onOpenSettings: () => settings.open(),
  });

  // Register service worker
  registerServiceWorker();
}

// Run bootstrap (handles both deferred and inline script loading)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
