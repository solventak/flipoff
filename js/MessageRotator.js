import { MESSAGES, MESSAGE_INTERVAL, TOTAL_TRANSITION } from './constants.js';

function resolveRange(value) {
  if (value !== null && typeof value === 'object' && 'min' in value && 'max' in value) {
    return value.min + Math.random() * (value.max - value.min);
  }
  return value;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export class MessageRotator {
  constructor(board) {
    this.board = board;
    this.messages = MESSAGES;
    this.currentIndex = -1;
    this._timer = null;
    this._paused = false;

    // These can be numbers or { min, max } objects
    this._messageInterval = MESSAGE_INTERVAL;
    this._totalTransition = TOTAL_TRANSITION;
    this._scrambleRounds = 10;
  }

  applyConfig(cfg) {
    this._messageInterval = cfg.timing.message_interval;
    this._totalTransition = cfg.timing.total_transition;
    this._scrambleRounds = cfg.timing.scramble_rounds ?? 10;
    this.messages = cfg.messages;

    if (this.currentIndex >= this.messages.length) {
      this.currentIndex = 0;
    }

    // Restart if already running
    if (this._timer) {
      this.stop();
      this.start();
    }
  }

  start() {
    this.next();
    this._scheduleNext();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  pause() {
    this._paused = true;
    this.stop();
  }

  resume() {
    this._paused = false;
    this._scheduleNext();
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.messages.length;
    this._showCurrent();
  }

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.messages.length) % this.messages.length;
    this._showCurrent();
    // Reset auto-advance timer
    this.stop();
    this._scheduleNext();
  }

  _showCurrent() {
    const rounds = Math.round(clamp(resolveRange(this._scrambleRounds), 1, 50));
    const totalTransition = resolveRange(this._totalTransition);
    this.board.displayMessage(this.messages[this.currentIndex], rounds, totalTransition);
  }

  _scheduleNext() {
    if (this._paused) return;

    const interval = resolveRange(this._messageInterval);
    const totalTransition = resolveRange(this._totalTransition);
    const delay = interval + totalTransition;

    this._timer = setTimeout(() => {
      if (!this._paused && !this.board.isTransitioning) {
        this.next();
      }
      this._scheduleNext();
    }, delay);
  }
}
