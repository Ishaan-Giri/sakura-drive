import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, type BufferGeometry } from 'three';
import { mulberry32 } from '../../utils/math';
import { mergeParts, paint } from './util';

const VERMILION = 0xd9462e;
const TORII_BLACK = 0x2d2626;
const STONE = [0xaaa79d, 0xa09d93, 0xb3b0a6];
const WOOD_DARK = 0x6b5040;

function box(w: number, h: number, d: number, x: number, y: number, z: number): BoxGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Vermilion torii gate spanning the road. Origin at road centre, gate faces ±Z. */
export function torii(): BufferGeometry {
  const rng = mulberry32(7);
  const parts: BufferGeometry[] = [];
  const span = 5.3;
  for (const side of [-1, 1]) {
    const pillar = new CylinderGeometry(0.26, 0.31, 6.6, 8);
    pillar.translate(side * span, 3.3, 0);
    parts.push(paint(pillar, VERMILION, 0.03, rng));
    const foot = new CylinderGeometry(0.34, 0.36, 0.55, 8);
    foot.translate(side * span, 0.27, 0);
    parts.push(paint(foot, TORII_BLACK, 0, rng));
  }
  // Nuki (tie beam) and gakuzuka (centre strut).
  parts.push(paint(box(span * 2 + 1.4, 0.3, 0.3, 0, 5.3, 0), VERMILION, 0.03, rng));
  parts.push(paint(box(0.3, 0.9, 0.24, 0, 5.85, 0), VERMILION, 0.03, rng));
  // Shimaki + kasagi: the top lintel with gently upswept ends.
  parts.push(paint(box(span * 2 + 1.8, 0.32, 0.5, 0, 6.45, 0), VERMILION, 0.03, rng));
  parts.push(paint(box(span * 2 + 0.6, 0.36, 0.66, 0, 6.8, 0), TORII_BLACK, 0.02, rng));
  for (const side of [-1, 1]) {
    const end = box(1.9, 0.36, 0.66, 0, 0, 0);
    end.rotateZ(side * 0.14);
    end.translate(side * (span + 1.05), 6.93, 0);
    parts.push(paint(end, TORII_BLACK, 0.02, rng));
  }
  return mergeParts(parts);
}

/** Stone lantern (tōrō), ~1.9 m tall. */
export function stoneLantern(): BufferGeometry {
  const rng = mulberry32(11);
  const parts: BufferGeometry[] = [];
  parts.push(paint(box(0.75, 0.22, 0.75, 0, 0.11, 0), STONE, 0.05, rng));
  const col = new CylinderGeometry(0.15, 0.18, 0.85, 6);
  col.translate(0, 0.64, 0);
  parts.push(paint(col, STONE, 0.05, rng));
  parts.push(paint(box(0.62, 0.14, 0.62, 0, 1.12, 0), STONE, 0.05, rng));
  parts.push(paint(box(0.42, 0.4, 0.42, 0, 1.39, 0), [0xf1e3bd, 0xe9dab2], 0, rng));
  const roof = new ConeGeometry(0.62, 0.38, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 1.78, 0);
  parts.push(paint(roof, STONE, 0.05, rng));
  const knob = new IcosahedronGeometry(0.09, 0);
  knob.translate(0, 2.0, 0);
  parts.push(paint(knob, STONE, 0.05, rng));
  return mergeParts(parts);
}

/** Gabled roof made of two slabs meeting at a ridge along Z. */
function gableRoof(parts: BufferGeometry[], rng: () => number, width: number, depth: number, baseY: number, pitch: number, color: number | number[]) {
  const half = width / 2 + 0.45;
  const slabLen = half / Math.cos(pitch);
  const rise = Math.tan(pitch);
  for (const side of [-1, 1]) {
    // Each slab runs from the ridge (x = 0) down to just past the wall on its side.
    const slab = new BoxGeometry(slabLen, 0.18, depth + 0.9);
    slab.translate((side * slabLen) / 2, 0, 0);
    slab.rotateZ(-side * pitch);
    slab.translate(0, baseY + rise * half, 0);
    parts.push(paint(slab, color, 0.04, rng));
  }
  // Triangular gable wall under the roof: a 3-sided cylinder is a triangular prism.
  const gableH = rise * (width / 2);
  const gable = new CylinderGeometry(1, 1, depth, 3);
  gable.rotateX(-Math.PI / 2);
  gable.scale(width / Math.sqrt(3), gableH / 1.5, 1);
  gable.translate(0, baseY + gableH / 3, 0);
  parts.push(paint(gable, 0xe8dfca, 0.02, rng));
}

/**
 * Japanese houses. Front faces +Z (towards the road once rotated).
 * variant 0: single-storey with dark tiled gable roof
 * variant 1: two-storey modern house with blue-grey roof
 * variant 2: traditional farmhouse with steep thatch-coloured roof
 */
export function house(variant: number): BufferGeometry {
  const rng = mulberry32(100 + variant);
  const parts: BufferGeometry[] = [];
  const walls = [0xf1e8d4, 0xeee4cf, 0xf5eee0];
  if (variant === 0) {
    const w = 6.5, d = 7, h = 3;
    parts.push(paint(box(w, h, d, 0, h / 2, 0), walls, 0.02, rng));
    parts.push(paint(box(w + 0.1, 0.35, d + 0.1, 0, 0.18, 0), WOOD_DARK, 0.03, rng));
    parts.push(paint(box(1.4, 1.1, 0.08, -1.5, 1.7, d / 2 + 0.04), 0x3d4d5e, 0.02, rng));
    parts.push(paint(box(1.4, 1.1, 0.08, 1.6, 1.7, d / 2 + 0.04), 0x3d4d5e, 0.02, rng));
    parts.push(paint(box(1.0, 2.0, 0.08, 0.1, 1.0, d / 2 + 0.04), 0x8a6248, 0.02, rng));
    gableRoof(parts, rng, w, d, h, 0.5, [0x46505e, 0x4d5868]);
  } else if (variant === 1) {
    const w = 5.5, d = 6, h = 5.6;
    parts.push(paint(box(w, h, d, 0, h / 2, 0), walls, 0.02, rng));
    for (const y of [1.5, 4.2]) {
      parts.push(paint(box(1.2, 1.0, 0.08, -1.3, y, d / 2 + 0.04), 0x3d4d5e, 0.02, rng));
      parts.push(paint(box(1.2, 1.0, 0.08, 1.3, y, d / 2 + 0.04), 0x3d4d5e, 0.02, rng));
    }
    parts.push(paint(box(w + 0.3, 0.14, 1.2, 0, 3.0, d / 2 + 0.5), 0x5b6b80, 0.03, rng));
    const roof = new ConeGeometry(Math.hypot(w, d) / 2 + 0.6, 1.8, 4);
    roof.rotateY(Math.PI / 4);
    roof.scale(w / d, 1, 1);
    roof.translate(0, h + 0.9, 0);
    parts.push(paint(roof, [0x5b6b80, 0x627389], 0.04, rng));
  } else {
    const w = 8, d = 6.5, h = 2.8;
    parts.push(paint(box(w, h, d, 0, h / 2, 0), [0xe9dcc0, 0xe2d4b6], 0.03, rng));
    for (const x of [-w / 2 + 0.1, -1.3, 1.3, w / 2 - 0.1]) {
      parts.push(paint(box(0.22, h, 0.22, x, h / 2, d / 2 + 0.05), WOOD_DARK, 0.03, rng));
    }
    parts.push(paint(box(2.2, 1.9, 0.08, 0, 1.0, d / 2 + 0.04), 0x7a5840, 0.02, rng));
    gableRoof(parts, rng, w, d, h, 0.78, [0xb48a55, 0xa98050, 0xbc9460]);
  }
  return mergeParts(parts);
}

/** Wooden utility pole with a cross-arm; wires attach at (±0.7, 8.35). */
export const POLE_WIRE_Y = 8.35;
export const POLE_WIRE_X = 0.7;
export function utilityPole(): BufferGeometry {
  const rng = mulberry32(21);
  const parts: BufferGeometry[] = [];
  const pole = new CylinderGeometry(0.12, 0.16, 9, 6);
  pole.translate(0, 4.5, 0);
  parts.push(paint(pole, 0x7e7568, 0.04, rng));
  parts.push(paint(box(1.7, 0.12, 0.12, 0, 8.3, 0), 0x6d6459, 0.02, rng));
  const tr = new CylinderGeometry(0.28, 0.28, 0.8, 7);
  tr.translate(0.32, 7.2, 0);
  parts.push(paint(tr, 0x9a9e9f, 0.02, rng));
  return mergeParts(parts);
}

/** A cheerful roadside vending machine — very Japan. Front faces +Z. */
export function vendingMachine(seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const parts: BufferGeometry[] = [];
  const body = [0xe9edf1, 0xd8453e, 0x4b7fc9][seed % 3];
  parts.push(paint(box(1.0, 1.85, 0.8, 0, 0.925, 0), body, 0.02, rng));
  parts.push(paint(box(0.86, 0.9, 0.04, 0, 1.3, 0.41), 0xdff0ff, 0, rng));
  for (let i = 0; i < 6; i++) {
    parts.push(paint(box(0.1, 0.22, 0.03, -0.32 + i * 0.13, 1.3, 0.44), [0xf4a259, 0x7cc47f, 0xe45a5a, 0x6fb3e0], 0, rng));
  }
  parts.push(paint(box(0.7, 0.18, 0.05, 0, 0.35, 0.41), 0x333a40, 0, rng));
  return mergeParts(parts);
}
