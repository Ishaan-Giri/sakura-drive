import { randRange } from '../utils/math';
import type { BiomeId } from './Biomes';
import type { PropName } from './props/library';
import { RIVER_INNER, RIVER_OUTER, type Row, type Terrain } from './Terrain';

export interface Placement {
  name: PropName;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  tint: number;
}

export interface WirePoint {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
}

export interface ScatterArgs {
  terrain: Terrain;
  rng: () => number;
  density: number;
  sStart: number;
  sEnd: number;
  add: (p: Placement) => void;
  wire: (a: WirePoint, b: WirePoint) => void;
}

/** Nothing is ever placed closer to the centre line than this (the torii gates are the exception). */
const MIN_U = 5.6;
const POLE_SPACING = 32;
const POLE_U = -6.6; // left side, the side the car drives on
const TORII_SPACING = 7;
const SAKURA = ['sakura0', 'sakura1', 'sakura2'] as const;
const GREENS = ['round0', 'round1', 'fresh0'] as const;
const PINES = ['pine0', 'pine1'] as const;
const BAMBOO = ['bamboo0', 'bamboo1'] as const;
const GRASS = ['grass0', 'grass1'] as const;
const HOUSES = ['house0', 'house1', 'house2'] as const;
const VENDING = ['vending0', 'vending1', 'vending2'] as const;

/**
 * Fills one chunk with scenery. Placement is biome-weighted: at a biome boundary every candidate
 * is accepted with the probability of its biome's weight, which dissolves one biome into the next.
 */
export function scatterChunk(args: ScatterArgs): void {
  const { terrain, rng, density, sStart, sEnd, add } = args;
  const rowCache = new Map<number, Row>();
  const rowAt = (s: number): Row => {
    const key = Math.round(s * 2);
    let row = rowCache.get(key);
    if (!row) rowCache.set(key, (row = terrain.row(key / 2)));
    return row;
  };

  /** Place a prop standing on the ground at (s, u). `face` 0 = random, 1 = facing the road. */
  const put = (
    name: PropName,
    s: number,
    u: number,
    opts: { scale?: [number, number]; face?: 0 | 1 | 2; allowWater?: boolean; tint?: number } = {},
  ): boolean => {
    if (Math.abs(u) < MIN_U && name !== 'torii') return false;
    const row = rowAt(s);
    if (!opts.allowWater && terrain.isWater(row, u)) return false;
    const p = { x: 0, y: 0, z: 0 };
    terrain.point(row, u, p);
    const face = opts.face ?? 0;
    let yaw = row.frame.heading;
    if (face === 0) yaw += rng() * Math.PI * 2;
    else if (face === 1) yaw += (u > 0 ? 1 : -1) * (Math.PI / 2) + randRange(rng, -0.06, 0.06);
    const scale = opts.scale ? randRange(rng, opts.scale[0], opts.scale[1]) : 1;
    add({ name, x: p.x, y: p.y, z: p.z, yaw, scale, tint: opts.tint ?? randRange(rng, 0.92, 1.06) });
    return true;
  };

  const pickOf = <T extends PropName>(list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];
  const weight = (id: BiomeId, s: number) => terrain.biomes.weight(id, s);
  const accept = (id: BiomeId, s: number) => rng() < weight(id, s);
  const scatterCount = (n: number) => Math.round(n * density);

  // ---- Cherry blossom avenue -------------------------------------------------
  for (let s = sStart; s < sEnd; s += 8.5) {
    for (const side of [-1, 1]) {
      const ss = s + randRange(rng, -1.5, 1.5);
      if (!accept('sakura', ss)) continue;
      put(pickOf(SAKURA), ss, side * randRange(rng, 7.6, 9.4), { scale: [0.95, 1.3] });
    }
  }
  for (let s = sStart + 5; s < sEnd; s += 11) {
    const side = rng() < 0.5 ? -1 : 1;
    if (!accept('sakura', s)) continue;
    put(pickOf(SAKURA), s + randRange(rng, -2, 2), side * randRange(rng, 15, 21), { scale: [0.9, 1.25] });
  }
  for (let i = 0; i < scatterCount(26); i++) {
    const s = randRange(rng, sStart, sEnd);
    if (!accept('sakura', s)) continue;
    const u = (rng() < 0.5 ? -1 : 1) * randRange(rng, 22, 110);
    const r = rng();
    put(r < 0.55 ? pickOf(SAKURA) : r < 0.8 ? pickOf(GREENS) : pickOf(PINES), s, u, { scale: [0.9, 1.4] });
  }

  // ---- Riverside -------------------------------------------------------------
  {
    const mid = rowAt((sStart + sEnd) / 2);
    const rs = mid.riverSide;
    for (let s = sStart; s < sEnd; s += 10) {
      if (!accept('riverside', s)) continue;
      const near = s + randRange(rng, -2, 2);
      put(rng() < 0.7 ? pickOf(SAKURA) : pickOf(GREENS), near, rs * randRange(rng, 12, 17), { scale: [0.9, 1.25] });
    }
    for (let i = 0; i < scatterCount(14); i++) {
      const s = randRange(rng, sStart, sEnd);
      if (!accept('riverside', s)) continue;
      put(rng() < 0.5 ? pickOf(GREENS) : pickOf(PINES), s, rs * randRange(rng, RIVER_OUTER + 8, 120), { scale: [0.9, 1.4] });
    }
    for (let i = 0; i < scatterCount(18); i++) {
      const s = randRange(rng, sStart, sEnd);
      if (!accept('riverside', s)) continue;
      const r = rng();
      put(r < 0.45 ? pickOf(GREENS) : r < 0.75 ? pickOf(PINES) : pickOf(SAKURA), s, -rs * randRange(rng, 9, 100), { scale: [0.9, 1.35] });
    }
    for (let i = 0; i < scatterCount(10); i++) {
      const s = randRange(rng, sStart, sEnd);
      if (!accept('riverside', s)) continue;
      const u = rs * (rng() < 0.5 ? randRange(rng, RIVER_INNER - 3, RIVER_INNER + 2) : randRange(rng, RIVER_OUTER - 2, RIVER_OUTER + 3));
      put('rock0', s, u, { scale: [0.4, 1.1], allowWater: true });
    }
  }

  // ---- Rice fields -----------------------------------------------------------
  for (let i = 0; i < scatterCount(3); i++) {
    const s = randRange(rng, sStart, sEnd);
    if (!accept('ricefields', s)) continue;
    const u = (rng() < 0.5 ? -1 : 1) * randRange(rng, 30, 95);
    put(rng() < 0.6 ? 'house2' : 'house0', s, u, { face: 1, scale: [0.9, 1.1] });
  }
  for (let i = 0; i < scatterCount(4); i++) {
    const s = randRange(rng, sStart, sEnd);
    if (!accept('ricefields', s)) continue;
    const cu = (rng() < 0.5 ? -1 : 1) * randRange(rng, 40, 120);
    for (let k = 0; k < 3 + Math.floor(rng() * 3); k++) {
      put(rng() < 0.5 ? pickOf(PINES) : pickOf(GREENS), s + randRange(rng, -9, 9), cu + randRange(rng, -9, 9), { scale: [0.9, 1.3] });
    }
  }

  // ---- Village ---------------------------------------------------------------
  for (let s = sStart; s < sEnd; s += 13) {
    for (const side of [-1, 1]) {
      const ss = s + randRange(rng, -2.5, 2.5);
      if (!accept('village', ss) || rng() > 0.82) continue;
      put(pickOf(HOUSES), ss, side * randRange(rng, 14.5, 18), { face: 1, scale: [0.92, 1.12] });
    }
  }
  for (let s = sStart + 6; s < sEnd; s += 17) {
    const side = rng() < 0.5 ? -1 : 1;
    if (!accept('village', s) || rng() > 0.6) continue;
    put(pickOf(HOUSES), s + randRange(rng, -3, 3), side * randRange(rng, 29, 42), { face: 1, scale: [0.92, 1.12] });
  }
  for (let i = 0; i < scatterCount(6); i++) {
    const s = randRange(rng, sStart, sEnd);
    if (!accept('village', s)) continue;
    put(rng() < 0.6 ? pickOf(SAKURA) : pickOf(GREENS), s, (rng() < 0.5 ? -1 : 1) * randRange(rng, 7.5, 9.5), { scale: [0.85, 1.1] });
  }
  {
    const s = randRange(rng, sStart, sEnd);
    if (accept('village', s) && rng() < 0.5) {
      put(pickOf(VENDING), s, (rng() < 0.5 ? -1 : 1) * 6.1, { face: 1 });
    }
  }

  // ---- Bamboo grove ----------------------------------------------------------
  for (const side of [-1, 1]) {
    for (let i = 0; i < scatterCount(46); i++) {
      const s = randRange(rng, sStart, sEnd);
      if (!accept('bamboo', s)) continue;
      const t = Math.pow(rng(), 1.6);
      put(pickOf(BAMBOO), s, side * (6.2 + t * 48), { scale: [0.8, 1.2] });
    }
    for (let i = 0; i < scatterCount(8); i++) {
      const s = randRange(rng, sStart, sEnd);
      if (!accept('bamboo', s)) continue;
      put(pickOf(PINES), s, side * randRange(rng, 40, 110), { scale: [1, 1.4] });
    }
  }

  // ---- Torii path ------------------------------------------------------------
  for (let k = Math.ceil(sStart / TORII_SPACING); k * TORII_SPACING < sEnd; k++) {
    const s = k * TORII_SPACING;
    if (weight('shrine', s) < 0.85) continue;
    put('torii', s, 0, { face: 2, tint: randRange(rng, 0.97, 1.03) });
  }
  for (let k = Math.ceil(sStart / 14); k * 14 < sEnd; k++) {
    const s = k * 14;
    if (weight('shrine', s) < 0.6) continue;
    for (const side of [-1, 1]) put('lantern', s, side * 6.0, { face: 1 });
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < scatterCount(22); i++) {
      const s = randRange(rng, sStart, sEnd);
      if (!accept('shrine', s)) continue;
      put(rng() < 0.75 ? pickOf(PINES) : pickOf(GREENS), s, side * randRange(rng, 9.5, 70), { scale: [1, 1.5] });
    }
  }

  // ---- Shared furniture ------------------------------------------------------
  // Stone lanterns along the blossom avenue.
  for (let k = Math.ceil(sStart / 36); k * 36 < sEnd; k++) {
    const s = k * 36;
    if (weight('sakura', s) < 0.5) continue;
    put('lantern', s, (k % 2 === 0 ? 1 : -1) * 5.9, { face: 1 });
  }
  // Utility poles with sagging wires, wherever there are fields or houses.
  const poleAt = (k: number): boolean => {
    const s = k * POLE_SPACING;
    return weight('ricefields', s) + weight('village', s) > 0.5;
  };
  const polePoint = (k: number): WirePoint => {
    const s = k * POLE_SPACING;
    const row = rowAt(s);
    const p = { x: 0, y: 0, z: 0 };
    terrain.point(row, POLE_U, p);
    return { ...p, rx: row.frame.rx, rz: row.frame.rz };
  };
  for (let k = Math.ceil(sStart / POLE_SPACING); k * POLE_SPACING < sEnd; k++) {
    if (!poleAt(k)) continue;
    const s = k * POLE_SPACING;
    put('pole', s, POLE_U, { face: 2 });
    if (poleAt(k + 1)) args.wire(polePoint(k), polePoint(k + 1));
  }
  // Grass tufts and wildflowers near the verge.
  for (let i = 0; i < scatterCount(34); i++) {
    const s = randRange(rng, sStart, sEnd);
    const u = (rng() < 0.5 ? -1 : 1) * randRange(rng, 5.7, 24);
    put(pickOf(GRASS), s, u, { scale: [0.7, 1.4] });
  }
}
