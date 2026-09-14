import { clamp } from '../utils/math';

export type Action =
  | 'cruise'
  | 'camera'
  | 'nextTrack'
  | 'prevTrack'
  | 'muteMusic'
  | 'toggleHud'
  | 'pause'
  | 'photo'
  | 'stats';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'cruise',
  KeyC: 'camera',
  KeyN: 'nextTrack',
  KeyB: 'prevTrack',
  KeyM: 'muteMusic',
  KeyH: 'toggleHud',
  Escape: 'pause',
  KeyP: 'photo',
  F3: 'stats',
};

/** Keyboard, mouse-drag and gamepad input. Nothing here knows about the game. */
export class Input {
  throttle = 0;
  brake = 0;
  steer = 0;
  /** Set for one frame whenever the player touches anything. */
  activity = false;

  private readonly keys = new Set<string>();
  private readonly listeners = new Map<Action, Set<() => void>>();
  private readonly orbitListeners = new Set<(dYaw: number, dPitch: number) => void>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private prevButtons: boolean[] = [];
  private disposers: (() => void)[] = [];

  constructor(element: HTMLElement) {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const action = KEY_ACTIONS[e.code];
      if (action) {
        e.preventDefault();
        this.emit(action);
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
      this.activity = true;
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const onBlur = () => this.keys.clear();

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      element.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      this.activity = true;
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      for (const fn of this.orbitListeners) fn(-dx * 0.005, -dy * 0.003);
    };
    const onPointerUp = (e: PointerEvent) => {
      this.dragging = false;
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    this.disposers = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => element.removeEventListener('pointerdown', onPointerDown),
      () => element.removeEventListener('pointermove', onPointerMove),
      () => element.removeEventListener('pointerup', onPointerUp),
      () => element.removeEventListener('pointercancel', onPointerUp),
    ];
  }

  on(action: Action, fn: () => void): void {
    let set = this.listeners.get(action);
    if (!set) this.listeners.set(action, (set = new Set()));
    set.add(fn);
  }

  onOrbit(fn: (dYaw: number, dPitch: number) => void): void {
    this.orbitListeners.add(fn);
  }

  private emit(action: Action): void {
    this.activity = true;
    for (const fn of this.listeners.get(action) ?? []) fn();
  }

  private held(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** Call once per frame, before the car update. */
  sample(): void {
    this.throttle = this.held('KeyW', 'ArrowUp') ? 1 : 0;
    this.brake = this.held('KeyS', 'ArrowDown') ? 1 : 0;
    let steer = 0;
    if (this.held('KeyA', 'ArrowLeft')) steer += 1; // positive yaw = left
    if (this.held('KeyD', 'ArrowRight')) steer -= 1;
    this.steer = steer;
    this.sampleGamepad();
    if (this.throttle || this.brake || this.steer) this.activity = true;
  }

  private sampleGamepad(): void {
    const pads = navigator.getGamepads?.();
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    const deadzone = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    const axis = deadzone(pad.axes[0] ?? 0);
    if (axis) this.steer = clamp(this.steer - axis, -1, 1);
    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    if (rt > 0.02) this.throttle = Math.max(this.throttle, rt);
    if (lt > 0.02) this.brake = Math.max(this.brake, lt);

    const pressed = pad.buttons.map((b) => b.pressed);
    const tapped = (i: number) => pressed[i] && !this.prevButtons[i];
    if (tapped(0)) this.emit('cruise');
    if (tapped(3)) this.emit('camera');
    if (tapped(5)) this.emit('nextTrack');
    if (tapped(4)) this.emit('prevTrack');
    if (tapped(9)) this.emit('pause');
    this.prevButtons = pressed;
    if (this.throttle || this.brake || this.steer) this.activity = true;
  }

  dispose(): void {
    for (const fn of this.disposers) fn();
    this.listeners.clear();
    this.orbitListeners.clear();
  }
}
