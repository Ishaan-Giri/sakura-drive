/**
 * A small built-in ambient station used when no music files are installed: slow pentatonic chords
 * on a soft synth pad, with sparse bell notes drifting over the top. Deliberately unobtrusive.
 */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // major pentatonic, two octaves
const ROOTS = [55, 58.27, 61.74, 49]; // A1, B♭1, B1, G1 — slow, gentle key changes

export class GenerativeStation {
  playing = false;
  private readonly out: GainNode;
  private readonly reverb: ConvolverNode;
  private timer: number | undefined;
  private rootIndex = 0;
  private step = 0;

  constructor(private readonly ctx: AudioContext, destination: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = createImpulse(ctx, 3.4, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.out.connect(destination);
    this.out.connect(this.reverb);
    this.reverb.connect(wet);
    wet.connect(destination);
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(0.42, now + 4);
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 6000);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 2);
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (!this.playing) return;
    const t = this.ctx.currentTime + 0.1;
    this.step++;
    if (this.step % 4 === 0) this.rootIndex = (this.rootIndex + 1 + Math.floor(Math.random() * 2)) % ROOTS.length;
    const root = ROOTS[this.rootIndex];

    // Pad: root, fifth and a colour tone, each drifting slightly out of phase.
    for (const semi of [0, 7, Math.random() < 0.5 ? 16 : 18]) {
      this.pad(root * Math.pow(2, semi / 12) * 2, t + Math.random() * 0.4, 7 + Math.random() * 2);
    }
    // A few bell notes.
    const bells = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < bells; i++) {
      const semi = SCALE[Math.floor(Math.random() * SCALE.length)];
      this.bell(root * Math.pow(2, semi / 12) * 8, t + 0.6 + Math.random() * 5);
    }
  }

  private pad(freq: number, when: number, duration: number): void {
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.004; // slow beating keeps it alive
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, when);
    filter.frequency.linearRampToValueAtTime(1100, when + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(500, when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.16, when + duration * 0.35);
    gain.gain.linearRampToValueAtTime(0, when + duration);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    osc1.start(when);
    osc2.start(when);
    osc1.stop(when + duration + 0.1);
    osc2.stop(when + duration + 0.1);
  }

  private bell(freq: number, when: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.1, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, when + 3.2);
    osc.connect(gain);
    gain.connect(this.out);
    osc.start(when);
    osc.stop(when + 3.3);
  }
}

/** Simple exponentially decaying noise impulse — a cheap, soft reverb tail. */
function createImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}
