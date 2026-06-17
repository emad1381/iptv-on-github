/**
 * search.js — IPTV-org global channel search
 */

import { $, escapeHtml, toast } from './ui.js';

let streamsCache = null;
let proxyFn = null;

/**
 * Initialize search module
 * @param {Function} getProxiedUrl
 */
export function init(getProxiedUrl) {
  proxyFn = getProxiedUrl;
}

/**
 * Load and cache the IPTV-org database (countries, channels, streams)
 * @returns {Promise<void>}
 */
export async function loadDatabase() {
  if (streamsCache) return;

  const loader = $('searchLoader');
  if (loader) { loader.style.display = 'block'; loader.textContent = 'Loading global database...'; }

  try {
    const base = 'https://iptv-org.github.io/api/';
    const urls = [base + 'countries.json', base + 'channels.json', base + 'streams.json'];
    const fetchUrls = proxyFn ? urls.map(u => proxyFn(u)) : urls;

    const [countriesRes, channelsRes, streamsRes] = await Promise.all(fetchUrls.map(u => fetch(u)));
    const countries = await countriesRes.json();
    const channels = await channelsRes.json();
    const streams = await streamsRes.json();

    // Build stream map: channelId -> stream[]
    const streamMap = new Map();
    for (const s of streams || []) {
      if (!s.channel || !s.url || (s.status && s.status !== 'online')) continue;
      if (!streamMap.has(s.channel)) streamMap.set(s.channel, []);
      streamMap.get(s.channel).push(s);
    }

    // Merge channel + stream data
    streamsCache = {
      countries: Array.isArray(countries) ? countries : [],
      channels: (channels || [])
        .filter(c => streamMap.has(c.id))
        .map(c => ({
          id: c.id,
          name: c.name,
          country: c.country,
          logo: c.logo,
          streams: streamMap.get(c.id),
        })),
    };

    // Populate country dropdown
    const select = $('searchCountry');
    if (select) {
      const sorted = streamsCache.countries.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      select.innerHTML = '<option value="">All countries</option>'
        + sorted.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
    }

    if (loader) loader.style.display = 'none';
  } catch (e) {
    if (loader) loader.textContent = 'Failed to load database. Try enabling a proxy in Settings.';
    toast('Failed to load IPTV database', 'bad');
    throw e;
  }
}

/**
 * Execute a search query
 * @param {string} query — text to match against channel names
 * @param {string} country — country code filter (empty for all)
 * @returns {Array<{ id, name, country, logo, streams }>}
 */
export async function search(query, country) {
  await loadDatabase();
  if (!streamsCache) return [];

  const q = (query || '').trim().toLowerCase();
  return streamsCache.channels
    .filter(c =>
      (!q || c.name.toLowerCase().indexOf(q) !== -1) &&
      (!country || c.country === country)
    )
    .slice(0, 50);
}

/**
 * Render search results into #searchResults
 * @param {Array} rows
 */
export function renderResults(rows) {
  const container = $('searchResults');
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<p class="muted tiny">No matching channel found.</p>';
    return;
  }

  container.innerHTML = rows.map(r => {
    const stream = r.streams[0];
    const payload = encodeURIComponent(JSON.stringify({ name: r.name, url: stream.url }));
    const logo = r.logo
      ? `<img src="${escapeHtml(r.logo)}" class="result-logo" onerror="this.style.display='none'" />`
      : '';

    return `<div class="result">`
      + `<div class="result-info">${logo}<div><div class="name">${escapeHtml(r.name)}</div>`
      + `<div class="muted tiny">${r.country || 'GLOBAL'}</div></div></div>`
      + `<button class="btn sm" data-test-search="${encodeURIComponent(stream.url)}">Test</button>`
      + `<button class="btn sm" data-add-search="${payload}">Add</button>`
      + `</div>`;
  }).join('');
}

/**
 * Test a stream URL from search results
 * @param {HTMLElement} btn
 * @param {string} encodedUrl
 */
export async function testStream(btn, encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const testUrl = proxyFn ? proxyFn(url) : url;
    const t1 = performance.now();
    const res = await fetch(testUrl, { method: 'GET' });
    const ms = Math.round(performance.now() - t1);

    if (res.ok) {
      const text = await res.text();
      const segs = (text.match(/#EXTINF:/g) || []).length;
      const badge = segs >= 3 ? { text: 'Excellent', cls: 'ok' } : segs >= 1 ? { text: 'Good', cls: 'ok' } : { text: ms + 'ms', cls: 'warn' };
      btn.textContent = badge.text;
      btn.style.color = `var(--${badge.cls})`;
    } else {
      btn.textContent = ms + 'ms';
      btn.style.color = 'var(--warn)';
    }
  } catch {
    // fallback no-cors
    try {
      const t2 = performance.now();
      await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      const ms = Math.round(performance.now() - t2);
      btn.textContent = ms + 'ms';
      btn.style.color = 'var(--ok)';
    } catch {
      btn.textContent = 'Failed';
      btn.style.color = 'var(--bad)';
    }
  }

  btn.disabled = false;
}

/**
 * Get the cached database (for external use)
 * @returns {object|null}
 */
export function getCache() {
  return streamsCache;
}
