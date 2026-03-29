import { MESSAGES, MESSAGE_INTERVAL, TOTAL_TRANSITION } from './constants.js';

export class MessageRotator {
  constructor(board) {
    this.board = board;
    this.messages = MESSAGES;
    this.currentIndex = -1;
    this._timer = null;
    this._paused = false;
    this._messageInterval = MESSAGE_INTERVAL;
    this._totalTransition = TOTAL_TRANSITION;
  }

  applyConfig(cfg) {
    this._messageInterval = cfg.timing.message_interval;
    this._totalTransition = cfg.timing.total_transition;
    this.messages = cfg.messages;
    // Clamp index in case message count shrank
    if (this.currentIndex >= this.messages.length) {
      this.currentIndex = 0;
    }
    // Restart timer with new interval
    if (this._timer) {
      this.stop();
      this.start();
    }
  }

  start() {
    // Show first message immediately
    this.next();

    // Begin auto-rotation
    this._timer = setInterval(() => {
      if (!this._paused && !this.board.isTransitioning) {
        this.next();
      }
    }, this._messageInterval + this._totalTransition);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
    this._resetAutoRotation();
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.messages.length;
    this.board.displayMessage(this.messages[this.currentIndex]);
    this._resetAutoRotation();
  }

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.messages.length) % this.messages.length;
    this.board.displayMessage(this.messages[this.currentIndex]);
    this._resetAutoRotation();
  }

  _resetAutoRotation() {
    // Reset timer when user manually navigates
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        if (!this._paused && !this.board.isTransitioning) {
          this.next();
        }
      }, this._messageInterval + this._totalTransition);
    }
  }
}
