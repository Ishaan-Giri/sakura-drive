import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  type PerspectiveCamera,
  type Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

export interface SkyPalette {
  name: string;
  top: number;
  horizon: number;
  haze: number;
  groundBounce: number;
  sun: number;
  sunDirection: Vector3;
  sunIntensity: number;
  hemiIntensity: number;
}

/** Late-afternoon spring light: warm sun low in the sky, pink haze on the horizon. */
export const AFTERNOON: SkyPalette = {
  name: 'afternoon',
  top: 0x7fb4e8,
  horizon: 0xfae0e4,
  haze: 0xffd9c9,
  groundBounce: 0x9bc07e,
  sun: 0xfff0d8,
  sunDirection: new Vector3(0.45, 0.36, 0.82).normalize(),
  sunIntensity: 2.6,
  hemiIntensity: 1.5,
};

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    // Sky gradient: deep above, pale at the horizon, with a warm band just above it.
    vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
    col = mix(col, uHaze, exp(-abs(h) * 9.0) * 0.55);
    col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.25, h));
    // Sun disc and a soft bloom around it.
    float d = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSun * pow(d, 900.0) * 1.2;
    col += uSun * pow(d, 14.0) * 0.22;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Gradient sky dome, sun light and matching fog. */
export class Sky {
  readonly mesh: Mesh;
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly fog: Fog;
  private readonly material: ShaderMaterial;

  constructor(scene: Scene, readonly palette: SkyPalette, fogFar: number) {
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color(palette.top) },
        uHorizon: { value: new Color(palette.horizon) },
        uHaze: { value: new Color(palette.haze) },
        uSun: { value: new Color(palette.sun) },
        uSunDir: { value: palette.sunDirection.clone() },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(1800, 24, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
    scene.add(this.mesh);

    this.sun = new DirectionalLight(palette.sun, palette.sunIntensity);
    this.sun.position.copy(palette.sunDirection).multiplyScalar(60);
    this.sun.castShadow = true;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.035;
    this.setShadowExtent(42);
    scene.add(this.sun, this.sun.target);

    this.hemi = new HemisphereLight(palette.horizon, palette.groundBounce, palette.hemiIntensity);
    scene.add(this.hemi);

    this.fog = new Fog(palette.horizon, fogFar * 0.16, fogFar);
    scene.fog = this.fog;
    scene.background = null;
  }

  setShadowExtent(half: number): void {
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
  }

  setShadowMapSize(size: number): void {
    if (this.sun.shadow.mapSize.width === size) return;
    this.sun.shadow.mapSize.setScalar(size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  setFogFar(far: number): void {
    this.fog.near = far * 0.16;
    this.fog.far = far;
  }

  /** Keep the dome and the shadow frustum centred on the action. */
  update(camera: PerspectiveCamera, focus: Vector3): void {
    this.mesh.position.copy(camera.position);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.palette.sunDirection, 70);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
