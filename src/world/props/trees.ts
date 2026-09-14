import { ConeGeometry, CylinderGeometry, IcosahedronGeometry, type BufferGeometry } from 'three';
import { mulberry32, randRange } from '../../utils/math';
import { mergeParts, paint } from './util';

const BARK = 0x6b4b3c;
const SAKURA_PINKS = [0xfcc0d6, 0xffd3e1, 0xf8aecb, 0xffe2ec, 0xfdc8db];
const LEAF_GREENS = [0x7fae5e, 0x8dbb66, 0x719f55, 0x99c46c];
const FRESH_GREENS = [0xa9cf6a, 0xb8d877, 0x9cc563];
const PINE_GREENS = [0x4e7a4a, 0x5a8752, 0x46703f];

function blob(parts: BufferGeometry[], rng: () => number, colors: number[], x: number, y: number, z: number, r: number) {
  const g = new IcosahedronGeometry(r, 1);
  g.scale(1, 0.82, 1);
  g.translate(x, y, z);
  // One colour per blob keeps the canopy reading as a single mass; the faceted geometry
  // already supplies plenty of variation through shading.
  parts.push(paint(g, [colors[Math.floor(rng() * colors.length)]], 0.012, rng));
}

/** Cherry blossom tree: gnarled trunk with a wide, cloud-like pink canopy (~6 m tall). */
export function sakuraTree(seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.17, 0.32, 3.2, 6);
  trunk.translate(0, 1.6, 0);
  trunk.rotateZ(randRange(rng, -0.08, 0.08));
  parts.push(paint(trunk, BARK, 0.06, rng));

  const branchCount = 3;
  for (let i = 0; i < branchCount; i++) {
    const a = (i / branchCount) * Math.PI * 2 + rng();
    const b = new CylinderGeometry(0.06, 0.13, 2.0, 5);
    b.translate(0, 1.0, 0);
    b.rotateZ(0.75);
    b.rotateY(a);
    b.translate(0, 2.6, 0);
    parts.push(paint(b, BARK, 0.06, rng));
  }

  const blobs = 7 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 1.0, 2.3);
    blob(parts, rng, SAKURA_PINKS, Math.cos(a) * d, randRange(rng, 3.7, 5.0), Math.sin(a) * d, randRange(rng, 1.1, 1.7));
  }
  return mergeParts(parts);
}

/** Rounded broadleaf tree in spring greens. */
export function roundTree(seed: number, fresh = false): BufferGeometry {
  const rng = mulberry32(seed);
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.16, 0.26, 3.4, 6);
  trunk.translate(0, 1.7, 0);
  parts.push(paint(trunk, BARK, 0.06, rng));
  const colors = fresh ? FRESH_GREENS : LEAF_GREENS;
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.7, 1.4);
    blob(parts, rng, colors, Math.cos(a) * d, randRange(rng, 3.8, 5.4), Math.sin(a) * d, randRange(rng, 1.2, 1.8));
  }
  return mergeParts(parts);
}

/** Japanese cedar / pine: stacked cones, tall and dark — frames the brighter trees. */
export function pineTree(seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.14, 0.24, 3, 6);
  trunk.translate(0, 1.5, 0);
  parts.push(paint(trunk, 0x5e4336, 0.05, rng));
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const r = 2.3 - i * 0.45;
    const cone = new ConeGeometry(r, 2.8, 7);
    cone.rotateY(rng() * Math.PI);
    cone.translate(0, 3.2 + i * 1.55, 0);
    parts.push(paint(cone, PINE_GREENS, 0.06, rng));
  }
  return mergeParts(parts);
}

/** A clump of bamboo stalks with leafy tufts near the top (~11 m tall). */
export function bambooClump(seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const parts: BufferGeometry[] = [];
  const stalks = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < stalks; i++) {
    const a = rng() * Math.PI * 2;
    const d = randRange(rng, 0, 1.3);
    const h = randRange(rng, 9, 13);
    const r = randRange(rng, 0.07, 0.11);
    const stalk = new CylinderGeometry(r * 0.8, r, h, 5, 1);
    stalk.translate(0, h / 2, 0);
    stalk.rotateZ(randRange(rng, -0.07, 0.07));
    stalk.rotateX(randRange(rng, -0.07, 0.07));
    stalk.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(paint(stalk, [0x9dbd5f, 0x8fb356, 0xa7c468], 0.04, rng));
    for (let j = 0; j < 2; j++) {
      const leaf = new IcosahedronGeometry(randRange(rng, 0.8, 1.3), 0);
      leaf.scale(1.4, 0.45, 1.4);
      leaf.translate(Math.cos(a) * d + randRange(rng, -0.8, 0.8), h - j * 1.6 - randRange(rng, 0, 0.8), Math.sin(a) * d + randRange(rng, -0.8, 0.8));
      parts.push(paint(leaf, [0x7aa84f, 0x88b55a, 0x6d9c47], 0.06, rng));
    }
  }
  return mergeParts(parts);
}

/** Low cluster of grass blades with a few wildflowers. */
export function grassTuft(seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const blade = new ConeGeometry(0.09, randRange(rng, 0.45, 0.8), 3);
    blade.translate(randRange(rng, -0.25, 0.25), 0.3, randRange(rng, -0.25, 0.25));
    blade.rotateZ(randRange(rng, -0.3, 0.3));
    parts.push(paint(blade, [0x7fae5a, 0x8fbc62, 0x72a24f], 0.05, rng));
  }
  if (rng() < 0.6) {
    for (let i = 0; i < 3; i++) {
      const flower = new IcosahedronGeometry(0.07, 0);
      flower.translate(randRange(rng, -0.3, 0.3), randRange(rng, 0.45, 0.7), randRange(rng, -0.3, 0.3));
      parts.push(paint(flower, [0xfff6c2, 0xffffff, 0xf7b9d2], 0, rng));
    }
  }
  return mergeParts(parts);
}

export function rock(seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const g = new IcosahedronGeometry(1, 0);
  const pos = g.attributes.position;
  // Displace as a function of position so duplicated (non-indexed) vertices stay welded.
  const phase = rng() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const f = 1 + 0.22 * Math.sin(x * 12.9 + y * 7.1 + z * 3.7 + phase);
    pos.setXYZ(i, x * f, y * f * 0.65, z * f);
  }
  g.translate(0, 0.25, 0);
  return mergeParts([paint(g, [0x9d9b92, 0xa9a79d, 0x8f8d85], 0.05, rng)]);
}
