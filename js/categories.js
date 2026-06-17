/**
 * categories.js — Category CRUD, rendering tabs, category picker
 */

import { $, escapeHtml, toast } from './ui.js';

let state = null; // reference to shared app state

/**
 * Initialize with shared app state reference
 * @param {object} appState
 */
export function init(appState) {
  state = appState;
}

/**
 * Render category filter tabs
 */
export function renderTabs() {
  const tabs = $('catTabs');
  if (!tabs || !state) return;

  let html = `<div class="cat-tab${state.activeCategory === 'all' ? ' active' : ''}" data-cat="all">All</div>`;

  for (const cat of state.categories) {
    const count = state.channels.filter(c => c.category === cat).length;
    html += `<div class="cat-tab${state.activeCategory === cat ? ' active' : ''}" data-cat="${escapeHtml(cat)}">`
      + `${escapeHtml(cat)} <span class="cat-count">${count}</span>`
      + `<span class="cat-del" data-del-cat="${escapeHtml(cat)}" title="Delete category">&times;</span></div>`;
  }

  html += '<div class="cat-tab cat-add" data-cat="__add__" title="Add category">+</div>';
  tabs.innerHTML = html;
}

/**
 * Delete a category and uncategorize its channels
 * @param {string} catName
 * @param {Function} onSave — callback to persist state
 */
export function remove(catName, onSave) {
  if (!state) return;
  if (!confirm(`Delete category "${catName}"?`)) return;

  const idx = state.categories.indexOf(catName);
  if (idx !== -1) state.categories.splice(idx, 1);

  for (const ch of state.channels) {
    if (ch.category === catName) ch.category = null;
  }

  if (state.activeCategory === catName) state.activeCategory = 'all';
  if (onSave) onSave();
  toast('Category deleted', 'ok');
}

/**
 * Switch active category filter
 * @param {string} cat
 * @param {Function} onSave
 */
export function switchTo(cat, onSave) {
  if (!state) return;

  if (cat === '__add__') {
    const name = prompt('Enter new category name:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (state.categories.indexOf(trimmed) === -1) {
      state.categories.push(trimmed);
      if (onSave) onSave();
    }
    state.activeCategory = trimmed;
  } else {
    state.activeCategory = cat;
  }
}

/**
 * Assign a channel to a category by index
 * @param {number} chIndex
 * @param {string} cat
 * @param {Function} onSave
 */
export function assignChannel(chIndex, cat, onSave) {
  if (!state || !state.channels[chIndex]) return;
  state.channels[chIndex].category = cat;
  if (onSave) onSave();
}

/**
 * Remove a channel from its category
 * @param {number} chIndex
 * @param {Function} onSave
 */
export function unassignChannel(chIndex, onSave) {
  if (!state || !state.channels[chIndex]) return;
  state.channels[chIndex].category = null;
  if (onSave) onSave();
}

/**
 * Show the category picker overlay
 * @param {Function} callback — receives selected category name
 */
export function showPicker(callback) {
  const overlay = $('catPickerOverlay');
  const list = $('catPickerList');
  if (!overlay || !list || !state) return;

  window._catPickerCb = callback;

  let html = '';
  for (const cat of state.categories) {
    html += `<div class="cat-pick-item" data-pick-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</div>`;
  }
  if (!html) html = '<p class="muted tiny">No categories yet.</p>';
  list.innerHTML = html;
  overlay.classList.add('open');
}

/**
 * Close the category picker
 * @param {string|null} selectedCat
 */
export function closePicker(selectedCat) {
  const overlay = $('catPickerOverlay');
  if (overlay) overlay.classList.remove('open');
  if (selectedCat && window._catPickerCb) window._catPickerCb(selectedCat);
  window._catPickerCb = null;
}

/**
 * Show assign popup for uncategorized channels
 * @param {Function} onSave
 */
export function showAssignPopup(onSave) {
  if (!state) return;
  const uncategorized = state.channels.filter(c => !c.category);
  if (!uncategorized.length) { toast('No uncategorized channels', 'info'); return; }

  let html = '';
  for (let i = 0; i < state.channels.length; i++) {
    if (!state.channels[i].category) {
      html += `<div class="cat-pick-item" data-assign-idx="${i}">${escapeHtml(state.channels[i].name)}</div>`;
    }
  }

  const overlay = $('catPickerOverlay');
  const list = $('catPickerList');
  if (!overlay || !list) return;

  $('catPickerNew').style.display = 'none';
  $('catPickerAddBtn').style.display = 'none';
  list.innerHTML = `<p class="muted tiny" style="margin:0 0 .4rem">Select a channel to add to <b>${escapeHtml(state.activeCategory)}</b>:</p>` + html;
  overlay.classList.add('open');
  window._catPickerCb = null;
}

/**
 * Get uncategorized channels
 * @returns {Array}
 */
export function getUncategorized() {
  return state ? state.channels.filter(c => !c.category) : [];
}

/**
 * Add a new category from the picker input
 * @param {Function} onSave
 */
export function addFromPicker(onSave) {
  const input = $('catPickerNew');
  const name = input ? input.value.trim() : '';
  if (!name || !state) return;
  if (state.categories.indexOf(name) === -1) {
    state.categories.push(name);
    if (onSave) onSave();
  }
  closePicker(name);
  input.value = '';
}

/**
 * Merge categories from imported data
 * @param {string[]} cats
 * @param {Function} onSave
 */
export function merge(cats, onSave) {
  if (!state || !Array.isArray(cats)) return;
  let changed = false;
  for (const cat of cats) {
    if (state.categories.indexOf(cat) === -1) {
      state.categories.push(cat);
      changed = true;
    }
  }
  if (changed && onSave) onSave();
}
