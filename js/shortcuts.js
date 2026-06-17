/**
 * shortcuts.js — Keyboard shortcut bindings
 */

import { $, openModal, closeModal, closeAllModals, applyTheme } from './ui.js';
import * as player from './player.js';

const MODAL_IDS = ['searchModalOverlay', 'debugModalOverlay', 'settingsModalOverlay', 'shortcutsModalOverlay'];

/**
 * Register all keyboard shortcuts
 * @param {object} handlers — callback map
 * @param {Function} handlers.onSearch — open search
 * @param {Function} handlers.onAddChannel — add channel from input
 * @param {Function} handlers.onToggleTheme — toggle day/night
 * @param {Function} handlers.onOpenSettings — open settings
 * @param {Function} handlers.onSaveTheme — persist theme
 */
export function register(handlers) {
  document.addEventListener('keydown', (e) => {
    // Escape — close all modals
    if (e.key === 'Escape') {
      closeAllModals(MODAL_IDS);
      return;
    }

    // Ctrl/Cmd combos
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'k':
          e.preventDefault();
          if (handlers.onSearch) handlers.onSearch();
          break;
        case 'enter':
          e.preventDefault();
          if (handlers.onAddChannel) handlers.onAddChannel();
          break;
        case 'd':
          e.preventDefault();
          if (handlers.onToggleTheme) handlers.onToggleTheme();
          break;
        case ',':
          e.preventDefault();
          if (handlers.onOpenSettings) handlers.onOpenSettings();
          break;
      }
      return;
    }

    // Non-input shortcuts
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key.toLowerCase()) {
      case 'f':
        e.preventDefault();
        player.toggleFullscreen();
        break;
      case ' ':
        e.preventDefault();
        const video = $('video');
        if (video) {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        }
        break;
    }
  });
}
