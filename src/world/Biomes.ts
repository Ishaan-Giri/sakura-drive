import { mulberry32, randRange, smoothstep } from '../utils/math';

export type BiomeId = 'sakura' | 'riverside' | 'ricefields' | 'village' | 'bamboo' | 'shrine';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  kanji: string;
  length: [number, number];
  /** Height of the hills that rise away from the road. */
  hills: number;
  /** Lateral distance from the road that stays flat before hills start. */
  flat: number;
  /** Ground level near the road, relative to the road surface. */
  base: number;
  /** Amplitude of small ground bumps. */
  bumps: number;
  /** Base grass colour and a variation colour. */
  grass: [number, number];
  /** Density of drifting petals (0..1). */
  petals: number;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  sakura: {
    id: 'sakura', name: 'Sakura Avenue', kanji: '桜並木', length: [650, 1000],
    hills: 16, flat: 12, base: -0.1, bumps: 0.5, grass: [0x9cc47a, 0xb4d189], petals: 1,
  },
  riverside: {
    id: 'riverside', name: 'Riverside', kanji: '川辺', length: [600, 900],
    hills: 12, flat: 10, base: -0.1, bumps: 0.4, grass: [0x8fbf78, 0xa6cd84], petals: 0.6,
  },
  ricefields: {
    id: 'ricefields', name: 'Rice Fields', kanji: '田園', length: [600, 900],
    hills: 6, flat: 85, base: -0.45, bumps: 0.04, grass: [0x9fc970, 0xb3d47e], petals: 0.18,
  },
  village: {
    id: 'village', name: 'Village', kanji: '里', length: [450, 700],
    hills: 10, flat: 42, base: -0.05, bumps: 0.2, grass: [0x98c07a, 0xaccc88], petals: 0.5,
  },
  bamboo: {
    id: 'bamboo', name: 'Bamboo Grove', kanji: '竹林', length: [450, 700],
    hills: 18, flat: 7, base: 0, bumps: 0.7, grass: [0x86b36a, 0x98c27a], petals: 0.12,
  },
  shrine: {
    id: 'shrine', name: 'Torii Path', kanji: '鳥居の道', length: [220, 320],
    hills: 14, flat: 14, base: 0, bumps: 0.4, grass: [0x8cb872, 0x9fc682], petals: 0.4,
  },
};

const ORDER_WEIGHTS: [BiomeId, number][] = [
  ['sakura', 3], ['riverside', 2], ['ricefields', 2], ['village', 2], ['bamboo', 1.5], ['shrine', 1],
];

export interface BiomeSegment {
  id: BiomeId;
  start: number;
  end: number;
  /** Which side of the road features (the river) sit on: -1 left, 1 right. */
  side: 1 | -1;
}

export interface BiomeSample {
  a: BiomeSegment;
  b: BiomeSegment;
  /** Blend factor from `a` to `b` (0 = fully `a`). */
  t: number;
}

/** Half-length of the cross-fade zone around a biome boundary. */
const BLEND = 45;

/** Deterministic, lazily generated sequence of biomes along the road. */
export class BiomeMap {
  private readonly rng: () => number;
  readonly segments: BiomeSegment[] = [];

  constructor(seed: number) {
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    // Always open with the signature cherry-blossom avenue.
    this.segments.push({ id: 'sakura', start: -200, end: 900, side: 1 });
  }

  ensure(s: number): void {
    while (this.segments[this.segments.length - 1].end < s + BLEND) {
      const prev = this.segments[this.segments.length - 1];
      const id = this.pickNext(prev.id);
      const def = BIOMES[id];
      this.segments.push({
        id,
        start: prev.end,
        end: prev.end + randRange(this.rng, def.length[0], def.length[1]),
        side: this.rng() < 0.5 ? -1 : 1,
      });
    }
  }

  /** Drop segments that are entirely behind `s`. */
  trim(s: number): void {
    while (this.segments.length > 2 && this.segments[1].end < s - BLEND) this.segments.shift();
  }

  private pickNext(prev: BiomeId): BiomeId {
    const options = ORDER_WEIGHTS.filter(([id]) => id !== prev);
    const total = options.reduce((sum, [, w]) => sum + w, 0);
    let r = this.rng() * total;
    for (const [id, w] of options) {
      r -= w;
      if (r <= 0) return id;
    }
    return options[0][0];
  }

  segmentAt(s: number): BiomeSegment {
    this.ensure(s);
    for (let i = this.segments.length - 1; i >= 0; i--) {
      if (s >= this.segments[i].start) return this.segments[i];
    }
    return this.segments[0];
  }

  sample(s: number, out: BiomeSample = { a: this.segments[0], b: this.segments[0], t: 0 }): BiomeSample {
    this.ensure(s);
    const seg = this.segmentAt(s);
    const idx = this.segments.indexOf(seg);
    const prev = this.segments[idx - 1];
    const next = this.segments[idx + 1];
    out.a = seg;
    out.b = seg;
    out.t = 0;
    if (prev && s < seg.start + BLEND) {
      out.a = prev;
      out.b = seg;
      out.t = smoothstep(seg.start - BLEND, seg.start + BLEND, s);
    } else if (next && s > seg.end - BLEND) {
      out.a = seg;
      out.b = next;
      out.t = smoothstep(seg.end - BLEND, seg.end + BLEND, s);
    }
    return out;
  }

  /** Weight (0..1) of a biome at distance `s`. */
  weight(id: BiomeId, s: number): number {
    const smp = this.sample(s, scratch);
    let w = 0;
    if (smp.a.id === id) w += 1 - smp.t;
    if (smp.b.id === id) w += smp.t;
    return Math.min(1, w);
  }

  /** Blend any numeric biome property at `s`. */
  blend(s: number, get: (def: BiomeDef, seg: BiomeSegment) => number): number {
    const smp = this.sample(s, scratch);
    const va = get(BIOMES[smp.a.id], smp.a);
    if (smp.t === 0) return va;
    return va + (get(BIOMES[smp.b.id], smp.b) - va) * smp.t;
  }
}

const scratch: BiomeSample = {
  a: { id: 'sakura', start: 0, end: 0, side: 1 },
  b: { id: 'sakura', start: 0, end: 0, side: 1 },
  t: 0,
};
