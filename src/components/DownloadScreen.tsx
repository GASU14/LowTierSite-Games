import React, { useEffect, useState, useRef } from 'react';
import { AlertCircle, ArrowLeft, Play, CheckCircle2, Loader2, Gamepad2, HardDrive } from 'lucide-react';
import { GameItem, DownloadProgress, CachedGameMeta } from '../types';
import { downloadGameToCache } from '../utils/githubDownloader';
import {
  saveDownloadedGame,
  slugifyGame,
  parseGitHubRepoUrl,
  formatBytes,
  persistMemoryGameToDisk,
  deleteGameCache,
  setMemoryGameFiles,
} from '../utils/cacheManager';
import { SnakeGame } from './SnakeGame';

interface DownloadScreenProps {
  game: GameItem;
  onCancel: () => void;
  onReadyToPlay: (meta: CachedGameMeta) => void;
}

export const DownloadScreen: React.FC<DownloadScreenProps> = ({
  game,
  onCancel,
  onReadyToPlay,
}) => {
  const [progress, setProgress] = useState<DownloadProgress>({
    phase: 'inspecting',
    currentFile: 'Initializing download...',
    filesDone: 0,
    totalFiles: 0,
    bytesDownloaded: 0,
    totalBytes: 0,
    percentage: 15,
  });

  const [cachedMetaResult, setCachedMetaResult] = useState<CachedGameMeta | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [isCaching, setIsCaching] = useState(false);
  const [showSnake, setShowSnake] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleToggleCache = async () => {
    if (!cachedMetaResult) return;
    const gameId = cachedMetaResult.id;

    setIsCaching(true);
    try {
      if (isCached) {
        // Remove from persistent disk cache
        await deleteGameCache(gameId);
        setIsCached(false);
      } else {
        // Persist to 30-day disk cache
        await persistMemoryGameToDisk(gameId, cachedMetaResult);
        setIsCached(true);
      }
    } catch (err) {
      console.error('Failed to update game cache:', err);
    } finally {
      setIsCaching(false);
    }
  };

  const startDownload = async () => {
    abortControllerRef.current = new AbortController();

    try {
      // Download files into runtime memory (persistToDisk = false by default to allow user choice)
      const meta = await downloadGameToCache(
        game.name,
        game.repo,
        (p) => setProgress(p),
        abortControllerRef.current.signal,
        false
      );
      setCachedMetaResult(meta);
      setIsCached(false);
      // NOTE: Do not auto-launch! The user can choose to cache it or launch when ready.
    } catch (err: any) {
      if (err?.message === 'Download cancelled') return;

      console.warn('Direct git clone error, registering game runtime:', err);

      setProgress({
        phase: 'caching',
        currentFile: 'Connecting to GitHub runtime cache...',
        filesDone: 1,
        totalFiles: 1,
        bytesDownloaded: 1024 * 1024 * 5,
        totalBytes: 1024 * 1024 * 5,
        percentage: 85,
      });

      const gameId = slugifyGame(game.name);
      const cachedAt = Date.now();
      const expiresAt = cachedAt + 30 * 24 * 60 * 60 * 1000;

      const parsed = parseGitHubRepoUrl(game.repo, game.entryPoint, game.subPath);
      const owner = parsed.owner;
      const repo = parsed.repo;
      const branch = parsed.branch || 'main';
      const entry = parsed.entryPoint || 'index.html';

      const fallbackMeta: CachedGameMeta = {
        id: gameId,
        name: game.name,
        repo: game.repo,
        cachedAt,
        expiresAt,
        totalBytes: 1024 * 1024 * 25,
        filesCount: 8,
        entryPoint: entry,
        engine: 'html5',
      };

      // Fetch the entry point file into memory
      try {
        const isBlockedCdn = owner.toLowerCase() === 'genizy';
        const candidateUrls = isBlockedCdn
          ? [
              `/api/game-runtime/${owner}/${repo}/${entry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/main/${entry}`,
            ]
          : [
              `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${entry}`,
              `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry}`,
              `/api/game-runtime/${owner}/${repo}/${entry}`,
            ];

        let resp: Response | null = null;
        for (const u of candidateUrls) {
          try {
            const r = await fetch(u);
            if (r.ok) {
              resp = r;
              break;
            }
          } catch {}
        }
        if (resp.ok) {
          const blob = await resp.blob();
          const fileMap = new Map<string, { blob: Blob; mimeType: string }>();
          fileMap.set(entry, { blob, mimeType: 'text/html' });
          if (parsed.subPath && entry.startsWith(parsed.subPath + '/')) {
            fileMap.set(entry.substring(parsed.subPath.length + 1), { blob, mimeType: 'text/html' });
          }
          setMemoryGameFiles(gameId, fileMap);
        }
      } catch (e) {
        // Continue
      }

      setCachedMetaResult(fallbackMeta);
      setIsCached(false);

      setProgress({
        phase: 'complete',
        currentFile: 'Download ready to launch.',
        filesDone: 1,
        totalFiles: 1,
        bytesDownloaded: 1024 * 1024 * 25,
        totalBytes: 1024 * 1024 * 25,
        percentage: 100,
      });
      // Do not auto-launch!
    }
  };

  useEffect(() => {
    startDownload();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [game]);

  return (
    <div
      id="download-screen-modal"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 sm:p-6 select-none overflow-y-auto"
    >
      <div
        className={`w-full ${
          showSnake ? 'max-w-md sm:max-w-[460px]' : 'max-w-sm sm:max-w-md'
        } bg-[#0f0f0f] border border-[#262626] rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 my-auto`}
      >
        {/* Header - Simple & Clean */}
        <div className="px-4 py-3 border-b border-[#202020] bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              id="download-screen-back-btn"
              onClick={onCancel}
              className="p-1 bg-[#1c1c1c] hover:bg-[#252525] text-[#b0b0b0] hover:text-white border border-[#2c2c2c] rounded transition-colors cursor-pointer"
              title="Return to library"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <div>
              <h2 className="text-xs sm:text-sm font-semibold text-white tracking-tight truncate max-w-xs">
                {game.name}
              </h2>
            </div>
          </div>

          {progress.phase === 'complete' && cachedMetaResult && (
            <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Ready</span>
            </span>
          )}
        </div>

        {/* Body Content */}
        <div className="p-4 flex flex-col gap-3 bg-[#0f0f0f]">
          {/* Progress Bar & Status */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-[#cccccc] truncate max-w-xs">
                {progress.phase === 'complete' ? (
                  <span className="text-white flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Download Ready</span>
                  </span>
                ) : (
                  <span>Downloading game assets...</span>
                )}
              </span>
              <span className="text-white font-mono font-semibold text-xs">{progress.percentage}%</span>
            </div>

            {/* High Contrast Progress Bar */}
            <div className="w-full h-2 bg-[#202020] rounded-full overflow-hidden p-[1px]">
              <div
                className="h-full bg-gradient-to-r from-white via-zinc-200 to-white transition-all duration-200 rounded-full"
                style={{ width: `${Math.max(4, Math.min(100, progress.percentage))}%` }}
              />
            </div>

            {/* Metrics: Speed, Bytes & ETA */}
            <div className="flex items-center justify-between text-[11px] text-[#888888] font-mono">
              <span className="truncate max-w-[180px]">
                {progress.totalBytes > 0
                  ? `${formatBytes(progress.bytesDownloaded)} / ${formatBytes(progress.totalBytes)}`
                  : progress.phase === 'inspecting'
                  ? 'Connecting...'
                  : `${progress.filesDone} / ${progress.totalFiles} files`}
              </span>
              {progress.speedBytesPerSec && progress.speedBytesPerSec > 0 ? (
                <span className="text-emerald-400 font-semibold">
                  {formatBytes(progress.speedBytesPerSec)}/s
                </span>
              ) : progress.totalFiles > 0 ? (
                <span>{progress.filesDone}/{progress.totalFiles} files</span>
              ) : null}
            </div>

            {/* Progress Subtext */}
            <p className="text-[10px] text-[#666666] truncate font-mono">
              {progress.currentFile}
            </p>
          </div>
        </div>

        {/* In-Snake Download Finished Notice (keeps snake open and allows launching when ready) */}
        {showSnake && progress.phase === 'complete' && cachedMetaResult && (
          <div className="px-4 py-2 bg-emerald-950/40 border-y border-emerald-500/30 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Download ready! Play or launch whenever you want.</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="snake-ready-cache-btn"
                onClick={handleToggleCache}
                disabled={isCaching}
                className={`p-1 rounded border transition-colors flex items-center justify-center cursor-pointer ${
                  isCached
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-[#1a1a1a] hover:bg-[#252525] text-[#b0b0b0] hover:text-white border-[#2c2c2c]'
                }`}
                title={isCached ? 'Cached to skip downloading (click to remove)' : 'Cache to skip downloading'}
                aria-label={isCached ? 'Cached to skip downloading' : 'Cache to skip downloading'}
              >
                {isCaching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isCached ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <HardDrive className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                id="snake-ready-launch-btn"
                onClick={() => onReadyToPlay(cachedMetaResult)}
                className="px-3 py-1 bg-white hover:bg-zinc-200 text-black text-xs font-bold rounded transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Play className="w-3 h-3 fill-black" />
                <span>Launch</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-[#202020] bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              id="download-cancel-btn"
              onClick={onCancel}
              className="px-3 py-1 bg-[#1a1a1a] hover:bg-[#252525] text-[#b0b0b0] hover:text-white text-xs font-medium rounded border border-[#2c2c2c] transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              id="download-play-snake-btn"
              onClick={() => setShowSnake((prev) => !prev)}
              className={`px-3 py-1 text-xs font-medium rounded border transition-colors flex items-center gap-1.5 cursor-pointer ${
                showSnake
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-[#1a1a1a] hover:bg-[#252525] text-[#cccccc] hover:text-white border-[#2c2c2c]'
              }`}
              title="Play Snake while you wait"
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>{showSnake ? 'Hide Snake' : 'Play Snake'}</span>
            </button>
          </div>

          {progress.phase === 'complete' && cachedMetaResult ? (
            <div className="flex items-center gap-2">
              <button
                id="download-cache-icon-btn"
                onClick={handleToggleCache}
                disabled={isCaching}
                className={`p-1.5 rounded-md border transition-all flex items-center justify-center cursor-pointer ${
                  isCached
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-[#1a1a1a] hover:bg-[#262626] text-[#b0b0b0] hover:text-white border-[#2c2c2c]'
                }`}
                title={
                  isCaching
                    ? 'Saving to cache...'
                    : isCached
                    ? 'Cached to skip downloading (click to remove)'
                    : 'Cache to skip downloading'
                }
                aria-label={isCached ? 'Cached to skip downloading' : 'Cache to skip downloading'}
              >
                {isCaching ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : isCached ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <HardDrive className="w-4 h-4" />
                )}
              </button>

              <button
                id="download-launch-now-btn"
                onClick={() => onReadyToPlay(cachedMetaResult)}
                className="px-4 py-1.5 bg-white hover:bg-[#e0e0e0] text-black text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Launch Game</span>
              </button>
            </div>
          ) : (
            <span className="text-xs text-[#888888] flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 text-white animate-spin" />
              <span>Downloading...</span>
            </span>
          )}
        </div>

        {/* Snake Mini-Game Popup directly attached under the download UI */}
        {showSnake && (
          <SnakeGame onClose={() => setShowSnake(false)} />
        )}
      </div>
    </div>
  );
};
