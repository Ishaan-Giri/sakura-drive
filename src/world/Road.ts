import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../utils/math';

/** Half width of the asphalt, in meters (two 3.5 m lanes + painted margins). */
export const ROAD_HALF_WIDTH = 3.8;
/** Japan drives on the left: lane centre is left of the road centre line (negative lateral offset). */
export const LANE_OFFSET = -1.75;
/** Lateral offset where the gravel shoulder ends; beyond this is scenery. */
export const SHOULDER_EDGE = 4.9;

const STEP = 1; // meters between integrated position samples

/**
 * A point on the road centre line plus its local frame.
 * Heading convention: tangent = (sin h, 0, cos h). Increasing heading turns left.
 * Right vector = (-cos h, 0, sin h). Positive curvature = left turn.
 */
export interface RoadFrame {
  x: number;
  y: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  rx: number;
  rz: number;
  slope: number;
  curvature: number;
}

export const makeFrame = (): RoadFrame => ({
  x: 0, y: 0, z: 0, heading: 0, tx: 0, tz: 1, rx: -1, rz: 0, slope: 0, curvature: 0,
});

/**
 * Endless, deterministic road. Heading and elevation are smooth analytic functions of the
 * distance `s`, so curves are always gentle; x/z are integrated incrementally as the car advances.
 * All values are JS doubles, so precision holds for very long drives — meshes are built relative
 * to their chunk origin to keep GPU (float32) coordinates small.
 */
export class Road {
  private readonly noise: NoiseFunction2D;
  private base = 0; // sample index of xs[0]
  private xs: number[] = [0];
  private zs: number[] = [0];

  constructor(seed: number) {
    this.noise = createNoise2D(mulberry32(seed));
  }

  headingAt(s: number): number {
    const n = this.noise;
    // Tuned so the tightest bend is ~200 m radius and heading stays within ±60° of the
    // main axis (the road can never loop back over itself).
    return 0.85 * n(s / 1500, 11.3) + 0.2 * n(s / 420, 47.9);
  }

  elevationAt(s: number): number {
    const n = this.noise;
    // Rolling hills with grades under ~6%.
    return 8 * n(s / 1100, 91.1) + 1.3 * n(s / 320, 13.7);
  }

  curvatureAt(s: number): number {
    return this.headingAt(s + 0.5) - this.headingAt(s - 0.5);
  }

  slopeAt(s: number): number {
    return this.elevationAt(s + 0.5) - this.elevationAt(s - 0.5);
  }

  /** Scenery noise shared by terrain and props so they agree exactly. */
  get sceneryNoise(): NoiseFunction2D {
    return this.noise;
  }

  get startS(): number {
    return this.base * STEP;
  }

  get endS(): number {
    return (this.base + this.xs.length - 1) * STEP;
  }

  /** Integrate the centre line forward until it reaches at least `s`. */
  ensure(s: number): void {
    while (this.endS < s) {
      const i = this.xs.length - 1;
      const sMid = this.endS + STEP * 0.5;
      const h = this.headingAt(sMid);
      this.xs.push(this.xs[i] + Math.sin(h) * STEP);
      this.zs.push(this.zs[i] + Math.cos(h) * STEP);
    }
  }

  /** Forget samples before `s` (they will never be needed again). */
  trim(s: number): void {
    const drop = Math.floor(s / STEP) - this.base;
    if (drop > 2000) {
      this.xs.splice(0, drop);
      this.zs.splice(0, drop);
      this.base += drop;
    }
  }

  frame(s: number, out: RoadFrame = makeFrame()): RoadFrame {
    this.ensure(s + STEP);
    const f = Math.max(0, s / STEP - this.base);
    const i = Math.min(Math.floor(f), this.xs.length - 2);
    const t = f - i;
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
    out.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t;
    out.y = this.elevationAt(s);
    const h = this.headingAt(s);
    out.heading = h;
    out.tx = Math.sin(h);
    out.tz = Math.cos(h);
    out.rx = -out.tz;
    out.rz = out.tx;
    out.slope = this.slopeAt(s);
    out.curvature = this.curvatureAt(s);
    return out;
  }
}
