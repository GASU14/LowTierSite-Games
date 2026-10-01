import React, { useState } from 'react';
import { Play, Download, Trash2, Check, Gamepad } from 'lucide-react';
import { GameItem, CachedGameMeta } from '../types';

interface GameCardProps {
  game: GameItem;
  index: number;
  cachedMeta?: CachedGameMeta;
  daysRemaining?: number;
  onSelectGame: (game: GameItem) => void;
  onDeleteCache: (game: GameItem) => void;
}

export const GameCard: React.FC<GameCardProps> = React.memo(({
  game,
  cachedMeta,
  daysRemaining,
  onSelectGame,
  onDeleteCache,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const isCached = Boolean(cachedMeta && (!daysRemaining || daysRemaining > 0));
  const cardId = game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div
      id={`game-card-${cardId}`}
      onClick={() => onSelectGame(game)}
      className="group relative aspect-square w-full rounded-xl overflow-hidden bg-[#111111] border border-[#222222] hover:border-white/50 cursor-pointer select-none transition-colors game-card-optimized"
    >
      {/* 1:1 Thumbnail image - Stays 100% undimmed on hover */}
      <div className="absolute inset-0 w-full h-full bg-[#111111]">
        {!imgFailed && game.thumbnail ? (
          <img
            src={game.thumbnail}
            alt={game.name}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-[#111111]">
            <Gamepad className="w-8 h-8 text-[#444444] mb-1.5 stroke-1" />
            <span className="text-xs font-medium text-[#777777] line-clamp-2">{game.name}</span>
          </div>
        )}

        {/* Small cached indicator on top corner */}
        {isCached && (
          <div className="absolute top-2 left-2 z-10">
            <span className="bg-black/90 text-white border border-[#333333] text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1">
              <Check className="w-2.5 h-2.5 text-white" />
              <span>Cached</span>
            </span>
          </div>
        )}
      </div>

      {/* Floating Bottom Controls - No full-card dimming, image stays bright */}
      <div
        id={`card-overlay-${cardId}`}
        className="absolute inset-x-2 bottom-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-2 bg-black/90 border border-[#2e2e2e] rounded-lg shadow-2xl flex flex-col gap-1.5"
      >
        <div className="min-w-0">
          <h3
            className="text-xs font-semibold text-white tracking-tight truncate"
            title={game.name}
          >
            {game.name}
          </h3>
          <p className="text-[10px] text-[#888888] truncate">
            {game.genre}
          </p>
        </div>

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            id={`btn-play-${cardId}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectGame(game);
            }}
            className="flex-1 py-1 px-2.5 bg-white hover:bg-[#e0e0e0] text-black font-semibold text-xs rounded flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            {isCached ? (
              <>
                <Play className="w-3 h-3 fill-black" />
                <span>Play</span>
              </>
            ) : (
              <>
                <Download className="w-3 h-3 text-black" />
                <span>Download</span>
              </>
            )}
          </button>

          {isCached && (
            <button
              id={`btn-delete-${cardId}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCache(game);
              }}
              className="p-1 bg-[#1a1a1a] hover:bg-[#252525] text-[#888888] hover:text-white border border-[#333333] rounded transition-colors cursor-pointer"
              title="Remove from 30-day cache"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

GameCard.displayName = 'GameCard';
