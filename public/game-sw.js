// LowTeirSite Virtual Game Service Worker
// Serves cached games from IndexedDB / CacheStorage with 30-day persistence and zero CORS restrictions

const CACHE_NAME = 'lowteir-games-v1';
const DB_NAME = 'LowTeirGamesDB';
const DB_VERSION = 1;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Helper to open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('game_files')) {
        db.createObjectStore('game_files', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('game_meta')) {
        db.createObjectStore('game_meta', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getMimeType(filePath) {
  const clean = filePath.split('?')[0].toLowerCase();
  if (clean.endsWith('.html') || clean.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (clean.endsWith('.js') || clean.endsWith('.javascript')) return 'application/javascript; charset=utf-8';
  if (clean.endsWith('.wasm') || clean.includes('.wasm.part')) return 'application/wasm';
  if (clean.endsWith('.json')) return 'application/json; charset=utf-8';
  if (clean.endsWith('.css')) return 'text/css; charset=utf-8';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  if (clean.endsWith('.ico')) return 'image/x-icon';
  if (clean.endsWith('.mp3')) return 'audio/mpeg';
  if (clean.endsWith('.ogg')) return 'audio/ogg';
  if (clean.endsWith('.wav')) return 'audio/wav';
  if (clean.endsWith('.unityweb')) return 'application/octet-stream';
  if (clean.includes('.data')) return 'application/octet-stream';
  return 'application/octet-stream';
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept requests matching /game-virtual/{gameId}/*
  if (url.pathname.startsWith('/game-virtual/')) {
    event.respondWith(handleVirtualGameRequest(url, event.request));
  }
});

async function handleVirtualGameRequest(url, request) {
  const pathParts = url.pathname.replace(/^\/game-virtual\//, '').split('/');
  const gameId = pathParts[0];
  let subPath = pathParts.slice(1).join('/');

  if (!subPath || subPath === '') {
    subPath = 'index.html';
  }

  // Normalize subPath: strip leading slashes and queries
  subPath = subPath.replace(/^\/+/, '').split('?')[0];

  try {
    const db = await openDB();

    // First try exact key
    let fileRecord = await new Promise((resolve) => {
      const tx = db.transaction('game_files', 'readonly');
      const store = tx.objectStore('game_files');
      const req = store.get(`${gameId}:${subPath}`);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    // If not found, check if game has a subPath prefix or custom entryPoint in game_meta
    if (!fileRecord) {
      const meta = await new Promise((resolve) => {
        const tx = db.transaction('game_meta', 'readonly');
        const store = tx.objectStore('game_meta');
        const req = store.get(gameId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });

      if (meta) {
        if (subPath === 'index.html' && meta.entryPoint && meta.entryPoint !== 'index.html') {
          fileRecord = await new Promise((resolve) => {
            const tx = db.transaction('game_files', 'readonly');
            const store = tx.objectStore('game_files');
            const req = store.get(`${gameId}:${meta.entryPoint}`);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
        }
        if (!fileRecord && meta.subPath) {
          fileRecord = await new Promise((resolve) => {
            const tx = db.transaction('game_files', 'readonly');
            const store = tx.objectStore('game_files');
            const req = store.get(`${gameId}:${meta.subPath}/${subPath}`);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
        }
      }
    }

    if (fileRecord && fileRecord.blob) {
      const mime = fileRecord.mimeType || getMimeType(subPath);
      return new Response(fileRecord.blob, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=2592000',
        },
      });
    }

    // Try fallback from Cache API
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Try fallback to jsDelivr CDN if not yet in local browser cache (Static host & Surge.sh friendly)
    try {
      let owner = '';
      let repo = '';
      const meta = await new Promise((resolve) => {
        const tx = db.transaction('game_meta', 'readonly');
        const store = tx.objectStore('game_meta');
        const req = store.get(gameId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (meta && meta.repo) {
        const match = meta.repo.replace(/\.git$/, '').match(/github\.com\/([^\/]+)\/([^\/]+)/i);
        if (match) {
          owner = match[1];
          repo = match[2];
          if (repo === 'ULTRAKILL' && owner === 'teker821') {
            owner = 'MoltenWolf85';
            repo = 'UK-web';
          } else if (repo.toLowerCase().includes('hustle')) {
            owner = 'web-ports';
            repo = 'yomi-hustle';
          }
        }
      }

      if (owner && repo) {
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/${subPath}`;
        const cdnResp = await fetch(cdnUrl);
        if (cdnResp.ok) {
          const mime = getMimeType(subPath);
          let body = await cdnResp.blob();
          if (mime.includes('text/html') || subPath.endsWith('.html')) {
            let htmlText = await body.text();
            if (!htmlText.includes('<base href=')) {
              const baseTag = `<base href="https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/">`;
              htmlText = htmlText.includes('<head>') ? htmlText.replace('<head>', `<head>\n  ${baseTag}`) : baseTag + htmlText;
            }
            body = new Blob([htmlText], { type: 'text/html; charset=utf-8' });
          }
          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': mime,
              'Access-Control-Allow-Origin': '*',
              'Cross-Origin-Opener-Policy': 'same-origin',
              'Cross-Origin-Embedder-Policy': 'credentialless',
              'Cache-Control': 'public, max-age=2592000',
            },
          });
        }
      }
    } catch (e) {
      // ignore
    }

    // Try fallback to server runtime if local server is active
    try {
      if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
        const fallbackResp = await fetch(`/api/game-runtime-fallback?gameId=${encodeURIComponent(gameId)}&path=${encodeURIComponent(subPath)}`);
        if (fallbackResp.ok) {
          return fallbackResp;
        }
      }
    } catch (e) {
      // ignore
    }

    // Return 404 with helpful diagnostic in console
    return new Response(`File not found in 30-day cache: ${gameId}/${subPath}`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (err) {
    return new Response(`Error loading cached file: ${err?.message || err}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
