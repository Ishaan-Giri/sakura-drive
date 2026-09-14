import { GenerativeStation } from './GenerativeStation';

export interface Track {
  file: string;
  title: string;
  artist?: string;
}

export interface NowPlaying {
  title: string;
  artist: string;
  /** True while the built-in generative station is playing (no files installed). */
  generative: boolean;
}

const CROSSFADE = 3.2;

/**
 * Radio-style player: reads `public/music/playlist.json`, streams tracks and crossfades between
 * them. If no playlist is installed it falls back to a built-in generative ambient station so the
 * game is never silent.
 */
export class MusicPlayer {
  tracks: Track[] = [];
  index = 0;
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly elements: HTMLAudioElement[] = [];
  private readonly gains: GainNode[] = [];
  private active = 0;
  private fading = false;
  private starting = false;
  private failures = 0;
  private generative: GenerativeStation | null = null;
  private listeners = new Set<(now: NowPlaying | null) => void>();
  private order: number[] = [];
  private shuffle = true;

  constructor(ctx: AudioContext, volume: number, shuffle: boolean) {
    this.ctx = ctx;
    this.shuffle = shuffle;
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(ctx.destination);

    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain);
      gain.connect(this.master);
      el.addEventListener('ended', () => this.onEnded(i));
      el.addEventListener('error', () => this.onError(i));
      el.addEventListener('timeupdate', () => this.onTimeUpdate(i));
      this.elements.push(el);
      this.gains.push(gain);
    }
  }

  onChange(fn: (now: NowPlaying | null) => void): void {
    this.listeners.add(fn);
  }

  private announce(): void {
    const now = this.nowPlaying();
    for (const fn of this.listeners) fn(now);
  }

  nowPlaying(): NowPlaying | null {
    if (this.generative?.playing) {
      return { title: 'Drifting Petals', artist: 'Generated live', generative: true };
    }
    const track = this.tracks[this.index];
    if (!track) return null;
    return { title: track.title, artist: track.artist ?? '', generative: false };
  }

  get isGenerative(): boolean {
    return !!this.generative?.playing;
  }

  async load(baseUrl: string, startIndex: number): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}music/playlist.json`, { cache: 'no-cache' });
      if (res.ok) {
        const data = (await res.json()) as { tracks?: Track[] } | Track[];
        const list = Array.isArray(data) ? data : (data.tracks ?? []);
        this.tracks = list.filter((t) => t && typeof t.file === 'string');
      }
    } catch {
      /* no playlist installed — the generative station takes over */
    }
    this.baseUrl = baseUrl;
    this.buildOrder();
    this.index = this.tracks.length ? Math.min(startIndex, this.tracks.length - 1) : 0;
  }

  private baseUrl = './';

  private buildOrder(): void {
    this.order = this.tracks.map((_, i) => i);
    if (this.shuffle) {
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }
  }

  setShuffle(on: boolean): void {
    this.shuffle = on;
    this.buildOrder();
  }

  setVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** Start playing; falls back to the generative station when there are no tracks. */
  async start(): Promise<void> {
    if (this.tracks.length === 0) {
      this.startGenerative();
      return;
    }
    await this.play(this.index, false);
  }

  private startGenerative(): void {
    if (!this.generative) this.generative = new GenerativeStation(this.ctx, this.master);
    this.generative.start();
    this.announce();
  }

  private async play(index: number, fade = true): Promise<void> {
    if (this.tracks.length === 0) return;
    this.generative?.stop();
    this.index = ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
    const next = fade ? 1 - this.active : this.active;
    const el = this.elements[next];
    const track = this.tracks[this.index];
    el.src = this.baseUrl + 'music/' + encodeURIComponent(track.file).replace(/%2F/g, '/');
    el.currentTime = 0;
    this.starting = true;
    try {
      await el.play();
      this.failures = 0;
    } catch {
      this.starting = false;
      this.onError(next);
      return;
    }
    this.starting = false;
    const now = this.ctx.currentTime;
    const fadeTime = fade ? CROSSFADE : 1.2;
    this.gains[next].gain.cancelScheduledValues(now);
    this.gains[next].gain.setValueAtTime(this.gains[next].gain.value, now);
    this.gains[next].gain.linearRampToValueAtTime(1, now + fadeTime);
    if (fade) {
      const prev = this.active;
      this.gains[prev].gain.cancelScheduledValues(now);
      this.gains[prev].gain.setValueAtTime(this.gains[prev].gain.value, now);
      this.gains[prev].gain.linearRampToValueAtTime(0, now + fadeTime);
      window.setTimeout(() => {
        this.elements[prev].pause();
        this.fading = false;
      }, fadeTime * 1000 + 60);
    }
    this.active = next;
    this.announce();
  }

  private orderPosition(): number {
    const pos = this.order.indexOf(this.index);
    return pos < 0 ? 0 : pos;
  }

  next(): void {
    if (!this.tracks.length) return;
    const pos = (this.orderPosition() + 1) % this.order.length;
    void this.play(this.order[pos]);
  }

  previous(): void {
    if (!this.tracks.length) return;
    const el = this.elements[this.active];
    // Restart the current track first, like a real music player.
    if (el.currentTime > 4) {
      el.currentTime = 0;
      return;
    }
    const pos = (this.orderPosition() - 1 + this.order.length) % this.order.length;
    void this.play(this.order[pos]);
  }

  private onEnded(which: number): void {
    if (which !== this.active || this.fading) return;
    this.next();
  }

  private onTimeUpdate(which: number): void {
    if (which !== this.active || this.fading || this.starting) return;
    const el = this.elements[which];
    if (!Number.isFinite(el.duration)) return;
    if (el.duration - el.currentTime <= CROSSFADE) {
      this.fading = true;
      this.next();
    }
  }

  private onError(which: number): void {
    if (which !== this.active && !this.starting) return;
    this.failures++;
    if (this.failures >= Math.max(2, this.tracks.length)) {
      // Every track failed to load: keep the drive scored anyway.
      this.tracks = [];
      this.startGenerative();
      return;
    }
    this.next();
  }

  suspend(): void {
    for (const el of this.elements) el.pause();
    this.generative?.stop();
  }

  dispose(): void {
    this.suspend();
    for (const el of this.elements) el.src = '';
    this.listeners.clear();
  }
}
