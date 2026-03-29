import { FLAP_AUDIO_BASE64 } from './flapAudio.js';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._initialized = false;
    this._audioBuffer = null;
    this._voices = new Set(); // active playback pool (max 4)
  }

  async init() {
    if (this._initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._initialized = true;

    // Decode the embedded audio clip
    try {
      const binaryStr = atob(FLAP_AUDIO_BASE64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      this._audioBuffer = await this.ctx.decodeAudioData(bytes.buffer);
    } catch (e) {
      console.warn('Failed to decode flap audio:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * Play the full clip as a click. At most MAX_VOICES play simultaneously —
   * if the pool is full, the click is skipped (no cutoff, no overlap pile-up).
   */
  playClick() {
    if (!this.ctx || !this._audioBuffer || this.muted) return;
    this.resume();

    const MAX_VOICES = 4;

    // Pool full — skip rather than cut anything off
    if (this._voices.size >= MAX_VOICES) return;

    const t      = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this._audioBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);

    source.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(0);

    this._voices.add(source);
    source.onended = () => this._voices.delete(source);
  }

  /** Fade out and stop all active voices — call when animation finishes */
  stopAll() {
    for (const source of this._voices) {
      try {
        source.stop(this.ctx.currentTime + 0.1); // 100ms fade-to-stop
      } catch (e) {}
    }
    // _voices cleans itself via onended callbacks
  }

  // Keep for API compat
  playTransition() {
    this.playClick();
  }

  /** Get the duration of the transition audio clip in ms */
  getTransitionDuration() {
    if (this._audioBuffer) {
      return this._audioBuffer.duration * 1000;
    }
    return 3800; // fallback
  }

  // Keep this for API compatibility but it now plays the full transition
  scheduleFlaps() {
    this.playTransition();
  }
}
