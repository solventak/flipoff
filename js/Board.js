import {
  GRID_COLS, GRID_ROWS, STAGGER_DELAY, TOTAL_TRANSITION, ACCENT_COLORS
} from './constants.js';

const CHARSET         = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-!?\'/: ';
const DEFAULT_SCRAMBLE_COLORS = ['#00AAFF', '#00FFCC', '#AA00FF', '#FF2D00', '#FFCC00', '#FFFFFF'];
const TILE_BG         = '#222';
const BOARD_BG        = '#1A1A1A';
const TILE_GAP        = 4;
const ACCENT_W        = 14;
const ACCENT_H        = 14;
const ACCENT_GAP      = 3;
const SCRAMBLE_MS     = 70; // ms per scramble frame
const PAD_LEFT        = 48;
const PAD_RIGHT       = 48;
const PAD_TOP         = 28;
const PAD_BOTTOM      = 40;

export class Board {
  constructor(containerEl, soundEngine) {
    this.cols             = GRID_COLS;
    this.rows             = GRID_ROWS;
    this.soundEngine      = soundEngine;
    this.isTransitioning  = false;
    this.accentIndex      = 0;

    // Runtime config (overridden by applyConfig)
    this._staggerDelay    = STAGGER_DELAY;
    this._totalTransition = TOTAL_TRANSITION;
    this._accentColors    = [...ACCENT_COLORS];
    this._scrambleColors  = [...DEFAULT_SCRAMBLE_COLORS];

    // Board wrapper div (keeps keyboard hint + overlay as DOM)
    this._boardEl = document.createElement('div');
    this._boardEl.className = 'board';

    // Canvas — fills the board div
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    this._ctx = this._canvas.getContext('2d');
    this._dpr = window.devicePixelRatio || 1;
    this._boardEl.appendChild(this._canvas);

    // Keyboard hint
    const hint = document.createElement('div');
    hint.className = 'keyboard-hint';
    hint.textContent = 'N';
    hint.title = 'Keyboard shortcuts';
    hint.addEventListener('click', (e) => {
      e.stopPropagation();
      this._boardEl.querySelector('.shortcuts-overlay')?.classList.toggle('visible');
    });
    this._boardEl.appendChild(hint);

    // Shortcuts overlay
    const overlay = document.createElement('div');
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div><span>Next message</span><kbd>Enter</kbd></div>
      <div><span>Previous</span><kbd>\u2190</kbd></div>
      <div><span>Fullscreen</span><kbd>F</kbd></div>
      <div><span>Mute</span><kbd>M</kbd></div>
    `;
    this._boardEl.appendChild(overlay);

    containerEl.appendChild(this._boardEl);

    // Cell state
    this._cells      = this._createCells();
    this._currentGrid = this._emptyGrid();

    // Layout cache
    this._tileSize = 32;
    this._gridOffsetX = 0;
    this._gridOffsetY = 0;
    this._canvasW = 0;
    this._canvasH = 0;

    // RAF state
    this._animating   = false;
    this._dirty       = true;
    this._lastRafTime = 0;
    this._rafInterval = 1000 / 30; // cap at 30fps to spare CPU on Pi

    // Resize observer
    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this._boardEl);
    this._onResize();

    // Start render loop
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // -------------------------------------------------------------------------
  // Cell helpers
  // -------------------------------------------------------------------------

  _createCells() {
    return Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c) => ({
        r, c,
        char:           ' ',
        targetChar:     null,
        displayChar:    ' ',
        bgColor:        null,
        maxFrames:      0,
        startTime:      0,
        lastFrame:      -1,
        animating:      false,
      }))
    );
  }

  _emptyGrid() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(' '));
  }

  // -------------------------------------------------------------------------
  // Resize
  // -------------------------------------------------------------------------

  _onResize() {
    const w = this._boardEl.clientWidth;
    const h = this._boardEl.clientHeight;
    if (!w || !h) return;

    const dpr = this._dpr;
    this._canvas.width  = Math.round(w * dpr);
    this._canvas.height = Math.round(h * dpr);
    this._canvasW = w;
    this._canvasH = h;

    const availW = w - PAD_LEFT - PAD_RIGHT;
    const availH = h - PAD_TOP  - PAD_BOTTOM;

    const tileW = Math.floor((availW - (this.cols - 1) * TILE_GAP) / this.cols);
    const tileH = Math.floor((availH - (this.rows  - 1) * TILE_GAP) / this.rows);
    this._tileSize = Math.max(16, Math.min(tileW, tileH));

    const gridW = this.cols * this._tileSize + (this.cols - 1) * TILE_GAP;
    const gridH = this.rows * this._tileSize + (this.rows  - 1) * TILE_GAP;
    this._gridOffsetX = PAD_LEFT  + Math.floor((availW - gridW) / 2);
    this._gridOffsetY = PAD_TOP   + Math.floor((availH - gridH) / 2);

    this._dirty = true;
  }

  // -------------------------------------------------------------------------
  // RAF loop
  // -------------------------------------------------------------------------

  _loop(now) {
    requestAnimationFrame(this._loop);

    if (!this._animating && !this._dirty) return;

    // Throttle to ~30fps
    if (now - this._lastRafTime < this._rafInterval) return;
    this._lastRafTime = now;

    let stillAnimating = false;
    let frameDirty = this._dirty;

    if (this._animating) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this._cells[r][c];
          if (!cell.animating) continue;

          if (now < cell.startTime) {
            stillAnimating = true;
            continue;
          }

          const frameIndex = Math.floor((now - cell.startTime) / SCRAMBLE_MS);

          if (frameIndex < cell.maxFrames) {
            // Only update if we've moved to a new scramble frame
            if (frameIndex !== cell.lastFrame) {
              cell.lastFrame   = frameIndex;
              cell.displayChar = CHARSET[Math.floor(Math.random() * CHARSET.length)];
              cell.bgColor     = this._scrambleColors[frameIndex % this._scrambleColors.length];
              frameDirty = true;
              if (this.soundEngine) this.soundEngine.playClick();
            }
            stillAnimating = true;
          } else {
            // Settle
            cell.char        = cell.targetChar;
            cell.displayChar = cell.targetChar;
            cell.bgColor     = null;
            cell.animating   = false;
            cell.targetChar  = null;
            frameDirty = true;
          }
        }
      }
    }

    if (!stillAnimating) this._animating = false;

    if (frameDirty) {
      this._draw();
      this._dirty = false;
    }
  }

  // -------------------------------------------------------------------------
  // Draw
  // -------------------------------------------------------------------------

  _draw() {
    const ctx  = this._ctx;
    const dpr  = this._dpr;
    const w    = this._canvasW;
    const h    = this._canvasH;
    const ts   = this._tileSize;
    const ox   = this._gridOffsetX;
    const oy   = this._gridOffsetY;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Board background
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, w, h);

    // Accent bars
    const accentColor = this._accentColors[this.accentIndex % this._accentColors.length];
    ctx.fillStyle = accentColor;
    for (let i = 0; i < 2; i++) {
      this._rr(ctx, 18,         30 + i * (ACCENT_H + ACCENT_GAP), ACCENT_W, ACCENT_H, 2);
      this._rr(ctx, w - 18 - ACCENT_W, 30 + i * (ACCENT_H + ACCENT_GAP), ACCENT_W, ACCENT_H, 2);
    }

    // Bottom pill
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    this._rr(ctx, w / 2 - 20, h - 16, 40, 4, 2);

    // Tiles
    const fontSize = Math.max(8, Math.floor(ts * 0.52));
    ctx.font         = `700 ${fontSize}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this._cells[r][c];
        const x = ox + c * (ts + TILE_GAP);
        const y = oy + r * (ts + TILE_GAP);

        // Outer shadow strip
        ctx.fillStyle = '#111';
        this._rr(ctx, x, y, ts, ts, 3);

        // Tile face
        ctx.fillStyle = cell.bgColor || TILE_BG;
        this._rr(ctx, x + 1, y + 1, ts - 2, ts - 2, 2);

        // Split line
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 1, y + (ts >> 1), ts - 2, 1);

        // Character
        if (cell.displayChar && cell.displayChar !== ' ') {
          const light = cell.bgColor === '#FFFFFF' || cell.bgColor === '#FFCC00';
          ctx.fillStyle = light ? '#111' : '#FFFFFF';
          ctx.fillText(cell.displayChar, x + (ts >> 1), y + (ts >> 1) + 1);
        }
      }
    }

    ctx.restore();
  }

  /** Convenience: filled rounded rect (with fallback for older Chromium on Pi) */
  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      // Fallback: manual arc-based rounded rect
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y,     x + w, y + r,     r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x,     y + h, x,     y + h - r, r);
      ctx.lineTo(x,     y + r);
      ctx.arcTo(x,     y,     x + r, y,         r);
      ctx.closePath();
    }
    ctx.fill();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  applyConfig(cfg) {
    const { grid, timing, colors } = cfg;
    this._staggerDelay    = timing.stagger_delay;
    this._totalTransition = timing.total_transition;
    this._accentColors    = colors.accent_colors;
    this._scrambleColors  = colors.scramble_colors;

    if (grid.cols !== this.cols || grid.rows !== this.rows) {
      this.cols = grid.cols;
      this.rows = grid.rows;
      this._cells       = this._createCells();
      this._currentGrid = this._emptyGrid();
      this._onResize();
    }

    this._dirty = true;
  }

  displayMessage(lines, scrambleRounds = 10, totalTransition = null, force = false) {
    if (this.isTransitioning && !force) return;
    this.isTransitioning = true;
    this._animating      = true;

    // Resolve totalTransition (may be a range object — use whichever was resolved)
    const ttMs = totalTransition ?? (
      typeof this._totalTransition === 'object'
        ? this._totalTransition.max
        : this._totalTransition
    );

    const newGrid = this._formatToGrid(lines);
    const now     = performance.now();
    let hasChanges = false;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const newChar = newGrid[r][c];
        if (newChar === this._currentGrid[r][c]) continue;

        const cell       = this._cells[r][c];
        cell.targetChar  = newChar;
        cell.maxFrames   = Math.max(1, Math.min(50, Math.round(scrambleRounds)));
        cell.startTime   = now + (r * this.cols + c) * this._staggerDelay;
        cell.lastFrame   = -1;
        cell.animating   = true;
        hasChanges = true;
      }
    }

    // Sound is now driven per-frame in the RAF loop via playClick()

    this.accentIndex++;
    this._currentGrid = newGrid;

    setTimeout(() => {
      this.isTransitioning = false;
    }, ttMs + 200);
  }

  _formatToGrid(lines) {
    return Array.from({ length: this.rows }, (_, r) => {
      const line = (lines[r] || '').toUpperCase();
      const pad  = this.cols - line.length;
      const pl   = Math.max(0, Math.floor(pad / 2));
      return (' '.repeat(pl) + line).padEnd(this.cols, ' ').slice(0, this.cols).split('');
    });
  }
}
