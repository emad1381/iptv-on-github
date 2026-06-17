/**
 * channels.js — Channel management: add, delete, render, test
 */

import { $, escapeHtml, toast } from './ui.js';
import { log } from './diagnostics.js';
import * as categories from './categories.js';

let state = null;       // shared app state
let proxyFn = null;     // function to apply CORS proxy to a URL
let playerPlayFn = null; // function to play a channel

/**
 * Score a stream test result
 * @param {number} ms
 * @param {number} segments
 * @returns {{ text: string, cls: string }}
 */
export function scoreBadge(ms, segments) {
  if (ms <= 900 && segments >= 3) return { text: 'Excellent', cls: 'ok' };
  if (ms <= 1800 && segments >= 2) return { text: 'Good', cls: 'ok' };
  if (ms <= 3000) return { text: 'Medium', cls: 'warn' };
  return { text: 'Weak', cls: 'bad' };
}

/**
 * Initialize channel module
 * @param {object} appState
 * @param {Function} getProxiedUrl
 * @param {Function} playChannel
 */
export function init(appState, getProxiedUrl, playChannel) {
  state = appState;
  proxyFn = getProxiedUrl;
  playerPlayFn = playChannel;
}

/**
 * Validate a URL
 * @param {string} str
 * @returns {boolean}
 */
function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Add a channel from the input fields
 * @param {Function} onSave
 */
export function add(onSave) {
  const nameEl = $('name');
  const urlEl = $('url');
  const name = nameEl ? nameEl.value.trim() : '';
  const url = urlEl ? urlEl.value.trim() : '';

  if (!name || !url) { toast('Name and URL are required', 'warn'); return; }
  if (name.length > 100) { toast('Name too long (max 100)', 'warn'); return; }
  if (url.length > 2000 || !isValidUrl(url)) { toast('Invalid URL (must be http/https)', 'warn'); return; }

  state.channels.unshift({ name, url, test: null, category: null });
  if (nameEl) nameEl.value = '';
  if (urlEl) urlEl.value = '';

  categories.renderTabs();
  renderList();
  if (onSave) onSave();
  toast('Channel added: ' + name, 'ok');
}

/**
 * Delete a channel by index
 * @param {number} index
 * @param {Function} onSave
 */
export function remove(index, onSave) {
  const ch = state.channels[index];
  if (!ch) return;
  state.channels.splice(index, 1);
  categories.renderTabs();
  renderList();
  if (onSave) onSave();
  toast('Deleted: ' + ch.name, 'ok');
}

/**
 * Render the channel list into #channels
 */
export function renderList() {
  const list = $('channels');
  if (!list || !state) return;

  const filtered = state.activeCategory === 'all'
    ? state.channels
    : state.channels.filter(c => c.category === state.activeCategory);

  if (!filtered.length) {
    list.innerHTML = state.activeCategory === 'all'
      ? '<p class="muted tiny">No channels yet. Add your first stream.</p>'
      : '<p class="muted tiny">No channels in this category.</p>';
    updateCount();
    return;
  }

  list.innerHTML = filtered.map(c => {
    const realIdx = state.channels.indexOf(c);
    const catBadge = (state.activeCategory === 'all' && c.category)
      ? ` <span class="muted channel-cat-badge">${escapeHtml(c.category)}</span>` : '';
    let testBadge = '';
    if (c.test) {
      const b = scoreBadge(c.test.pingMs, c.test.segments);
      testBadge = ` <span class="pill ${b.cls} channel-test-badge">${c.test.pingMs}ms</span>`;
    }
    const removeBtn = state.activeCategory !== 'all'
      ? `<button class="btn" data-uncat="${realIdx}" title="Remove from category" style="color:var(--warn);">&minus;</button>` : '';

    return `<div class="channel-row">`
      + `<div class="name" data-play="${realIdx}" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}${catBadge}${testBadge}</div>`
      + `<button class="btn" data-test="${realIdx}" title="Test">&#9201;</button>`
      + removeBtn
      + `<button class="btn" data-del="${realIdx}" title="Delete">&#10005;</button>`
      + `</div>`;
  }).join('');

  if (state.activeCategory !== 'all') {
    list.innerHTML += `<div class="cat-assign-bar" id="catAssignBtn">+ Add channel to ${escapeHtml(state.activeCategory)}</div>`;
  }

  updateCount();
}

/**
 * Update the channel count badge
 */
function updateCount() {
  const el = $('channelCount');
  if (el && state) {
    const n = state.channels.length;
    el.textContent = `${n} channel${n !== 1 ? 's' : ''}`;
  }
}

/**
 * Test a channel's stream availability
 * @param {number} index
 */
export async function test(index) {
  const ch = state.channels[index];
  if (!ch) return;

  const area = $('testResultArea');
  if (area) {
    area.style.display = 'block';
    area.innerHTML = `<span class="muted">Testing <b>${escapeHtml(ch.name)}</b>...</span>`;
  }

  // Try through proxy first
  try {
    const testUrl = proxyFn ? proxyFn(ch.url) : ch.url;
    const t1 = performance.now();
    const res = await fetch(testUrl, { method: 'GET' });
    const pingMs = Math.round(performance.now() - t1);

    let segments = 0;
    if (res.ok) {
      const text = await res.text();
      segments = (text.match(/#EXTINF:/g) || []).length;
      if (segments === 0 && text.indexOf('#EXTM3U') !== -1) segments = 1;
    }

    ch.test = { pingMs, segments };
    const badge = scoreBadge(pingMs, segments);
    if (area) area.innerHTML = `<b>${escapeHtml(ch.name)}</b> &mdash; <span class="pill ${badge.cls}">${badge.text}</span> &middot; Ping: <b>${pingMs}ms</b> &middot; Segments: <b>${segments}</b>`;
    renderList();
    toast(`Test: ${ch.name} — ${badge.text}`, badge.cls);
    return;
  } catch {
    // fallback: no-cors ping
  }

  try {
    const t2 = performance.now();
    await fetch(ch.url, { method: 'HEAD', mode: 'no-cors' });
    const pingMs = Math.round(performance.now() - t2);
    ch.test = { pingMs, segments: 0 };
    if (area) area.innerHTML = `<b>${escapeHtml(ch.name)}</b> &mdash; <span class="pill warn">Reachable</span> &middot; Ping: <b>${pingMs}ms</b> <span class="muted tiny">(no-cors)</span>`;
    renderList();
  } catch {
    if (area) area.innerHTML = `<b>${escapeHtml(ch.name)}</b> &mdash; <span style="color:var(--bad)">Unreachable</span>`;
    toast('Test failed: ' + ch.name, 'bad');
  }
}

/**
 * Set the app state reference (used after import)
 * @param {object} appState
 */
export function setState(appState) {
  state = appState;
}
