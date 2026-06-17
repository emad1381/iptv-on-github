/**
 * latency.js — Visual latency graph: User → Proxy → Origin
 * Measures ping times and renders a horizontal pipeline visualization.
 */

import { $ } from './ui.js';

let proxyUrl = '';

/**
 * Initialize latency module
 * @param {string} currentProxyUrl
 */
export function init(currentProxyUrl) {
  proxyUrl = currentProxyUrl;
}

/**
 * Update the proxy URL (called when settings change)
 * @param {string} url
 */
export function setProxyUrl(url) {
  proxyUrl = url;
}

/**
 * Ping a URL and return latency in ms
 * Uses fetch with no-cors for cross-origin, or normal fetch for same-origin/proxy
 * @param {string} url
 * @param {number} timeout
 * @returns {Promise<number>} latency in ms, or -1 on failure
 */
async function ping(url, timeout) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const t1 = performance.now();
    await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timer);
    return Math.round(performance.now() - t1);
  } catch {
    return -1;
  }
}

/**
 * Run latency test and update the graph
 * @param {string} streamUrl — the currently playing stream URL
 */
export async function runTest(streamUrl) {
  if (!streamUrl) return;

  const graph = $('latencyGraph');
  const pipeline = $('latencyPipeline');
  const summary = $('latencySummary');
  if (!graph || !pipeline || !summary) return;

  graph.classList.add('visible');

  // Show loading state
  renderPipeline(pipeline, { mode: 'loading', hops: [] });
  summary.textContent = 'Testing...';

  const hasProxy = !!proxyUrl;
  const hops = [];

  if (hasProxy) {
    // Mode: User → Proxy → Origin
    // 1. Ping proxy endpoint (just the proxy domain, not full URL)
    let proxyDomain;
    try { proxyDomain = new URL(proxyUrl).origin; } catch { proxyDomain = proxyUrl; }

    // 2. Ping full proxy+stream (total latency)
    const proxiedUrl = proxyUrl + encodeURIComponent(streamUrl);

    // Run both in parallel
    const [proxyPing, totalPing] = await Promise.all([
      ping(proxyDomain, 5000),
      ping(proxiedUrl, 10000),
    ]);

    const originPing = totalPing > 0 && proxyPing > 0 ? Math.max(0, totalPing - proxyPing) : -1;

    hops.push(
      { label: 'User', icon: '👤', time: 0, type: 'local' },
      { label: 'Proxy', icon: '🛡️', time: proxyPing, type: 'hop' },
      { label: 'Origin', icon: '📡', time: originPing, type: 'hop' },
    );

    renderPipeline(pipeline, { mode: 'proxy', hops });

    if (proxyPing > 0 && originPing > 0) {
      summary.innerHTML = `Total: <strong>${totalPing}ms</strong> · You→Proxy: <strong>${proxyPing}ms</strong> · Proxy→Origin: <strong>${originPing}ms</strong>`;
    } else if (proxyPing > 0) {
      summary.innerHTML = `Proxy reachable (${proxyPing}ms) but origin timeout · Check stream URL`;
    } else {
      summary.innerHTML = `Proxy unreachable · Check proxy URL in Settings`;
    }
  } else {
    // Mode: User → Origin (direct)
    const originPing = await ping(streamUrl, 10000);

    hops.push(
      { label: 'User', icon: '👤', time: 0, type: 'local' },
      { label: 'Origin', icon: '📡', time: originPing, type: 'hop' },
    );

    renderPipeline(pipeline, { mode: 'direct', hops });

    if (originPing > 0) {
      summary.innerHTML = `Direct: <strong>${originPing}ms</strong> · No proxy active`;
    } else {
      summary.innerHTML = `Origin unreachable · Stream may be down or CORS blocked`;
    }
  }
}

/**
 * Render the pipeline visualization
 * @param {HTMLElement} container
 * @param {{ mode: string, hops: Array }} data
 */
function renderPipeline(container, data) {
  if (data.mode === 'loading') {
    container.innerHTML = `
      <div class="latency-node"><div class="latency-node-icon active">👤</div><div class="latency-node-label">User</div><div class="latency-node-time">...</div></div>
      <div class="latency-arrow"><div class="latency-arrow-line animating"></div><div class="latency-arrow-hop">ping</div></div>
      <div class="latency-node"><div class="latency-node-icon">⏳</div><div class="latency-node-label">Testing</div><div class="latency-node-time">...</div></div>
    `;
    return;
  }

  let html = '';
  for (let i = 0; i < data.hops.length; i++) {
    const hop = data.hops[i];
    const isLast = i === data.hops.length - 1;
    const isFirst = i === 0;

    const timeClass = hop.type === 'local' ? '' : getTimeClass(hop.time);
    const iconClass = hop.type === 'local' ? 'active' : (hop.time > 0 ? timeClass : 'bad');

    // Node
    html += `<div class="latency-node">`;
    html += `<div class="latency-node-icon ${iconClass}">${hop.icon}</div>`;
    html += `<div class="latency-node-label">${hop.label}</div>`;
    if (hop.type === 'local') {
      html += `<div class="latency-node-time">you</div>`;
    } else if (hop.time > 0) {
      html += `<div class="latency-node-time ${timeClass}">${hop.time}ms</div>`;
    } else {
      html += `<div class="latency-node-time bad">timeout</div>`;
    }
    html += `</div>`;

    // Arrow (between nodes)
    if (!isLast) {
      const nextHop = data.hops[i + 1];
      const hopLabel = data.mode === 'proxy' && i === 0 ? 'You→Proxy' : data.mode === 'proxy' ? 'Proxy→Origin' : 'Direct';
      const arrowClass = hop.time > 0 ? '' : ' animating';
      html += `<div class="latency-arrow">`;
      html += `<div class="latency-arrow-line${arrowClass}"></div>`;
      html += `<div class="latency-arrow-hop">${hopLabel}</div>`;
      html += `</div>`;
    }
  }

  container.innerHTML = html;
}

/**
 * Get CSS class based on latency value
 * @param {number} ms
 * @returns {string}
 */
function getTimeClass(ms) {
  if (ms < 0) return 'bad';
  if (ms < 150) return 'good';
  if (ms < 400) return 'warn';
  return 'bad';
}

/**
 * Show the latency graph (when a channel starts playing)
 */
export function show() {
  const graph = $('latencyGraph');
  if (graph) graph.classList.add('visible');
}

/**
 * Hide the latency graph
 */
export function hide() {
  const graph = $('latencyGraph');
  if (graph) graph.classList.remove('visible');
}
