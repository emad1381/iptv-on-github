/**
 * storage.js — IndexedDB abstraction layer
 * ALL storage operations MUST go through this module.
 * Uses a write-through cache for synchronous reads.
 * No other file should call IndexedDB or localStorage directly.
 *
 * Stores:
 *   - channels: Array of channel objects
 *   - categories: Array of category strings
 *   - settings: { theme, proxyUrl }
 *   - backups: Array of exported snapshots (future use)
 */

const DB_NAME = 'neonstream';
const DB_VERSION = 1;

const STORES = {
  channels: 'channels',
  categories: 'categories',
  settings: 'settings',
  backups: 'backups',
};

// Write-through cache for synchronous reads
let cache = {
  channels: [],
  categories: ['Sports', 'News', 'Animation'],
  theme: 'night',
  proxyUrl: '',
  customProxies: [],
};

let db = null;
let initPromise = null;

/**
 * Open (or create) the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORES.channels)) {
        database.createObjectStore(STORES.channels, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORES.categories)) {
        database.createObjectStore(STORES.categories, { keyPath: 'name' });
      }
      if (!database.objectStoreNames.contains(STORES.settings)) {
        database.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(STORES.backups)) {
        database.createObjectStore(STORES.backups, { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Generic IDB get-all from a store
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Generic IDB put into a store
 * @param {string} storeName
 * @param {any} value
 * @returns {Promise<void>}
 */
function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Generic IDB clear a store
 * @param {string} storeName
 * @returns {Promise<void>}
 */
function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Migrate data from localStorage (one-time, if IDB is empty)
 * @returns {Promise<void>}
 */
async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem('neonstream_data');
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.channels) && data.channels.length > 0) {
        // Assign IDs to channels if missing
        for (let i = 0; i < data.channels.length; i++) {
          if (!data.channels[i].id) {
            data.channels[i].id = 'ch_' + Date.now() + '_' + i;
          }
          await put(STORES.channels, data.channels[i]);
        }
        cache.channels = data.channels;
      }
      if (Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          await put(STORES.categories, { name: cat });
        }
        cache.categories = data.categories;
      }
    }

    const theme = localStorage.getItem('ui_theme');
    if (theme) {
      await put(STORES.settings, { key: 'theme', value: theme });
      cache.theme = theme === 'day' ? 'day' : 'night';
    }

    const proxy = localStorage.getItem('neonstream_proxy');
    if (proxy) {
      await put(STORES.settings, { key: 'proxyUrl', value: proxy });
      cache.proxyUrl = proxy;
    }

    // Clear localStorage after successful migration
    localStorage.removeItem('neonstream_data');
    localStorage.removeItem('ui_theme');
    localStorage.removeItem('neonstream_proxy');
  } catch {
    // Migration failed silently — cache defaults remain
  }
}

/**
 * Load all data from IDB into cache
 * @returns {Promise<void>}
 */
async function loadAll() {
  const [channels, categories, settings] = await Promise.all([
    getAll(STORES.channels),
    getAll(STORES.categories),
    getAll(STORES.settings),
  ]);

  cache.channels = channels || [];
  cache.categories = categories.length > 0
    ? categories.map(c => c.name)
    : ['Sports', 'News', 'Animation'];

  for (const s of settings || []) {
    if (s.key === 'theme') cache.theme = s.value === 'day' ? 'day' : 'night';
    if (s.key === 'proxyUrl') cache.proxyUrl = s.value || '';
    if (s.key === 'customProxies' && Array.isArray(s.value)) cache.customProxies = s.value;
  }
}

/**
 * Persist channels to IDB (full replace)
 * @returns {Promise<void>}
 */
async function persistChannels() {
  await clearStore(STORES.channels);
  for (const ch of cache.channels) {
    const record = ch.id ? ch : { ...ch, id: 'ch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) };
    await put(STORES.channels, record);
  }
}

/**
 * Persist categories to IDB (full replace)
 * @returns {Promise<void>}
 */
async function persistCategories() {
  await clearStore(STORES.categories);
  for (const cat of cache.categories) {
    await put(STORES.categories, { name: cat });
  }
}

// === Public API (synchronous reads, async writes) ===

/**
 * Initialize the storage layer. Must be called once before any reads.
 * @returns {Promise<void>}
 */
export async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      db = await openDB();
      await loadAll();
      // If IDB was empty, try migrating from localStorage
      if (cache.channels.length === 0 && cache.categories.length <= 3) {
        await migrateFromLocalStorage();
      }
    } catch {
      // IDB unavailable — fall back to empty defaults
    }
  })();
  return initPromise;
}

/**
 * Load app state (channels + categories) — reads from cache
 * @returns {{ channels: Array, categories: string[] }}
 */
export function loadAppState() {
  return {
    channels: cache.channels,
    categories: cache.categories,
  };
}

/**
 * Save app state (channels + categories) — writes to IDB
 * @param {Array} channels
 * @param {string[]} categories
 * @returns {Promise<void>}
 */
export async function saveAppState(channels, categories) {
  cache.channels = channels;
  cache.categories = categories;
  try {
    await Promise.all([persistChannels(), persistCategories()]);
  } catch {
    // write failed silently
  }
}

/**
 * Get saved theme preference — reads from cache
 * @returns {'day'|'night'}
 */
export function loadTheme() {
  return cache.theme;
}

/**
 * Save theme preference — writes to IDB
 * @param {'day'|'night'} theme
 * @returns {Promise<void>}
 */
export async function saveTheme(theme) {
  cache.theme = theme;
  try {
    await put(STORES.settings, { key: 'theme', value: theme });
  } catch {
    // write failed silently
  }
}

/**
 * Get saved CORS proxy URL — reads from cache
 * @returns {string}
 */
export function loadProxyUrl() {
  return cache.proxyUrl;
}

/**
 * Save CORS proxy URL — writes to IDB
 * @param {string} url
 * @returns {Promise<void>}
 */
export async function saveProxyUrl(url) {
  cache.proxyUrl = url;
  try {
    await put(STORES.settings, { key: 'proxyUrl', value: url });
  } catch {
    // write failed silently
  }
}

/**
 * Load custom proxy presets — reads from cache
 * @returns {{ name: string, url: string }[]}
 */
export function loadCustomProxies() {
  return cache.customProxies;
}

/**
 * Save custom proxy presets — writes to IDB
 * @param {{ name: string, url: string }[]} proxies
 * @returns {Promise<void>}
 */
export async function saveCustomProxies(proxies) {
  cache.customProxies = proxies;
  try {
    await put(STORES.settings, { key: 'customProxies', value: proxies });
  } catch {
    // write failed silently
  }
}

/**
 * Export all settings as a plain object (for JSON export)
 * @returns {{ proxyUrl: string, customProxies: Array, theme: string }}
 */
export function exportSettings() {
  return {
    proxyUrl: cache.proxyUrl,
    customProxies: cache.customProxies,
    theme: cache.theme,
  };
}

/**
 * Import settings from a plain object (from JSON import)
 * @param {{ proxyUrl?: string, customProxies?: Array, theme?: string }} data
 * @returns {Promise<void>}
 */
export async function importSettings(data) {
  if (!data) return;
  if (typeof data.proxyUrl === 'string') {
    cache.proxyUrl = data.proxyUrl;
    await put(STORES.settings, { key: 'proxyUrl', value: data.proxyUrl });
  }
  if (Array.isArray(data.customProxies)) {
    cache.customProxies = data.customProxies;
    await put(STORES.settings, { key: 'customProxies', value: data.customProxies });
  }
  if (data.theme === 'day' || data.theme === 'night') {
    cache.theme = data.theme;
    await put(STORES.settings, { key: 'theme', value: data.theme });
  }
}

/**
 * Clear ALL app data from IDB
 * @returns {Promise<void>}
 */
export async function clearAll() {
  cache.channels = [];
  cache.categories = ['Sports', 'News', 'Animation'];
  cache.theme = 'night';
  cache.proxyUrl = '';
  cache.customProxies = [];
  try {
    await Promise.all([
      clearStore(STORES.channels),
      clearStore(STORES.categories),
      clearStore(STORES.settings),
      clearStore(STORES.backups),
    ]);
  } catch {
    // clear failed silently
  }
}
