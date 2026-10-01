export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  currX: number;
  currY: number;
  prevX: number;
  prevY: number;
}

export interface BlockItem {
  x: number;
  y: number;
  createdAt: number;
  expiresAt: number;
}

export type MovementStyle = 'snappy' | 'smooth';
export type SpeedMode = 'chill' | 'normal' | 'fast';

export const SPEED_CONFIG: Record<SpeedMode, { label: string; tickMs: number; multiplier: string }> = {
  chill: { label: 'Chill', tickMs: 155, multiplier: '0.7x' },
  normal: { label: 'Normal', tickMs: 110, multiplier: '1x' },
  fast: { label: 'Fast', tickMs: 80, multiplier: '1.4x' },
};

// Convert direction vector to angle in radians
export function dirToAngle(dir: Point): number {
  if (dir.x === 1) return 0;
  if (dir.x === -1) return Math.PI;
  if (dir.y === 1) return Math.PI / 2;
  if (dir.y === -1) return -Math.PI / 2;
  return 0;
}

// Helper to interpolate between two angles cleanly
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  gridSize: number,
  cellW: number,
  cellH: number
) {
  const colorLight = '#aad751';
  const colorDark = '#a2d149';

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? colorLight : colorDark;
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
    }
  }
}

export function drawBlocks(
  ctx: CanvasRenderingContext2D,
  blocks: BlockItem[],
  cellW: number,
  cellH: number,
  blockImg: HTMLImageElement | null,
  realTime: number
) {
  const pad = 2.5;
  blocks.forEach((b) => {
    const bx = b.x * cellW;
    const by = b.y * cellH;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.beginPath();
    ctx.ellipse(bx + cellW / 2, by + cellH - 3, cellW * 0.42, cellH * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flashing in last 4 seconds
    const timeLeft = b.expiresAt - realTime;
    if (timeLeft < 4000 && Math.floor(timeLeft / 250) % 2 === 0) {
      ctx.globalAlpha = 0.35;
    } else {
      ctx.globalAlpha = 1.0;
    }

    if (blockImg && blockImg.complete && blockImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(bx + pad, by + pad, cellW - pad * 2, cellH - pad * 2, 6);
      ctx.clip();

      const minDim = Math.min(blockImg.naturalWidth, blockImg.naturalHeight);
      const sx = (blockImg.naturalWidth - minDim) / 2;
      const sy = (blockImg.naturalHeight - minDim) / 2;
      ctx.drawImage(
        blockImg,
        sx,
        sy,
        minDim,
        minDim,
        bx + pad,
        by + pad,
        cellW - pad * 2,
        cellH - pad * 2
      );
      ctx.restore();

      // Danger boundary
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx + pad, by + pad, cellW - pad * 2, cellH - pad * 2, 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.roundRect(bx + pad, by + pad, cellW - pad * 2, cellH - pad * 2, 6);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  });
}

export function drawFood(
  ctx: CanvasRenderingContext2D,
  food: Point,
  cellW: number,
  cellH: number,
  foodImg: HTMLImageElement | null
) {
  const fx = food.x * cellW;
  const fy = food.y * cellH;
  const fPad = 2;

  // Soft ground drop-shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.ellipse(fx + cellW / 2, fy + cellH - 3, cellW * 0.38, cellH * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  if (foodImg && foodImg.complete && foodImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(fx + fPad, fy + fPad, cellW - fPad * 2, cellH - fPad * 2, 7);
    ctx.clip();

    const minDim = Math.min(foodImg.naturalWidth, foodImg.naturalHeight);
    const sx = (foodImg.naturalWidth - minDim) / 2;
    const sy = (foodImg.naturalHeight - minDim) / 2;
    ctx.drawImage(
      foodImg,
      sx,
      sy,
      minDim,
      minDim,
      fx + fPad,
      fy + fPad,
      cellW - fPad * 2,
      cellH - fPad * 2
    );
    ctx.restore();
  } else {
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(fx + cellW / 2, fy + cellH / 2, cellW * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawSnake(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  movementStyle: MovementStyle,
  progress: number,
  cellW: number,
  cellH: number,
  snakeImg: HTMLImageElement | null,
  headAngle: number
) {
  // Determine segment coordinates
  const interpCoords: Point[] = segments.map((seg) => {
    if (movementStyle === 'snappy') {
      return {
        x: seg.currX * cellW,
        y: seg.currY * cellH,
      };
    }
    return {
      x: (seg.prevX + (seg.currX - seg.prevX) * progress) * cellW,
      y: (seg.prevY + (seg.currY - seg.prevY) * progress) * cellH,
    };
  });

  // A. Ground shadows
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  interpCoords.forEach((pt) => {
    ctx.beginPath();
    ctx.ellipse(pt.x + cellW / 2, pt.y + cellH - 2, cellW * 0.44, cellH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // B. Draw connected body capsules between segments
  const bodyColor = '#4285f4'; // Authentic Google Snake blue
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = cellW * 0.76;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let i = 0; i < interpCoords.length; i++) {
    const pt = interpCoords[i];
    const cx = pt.x + cellW / 2;
    const cy = pt.y + cellH / 2;
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }
  ctx.stroke();

  // C. Render segments
  interpCoords.forEach((pt, idx) => {
    const isHead = idx === 0;
    const pad = 1.5;
    const cx = pt.x + cellW / 2;
    const cy = pt.y + cellH / 2;

    if (snakeImg && snakeImg.complete && snakeImg.naturalWidth > 0) {
      ctx.save();
      ctx.translate(cx, cy);

      if (isHead) {
        ctx.rotate(headAngle);
      }

      ctx.beginPath();
      const cornerRadius = isHead ? 10 : 7;
      ctx.roundRect(
        -cellW / 2 + pad,
        -cellH / 2 + pad,
        cellW - pad * 2,
        cellH - pad * 2,
        cornerRadius
      );
      ctx.clip();

      const minDim = Math.min(snakeImg.naturalWidth, snakeImg.naturalHeight);
      const cropX = (snakeImg.naturalWidth - minDim) / 2;
      const cropY = (snakeImg.naturalHeight - minDim) / 2;
      ctx.drawImage(
        snakeImg,
        cropX,
        cropY,
        minDim,
        minDim,
        -cellW / 2 + pad,
        -cellH / 2 + pad,
        cellW - pad * 2,
        cellH - pad * 2
      );
      ctx.restore();

      // Render Head Outline & Eyes
      if (isHead) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(headAngle);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(
          -cellW / 2 + pad,
          -cellH / 2 + pad,
          cellW - pad * 2,
          cellH - pad * 2,
          10
        );
        ctx.stroke();

        // Expressive eyes facing forward
        const eyeX = cellW * 0.18;
        const eyeY1 = -cellH * 0.22;
        const eyeY2 = cellH * 0.22;
        const eyeRadius = cellW * 0.13;
        const pupilRadius = cellW * 0.07;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY1, eyeRadius, 0, Math.PI * 2);
        ctx.arc(eyeX, eyeY2, eyeRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath();
        ctx.arc(eyeX + eyeRadius * 0.35, eyeY1, pupilRadius, 0, Math.PI * 2);
        ctx.arc(eyeX + eyeRadius * 0.35, eyeY2, pupilRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      if (isHead) ctx.rotate(headAngle);

      ctx.fillStyle = isHead ? '#3b82f6' : '#60a5fa';
      ctx.beginPath();
      ctx.roundRect(
        -cellW / 2 + pad,
        -cellH / 2 + pad,
        cellW - pad * 2,
        cellH - pad * 2,
        isHead ? 10 : 6
      );
      ctx.fill();

      if (isHead) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cellW * 0.18, -cellH * 0.22, cellW * 0.13, 0, Math.PI * 2);
        ctx.arc(cellW * 0.18, cellH * 0.22, cellW * 0.13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath();
        ctx.arc(cellW * 0.23, -cellH * 0.22, cellW * 0.07, 0, Math.PI * 2);
        ctx.arc(cellW * 0.23, cellH * 0.22, cellW * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  });
}

export function drawTutorial(
  ctx: CanvasRenderingContext2D,
  width: number,
  cellW: number,
  cellH: number
) {
  const boxSize = cellW * 3.4;
  const boxX = (width - boxSize) / 2;
  const boxY = cellH * 1.5;

  ctx.fillStyle = 'rgba(53, 78, 32, 0.94)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxSize, boxSize, 16);
  ctx.fill();

  const centerK = boxX + boxSize * 0.38;
  const centerKy = boxY + boxSize * 0.44;
  const keySize = boxSize * 0.22;
  const halfK = keySize / 2;
  const offset = keySize * 1.08;

  const drawKey = (kx: number, ky: number, dir: 'up' | 'down' | 'left' | 'right') => {
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(kx - halfK, ky - halfK, keySize, keySize, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const triS = keySize * 0.3;
    if (dir === 'up') {
      ctx.moveTo(kx, ky - triS);
      ctx.lineTo(kx - triS, ky + triS * 0.7);
      ctx.lineTo(kx + triS, ky + triS * 0.7);
    } else if (dir === 'down') {
      ctx.moveTo(kx, ky + triS);
      ctx.lineTo(kx - triS, ky - triS * 0.7);
      ctx.lineTo(kx + triS, ky - triS * 0.7);
    } else if (dir === 'left') {
      ctx.moveTo(kx - triS, ky);
      ctx.lineTo(kx + triS * 0.7, ky - triS);
      ctx.lineTo(kx + triS * 0.7, ky + triS);
    } else if (dir === 'right') {
      ctx.moveTo(kx + triS, ky);
      ctx.lineTo(kx - triS * 0.7, ky - triS);
      ctx.lineTo(kx - triS * 0.7, ky + triS);
    }
    ctx.closePath();
    ctx.fill();
  };

  drawKey(centerK, centerKy - offset, 'up');
  drawKey(centerK, centerKy + offset, 'down');
  drawKey(centerK - offset, centerKy, 'left');
  drawKey(centerK + offset, centerKy, 'right');

  // Pointing hand icon
  ctx.font = `${Math.round(boxSize * 0.38)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👆', boxX + boxSize * 0.66, boxY + boxSize * 0.62);

  // Helper text
  ctx.fillStyle = '#e8f5dc';
  ctx.font = `bold ${Math.round(cellW * 0.32)}px sans-serif`;
  ctx.fillText('Press arrow / WASD / swipe', width / 2, boxY + boxSize + cellH * 0.55);
}
