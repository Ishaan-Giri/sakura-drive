import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { mulberry32 } from '../utils/math';

const BOX = new Vector3(70, 34, 70);

const vertexShader = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uBox;
  uniform vec3 uOffset;
  uniform float uDensity;
  uniform float uSize;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vShade;
  #include <common>
  #include <fog_pars_vertex>

  mat3 rotation(vec3 a) {
    vec3 s = sin(a), c = cos(a);
    mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, c.x, -s.x, 0.0, s.x, c.x);
    mat3 ry = mat3(c.y, 0.0, s.y, 0.0, 1.0, 0.0, -s.y, 0.0, c.y);
    mat3 rz = mat3(c.z, -s.z, 0.0, s.z, c.z, 0.0, 0.0, 0.0, 1.0);
    return rz * ry * rx;
  }

  void main() {
    vUv = uv * 2.0 - 1.0;
    float fall = 0.55 + 0.7 * aSeed.w;
    // Drift in world space, then wrap into a box centred on the camera (uOffset does the centring
    // in double precision on the CPU, so this stays stable no matter how far we have driven).
    vec3 p = aSeed.xyz * uBox;
    p += vec3(uTime * 1.15 * fall, -uTime * 0.85 * fall, uTime * 0.55 * fall);
    p.x += sin(uTime * 1.7 + aSeed.w * 40.0) * 0.7;
    p.z += cos(uTime * 1.3 + aSeed.x * 31.0) * 0.5;
    p = mod(p + uOffset, uBox) - uBox * 0.5;

    // Shrink towards the edge of the box so petals never pop in or out.
    vec3 edge = abs(p) / (uBox * 0.5);
    float fade = 1.0 - smoothstep(0.72, 0.99, max(max(edge.x, edge.y), edge.z));
    float alive = step(aSeed.w, uDensity) * fade;

    mat3 rot = rotation(vec3(uTime * (0.9 + aSeed.x * 2.2), uTime * (0.6 + aSeed.y * 1.8), aSeed.z * 6.28));
    vec3 local = rot * vec3(position.xy * uSize * alive, 0.0);
    vTint = vec3(1.0, 0.86 + aSeed.y * 0.12, 0.9 + aSeed.z * 0.08);
    vShade = 0.72 + 0.28 * abs((rot * vec3(0.0, 0.0, 1.0)).y);

    vec4 mvPosition = modelViewMatrix * vec4(p + local, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vShade;
  uniform vec3 uColor;
  #include <common>
  #include <fog_pars_fragment>

  void main() {
    // Petal silhouette: an ellipse with a small notch at the tip.
    vec2 q = vec2(vUv.x * 1.45, vUv.y);
    if (dot(q, q) > 1.0) discard;
    if (vUv.y > 0.62 && abs(vUv.x) < 0.22) discard;
    vec3 col = uColor * vTint * vShade;
    col *= 0.92 + 0.12 * (1.0 - vUv.y);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

/** Cherry petals drifting on the wind around the camera. Entirely GPU-animated. */
export class Petals {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly geometry: InstancedBufferGeometry;
  private time = 0;
  private density = 0.2;

  constructor(scene: Scene, count: number, seed: number) {
    const rng = mulberry32(seed ^ 0x1234);
    const base = new PlaneGeometry(1, 0.72);
    this.geometry = new InstancedBufferGeometry();
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.attributes.position);
    this.geometry.setAttribute('uv', base.attributes.uv);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = rng();
    this.geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    this.geometry.instanceCount = count;

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: DoubleSide,
      fog: true,
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.fog),
        uTime: { value: 0 },
        uBox: { value: BOX.clone() },
        uOffset: { value: new Vector3() },
        uDensity: { value: 0.2 },
        uSize: { value: 0.17 },
        uColor: { value: new Color(0xfbc3d2) },
      },
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'petals';
    scene.add(this.mesh);
  }

  /** `target` is the density of petals the current scenery calls for (0..1). */
  update(camera: PerspectiveCamera, dt: number, target: number): void {
    this.time += dt;
    this.density += (target - this.density) * Math.min(1, dt * 0.6);
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uDensity.value = this.density;
    // Centre the wrap box on the camera. Wrapping the (potentially huge) camera position here, in
    // doubles, is what keeps the petals steady in world space after kilometres of driving.
    const offs = u.uOffset.value as Vector3;
    offs.set(mod(-camera.position.x, BOX.x), mod(-camera.position.y, BOX.y), mod(-camera.position.z, BOX.z));
    this.mesh.position.copy(camera.position);
  }

  setCount(count: number): void {
    this.geometry.instanceCount = Math.min(count, (this.geometry.getAttribute('aSeed') as InstancedBufferAttribute).count);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const mod = (a: number, b: number): number => ((a % b) + b) % b;
