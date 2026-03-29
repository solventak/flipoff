import { FLAP_AUDIO_BASE64 } from './flapAudio.js';

const MAX_VOICES = 32;

export class SoundEngine {
  constructor() {
    this.ctx            = null;
    this.muted          = false;
    this._initialized   = false;
    this._audioBuffer   = null;
    this._voices        = new Set();
    this._activeSound   = 'default'; // 'default' = built-in base64
    this._loading       = false;
  }

  async init() {
    if (this._initialized) return;
    this.ctx          = new (window.AudioContext || window.webkitAudioContext)();
    this._initialized = true;
    await this._loadBuiltin();
  }

  async _loadBuiltin() {
    try {
      const binaryStr = atob(FLAP_AUDIO_BASE64);
      const bytes     = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      this._audioBuffer = await this.ctx.decodeAudioData(bytes.buffer);
    } catch (e) {
      console.warn('Failed to decode built-in flap audio:', e);
    }
  }

  async _loadFromUrl(url) {
    if (!this.ctx) return;
    this._loading = true;
    try {
      const res    = await fetch(url);
      const buf    = await res.arrayBuffer();
      this._audioBuffer = await this.ctx.decodeAudioData(buf);
    } catch (e) {
      console.warn('Failed to load sound from URL, falling back to built-in:', e);
      await this._loadBuiltin();
    } finally {
      this._loading = false;
    }
  }

  /**
   * Switch to a different sound. Called when the server broadcasts sound_changed.
   * @param {string} name - sound name, or 'default' for built-in
   */
  async setActiveSound(name) {
    this._activeSound = name;
    this.stopAll();
    if (!this._initialized) return; // will load on init()
    if (name === 'default') {
      await this._loadBuiltin();
    } else {
      await this._loadFromUrl(`/api/sounds/${encodeURIComponent(name)}/file`);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playClick() {
    if (!this.ctx || !this._audioBuffer || this.muted || this._loading) return;
    this.resume();
    if (this._voices.size >= MAX_VOICES) return;

    const t      = this.ctx.currentTime;
    const jitter = Math.random() * 0.04; // 0–40ms random offset
    const source = this.ctx.createBufferSource();
    source.buffer = this._audioBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t + jitter);
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(t + jitter);

    this._voices.add(source);
    source.onended = () => this._voices.delete(source);
  }

  stopAll() {
    for (const source of this._voices) {
      try { source.stop(this.ctx?.currentTime + 0.05); } catch (e) {}
    }
  }

  // Compat aliases
  playTransition() { this.playClick(); }
  scheduleFlaps()  { this.playClick(); }
  getTransitionDuration() {
    return this._audioBuffer ? this._audioBuffer.duration * 1000 : 3800;
  }
}
