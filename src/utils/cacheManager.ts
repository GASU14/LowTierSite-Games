import { CachedGameMeta, EngineType } from '../types';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DB_NAME = 'LowTeirGamesDB';
const DB_VERSION = 1;
const CACHE_NAME = 'lowteir-games-v1';

let cachedDbPromise: Promise<IDBDatabase> | null = null;

// In-memory runtime cache for downloaded games (so games can be played immediately without auto-saving to disk)
const memoryGameCache = new Map<string, Map<string, { blob: Blob; mimeType: string }>>();

export function setMemoryGameFiles(gameId: string, files: Map<string, { blob: Blob; mimeType: string }>) {
  // Evict older in-memory games so memory doesn't grow unbounded when testing multiple games
  if (memoryGameCache.size >= 1) {
    for (const key of memoryGameCache.keys()) {
      if (key !== gameId) {
        memoryGameCache.delete(key);
      }
    }
  }
  memoryGameCache.set(gameId, files);
}

export function getMemoryGameFiles(gameId: string): Map<string, { blob: Blob; mimeType: string }> | undefined {
  return memoryGameCache.get(gameId);
}

export function clearMemoryGameFiles(gameId: string) {
  memoryGameCache.delete(gameId);
}

export async function persistMemoryGameToDisk(gameId: string, meta: CachedGameMeta): Promise<boolean> {
  const files = memoryGameCache.get(gameId);
  if (!files || files.size === 0) {
    return false;
  }
  await saveDownloadedGame(gameId, meta, files);
  // Free in-memory Blobs now that all data is securely written to IndexedDB
  memoryGameCache.delete(gameId);
  return true;
}

function openDB(): Promise<IDBDatabase> {
  if (cachedDbPromise) {
    return cachedDbPromise;
  }
  cachedDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('game_files')) {
        db.createObjectStore('game_files', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('game_meta')) {
        db.createObjectStore('game_meta', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        cachedDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error);
    };
  });
  return cachedDbPromise;
}

export function slugifyGame(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface ParsedRepoInfo {
  owner: string;
  repo: string;
  branch: string;
  subPath: string;
  entryPoint: string;
  baseHref: string;
}

export function parseGitHubRepoUrl(url: string, explicitEntry?: string, explicitSubPath?: string): ParsedRepoInfo {
  let clean = (url || '').replace(/\.git$/, '').trim();

  // 1. Check for tree/branch/subpath URL (e.g. https://github.com/irv77/hd_fnaf/tree/main/1)
  const treeMatch = clean.match(/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)(?:\/(.*))?/i);
  if (treeMatch) {
    let owner = treeMatch[1];
    let repo = treeMatch[2];
    let branch = treeMatch[3] || 'main';
    let subPath = (treeMatch[4] || explicitSubPath || '').replace(/^\/+|\/+$/g, '');

    // Aliases
    if (repo === 'ULTRAKILL' && owner === 'teker821') {
      owner = 'MoltenWolf85';
      repo = 'UK-web';
    } else if (repo.toLowerCase().includes('hustle')) {
      owner = 'web-ports';
      repo = 'yomi-hustle';
    }

    let entryPoint = explicitEntry;
    if (!entryPoint || entryPoint === 'index.html') {
      entryPoint = subPath ? `${subPath}/index.html` : 'index.html';
    } else if (subPath && !entryPoint.startsWith(subPath)) {
      entryPoint = `${subPath}/${entryPoint.replace(/^\/+/, '')}`;
    }

    const lastSlash = entryPoint.lastIndexOf('/');
    const entryDir = lastSlash >= 0 ? entryPoint.substring(0, lastSlash + 1) : '';
    const isBlockedCdn = owner.toLowerCase() === 'genizy';
    const baseHref = isBlockedCdn
      ? `/api/game-runtime/${owner}/${repo}/${entryDir}`
      : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${entryDir}`;

    return { owner, repo, branch, subPath, entryPoint, baseHref };
  }

  // 2. Standard format: https://github.com/:owner/:repo
  const match = clean.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
  let owner = match ? match[1] : '';
  let repo = match ? match[2] : '';
  let branch = 'main';
  let subPath = (explicitSubPath || '').replace(/^\/+|\/+$/g, '');

  if (repo === 'ULTRAKILL' && owner === 'teker821') {
    owner = 'MoltenWolf85';
    repo = 'UK-web';
  } else if (repo.toLowerCase().includes('hustle')) {
    owner = 'web-ports';
    repo = 'yomi-hustle';
  }

  let entryPoint = explicitEntry || (subPath ? `${subPath}/index.html` : 'index.html');
  if ((repo.toLowerCase() === 'weblatro' || repo.toLowerCase().includes('balatro')) && (!explicitEntry || explicitEntry === 'index.html')) {
    entryPoint = 'main.html';
  } else if (owner.toLowerCase() === 'ldevinux' && repo.toLowerCase() === 'eaglercraft' && (entryPoint === 'index.html' || !entryPoint)) {
    entryPoint = 'stable-download/web/index.html';
  } else if (owner.toLowerCase() === 'x8rr' && repo.toLowerCase().includes('eaglercraft') && (entryPoint === 'index.html' || !entryPoint)) {
    entryPoint = 'clients/1.8/eaglercraftx.html';
  } else if (owner.toLowerCase() === '3kh0' && repo.toLowerCase().includes('eaglercraft') && (entryPoint === 'index.html' || !entryPoint)) {
    entryPoint = 'EaglercraftX_1.8_Offline_en_US.html';
  } else if (owner.toLowerCase() === 'vidio-boy' && repo.toLowerCase().includes('eaglercraft') && (entryPoint === 'index.html' || !entryPoint)) {
    entryPoint = 'eaglercraft.1.8.8.html';
  }

  const lastSlash = entryPoint.lastIndexOf('/');
  const entryDir = lastSlash >= 0 ? entryPoint.substring(0, lastSlash + 1) : '';
  const isBlockedCdn = owner.toLowerCase() === 'genizy';
  const baseHref = isBlockedCdn
    ? `/api/game-runtime/${owner}/${repo}/${entryDir}`
    : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${entryDir}`;

  return { owner, repo, branch, subPath, entryPoint, baseHref };
}

export function detectEngine(filePaths: string[]): EngineType {
  const pathsLower = filePaths.map((p) => p.toLowerCase());
  const isUnity = pathsLower.some(
    (p) =>
      p.includes('loader.js') ||
      p.includes('framework.js') ||
      p.includes('.unityweb') ||
      p.includes('unityloader')
  );
  if (isUnity) return 'unity-wasm';

  const hasWasm = pathsLower.some((p) => p.endsWith('.wasm') || p.includes('.wasm.part'));
  if (hasWasm) return 'wasm';

  const hasWebGL = pathsLower.some((p) => p.includes('webgl') || p.includes('glmatrix') || p.includes('three'));
  if (hasWebGL) return 'webgl';

  return 'html5';
}

export function detectEntryPoint(filePaths: string[]): string {
  // Check exact root index.html first
  if (filePaths.includes('index.html')) return 'index.html';

  // Check any index.html
  const anyIndex = filePaths.find((p) => p.toLowerCase().endsWith('index.html'));
  if (anyIndex) return anyIndex;

  // Check any .html
  const anyHtml = filePaths.find((p) => p.toLowerCase().endsWith('.html') && !p.toLowerCase().includes('readme'));
  if (anyHtml) return anyHtml;

  return 'index.html';
}

export async function initServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.register('/game-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return true;
  } catch (err) {
    console.warn('[LowTeirSite] Service Worker registration failed:', err);
    return false;
  }
}

export async function checkGameCache(gameId: string): Promise<{
  cached: boolean;
  meta?: CachedGameMeta;
  daysRemaining?: number;
}> {
  try {
    const db = await openDB();
    const meta: CachedGameMeta | undefined = await new Promise((resolve) => {
      const tx = db.transaction('game_meta', 'readonly');
      const store = tx.objectStore('game_meta');
      const req = store.get(gameId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });

    if (!meta) {
      return { cached: false };
    }

    const now = Date.now();
    if (now > meta.expiresAt) {
      // Expired! Clean up automatically
      await deleteGameCache(gameId);
      return { cached: false };
    }

    const msRemaining = meta.expiresAt - now;
    const daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

    return {
      cached: true,
      meta,
      daysRemaining,
    };
  } catch (err) {
    console.error('Error checking game cache:', err);
    return { cached: false };
  }
}

export async function saveGameMeta(meta: CachedGameMeta): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('game_meta', 'readwrite');
    const store = tx.objectStore('game_meta');
    const req = store.put(meta);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveGameFileDirect(
  gameId: string,
  filePath: string,
  blob: Blob,
  mimeType: string
): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('game_files', 'readwrite');
    const store = tx.objectStore('game_files');
    store.put({
      key: `${gameId}:${filePath}`,
      gameId,
      path: filePath,
      blob,
      mimeType,
      size: blob.size,
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveDownloadedGame(
  gameId: string,
  meta: CachedGameMeta,
  files: Map<string, { blob: Blob; mimeType: string }>
): Promise<void> {
  const db = await openDB();

  // 1. Save meta immediately
  await saveGameMeta(meta);

  // 2. Save files in optimized chunks to maximize disk I/O throughput
  const entries = Array.from(files.entries());
  const batchSize = 64;
  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('game_files', 'readwrite');
      const store = tx.objectStore('game_files');
      for (const [filePath, fileData] of slice) {
        store.put({
          key: `${gameId}:${filePath}`,
          gameId,
          path: filePath,
          blob: fileData.blob,
          mimeType: fileData.mimeType,
          size: fileData.blob.size,
          savedAt: Date.now(),
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Memory cleanup: If the game was in memory cache, remove it now that it is written to disk
  memoryGameCache.delete(gameId);
}

export async function getAllCachedGames(): Promise<CachedGameMeta[]> {
  try {
    const db = await openDB();
    const metas: CachedGameMeta[] = await new Promise((resolve) => {
      const tx = db.transaction('game_meta', 'readonly');
      const store = tx.objectStore('game_meta');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const now = Date.now();
    const valid: CachedGameMeta[] = [];
    for (const m of metas) {
      if (now > m.expiresAt) {
        await deleteGameCache(m.id);
      } else {
        valid.push(m);
      }
    }
    return valid;
  } catch (err) {
    console.error('Error getting cached games:', err);
    return [];
  }
}

export async function getCachedFile(gameId: string, filePath: string): Promise<Blob | null> {
  const mem = memoryGameCache.get(gameId);
  if (mem && mem.has(filePath)) {
    return mem.get(filePath)!.blob;
  }

  try {
    const db = await openDB();
    const record = await new Promise<any>((resolve) => {
      const tx = db.transaction('game_files', 'readonly');
      const store = tx.objectStore('game_files');
      const req = store.get(`${gameId}:${filePath}`);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return record?.blob || null;
  } catch (err) {
    return null;
  }
}

export async function getGameFiles(gameId: string): Promise<Map<string, { blob: Blob; mimeType: string }>> {
  // Return in-memory files if available (downloaded for this session)
  const mem = memoryGameCache.get(gameId);
  if (mem && mem.size > 0) {
    return mem;
  }

  const result = new Map<string, { blob: Blob; mimeType: string }>();
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('game_files', 'readonly');
      const store = tx.objectStore('game_files');
      const req = store.openCursor();
      req.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          const keyStr = cursor.key.toString();
          if (keyStr.startsWith(`${gameId}:`)) {
            const relPath = keyStr.substring(gameId.length + 1);
            result.set(relPath, { blob: cursor.value.blob, mimeType: cursor.value.mimeType });
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.error('Error reading game files:', err);
  }
  return result;
}

export async function deleteGameCache(gameId: string): Promise<void> {
  try {
    const db = await openDB();

    // Delete meta
    await new Promise<void>((resolve) => {
      const tx = db.transaction('game_meta', 'readwrite');
      tx.objectStore('game_meta').delete(gameId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    // Delete file records
    await new Promise<void>((resolve) => {
      const tx = db.transaction('game_files', 'readwrite');
      const store = tx.objectStore('game_files');
      const req = store.openCursor();
      req.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.gameId === gameId || cursor.key.toString().startsWith(`${gameId}:`)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });

    // Clear CacheStorage matching keys
    if ('caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      for (const req of keys) {
        if (req.url.includes(`/game-virtual/${gameId}/`)) {
          await cache.delete(req);
        }
      }
    }
    // Also clean up any in-memory copies
    memoryGameCache.delete(gameId);
  } catch (err) {
    console.error(`Failed to delete cache for ${gameId}:`, err);
  }
}

export async function clearAllCaches(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(['game_meta', 'game_files'], 'readwrite');
      tx.objectStore('game_meta').clear();
      tx.objectStore('game_files').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    if ('caches' in window) {
      await caches.delete(CACHE_NAME);
    }

    // Free all in-memory game files
    memoryGameCache.clear();
  } catch (err) {
    console.error('Failed to clear all caches:', err);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
