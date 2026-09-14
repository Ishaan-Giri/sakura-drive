import {
  CircleGeometry,
  Color,
  ConeGeometry,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Vector3,
  type BufferGeometry,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { mergeParts, paint } from './props/util';
import { mulberry32, randRange } from '../utils/math';
import type { SkyPalette } from './Sky';

const ax = new Vector3();
const bx = new Vector3();
const cx = new Vector3();
const snowWhite = new Color(0xfdfdfd);

/**
 * Everything past the fog: a ring of hazy mountains (with one snow-capped Fuji), a few clouds and a
 * ground plane that closes the horizon. All of it rides along with the camera, so it never gets closer.
 */
export class Backdrop {
  readonly mountains: Mesh;
  readonly clouds: Mesh;
  readonly ground: Mesh;

  constructor(scene: Scene, palette: SkyPalette, seed: number) {
    const rng = mulberry32(seed ^ 0x5f3a);
    const haze = new Color(palette.horizon);
    const parts: BufferGeometry[] = [];

    const sunDir = palette.sunDirection;
    const addPeak = (angle: number, dist: number, radius: number, height: number, snow: boolean) => {
      const cone = new ConeGeometry(radius, height, snow ? 10 : 7, snow ? 3 : 2);
      cone.rotateY(rng() * Math.PI);
      const rock = new Color(snow ? 0x8496b6 : 0x91a6c0).lerp(haze, 0.3);
      const geo = paint(cone, 0x000000);
      const pos = geo.attributes.position;
      const col = geo.attributes.color;
      const top = height / 2;
      const c = new Color();
      // The backdrop is unlit (the sun only reaches the world near the car), so shading is baked
      // in here: a light term per face plus haze that thickens towards the base.
      for (let i = 0; i < pos.count; i += 3) {
        ax.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        bx.set(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
        cx.set(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        bx.sub(ax);
        cx.sub(ax);
        const normal = bx.cross(cx).normalize();
        const lit = 0.72 + 0.28 * Math.max(0, normal.dot(sunDir));
        const t = (ax.y + top) / height;
        c.copy(rock).multiplyScalar(lit).lerp(haze, Math.pow(1 - t, 1.6) * 0.8);
        if (snow && t > 0.6) c.lerp(snowWhite, Math.min(1, (t - 0.6) / 0.2) * lit);
        for (let k = 0; k < 3; k++) col.setXYZ(i + k, c.r, c.g, c.b);
      }
      geo.translate(Math.sin(angle) * dist, height / 2 - 30, Math.cos(angle) * dist);
      parts.push(geo);
    };

    const count = 46;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + randRange(rng, -0.05, 0.05);
      const dist = randRange(rng, 1000, 1450);
      addPeak(angle, dist, randRange(rng, 160, 340), randRange(rng, 120, 320), false);
    }
    // The signature peak, placed off to one side of the road's main heading.
    addPeak(0.55, 1650, 620, 520, true);

    this.mountains = new Mesh(mergeParts(parts), new MeshBasicMaterial({ vertexColors: true, fog: false }));
    this.mountains.frustumCulled = false;
    this.mountains.renderOrder = -900;
    this.mountains.name = 'mountains';
    scene.add(this.mountains);

    const cloudParts: BufferGeometry[] = [];
    for (let i = 0; i < 22; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = randRange(rng, 700, 1400);
      const y = randRange(rng, 180, 330);
      const puffs = 3 + Math.floor(rng() * 4);
      for (let p = 0; p < puffs; p++) {
        const g = new IcosahedronGeometry(randRange(rng, 28, 55), 0);
        g.scale(1.6, 0.55, 1.1);
        g.translate(
          Math.sin(angle) * dist + randRange(rng, -70, 70),
          y + randRange(rng, -10, 10),
          Math.cos(angle) * dist + randRange(rng, -70, 70),
        );
        cloudParts.push(paint(g, [0xffffff, 0xfdf3f4, 0xf6e8ee], 0.02, rng));
      }
    }
    this.clouds = new Mesh(mergeParts(cloudParts), new MeshBasicMaterial({ vertexColors: true, fog: false }));
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -950;
    this.clouds.name = 'clouds';
    scene.add(this.clouds);

    const disc = new CircleGeometry(1700, 40);
    disc.rotateX(-Math.PI / 2);
    this.ground = new Mesh(disc, new MeshLambertMaterial({ color: new Color(0x97bd7b).lerp(haze, 0.25) }));
    this.ground.frustumCulled = false;
    this.ground.renderOrder = -800;
    this.ground.name = 'horizon-ground';
    scene.add(this.ground);
  }

  /** `groundY` is the road elevation under the car, so the horizon follows the hills. */
  update(camera: PerspectiveCamera, groundY: number, dt: number): void {
    this.mountains.position.set(camera.position.x, groundY, camera.position.z);
    this.ground.position.set(camera.position.x, groundY - 6, camera.position.z);
    this.clouds.position.set(camera.position.x, groundY, camera.position.z);
    this.clouds.rotation.y += dt * 0.004;
  }

  dispose(): void {
    for (const mesh of [this.mountains, this.clouds, this.ground]) {
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
    }
  }
}
