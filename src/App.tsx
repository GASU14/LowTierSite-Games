/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { GameItem, CachedGameMeta } from './types';
import { Header } from './components/Header';
import { GameCard } from './components/GameCard';
import { DownloadScreen } from './components/DownloadScreen';
import { GamePlayer } from './components/GamePlayer';
import { CacheManagerModal } from './components/CacheManagerModal';
import gameMetadata from './data/GameMetadata.json';
import {
  initServiceWorker,
  getAllCachedGames,
  deleteGameCache,
  clearAllCaches,
  slugifyGame,
  formatBytes,
} from './utils/cacheManager';

export default function App() {
  // Games state loaded directly from local GameMetadata.json for offline/static capabilities
  const [games] = useState<GameItem[]>(gameMetadata as GameItem[]);

  // App state
  const [cachedGamesMap, setCachedGamesMap] = useState<Map<string, CachedGameMeta>>(new Map());
  const [activeGameForDownload, setActiveGameForDownload] = useState<GameItem | null>(null);
  const [activePlayingGame, setActivePlayingGame] = useState<{
    game: GameItem;
    meta: CachedGameMeta;
  } | null>(null);
  const [isCacheModalOpen, setIsCacheModalOpen] = useState(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');

  // Load cached games from IndexedDB
  const refreshCacheStatus = async () => {
    try {
      const cachedList = await getAllCachedGames();
      const map = new Map<string, CachedGameMeta>();
      for (const item of cachedList) {
        map.set(item.id, item);
      }
      setCachedGamesMap(map);
    } catch (err) {
      console.error('Failed to load cached games list:', err);
    }
  };

  useEffect(() => {
    initServiceWorker();
    refreshCacheStatus();
  }, []);

  // Compute unique genres (supporting multi-genres per game)
  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      if (g.genre) {
        // Split by comma in case a game has multiple genres selected
        g.genre.split(',').forEach((sub) => {
          const trimmed = sub.trim();
          if (trimmed) set.add(trimmed);
        });
      }
    }
    return ['All', ...Array.from(set).sort()];
  }, [games]);

  // Deferred search query for concurrent, non-blocking filtering
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Filtered games by search and genre
  const filteredGames = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    const genre = selectedGenre.toLowerCase();
    return games.filter((g) => {
      const matchesSearch = !query || g.name.toLowerCase().includes(query);
      const gameGenres = (g.genre || '')
        .toLowerCase()
        .split(',')
        .map((s) => s.trim());
      const matchesGenre =
        selectedGenre === 'All' ||
        gameGenres.includes(genre) ||
        (g.genre || '').toLowerCase() === genre;
      return matchesSearch && matchesGenre;
    });
  }, [games, deferredSearchQuery, selectedGenre]);

  // Total cached bytes
  const totalCachedBytes = useMemo(() => {
    let sum = 0;
    cachedGamesMap.forEach((meta) => {
      sum += meta.totalBytes;
    });
    return sum;
  }, [cachedGamesMap]);

  // Handle game selection (Play or Download)
  const handleSelectGame = useCallback((game: GameItem) => {
    const gameId = slugifyGame(game.name);
    const cachedMeta = cachedGamesMap.get(gameId);

    if (cachedMeta) {
      // Already cached -> launch real game player immediately
      setActivePlayingGame({ game, meta: cachedMeta });
    } else {
      // Needs download -> open download progress
      setActiveGameForDownload(game);
    }
  }, [cachedGamesMap]);

  // After download finishes, launch the game
  const handleDownloadReady = useCallback((meta: CachedGameMeta) => {
    if (activeGameForDownload) {
      setActivePlayingGame({ game: activeGameForDownload, meta });
    }
    setActiveGameForDownload(null);
    refreshCacheStatus();
  }, [activeGameForDownload]);

  const handleDeleteCache = useCallback(async (game: GameItem) => {
    const gameId = slugifyGame(game.name);
    await deleteGameCache(gameId);
    await refreshCacheStatus();
  }, []);

  const handleDeleteCacheById = useCallback(async (gameId: string) => {
    await deleteGameCache(gameId);
    await refreshCacheStatus();
  }, []);

  const handleClearAllCaches = useCallback(async () => {
    await clearAllCaches();
    await refreshCacheStatus();
  }, []);

  return (
    <div
      id="games-root"
      className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-white selection:text-black"
    >
      {/* Site Header */}
      <Header
        cachedCount={cachedGamesMap.size}
        totalCachedSize={formatBytes(totalCachedBytes)}
        onOpenCacheManager={() => setIsCacheModalOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedGenre={selectedGenre}
        genres={genres}
        onSelectGenre={setSelectedGenre}
      />

      {/* Main Content Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-12">
        {filteredGames.length === 0 ? (
          <div className="py-24 text-center flex flex-col items-center justify-center text-[#666666]">
            <p className="text-sm font-medium text-[#888888]">No games found matching your search</p>
            <button
              id="clear-search-btn"
              onClick={() => {
                setSearchQuery('');
                setSelectedGenre('All');
              }}
              className="mt-3 px-4 py-1.5 bg-[#141414] hover:bg-[#202020] border border-[#2a2a2a] text-xs font-medium text-white rounded-full transition-colors cursor-pointer"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
            {filteredGames.map((game, index) => {
              const gameId = slugifyGame(game.name);
              const cachedMeta = cachedGamesMap.get(gameId);
              let daysRemaining: number | undefined = undefined;

              if (cachedMeta) {
                const msRemaining = cachedMeta.expiresAt - Date.now();
                daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
              }

              return (
                <GameCard
                  key={game.name}
                  game={game}
                  index={index}
                  cachedMeta={cachedMeta}
                  daysRemaining={daysRemaining}
                  onSelectGame={handleSelectGame}
                  onDeleteCache={handleDeleteCache}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Download Screen Modal */}
      {activeGameForDownload && (
        <DownloadScreen
          game={activeGameForDownload}
          onCancel={() => setActiveGameForDownload(null)}
          onReadyToPlay={handleDownloadReady}
        />
      )}

      {/* Active Real Game Player */}
      {activePlayingGame && (
        <GamePlayer
          meta={activePlayingGame.meta}
          onBack={() => {
            setActivePlayingGame(null);
            refreshCacheStatus();
          }}
          daysRemaining={Math.max(
            1,
            Math.ceil((activePlayingGame.meta.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
          )}
        />
      )}

      {/* Cache Storage Management Modal */}
      <CacheManagerModal
        isOpen={isCacheModalOpen}
        onClose={() => setIsCacheModalOpen(false)}
        cachedGames={Array.from(cachedGamesMap.values())}
        onPlayGame={(meta) => {
          const matchedGame = games.find((g) => slugifyGame(g.name) === meta.id) || {
            name: meta.name,
            repo: meta.repo,
            thumbnail: '',
            badge: 'Low',
            genre: 'Game',
          };
          setActivePlayingGame({ game: matchedGame, meta });
        }}
        onDeleteGame={handleDeleteCacheById}
        onClearAll={handleClearAllCaches}
      />
    </div>
  );
}
