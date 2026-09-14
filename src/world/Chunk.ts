import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type LineBasicMaterial,
  type Material,
} from 'three';
import { ROAD_HALF_WIDTH, type RoadFrame } from './Road';
import { ROAD_TEXTURE_REPEAT } from './roadTexture';
import { RIVER_INNER, RIVER_OUTER, WATER_LEVEL, type Row, type Terrain } from './Terrain';
import type { PropLibrary, PropName } from './props/library';
import { POLE_WIRE_X, POLE_WIRE_Y } from './props/structures';
import { scatterChunk, type Placement } from './Scatter';
import { hashInts, mulberry32 } from '../utils/math';

export const CHUNK_LENGTH = 100;
const TERRAIN_STEP = 4;
const ROAD_STEP = 2;
// Denser sampling close to the road, where the player actually looks, coarsening with distance.
const U_HALF = [4.3, 4.9, 5.6, 6.5, 7.6, 9, 10.5, 12.2, 14.2, 16.5, 19, 22, 25.5, 29.5, 34, 39, 44, 49.5, 56, 64, 74, 86, 100, 116, 132, 150];
const U_SAMPLES = [...U_HALF.map((u) => -u).reverse(), 0, ...U_HALF];

export interface ChunkContext {
  terrain: Terrain;
  props: PropLibrary;
  terrainMaterial: Material;
  roadMaterial: Material;
  waterMaterial: Material;
  wireMaterial: LineBasicMaterial;
  seed: number;
  density: number;
  shadowTier: number;
}

const tmpColor = new Color();
const tmpP = { x: 0, y: 0, z: 0 };
const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpPos = new Vector3();
const tmpScale = new Vector3();
const UP = new Vector3(0, 1, 0);

/** One 100 m slice of the world: terrain, road, water, props. Geometry is local to `origin`. */
export class Chunk {
  readonly group = new Group();
  readonly sStart: number;
  readonly sEnd: number;
  /** World-space origin in doubles; the group sits here so vertex data stays small. */
  readonly origin: RoadFrame;
  private readonly instanced: { mesh: InstancedMesh; minShadowTier: number; castShadow: boolean }[] = [];

  constructor(readonly index: number, private readonly ctx: ChunkContext) {
    this.sStart = index * CHUNK_LENGTH;
    this.sEnd = this.sStart + CHUNK_LENGTH;
    this.origin = ctx.terrain.road.frame(this.sStart);
    this.group.position.set(this.origin.x, this.origin.y, this.origin.z);
    this.group.name = `chunk-${index}`;

    const rows: Row[] = [];
    for (let s = this.sStart; s <= this.sEnd + 0.001; s += TERRAIN_STEP) rows.push(ctx.terrain.row(s));

    this.buildTerrain(rows);
    this.buildRoad();
    this.buildWater(rows);
    this.buildProps();
    this.group.updateMatrixWorld(true);
  }

  private local(p: { x: number; y: number; z: number }, out: number[] | Float32Array, i: number): void {
    out[i] = p.x - this.origin.x;
    out[i + 1] = p.y - this.origin.y;
    out[i + 2] = p.z - this.origin.z;
  }

  private buildTerrain(rows: Row[]): void {
    const { terrain } = this.ctx;
    const cols = U_SAMPLES.length;
    const grid = new Float32Array(rows.length * cols * 3);
    const heights = new Float32Array(rows.length * cols);
    rows.forEach((row, i) => {
      U_SAMPLES.forEach((u, j) => {
        terrain.point(row, u, tmpP);
        this.local(tmpP, grid, (i * cols + j) * 3);
        heights[i * cols + j] = tmpP.y - row.frame.y;
      });
    });

    const quads = (rows.length - 1) * (cols - 1);
    const positions = new Float32Array(quads * 18);
    const colors = new Float32Array(quads * 18);
    let o = 0;
    const put = (idx: number) => {
      positions[o] = grid[idx * 3];
      positions[o + 1] = grid[idx * 3 + 1];
      positions[o + 2] = grid[idx * 3 + 2];
      colors[o] = tmpColor.r;
      colors[o + 1] = tmpColor.g;
      colors[o + 2] = tmpColor.b;
      o += 3;
    };
    for (let i = 0; i < rows.length - 1; i++) {
      const sMid = rows[i].s + TERRAIN_STEP / 2;
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j; // (s, u)
        const b = a + 1; // (s, u + du)
        const c = a + cols; // (s + ds, u)
        const d = c + 1;
        const uMid = (U_SAMPLES[j] + U_SAMPLES[j + 1]) / 2;
        const hMid = (heights[a] + heights[b] + heights[c] + heights[d]) / 4;
        // Winding chosen so normals face up: (right × forward) = +Y.
        terrain.color(rows[i], sMid, uMid, hMid, tmpColor);
        put(a); put(d); put(c);
        terrain.color(rows[i], sMid + 1.3, uMid + 0.7, hMid, tmpColor);
        put(a); put(b); put(d);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.ctx.terrainMaterial);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.group.add(mesh);
  }

  private buildRoad(): void {
    const road = this.ctx.terrain.road;
    const n = CHUNK_LENGTH / ROAD_STEP + 1;
    const positions = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const indices: number[] = [];
    const f = { ...this.origin };
    // Keep UVs small but continuous: chunk starts are multiples of 100 m and 800 is a multiple of both 100 and 8.
    const vBase = (((this.sStart % 800) + 800) % 800) / ROAD_TEXTURE_REPEAT;
    for (let i = 0; i < n; i++) {
      const s = this.sStart + i * ROAD_STEP;
      road.frame(s, f);
      for (let k = 0; k < 2; k++) {
        const u = k === 0 ? -ROAD_HALF_WIDTH : ROAD_HALF_WIDTH;
        tmpP.x = f.x + f.rx * u;
        tmpP.y = f.y + 0.02;
        tmpP.z = f.z + f.rz * u;
        this.local(tmpP, positions, (i * 2 + k) * 3);
        uvs[(i * 2 + k) * 2] = k;
        uvs[(i * 2 + k) * 2 + 1] = vBase + (i * ROAD_STEP) / ROAD_TEXTURE_REPEAT;
      }
      if (i < n - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, d, c, a, b, d);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.ctx.roadMaterial);
    mesh.receiveShadow = true;
    mesh.name = 'road';
    this.group.add(mesh);
  }

  private buildWater(rows: Row[]): void {
    if (!rows.some((r) => r.river > 0.01)) return;
    const { terrain } = this.ctx;
    const side = rows.find((r) => r.river > 0.01)!.riverSide;
    const us = [RIVER_INNER - 6, (RIVER_INNER + RIVER_OUTER) / 2, RIVER_OUTER + 7].map((u) => u * side);
    const positions: number[] = [];
    const indices: number[] = [];
    rows.forEach((row) => {
      for (const u of us) {
        const ue = terrain.effectiveU(row, u);
        tmpP.x = row.frame.x + row.frame.rx * ue;
        tmpP.y = row.frame.y + WATER_LEVEL;
        tmpP.z = row.frame.z + row.frame.rz * ue;
        const i = positions.length;
        positions.push(0, 0, 0);
        this.local(tmpP, positions, i);
      }
    });
    const cols = us.length;
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        // Lateral order flips with the side, so flip winding to keep normals up.
        if (side > 0) indices.push(a, d, c, a, b, d);
        else indices.push(a, c, d, a, d, b);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.ctx.waterMaterial);
    mesh.name = 'water';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildProps(): void {
    const { terrain, props, density, seed } = this.ctx;
    const rng = mulberry32(hashInts(seed, this.index));
    const buckets = new Map<PropName, Placement[]>();
    const wires: number[] = [];
    scatterChunk({
      terrain,
      rng,
      density,
      sStart: this.sStart,
      sEnd: this.sEnd,
      add: (p) => {
        let list = buckets.get(p.name);
        if (!list) buckets.set(p.name, (list = []));
        list.push(p);
      },
      wire: (a, b) => this.addWire(wires, a, b),
    });

    for (const [name, list] of buckets) {
      const def = props.defs[name];
      const mesh = new InstancedMesh(def.geometry, def.material, list.length);
      list.forEach((p, i) => {
        tmpPos.set(p.x - this.origin.x, p.y - this.origin.y, p.z - this.origin.z);
        tmpQuat.setFromAxisAngle(UP, p.yaw);
        tmpScale.setScalar(p.scale);
        tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
        mesh.setMatrixAt(i, tmpMatrix);
        mesh.setColorAt(i, tmpColor.setScalar(p.tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = !name.startsWith('grass');
      mesh.name = name;
      this.instanced.push({ mesh, minShadowTier: def.minShadowTier, castShadow: def.castShadow });
      this.group.add(mesh);
    }
    this.applyShadowTier(this.ctx.shadowTier);

    if (wires.length) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(wires, 3));
      geo.computeBoundingSphere();
      const lines = new LineSegments(geo, this.ctx.wireMaterial);
      lines.name = 'wires';
      this.group.add(lines);
    }
  }

  /** Sagging double wire between two pole bases (world space). */
  private addWire(out: number[], a: { x: number; y: number; z: number; rx: number; rz: number }, b: { x: number; y: number; z: number; rx: number; rz: number }): void {
    const SEGMENTS = 8;
    const SAG = 0.55;
    for (const side of [-1, 1]) {
      const ax = a.x - a.rx * side * POLE_WIRE_X, az = a.z - a.rz * side * POLE_WIRE_X, ay = a.y + POLE_WIRE_Y;
      const bx = b.x - b.rx * side * POLE_WIRE_X, bz = b.z - b.rz * side * POLE_WIRE_X, by = b.y + POLE_WIRE_Y;
      let px = ax, py = ay, pz = az;
      for (let i = 1; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const y = ay + (by - ay) * t - SAG * 4 * t * (1 - t);
        out.push(px - this.origin.x, py - this.origin.y, pz - this.origin.z, x - this.origin.x, y - this.origin.y, z - this.origin.z);
        px = x; py = y; pz = z;
      }
    }
  }

  applyShadowTier(tier: number): void {
    for (const it of this.instanced) it.mesh.castShadow = it.castShadow && tier >= it.minShadowTier;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      if (obj instanceof InstancedMesh) {
        obj.dispose(); // shared geometry/material stay alive in the library
      } else if (obj instanceof Mesh || obj instanceof LineSegments) {
        obj.geometry.dispose();
      }
    });
  }
}
