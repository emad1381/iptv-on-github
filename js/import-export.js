/**
 * import-export.js — M3U and JSON import/export
 */

import { toast } from './ui.js';

/**
 * Parse M3U/M3U8 text into channel objects
 * @param {string} text
 * @returns {{ channels: Array, categories: string[] }}
 */
export function parseM3U(text) {
  const channels = [];
  const foundCategories = [];
  const lines = text.split('\n');
  let currentName = '';
  let currentGroup = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.indexOf('#EXTINF:') === 0) {
      const nameMatch = line.match(/,(.+)$/);
      currentName = nameMatch ? nameMatch[1].trim() : 'Unknown';
      const groupMatch = line.match(/group-title="([^"]*)"/);
      currentGroup = groupMatch ? groupMatch[1] : null;
    } else if (line && line[0] !== '#') {
      if (currentName && (line.indexOf('http://') === 0 || line.indexOf('https://') === 0)) {
        channels.push({ name: currentName, url: line, test: null, category: currentGroup || null });
        if (currentGroup && foundCategories.indexOf(currentGroup) === -1) {
          foundCategories.push(currentGroup);
        }
      }
      currentName = '';
      currentGroup = null;
    }
  }

  return { channels, categories: foundCategories };
}

/**
 * Import channels from M3U file content
 * @param {string} text — file content
 * @param {Array} existingChannels — current channels (for dedup)
 * @returns {{ added: number, channels: Array, categories: string[] }}
 */
export function importM3U(text, existingChannels) {
  const { channels: imported, categories: newCats } = parseM3U(text);
  if (!imported.length) return { added: 0, channels: [], categories: [] };

  const existingUrls = new Set(existingChannels.map(c => c.url));
  const added = [];
  for (const ch of imported) {
    if (!existingUrls.has(ch.url)) {
      added.push(ch);
      existingUrls.add(ch.url);
    }
  }

  return { added: added.length, channels: added, categories: newCats };
}

/**
 * Export app data as a downloadable JSON file
 * @param {Array} channels
 * @param {string[]} categories
 */
export function exportJSON(channels, categories) {
  const data = {
    channels,
    categories,
    exportedAt: new Date().toISOString(),
    version: '2.0',
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `neonstream-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported', 'ok');
}

/**
 * Import channels from a JSON file
 * @param {string} text — file content
 * @param {Array} existingChannels — current channels (for dedup)
 * @returns {{ added: number, channels: Array, categories: string[] }}
 */
export function importJSON(text, existingChannels) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    toast('Failed to parse JSON', 'bad');
    return { added: 0, channels: [], categories: [] };
  }

  if (!data.channels || !Array.isArray(data.channels)) {
    toast('Invalid JSON format', 'warn');
    return { added: 0, channels: [], categories: [] };
  }

  const existingUrls = new Set(existingChannels.map(c => c.url));
  const added = [];
  for (const ch of data.channels) {
    if (ch.url && !existingUrls.has(ch.url)) {
      added.push(ch);
      existingUrls.add(ch.url);
    }
  }

  return {
    added: added.length,
    channels: added,
    categories: Array.isArray(data.categories) ? data.categories : [],
  };
}

/**
 * Read a File object as text
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
