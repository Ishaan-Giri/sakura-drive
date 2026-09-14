import { MeshLambertMaterial, type BufferGeometry, type Material } from 'three';
import { bambooClump, grassTuft, pineTree, rock, roundTree, sakuraTree } from './trees';
import { house, stoneLantern, torii, utilityPole, vendingMachine } from './structures';

export type PropName =
  | 'sakura0' | 'sakura1' | 'sakura2'
  | 'round0' | 'round1' | 'fresh0'
  | 'pine0' | 'pine1'
  | 'bamboo0' | 'bamboo1'
  | 'grass0' | 'grass1'
  | 'rock0'
  | 'torii' | 'lantern' | 'pole'
  | 'house0' | 'house1' | 'house2'
  | 'vending0' | 'vending1' | 'vending2';

export interface PropDef {
  geometry: BufferGeometry;
  material: Material;
  castShadow: boolean;
  /** Only cast shadows when quality allows many casters. */
  minShadowTier: number;
}

/** Shared uniforms for animated materials (wind sway, petals). */
export const worldUniforms = {
  uTime: { value: 0 },
};

function createSolidMaterial(): MeshLambertMaterial {
  return new MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

/** Lambert material whose vertices sway gently with height — trees breathing in the wind. */
function createFoliageMaterial(strength: number, baseHeight = 2): MeshLambertMaterial {
  const mat = createSolidMaterial();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float swayH = max(position.y - ${baseHeight.toFixed(2)}, 0.0);
        float ph = ip.x * 0.11 + ip.z * 0.13;
        float gust = 0.6 + 0.4 * sin(uTime * 0.23 + ph * 0.3);
        transformed.x += sin(uTime * 1.3 + ph) * ${strength.toFixed(3)} * swayH * gust;
        transformed.z += cos(uTime * 1.05 + ph * 1.7) * ${(strength * 0.7).toFixed(3)} * swayH * gust;`,
      );
  };
  mat.customProgramCacheKey = () => `foliage-${strength}-${baseHeight}`;
  return mat;
}

export class PropLibrary {
  readonly solid = createSolidMaterial();
  readonly foliage = createFoliageMaterial(0.022);
  readonly bamboo = createFoliageMaterial(0.03);
  readonly grass = createFoliageMaterial(0.12, 0.05);
  readonly defs: Record<PropName, PropDef>;

  constructor() {
    const tree = (geometry: BufferGeometry, material = this.foliage): PropDef => ({ geometry, material, castShadow: true, minShadowTier: 2 });
    const solid = (geometry: BufferGeometry, minShadowTier = 2): PropDef => ({ geometry, material: this.solid, castShadow: true, minShadowTier });
    this.defs = {
      sakura0: tree(sakuraTree(1)),
      sakura1: tree(sakuraTree(2)),
      sakura2: tree(sakuraTree(3)),
      round0: tree(roundTree(4)),
      round1: tree(roundTree(5)),
      fresh0: tree(roundTree(6, true)),
      pine0: tree(pineTree(7)),
      pine1: tree(pineTree(8)),
      bamboo0: tree(bambooClump(9), this.bamboo),
      bamboo1: tree(bambooClump(10), this.bamboo),
      grass0: { geometry: grassTuft(11), material: this.grass, castShadow: false, minShadowTier: 9 },
      grass1: { geometry: grassTuft(12), material: this.grass, castShadow: false, minShadowTier: 9 },
      rock0: solid(rock(13)),
      torii: solid(torii(), 1),
      lantern: solid(stoneLantern()),
      pole: solid(utilityPole()),
      house0: solid(house(0), 1),
      house1: solid(house(1), 1),
      house2: solid(house(2), 1),
      vending0: solid(vendingMachine(0)),
      vending1: solid(vendingMachine(1)),
      vending2: solid(vendingMachine(2)),
    };
  }

  dispose(): void {
    for (const def of Object.values(this.defs)) def.geometry.dispose();
    this.solid.dispose();
    this.foliage.dispose();
    this.bamboo.dispose();
    this.grass.dispose();
  }
}
