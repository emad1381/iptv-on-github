/**
 * player.js — HLS.js and dash.js playback engine with stall recovery
 */

import { $, toast } from './ui.js';
import { log } from './diagnostics.js';

let hlsInstance = null;
let dashPlayer = null;
let stallGuard = null;
let playingHandler = null;
let waitingHandler = null;

/**
 * Check if a URL is a DASH stream
 * @param {string} url
 * @returns {boolean}
 */
export function isDASH(url) {
  const u = (url || '').split('?')[0].toLowerCase();
  return u.indexOf('.mpd') !== -1;
}

/**
 * Destroy current player instance and clean up
 */
export function destroy() {
  if (stallGuard) { clearInterval(stallGuard); stallGuard = null; }
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  if (dashPlayer) { dashPlayer.reset(); dashPlayer = null; }
  const video = $('video');
  if (video) video.src = '';
}

/**
 * Detach old event listeners from video element
 * @param {HTMLVideoElement} video
 */
function detachVideoEvents(video) {
  if (playingHandler) video.removeEventListener('playing', playingHandler);
  if (waitingHandler) video.removeEventListener('waiting', waitingHandler);
}

/**
 * Attach standard video event listeners
 * @param {HTMLVideoElement} video
 * @param {Function} onStateChange
 */
function attachVideoEvents(video, onStateChange) {
  detachVideoEvents(video);
  playingHandler = () => onStateChange('playing', 'ok');
  waitingHandler = () => onStateChange('buffering', 'warn');
  video.addEventListener('playing', playingHandler);
  video.addEventListener('waiting', waitingHandler);
}

/**
 * Initialize DASH playback
 * @param {HTMLVideoElement} video
 * @param {string} streamUrl
 * @param {Function} onStateChange — (text, kind) => void
 * @param {Function} onQualityChange — (qualityLabel) => void
 */
export function playDASH(video, streamUrl, onStateChange, onQualityChange) {
  destroy();
  onStateChange('loading...', 'warn');
  log('Initializing DASH: ' + streamUrl, 'info');

  attachVideoEvents(video, onStateChange);

  try {
    const player = dashjs.MediaPlayer().create();
    player.initialize(video, streamUrl, true);
    player.updateSettings({
      streaming: {
        abr: { autoSwitchBitrate: { video: true, audio: true } },
        buffer: { fastSwitchEnabled: true, stableBufferTime: 12 },
      }
    });
    dashPlayer = player;

    player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
      log('DASH stream initialized', 'success');
      toast('Stream loaded', 'ok');
    });

    player.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, (e) => {
      if (e.mediaType === 'video') {
        const tracks = player.getBitrateInfoListFor('video');
        const track = tracks && tracks[e.newQuality];
        if (track) onQualityChange(track.height || 'auto');
      }
    });

    player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
      log('DASH Error: ' + (e.error ? e.error.message : 'unknown'), 'error');
    });

    // Stall guard for DASH
    startStallGuard(video, streamUrl, () => playDASH(video, streamUrl, onStateChange, onQualityChange), onStateChange);

  } catch (e) {
    log('DASH init failed: ' + e.message, 'error');
    onStateChange('DASH init failed', 'bad');
    toast('DASH init failed', 'bad');
  }
}

/**
 * Initialize HLS playback
 * @param {HTMLVideoElement} video
 * @param {string} streamUrl
 * @param {Function} onStateChange — (text, kind) => void
 * @param {Function} onQualityChange — (qualityLabel) => void
 */
export function playHLS(video, streamUrl, onStateChange, onQualityChange) {
  destroy();
  onStateChange('loading...', 'warn');
  log('Initializing HLS: ' + streamUrl, 'info');

  attachVideoEvents(video, onStateChange);

  if (!window.Hls) {
    // dash.js loaded but Hls not available
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(() => {});
      onStateChange('playing (native)', 'ok');
      return;
    }
    onStateChange('HLS unsupported', 'bad');
    toast('HLS not supported', 'bad');
    return;
  }

  if (!window.Hls.isSupported()) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(() => {});
      onStateChange('playing (native)', 'ok');
      return;
    }
    onStateChange('HLS unsupported', 'bad');
    toast('HLS not supported', 'bad');
    return;
  }

  const hls = new window.Hls({
    debug: false,
    enableWorker: true,
    lowLatencyMode: true,
    maxBufferLength: 15,
    maxMaxBufferLength: 40,
    maxBufferHole: 0.3,
    backBufferLength: 20,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 4,
    maxLiveSyncPlaybackRate: 1.5,
    enableSoftwareAES: true,
    startLevel: -1,
    autoLevelCapping: -1,
    fragLoadingTimeOut: 20000,
    manifestLoadingTimeOut: 20000,
    fragLoadingMaxRetry: 8,
    levelLoadingMaxRetry: 8,
    manifestLoadingMaxRetry: 8,
  });

  hlsInstance = hls;
  hls.loadSource(streamUrl);
  hls.attachMedia(video);

  hls.on(window.Hls.Events.MANIFEST_PARSED, (_, data) => {
    log(`Manifest parsed. ${data.levels ? data.levels.length : 0} quality levels.`, 'success');
    toast('Stream loaded', 'ok');
    video.play().catch(() => log('Autoplay blocked.', 'warn'));
  });

  hls.on(window.Hls.Events.LEVEL_SWITCHED, (_, data) => {
    const level = hls.levels[data.level];
    if (level) onQualityChange(level.height || 'auto');
  });

  hls.on(window.Hls.Events.FRAG_LOADING, (_, data) => {
    if (data.frag) data.frag._reqStartTime = performance.now();
  });

  hls.on(window.Hls.Events.FRAG_LOADED, (_, data) => {
    if (!data.frag || !data.frag._reqStartTime) return;
    const ms = Math.round(performance.now() - data.frag._reqStartTime);
    const size = data.stats ? Math.round(data.stats.total / 1024) : 0;
    log(`Frag sn ${data.frag.sn} | ${ms}ms | ${size}KB`, 'success');
  });

  hls.on(window.Hls.Events.ERROR, (_, data) => {
    if (data.fatal) {
      log(`FATAL HLS Error: ${data.type} - ${data.details}`, 'error');
      toast('Stream error: ' + data.details, 'bad');
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else destroy();
    }
  });

  // Stall guard for HLS
  startStallGuard(video, streamUrl, () => playHLS(video, streamUrl, onStateChange, onQualityChange), onStateChange);
}

/**
 * Start a stall guard interval that monitors playback health
 * @param {HTMLVideoElement} video
 * @param {string} streamUrl
 * @param {Function} reinitFn — function to re-initialize player
 * @param {Function} onStateChange
 */
function startStallGuard(video, streamUrl, reinitFn, onStateChange) {
  if (stallGuard) clearInterval(stallGuard);

  let lastStuckTime = -1;
  let stallTicks = 0;
  let hasPlayed = false;

  stallGuard = setInterval(() => {
    if (!video) return;
    if (video.paused || (!hasPlayed && video.currentTime === 0)) {
      stallTicks = 0;
      lastStuckTime = video.currentTime;
      return;
    }
    if (video.currentTime > 0 && !video.paused) hasPlayed = true;

    if (video.currentTime === lastStuckTime && video.readyState < 3) {
      stallTicks++;
      if (stallTicks === 4) {
        log('Media stall detected, recovering...', 'warn');
        if (hlsInstance) hlsInstance.recoverMediaError();
      }
      if (stallTicks >= 10) {
        const now = Date.now();
        const last = window._lastReinit || 0;
        if (now - last > 15000) {
          log('Critical stall, re-initializing', 'error');
          window._lastReinit = now;
          stallTicks = 0;
          hasPlayed = false;
          destroy();
          setTimeout(reinitFn, 500);
        }
      }
    } else {
      stallTicks = 0;
    }
    lastStuckTime = video.currentTime;
  }, 1000);
}

/**
 * Toggle fullscreen for the video element
 */
export function toggleFullscreen() {
  const video = $('video');
  if (!video) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else if (video.requestFullscreen) {
    video.requestFullscreen();
  } else if (video.webkitRequestFullscreen) {
    video.webkitRequestFullscreen();
  }
}
