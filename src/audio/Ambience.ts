import { clamp } from '../utils/math';

/**
 * The world's own sound, synthesized entirely in Web Audio: a soft engine hum, wind that rises
 * with speed, tyre rumble on the verge, and occasional birdsong. No audio files required.
 */
export class Ambience {
  private readonly master: GainNode;
  private readonly engineGain: GainNode;
  private readonly engineOsc: OscillatorNode;
  private readonly engineSub: OscillatorNode;
  private readonly engineFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly rumbleGain: GainNode;
  private readonly noise: AudioBufferSourceNode;
  private readonly rumbleNoise: AudioBufferSourceNode;
  private birdTimer = 6;
  private started = false;

  constructor(private readonly ctx: AudioContext, volume: number) {
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(ctx.destination);

    // --- engine: two detuned saws through a gentle low-pass ---
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;
    this.engineFilter.Q.value = 0.9;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'triangle';
    this.engineSub.frequency.value = 30;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    // --- wind and tyre rumble: filtered noise ---
    const noiseBuffer = createNoise(ctx, 2);
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuffer;
    this.noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);

    this.rumbleNoise = ctx.createBufferSource();
    this.rumbleNoise.buffer = noiseBuffer;
    this.rumbleNoise.loop = true;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 180;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumbleNoise.connect(rumbleFilter);
    rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.master);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.engineOsc.start(t);
    this.engineSub.start(t);
    this.noise.start(t);
    this.rumbleNoise.start(t);
  }

  setVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }

  /** `speed` in m/s, `maxSpeed` for normalisation. */
  update(dt: number, speed: number, maxSpeed: number, throttle: number, onVerge: boolean, birdsLikely: number): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const norm = clamp(speed / maxSpeed, 0, 1);

    const rpm = 55 + norm * 150 + throttle * 22;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.18);
    this.engineSub.frequency.setTargetAtTime(rpm * 0.5, t, 0.18);
    this.engineFilter.frequency.setTargetAtTime(240 + norm * 520 + throttle * 180, t, 0.2);
    this.engineGain.gain.setTargetAtTime(0.04 + norm * 0.075 + throttle * 0.02, t, 0.25);

    this.windFilter.frequency.setTargetAtTime(420 + norm * 900, t, 0.3);
    this.windGain.gain.setTargetAtTime(norm * norm * 0.11, t, 0.3);
    this.rumbleGain.gain.setTargetAtTime(onVerge ? 0.09 + norm * 0.1 : 0, t, 0.08);

    this.birdTimer -= dt * (0.4 + birdsLikely);
    if (this.birdTimer <= 0) {
      this.birdTimer = 5 + Math.random() * 14;
      if (Math.random() < birdsLikely) this.chirp();
    }
  }

  /** A short warbling whistle — one bird, somewhere off in the trees. */
  private chirp(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.3;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2100 + Math.random() * 1400;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.master);
    for (let i = 0; i < notes; i++) {
      const start = t + i * (0.08 + Math.random() * 0.07);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = base * (0.9 + Math.random() * 0.3);
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(f0 * (1.1 + Math.random() * 0.35), start + 0.05);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.92, start + 0.1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0005, start + 0.11);
      osc.connect(gain);
      gain.connect(pan);
      osc.start(start);
      osc.stop(start + 0.13);
    }
  }

  dispose(): void {
    try {
      this.engineOsc.stop();
      this.engineSub.stop();
      this.noise.stop();
      this.rumbleNoise.stop();
    } catch {
      /* already stopped */
    }
  }
}

function createNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    // Slightly brown-tinted noise is softer than pure white.
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}
