/**
 * ui.js — Shared UI utilities: toast, DOM helpers, escape, theme
 */

/**
 * Show a toast notification
 * @param {string} message
 * @param {'ok'|'warn'|'bad'|'info'} type
 */
export function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
}

/**
 * Escape HTML special characters
 * @param {string} v
 * @returns {string}
 */
export function escapeHtml(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Shorthand for document.getElementById
 * @param {string} id
 * @returns {HTMLElement}
 */
export function $(id) {
  return document.getElementById(id);
}

/**
 * Bind a click handler to an element by ID (safe if element missing)
 * @param {string} id
 * @param {Function} fn
 */
export function bindClick(id, fn) {
  const el = $(id);
  if (el) el.addEventListener('click', fn);
}

/**
 * Apply theme to document and save preference
 * @param {'day'|'night'} theme
 * @param {Function} saveFn — callback to persist the theme
 */
export function applyTheme(theme, saveFn) {
  const normalized = theme === 'day' ? 'day' : 'night';
  document.documentElement.setAttribute('data-theme', normalized);
  if (saveFn) saveFn(normalized);
  const btn = $('themeBtn');
  if (btn) btn.textContent = normalized === 'night' ? '\u{1F319}' : '\u2600\uFE0F';
}

/**
 * Open a modal by ID
 * @param {string} id
 */
export function openModal(id) {
  const el = $(id);
  if (el) el.classList.add('open');
}

/**
 * Close a modal by ID
 * @param {string} id
 */
export function closeModal(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
}

/**
 * Close all open modals
 * @param {string[]} ids
 */
export function closeAllModals(ids) {
  ids.forEach(closeModal);
  const picker = $('catPickerOverlay');
  if (picker) picker.classList.remove('open');
}
