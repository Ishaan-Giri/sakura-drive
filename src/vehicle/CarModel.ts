import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  SRGBColorSpace,
  type BufferGeometry,
  type Texture,
} from 'three';

/** A selectable car. More entries can be added later without touching the driving code. */
export interface CarSpec {
  id: string;
  name: string;
  paint: number;
  accent: number;
  rim: number;
  glass: number;
  /** Metres from the ground to the wheel centre. */
  wheelRadius: number;
  wheelbase: number;
}

export const CARS: CarSpec[] = [
  {
    id: 'sakura-gt',
    name: 'Sakura GT',
    paint: 0x2f4f5e,
    accent: 0x22262b,
    rim: 0xd4d8dd,
    glass: 0x171c22,
    wheelRadius: 0.35,
    wheelbase: 2.64,
  },
];

const CURVE_SEGMENTS = 8;

/** Side profile of the body: low nose, arched fenders, fastback tail with a ducktail lip. */
function bodyProfile(): Shape {
  const s = new Shape();
  s.moveTo(-2.16, 0.42);
  s.lineTo(-1.94, 0.26);
  // Rear wheel arch (up and over the wheel).
  s.absarc(-1.32, 0.26, 0.56, Math.PI, 0, true);
  s.lineTo(0.72, 0.26);
  // Front wheel arch.
  s.absarc(1.3, 0.26, 0.54, Math.PI, 0, true);
  s.lineTo(2.02, 0.28);
  // Low, softly tapered nose.
  s.quadraticCurveTo(2.24, 0.31, 2.25, 0.5);
  s.quadraticCurveTo(2.24, 0.62, 2.1, 0.655);
  // Hood dips between the raised front fenders, then climbs to the cowl.
  s.quadraticCurveTo(1.78, 0.68, 1.52, 0.71);
  s.quadraticCurveTo(1.2, 0.745, 0.99, 0.8);
  // Shoulder line along the flanks.
  s.quadraticCurveTo(0.5, 0.87, 0.05, 0.92);
  s.lineTo(-0.95, 0.97);
  s.quadraticCurveTo(-1.45, 0.99, -1.78, 1.0);
  // Ducktail lip.
  s.lineTo(-1.9, 1.12);
  s.lineTo(-2.08, 1.1);
  s.quadraticCurveTo(-2.24, 1.02, -2.26, 0.86);
  s.lineTo(-2.24, 0.56);
  s.lineTo(-2.16, 0.42);
  return s;
}

/** The narrower glasshouse that sits on the body: raked screen, flat roof, long fastback. */
function glassProfile(): Shape {
  const s = new Shape();
  s.moveTo(1.0, 0.78);
  s.quadraticCurveTo(0.6, 1.1, 0.2, 1.26);
  s.lineTo(-0.62, 1.27);
  s.quadraticCurveTo(-1.3, 1.18, -1.82, 0.96);
  s.lineTo(1.0, 0.78);
  return s;
}

/** Painted roof skin: from the top of the windscreen, over the cabin, down the fastback. */
function roofProfile(): Shape {
  const s = new Shape();
  // Roof cap: header rail above the windscreen, back to just past the C-pillar.
  s.moveTo(0.3, 1.238);
  s.lineTo(-0.66, 1.248);
  s.quadraticCurveTo(-1.0, 1.232, -1.24, 1.165);
  s.lineTo(-1.26, 1.235);
  s.quadraticCurveTo(-0.99, 1.308, -0.64, 1.325);
  s.lineTo(0.26, 1.315);
  s.quadraticCurveTo(0.36, 1.3, 0.42, 1.25);
  s.lineTo(0.3, 1.238);
  return s;
}

function extrude(shape: Shape, width: number, bevel: number): BufferGeometry {
  const geo = new ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: CURVE_SEGMENTS,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  // Profile plane (x = length, y = height) → world (z = length, x = width).
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function blobShadowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * The car: a modern rear-engined supercar silhouette. `group` is positioned/oriented by the
 * controller; `body` carries the cosmetic roll and pitch so the wheels stay flat on the road.
 */
export class CarModel {
  readonly group = new Group();
  readonly body = new Group();
  readonly spec: CarSpec;
  private readonly steerGroups: Group[] = [];
  private readonly wheelGroups: Group[] = [];
  private readonly materials: (MeshStandardMaterial | MeshPhysicalMaterial | MeshBasicMaterial)[] = [];
  private readonly shadow: Mesh;

  constructor(spec: CarSpec = CARS[0]) {
    this.spec = spec;
    const paint = new MeshPhysicalMaterial({
      color: spec.paint,
      metalness: 0.25,
      roughness: 0.28,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
      envMapIntensity: 1.1,
    });
    const dark = new MeshStandardMaterial({ color: spec.accent, metalness: 0.2, roughness: 0.55 });
    const glass = new MeshPhysicalMaterial({
      color: spec.glass,
      metalness: 0.1,
      roughness: 0.08,
      envMapIntensity: 1.6,
      clearcoat: 1,
    });
    const chrome = new MeshStandardMaterial({ color: spec.rim, metalness: 0.9, roughness: 0.28 });
    const rubber = new MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0, roughness: 0.85 });
    const lightOn = new MeshBasicMaterial({ color: 0xfff4dd });
    const tail = new MeshStandardMaterial({ color: 0xd93a44, emissive: 0x4a0d12, roughness: 0.3, metalness: 0.1 });
    this.materials.push(paint, dark, glass, chrome, rubber, lightOn, tail);

    const shell = new Mesh(extrude(bodyProfile(), 1.92, 0.025), paint);
    shell.castShadow = true;
    this.body.add(shell);

    const house = new Mesh(extrude(glassProfile(), 1.63, 0.012), glass);
    house.castShadow = true;
    this.body.add(house);

    // Painted roof + rear buttresses: the same outline as the glasshouse, a little larger,
    // so the greenhouse reads as windows set into bodywork rather than a slab on top.
    const roofShell = new Mesh(extrude(roofProfile(), 1.66, 0.02), paint);
    roofShell.castShadow = true;
    this.body.add(roofShell);

    // Round headlights on the fender tops, plus the dark intake under the nose.
    for (const side of [-1, 1]) {
      const lamp = new Mesh(new CylinderGeometry(0.155, 0.155, 0.1, 14), lightOn);
      lamp.rotation.x = Math.PI / 2;
      lamp.rotation.z = 0.12;
      lamp.position.set(side * 0.63, 0.665, 2.0);
      this.body.add(lamp);
      const bezel = new Mesh(new CylinderGeometry(0.18, 0.18, 0.06, 14), dark);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.set(side * 0.63, 0.665, 1.97);
      this.body.add(bezel);
      // Mirrors.
      const mirror = new Mesh(new BoxGeometry(0.22, 0.09, 0.13), dark);
      mirror.position.set(side * 0.99, 0.92, 0.74);
      mirror.rotation.y = side * 0.15;
      mirror.castShadow = true;
      this.body.add(mirror);
    }
    const intake = new Mesh(new BoxGeometry(1.35, 0.16, 0.2), dark);
    intake.position.set(0, 0.36, 2.12);
    this.body.add(intake);

    // Full-width tail light bar and rear diffuser.
    const bar = new Mesh(new BoxGeometry(1.66, 0.09, 0.07), tail);
    bar.position.set(0, 0.9, -2.22);
    this.body.add(bar);
    const diffuser = new Mesh(new BoxGeometry(1.5, 0.22, 0.35), dark);
    diffuser.position.set(0, 0.34, -2.06);
    this.body.add(diffuser);
    for (const side of [-1, 1]) {
      const pipe = new Mesh(new CylinderGeometry(0.055, 0.055, 0.14, 10), chrome);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * 0.3, 0.42, -2.2);
      this.body.add(pipe);
    }
    // Engine deck grille slats.
    for (let i = 0; i < 5; i++) {
      const slat = new Mesh(new BoxGeometry(1.1, 0.02, 0.05), dark);
      slat.position.set(0, 1.0, -1.2 - i * 0.1);
      this.body.add(slat);
    }

    this.group.add(this.body);

    const r = spec.wheelRadius;
    for (const [zi, z] of [spec.wheelbase / 2, -spec.wheelbase / 2].entries()) {
      const front = zi === 0;
      for (const side of [-1, 1]) {
        const steer = new Group();
        steer.position.set(side * (front ? 0.79 : 0.81), r, z);
        const wheel = new Group();
        const tyre = new Mesh(new CylinderGeometry(r, r, front ? 0.32 : 0.4, 20), rubber);
        tyre.rotation.z = Math.PI / 2;
        tyre.castShadow = true;
        wheel.add(tyre);
        const rim = new Mesh(new CylinderGeometry(r * 0.7, r * 0.7, front ? 0.325 : 0.405, 20), chrome);
        rim.rotation.z = Math.PI / 2;
        wheel.add(rim);
        for (let i = 0; i < 5; i++) {
          const spoke = new Mesh(new BoxGeometry(0.05, r * 1.3, 0.05), chrome);
          spoke.rotation.x = (i / 5) * Math.PI;
          spoke.position.x = side * (front ? 0.13 : 0.16);
          wheel.add(spoke);
        }
        const hub = new Mesh(new CylinderGeometry(0.075, 0.075, front ? 0.345 : 0.425, 10), dark);
        hub.rotation.z = Math.PI / 2;
        wheel.add(hub);
        steer.add(wheel);
        this.wheelGroups.push(wheel);
        if (front) this.steerGroups.push(steer);
        this.group.add(steer);
      }
    }

    const shadowTex = blobShadowTexture();
    const shadowGeo = new CircleGeometry(1, 24);
    shadowGeo.rotateX(-Math.PI / 2);
    shadowGeo.scale(1.35, 1, 2.6);
    this.shadow = new Mesh(
      shadowGeo,
      new MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide }),
    );
    this.shadow.position.y = 0.03;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);

    this.group.name = 'car';
  }

  /** Reflections come from the sky; call once the environment map exists. */
  setEnvironment(env: Texture): void {
    for (const mat of this.materials) {
      if ('envMap' in mat) {
        (mat as MeshStandardMaterial).envMap = env;
        mat.needsUpdate = true;
      }
    }
  }

  setSteer(angle: number): void {
    for (const g of this.steerGroups) g.rotation.y = angle;
  }

  /** Roll into corners and squat/dive under acceleration — purely cosmetic. */
  setAttitude(roll: number, pitch: number): void {
    this.body.rotation.z = roll;
    this.body.rotation.x = pitch;
  }

  spinWheels(distance: number): void {
    const a = distance / this.spec.wheelRadius;
    for (const wheel of this.wheelGroups) wheel.rotation.x += a;
  }

  setShadowStrength(opacity: number): void {
    (this.shadow.material as MeshBasicMaterial).opacity = opacity;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof Mesh) obj.geometry.dispose();
    });
    for (const mat of this.materials) mat.dispose();
    (this.shadow.material as MeshBasicMaterial).map?.dispose();
    (this.shadow.material as MeshBasicMaterial).dispose();
  }
}
