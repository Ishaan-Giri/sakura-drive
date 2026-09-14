import type { CameraModeId } from '../camera/ChaseCamera';
import type { QualityId } from './Quality';

export interface Settings {
  quality: QualityId;
  musicVolume: number;
  ambienceVolume: number;
  musicMuted: boolean;
  shuffle: boolean;
  camera: CameraModeId;
  showSpeed: boolean;
  startInCruise: boolean;
  trackIndex: number;
}

const KEY = 'sakura-drive/settings';

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  musicVolume: 0.7,
  ambienceVolume: 0.5,
  musicMuted: false,
  shuffle: true,
  camera: 'chase',
  showSpeed: true,
  startInCruise: true,
  trackIndex: 0,
};

/** Settings persisted in localStorage; every access is guarded (private windows, blocked storage). */
export class SettingsStore {
  readonly values: Settings;
  private saveTimer: number | undefined;

  constructor() {
    this.values = { ...DEFAULT_SETTINGS, ...this.read() };
  }

  private read(): Partial<Settings> {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    } catch {
      return {};
    }
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.values[key] = value;
    this.saveSoon();
  }

  private saveSoon(): void {
    if (this.saveTimer !== undefined) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      try {
        localStorage.setItem(KEY, JSON.stringify(this.values));
      } catch {
        /* storage unavailable — settings just won't persist */
      }
    }, 400);
  }
}
