export type AspectRatioMode = 'fill' | '9:16' | '16:9' | '4:3';

export interface GameItem {
  name: string;
  repo: string;
  thumbnail: string;
  badge: 'Low' | 'Medium' | 'High' | string;
  genre: string;
  gameNumber?: string;
  defaultAspectRatio?: AspectRatioMode;
  entryPoint?: string;
  subPath?: string;
}

export type EngineType = 'unity-wasm' | 'webgl' | 'wasm' | 'html5';

export interface CachedGameMeta {
  id: string;
  name: string;
  repo: string;
  cachedAt: number;
  expiresAt: number; // 30 days expiry
  totalBytes: number;
  filesCount: number;
  entryPoint: string;
  engine: EngineType;
  defaultAspectRatio?: AspectRatioMode;
}

export interface DownloadProgress {
  phase: 'idle' | 'inspecting' | 'downloading' | 'caching' | 'complete' | 'error';
  currentFile: string;
  filesDone: number;
  totalFiles: number;
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSec?: number;
  errorMessage?: string;
}

export interface CachedFileItem {
  path: string;
  blob: Blob;
  mimeType: string;
  size: number;
}
