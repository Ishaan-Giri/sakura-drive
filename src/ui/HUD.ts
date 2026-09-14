import type { NowPlaying } from '../audio/MusicPlayer';

const ICONS = {
  prev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2.5v14H6zm12 0v14l-9-7z"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 5H18v14h-2.5zM6 5l9 7-9 7z"/></svg>',
  mute: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z"/></svg>',
  muted: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm13.5 3 2.5 2.5-1 1L16.5 13 14 15.5l-1-1L15.5 12 13 9.5l1-1 2.5 2.5L19 8.5l1 1z"/></svg>',
};

/** Minimal on-screen furniture: now playing, speed, place names and passing toasts. */
export class HUD {
  readonly root: HTMLDivElement;
  private readonly nowPlaying: HTMLDivElement;
  private readonly npTitle: HTMLDivElement;
  private readonly npArtist: HTMLDivElement;
  private readonly npArt: HTMLDivElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly speedValue: HTMLDivElement;
  private readonly speedBox: HTMLDivElement;
  private readonly cruiseTag: HTMLDivElement;
  private readonly place: HTMLDivElement;
  private readonly placeKanji: HTMLDivElement;
  private readonly placeName: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private toastTimer: number | undefined;
  private placeTimer: number | undefined;
  private idle = 0;
  private hidden = false;
  private forcedHidden = false;

  constructor(
    parent: HTMLElement,
    private readonly actions: { next: () => void; prev: () => void; toggleMute: () => void },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="now-playing">
        <div class="np-art">♪</div>
        <div class="np-text">
          <div class="np-title">—</div>
          <div class="np-artist"></div>
        </div>
        <div class="np-buttons">
          <button class="icon-btn" data-act="prev" title="Previous track (B)">${ICONS.prev}</button>
          <button class="icon-btn" data-act="mute" title="Mute music (M)">${ICONS.mute}</button>
          <button class="icon-btn" data-act="next" title="Next track (N)">${ICONS.next}</button>
        </div>
      </div>
      <div class="speed">
        <div><span class="speed-value">0</span></div>
        <div class="speed-unit">KM / H</div>
        <div class="cruise-tag"><span class="cruise-dot"></span><span class="cruise-text">CRUISE</span></div>
      </div>
      <div class="place"><div class="place-kanji"></div><div class="place-name"></div></div>
      <div class="toast"></div>
    `;
    parent.appendChild(this.root);

    this.nowPlaying = this.root.querySelector('.now-playing')!;
    this.npTitle = this.root.querySelector('.np-title')!;
    this.npArtist = this.root.querySelector('.np-artist')!;
    this.npArt = this.root.querySelector('.np-art')!;
    this.muteBtn = this.root.querySelector('[data-act="mute"]')!;
    this.speedValue = this.root.querySelector('.speed-value')!;
    this.speedBox = this.root.querySelector('.speed')!;
    this.cruiseTag = this.root.querySelector('.cruise-tag')!;
    this.place = this.root.querySelector('.place')!;
    this.placeKanji = this.root.querySelector('.place-kanji')!;
    this.placeName = this.root.querySelector('.place-name')!;
    this.toast = this.root.querySelector('.toast')!;

    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
      if (act === 'next') this.actions.next();
      if (act === 'prev') this.actions.prev();
      if (act === 'mute') this.actions.toggleMute();
    });
  }

  setTrack(now: NowPlaying | null): void {
    if (!now) {
      this.npTitle.textContent = 'No music installed';
      this.npArtist.textContent = 'Add tracks to public/music';
      this.npArt.classList.remove('spin');
      return;
    }
    this.npTitle.textContent = now.title;
    this.npArtist.textContent = now.artist;
    this.npArt.textContent = now.generative ? '❀' : '♪';
    this.npArt.classList.add('spin');
    // Re-trigger the slide-in animation.
    this.nowPlaying.classList.add('enter');
    requestAnimationFrame(() => requestAnimationFrame(() => this.nowPlaying.classList.remove('enter')));
    this.wake();
  }

  setMuted(muted: boolean): void {
    this.muteBtn.innerHTML = muted ? ICONS.muted : ICONS.mute;
    this.muteBtn.style.opacity = muted ? '1' : '';
  }

  setSpeedVisible(visible: boolean): void {
    this.speedBox.style.display = visible ? '' : 'none';
  }

  showPlace(kanji: string, name: string): void {
    this.placeKanji.textContent = kanji;
    this.placeName.textContent = name;
    this.place.classList.add('show');
    if (this.placeTimer) window.clearTimeout(this.placeTimer);
    this.placeTimer = window.setTimeout(() => this.place.classList.remove('show'), 4200);
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 1900);
    this.wake();
  }

  /** Any input resets the auto-hide timer. */
  wake(): void {
    this.idle = 0;
    if (this.hidden) {
      this.hidden = false;
      if (!this.forcedHidden) this.root.classList.remove('dim');
    }
  }

  setForcedHidden(hidden: boolean): void {
    this.forcedHidden = hidden;
    this.root.classList.toggle('dim', hidden || this.hidden);
  }

  update(dt: number, kmh: number, cruise: boolean, cruiseKmh: number, activity: boolean): void {
    this.speedValue.textContent = String(Math.round(kmh));
    this.cruiseTag.classList.toggle('on', cruise);
    if (cruise) {
      (this.cruiseTag.querySelector('.cruise-text') as HTMLElement).textContent = `CRUISE ${Math.round(cruiseKmh)}`;
    }
    if (activity) this.wake();
    else {
      this.idle += dt;
      if (this.idle > 5 && !this.hidden) {
        this.hidden = true;
        this.root.classList.add('dim');
      }
    }
  }

  get isDim(): boolean {
    return this.hidden || this.forcedHidden;
  }
}
