/**
 * diagnostics.js — Debug log engine for HLS/DASH events
 */

const MAX_LOG_ENTRIES = 120;
let logBox = null;

/**
 * Initialize the diagnostics module
 */
export function init() {
  logBox = document.getElementById('debug-log');
}

/**
 * Append a timestamped log entry
 * @param {string} msg
 * @param {'info'|'warn'|'error'|'success'} type
 */
export function log(msg, type = 'info') {
  if (!logBox) logBox = document.getElementById('debug-log');
  if (!logBox) return;

  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const colors = { info: '#a3e635', error: '#fb7185', warn: '#fbbf24', success: '#4ade80' };

  const line = document.createElement('div');
  line.style.cssText = `color:${colors[type] || colors.info};margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:2px;`;

  const ts = document.createElement('span');
  ts.style.opacity = '0.5';
  ts.textContent = `[${time}] `;
  line.appendChild(ts);
  line.appendChild(document.createTextNode(msg));

  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;

  while (logBox.children.length > MAX_LOG_ENTRIES) {
    logBox.removeChild(logBox.firstChild);
  }
}

/**
 * Clear all log entries
 */
export function clear() {
  if (logBox) logBox.innerHTML = '';
}
