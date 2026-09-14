import { CAMERA_MODES, type CameraModeId } from '../camera/ChaseCamera';
import type { QualityId } from '../core/Quality';
import type { Settings } from '../core/Settings';

const CONTROLS = [
  ['W / ↑', 'Accelerate'],
  ['S / ↓', 'Brake'],
  ['A D / ← →', 'Steer'],
  ['Space', 'Cruise'],
  ['C', 'Camera'],
  ['N B', 'Track'],
  ['M', 'Mute'],
  ['H', 'Hide HUD'],
  ['Esc', 'Menu'],
  ['Drag', 'Look around'],
];

/** The opening screen. Clicking "Begin" is also what unlocks audio in the browser. */
export class StartScreen {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly onBegin: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    this.root.innerHTML = `
      <div class="start-card">
        <h1 class="start-title">Sakura Drive</h1>
        <p class="start-kanji">桜ドライブ</p>
        <p class="start-sub">A quiet road through spring. No timer, no traffic — just the drive.</p>
        <button class="begin-btn">Begin</button>
        <div class="controls-row">
          ${CONTROLS.map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('')}
        </div>
      </div>
    `;
    parent.appendChild(this.root);
    const btn = this.root.querySelector('.begin-btn') as HTMLButtonElement;
    btn.addEventListener('click', () => this.begin());
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.begin();
      }
    };
    window.addEventListener('keydown', onKey);
    this.cleanup = () => window.removeEventListener('keydown', onKey);
    btn.focus();
  }

  private cleanup: () => void;
  private done = false;

  private begin(): void {
    if (this.done) return;
    this.done = true;
    this.cleanup();
    this.root.classList.add('fade-out');
    window.setTimeout(() => this.root.classList.add('hidden'), 950);
    this.onBegin();
  }
}

export interface MenuCallbacks {
  onResume: () => void;
  onQuality: (q: QualityId) => void;
  onMusicVolume: (v: number) => void;
  onAmbienceVolume: (v: number) => void;
  onCamera: (c: CameraModeId) => void;
  onShuffle: (on: boolean) => void;
  onShowSpeed: (on: boolean) => void;
  onRestart: () => void;
}

/** Pause / settings panel. The world keeps drifting behind it and the music keeps playing. */
export class PauseMenu {
  readonly root: HTMLDivElement;
  private open = false;

  constructor(parent: HTMLElement, settings: Settings, private readonly cb: MenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.innerHTML = `
      <div class="menu">
        <h2>Paused</h2>
        <p class="sub">息を整えて — take a breath</p>

        <div class="row">
          <label>Graphics</label>
          <div class="segment" data-group="quality">
            ${(['auto', 'low', 'medium', 'high'] as QualityId[])
              .map((q) => `<button data-quality="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`)
              .join('')}
          </div>
        </div>
        <div class="row">
          <label>Camera</label>
          <div class="segment" data-group="camera">
            ${CAMERA_MODES.map((m) => `<button data-camera="${m.id}">${m.label}</button>`).join('')}
          </div>
        </div>
        <div class="row">
          <label>Music</label>
          <input type="range" data-slider="music" min="0" max="1" step="0.01">
        </div>
        <div class="row">
          <label>World sound</label>
          <input type="range" data-slider="ambience" min="0" max="1" step="0.01">
        </div>
        <div class="row">
          <label>Shuffle tracks</label>
          <button class="switch" data-switch="shuffle"></button>
        </div>
        <div class="row">
          <label>Show speed</label>
          <button class="switch" data-switch="speed"></button>
        </div>

        <div class="menu-actions">
          <button class="primary" data-act="resume">Resume</button>
          <button data-act="restart">New road</button>
        </div>
        <p class="note">
          Add your own music by dropping files into <code>public/music/</code> and listing them in
          <code>public/music/playlist.json</code>. Until then a soft generative station plays.
        </p>
      </div>
    `;
    parent.appendChild(this.root);
    this.sync(settings);

    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('button');
      if (!el) return;
      const quality = el.getAttribute('data-quality') as QualityId | null;
      if (quality) {
        this.setActive('quality', quality);
        cb.onQuality(quality);
      }
      const camera = el.getAttribute('data-camera') as CameraModeId | null;
      if (camera) {
        this.setActive('camera', camera);
        cb.onCamera(camera);
      }
      const sw = el.getAttribute('data-switch');
      if (sw) {
        const on = !el.classList.contains('on');
        el.classList.toggle('on', on);
        if (sw === 'shuffle') cb.onShuffle(on);
        if (sw === 'speed') cb.onShowSpeed(on);
      }
      const act = el.getAttribute('data-act');
      if (act === 'resume') this.hide();
      if (act === 'restart') cb.onRestart();
    });

    this.root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const slider = el.getAttribute('data-slider');
      if (slider === 'music') cb.onMusicVolume(Number(el.value));
      if (slider === 'ambience') cb.onAmbienceVolume(Number(el.value));
    });
  }

  private setActive(group: string, value: string): void {
    const container = this.root.querySelector(`[data-group="${group}"]`)!;
    for (const btn of container.querySelectorAll('button')) {
      const attr = group === 'quality' ? 'data-quality' : 'data-camera';
      btn.classList.toggle('active', btn.getAttribute(attr) === value);
    }
  }

  sync(settings: Settings): void {
    this.setActive('quality', settings.quality);
    this.setActive('camera', settings.camera);
    (this.root.querySelector('[data-slider="music"]') as HTMLInputElement).value = String(settings.musicVolume);
    (this.root.querySelector('[data-slider="ambience"]') as HTMLInputElement).value = String(settings.ambienceVolume);
    this.root.querySelector('[data-switch="shuffle"]')!.classList.toggle('on', settings.shuffle);
    this.root.querySelector('[data-switch="speed"]')!.classList.toggle('on', settings.showSpeed);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open ? this.hide() : this.show();
  }

  show(): void {
    this.open = true;
    this.root.classList.remove('hidden', 'fade-out');
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('fade-out');
    window.setTimeout(() => {
      if (!this.open) this.root.classList.add('hidden');
    }, 500);
    this.cb.onResume();
  }
}
