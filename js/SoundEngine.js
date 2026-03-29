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
   * Play a single short click — a slice of the transition clip.
   * Throttled internally so at most one click fires per CLICK_INTERVAL_MS,
   * matching the scramble frame rate.
   */
  playClick() {
    if (!this.ctx || !this._audioBuffer || this.muted) return;
    this.resume();

    const CLICK_DURATION_SEC  = 0.15;  // how much of the clip to play
    const CLICK_FADE_SEC      = 0.05;  // quick fade-out at the end
    const CLICK_INTERVAL_MS   = 70;    // minimum ms between clicks

    const now = this.ctx.currentTime;

    // Throttle: skip if a click fired too recently
    if (this._lastClickTime && (now - this._lastClickTime) < (CLICK_INTERVAL_MS / 1000)) return;
    this._lastClickTime = now;

    const source = this.ctx.createBufferSource();
    source.buffer = this._audioBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.setValueAtTime(0.7, now + CLICK_DURATION_SEC - CLICK_FADE_SEC);
    gain.gain.linearRampToValueAtTime(0, now + CLICK_DURATION_SEC);

    source.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(0);
    source.stop(now + CLICK_DURATION_SEC + 0.01);
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
