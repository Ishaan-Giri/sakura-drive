import type { Scene } from 'three';
import { CHUNK_LENGTH, Chunk, type ChunkContext } from './Chunk';

/** Keeps a window of chunks loaded around the car, building at most a couple per frame. */
export class ChunkManager {
  private readonly chunks = new Map<number, Chunk>();
  private ahead: number;
  private readonly behind = 160;

  constructor(private readonly scene: Scene, private readonly ctx: ChunkContext, drawDistance: number) {
    this.ahead = drawDistance;
  }

  get loaded(): number {
    return this.chunks.size;
  }

  setDrawDistance(d: number): void {
    this.ahead = d;
  }

  setShadowTier(tier: number): void {
    this.ctx.shadowTier = tier;
    for (const chunk of this.chunks.values()) chunk.applyShadowTier(tier);
  }

  /** Rebuild everything (after a density change). */
  rebuild(s: number): void {
    for (const chunk of this.chunks.values()) chunk.dispose();
    this.chunks.clear();
    this.update(s, Infinity);
  }

  update(s: number, budget = 2): void {
    const road = this.ctx.terrain.road;
    const first = Math.floor((s - this.behind) / CHUNK_LENGTH);
    const last = Math.floor((s + this.ahead) / CHUNK_LENGTH);
    road.ensure((last + 1) * CHUNK_LENGTH + 20);
    this.ctx.terrain.biomes.ensure((last + 1) * CHUNK_LENGTH + 20);

    for (const [index, chunk] of this.chunks) {
      if (index < first || index > last) {
        chunk.dispose();
        this.chunks.delete(index);
      }
    }

    // Build the nearest missing chunks first so the road ahead is never empty.
    let built = 0;
    for (let index = first; index <= last && built < budget; index++) {
      if (this.chunks.has(index)) continue;
      const chunk = new Chunk(index, this.ctx);
      this.chunks.set(index, chunk);
      this.scene.add(chunk.group);
      built++;
    }

    road.trim(first * CHUNK_LENGTH - 40);
    this.ctx.terrain.biomes.trim(first * CHUNK_LENGTH - 40);
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) chunk.dispose();
    this.chunks.clear();
  }
}
