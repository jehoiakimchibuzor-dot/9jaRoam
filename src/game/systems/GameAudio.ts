type AudioContextCtor = typeof AudioContext;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenOn = false;
  private noise: AudioBuffer | null = null;

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!ctor) return;
    try {
      this.ctx = new ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      this.noise = this.buildNoise(this.ctx);
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    return buffer;
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'square',
    slideTo?: number
  ): void {
    this.ensure();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private burst(duration: number, volume: number, filterFrequency: number): void {
    this.ensure();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  get ready(): boolean {
    return Boolean(this.ctx);
  }

  shot(weapon: 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'melee'): void {
    if (weapon === 'melee') {
      this.burst(0.08, 0.06, 900);
      return;
    }
    if (weapon === 'shotgun') {
      this.burst(0.16, 0.28, 1600);
      this.tone(90, 0.14, 0.16, 'sawtooth', 45);
      return;
    }
    if (weapon === 'rifle') {
      this.burst(0.12, 0.22, 2200);
      this.tone(130, 0.1, 0.14, 'square', 55);
      return;
    }
    if (weapon === 'smg') {
      this.burst(0.06, 0.12, 2000);
      this.tone(180, 0.05, 0.09, 'square', 90);
      return;
    }
    this.burst(0.09, 0.16, 1800);
    this.tone(150, 0.07, 0.1, 'square', 70);
  }

  hit(): void {
    this.tone(220, 0.05, 0.06, 'triangle', 150);
  }

  hurt(): void {
    this.tone(110, 0.18, 0.1, 'sawtooth', 70);
  }

  ui(): void {
    this.tone(640, 0.05, 0.05, 'sine');
  }

  pickup(): void {
    this.tone(520, 0.07, 0.07, 'sine');
    this.tone(780, 0.09, 0.06, 'sine');
  }

  door(): void {
    this.tone(140, 0.12, 0.06, 'triangle', 90);
  }

  siren(on: boolean): void {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (on) {
      this.ensure();
      const ctx = this.ctx;
      const master = this.master;
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 640;
      lfo.frequency.value = 1.7;
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.4);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      lfo.start(now);
      this.sirenOsc = osc;
      this.sirenGain = gain;
    } else if (this.sirenOsc && this.sirenGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.sirenGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      this.sirenOsc.stop(now + 0.35);
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }
}
