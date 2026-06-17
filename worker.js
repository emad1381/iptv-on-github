export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrlStr = url.searchParams.get('url');

    if (!targetUrlStr) {
      return new Response('Missing "url" parameter. Usage: /?url=https://example.com/stream.m3u8', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const targetUrl = new URL(targetUrlStr);
      const workerOrigin = url.origin;

      // Copy request headers (skip cf- and host)
      const newHeaders = new Headers();
      for (const [key, value] of request.headers.entries()) {
        if (!key.startsWith('cf-') && key.toLowerCase() !== 'host') {
          newHeaders.set(key, value);
        }
      }

      // Handle OPTIONS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Expose-Headers': '*',
          }
        });
      }

      // Fetch from origin
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        redirect: 'follow'
      });

      const contentType = response.headers.get('content-type') || '';
      const isM3U8 = contentType.toLowerCase().includes('mpegurl') ||
                     targetUrl.pathname.endsWith('.m3u8') ||
                     targetUrl.pathname.endsWith('.m3u');

      const corsHeaders = new Headers(response.headers);
      corsHeaders.set('Access-Control-Allow-Origin', '*');
      corsHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
      corsHeaders.set('Access-Control-Allow-Headers', '*');
      corsHeaders.set('Access-Control-Expose-Headers', '*');

      // For M3U8: rewrite relative URLs to go through this proxy
      if (isM3U8 && response.ok) {
        let text = await response.text();

        // Get base URL for resolving relative paths
        // Use response.url (after redirects) or original target
        const responseUrl = new URL(response.url || targetUrl.toString());
        const baseUrl = responseUrl.origin + responseUrl.pathname.substring(0, responseUrl.pathname.lastIndexOf('/') + 1);

        // Preserve query string from original URL (for auth tokens, etc.)
        const originalQuery = responseUrl.search || '';

        // Rewrite each non-comment, non-empty line
        text = text.replace(/^([^\s#][^\r\n]*)/gm, (match, line) => {
          line = line.trim();
          if (!line) return match;

          // Skip data: and blob: URLs
          if (line.startsWith('data:') || line.startsWith('blob:')) return match;

          let absoluteUrl;
          try {
            // Try to resolve as relative URL
            absoluteUrl = new URL(line, baseUrl + originalQuery);
          } catch {
            try {
              absoluteUrl = new URL(line);
            } catch {
              return match; // Can't parse, leave as-is
            }
          }

          // If it's already going through this proxy, don't double-proxy
          if (absoluteUrl.href.startsWith(workerOrigin)) return match;

          // Build proxied URL: workerOrigin/?url=encodedAbsoluteUrl
          const proxiedUrl = workerOrigin + '/?url=' + encodeURIComponent(absoluteUrl.href);
          return proxiedUrl;
        });

        // Also rewrite URI="..." attributes (for AES-128 keys, etc.)
        text = text.replace(/(URI=")([^"]+)(")/gi, (match, prefix, uri, suffix) => {
          if (uri.startsWith('data:') || uri.startsWith('blob:')) return match;

          let absoluteUrl;
          try {
            absoluteUrl = new URL(uri, baseUrl + originalQuery);
          } catch {
            return match;
          }

          if (absoluteUrl.href.startsWith(workerOrigin)) return match;

          const proxiedUrl = workerOrigin + '/?url=' + encodeURIComponent(absoluteUrl.href);
          return prefix + proxiedUrl + suffix;
        });

        corsHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
        corsHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return new Response(text, {
          status: 200,
          headers: corsHeaders
        });
      }

      // Non-M3U8: pass through with CORS headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: corsHeaders
      });

    } catch (error) {
      return new Response(`Proxy Error: ${error.message}`, {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
