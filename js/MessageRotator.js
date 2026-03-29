import { MESSAGES, MESSAGE_INTERVAL } from './constants.js';

function resolveRange(value) {
  if (value !== null && typeof value === 'object' && 'min' in value && 'max' in value) {
    return value.min + Math.random() * (value.max - value.min);
  }
  return value;
}

export class MessageRotator {
  constructor(board) {
    this.board            = board;
    this.messages         = MESSAGES;
    this.currentIndex     = -1;
    this._timer           = null;
    this._paused          = false;
    this._messageInterval = MESSAGE_INTERVAL;
    this._scrambleRounds  = 10; // number or { min, max }
    this._lastDuration    = 0;  // actual transition duration from last displayMessage call
  }

  applyConfig(cfg) {
    this._messageInterval = cfg.timing.message_interval;
    this._scrambleRounds  = cfg.timing.scramble_rounds ?? 10;
    this.messages         = cfg.messages;

    if (this.currentIndex >= this.messages.length) this.currentIndex = 0;
    if (this._timer) { this.stop(); this.start(); }
  }

  start() {
    if (!this.messages.length) return;
    if (this.currentIndex < 0 || this.currentIndex >= this.messages.length) {
      this.currentIndex = 0;
    }
    this._lastDuration = this._showCurrent(false);
    this._scheduleNext(this._lastDuration);
  }

  stop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  pause() {
    this._paused = true;
    this.stop();
  }

  resume() {
    this._paused = false;
    this._scheduleNext(this._lastDuration);
  }

  next(force = false) {
    if (!this.messages.length) return;
    this.currentIndex  = (this.currentIndex + 1) % this.messages.length;
    this._lastDuration = this._showCurrent(force);
    if (force) { this.stop(); this._scheduleNext(this._lastDuration); }
  }

  prev() {
    if (!this.messages.length) return;
    this.currentIndex  = (this.currentIndex - 1 + this.messages.length) % this.messages.length;
    this._lastDuration = this._showCurrent(true);
    this.stop();
    this._scheduleNext(this._lastDuration);
  }

  /** Show current message. Returns computed transition duration (ms). */
  _showCurrent(force = false) {
    return this.board.displayMessage(
      this.messages[this.currentIndex],
      this._scrambleRounds,
      force
    );
  }

  _scheduleNext(transitionDuration = 0) {
    if (this._paused) return;
    const interval = resolveRange(this._messageInterval);
    const delay    = transitionDuration + interval;

    this._timer = setTimeout(() => {
      if (!this._paused) {
        this.currentIndex  = (this.currentIndex + 1) % this.messages.length;
        this._lastDuration = this._showCurrent(false);
      }
      this._scheduleNext(this._lastDuration);
    }, delay);
  }
}
