import type { WebGLRenderer } from 'three';
import { clamp } from '../utils/math';

export type QualityId = 'low' | 'medium' | 'high' | 'auto';

export interface QualityPreset {
  id: Exclude<QualityId, 'auto'>;
  label: string;
  pixelRatio: number;
  drawDistance: number;
  petals: number;
  propDensity: number;
  /** 0 = no shadows, 1 = buildings only, 2 = everything. */
  shadowTier: number;
  shadowMapSize: number;
  postProcessing: boolean;
}

export const PRESETS: Record<Exclude<QualityId, 'auto'>, QualityPreset> = {
  low: {
    id: 'low', label: 'Low', pixelRatio: 1, drawDistance: 420, petals: 320,
    propDensity: 0.55, shadowTier: 0, shadowMapSize: 1024, postProcessing: false,
  },
  medium: {
    id: 'medium', label: 'Medium', pixelRatio: 1.25, drawDistance: 620, petals: 900,
    propDensity: 0.85, shadowTier: 2, shadowMapSize: 1024, postProcessing: false,
  },
  high: {
    id: 'high', label: 'High', pixelRatio: 2, drawDistance: 820, petals: 1700,
    propDensity: 1, shadowTier: 2, shadowMapSize: 2048, postProcessing: true,
  },
};

/** Guess a sensible preset from the GPU string the browser exposes. */
export function detectPreset(renderer: WebGLRenderer): QualityPreset {
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
  } catch {
    /* not available — fall through to the safe default */
  }
  const discrete = /nvidia|geforce|rtx|gtx|radeon rx|apple m\d|arc a/.test(gpu);
  const weak = /swiftshader|llvmpipe|software|hd graphics [2-5]/.test(gpu);
  if (weak) return PRESETS.low;
  return discrete ? PRESETS.high : PRESETS.medium;
}

/**
 * Watches frame time and quietly scales the render resolution so the frame rate stays smooth.
 * It never touches the chosen preset — only how many pixels get drawn.
 */
export class AdaptiveResolution {
  scale = 1;
  private slow = 0;
  private fast = 0;
  private cooldown = 2;

  constructor(private readonly min = 0.62) {}

  /** Returns true when the scale changed. */
  update(dt: number, frameMs: number): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (frameMs > 21) {
      this.slow += dt;
      this.fast = 0;
    } else if (frameMs < 13.5) {
      this.fast += dt;
      this.slow = 0;
    } else {
      this.slow = Math.max(0, this.slow - dt * 0.5);
      this.fast = Math.max(0, this.fast - dt * 0.5);
    }
    if (this.cooldown > 0) return false;

    if (this.slow > 1.2 && this.scale > this.min) {
      this.scale = clamp(this.scale - 0.1, this.min, 1);
      this.slow = 0;
      this.cooldown = 2.5;
      return true;
    }
    if (this.fast > 5 && this.scale < 1) {
      this.scale = clamp(this.scale + 0.08, this.min, 1);
      this.fast = 0;
      this.cooldown = 3.5;
      return true;
    }
    return false;
  }

  reset(): void {
    this.scale = 1;
    this.slow = 0;
    this.fast = 0;
    this.cooldown = 2;
  }
}
