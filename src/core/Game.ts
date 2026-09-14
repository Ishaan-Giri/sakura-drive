import {
  ACESFilmicToneMapping,
  Color,
  LineBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  NeutralToneMapping,
  NoToneMapping,
  PCFSoftShadowMap,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { AFTERNOON, Sky } from '../world/Sky';
import { Backdrop } from '../world/Backdrop';
import { Road } from '../world/Road';
import { BIOMES, BiomeMap, type BiomeId } from '../world/Biomes';
import { Terrain } from '../world/Terrain';
import { ChunkManager } from '../world/ChunkManager';
import { Petals } from '../world/Petals';
import { PropLibrary, worldUniforms } from '../world/props/library';
import { createRoadTexture } from '../world/roadTexture';
import { CarModel } from '../vehicle/CarModel';
import { CarController, MAX_SPEED } from '../vehicle/CarController';
import { ChaseCamera } from '../camera/ChaseCamera';
import { Input } from './Input';
import { SettingsStore } from './Settings';
import { AdaptiveResolution, PRESETS, detectPreset, type QualityPreset } from './Quality';
import { MusicPlayer } from '../audio/MusicPlayer';
import { Ambience } from '../audio/Ambience';
import { HUD } from '../ui/HUD';
import { PauseMenu, StartScreen } from '../ui/Menu';
import { clamp } from '../utils/math';

const FIXED_STEP = 1 / 120;

export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: ChaseCamera;
  private readonly settings = new SettingsStore();
  private readonly input: Input;
  private readonly hud: HUD;
  private readonly menu: PauseMenu;

  private road!: Road;
  private biomes!: BiomeMap;
  private terrain!: Terrain;
  private chunks!: ChunkManager;
  private sky!: Sky;
  private backdrop!: Backdrop;
  private petals!: Petals;
  private car!: CarModel;
  private controller!: CarController;

  private readonly props = new PropLibrary();
  private readonly terrainMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly roadMaterial: MeshLambertMaterial;
  private readonly waterMaterial = new MeshPhongMaterial({
    color: 0x8ec9d8, shininess: 110, specular: 0xffffff, transparent: true, opacity: 0.88,
  });
  private readonly wireMaterial = new LineBasicMaterial({ color: 0x4a4741, transparent: true, opacity: 0.75 });

  private preset: QualityPreset;
  private readonly adaptive = new AdaptiveResolution();
  private composer: { render: (dt?: number) => void; setSize: (w: number, h: number) => void; dispose: () => void } | null = null;
  private envMap: Texture | null = null;

  private seed: number;
  private running = false;
  private started = false;
  private paused = false;
  private lastTime = 0;
  private accumulator = 0;
  private frameMs = 16;
  private lastBiome: BiomeId | null = null;
  private music: MusicPlayer | null = null;
  private ambience: Ambience | null = null;
  private audioCtx: AudioContext | null = null;
  private stats: { begin: () => void; end: () => void; dom: HTMLElement } | null = null;
  private readonly focus = new Vector3();

  constructor(container: HTMLElement, private readonly ui: HTMLElement) {
    this.seed = Math.floor(Math.random() * 1e9);

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.preset =
      this.settings.values.quality === 'auto'
        ? detectPreset(this.renderer)
        : PRESETS[this.settings.values.quality];

    this.roadMaterial = new MeshLambertMaterial({
      map: createRoadTexture(this.renderer.capabilities.getMaxAnisotropy()),
    });

    this.camera = new ChaseCamera(window.innerWidth / window.innerHeight, 2600);
    this.camera.setMode(this.settings.values.camera);

    this.input = new Input(this.renderer.domElement);
    this.hud = new HUD(ui, {
      next: () => this.music?.next(),
      prev: () => this.music?.previous(),
      toggleMute: () => this.toggleMute(),
    });
    this.hud.setSpeedVisible(this.settings.values.showSpeed);
    this.menu = new PauseMenu(ui, this.settings.values, {
      onResume: () => this.resume(),
      onQuality: (q) => this.applyQuality(q),
      onMusicVolume: (v) => {
        this.settings.set('musicVolume', v);
        this.settings.set('musicMuted', false);
        this.music?.setVolume(v);
        this.hud.setMuted(false);
      },
      onAmbienceVolume: (v) => {
        this.settings.set('ambienceVolume', v);
        this.ambience?.setVolume(v);
      },
      onCamera: (c) => {
        this.settings.set('camera', c);
        this.camera.setMode(c);
      },
      onShuffle: (on) => {
        this.settings.set('shuffle', on);
        this.music?.setShuffle(on);
      },
      onShowSpeed: (on) => {
        this.settings.set('showSpeed', on);
        this.hud.setSpeedVisible(on);
      },
      onRestart: () => this.restart(),
    });

    this.buildWorld();
    this.bindInput();
    this.bindWindow();
    void this.setupPostProcessing();

    new StartScreen(ui, () => void this.begin());
    // Run the world behind the start screen so the first thing players see is the drive itself.
    this.camera.setMode('cinematic');
    this.hud.setForcedHidden(true);
    this.start();
  }

  // ---------------------------------------------------------------- world ---

  private buildWorld(): void {
    this.road = new Road(this.seed);
    this.biomes = new BiomeMap(this.seed);
    this.terrain = new Terrain(this.road, this.biomes);
    this.sky = new Sky(this.scene, AFTERNOON, this.preset.drawDistance);
    this.sky.setShadowMapSize(this.preset.shadowMapSize);
    this.sky.sun.castShadow = this.preset.shadowTier > 0;
    this.backdrop = new Backdrop(this.scene, AFTERNOON, this.seed);
    this.petals = new Petals(this.scene, PRESETS.high.petals, this.seed);
    this.petals.setCount(this.preset.petals);

    this.chunks = new ChunkManager(
      this.scene,
      {
        terrain: this.terrain,
        props: this.props,
        terrainMaterial: this.terrainMaterial,
        roadMaterial: this.roadMaterial,
        waterMaterial: this.waterMaterial,
        wireMaterial: this.wireMaterial,
        seed: this.seed,
        density: this.preset.propDensity,
        shadowTier: this.preset.shadowTier,
      },
      this.preset.drawDistance,
    );

    this.car = new CarModel();
    this.scene.add(this.car.group);
    this.controller = new CarController(this.road);
    this.controller.cruise = this.settings.values.startInCruise;

    // Reflections for the car paint come from the sky itself.
    const pmrem = new PMREMGenerator(this.renderer);
    const skyScene = new Scene();
    const skyClone = this.sky.mesh.clone();
    skyScene.add(skyClone);
    this.envMap = pmrem.fromScene(skyScene, 0.02).texture;
    this.car.setEnvironment(this.envMap);
    pmrem.dispose();

    // Build the first stretch of road up front so there is never an empty frame.
    this.chunks.update(this.controller.s, Infinity);
    this.controller.update(0.0001, { throttle: 0, brake: 0, steer: 0 }, this.car);
  }

  private restart(): void {
    this.seed = Math.floor(Math.random() * 1e9);
    this.chunks.dispose();
    this.scene.remove(this.car.group);
    this.car.dispose();
    this.sky.dispose();
    this.backdrop.dispose();
    this.petals.dispose();
    this.scene.remove(this.sky.mesh, this.sky.sun, this.sky.sun.target, this.sky.hemi, this.backdrop.mountains, this.backdrop.clouds, this.backdrop.ground, this.petals.mesh);
    this.envMap?.dispose();
    this.lastBiome = null;
    this.buildWorld();
    this.camera.setMode(this.settings.values.camera);
    this.menu.hide();
    this.hud.showToast('A new road');
  }

  // ---------------------------------------------------------------- input ---

  private bindInput(): void {
    this.input.on('cruise', () => {
      this.controller.setCruise(!this.controller.cruise);
      this.hud.showToast(this.controller.cruise ? `Cruise on · ${Math.round(this.controller.cruiseSpeed * 3.6)} km/h` : 'Cruise off');
    });
    this.input.on('camera', () => {
      const mode = this.camera.cycleMode();
      this.settings.set('camera', mode.id);
      this.hud.showToast(`Camera · ${mode.label}`);
    });
    this.input.on('nextTrack', () => this.music?.next());
    this.input.on('prevTrack', () => this.music?.previous());
    this.input.on('muteMusic', () => this.toggleMute());
    this.input.on('toggleHud', () => {
      const hide = !this.hud.isDim;
      this.hud.setForcedHidden(hide);
      if (!hide) this.hud.wake();
    });
    this.input.on('pause', () => {
      if (!this.started) return;
      this.menu.isOpen ? this.menu.hide() : this.pause();
    });
    this.input.on('stats', () => void this.toggleStats());
    this.input.onOrbit((dy, dp) => this.camera.orbit(dy, dp));
  }

  private bindWindow(): void {
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.running = false;
      else if (this.started || !this.menu.isOpen) this.start();
    });
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.setAspect(w / h);
    this.renderer.setSize(w, h);
    this.applyPixelRatio();
    this.composer?.setSize(w, h);
  }

  private applyPixelRatio(): void {
    const ratio = Math.min(window.devicePixelRatio, this.preset.pixelRatio) * this.adaptive.scale;
    this.renderer.setPixelRatio(ratio);
  }

  // ---------------------------------------------------------------- audio ---

  private async begin(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.camera.setMode(this.settings.values.camera);
    this.hud.setForcedHidden(false);
    this.hud.wake();

    const ctx = new AudioContext();
    this.audioCtx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();

    const s = this.settings.values;
    this.ambience = new Ambience(ctx, s.ambienceVolume);
    this.ambience.start();

    this.music = new MusicPlayer(ctx, s.musicMuted ? 0 : s.musicVolume, s.shuffle);
    this.music.onChange((now) => {
      this.hud.setTrack(now);
      if (now && !now.generative) this.settings.set('trackIndex', this.music!.index);
      this.updateMediaSession(now);
    });
    await this.music.load(import.meta.env.BASE_URL, s.trackIndex);
    await this.music.start();
    this.hud.setMuted(s.musicMuted);

    this.setupMediaSession();
    if (this.controller.cruise) {
      this.hud.showToast('Cruising · take the wheel any time');
    }
  }

  private toggleMute(): void {
    const muted = !this.settings.values.musicMuted;
    this.settings.set('musicMuted', muted);
    this.music?.setVolume(muted ? 0 : this.settings.values.musicVolume);
    this.hud.setMuted(muted);
    this.hud.showToast(muted ? 'Music muted' : 'Music on');
  }

  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('nexttrack', () => this.music?.next());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.music?.previous());
    navigator.mediaSession.setActionHandler('pause', () => this.toggleMute());
    navigator.mediaSession.setActionHandler('play', () => this.toggleMute());
  }

  private updateMediaSession(now: { title: string; artist: string } | null): void {
    if (!('mediaSession' in navigator) || !now) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: now.title,
      artist: now.artist || 'Sakura Drive',
      album: 'Sakura Drive',
    });
  }

  // -------------------------------------------------------------- quality ---

  private applyQuality(id: Parameters<PauseMenu['sync']>[0]['quality']): void {
    this.settings.set('quality', id);
    this.preset = id === 'auto' ? detectPreset(this.renderer) : PRESETS[id];
    this.adaptive.reset();
    this.applyPixelRatio();
    this.sky.setFogFar(this.preset.drawDistance);
    this.sky.setShadowMapSize(this.preset.shadowMapSize);
    this.sky.sun.castShadow = this.preset.shadowTier > 0;
    this.chunks.setDrawDistance(this.preset.drawDistance);
    this.chunks.setShadowTier(this.preset.shadowTier);
    this.petals.setCount(this.preset.petals);
    this.chunks.rebuild(this.controller.s);
    void this.setupPostProcessing();
    this.hud.showToast(`Graphics · ${this.preset.label}`);
  }

  /** Bloom and vignette, loaded only when the high preset actually wants them. */
  private async setupPostProcessing(): Promise<void> {
    if (!this.preset.postProcessing) {
      this.composer?.dispose();
      this.composer = null;
      this.renderer.toneMapping = NeutralToneMapping;
      return;
    }
    if (this.composer) return;
    try {
      const pp = await import('postprocessing');
      const composer = new pp.EffectComposer(this.renderer, { multisampling: 4 });
      composer.addPass(new pp.RenderPass(this.scene, this.camera.camera));
      composer.addPass(
        new pp.EffectPass(
          this.camera.camera,
          new pp.BloomEffect({ intensity: 0.55, luminanceThreshold: 0.75, luminanceSmoothing: 0.3, mipmapBlur: true }),
          new pp.VignetteEffect({ darkness: 0.32, offset: 0.32 }),
          new pp.ToneMappingEffect({ mode: pp.ToneMappingMode.NEUTRAL }),
        ),
      );
      composer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.toneMapping = NoToneMapping;
      this.composer = composer;
    } catch {
      // Post-processing is a nicety; the game runs fine without it.
      this.renderer.toneMapping = NeutralToneMapping;
    }
  }

  private async toggleStats(): Promise<void> {
    if (this.stats) {
      this.stats.dom.remove();
      this.stats = null;
      return;
    }
    const mod = await import('stats.js');
    const Stats = mod.default;
    const stats = new Stats();
    stats.dom.style.left = 'auto';
    stats.dom.style.right = '0';
    this.ui.appendChild(stats.dom);
    this.stats = stats;
  }

  // ----------------------------------------------------------------- loop ---

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  private pause(): void {
    this.paused = true;
    this.menu.sync(this.settings.values);
    this.menu.show();
  }

  private resume(): void {
    this.paused = false;
  }

  private readonly frame = (time: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    this.stats?.begin();

    const rawDt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    const dt = clamp(rawDt, 0, 0.1);
    this.frameMs += (rawDt * 1000 - this.frameMs) * 0.1;

    if (!this.paused) this.simulate(dt);
    this.present(dt);

    if (this.adaptive.update(dt, this.frameMs)) this.applyPixelRatio();
    this.input.activity = false;
    this.stats?.end();
  };

  private simulate(dt: number): void {
    this.input.sample();
    const c = this.controller;

    // In cruise, the throttle keys nudge the set speed instead of fighting the controller.
    if (c.cruise) {
      if (this.input.throttle > 0) c.adjustCruise(dt * 4);
      if (this.input.brake > 0) c.adjustCruise(-dt * 6);
    }

    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    while (this.accumulator >= FIXED_STEP) {
      c.update(FIXED_STEP, { throttle: this.input.throttle, brake: this.input.brake, steer: this.input.steer }, this.car);
      this.accumulator -= FIXED_STEP;
    }

    this.chunks.update(c.s);
    worldUniforms.uTime.value += dt;

    const sample = this.biomes.sample(c.s + 30);
    const primary = sample.t > 0.5 ? sample.b : sample.a;
    if (primary.id !== this.lastBiome) {
      this.lastBiome = primary.id;
      const def = BIOMES[primary.id];
      if (this.started) this.hud.showPlace(def.kanji, def.name);
    }

    const petalDensity = clamp(this.biomes.blend(c.s, (def) => def.petals) * 0.9 + 0.08, 0.05, 1);
    this.petals.update(this.camera.camera, dt, petalDensity);

    const bird = clamp(1 - this.biomes.weight('village', c.s), 0.15, 1) * 0.55;
    this.ambience?.update(dt, c.speed, MAX_SPEED, this.input.throttle, c.onVerge, bird);

    this.hud.update(dt, c.kmh, c.cruise, c.cruiseSpeed * 3.6, this.input.activity);
    this.ui.classList.toggle('hide-cursor', this.hud.isDim && !this.menu.isOpen);
  }

  private present(dt: number): void {
    const c = this.controller;
    this.focus.copy(this.car.group.position);
    this.camera.update(dt, this.car, c, c.position.y);
    this.sky.update(this.camera.camera, this.focus);
    this.backdrop.update(this.camera.camera, c.position.y, dt);
    this.car.setShadowStrength(this.preset.shadowTier > 0 ? 0.32 : 0.5);

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera.camera);
  }

  /** Small stable surface for debugging and automated checks (see README). */
  get debug() {
    return {
      controller: this.controller,
      renderer: this.renderer,
      scene: this.scene,
      chunksLoaded: () => this.chunks.loaded,
      biome: () => this.biomes.segmentAt(this.controller.s).id,
      preset: () => this.preset.label,
      teleport: (s: number) => {
        this.controller.s = s;
        this.chunks.rebuild(s);
      },
    };
  }

  dispose(): void {
    this.running = false;
    this.input.dispose();
    this.chunks.dispose();
    this.props.dispose();
    this.car.dispose();
    this.sky.dispose();
    this.backdrop.dispose();
    this.petals.dispose();
    this.music?.dispose();
    this.ambience?.dispose();
    void this.audioCtx?.close();
    this.composer?.dispose();
    this.terrainMaterial.dispose();
    this.roadMaterial.map?.dispose();
    this.roadMaterial.dispose();
    this.waterMaterial.dispose();
    this.wireMaterial.dispose();
    this.envMap?.dispose();
    this.renderer.dispose();
    void new Color();
    void ACESFilmicToneMapping;
  }
}
