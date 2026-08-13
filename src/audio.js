export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = 'anonymous';
    this.context = null;
    this.source = null;
    this.analyser = null;
    this.frequencyData = null;
    this.waveformData = null;
    this.url = null;
    this.sensitivity = 1.35;
    this.bands = { bass: 0, mids: 0, treble: 0, level: 0, beat: 0 };
    this.prevBass = 0;
    this.beatEnvelope = 0;
  }

  async ensureContext() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.source = this.context.createMediaElementSource(this.audio);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.waveformData = new Uint8Array(this.analyser.fftSize);
      this.source.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async loadFile(file) {
    if (!file) return;
    await this.ensureContext();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(file);
    this.audio.src = this.url;
    this.audio.load();
    return new Promise((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Unable to load audio file.')); };
      const cleanup = () => {
        this.audio.removeEventListener('loadedmetadata', onReady);
        this.audio.removeEventListener('error', onError);
      };
      this.audio.addEventListener('loadedmetadata', onReady, { once: true });
      this.audio.addEventListener('error', onError, { once: true });
    });
  }

  async togglePlayback() {
    await this.ensureContext();
    if (this.audio.paused) await this.audio.play();
    else this.audio.pause();
  }

  setSmoothing(value) {
    if (this.analyser) this.analyser.smoothingTimeConstant = Number(value);
  }

  getBand(lowHz, highHz) {
    if (!this.analyser || !this.frequencyData) return 0;
    const nyquist = this.context.sampleRate / 2;
    const start = Math.max(0, Math.floor((lowHz / nyquist) * this.frequencyData.length));
    const end = Math.min(this.frequencyData.length - 1, Math.ceil((highHz / nyquist) * this.frequencyData.length));
    if (end <= start) return 0;
    let total = 0;
    for (let i = start; i <= end; i++) total += this.frequencyData[i];
    return (total / (end - start + 1)) / 255;
  }

  update(dt) {
    if (!this.analyser || !this.frequencyData) return this.bands;
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.waveformData);

    const bass = Math.min(1.5, this.getBand(25, 180) * this.sensitivity);
    const mids = Math.min(1.5, this.getBand(180, 2400) * this.sensitivity);
    const treble = Math.min(1.5, this.getBand(2400, 15000) * this.sensitivity);
    const level = Math.min(1.5, (bass * 0.48 + mids * 0.34 + treble * 0.18));

    const bassRise = bass - this.prevBass;
    const beatHit = bass > 0.42 && bassRise > 0.055 ? Math.min(1, bassRise * 8 + bass * 0.35) : 0;
    this.beatEnvelope = Math.max(beatHit, this.beatEnvelope * Math.pow(0.001, dt));
    this.prevBass = bass;

    this.bands = { bass, mids, treble, level, beat: this.beatEnvelope };
    return this.bands;
  }

  dispose() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio.pause();
    this.audio.src = '';
    if (this.context) this.context.close();
  }
}
