import React, { useState, useRef, useEffect } from 'react';
import { HardDrive, Search, SlidersHorizontal, Check } from 'lucide-react';

interface HeaderProps {
  cachedCount: number;
  totalCachedSize: string;
  onOpenCacheManager: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedGenre: string;
  genres: string[];
  onSelectGenre: (genre: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  cachedCount,
  totalCachedSize,
  onOpenCacheManager,
  searchQuery,
  onSearchChange,
  selectedGenre,
  genres,
  onSelectGenre,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  return (
    <header id="site-header" className="w-full bg-black border-b border-[#1c1c1c] sticky top-0 z-30 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold tracking-tight text-white select-none mr-1">
            Games
          </h1>
        </div>

        {/* Right / Center Controls: Search -> 1:1 Sort Button -> Cache -> Testers */}
        <div className="flex items-center gap-2 sm:gap-2.5 ml-auto">
          {/* Search bar */}
          <div className="relative w-36 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#666666]" />
            <input
              id="search-games-input"
              type="text"
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-white pl-8 pr-2.5 py-1 rounded text-xs placeholder-[#666666] focus:outline-none focus:border-white transition-colors"
            />
          </div>

          {/* 1:1 Small Square Sort Button (in between Search & Cache) with Genre Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="genre-sort-dropdown-btn"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className={`w-7 h-7 sm:w-7.5 sm:h-7.5 aspect-square rounded border flex items-center justify-center transition-colors cursor-pointer ${
                isDropdownOpen || selectedGenre !== 'All'
                  ? 'bg-white text-black border-white'
                  : 'bg-[#111111] hover:bg-[#1a1a1a] border-[#262626] text-[#aaaaaa] hover:text-white'
              }`}
              title={selectedGenre !== 'All' ? `Genre: ${selectedGenre}` : 'Sort / Filter by genre'}
              aria-label="Filter genres"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div
                id="genre-dropdown-menu"
                className="absolute right-0 mt-1.5 w-44 bg-[#0e0e10] border border-[#222225] rounded-lg shadow-2xl py-1 z-50 text-xs overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-[#666666] tracking-wider border-b border-[#1c1c1f]">
                  Filter by Genre
                </div>
                <div className="max-h-64 overflow-y-auto py-1 scrollbar-none">
                  {genres.map((genre) => {
                    const isSelected = selectedGenre === genre;
                    return (
                      <button
                        key={genre}
                        id={`filter-genre-item-${genre.toLowerCase().replace(/\s+/g, '-')}`}
                        onClick={() => {
                          onSelectGenre(genre);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 flex items-center justify-between text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#1c1c20] text-white font-semibold'
                            : 'text-[#8e8e93] hover:text-white hover:bg-[#151518]'
                        }`}
                      >
                        <span className="truncate">{genre}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Cache Button placed directly next to Sort */}
          <button
            id="open-cache-manager-btn"
            onClick={onOpenCacheManager}
            className="bg-[#111111] hover:bg-[#1a1a1a] border border-[#262626] text-[#aaaaaa] hover:text-white px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Open Cache Manager & Expiration Timers"
          >
            <HardDrive className="w-3.5 h-3.5 text-white" />
            <span>{cachedCount > 0 ? `${cachedCount} (${totalCachedSize})` : 'Cache'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
