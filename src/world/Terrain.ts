import { Color } from 'three';
import { BIOMES, type BiomeId, type BiomeMap } from './Biomes';
import { ROAD_HALF_WIDTH, SHOULDER_EDGE, makeFrame, type Road, type RoadFrame } from './Road';
import { clamp, hash01, smoothstep } from '../utils/math';

/** Lateral extent of the terrain strip on each side of the road. */
export const TERRAIN_HALF_WIDTH = 150;
/** River channel (riverside biome), as lateral distance from the road centre. */
export const RIVER_INNER = 22;
export const RIVER_OUTER = 44;
/** Water surface relative to the road. */
export const WATER_LEVEL = -1.7;

/** Everything about one cross-section of the world at distance `s`. */
export interface Row {
  s: number;
  frame: RoadFrame;
  hills: number;
  flat: number;
  base: number;
  bumps: number;
  grassA: Color;
  grassB: Color;
  river: number;
  riverSide: number;
  weights: Record<BiomeId, number>;
}

const GRAVEL = new Color(0xb9ae97);
const PETAL_GROUND = new Color(0xf7d7df);
const FOREST = new Color(0x6f9a58);
const RIVERBED = new Color(0xbcb08c);
const LEVEE = new Color(0x8bb45d);
const PADDIES = [0x9ccc62, 0xb3d77a, 0x8fc2a0, 0x86b9b4, 0xa8d06c].map((c) => new Color(c));
const tmpA = new Color();
const tmpB = new Color();

export class Terrain {
  constructor(readonly road: Road, readonly biomes: BiomeMap) {}

  row(s: number): Row {
    const smp = this.biomes.sample(s);
    const a = BIOMES[smp.a.id];
    const b = BIOMES[smp.b.id];
    const t = smp.t;
    const mix = (va: number, vb: number) => va + (vb - va) * t;
    const weights: Record<BiomeId, number> = {
      sakura: 0, riverside: 0, ricefields: 0, village: 0, bamboo: 0, shrine: 0,
    };
    weights[smp.a.id] += 1 - t;
    weights[smp.b.id] += t;
    const riverSeg = smp.a.id === 'riverside' ? smp.a : smp.b.id === 'riverside' ? smp.b : null;
    return {
      s,
      frame: this.road.frame(s, makeFrame()),
      hills: mix(a.hills, b.hills),
      flat: mix(a.flat, b.flat),
      base: mix(a.base, b.base),
      bumps: mix(a.bumps, b.bumps),
      grassA: new Color(a.grass[0]).lerp(tmpB.set(b.grass[0]), t),
      grassB: new Color(a.grass[1]).lerp(tmpB.set(b.grass[1]), t),
      river: weights.riverside,
      riverSide: riverSeg ? riverSeg.side : 1,
      weights,
    };
  }

  /** Terrain height at lateral offset `u`, relative to the road surface. */
  height(row: Row, u: number): number {
    const au = Math.abs(u);
    if (au < ROAD_HALF_WIDTH + 0.5) return -0.3;
    if (au < SHOULDER_EDGE) return -0.14;

    const n = this.road.sceneryNoise;
    const s = row.s;
    const ramp = smoothstep(row.flat, row.flat + 65, au);
    const n1 = n(s / 120, u / 75 + 100) * 0.5 + 0.5;
    const n2 = n(s / 32, u / 24 + 300);
    let h = row.base * smoothstep(SHOULDER_EDGE, SHOULDER_EDGE + 1.5, au) - 0.14 * (1 - smoothstep(SHOULDER_EDGE, SHOULDER_EDGE + 1.5, au));
    h += row.hills * ramp * (0.3 + 0.7 * n1);
    h += row.bumps * n2 * smoothstep(SHOULDER_EDGE + 1, 16, au);

    if (row.river > 0 && Math.sign(u) === row.riverSide) {
      const channel = smoothstep(RIVER_INNER - 5, RIVER_INNER + 2, au) * (1 - smoothstep(RIVER_OUTER - 2, RIVER_OUTER + 6, au));
      const bank = 1 - smoothstep(RIVER_OUTER + 4, RIVER_OUTER + 30, au);
      // Keep the banks low and gentle, then carve the channel.
      let hr = h * (1 - bank * 0.85);
      hr = hr + (-3.4 - hr) * channel;
      h = h + (hr - h) * row.river;
    }

    // Outer skirt drops below the horizon ground disc so the strip edge never shows.
    h += (-14 - h) * smoothstep(TERRAIN_HALF_WIDTH - 18, TERRAIN_HALF_WIDTH, au);
    return h;
  }

  /**
   * Lateral offset compressed on the inside of bends so wide terrain never folds over itself.
   * Continuous in `s` because curvature is.
   */
  effectiveU(row: Row, u: number): number {
    const k = row.frame.curvature;
    if (u * k >= 0 || Math.abs(k) < 1e-6) return u;
    const limit = 0.85 / Math.abs(k);
    return Math.sign(u) * limit * Math.tanh(Math.abs(u) / limit);
  }

  /** World-space position (doubles) of the ground at (s, u). */
  point(row: Row, u: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const f = row.frame;
    const ue = this.effectiveU(row, u);
    out.x = f.x + f.rx * ue;
    out.z = f.z + f.rz * ue;
    out.y = f.y + this.height(row, u);
    return out;
  }

  isWater(row: Row, u: number): boolean {
    return this.height(row, u) < WATER_LEVEL + 0.35;
  }

  /** Ground colour for a face centred at (s, u) with relative height `h`; `row` is the nearby cross-section. */
  color(row: Row, s: number, u: number, h: number, out: Color): Color {
    const au = Math.abs(u);
    const n = this.road.sceneryNoise;
    if (au < SHOULDER_EDGE) {
      return out.copy(GRAVEL).offsetHSL(0, 0, n(s / 3, u) * 0.03);
    }

    // Two-tone grass with a low-frequency blend keeps large areas calm rather than speckled.
    out.copy(row.grassA).lerp(row.grassB, smoothstep(-0.5, 0.5, n(s / 26, u / 22 + 50)));
    out.lerp(FOREST, smoothstep(6, 24, h) * 0.6);

    const w = row.weights;
    if (w.sakura + w.riverside * 0.5 + w.village * 0.3 > 0) {
      const petalAmount = w.sakura + w.riverside * 0.5 + w.village * 0.3;
      // Fallen blossom gathers near the trees and thins out with distance from the road.
      const drift = 0.45 + 0.55 * (n(s / 18, u / 15 + 700) * 0.5 + 0.5);
      const mask = drift * (1 - smoothstep(9, 30, au));
      out.lerp(PETAL_GROUND, clamp(mask * petalAmount * 0.6, 0, 1));
    }

    if (w.ricefields > 0 && au > 7.5 && au < 88) {
      const cellS = Math.floor(s / 16);
      const cellU = Math.floor(u / 13);
      const paddy = tmpA.copy(PADDIES[Math.floor(hash01(cellS, cellU) * PADDIES.length)]);
      const onLevee = ((s % 16) + 16) % 16 < 1.6 || ((u % 13) + 13) % 13 < 1.4;
      if (onLevee) paddy.copy(LEVEE);
      out.lerp(paddy, w.ricefields);
    }

    if (row.river > 0 && h < -0.6) {
      out.lerp(RIVERBED, clamp((-h - 0.6) / 1.2, 0, 1) * row.river);
    }
    return out;
  }
}
