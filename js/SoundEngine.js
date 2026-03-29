import { FLAP_AUDIO_BASE64 } from './flapAudio.js';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._initialized = false;
    this._audioBuffer = null;
    this._currentSource = null;
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
   * Play the transition sound, fading it out to match the transition duration.
   * @param {number} durationMs - how long the visual transition lasts (ms)
   */
  playTransition(durationMs = 3800) {
    if (!this.ctx || !this._audioBuffer || this.muted) return;
    this.resume();

    // Stop any currently playing transition sound immediately
    if (this._currentSource) {
      try {
        this._currentGain.gain.cancelScheduledValues(0);
        this._currentGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this._currentSource.stop();
      } catch (e) {}
      this._currentSource = null;
      this._currentGain = null;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this._audioBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, this.ctx.currentTime);

    // Fade out to 0 over the last 300ms of the transition
    const durationSec = durationMs / 1000;
    const fadeStart   = Math.max(0, durationSec - 0.3);
    gain.gain.setValueAtTime(0.8, this.ctx.currentTime + fadeStart);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + durationSec);

    source.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(0);
    // Schedule hard stop after fade completes (prevents clip playing past transition)
    source.stop(this.ctx.currentTime + durationSec + 0.05);

    this._currentSource = source;
    this._currentGain   = gain;

    source.onended = () => {
      if (this._currentSource === source) {
        this._currentSource = null;
        this._currentGain   = null;
      }
    };
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
