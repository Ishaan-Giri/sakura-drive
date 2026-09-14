import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from '../utils/math';

/** Meters of road covered by one vertical repeat of the texture. */
export const ROAD_TEXTURE_REPEAT = 8;

/**
 * Procedural asphalt: soft warm-grey tarmac, solid white edge lines and a dashed centre line.
 * Canvas X spans the full asphalt width (left edge → right edge), Y spans ROAD_TEXTURE_REPEAT meters.
 */
export function createRoadTexture(maxAnisotropy: number): CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(99);

  ctx.fillStyle = '#74777c';
  ctx.fillRect(0, 0, w, h);

  // Aggregate speckle.
  for (let i = 0; i < 9000; i++) {
    const v = 95 + Math.floor(rng() * 50);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + rng() * 0.35})`;
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }

  // Slightly darker tyre tracks in the middle of each lane.
  const px = (m: number) => ((m + 3.8) / 7.6) * w; // meters from centre → pixels
  ctx.fillStyle = 'rgba(40,42,48,0.10)';
  for (const lane of [-1.75, 1.75]) {
    for (const off of [-0.8, 0.8]) ctx.fillRect(px(lane + off) - 8, 0, 16, h);
  }

  // Edge lines (solid) and centre line (dashed, 3 m of every 8 m).
  ctx.fillStyle = '#f4f1ea';
  const lineW = (0.15 / 7.6) * w;
  ctx.fillRect(px(-3.5) - lineW / 2, 0, lineW, h);
  ctx.fillRect(px(3.5) - lineW / 2, 0, lineW, h);
  const dash = (3 / ROAD_TEXTURE_REPEAT) * h;
  ctx.fillRect(px(0) - lineW / 2, (h - dash) / 2, lineW, dash);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}
