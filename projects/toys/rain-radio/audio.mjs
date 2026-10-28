import { clamp, MAX_VOLUME, makeNoise } from './model.mjs';

function defaultContextFactory() {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw new Error('这个浏览器暂时不能播放合成环境声。广播文字仍然可以阅读。');
  return new Audio();
}

// Constructing this object is silent. Only start(), called by a Play gesture,
// may create/resume an AudioContext. There are no samples or network requests.
export class RadioAudio {
  constructor(contextFactory = defaultContextFactory) {
    this.contextFactory = contextFactory;
    this.context = null;
    this.graph = null;
    this.noiseBuffer = null;
    this.playing = false;
    this.operation = 0;
    this.volume = .3;
  }
  async start(station, volume) {
    const op = ++this.operation;
    this.volume = clamp(Number(volume) || 0, 0, MAX_VOLUME);
    if (!this.context || this.context.state === 'closed') {
      this.context = this.contextFactory();
      this.noiseBuffer = null;
    }
    const ctx = this.context;
    try {
      await ctx.resume();
      if (op !== this.operation) return false;
      if (ctx.state !== 'running') throw new Error('声音还没有准备好，请再按一次播放。');
      this.disposeGraph();
      this.graph = this.createGraph(station);
      this.playing = true;
      this.setVolume(this.volume);
      return true;
    } catch (error) {
      if (op === this.operation) { this.playing = false; this.disposeGraph(); }
      if (op === this.operation) { try { await ctx.suspend(); } catch {} }
      throw error;
    }
  }
  createGraph(station) {
    const ctx = this.context, sources = [], nodes = [];
    try {
    const gain = () => { const n = ctx.createGain(); nodes.push(n); return n; };
    const master = gain(); master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor(); nodes.push(compressor);
    compressor.threshold.value = -22; compressor.knee.value = 24;
    compressor.ratio.value = 5; compressor.attack.value = .006; compressor.release.value = .3;
    master.connect(compressor); compressor.connect(ctx.destination);
    const filter = ctx.createBiquadFilter(); nodes.push(filter); filter.type = 'lowpass'; filter.frequency.value = station.sound.cutoff;
    const noiseGain = gain(); noiseGain.gain.value = station.sound.noise;
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 5), ctx.sampleRate);
      this.noiseBuffer.copyToChannel(makeNoise(this.noiseBuffer.length), 0);
    }
    const noise = ctx.createBufferSource(); sources.push(noise); noise.buffer = this.noiseBuffer; noise.loop = true;
    noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(master);
    const wave = ctx.createOscillator(); sources.push(wave); wave.type = 'sine'; wave.frequency.value = station.sound.swell;
    const waveGain = gain(); waveGain.gain.value = station.sound.noise * .32;
    wave.connect(waveGain); waveGain.connect(noiseGain.gain);
    station.sound.chord.forEach((frequency, index) => {
      const tone = ctx.createOscillator(); sources.push(tone); tone.type = 'sine'; tone.frequency.value = frequency;
      tone.detune.value = (index % 2 ? -1 : 1) * station.sound.detune;
      const toneGain = gain(); toneGain.gain.value = .023 / (1 + index * .25);
      tone.connect(toneGain); toneGain.connect(master);
    });
    sources.forEach(s => s.start());
    return { sources, nodes, master };
    } catch (error) {
      sources.forEach(s => { try { s.stop(); } catch {} try { s.disconnect(); } catch {} });
      nodes.forEach(n => { try { n.disconnect(); } catch {} });
      throw error;
    }
  }
  setVolume(value) {
    this.volume = clamp(Number(value) || 0, 0, MAX_VOLUME);
    if (this.graph && this.context) {
      const now = this.context.currentTime;
      this.graph.master.gain.cancelScheduledValues(now);
      this.graph.master.gain.setTargetAtTime(this.volume * .45, now, .12);
    }
  }
  async pause() {
    ++this.operation;
    this.playing = false;
    this.disposeGraph();
    if (this.context && this.context.state !== 'closed') {
      try { await this.context.suspend(); } catch {}
    }
  }
  disposeGraph() {
    if (!this.graph) return;
    this.graph.sources.forEach(s => { try { s.stop(); } catch {} try { s.disconnect(); } catch {} });
    this.graph.nodes.forEach(n => { try { n.disconnect(); } catch {} });
    this.graph = null;
  }
  async destroy() {
    await this.pause();
    if (this.context && this.context.state !== 'closed') { try { await this.context.close(); } catch {} }
    this.context = null; this.noiseBuffer = null;
  }
}
