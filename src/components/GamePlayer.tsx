import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  RotateCcw,
  Maximize2,
  Minimize2,
  Loader2,
  Smartphone,
  Monitor,
  Tv,
  Check,
  Gauge,
  Zap,
  Flame,
  Scroll,
  ShieldCheck,
} from 'lucide-react';
import { CachedGameMeta, AspectRatioMode } from '../types';
import { parseGitHubRepoUrl } from '../utils/cacheManager';

export type PerformanceMode = 'auto' | 'chromebook' | 'low' | 'ultra-low';

export interface PerformanceConfig {
  id: PerformanceMode;
  label: string;
  sub: string;
  scale: number;
}

export const PERFORMANCE_PRESETS: PerformanceConfig[] = [
  {
    id: 'auto',
    label: 'Auto',
    sub: 'Adaptive quality (Device auto-tuned)',
    scale: 1.0,
  },
  {
    id: 'chromebook',
    label: 'Chromebook Safe',
    sub: 'Anti-crash protection (VRAM guarded, 60 FPS lock)',
    scale: 1.0,
  },
  {
    id: 'low',
    label: 'Low Performance',
    sub: 'Balanced FPS boost (Smooth high performance)',
    scale: 0.75,
  },
  {
    id: 'ultra-low',
    label: 'Ultra Low Performance',
    sub: 'Maximum FPS boost (Optimized for low-end devices)',
    scale: 0.50,
  },
];

interface GamePlayerProps {
  meta: CachedGameMeta;
  onBack: () => void;
  daysRemaining?: number;
}

function getRuntimeIsolationCSS(allowScroll: boolean) {
  return `
  * {
    scrollbar-width: ${allowScroll ? 'thin' : 'none'} !important;
    -ms-overflow-style: ${allowScroll ? 'auto' : 'none'} !important;
    box-sizing: border-box !important;
  }
  *::-webkit-scrollbar {
    display: ${allowScroll ? 'block' : 'none'} !important;
    width: ${allowScroll ? '6px' : '0'} !important;
    height: ${allowScroll ? '6px' : '0'} !important;
  }
  *::-webkit-scrollbar-thumb {
    background: #555555 !important;
    border-radius: 3px !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    overflow: ${allowScroll ? 'auto' : 'hidden'} !important;
    background-color: #000 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
  }
  #unity-container,
  #unity-container.unity-desktop,
  #unity-container.unity-mobile,
  .unity-desktop,
  .unity-mobile,
  #game-container,
  #gameContainer,
  .webgl-content {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    height: 100% !important;
    transform: none !important;
    -webkit-transform: none !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    background: #000 !important;
    z-index: 1 !important;
  }
  #unity-canvas, #canvas, #MMFCanvas, canvas {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    transform: none !important;
    -webkit-transform: none !important;
    object-fit: contain !important;
    display: block !important;
    margin: auto !important;
    padding: 0 !important;
    background: #000 !important;
  }
  #unity-loading-bar,
  #loading-cover,
  #loading,
  .loading,
  #progress-bar,
  .progress-bar,
  #status,
  .status,
  #loading-container,
  [id*="loading"],
  [id*="progress"],
  [class*="loading"],
  [class*="progress"],
  .loading-screen,
  #loadingScreen {
    position: fixed !important;
    bottom: 24px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    z-index: 999999 !important;
    max-width: 90vw !important;
    text-align: center !important;
    pointer-events: auto !important;
  }
`;
}

export function buildGameRuntimeHTML(
  rawHtml: string,
  baseHref: string,
  allowScroll: boolean = false,
  initialPerfMode: PerformanceMode = 'auto',
  blobUrlMap?: Record<string, string>
): string {
  let finalHtml = rawHtml;

  // Sanitize blocked CDN domains (e.g. genizy on jsDelivr or githack)
  finalHtml = finalHtml.replace(/https?:\/\/(?:cdn|fastly)\.jsdelivr\.net\/gh\/genizy\/[^\s"']+/gi, baseHref);
  finalHtml = finalHtml.replace(/https?:\/\/(?:rawcdn\.)?githack\.com\/genizy\/[^\s"']+/gi, baseHref);

  // Fix EmulatorJS case mismatches and ROM casing
  finalHtml = finalHtml.replace(/games\/Pokemon_Emerald\.gba/gi, 'games/pokemon_emerald.gba');
  // Disarm cross-origin service worker registration that fails in iframes
  finalHtml = finalHtml.replace(/<script\s+src=["'][^"']*coi-serviceworker\.js["'][^>]*><\/script>/gi, '<!-- coi-serviceworker disarmed in iframe -->');

  // Fix Unity WebGL template .unity-desktop / #unity-container translate(-50%, -50%) pushing game off-screen into top-left
  finalHtml = finalHtml.replace(/transform:\s*translate\(-50%,\s*-50%\)/gi, 'transform: none !important; top: 0 !important; left: 0 !important;');

  // Fix Eaglercraft / TeaVM / Brave crash where navigator.keyboard is null
  // In Brave and sandboxed iframes: 'keyboard' in window.navigator evaluates to true, but navigator.keyboard is null.
  // Evaluating 'lock' in window.navigator.keyboard throws:
  // TypeError: Cannot use 'in' operator to search for 'lock' in null
  finalHtml = finalHtml.replace(
    /['"]lock['"]\s*in\s*(?:window\.)?navigator\.keyboard/g,
    "(window.navigator && window.navigator.keyboard && ('lock' in window.navigator.keyboard))"
  );
  finalHtml = finalHtml.replace(
    /['"]getUserMedia['"]\s*in\s*(?:window\.)?navigator\.mediaDevices/g,
    "(window.navigator && window.navigator.mediaDevices && ('getUserMedia' in window.navigator.mediaDevices))"
  );

  // Fix ES Module relative imports in blob: documents (e.g. Celeste / Blazor / DotNet WebAssembly):
  // Native browser module loader fails with "Invalid relative url or base scheme isn't hierarchical" on blob: URLs.
  // We resolve relative module paths to absolute URLs using absoluteBaseHref or blobUrlMap.
  const absoluteBaseHref = baseHref.startsWith('http://') || baseHref.startsWith('https://')
    ? baseHref
    : (typeof window !== 'undefined' ? `${window.location.origin}${baseHref.startsWith('/') ? '' : '/'}${baseHref}` : baseHref);

  // Directly rewrite static module imports in HTML/JS
  finalHtml = finalHtml.replace(/from\s+(['"])\.\/([^'"]+)\1/g, (_m, q, relPath) => {
    const fullUrl = (blobUrlMap && blobUrlMap[relPath]) || `${absoluteBaseHref}${relPath}`;
    return `from ${q}${fullUrl}${q}`;
  });
  finalHtml = finalHtml.replace(/import\s*\(\s*(['"])\.\/([^'"]+)\1\s*\)/g, (_match, q, relPath) => {
    const fullUrl = (blobUrlMap && blobUrlMap[relPath]) || `${absoluteBaseHref}${relPath}`;
    return `import(${q}${fullUrl}${q})`;
  });
  finalHtml = finalHtml.replace(/import\s+(['"])\.\/([^'"]+)\1/g, (_m, q, relPath) => {
    const fullUrl = (blobUrlMap && blobUrlMap[relPath]) || `${absoluteBaseHref}${relPath}`;
    return `import ${q}${fullUrl}${q}`;
  });
  finalHtml = finalHtml.replace(/(['"])\.\/(_framework\/[^'"]+)\1/g, (_m, q, relPath) => {
    return `${q}${absoluteBaseHref}${relPath}${q}`;
  });

  // Rewrite external script src and link href to absolute URLs so modules and stylesheets resolve correctly in blob documents
  const trailingBaseHref = absoluteBaseHref.endsWith('/') ? absoluteBaseHref : absoluteBaseHref + '/';
  finalHtml = finalHtml.replace(/<script\b([^>]*?\bsrc=["'])([^"']+)(["'][^>]*?)>/gi, (match, prefix, src, suffix) => {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:') || src.startsWith('data:')) {
      return match;
    }
    const cleanSrc = src.startsWith('./') ? src.substring(2) : (src.startsWith('/') ? src.substring(1) : src);
    return `<script${prefix}${trailingBaseHref}${cleanSrc}${suffix}>`;
  });
  finalHtml = finalHtml.replace(/<link\b([^>]*?\bhref=["'])([^"']+)(["'][^>]*?)>/gi, (match, prefix, href, suffix) => {
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('blob:') || href.startsWith('data:')) {
      return match;
    }
    const cleanHref = href.startsWith('./') ? href.substring(2) : (href.startsWith('/') ? href.substring(1) : href);
    return `<link${prefix}${trailingBaseHref}${cleanHref}${suffix}>`;
  });

  // Rewrite Feed & Grow Fish and similar hardcoded '/Build/' base paths
  finalHtml = finalHtml.replace(/var\s+BASE\s*=\s*['"]\/Build\/['"]/g, "var BASE='Build/'");

  // Import map for ES Module resolution in blob: documents
  const importMapScript = `
<script type="importmap">
{
  "imports": {
    "./_framework/": "${trailingBaseHref}_framework/",
    "_framework/": "${trailingBaseHref}_framework/",
    "./": "${trailingBaseHref}"
  }
}
</script>
`;

  // Rewrite script and link tags if cached in blobUrlMap
  if (blobUrlMap && Object.keys(blobUrlMap).length > 0) {
    for (const [origPath, bUrl] of Object.entries(blobUrlMap)) {
      const escaped = origPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      finalHtml = finalHtml.replace(new RegExp(`(src|href)=["'](?:\\./)?${escaped}["']`, 'gi'), `$1="${bUrl}"`);
    }
  }

  // Runtime patch script: Fixes Unity WebGL URL constructor, disarms teardown errors, handles canvas scaling, and fixes case mismatches
  const runtimeScript = `
<script id="lowteir-runtime-patch">
(function() {
  var gameBaseHref = ${JSON.stringify(absoluteBaseHref)};
  var blobMap = ${JSON.stringify(blobUrlMap || {})};

  // 0. SafeProxy: Fix "Cannot create proxy with a non-object as target or handler" in games (e.g. Balatro / Love2D / Emscripten)
  try {
    var OrigProxy = window.Proxy;
    if (OrigProxy) {
      function isProxyable(val) {
        return val !== null && (typeof val === 'object' || typeof val === 'function');
      }
      function SafeProxy(target, handler) {
        if (!isProxyable(target)) {
          target = (typeof target === 'function') ? target : {};
        }
        if (!handler || typeof handler !== 'object') {
          handler = {};
        }
        return new OrigProxy(target, handler);
      }
      SafeProxy.prototype = OrigProxy.prototype;
      if (OrigProxy.revocable) {
        SafeProxy.revocable = function(target, handler) {
          if (!isProxyable(target)) {
            target = (typeof target === 'function') ? target : {};
          }
          if (!handler || typeof handler !== 'object') {
            handler = {};
          }
          return OrigProxy.revocable(target, handler);
        };
      }
      window.Proxy = SafeProxy;
    }
  } catch (e) {}

  // Telemetry, ad, and logging URLs that trigger net::ERR_BLOCKED_BY_CLIENT with adblockers and crash game engines
  function isBlockedTelemetry(u) {
    if (!u || typeof u !== 'string') return false;
    return (
      u.indexOf('play.google.com/log') !== -1 ||
      u.indexOf('google-analytics.com') !== -1 ||
      u.indexOf('analytics.google.com') !== -1 ||
      u.indexOf('stats.g.doubleclick.net') !== -1 ||
      u.indexOf('pagead2.googlesyndication.com') !== -1 ||
      u.indexOf('fundingchoicesmessages.google.com') !== -1 ||
      u.indexOf('firebaseinstallations.googleapis.com') !== -1 ||
      u.indexOf('firebaselogging-pa.googleapis.com') !== -1 ||
      u.indexOf('adservice.google.com') !== -1 ||
      u.indexOf('doubleclick.net') !== -1 ||
      u.indexOf('cdp.cloud.unity3d.com') !== -1 ||
      u.indexOf('segws.com') !== -1
    );
  }

  // Intercept fetch and XMLHttpRequest to fix relative URLs in blob documents, case-sensitivity, blob HEAD method errors (Cheese rolling / Unity split parts), and mock blocked telemetry
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init) {
      try {
        var urlStr = '';
        var isHeadMethod = false;

        if (init && init.method && typeof init.method === 'string' && init.method.toUpperCase() === 'HEAD') {
          isHeadMethod = true;
        }

        if (typeof input === 'string') {
          urlStr = input;
          // Resolve relative URLs in blob: documents so fetch('game.unx.part1') or fetch('/Build/web.data') works without throwing TypeError!
          if (urlStr.indexOf('://') === -1 && urlStr.indexOf('blob:') !== 0 && urlStr.indexOf('data:') !== 0) {
            var baseSlash = (typeof gameBaseHref === 'string' && gameBaseHref.endsWith('/')) ? gameBaseHref : (gameBaseHref + '/');
            var pathOnly = urlStr;
            while (pathOnly.indexOf('/') === 0) { pathOnly = pathOnly.substring(1); }
            urlStr = baseSlash + pathOnly;
            input = urlStr;
          }
          if (input.indexOf('Pokemon_Emerald.gba') !== -1) {
            input = input.replace('Pokemon_Emerald.gba', 'pokemon_emerald.gba');
          }
          if (input.indexOf('en-US.json') !== -1) {
            input = input.replace('en-US.json', 'en-us.json');
          }
        } else if (input && typeof input.url === 'string') {
          urlStr = input.url;
          if (input.method && typeof input.method === 'string' && input.method.toUpperCase() === 'HEAD') {
            isHeadMethod = true;
          }
          if (urlStr.indexOf('://') === -1 && urlStr.indexOf('blob:') !== 0 && urlStr.indexOf('data:') !== 0) {
            var baseSlash = (typeof gameBaseHref === 'string' && gameBaseHref.endsWith('/')) ? gameBaseHref : (gameBaseHref + '/');
            var pathOnly = urlStr;
            while (pathOnly.indexOf('/') === 0) { pathOnly = pathOnly.substring(1); }
            urlStr = baseSlash + pathOnly;
            input = urlStr;
          } else if (urlStr.indexOf('Pokemon_Emerald.gba') !== -1 || urlStr.indexOf('en-US.json') !== -1) {
            var newUrl = urlStr.replace('Pokemon_Emerald.gba', 'pokemon_emerald.gba').replace('en-US.json', 'en-us.json');
            input = new Request(newUrl, input);
          }
        }

        // Return instant clean 200 OK for blocked telemetry (play.google.com/log etc.) so game does not crash
        if (isBlockedTelemetry(urlStr)) {
          return Promise.resolve(new Response(JSON.stringify({ status: 'ok', success: true }), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
          }));
        }

        // Return clean 404 for unneeded executable files blocked with 403 on jsDelivr
        if (urlStr.indexOf('.exe') !== -1) {
          return Promise.resolve(new Response('File not found', {
            status: 404,
            statusText: 'Not Found',
            headers: { 'Content-Type': 'text/plain' }
          }));
        }

        // Fix Cheese rolling / Unity split parts: HEAD requests on blob: URLs trigger net::ERR_METHOD_NOT_SUPPORTED in Chromium.
        // Return synthetic 200 OK with content length headers if file exists in blobMap or is already a blob URL
        if (isHeadMethod && (urlStr.indexOf('blob:') === 0 || (blobMap && urlStr))) {
          var cleanUrl = urlStr.split('?')[0].split('#')[0];
          if (cleanUrl.indexOf(gameBaseHref) === 0) {
            cleanUrl = cleanUrl.substring(gameBaseHref.length);
          }
          if (cleanUrl.indexOf('/') === 0) {
            cleanUrl = cleanUrl.substring(1);
          }
          var baseName = cleanUrl.split('/').pop();
          var matchedBlob = (blobMap && (blobMap[cleanUrl] || (baseName ? blobMap[baseName] : null))) || (urlStr.indexOf('blob:') === 0 ? urlStr : null);
          if (matchedBlob) {
            return Promise.resolve(new Response(null, {
              status: 200,
              statusText: 'OK',
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': '20971520'
              }
            }));
          }
        }

        // Check if matching cached blob map for GET requests
        if (blobMap && urlStr) {
          var cleanUrl = urlStr.split('?')[0].split('#')[0];
          if (cleanUrl.indexOf(gameBaseHref) === 0) {
            cleanUrl = cleanUrl.substring(gameBaseHref.length);
          }
          if (cleanUrl.indexOf('/') === 0) {
            cleanUrl = cleanUrl.substring(1);
          }
          var baseName = cleanUrl.split('/').pop();
          var matchedBlob = blobMap[cleanUrl] || (baseName ? blobMap[baseName] : null);
          if (matchedBlob) {
            if (isHeadMethod) {
              return Promise.resolve(new Response(null, {
                status: 200,
                statusText: 'OK',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'Content-Length': '20971520'
                }
              }));
            }
            return origFetch.call(this, matchedBlob, init);
          }
        }
      } catch (e) {}

      return origFetch.call(this, input, init).catch(function(err) {
        var reqUrl = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';
        if (isBlockedTelemetry(reqUrl)) {
          return new Response(JSON.stringify({ status: 'ok', success: true }), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Fix countParts / loadAllParts in Unity and WebGL split loaders:
        // When checking for subsequent non-existent part files (e.g. part3), network failure / CORS throws TypeError: Failed to fetch.
        // Return a clean 404 Response so countParts can cleanly know the end of the split parts list and proceed without aborting!
        if (
          reqUrl.indexOf('.exe') !== -1 ||
          reqUrl.indexOf('.part') !== -1 ||
          reqUrl.indexOf('.data') !== -1 ||
          reqUrl.indexOf('.wasm') !== -1 ||
          reqUrl.indexOf('.unx') !== -1 ||
          reqUrl.indexOf('.unityweb') !== -1 ||
          reqUrl.indexOf('.bin') !== -1 ||
          reqUrl.indexOf('.json') !== -1 ||
          reqUrl.indexOf('.ico') !== -1 ||
          (err && (err.name === 'TypeError' || String(err).indexOf('Failed to fetch') !== -1 || String(err).indexOf('net::ERR_') !== -1))
        ) {
          if (reqUrl.indexOf('.exe') !== -1 || reqUrl.indexOf('.part') !== -1 || reqUrl.indexOf('favicon.ico') !== -1) {
            return new Response('File not found', {
              status: 404,
              statusText: 'Not Found',
              headers: { 'Content-Type': 'text/plain' }
            });
          }
        }

        throw err;
      });
    };
  }

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    try {
      this._requestMethod = (typeof method === 'string') ? method.toUpperCase() : 'GET';
      if (typeof url === 'string') {
        if (url.indexOf('://') === -1 && url.indexOf('blob:') !== 0 && url.indexOf('data:') !== 0) {
          var baseSlash = (typeof gameBaseHref === 'string' && gameBaseHref.endsWith('/')) ? gameBaseHref : (gameBaseHref + '/');
          var pathOnly = url;
          while (pathOnly.indexOf('/') === 0) { pathOnly = pathOnly.substring(1); }
          url = baseSlash + pathOnly;
        }
        if (url.indexOf('Pokemon_Emerald.gba') !== -1) {
          url = url.replace('Pokemon_Emerald.gba', 'pokemon_emerald.gba');
        }
        if (url.indexOf('en-US.json') !== -1) {
          url = url.replace('en-US.json', 'en-us.json');
        }
        if (blobMap) {
          var cleanUrl = url.split('?')[0].split('#')[0];
          if (cleanUrl.indexOf(gameBaseHref) === 0) {
            cleanUrl = cleanUrl.substring(gameBaseHref.length);
          }
          if (cleanUrl.indexOf('/') === 0) {
            cleanUrl = cleanUrl.substring(1);
          }
          var baseName = cleanUrl.split('/').pop();
          var matchedBlob = blobMap[cleanUrl] || (baseName ? blobMap[baseName] : null);
          if (matchedBlob) {
            url = matchedBlob;
          }
        }
        if (isBlockedTelemetry(url)) {
          this._isBlockedTelemetry = true;
        }
        // If HEAD request on blob URL, flag for synthetic XHR response
        if (this._requestMethod === 'HEAD' && (url.indexOf('blob:') === 0 || (blobMap && url))) {
          this._isBlobHeadRequest = true;
        }
      }
    } catch (e) {}
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this._isBlockedTelemetry || this._isBlobHeadRequest) {
      var self = this;
      var respContent = self._isBlobHeadRequest ? '' : '{"status":"ok"}';
      setTimeout(function() {
        try {
          Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(self, 'status', { value: 200, configurable: true });
          Object.defineProperty(self, 'statusText', { value: 'OK', configurable: true });
          Object.defineProperty(self, 'responseText', { value: respContent, configurable: true });
          Object.defineProperty(self, 'response', { value: respContent, configurable: true });
          if (typeof self.onreadystatechange === 'function') {
            self.onreadystatechange(new Event('readystatechange'));
          }
          if (typeof self.onload === 'function') {
            self.onload(new ProgressEvent('load'));
          }
          if (typeof self.onloadend === 'function') {
            self.onloadend(new ProgressEvent('loadend'));
          }
        } catch (err) {}
      }, 5);
      return;
    }
    return origSend.apply(this, arguments);
  };

  if (navigator && typeof navigator.sendBeacon === 'function') {
    var origSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function(url, data) {
      try {
        if (typeof url === 'string' && isBlockedTelemetry(url)) {
          return true;
        }
        return origSendBeacon.apply(this, arguments);
      } catch (e) {
        return true;
      }
    };
  }

  window.addEventListener('unhandledrejection', function(event) {
    try {
      var reason = event.reason;
      var msg = (reason && reason.message) ? reason.message : String(reason || '');
      if (
        msg.indexOf('ERR_BLOCKED_BY_CLIENT') !== -1 ||
        msg.indexOf('play.google.com') !== -1 ||
        msg.indexOf('Failed to fetch') !== -1
      ) {
        event.preventDefault();
      }
    } catch (e) {}
  });

  // 0.8 Safe History API: Disarm SecurityError: Failed to execute 'replaceState' on 'History' in blob: documents (e.g. Peak / Web Ports)
  try {
    function safeWrapHistory(proto, method) {
      var orig = proto[method];
      if (typeof orig === 'function') {
        proto[method] = function(state, title, url) {
          try {
            return orig.apply(this, arguments);
          } catch (err) {
            try {
              return orig.call(this, state, title);
            } catch (err2) {
              return null;
            }
          }
        };
      }
    }
    if (window.History && window.History.prototype) {
      safeWrapHistory(window.History.prototype, 'replaceState');
      safeWrapHistory(window.History.prototype, 'pushState');
    }
    if (window.history) {
      safeWrapHistory(window.history, 'replaceState');
      safeWrapHistory(window.history, 'pushState');
      try {
        var _origReplace = window.history.replaceState;
        window.history.replaceState = function() {
          try {
            return _origReplace.apply(this, arguments);
          } catch (e) {
            return null;
          }
        };
        var _origPush = window.history.pushState;
        window.history.pushState = function() {
          try {
            return _origPush.apply(this, arguments);
          } catch (e) {
            return null;
          }
        };
      } catch (e) {}
    }
  } catch (e) {}

  // 1. Fix Unity WebGL "Failed to construct 'URL': Invalid URL" error
  // Unity WebGL loaders do: new URL(c.streamingAssetsUrl, document.URL)
  // When running inside a blob: URL or srcdoc iframe, document.URL has scheme 'blob:', which native URL rejects as a base.
  var OriginalURL = window.URL;
  class PatchedURL extends OriginalURL {
    constructor(url, base) {
      var rawUrl = url;
      if (rawUrl && typeof rawUrl !== 'string' && rawUrl.href) {
        rawUrl = rawUrl.href;
      }
      var rawBase = base;
      if (rawBase && typeof rawBase !== 'string' && rawBase.href) {
        rawBase = rawBase.href;
      }
      if (!rawBase || (typeof rawBase === 'string' && (rawBase.indexOf('blob:') === 0 || rawBase.indexOf('about:') === 0))) {
        var baseElem = typeof document !== 'undefined' ? document.querySelector('base') : null;
        rawBase = (baseElem && baseElem.href) ? baseElem.href : gameBaseHref;
      }
      try {
        super(rawUrl, rawBase);
      } catch (err) {
        try {
          super(rawUrl, gameBaseHref);
        } catch (err2) {
          var safeBase = (typeof gameBaseHref === 'string' && gameBaseHref.endsWith('/')) ? gameBaseHref : (gameBaseHref + '/');
          var safeUrl = (typeof rawUrl === 'string') ? (rawUrl.indexOf('/') === 0 ? rawUrl.substring(1) : rawUrl) : '';
          try {
            super(safeBase + safeUrl);
          } catch (err3) {
            super(gameBaseHref);
          }
        }
      }
    }
  }
  try {
    PatchedURL.createObjectURL = function(b) { return OriginalURL.createObjectURL(b); };
    PatchedURL.revokeObjectURL = function(u) { return OriginalURL.revokeObjectURL(u); };
    if (typeof OriginalURL.canParse === 'function') {
      PatchedURL.canParse = function(u, b) { return OriginalURL.canParse(u, b); };
    }
    window.URL = PatchedURL;
    if (typeof window.webkitURL !== 'undefined') {
      window.webkitURL = PatchedURL;
    }
  } catch (e) {}

  try {
    Object.defineProperty(document, 'URL', {
      get: function() { return gameBaseHref; },
      configurable: true
    });
    Object.defineProperty(document, 'baseURI', {
      get: function() { return gameBaseHref; },
      configurable: true
    });
  } catch (e) {}

  // 1.4 Dynamic Script & Asset URL Interceptor for static hosts like Surge.sh
  // When games create script elements dynamically (e.g. Pizza Tower / GameMaker / Emscripten loaders doing s.src = 'index.js' or 'runner.js'),
  // prevent requests from going to root domain (which returns 200.html and throws SyntaxError: Unexpected token '<')
  try {
    function resolveSafeAssetUrl(val) {
      if (typeof val !== 'string' || !val) return val;
      if (val.indexOf('://') !== -1 || val.indexOf('blob:') === 0 || val.indexOf('data:') === 0) {
        return val;
      }
      var clean = val;
      while (clean.charAt(0) === '/') {
        clean = clean.substring(1);
      }
      clean = clean.split('?')[0].split('#')[0];
      var baseName = clean.split('/').pop();
      var targetBlob = (blobMap && (blobMap[clean] || (baseName ? blobMap[baseName] : null)));
      if (targetBlob) {
        return targetBlob;
      }
      var trailingBase = (typeof gameBaseHref === 'string' && gameBaseHref.endsWith('/')) ? gameBaseHref : (gameBaseHref + '/');
      return trailingBase + clean;
    }

    var scriptSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    if (scriptSrcDesc && scriptSrcDesc.set) {
      var origScriptSrcSet = scriptSrcDesc.set;
      Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        set: function(val) {
          var resolved = resolveSafeAssetUrl(val);
          return origScriptSrcSet.call(this, resolved);
        },
        get: scriptSrcDesc.get,
        configurable: true
      });
    }

    var origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, val) {
      if ((name === 'src' || name === 'href') && (this.tagName === 'SCRIPT' || this.tagName === 'LINK' || this.tagName === 'IMG')) {
        val = resolveSafeAssetUrl(val);
      }
      return origSetAttribute.call(this, name, val);
    };

    // Polyfill SharedArrayBuffer for static hosts (Surge.sh) without cross-origin isolation headers
    if (typeof window.SharedArrayBuffer === 'undefined' && typeof window.ArrayBuffer !== 'undefined') {
      window.SharedArrayBuffer = window.ArrayBuffer;
    }
  } catch (e) {}

  // 1.5 Fix Cross-Origin Web Workers (e.g. Eaglercraft worker_bootstrap.js from CDN)
  // Cross-origin script URLs passed to new Worker() trigger SecurityError in browsers.
  // We proxy Worker using a same-origin Blob with self.importScripts patched for relative imports.
  var OrigWorker = window.Worker;
  if (OrigWorker) {
    function PatchedWorker(scriptURL, options) {
      try {
        var resolvedUrl = scriptURL;
        if (typeof scriptURL === 'string') {
          try {
            resolvedUrl = new OriginalURL(scriptURL, gameBaseHref).href;
          } catch (e) {
            resolvedUrl = scriptURL;
          }
        }
        if (typeof resolvedUrl === 'string' && (resolvedUrl.indexOf('http://') === 0 || resolvedUrl.indexOf('https://') === 0)) {
          var workerBase = resolvedUrl.substring(0, resolvedUrl.lastIndexOf('/') + 1);
          var blobCode = [
            '(function() {',
            '  var _workerBase = ' + JSON.stringify(workerBase) + ';',
            '  var _origImportScripts = self.importScripts;',
            '  self.importScripts = function() {',
            '    var args = Array.prototype.slice.call(arguments).map(function(s) {',
            '      if (typeof s === "string" && s.indexOf("http://") !== 0 && s.indexOf("https://") !== 0 && s.indexOf("blob:") !== 0 && s.indexOf("data:") !== 0) {',
            '        return _workerBase + (s.charAt(0) === "/" ? s.slice(1) : s);',
            '      }',
            '      return s;',
            '    });',
            '    return _origImportScripts.apply(self, args);',
            '  };',
            '  _origImportScripts(' + JSON.stringify(resolvedUrl) + ');',
            '})();'
          ].join(String.fromCharCode(10));
          var blob = new Blob([blobCode], { type: 'application/javascript' });
          var blobUrl = OriginalURL.createObjectURL(blob);
          return new OrigWorker(blobUrl, options);
        }
      } catch (err) {
        console.warn('PatchedWorker error, falling back to original Worker:', err);
      }
      return new OrigWorker(scriptURL, options);
    }
    PatchedWorker.prototype = OrigWorker.prototype;
    window.Worker = PatchedWorker;
  }

  // 1.8 Prevent ChromeOS AudioContext hardware exhaustion crash (DOMException: The number of hardware contexts, 6, has been reached)
  try {
    var OrigAudioContext = window.AudioContext || window.webkitAudioContext;
    if (OrigAudioContext) {
      var _sharedAudioContext = null;
      var SafeAudioContext = function(options) {
        try {
          var ctx = new OrigAudioContext(options);
          _sharedAudioContext = ctx;
          return ctx;
        } catch (audioErr) {
          if (_sharedAudioContext && _sharedAudioContext.state !== 'closed') {
            return _sharedAudioContext;
          }
          throw audioErr;
        }
      };
      SafeAudioContext.prototype = OrigAudioContext.prototype;
      window.AudioContext = SafeAudioContext;
      if (window.webkitAudioContext) window.webkitAudioContext = SafeAudioContext;
    }
  } catch (e) {}

  // 1.9 Protect against WebAssembly out-of-memory crash & system freeze on low-RAM devices (Chromebooks)
  try {
    if (typeof WebAssembly !== 'undefined' && WebAssembly.Memory) {
      var OrigWasmMemory = WebAssembly.Memory;
      WebAssembly.Memory = function(descriptor) {
        descriptor = descriptor || {};
        var initPages = descriptor.initial || 256;
        var maxPages = descriptor.maximum;

        // Build safe descriptor without artificially forcing huge maxPages if undefined (which fails virtual address allocation on Chromebooks)
        var safeDescriptor = { initial: initPages };
        if (maxPages !== undefined && maxPages > 0) {
          safeDescriptor.maximum = Math.min(maxPages, 24576);
        }

        try {
          return new OrigWasmMemory(safeDescriptor);
        } catch (wasmErr) {
          // If browser refused allocation due to low memory (e.g. Chromebook 32-bit / 4GB), retry with conservative footprint
          var fallbackPages = Math.min(initPages, 2048);
          try {
            return new OrigWasmMemory({ initial: fallbackPages });
          } catch (e2) {
            try {
              return new OrigWasmMemory({ initial: 256 });
            } catch (e3) {
              throw wasmErr;
            }
          }
        }
      };
      WebAssembly.Memory.prototype = OrigWasmMemory.prototype;

      // Guard Memory.prototype.grow to gracefully handle memory allocation on low-RAM hardware
      var origGrow = OrigWasmMemory.prototype.grow;
      if (origGrow) {
        OrigWasmMemory.prototype.grow = function(extraPages) {
          try {
            return origGrow.call(this, extraPages);
          } catch (growErr) {
            console.warn('[MemoryGuard] Wasm grow allocation failure:', growErr);
            throw growErr;
          }
        };
      }
    }
  } catch (e) {}

  // 1.95 WebAssembly instantiateStreaming fallback for low-RAM & MIME mismatch
  try {
    if (typeof WebAssembly !== 'undefined' && WebAssembly.instantiateStreaming) {
      var origInstantiateStreaming = WebAssembly.instantiateStreaming;
      WebAssembly.instantiateStreaming = function(source, importObject) {
        return origInstantiateStreaming.call(WebAssembly, source, importObject).catch(function(err) {
          return Promise.resolve(source).then(function(res) {
            if (res && typeof res.arrayBuffer === 'function') return res.arrayBuffer();
            return res;
          }).then(function(buffer) {
            return WebAssembly.instantiate(buffer, importObject);
          });
        });
      };
    }
  } catch (e) {}

  // 1.10 AudioContext leak prevention (Closes abandoned contexts so audio buffers do not consume RAM)
  try {
    var OrigAudioCtx = window.AudioContext || window.webkitAudioContext;
    if (OrigAudioCtx) {
      var _activeAudioCtxs = [];
      var WrappedAudioCtx = function(opts) {
        while (_activeAudioCtxs.length >= 4) {
          var oldCtx = _activeAudioCtxs.shift();
          try { if (oldCtx && oldCtx.state !== 'closed') oldCtx.close(); } catch(e) {}
        }
        var ctx = new OrigAudioCtx(opts);
        _activeAudioCtxs.push(ctx);
        return ctx;
      };
      WrappedAudioCtx.prototype = OrigAudioCtx.prototype;
      window.AudioContext = WrappedAudioCtx;
      if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioCtx;
    }
  } catch (e) {}

  // 2. Suppress unhandled teardown exceptions (e.g. Eaglercraft onbeforeunload null pointer)
  window.addEventListener('beforeunload', function() {
    try { window.onbeforeunload = null; } catch(e) {}
    try { window.onunload = null; } catch(e) {}
  }, { capture: true });

  window.addEventListener('error', function(e) {
    var msg = (e && (e.message || (e.error && e.error.message))) || '';
    if (msg.indexOf("reading 'jm'") !== -1 || 
        msg.indexOf("reading 'stack'") !== -1 ||
        msg.indexOf('WebGL: INVALID_OPERATION') !== -1) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });

  // 3. Fix Navigator Keyboard layout & lock in iframes (Eaglercraft / TeaVM / Minecraft / Brave)
  // In Brave browser or restricted iframes, navigator.keyboard is set to null or restricted.
  // TeaVM tests: ('keyboard' in window.navigator && 'lock' in window.navigator.keyboard)
  // If window.navigator.keyboard is null, 'lock' in null throws TypeError: Cannot use 'in' operator to search for 'lock' in null.
  // TeaVM also calls getLayoutMap().then(...) without .catch(), halting LWJGL scancode setup.
  try {
    if (typeof navigator !== 'undefined') {
      var qwertyMap = {
        KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
        KeyQ: 'q', KeyE: 'e', KeyR: 'r', KeyT: 't', KeyY: 'y', KeyU: 'u', KeyI: 'i', KeyO: 'o', KeyP: 'p',
        KeyF: 'f', KeyG: 'g', KeyH: 'h', KeyJ: 'j', KeyK: 'k', KeyL: 'l', KeyZ: 'z', KeyX: 'x', KeyC: 'c',
        KeyV: 'v', KeyB: 'b', KeyN: 'n', KeyM: 'm',
        Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
        Space: ' ', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace'
      };

      function wrapLayoutMap(nativeMap) {
        return {
          get: function(k) {
            if (nativeMap && typeof nativeMap.get === 'function') {
              var val = nativeMap.get(k);
              if (typeof val === 'string' && val.length > 0) return val.toLowerCase();
            }
            if (qwertyMap[k]) return qwertyMap[k];
            if (typeof k === 'string' && k.indexOf('Key') === 0) return k.slice(3).toLowerCase();
            return undefined;
          },
          has: function(k) {
            if (nativeMap && typeof nativeMap.has === 'function' && nativeMap.has(k)) return true;
            return !!qwertyMap[k] || (typeof k === 'string' && k.indexOf('Key') === 0);
          },
          entries: function() { return (nativeMap && nativeMap.entries) ? nativeMap.entries() : new Map(Object.entries(qwertyMap)).entries(); },
          keys: function() { return (nativeMap && nativeMap.keys) ? nativeMap.keys() : new Map(Object.entries(qwertyMap)).keys(); },
          values: function() { return (nativeMap && nativeMap.values) ? nativeMap.values() : new Map(Object.entries(qwertyMap)).values(); },
          forEach: function(cb, thisArg) {
            if (nativeMap && typeof nativeMap.forEach === 'function') {
              nativeMap.forEach(cb, thisArg);
            } else {
              Object.keys(qwertyMap).forEach(function(k) { cb.call(thisArg, qwertyMap[k], k); });
            }
          },
          size: (nativeMap && nativeMap.size) || Object.keys(qwertyMap).length
        };
      }

      var existingKb = null;
      try { existingKb = navigator.keyboard; } catch(e) {}
      var safeKeyboard = (existingKb && typeof existingKb === 'object') ? existingKb : {};

      var origGetLayoutMap = (safeKeyboard && typeof safeKeyboard.getLayoutMap === 'function')
        ? safeKeyboard.getLayoutMap.bind(safeKeyboard)
        : null;

      safeKeyboard.getLayoutMap = function() {
        if (origGetLayoutMap) {
          try {
            var p = origGetLayoutMap();
            if (p && typeof p.then === 'function') {
              return p.then(function(res) {
                return wrapLayoutMap(res);
              }).catch(function(err) {
                return wrapLayoutMap(null);
              });
            }
          } catch (e) {}
        }
        return Promise.resolve(wrapLayoutMap(null));
      };

      var origLock = (safeKeyboard && typeof safeKeyboard.lock === 'function')
        ? safeKeyboard.lock.bind(safeKeyboard)
        : null;

      safeKeyboard.lock = function(keyCodes) {
        if (origLock) {
          try {
            var p = origLock.apply(safeKeyboard, arguments);
            if (p && typeof p.catch === 'function') {
              return p.catch(function() {});
            }
            return Promise.resolve();
          } catch (e) {
            return Promise.resolve();
          }
        }
        return Promise.resolve();
      };

      if (typeof safeKeyboard.unlock !== 'function') {
        safeKeyboard.unlock = function() {};
      }

      try {
        Object.defineProperty(navigator, 'keyboard', {
          get: function() { return safeKeyboard; },
          set: function() {},
          configurable: true,
          enumerable: true
        });
      } catch (e) {
        try { navigator['keyboard'] = safeKeyboard; } catch(e2) {}
      }

      if (typeof Navigator !== 'undefined' && Navigator.prototype) {
        try {
          Object.defineProperty(Navigator.prototype, 'keyboard', {
            get: function() { return safeKeyboard; },
            set: function() {},
            configurable: true,
            enumerable: true
          });
        } catch (e) {}
      }
    }
  } catch (e) {}

  // 3.5 Chromebook WASD keyboard event normalization
  // On ChromeOS, some physical keyboards report key: 'w' but code: '' or keyCode: 0.
  // We normalize keydown, keyup, and keypress so web game engines (LWJGL/TeaVM, Unity, HTML5) reliably detect W/A/S/D.
  function normalizeKeyboardEvent(e) {
    var k = e.key;
    var c = e.code;
    if ((k === 'w' || k === 'W' || e.keyCode === 87 || e.which === 87) && (!c || c === 'Unidentified')) {
      try { Object.defineProperty(e, 'code', { value: 'KeyW' }); } catch(err) {}
    } else if ((k === 'a' || k === 'A' || e.keyCode === 65 || e.which === 65) && (!c || c === 'Unidentified')) {
      try { Object.defineProperty(e, 'code', { value: 'KeyA' }); } catch(err) {}
    } else if ((k === 's' || k === 'S' || e.keyCode === 83 || e.which === 83) && (!c || c === 'Unidentified')) {
      try { Object.defineProperty(e, 'code', { value: 'KeyS' }); } catch(err) {}
    } else if ((k === 'd' || k === 'D' || e.keyCode === 68 || e.which === 68) && (!c || c === 'Unidentified')) {
      try { Object.defineProperty(e, 'code', { value: 'KeyD' }); } catch(err) {}
    }

    if (!e.keyCode || e.keyCode === 0) {
      var codeVal = 0;
      if (e.code === 'KeyW' || k === 'w' || k === 'W') codeVal = 87;
      else if (e.code === 'KeyA' || k === 'a' || k === 'A') codeVal = 65;
      else if (e.code === 'KeyS' || k === 's' || k === 'S') codeVal = 83;
      else if (e.code === 'KeyD' || k === 'd' || k === 'D') codeVal = 68;
      else if (k && k.length === 1) codeVal = k.toUpperCase().charCodeAt(0);

      if (codeVal > 0) {
        try { Object.defineProperty(e, 'keyCode', { value: codeVal }); } catch(err) {}
        try { Object.defineProperty(e, 'which', { value: codeVal }); } catch(err) {}
      }
    }

    // Intercept Ctrl+W / Cmd+W during gameplay to prevent browser tab closing when sprinting with Ctrl and moving with W
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyW' || k === 'w' || k === 'W' || e.keyCode === 87)) {
      if (e.type === 'keydown' && e.cancelable) {
        e.preventDefault();
      }
    }
  }

  window.addEventListener('keydown', normalizeKeyboardEvent, true);
  window.addEventListener('keyup', normalizeKeyboardEvent, true);
  window.addEventListener('keypress', normalizeKeyboardEvent, true);

  // 4. Fix Pointer Lock API in iframes (Eaglercraft / 3D web engines)
  // Prevents "Uncaught (in promise) WrongDocumentError: The root document of this element is not valid for pointer lock".
  // Ensures window and canvas receive focus before locking, and safely catches rejected promises.
  try {
    var origRequestPointerLock = Element.prototype.requestPointerLock;
    if (origRequestPointerLock) {
      Element.prototype.requestPointerLock = function() {
        try {
          window.focus();
          if (typeof this.focus === 'function') this.focus();
        } catch (e) {}
        try {
          var p = origRequestPointerLock.apply(this, arguments);
          if (p && typeof p.catch === 'function') {
            return p.catch(function(err) {
              console.warn('Pointer lock request in iframe safely handled:', err);
            });
          }
          return p;
        } catch (err) {
          console.warn('Pointer lock synchronous invocation error:', err);
          return Promise.resolve();
        }
      };
    }
  } catch (e) {}

  // 5. Auto-scaling canvas helper for clean zero-border layout and focusable inputs
  function fixFullscreenCanvases() {
    var unityContainers = document.querySelectorAll('#unity-container, .unity-desktop, .unity-mobile, #game-container, #gameContainer, .webgl-content');
    for (var j = 0; j < unityContainers.length; j++) {
      var uc = unityContainers[j];
      uc.style.setProperty('width', '100%', 'important');
      uc.style.setProperty('height', '100%', 'important');
      uc.style.setProperty('position', 'absolute', 'important');
      uc.style.setProperty('top', '0', 'important');
      uc.style.setProperty('left', '0', 'important');
      uc.style.setProperty('right', '0', 'important');
      uc.style.setProperty('bottom', '0', 'important');
      uc.style.setProperty('display', 'block', 'important');
      uc.style.setProperty('margin', '0 auto', 'important');
      uc.style.setProperty('padding', '0', 'important');
      uc.style.setProperty('background', '#000', 'important');
    }

    var canvases = document.querySelectorAll('canvas');
    for (var i = 0; i < canvases.length; i++) {
      var c = canvases[i];
      if (!c.getAttribute('tabindex')) {
        c.setAttribute('tabindex', '0');
      }
      c.style.setProperty('outline', 'none', 'important');
      c.style.setProperty('width', '100%', 'important');
      c.style.setProperty('height', '100%', 'important');
      c.style.setProperty('max-width', '100%', 'important');
      c.style.setProperty('max-height', '100%', 'important');
      c.style.setProperty('margin', '0 auto', 'important');
      c.style.setProperty('padding', '0', 'important');
      c.style.setProperty('display', 'block', 'important');
    }
  }

  // Performance Mode & FPS / Anti-Crash Engine (Zero Zoom, Stable Projection)
  var _origDPR = window.devicePixelRatio || 1;
  var _currentPerfMode = ${JSON.stringify(initialPerfMode)};

  // Detect Chromebook or low-resource hardware inside runtime
  var _isChromeOS = /cros|chromebook/i.test(navigator.userAgent) || (navigator.userAgentData && navigator.userAgentData.platform === 'Chrome OS');
  var _isLowMem = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  window.__LOWTEIR_PERF_MODE__ = _currentPerfMode;

  // A. Cap devicePixelRatio on high-DPI screens without breaking layout or camera projection
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      get: function() {
        if (_currentPerfMode === 'ultra-low') {
          return Math.max(0.5, Math.min(1.0, _origDPR) * 0.5);
        } else if (_currentPerfMode === 'low') {
          return Math.max(0.75, Math.min(1.0, _origDPR) * 0.75);
        } else if (_isChromeOS || _isLowMem || _currentPerfMode === 'chromebook') {
          return Math.min(1.0, _origDPR);
        }
        return _origDPR;
      },
      configurable: true
    });
  } catch (e) {}

  // B. Optimize WebGL Context creation: Safe attributes for Chromebooks, VRAM guarding, and crash prevention
  try {
    var origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        attrs = attrs || {};
        attrs.failIfMajorPerformanceCaveat = false;
        attrs.powerPreference = 'high-performance';
        // Disable antialias & preserveDrawingBuffer to save 50-70% WebGL VRAM and avoid GC pauses
        if (_isChromeOS || _isLowMem || _currentPerfMode !== 'auto') {
          attrs.preserveDrawingBuffer = false;
          attrs.desynchronized = false;
          attrs.antialias = false;
        }
        return origGetContext.call(this, type, attrs);
      }
      return origGetContext.call(this, type, attrs);
    };
  } catch (e) {}

  // C. Protect against WebGL Context Loss crash
  try {
    window.addEventListener('webglcontextlost', function(e) {
      if (e && e.preventDefault) e.preventDefault();
    }, true);
  } catch (e) {}

  // D. Live performance mode switching without canvas truncation or camera zooming
  function applyPerformanceTweaks(mode) {
    _currentPerfMode = mode;
    window.__LOWTEIR_PERF_MODE__ = _currentPerfMode;
    var isPixelated = mode === 'low' || mode === 'ultra-low';
    try {
      document.body.style.imageRendering = isPixelated ? 'pixelated' : 'auto';
      var canvases = document.querySelectorAll('canvas');
      for (var i = 0; i < canvases.length; i++) {
        var c = canvases[i];
        if (isPixelated) {
          c.style.setProperty('image-rendering', 'pixelated', 'important');
        } else {
          c.style.removeProperty('image-rendering');
        }
      }
    } catch (e) {}
    try {
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('resize'));
    } catch (e) {}
  }

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'LOWTEIR_PERF_MODE') {
      applyPerformanceTweaks(e.data.mode);
    }
  });

  window.addEventListener('mousedown', function(e) {
    try {
      window.focus();
      if (e.target && typeof e.target.focus === 'function') {
        e.target.focus();
      }
    } catch (err) {}
  }, true);

  window.addEventListener('click', function(e) {
    try {
      window.focus();
      if (e.target && typeof e.target.focus === 'function') {
        e.target.focus();
      }
    } catch (err) {}
  }, true);

  window.addEventListener('resize', fixFullscreenCanvases);
  window.addEventListener('DOMContentLoaded', fixFullscreenCanvases);
  window.addEventListener('load', function() {
    fixFullscreenCanvases();
    setTimeout(fixFullscreenCanvases, 200);
    setTimeout(fixFullscreenCanvases, 800);
    setTimeout(fixFullscreenCanvases, 2000);
  });
})();
</script>
`;

  const isolationCSS = getRuntimeIsolationCSS(allowScroll);
  const fullInjection = `
  ${importMapScript}
  <style id="clean-runtime-scrollbar">${isolationCSS}</style>
  ${runtimeScript}
`;

  // Inject base tag and runtime harness at the very beginning of <head> using a replacer function to avoid $ interpolation corruption
  const baseTag = `<base href="${absoluteBaseHref}">`;
  if (/<base\s+[^>]*>/i.test(finalHtml)) {
    finalHtml = finalHtml.replace(/<base\s+[^>]*>/gi, () => baseTag);
  }

  if (/<head[^>]*>/i.test(finalHtml)) {
    finalHtml = finalHtml.replace(/<head[^>]*>/i, (match) => `${match}\n  ${baseTag}\n  ${fullInjection}`);
  } else {
    finalHtml = `${baseTag}\n${fullInjection}\n${finalHtml}`;
  }

  return finalHtml;
}

export const GamePlayer: React.FC<GamePlayerProps> = ({ meta, onBack }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [keySeed, setKeySeed] = useState(1);
  const [frameSrc, setFrameSrc] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>(() => {
    try {
      const key = `lowteir_aspect_${meta.id || meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const saved = localStorage.getItem(key);
      if (saved && (saved === 'fill' || saved === '9:16' || saved === '16:9' || saved === '4:3')) {
        return saved as AspectRatioMode;
      }
    } catch (e) {}

    // Auto-detect mobile portrait games (Bitlife, etc.) so they don't stretch or zoom in
    const lowerName = (meta.name || '').toLowerCase();
    const lowerId = (meta.id || '').toLowerCase();
    if (lowerName.includes('bitlife') || lowerId.includes('bitlife')) {
      return '9:16';
    }

    return 'fill';
  });
  const [showAspectMenu, setShowAspectMenu] = useState(false);

  // Performance Mode State (Auto, Low Performance, Ultra Low Performance, Chromebook Safe)
  const isChromebookDetected = typeof navigator !== 'undefined' && (
    /cros|chromebook/i.test(navigator.userAgent) ||
    (navigator as any).userAgentData?.platform === 'Chrome OS'
  );

  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(() => {
    try {
      const key = `lowteir_perf_${meta.id || meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const saved = localStorage.getItem(key);
      if (saved && (saved === 'auto' || saved === 'chromebook' || saved === 'low' || saved === 'ultra-low')) {
        return saved as PerformanceMode;
      }
    } catch (e) {}

    // Auto is the universal default preset. Every mode is an option & user preference
    return 'auto';
  });
  const [showPerformanceMenu, setShowPerformanceMenu] = useState(false);
  const [hudToast, setHudToast] = useState<string | null>(null);
  const hudToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll toggle state: Persisted per game, allows vertical/horizontal scrolling if game UI overflows
  const [allowScroll, setAllowScroll] = useState<boolean>(() => {
    try {
      const key = `lowteir_scroll_${meta.id || meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      return localStorage.getItem(key) === 'true';
    } catch (e) {
      return false;
    }
  });

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight - 44 : 720,
  });

  const blobUrlRef = useRef<string | null>(null);
  const createdBlobUrlsRef = useRef<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const aspectMenuRef = useRef<HTMLDivElement>(null);
  const performanceMenuRef = useRef<HTMLDivElement>(null);

  const triggerHudToast = (message: string) => {
    if (hudToastTimeoutRef.current) clearTimeout(hudToastTimeoutRef.current);
    setHudToast(message);
    hudToastTimeoutRef.current = setTimeout(() => {
      setHudToast(null);
    }, 2400);
  };

  const updateIframeScroll = (enabled: boolean) => {
    try {
      if (iframeRef.current?.contentDocument) {
        const doc = iframeRef.current.contentDocument;
        doc.documentElement.style.setProperty('overflow', enabled ? 'auto' : 'hidden', 'important');
        doc.body.style.setProperty('overflow', enabled ? 'auto' : 'hidden', 'important');
        doc.documentElement.style.setProperty('height', enabled ? 'auto' : '100%', 'important');
        doc.body.style.setProperty('height', enabled ? 'auto' : '100%', 'important');
        doc.documentElement.style.setProperty('scrollbar-width', enabled ? 'thin' : 'none', 'important');
        doc.body.style.setProperty('scrollbar-width', enabled ? 'thin' : 'none', 'important');

        let styleTag = doc.getElementById('clean-runtime-scrollbar') as HTMLStyleElement | null;
        if (styleTag) {
          styleTag.textContent = getRuntimeIsolationCSS(enabled);
        } else {
          const newStyle = doc.createElement('style');
          newStyle.id = 'clean-runtime-scrollbar';
          newStyle.textContent = getRuntimeIsolationCSS(enabled);
          doc.head.appendChild(newStyle);
        }
      }
    } catch (e) {}
  };

  const toggleScroll = () => {
    const next = !allowScroll;
    setAllowScroll(next);
    try {
      const key = `lowteir_scroll_${meta.id || meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      localStorage.setItem(key, String(next));
    } catch (e) {}

    triggerHudToast(next ? 'Scrolling: ON' : 'Scrolling: OFF');
    updateIframeScroll(next);
  };

  // Keep iframe document scrolling styles synced whenever allowScroll changes
  useEffect(() => {
    updateIframeScroll(allowScroll);
  }, [allowScroll]);

  // Helper to ensure canvas inside iframe stretches fully without letterbox borders
  const syncIframeCanvas = () => {
    try {
      if (iframeRef.current?.contentDocument) {
        const doc = iframeRef.current.contentDocument;
        const canvases = doc.querySelectorAll('canvas');
        canvases.forEach((c) => {
          c.style.setProperty('width', '100%', 'important');
          c.style.setProperty('height', '100%', 'important');
          c.style.setProperty('max-width', '100%', 'important');
          c.style.setProperty('max-height', '100%', 'important');
          c.style.setProperty('object-fit', 'fill', 'important');
          c.style.setProperty('margin', '0', 'important');
          c.style.setProperty('padding', '0', 'important');
        });
      }
    } catch (e) {}
  };

  const handleSelectAspectRatio = (mode: AspectRatioMode) => {
    setAspectRatio(mode);
    setShowAspectMenu(false);
    try {
      const key = `lowteir_aspect_${meta.id || meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      localStorage.setItem(key, mode);
    } catch (e) {}

    const label =
      mode === 'fill'
        ? 'Fill Screen (Stretch - No Black Borders)'
        : mode === '16:9'
        ? 'Widescreen (16:9)'
        : mode === '4:3'
        ? 'Classic (4:3)'
        : 'Mobile (9:16)';
    triggerHudToast(`Screen: ${label}`);

    setTimeout(() => {
      syncIframeCanvas();
      window.dispatchEvent(new Event('resize'));
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.dispatchEvent(new Event('resize'));
          iframeRef.current.contentDocument?.dispatchEvent(new Event('resize'));
        } catch (e) {}
      }
    }, 60);
  };

  const syncIframePerformance = (mode: PerformanceMode) => {
    try {
      if (iframeRef.current?.contentDocument) {
        const doc = iframeRef.current.contentDocument;
        const isPixelated = mode === 'low' || mode === 'ultra-low';
        doc.body.style.setProperty('image-rendering', isPixelated ? 'pixelated' : 'auto', 'important');
        const canvases = doc.querySelectorAll('canvas');
        canvases.forEach((c) => {
          c.style.setProperty('image-rendering', isPixelated ? 'pixelated' : 'auto', 'important');
        });
      }
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'LOWTEIR_PERF_MODE', mode }, '*');
      }
    } catch (e) {}
  };

  const handleSelectPerformance = (mode: PerformanceMode) => {
    setPerformanceMode(mode);
    setShowPerformanceMenu(false);
    const preset = PERFORMANCE_PRESETS.find((p) => p.id === mode) || PERFORMANCE_PRESETS[0];

    try {
      const key = `lowteir_perf_${meta.id || meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      localStorage.setItem(key, mode);
    } catch (e) {}

    triggerHudToast(`Performance: ${preset.label} (${preset.sub})`);

    setTimeout(() => {
      syncIframeCanvas();
      syncIframePerformance(mode);
      window.dispatchEvent(new Event('resize'));
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.dispatchEvent(new Event('resize'));
          iframeRef.current.contentDocument?.dispatchEvent(new Event('resize'));
        } catch (e) {}
      }
    }, 60);
  };

  const cyclePerformance = () => {
    const currentIndex = PERFORMANCE_PRESETS.findIndex((p) => p.id === performanceMode);
    const nextIndex = (currentIndex + 1) % PERFORMANCE_PRESETS.length;
    handleSelectPerformance(PERFORMANCE_PRESETS[nextIndex].id);
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showAspectMenu &&
        aspectMenuRef.current &&
        !aspectMenuRef.current.contains(e.target as Node)
      ) {
        setShowAspectMenu(false);
      }
      if (
        showPerformanceMenu &&
        performanceMenuRef.current &&
        !performanceMenuRef.current.contains(e.target as Node)
      ) {
        setShowPerformanceMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAspectMenu, showPerformanceMenu]);

  // Track main stage container dimensions for pixel-perfect aspect ratio and resolution calculations
  useEffect(() => {
    if (!stageRef.current) return;
    const updateSize = () => {
      if (stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setStageSize({ width: rect.width, height: rect.height });
        }
      }
    };
    updateSize();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setStageSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(stageRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [isFullscreen]);

  // Compute exact pixel bounding box for the active aspect ratio mode
  const getBoxDimensions = () => {
    const availW = stageSize.width || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const availH = stageSize.height || (typeof window !== 'undefined' ? window.innerHeight - 44 : 720);

    if (aspectRatio === 'fill') {
      return { width: availW, height: availH };
    }

    let targetRatio = 16 / 9;
    if (aspectRatio === '4:3') targetRatio = 4 / 3;
    if (aspectRatio === '9:16') targetRatio = 9 / 16;

    const currentRatio = availW / availH;
    if (currentRatio > targetRatio) {
      const height = availH;
      const width = Math.round(availH * targetRatio);
      return { width, height };
    } else {
      const width = availW;
      const height = Math.round(availW / targetRatio);
      return { width, height };
    }
  };

  // Load and prepare game HTML client-side (no backend required, works on Surge.sh)
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    async function loadGame() {
      const parsed = parseGitHubRepoUrl(meta.repo, meta.entryPoint);
      const owner = parsed.owner;
      const repo = parsed.repo;
      const branch = parsed.branch || 'main';
      const entry = parsed.entryPoint || 'index.html';
      const baseHref = parsed.baseHref;

      let rawHtml = '';
      const blobUrlMap: Record<string, string> = {};
      const activeBlobUrls: string[] = [];

      // 1. Try local cache from IndexedDB if downloaded
      try {
        const { getGameFiles } = await import('../utils/cacheManager');
        const cachedFiles = await getGameFiles(meta.id);
        if (cachedFiles && cachedFiles.size > 0) {
          if (cachedFiles.has(entry)) {
            const fileData = cachedFiles.get(entry);
            if (fileData) {
              rawHtml = await fileData.blob.text();
            }
          } else if (parsed.subPath && entry.startsWith(parsed.subPath + '/')) {
            const trimmed = entry.substring(parsed.subPath.length + 1);
            if (cachedFiles.has(trimmed)) {
              const fileData = cachedFiles.get(trimmed);
              if (fileData) {
                rawHtml = await fileData.blob.text();
              }
            }
          } else {
            // Check common entry files: main.html, index.html, game.html, etc.
            const fallbacks = ['main.html', 'index.html', 'game.html', 'play.html', 'app.html'];
            for (const fb of fallbacks) {
              if (cachedFiles.has(fb)) {
                const fileData = cachedFiles.get(fb);
                if (fileData) {
                  rawHtml = await fileData.blob.text();
                  break;
                }
              }
            }
            if (!rawHtml) {
              // Any html file in cached files
              for (const [k, v] of cachedFiles.entries()) {
                if (k.toLowerCase().endsWith('.html') && !k.toLowerCase().includes('readme')) {
                  rawHtml = await v.blob.text();
                  break;
                }
              }
            }
          }

          // Generate direct Blob URLs for all cached files so game runs entirely from cache
          for (const [filePath, fileData] of cachedFiles.entries()) {
            const bUrl = URL.createObjectURL(fileData.blob);
            blobUrlMap[filePath] = bUrl;
            activeBlobUrls.push(bUrl);

            const baseName = filePath.split('/').pop();
            if (baseName && !blobUrlMap[baseName]) {
              blobUrlMap[baseName] = bUrl;
            }
            if (parsed.subPath && filePath.startsWith(parsed.subPath + '/')) {
              const stripped = filePath.substring(parsed.subPath.length + 1);
              blobUrlMap[stripped] = bUrl;
            }
          }
          // Free JS heap references to cachedFiles Map before game runtime initializes
          cachedFiles.clear();
        }
      } catch (e) {
        // Continue to network fetch
      }

      // Cleanup prior blob URLs and register new ones
      createdBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      createdBlobUrlsRef.current = activeBlobUrls;

      // 2. Fetch directly from jsDelivr / GitHub (static friendly, CORS enabled) with backend proxy fallback
      if (!rawHtml) {
        const isBlockedCdn = owner.toLowerCase() === 'genizy';
        const isWeblatro = repo.toLowerCase().includes('weblatro') || repo.toLowerCase().includes('balatro');
        
        // Priority list of entry filenames to try
        const entryList: string[] = isWeblatro
          ? Array.from(new Set(['main.html', entry, 'index.html', 'game.html'])).filter(Boolean)
          : Array.from(new Set([entry, 'main.html', 'index.html', 'game.html', 'play.html'])).filter(Boolean);

        const candidates: string[] = [];

        for (const candidateEntry of entryList) {
          if (isBlockedCdn) {
            candidates.push(
              `/api/game-runtime/${owner}/${repo}/${candidateEntry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${candidateEntry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/main/${candidateEntry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/master/${candidateEntry}`
            );
          } else {
            candidates.push(
              `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${candidateEntry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${candidateEntry}`,
              `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/${candidateEntry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/main/${candidateEntry}`,
              `https://cdn.jsdelivr.net/gh/${owner}/${repo}@master/${candidateEntry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/master/${candidateEntry}`,
              `/api/game-runtime/${owner}/${repo}/${candidateEntry}`
            );
          }
        }

        // Additional known subpath fallbacks for eaglercraft
        if (repo.toLowerCase().includes('eaglercraft')) {
          candidates.push(
            `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/EaglercraftX_1.8_Offline_en_US.html`,
            `https://raw.githubusercontent.com/${owner}/${repo}/main/EaglercraftX_1.8_Offline_en_US.html`,
            `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/clients/1.8/eaglercraftx.html`,
            `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/clients/1.8/eaglercraftx.html`,
            `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/clients/1.8/eaglercraftx.html`,
            `https://raw.githubusercontent.com/${owner}/${repo}/main/clients/1.8/eaglercraftx.html`,
            `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/stable-download/web/index.html`,
            `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/stable-download/web/index.html`,
            `/api/game-runtime/${owner}/${repo}/EaglercraftX_1.8_Offline_en_US.html`,
            `/api/game-runtime/${owner}/${repo}/clients/1.8/eaglercraftx.html`
          );
        }

        for (const url of candidates) {
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              const text = await resp.text();
              if (text && text.trim().length > 0) {
                rawHtml = text;
                break;
              }
            }
          } catch (err) {
            // try next candidate
          }
        }
      }

      if (isCancelled) return;

      if (!rawHtml) {
        rawHtml = `<!DOCTYPE html><html><head><style>body{background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;text-align:center;}.icon{font-size:36px;margin-bottom:12px;}h2{margin:0 0 8px 0;font-size:18px;font-weight:600;color:#fff;}p{margin:0 0 16px 0;font-size:13px;color:#888;max-width:400px;line-height:1.5;}.btn{background:#262626;border:1px solid #404040;color:#fff;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;}.btn:hover{background:#333;}</style></head><body><div class="icon">🎮</div><h2>Unable to load game</h2><p>Could not connect to the game repository for <strong>${meta.name}</strong>. Please check your connection or retry.</p><button class="btn" onclick="location.reload()">Retry Connection</button></body></html>`;
      }

      // Process HTML with baseHref, URL constructor patch, runtime scrollbar styling, and blobUrlMap
      const finalHtml = buildGameRuntimeHTML(rawHtml, baseHref, allowScroll, performanceMode, blobUrlMap);

      // Create blob URL for the iframe
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const blob = new Blob([finalHtml], { type: 'text/html; charset=utf-8' });
      const newUrl = URL.createObjectURL(blob);
      blobUrlRef.current = newUrl;

      setFrameSrc(newUrl);
    }

    loadGame();

    return () => {
      isCancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      createdBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      createdBlobUrlsRef.current = [];
    };
  }, [meta.repo, meta.entryPoint, meta.id, keySeed]);

  // Clean exit: stops all game execution, blanks iframe, exits fullscreen, and frees audio/worker/webgl contexts
  const exitGame = () => {
    if (document.fullscreenElement) {
      try {
        document.exitFullscreen();
      } catch (e) {}
    }
    if (iframeRef.current) {
      try {
        // Disarm unload events inside iframe to avoid null pointer exceptions in game engines
        if (iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.onbeforeunload = null;
          iframeRef.current.contentWindow.onunload = null;
        }
        // Force-lose all WebGL/WebGL2 contexts to immediately dump textures & VRAM buffers
        const doc = iframeRef.current.contentDocument;
        if (doc) {
          const canvases = doc.querySelectorAll('canvas');
          canvases.forEach((c) => {
            const gl = c.getContext('webgl2') || c.getContext('webgl');
            if (gl) {
              const ext = gl.getExtension('WEBGL_lose_context');
              if (ext) ext.loseContext();
            }
          });
        }
      } catch (e) {}
      try {
        iframeRef.current.src = 'about:blank';
      } catch (e) {}
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    createdBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    createdBlobUrlsRef.current = [];

    // Free in-memory cached files for this session
    import('../utils/cacheManager').then(({ clearMemoryGameFiles }) => {
      clearMemoryGameFiles(meta.id);
    }).catch(() => {});

    onBack();
  };

  // Prevent background scrolling while game player is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (iframeRef.current) {
        try {
          if (iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.onbeforeunload = null;
            iframeRef.current.contentWindow.onunload = null;
          }
          const doc = iframeRef.current.contentDocument;
          if (doc) {
            const canvases = doc.querySelectorAll('canvas');
            canvases.forEach((c) => {
              const gl = c.getContext('webgl2') || c.getContext('webgl');
              if (gl) {
                const ext = gl.getExtension('WEBGL_lose_context');
                if (ext) ext.loseContext();
              }
            });
          }
          iframeRef.current.src = 'about:blank';
        } catch (e) {}
      }
      createdBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      createdBlobUrlsRef.current = [];

      import('../utils/cacheManager').then(({ clearMemoryGameFiles }) => {
        clearMemoryGameFiles(meta.id);
      }).catch(() => {});
    };
  }, [meta.id]);

  // Keyboard handling: Escape exits fullscreen, and forward keystrokes to iframe if focus is on outer container
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          setIsFullscreen(false);
          return;
        }
      }

      // If active element is an input or textarea, let it handle standard typing
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

      // Prevent Ctrl+W / Cmd+W from closing tab during gameplay (e.g. Minecraft sprint + move forward)
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyW' || e.key === 'w' || e.key === 'W' || e.keyCode === 87)) {
        e.preventDefault();
      }

      // If iframe does not currently have active focus, forward the keydown event to the game window
      if (document.activeElement !== iframeRef.current && iframeRef.current?.contentWindow) {
        try {
          const k = e.key;
          const code = e.code || (k === 'w' || k === 'W' ? 'KeyW' : (k === 'a' || k === 'A' ? 'KeyA' : (k === 's' || k === 'S' ? 'KeyS' : (k === 'd' || k === 'D' ? 'KeyD' : ''))));
          const keyCode = e.keyCode || (code === 'KeyW' ? 87 : (code === 'KeyA' ? 65 : (code === 'KeyS' ? 83 : (code === 'KeyD' ? 68 : (k && k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0)))));

          const eventInit: KeyboardEventInit = {
            key: e.key,
            code: code,
            keyCode: keyCode,
            which: keyCode,
            location: e.location,
            repeat: e.repeat,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            bubbles: true,
            cancelable: true,
          };
          const keyEv = new KeyboardEvent('keydown', eventInit);
          try { Object.defineProperty(keyEv, 'keyCode', { value: keyCode }); } catch(err) {}
          try { Object.defineProperty(keyEv, 'which', { value: keyCode }); } catch(err) {}
          try { Object.defineProperty(keyEv, 'code', { value: code }); } catch(err) {}
          iframeRef.current.contentWindow.dispatchEvent(keyEv);

          // Also dispatch keypress for printable characters so text input in games works seamlessly
          if (k && k.length === 1 && !e.ctrlKey && !e.metaKey) {
            const charCode = e.charCode || k.charCodeAt(0);
            const pressEv = new KeyboardEvent('keypress', {
              key: k,
              code: code,
              bubbles: true,
              cancelable: true,
              repeat: e.repeat,
            });
            try { Object.defineProperty(pressEv, 'keyCode', { value: charCode }); } catch(err) {}
            try { Object.defineProperty(pressEv, 'which', { value: charCode }); } catch(err) {}
            try { Object.defineProperty(pressEv, 'charCode', { value: charCode }); } catch(err) {}
            iframeRef.current.contentWindow.dispatchEvent(pressEv);
          }
        } catch (err) {}
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

      if (document.activeElement !== iframeRef.current && iframeRef.current?.contentWindow) {
        try {
          const k = e.key;
          const code = e.code || (k === 'w' || k === 'W' ? 'KeyW' : (k === 'a' || k === 'A' ? 'KeyA' : (k === 's' || k === 'S' ? 'KeyS' : (k === 'd' || k === 'D' ? 'KeyD' : ''))));
          const keyCode = e.keyCode || (code === 'KeyW' ? 87 : (code === 'KeyA' ? 65 : (code === 'KeyS' ? 83 : (code === 'KeyD' ? 68 : (k && k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0)))));

          const eventInit: KeyboardEventInit = {
            key: e.key,
            code: code,
            keyCode: keyCode,
            which: keyCode,
            location: e.location,
            repeat: e.repeat,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            bubbles: true,
            cancelable: true,
          };
          const keyEv = new KeyboardEvent('keyup', eventInit);
          try { Object.defineProperty(keyEv, 'keyCode', { value: keyCode }); } catch(err) {}
          try { Object.defineProperty(keyEv, 'which', { value: keyCode }); } catch(err) {}
          try { Object.defineProperty(keyEv, 'code', { value: code }); } catch(err) {}
          iframeRef.current.contentWindow.dispatchEvent(keyEv);
        } catch (err) {}
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [isFullscreen]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Broadcast resize to canvas and engine on fullscreen transition
  useEffect(() => {
    const triggerResize = () => {
      window.dispatchEvent(new Event('resize'));
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.dispatchEvent(new Event('resize'));
        } catch (e) {}
      }
    };

    triggerResize();
    const t1 = setTimeout(triggerResize, 100);
    const t2 = setTimeout(triggerResize, 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isFullscreen]);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isCurrentlyFullscreen) {
        const elem: any = containerRef.current;
        const requestMethod =
          elem.requestFullscreen ||
          elem.webkitRequestFullscreen ||
          elem.mozRequestFullScreen ||
          elem.msRequestFullscreen;

        if (requestMethod) {
          await requestMethod.call(elem);
          setIsFullscreen(true);
        } else {
          setIsFullscreen(true);
        }
      } else {
        const exitMethod: any =
          document.exitFullscreen ||
          (document as any).webkitExitFullscreen ||
          (document as any).mozCancelFullScreen ||
          (document as any).msExitFullscreen;

        if (exitMethod) {
          await exitMethod.call(document);
          setIsFullscreen(false);
        } else {
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn('Native fullscreen request blocked, using viewport theater mode:', err);
      setIsFullscreen((prev) => !prev);
    }
  };

  const reloadGame = () => {
    setIsLoading(true);
    setKeySeed((k) => k + 1);
  };

  return (
    <div
      ref={containerRef}
      id="game-player-stage"
      className={`bg-black flex flex-col overflow-hidden select-none transition-all duration-150 ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] w-screen h-screen'
          : 'fixed inset-0 z-50 w-full h-full'
      }`}
    >
      {/* Top Controls Bar - Hidden whenever in Fullscreen */}
      {!isFullscreen && (
        <header
          id="player-top-bar"
          className="h-11 bg-black border-b border-[#222222] px-3 sm:px-5 flex items-center justify-between z-40 shrink-0 select-none"
        >
          {/* Left: Exit & Title & Mobile badge */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="player-back-to-library-btn"
              onClick={exitGame}
              className="px-2.5 py-1 bg-[#141414] hover:bg-[#222222] text-[#cccccc] hover:text-white border border-[#2a2a2a] rounded text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Exit game and return to library"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-semibold text-white tracking-wide truncate max-w-[160px] sm:max-w-xs md:max-w-md">
                {meta.name}
              </h2>
            </div>
          </div>

          {/* Right: Aspect Ratio Selector, Resolution Switcher (16:9 only), Quick Tools & Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Aspect Ratio Switcher */}
            <div className="relative" ref={aspectMenuRef}>
              <button
                id="player-aspect-ratio-btn"
                onClick={() => setShowAspectMenu((prev) => !prev)}
                className="px-2.5 py-1 text-xs font-medium border border-[#2a2a2a] rounded transition-colors flex items-center gap-1.5 cursor-pointer bg-[#141414] hover:bg-[#222222] text-[#cccccc] hover:text-white"
                title="Change Screen Aspect Ratio (Fill / Mobile 9:16 / Widescreen 16:9 / Classic 4:3)"
              >
                {aspectRatio === '9:16' ? (
                  <Smartphone className="w-3.5 h-3.5 text-[#aaaaaa]" />
                ) : aspectRatio === '16:9' ? (
                  <Monitor className="w-3.5 h-3.5 text-[#aaaaaa]" />
                ) : aspectRatio === '4:3' ? (
                  <Tv className="w-3.5 h-3.5 text-[#aaaaaa]" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 text-[#aaaaaa]" />
                )}
                <span className="hidden sm:inline">
                  {aspectRatio === '9:16' ? 'Mobile (9:16)' : aspectRatio === '16:9' ? '16:9' : aspectRatio === '4:3' ? '4:3' : 'Fill'}
                </span>
              </button>

              {showAspectMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#141414] border border-[#262626] rounded-lg shadow-2xl overflow-hidden z-50 select-none py-1">
                  <div className="px-3.5 py-2 border-b border-[#222222] text-[11px] font-semibold text-[#666666] tracking-wider uppercase">
                    Aspect Ratio
                  </div>
                  {[
                    { id: 'fill', label: 'Fill Screen', desc: 'Stretch to window (Default)', icon: Maximize2 },
                    { id: '9:16', label: 'Mobile (9:16)', desc: 'Phone portrait (BitLife)', icon: Smartphone },
                    { id: '16:9', label: 'Widescreen (16:9)', desc: 'Standard widescreen display', icon: Monitor },
                    { id: '4:3', label: 'Classic (4:3)', desc: 'Retro games & classic arcade', icon: Tv },
                  ].map((mode) => {
                    const IconComponent = mode.icon;
                    const isSelected = aspectRatio === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => handleSelectAspectRatio(mode.id as AspectRatioMode)}
                        className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#202020]' : 'hover:bg-[#1a1a1a]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <IconComponent className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-[#888888]'}`} />
                          <div>
                            <div className="text-[13px] font-medium text-white leading-tight">{mode.label}</div>
                            <div className="text-[11px] text-[#666666] leading-tight mt-0.5">{mode.desc}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Performance Options Switcher - ALWAYS next to Aspect Ratio button */}
            <div className="relative" ref={performanceMenuRef}>
              <button
                id="player-performance-btn"
                onClick={() => setShowPerformanceMenu((prev) => !prev)}
                className="px-2.5 py-1 text-xs font-medium border border-[#2a2a2a] rounded transition-colors flex items-center gap-1.5 cursor-pointer bg-[#141414] hover:bg-[#222222] text-[#cccccc] hover:text-white"
                title="Performance Options (Auto, Chromebook Safe, Low Performance, Ultra Low Performance)"
              >
                <Gauge className="w-3.5 h-3.5 text-[#aaaaaa]" />
                <span className="text-[#777777]">Perf:</span>
                <span className="font-medium text-white">{PERFORMANCE_PRESETS.find((p) => p.id === performanceMode)?.label || 'Auto'}</span>
              </button>

              {showPerformanceMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#141414] border border-[#262626] rounded-lg shadow-2xl overflow-hidden z-50 select-none py-1">
                  <div className="px-3.5 py-2 border-b border-[#222222] text-[11px] font-semibold text-[#666666] tracking-wider uppercase">
                    Performance
                  </div>
                  {[
                    { id: 'auto', label: 'Auto', desc: 'Adaptive quality (Device auto-tuned)', icon: Gauge },
                    { id: 'chromebook', label: 'Chromebook Safe', desc: 'Anti-crash protection (VRAM guarded, 60 FPS lock)', icon: ShieldCheck },
                    { id: 'low', label: 'Low Performance', desc: 'Balanced FPS boost (Smooth high performance)', icon: Zap },
                    { id: 'ultra-low', label: 'Ultra Low Performance', desc: 'Maximum FPS boost (Optimized for low-end devices)', icon: Flame },
                  ].map((preset) => {
                    const IconComponent = preset.icon;
                    const isSelected = performanceMode === preset.id;
                    return (
                      <button
                        key={preset.id}
                        id={`player-performance-opt-${preset.id}`}
                        onClick={() => handleSelectPerformance(preset.id as PerformanceMode)}
                        className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#202020]' : 'hover:bg-[#1a1a1a]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <IconComponent className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-[#888888]'}`} />
                          <div>
                            <div className="text-[13px] font-medium text-white leading-tight">{preset.label}</div>
                            <div className="text-[11px] text-[#666666] leading-tight mt-0.5">{preset.desc}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              id="player-reload-btn"
              onClick={reloadGame}
              className="p-1.5 bg-[#141414] hover:bg-[#222222] text-[#aaaaaa] hover:text-white border border-[#2a2a2a] rounded transition-colors cursor-pointer"
              title="Reload Game"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Scroll Toggle Button - Replaces Open Clean Tab */}
            <button
              id="player-scroll-toggle-btn"
              onClick={toggleScroll}
              className={`p-1.5 border rounded transition-colors cursor-pointer flex items-center justify-center ${
                allowScroll
                  ? 'bg-white/20 text-white border-white/40 shadow-sm'
                  : 'bg-[#141414] hover:bg-[#222222] text-[#aaaaaa] hover:text-white border-[#2a2a2a]'
              }`}
              title={allowScroll ? 'Scrolling: ON (Click to turn OFF)' : 'Scrolling: OFF (Click to turn ON)'}
            >
              <Scroll className="w-3.5 h-3.5" />
            </button>

            <button
              id="player-fullscreen-btn"
              onClick={toggleFullscreen}
              className="p-1.5 bg-[#141414] hover:bg-[#222222] text-[#aaaaaa] hover:text-white border border-[#2a2a2a] rounded transition-colors cursor-pointer"
              title="Enter Fullscreen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>
      )}

      {/* Floating Controls in Fullscreen mode (reveals on hover in top-right) */}
      {isFullscreen && (
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2 transition-opacity opacity-25 hover:opacity-100">
          <button
            id="player-aspect-cycle-fullscreen-btn"
            onClick={() => {
              const next: AspectRatioMode =
                aspectRatio === 'fill' ? '9:16' : aspectRatio === '9:16' ? '16:9' : aspectRatio === '16:9' ? '4:3' : 'fill';
              handleSelectAspectRatio(next);
            }}
            className="px-2.5 py-1.5 bg-black/85 hover:bg-black text-white text-xs font-medium border border-white/20 rounded-full transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg"
            title="Cycle Aspect Ratio (Fill / Mobile 9:16 / 16:9 / 4:3)"
          >
            {aspectRatio === '9:16' ? (
              <Smartphone className="w-3.5 h-3.5 text-white" />
            ) : aspectRatio === '16:9' ? (
              <Monitor className="w-3.5 h-3.5 text-white" />
            ) : aspectRatio === '4:3' ? (
              <Tv className="w-3.5 h-3.5 text-white" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-white" />
            )}
            <span>{aspectRatio === '9:16' ? 'Mobile (9:16)' : aspectRatio === '16:9' ? '16:9' : aspectRatio === '4:3' ? '4:3' : 'Fill'}</span>
          </button>

          {/* Performance button in Fullscreen - always next to Aspect Ratio button */}
          <button
            id="player-performance-cycle-fullscreen-btn"
            onClick={cyclePerformance}
            className="px-2.5 py-1.5 bg-black/85 hover:bg-black text-white text-xs font-medium border border-white/20 rounded-full transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg"
            title="Cycle Performance Mode (Auto -> Chromebook Safe -> Low Performance -> Ultra Low Performance)"
          >
            <Gauge className="w-3.5 h-3.5 text-white" />
            <span>Perf: {PERFORMANCE_PRESETS.find((p) => p.id === performanceMode)?.label || 'Auto'}</span>
          </button>

          {/* Scroll toggle button in Fullscreen */}
          <button
            id="player-scroll-cycle-fullscreen-btn"
            onClick={toggleScroll}
            className={`px-2.5 py-1.5 text-xs font-medium border rounded-full transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg ${
              allowScroll
                ? 'bg-white text-black border-white'
                : 'bg-black/85 hover:bg-black text-white border-white/20'
            }`}
            title={allowScroll ? 'Scrolling: ON (Click to turn OFF)' : 'Scrolling: OFF (Click to turn ON)'}
          >
            <Scroll className="w-3.5 h-3.5" />
            <span>Scroll: {allowScroll ? 'ON' : 'OFF'}</span>
          </button>

          <button
            id="player-exit-game-fullscreen-btn"
            onClick={exitGame}
            className="px-2.5 py-1.5 bg-black/85 hover:bg-black text-white text-xs font-medium border border-white/20 rounded-full transition-colors cursor-pointer flex items-center gap-1 shadow-lg"
            title="Exit Game"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
          <button
            id="player-exit-fullscreen-btn"
            onClick={toggleFullscreen}
            className="p-1.5 bg-black/85 hover:bg-black text-white/70 hover:text-white border border-white/20 rounded-full transition-opacity cursor-pointer shadow-lg"
            title="Exit Fullscreen (Esc)"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Game Stage */}
      <div
        ref={stageRef}
        className={`flex-1 w-full min-h-0 relative bg-[#0a0a0a] flex items-center justify-center p-0 ${
          allowScroll ? 'overflow-auto' : 'overflow-hidden'
        }`}
        onClick={() => {
          if (showAspectMenu) setShowAspectMenu(false);
          if (showPerformanceMenu) setShowPerformanceMenu(false);
          try {
            iframeRef.current?.focus();
            iframeRef.current?.contentWindow?.focus();
          } catch (e) {}
        }}
      >
        {/* On-Screen HUD Toast */}
        {hudToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-black/90 text-white text-xs font-medium px-4 py-2 rounded-full border border-white/20 shadow-2xl backdrop-blur-md pointer-events-none flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{hudToast}</span>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-3 z-30 pointer-events-none transition-opacity duration-300">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
            <div className="text-center">
              <p className="text-xs font-semibold text-white tracking-wide">Loading {meta.name}</p>
              <p className="text-[11px] text-[#777777] mt-0.5">
                {aspectRatio === '9:16'
                  ? 'Calibrating mobile phone viewport (9:16)...'
                  : performanceMode !== 'auto'
                  ? `Running with ${PERFORMANCE_PRESETS.find((p) => p.id === performanceMode)?.label}...`
                  : 'Running GitHub game build...'}
              </p>
            </div>
          </div>
        )}

        {frameSrc && (() => {
          const { width: boxW, height: boxH } = getBoxDimensions();

          return (
            <div
              style={{
                width: `${boxW}px`,
                height: `${boxH}px`,
                maxWidth: '100%',
                maxHeight: '100%',
              }}
              className={`relative flex items-center justify-center transition-all duration-150 ${
                allowScroll ? 'overflow-auto' : 'overflow-hidden'
              } ${
                aspectRatio === 'fill'
                  ? 'w-full h-full'
                  : 'shadow-[0_0_80px_rgba(0,0,0,0.95)] border border-[#222222]/80 rounded-sm'
              }`}
            >
              <iframe
                key={`frame-${keySeed}`}
                ref={iframeRef}
                src={frameSrc}
                title={meta.name}
                scrolling={allowScroll ? 'yes' : 'no'}
                tabIndex={0}
                onLoad={() => {
                  setIsLoading(false);
                  syncIframeCanvas();
                  syncIframePerformance(performanceMode);
                  updateIframeScroll(allowScroll);
                  try {
                    iframeRef.current?.focus();
                    iframeRef.current?.contentWindow?.focus();
                  } catch (e) {}
                }}
                className={`w-full h-full border-0 outline-none bg-black select-none m-0 p-0 block ${
                  allowScroll ? 'overflow-auto' : 'overflow-hidden'
                }`}
                style={{
                  width: '100%',
                  height: '100%',
                  imageRendering: performanceMode !== 'auto' ? 'pixelated' : 'auto',
                  overflow: allowScroll ? 'auto' : 'hidden',
                }}
                allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write; cross-origin-isolated"
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
};
