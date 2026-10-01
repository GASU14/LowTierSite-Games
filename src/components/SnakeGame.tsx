import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  RotateCcw,
  Trophy,
  X,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Zap,
  Gauge,
} from 'lucide-react';
import {
  Point,
  Segment,
  BlockItem,
  MovementStyle,
  SpeedMode,
  SPEED_CONFIG,
  dirToAngle,
  lerpAngle,
  drawCheckerboard,
  drawBlocks,
  drawFood,
  drawSnake,
  drawTutorial,
} from '../utils/snakeRenderer';
import {
  playEatSound,
  playBlockSpawnSound,
  playGameOverSound,
} from '../utils/snakeAudio';

interface SnakeGameProps {
  onClose?: () => void;
}

const GRID_SIZE = 10;
const CANVAS_DIM = 380; // 38px per cell

// Local sprites with reliable fallbacks
const SNAKE_IMG_SRC = '/snake/snake.jpg';
const FOOD_IMG_SRC = '/snake/food.png';
const BLOCK_IMG_SRC = '/snake/block.png';

const FALLBACK_SNAKE_URL =
  'https://imgs.search.brave.com/cm6F0bTxC5_l62P_KUrVGMC46kN6N9xAJsl6Rm8ElyI/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9pLnBp/bmltZy5jb20vb3Jp/Z2luYWxzL2QxL2Ji/L2MyL2QxYmJjMjhl/MDBjOWE0YjlhNjJk/OGJjYWQ0ZWE1YjE3/LmpwZw';
const FALLBACK_FOOD_URL =
  'https://imgs.search.brave.com/qjcDwnSwqRgKdahkfeY3D764vYPolJ8_bJ_9-th5qak/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4u/cGl4YWJheS5jb20v/cGhvdG8vMjAxNC8w/NC8wMi8xMS8wMS9s/aWdodG5pbmctMzA1/MjI5XzY0MC5wbmc';
const FALLBACK_BLOCK_URL =
  'https://imgs.search.brave.com/0PyOHT93iRfGpPUg96KjxmMoLN4yH26IOqWERezc5sg/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly93d3cu/cGRmZmlsbGVyLmNv/bS9wcmV2aWV3LzEv/OTkvMTA5OTM5Ny9s/YXJnZS5wbmc';

export const SnakeGame: React.FC<SnakeGameProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sprites
  const snakeImgRef = useRef<HTMLImageElement | null>(null);
  const foodImgRef = useRef<HTMLImageElement | null>(null);
  const blockImgRef = useRef<HTMLImageElement | null>(null);

  // Settings: Movement style (Default to 'snappy' for instant, crisp Google Snake responsiveness)
  const [movementStyle, setMovementStyle] = useState<MovementStyle>(() => {
    try {
      const stored = localStorage.getItem('snake_movement_style');
      if (stored === 'smooth' || stored === 'snappy') return stored;
    } catch {}
    return 'snappy';
  });

  // Speed mode (Normal = 110ms, Fast = 80ms, Chill = 155ms)
  const [speedMode, setSpeedMode] = useState<SpeedMode>(() => {
    try {
      const stored = localStorage.getItem('snake_speed_mode');
      if (stored === 'chill' || stored === 'normal' || stored === 'fast') return stored;
    } catch {}
    return 'normal';
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('snake_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Scores
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return parseInt(localStorage.getItem('snake_high_score') || '0', 10);
    } catch {
      return 0;
    }
  });
  const [gameOver, setGameOver] = useState(false);
  const [activeBlocksCount, setActiveBlocksCount] = useState(0);

  // Core Simulation Refs
  const segmentsRef = useRef<Segment[]>([
    { currX: 4, currY: 5, prevX: 4, prevY: 5 },
    { currX: 3, currY: 5, prevX: 3, prevY: 5 },
    { currX: 2, currY: 5, prevX: 2, prevY: 5 },
  ]);
  const directionRef = useRef<Point>({ x: 1, y: 0 });
  const inputQueueRef = useRef<Point[]>([]);
  const foodRef = useRef<Point>({ x: 7, y: 5 });
  const blocksRef = useRef<BlockItem[]>([]);
  const isGameOverRef = useRef(false);
  const isStartedRef = useRef(false);

  // Dynamic values in refs for rAF loop
  const headAngleRef = useRef<number>(0);
  const targetHeadAngleRef = useRef<number>(0);
  const speedMsRef = useRef<number>(SPEED_CONFIG[speedMode].tickMs);
  speedMsRef.current = SPEED_CONFIG[speedMode].tickMs;
  const movementStyleRef = useRef<MovementStyle>(movementStyle);
  movementStyleRef.current = movementStyle;
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Touch Tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Toggle Movement Style
  const toggleMovementStyle = () => {
    setMovementStyle((prev) => {
      const next: MovementStyle = prev === 'snappy' ? 'smooth' : 'snappy';
      try {
        localStorage.setItem('snake_movement_style', next);
      } catch {}
      return next;
    });
  };

  // Cycle Speed Mode
  const cycleSpeed = () => {
    setSpeedMode((prev) => {
      const next: SpeedMode = prev === 'chill' ? 'normal' : prev === 'normal' ? 'fast' : 'chill';
      try {
        localStorage.setItem('snake_speed_mode', next);
      } catch {}
      return next;
    });
  };

  // Toggle Sound
  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('snake_sound_enabled', next ? 'true' : 'false');
      } catch {}
      return next;
    });
  };

  // Preload Sprites
  useEffect(() => {
    const sImg = new Image();
    sImg.crossOrigin = 'anonymous';
    sImg.onerror = () => {
      sImg.src = FALLBACK_SNAKE_URL;
    };
    sImg.src = SNAKE_IMG_SRC;
    snakeImgRef.current = sImg;

    const fImg = new Image();
    fImg.crossOrigin = 'anonymous';
    fImg.onerror = () => {
      fImg.src = FALLBACK_FOOD_URL;
    };
    fImg.src = FOOD_IMG_SRC;
    foodImgRef.current = fImg;

    const bImg = new Image();
    bImg.crossOrigin = 'anonymous';
    bImg.onerror = () => {
      bImg.src = FALLBACK_BLOCK_URL;
    };
    bImg.src = BLOCK_IMG_SRC;
    blockImgRef.current = bImg;
  }, []);

  // Helper for cryptographically strong random float in [0, 1)
  const getCryptoRandom = (): number => {
    try {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] / (0xffffffff + 1);
    } catch {
      return Math.random();
    }
  };

  // Find completely random, uniformly distributed food cell across the entire board
  const getRandomFoodCell = useCallback((segments: Segment[], blocks: BlockItem[], prevFood?: Point): Point => {
    const occupied = new Set<string>();
    segments.forEach((s) => occupied.add(`${s.currX},${s.currY}`));
    blocks.forEach((b) => occupied.add(`${b.x},${b.y}`));

    const head = segments[0];
    const freeCells: Point[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const key = `${x},${y}`;
        if (!occupied.has(key)) {
          // Avoid spawning directly on the snake head
          if (head && x === head.currX && y === head.currY) continue;
          freeCells.push({ x, y });
        }
      }
    }

    if (freeCells.length === 0) {
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          if (!occupied.has(`${x},${y}`)) freeCells.push({ x, y });
        }
      }
    }

    if (freeCells.length === 0) return { x: 0, y: 0 };

    // High entropy Fisher-Yates full coordinate shuffle (ensures 100% equal probability for center, inner, and edge cells)
    for (let i = freeCells.length - 1; i > 0; i--) {
      const j = Math.floor(getCryptoRandom() * (i + 1));
      [freeCells[i], freeCells[j]] = [freeCells[j], freeCells[i]];
    }

    // If previous food existed and we have multiple choices, prefer cells with natural dispersion (not immediately adjacent)
    if (prevFood && freeCells.length > 3) {
      const dispersed = freeCells.filter(
        (c) => Math.abs(c.x - prevFood.x) + Math.abs(c.y - prevFood.y) >= 2
      );
      if (dispersed.length > 0) {
        return dispersed[Math.floor(getCryptoRandom() * dispersed.length)];
      }
    }

    return freeCells[0];
  }, []);

  // Specialized block/obstacle randomizer with distance spacing from other blocks and fair head clearance
  const getRandomObstacleCell = useCallback((segments: Segment[], blocks: BlockItem[], currentDir: Point): Point => {
    const occupied = new Set<string>();
    segments.forEach((s) => occupied.add(`${s.currX},${s.currY}`));
    blocks.forEach((b) => occupied.add(`${b.x},${b.y}`));

    const head = segments[0];
    // Exclude immediate trajectory cells in front of the head (1 to 2 cells)
    const dangerousTrajectory = new Set<string>();
    if (head) {
      for (let step = 1; step <= 2; step++) {
        dangerousTrajectory.add(`${head.currX + currentDir.x * step},${head.currY + currentDir.y * step}`);
      }
    }

    const freeCells: Point[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        const key = `${x},${y}`;
        if (!occupied.has(key) && !dangerousTrajectory.has(key)) {
          freeCells.push({ x, y });
        }
      }
    }

    if (freeCells.length === 0) {
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          if (!occupied.has(`${x},${y}`)) freeCells.push({ x, y });
        }
      }
    }

    if (freeCells.length === 0) return { x: 0, y: 0 };

    // High entropy Fisher-Yates shuffle
    for (let i = freeCells.length - 1; i > 0; i--) {
      const j = Math.floor(getCryptoRandom() * (i + 1));
      [freeCells[i], freeCells[j]] = [freeCells[j], freeCells[i]];
    }

    // If there are existing blocks, pick a cell that is well-spaced so they don't bunch up next to each other
    if (blocks.length > 0) {
      for (const minDistance of [3, 2]) {
        const wellSpaced = freeCells.filter((cell) => {
          return blocks.every((b) => Math.abs(cell.x - b.x) + Math.abs(cell.y - b.y) >= minDistance);
        });
        if (wellSpaced.length > 0) {
          return wellSpaced[Math.floor(getCryptoRandom() * wellSpaced.length)];
        }
      }
    }

    return freeCells[0];
  }, []);

  // Reset Game
  const resetGame = useCallback(() => {
    segmentsRef.current = [
      { currX: 4, currY: 5, prevX: 4, prevY: 5 },
      { currX: 3, currY: 5, prevX: 3, prevY: 5 },
      { currX: 2, currY: 5, prevX: 2, prevY: 5 },
    ];
    directionRef.current = { x: 1, y: 0 };
    inputQueueRef.current = [];
    blocksRef.current = [];
    foodRef.current = getRandomFoodCell(segmentsRef.current, []);
    isGameOverRef.current = false;
    isStartedRef.current = false;
    headAngleRef.current = 0;
    targetHeadAngleRef.current = 0;
    setScore(0);
    setGameOver(false);
    setActiveBlocksCount(0);
  }, [getRandomFoodCell]);

  // Execute a single simulation step
  const executeTick = useCallback(() => {
    if (isGameOverRef.current) return;

    const now = Date.now();
    // Expire active obstacle blocks
    const prevBlockCount = blocksRef.current.length;
    blocksRef.current = blocksRef.current.filter((b) => b.expiresAt > now);
    if (blocksRef.current.length !== prevBlockCount) {
      setActiveBlocksCount(blocksRef.current.length);
    }

    // Dequeue next direction if queued
    if (inputQueueRef.current.length > 0) {
      directionRef.current = inputQueueRef.current.shift()!;
    }

    const dir = directionRef.current;
    targetHeadAngleRef.current = dirToAngle(dir);
    if (movementStyleRef.current === 'snappy') {
      headAngleRef.current = dirToAngle(dir);
    }

    const segments = segmentsRef.current;
    const head = segments[0];
    const newHeadPos: Point = { x: head.currX + dir.x, y: head.currY + dir.y };

    // Wall collision
    if (
      newHeadPos.x < 0 ||
      newHeadPos.x >= GRID_SIZE ||
      newHeadPos.y < 0 ||
      newHeadPos.y >= GRID_SIZE
    ) {
      isGameOverRef.current = true;
      setGameOver(true);
      playGameOverSound(soundEnabledRef.current);
      return;
    }

    // Self collision
    if (segments.some((seg) => seg.currX === newHeadPos.x && seg.currY === newHeadPos.y)) {
      isGameOverRef.current = true;
      setGameOver(true);
      playGameOverSound(soundEnabledRef.current);
      return;
    }

    // Cube obstacle collision
    if (blocksRef.current.some((b) => b.x === newHeadPos.x && b.y === newHeadPos.y)) {
      isGameOverRef.current = true;
      setGameOver(true);
      playGameOverSound(soundEnabledRef.current);
      return;
    }

    // Food collision
    const food = foodRef.current;
    const ateFood = newHeadPos.x === food.x && newHeadPos.y === food.y;

    if (ateFood) {
      // Growth: The entire snake moves forward continuously, and a new tail is added seamlessly (no body pause!)
      const newSegments: Segment[] = [];
      for (let i = 0; i < segments.length; i++) {
        if (i === 0) {
          newSegments.push({
            currX: newHeadPos.x,
            currY: newHeadPos.y,
            prevX: segments[0].currX,
            prevY: segments[0].currY,
          });
        } else {
          newSegments.push({
            currX: segments[i - 1].currX,
            currY: segments[i - 1].currY,
            prevX: segments[i].currX,
            prevY: segments[i].currY,
          });
        }
      }
      // Keep old tail as the newly grown segment
      const lastSeg = segments[segments.length - 1];
      newSegments.push({
        currX: lastSeg.currX,
        currY: lastSeg.currY,
        prevX: lastSeg.prevX,
        prevY: lastSeg.prevY,
      });

      segmentsRef.current = newSegments;

      const newScore = newSegments.length - 3;
      setScore(newScore);
      playEatSound(soundEnabledRef.current);

      setHighScore((prev) => {
        const updated = Math.max(prev, newScore);
        try {
          localStorage.setItem('snake_high_score', updated.toString());
        } catch {}
        return updated;
      });

      // Spawn timed obstacle cube every 5 score
      if (newScore > 0 && newScore % 5 === 0) {
        const newBlockPos = getRandomObstacleCell(newSegments, blocksRef.current, dir);
        const newBlock: BlockItem = {
          x: newBlockPos.x,
          y: newBlockPos.y,
          createdAt: now,
          expiresAt: now + 60000, // 1 minute
        };
        blocksRef.current.push(newBlock);
        setActiveBlocksCount(blocksRef.current.length);
        playBlockSpawnSound(soundEnabledRef.current);
      }

      foodRef.current = getRandomFoodCell(newSegments, blocksRef.current, food);
    } else {
      // Standard step: shift forward
      const newSegments: Segment[] = [];
      for (let i = 0; i < segments.length; i++) {
        if (i === 0) {
          newSegments.push({
            currX: newHeadPos.x,
            currY: newHeadPos.y,
            prevX: segments[0].currX,
            prevY: segments[0].currY,
          });
        } else {
          newSegments.push({
            currX: segments[i - 1].currX,
            currY: segments[i - 1].currY,
            prevX: segments[i].currX,
            prevY: segments[i].currY,
          });
        }
      }
      segmentsRef.current = newSegments;
    }
  }, [getRandomFoodCell, getRandomObstacleCell]);

  // Handle directional input with 0ms start latency & instant visual response
  const triggerMove = useCallback(
    (newDir: Point) => {
      if (isGameOverRef.current) return;

      // If game has not started, start immediately and take the first step on frame 0!
      if (!isStartedRef.current) {
        isStartedRef.current = true;
        directionRef.current = newDir;
        targetHeadAngleRef.current = dirToAngle(newDir);
        headAngleRef.current = dirToAngle(newDir);
        inputQueueRef.current = [];
        executeTick();
        return;
      }

      // Check against the last queued direction or current moving direction
      const lastDir =
        inputQueueRef.current.length > 0
          ? inputQueueRef.current[inputQueueRef.current.length - 1]
          : directionRef.current;

      // Prevent immediate 180° reverse
      if (newDir.x !== 0 && lastDir.x !== 0 && newDir.x === -lastDir.x) return;
      if (newDir.y !== 0 && lastDir.y !== 0 && newDir.y === -lastDir.y) return;
      // Ignore redundant direction
      if (newDir.x === lastDir.x && newDir.y === lastDir.y) return;

      // Instant visual feedback: head and eyes immediately orient to the new direction
      targetHeadAngleRef.current = dirToAngle(newDir);
      if (movementStyleRef.current === 'snappy') {
        headAngleRef.current = dirToAngle(newDir);
      }

      // Buffer up to 2 directions for fast responsive cornering (e.g. Right -> Down)
      if (inputQueueRef.current.length < 2) {
        inputQueueRef.current.push(newDir);
      }
    },
    [executeTick]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['arrowup', 'w'].includes(key)) {
        e.preventDefault();
        triggerMove({ x: 0, y: -1 });
      } else if (['arrowdown', 's'].includes(key)) {
        e.preventDefault();
        triggerMove({ x: 0, y: 1 });
      } else if (['arrowleft', 'a'].includes(key)) {
        e.preventDefault();
        triggerMove({ x: -1, y: 0 });
      } else if (['arrowright', 'd'].includes(key)) {
        e.preventDefault();
        triggerMove({ x: 1, y: 0 });
      } else if (key === ' ' || key === 'r' || key === 'enter') {
        if (isGameOverRef.current) {
          e.preventDefault();
          resetGame();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerMove, resetGame]);

  // Touch / Swipe controls on canvas
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) > 20) {
      if (absDx > absDy) {
        triggerMove(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
      } else {
        triggerMove(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
      }
    } else {
      // Tap on canvas
      if (isGameOverRef.current) resetGame();
      else if (!isStartedRef.current) triggerMove({ x: 1, y: 0 });
    }
    touchStartRef.current = null;
  };

  // Unified requestAnimationFrame Game & Render Loop with fixed-timestep delta accumulator
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let accumulator = 0;

    const loop = (now: number) => {
      const dt = Math.min(now - lastTime, 100); // Guard against giant delta jumps on tab switches
      lastTime = now;

      const currentTickMs = speedMsRef.current;

      // Update simulation ticks
      if (isStartedRef.current && !isGameOverRef.current) {
        accumulator += dt;
        while (accumulator >= currentTickMs) {
          accumulator -= currentTickMs;
          executeTick();
          if (isGameOverRef.current) break;
        }
      } else {
        accumulator = 0;
      }

      // Smooth progress factor (0.0 to 1.0) for interpolation
      const progress =
        isStartedRef.current && !isGameOverRef.current && currentTickMs > 0
          ? Math.min(1.0, Math.max(0.0, accumulator / currentTickMs))
          : 1.0;

      // Canvas Rendering
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          const cellW = width / GRID_SIZE;
          const cellH = height / GRID_SIZE;

          // 1. Checkerboard grass
          drawCheckerboard(ctx, GRID_SIZE, cellW, cellH);

          // 2. Head angle updates (instant feedback on turn, responsive tracking)
          if (movementStyleRef.current === 'snappy') {
            headAngleRef.current = targetHeadAngleRef.current;
          } else {
            headAngleRef.current = lerpAngle(
              headAngleRef.current,
              targetHeadAngleRef.current,
              Math.min(1.0, dt * 0.04)
            );
          }

          // 3. Timed Obstacle Blocks
          drawBlocks(ctx, blocksRef.current, cellW, cellH, blockImgRef.current, Date.now());

          // 4. Collectible Food
          drawFood(ctx, foodRef.current, cellW, cellH, foodImgRef.current);

          // 5. Snake (Snappy instant grid or smooth interpolation)
          drawSnake(
            ctx,
            segmentsRef.current,
            movementStyleRef.current,
            progress,
            cellW,
            cellH,
            snakeImgRef.current,
            headAngleRef.current
          );

          // 6. Tutorial Overlay before start
          if (!isStartedRef.current && !isGameOverRef.current) {
            drawTutorial(ctx, width, cellW, cellH);
          }
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [executeTick]);

  return (
    <div
      id="google-snake-wrapper"
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-3 sm:p-6'
          : 'flex flex-col select-none'
      }`}
    >
      {/* Authentic Google Snake Console Frame */}
      <div className="w-full max-w-[420px] rounded-b-xl overflow-hidden shadow-2xl flex flex-col border-t border-[#3d6024]">
        {/* Top Header Bar (#4a752c) */}
        <div className="bg-[#4a752c] px-3.5 py-2 flex items-center justify-between text-white select-none gap-2">
          {/* Left: Collectible icon + Score */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center overflow-hidden bg-black/10">
              <img
                src={FOOD_IMG_SRC}
                alt="collectible"
                className="w-5 h-5 object-contain"
                crossOrigin="anonymous"
                onError={(e: any) => {
                  e.target.src = FALLBACK_FOOD_URL;
                }}
              />
            </div>
            <span className="font-bold text-lg sm:text-xl text-white tracking-wide font-mono">
              {score}
            </span>

            {/* Highscore & Active Cube count */}
            <div className="flex items-center gap-1.5 ml-1.5 pl-2 border-l border-[#3a5d22] text-xs text-[#d7e9c5]">
              <span className="flex items-center gap-1 font-mono" title="High Score">
                <Trophy className="w-3.5 h-3.5 text-amber-300" />
                <span>{highScore}</span>
              </span>
              {activeBlocksCount > 0 && (
                <span
                  className="flex items-center gap-1 text-[10px] text-red-200 bg-red-900/50 px-1.5 py-0.5 rounded border border-red-700/50"
                  title="Active obstacle blocks (1 min lifetime)"
                >
                  <Clock className="w-2.5 h-2.5 text-red-300" />
                  <span>{activeBlocksCount}</span>
                </span>
              )}
            </div>
          </div>

          {/* Right: Snappy/Smooth Toggle, Speed, Sound, Fullscreen, Close */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Movement Mode Toggle: Snappy (Zero delay) vs Smooth */}
            <button
              onClick={toggleMovementStyle}
              className={`px-2 py-1 text-[11px] font-semibold rounded flex items-center gap-1 transition-colors cursor-pointer ${
                movementStyle === 'snappy'
                  ? 'bg-amber-400 text-amber-950 shadow-sm'
                  : 'bg-[#3a5d22] text-white/90 hover:text-white hover:bg-[#32521c]'
              }`}
              title={
                movementStyle === 'snappy'
                  ? 'Snappy movement (Classic Google Snake instant turns, zero delay). Click for Smooth.'
                  : 'Smooth movement. Click for Snappy (instant responsive).'
              }
            >
              <Zap className="w-3 h-3 fill-current" />
              <span>{movementStyle === 'snappy' ? 'Snappy' : 'Smooth'}</span>
            </button>

            {/* Speed Toggle */}
            <button
              onClick={cycleSpeed}
              className="px-2 py-1 bg-[#3a5d22] hover:bg-[#32521c] text-white/90 hover:text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title={`Game Speed: ${SPEED_CONFIG[speedMode].label} (${SPEED_CONFIG[speedMode].tickMs}ms per step). Click to change.`}
            >
              <Gauge className="w-3 h-3" />
              <span>{SPEED_CONFIG[speedMode].multiplier}</span>
            </button>

            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              className="p-1.5 text-white/80 hover:text-white rounded hover:bg-black/15 transition-colors cursor-pointer"
              title={soundEnabled ? 'Mute Sound' : 'Enable Sound'}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-white/50" />
              )}
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1.5 text-white/80 hover:text-white rounded hover:bg-black/15 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Close */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-white/80 hover:text-white rounded hover:bg-black/15 transition-colors cursor-pointer ml-0.5"
                title="Close Snake"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Board Frame (#4a752c padding around checkerboard grass) */}
        <div className="bg-[#4a752c] px-3 pb-3 sm:px-4 sm:pb-4 pt-0 flex flex-col items-center">
          <div className="relative w-full aspect-square rounded-sm overflow-hidden shadow-md flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={CANVAS_DIM}
              height={CANVAS_DIM}
              onClick={() => {
                if (isGameOverRef.current) resetGame();
                else if (!isStartedRef.current) triggerMove({ x: 1, y: 0 });
              }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="w-full h-full block cursor-pointer touch-none"
            />

            {/* Game Over Screen */}
            {gameOver && (
              <div className="absolute inset-0 bg-[#4a752c]/90 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center select-none animate-in fade-in duration-150">
                <span className="text-white font-black text-xl sm:text-2xl tracking-wider mb-1 drop-shadow-sm">
                  GAME OVER
                </span>
                <p className="text-sm text-[#e2f0d9] mb-4 font-mono">
                  Score: <strong className="text-white font-bold">{score}</strong> | High:{' '}
                  <strong className="text-amber-300 font-bold">{highScore}</strong>
                </p>
                <button
                  id="google-snake-restart-btn"
                  onClick={resetGame}
                  className="px-4 py-2 bg-white hover:bg-[#f0f0f0] active:scale-95 text-[#4a752c] font-bold text-xs sm:text-sm rounded-lg shadow-lg transition-transform flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-[#4a752c]" />
                  <span>PLAY AGAIN</span>
                </button>
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="w-full mt-2.5 flex items-center justify-between text-[11px] text-[#e0eed5]">
            <div className="flex flex-col">
              <span className="text-[#c9e0bb] font-medium">
                WASD / Arrows / Swipe
              </span>
              <span className="text-[10px] text-[#a7cf93]">
                Mode: {movementStyle === 'snappy' ? 'Instant Snappy' : 'Smooth Lerp'} ({SPEED_CONFIG[speedMode].tickMs}ms)
              </span>
            </div>

            {/* Touch / Click D-Pad for Chromebooks & Mobile */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => triggerMove({ x: -1, y: 0 })}
                className="w-7 h-7 bg-[#3a5d22] active:bg-[#2e4a1a] rounded text-white flex items-center justify-center cursor-pointer shadow-sm hover:bg-[#34551e]"
                title="Left"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => triggerMove({ x: 0, y: -1 })}
                  className="w-7 h-7 bg-[#3a5d22] active:bg-[#2e4a1a] rounded text-white flex items-center justify-center cursor-pointer shadow-sm hover:bg-[#34551e]"
                  title="Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => triggerMove({ x: 0, y: 1 })}
                  className="w-7 h-7 bg-[#3a5d22] active:bg-[#2e4a1a] rounded text-white flex items-center justify-center cursor-pointer shadow-sm hover:bg-[#34551e]"
                  title="Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                onClick={() => triggerMove({ x: 1, y: 0 })}
                className="w-7 h-7 bg-[#3a5d22] active:bg-[#2e4a1a] rounded text-white flex items-center justify-center cursor-pointer shadow-sm hover:bg-[#34551e]"
                title="Right"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
