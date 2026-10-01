import React, { useState, useEffect } from 'react';
import { X, HardDrive, Trash2, Play, Clock } from 'lucide-react';
import { CachedGameMeta } from '../types';
import { formatBytes } from '../utils/cacheManager';

interface CacheManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cachedGames: CachedGameMeta[];
  onPlayGame: (meta: CachedGameMeta) => void;
  onDeleteGame: (gameId: string) => void;
  onClearAll: () => void;
}

function formatCountdownTimer(expiresAt: number, now: number): string {
  const diff = expiresAt - now;
  if (diff <= 0) return 'Expired';

  const totalSecs = Math.floor(diff / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }
  if (hours > 0) {
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }
  return `${pad(minutes)}m ${pad(seconds)}s`;
}

export const CacheManagerModal: React.FC<CacheManagerModalProps> = ({
  isOpen,
  onClose,
  cachedGames,
  onPlayGame,
  onDeleteGame,
  onClearAll,
}) => {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Real-time ticking countdown timer (every 1 second)
  useEffect(() => {
    if (!isOpen) return;
    setCurrentTime(Date.now());
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const totalBytes = cachedGames.reduce((acc, g) => acc + g.totalBytes, 0);

  return (
    <div
      id="cache-manager-modal"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 sm:p-6 select-none"
    >
      <div className="w-full max-w-md bg-[#0f0f0f] border border-[#262626] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#202020] bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-white" />
            <h2 className="text-xs sm:text-sm font-semibold text-white tracking-tight">
              Cache Manager
            </h2>
          </div>
          <button
            id="close-cache-modal-btn"
            onClick={onClose}
            className="p-1 text-[#888888] hover:text-white rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Overview Bar */}
        <div className="px-4 py-2.5 bg-[#0f0f0f] border-b border-[#202020] flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-[#888888]">
            <span>Cached: <strong className="text-white">{cachedGames.length}</strong></span>
            <span>Size: <strong className="text-white">{formatBytes(totalBytes)}</strong></span>
          </div>

          {cachedGames.length > 0 && (
            <button
              id="clear-all-cache-btn"
              onClick={onClearAll}
              className="px-2.5 py-1 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333333] text-[#cccccc] hover:text-white text-xs font-medium rounded transition-colors cursor-pointer"
            >
              Purge All
            </button>
          )}
        </div>

        {/* Cached Games List */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2.5 divide-y divide-[#1a1a1a]">
          {cachedGames.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center text-[#666666]">
              <HardDrive className="w-10 h-10 stroke-1 text-[#333333] mb-2" />
              <p className="text-xs font-medium text-[#888888]">No games currently cached.</p>
              <p className="text-[11px] text-[#555555] mt-1">
                Downloaded games stay in browser storage with an active countdown timer.
              </p>
            </div>
          ) : (
            cachedGames.map((game) => {
              const timerStr = formatCountdownTimer(game.expiresAt, currentTime);
              const isExpired = timerStr === 'Expired';

              return (
                <div
                  key={game.id}
                  id={`cached-item-${game.id}`}
                  className="pt-2.5 pb-2.5 first:pt-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-semibold text-white truncate">
                      {game.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-[#888888] mt-0.5 font-mono">
                      <span className="text-[#666666]">{formatBytes(game.totalBytes)}</span>
                      <span className="text-[#444444]">•</span>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#888888]" />
                        <span className={isExpired ? 'text-red-400 font-semibold' : 'text-white font-medium'}>
                          {timerStr}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      id={`cache-play-${game.id}`}
                      onClick={() => {
                        onClose();
                        onPlayGame(game);
                      }}
                      className="px-3 py-1 bg-white hover:bg-[#e0e0e0] text-black text-xs font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-black" />
                      <span>Play</span>
                    </button>

                    <button
                      id={`cache-delete-${game.id}`}
                      onClick={() => onDeleteGame(game.id)}
                      className="p-1.5 bg-[#1a1a1a] hover:bg-[#252525] border border-[#2c2c2c] text-[#777777] hover:text-white rounded transition-colors cursor-pointer"
                      title="Delete cache"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#141414] border-t border-[#202020] flex items-center justify-between text-xs text-[#777777]">
          <div className="flex items-center gap-1.5 text-[11px] text-[#888888]">
            <Clock className="w-3.5 h-3.5 text-[#aaaaaa]" />
            <span>Live expiration timer</span>
          </div>
          <button
            id="close-cache-modal-footer-btn"
            onClick={onClose}
            className="px-3 py-1 bg-white text-black hover:bg-[#e0e0e0] rounded transition-colors cursor-pointer font-medium text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
