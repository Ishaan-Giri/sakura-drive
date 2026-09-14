import { BufferGeometry, Color, Float32BufferAttribute, type ColorRepresentation } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Convert a primitive into a flat-shaded, vertex-coloured piece ready to be merged.
 * Each triangle gets one colour (optionally jittered in lightness) for the faceted low-poly look.
 */
export function paint(
  geo: BufferGeometry,
  color: ColorRepresentation | readonly ColorRepresentation[],
  jitter = 0,
  rng: () => number = Math.random,
): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const palette = (Array.isArray(color) ? color : [color]).map((c) => new Color(c));
  const tmp = new Color();
  for (let v = 0; v < count; v += 3) {
    tmp.copy(palette[Math.floor(rng() * palette.length)]);
    if (jitter) tmp.offsetHSL(0, 0, (rng() - 0.5) * jitter);
    for (let k = 0; k < 3 && v + k < count; k++) {
      colors[(v + k) * 3] = tmp.r;
      colors[(v + k) * 3 + 1] = tmp.g;
      colors[(v + k) * 3 + 2] = tmp.b;
    }
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

/** Merge painted parts into one flat-shaded geometry. */
export function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('mergeParts: incompatible geometries');
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
