import { Tile } from './Tile.js';
import {
  GRID_COLS, GRID_ROWS, STAGGER_DELAY, SCRAMBLE_DURATION,
  TOTAL_TRANSITION, ACCENT_COLORS
} from './constants.js';

// Mutable runtime config — overridden by server config via applyConfig()
let _staggerDelay = STAGGER_DELAY;
let _totalTransition = TOTAL_TRANSITION;
let _accentColors = ACCENT_COLORS;

export class Board {
  constructor(containerEl, soundEngine) {
    this.cols = GRID_COLS;
    this.rows = GRID_ROWS;
    this.soundEngine = soundEngine;
    this.isTransitioning = false;
    this.tiles = [];
    this.currentGrid = [];
    this.accentIndex = 0;

    // Build board DOM
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'board';
    this.boardEl.style.setProperty('--grid-cols', this.cols);
    this.boardEl.style.setProperty('--grid-rows', this.rows);

    // Left accent squares (2 small stacked blocks)
    this.leftBar = this._createAccentBar('accent-bar-left');
    this.boardEl.appendChild(this.leftBar);

    // Tile grid
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'tile-grid';

    for (let r = 0; r < this.rows; r++) {
      const row = [];
      const charRow = [];
      for (let c = 0; c < this.cols; c++) {
        const tile = new Tile(r, c);
        tile.setChar(' ');
        this.gridEl.appendChild(tile.el);
        row.push(tile);
        charRow.push(' ');
      }
      this.tiles.push(row);
      this.currentGrid.push(charRow);
    }

    this.boardEl.appendChild(this.gridEl);

    // Right accent squares
    this.rightBar = this._createAccentBar('accent-bar-right');
    this.boardEl.appendChild(this.rightBar);

    // Keyboard hint icon (bottom-left)
    const hint = document.createElement('div');
    hint.className = 'keyboard-hint';
    hint.textContent = 'N';
    hint.title = 'Keyboard shortcuts';
    hint.addEventListener('click', (e) => {
      e.stopPropagation();
      const overlay = this.boardEl.querySelector('.shortcuts-overlay');
      if (overlay) overlay.classList.toggle('visible');
    });
    this.boardEl.appendChild(hint);

    // Shortcuts overlay
    const overlay = document.createElement('div');
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div><span>Next message</span><kbd>Enter</kbd></div>
      <div><span>Previous</span><kbd>\u2190</kbd></div>
      <div><span>Fullscreen</span><kbd>F</kbd></div>
      <div><span>Mute</span><kbd>M</kbd></div>
    `;
    this.boardEl.appendChild(overlay);

    containerEl.appendChild(this.boardEl);
    this._updateAccentColors();
    this._updateTileSize();

    // Recompute tile size whenever the container or window resizes
    this._resizeObserver = new ResizeObserver(() => this._updateTileSize());
    this._resizeObserver.observe(this.boardEl);
  }

  _updateTileSize() {
    const gap = parseInt(getComputedStyle(this.boardEl).getPropertyValue('--tile-gap')) || 4;
    const paddingH = 96; // 48px left + 48px right padding
    const paddingV = 68; // 28px top + 40px bottom padding

    const availW = this.boardEl.clientWidth - paddingH;
    const availH = this.boardEl.clientHeight - paddingV;

    const tileW = Math.floor((availW - (this.cols - 1) * gap) / this.cols);
    const tileH = Math.floor((availH - (this.rows - 1) * gap) / this.rows);

    const tileSize = Math.max(24, Math.min(tileW, tileH));
    this.boardEl.style.setProperty('--tile-size', `${tileSize}px`);
  }

  _createAccentBar(extraClass) {
    const bar = document.createElement('div');
    bar.className = `accent-bar ${extraClass}`;
    // Just 2 small stacked squares like the original
    for (let i = 0; i < 2; i++) {
      const seg = document.createElement('div');
      seg.className = 'accent-segment';
      bar.appendChild(seg);
    }
    return bar;
  }

  applyConfig(cfg) {
    const { grid, timing, colors } = cfg;
    _staggerDelay = timing.stagger_delay;
    _totalTransition = timing.total_transition;
    _accentColors = colors.accent_colors;

    // Rebuild grid if dimensions changed
    if (grid.cols !== this.cols || grid.rows !== this.rows) {
      this.cols = grid.cols;
      this.rows = grid.rows;
      this.boardEl.style.setProperty('--grid-cols', this.cols);
      this.boardEl.style.setProperty('--grid-rows', this.rows);
      this._rebuildGrid();
    }

    this._updateAccentColors();
    this._updateTileSize();
  }

  _rebuildGrid() {
    this.gridEl.innerHTML = '';
    this.tiles = [];
    this.currentGrid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      const charRow = [];
      for (let c = 0; c < this.cols; c++) {
        const tile = new Tile(r, c);
        tile.setChar(' ');
        this.gridEl.appendChild(tile.el);
        row.push(tile);
        charRow.push(' ');
      }
      this.tiles.push(row);
      this.currentGrid.push(charRow);
    }
  }

  _updateAccentColors() {
    const color = _accentColors[this.accentIndex % _accentColors.length];
    const segments = this.boardEl.querySelectorAll('.accent-segment');
    segments.forEach(seg => {
      seg.style.backgroundColor = color;
    });
  }

  displayMessage(lines) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Format lines into grid
    const newGrid = this._formatToGrid(lines);

    // Determine which tiles need to change
    let hasChanges = false;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const newChar = newGrid[r][c];
        const oldChar = this.currentGrid[r][c];

        if (newChar !== oldChar) {
          const delay = (r * this.cols + c) * _staggerDelay;
          this.tiles[r][c].scrambleTo(newChar, delay);
          hasChanges = true;
        }
      }
    }

    // Play the single transition audio clip once
    if (hasChanges && this.soundEngine) {
      this.soundEngine.playTransition();
    }

    // Update accent bar colors
    this.accentIndex++;
    this._updateAccentColors();

    // Update grid state
    this.currentGrid = newGrid;

    // Clear transitioning flag after animation completes
    setTimeout(() => {
      this.isTransitioning = false;
    }, _totalTransition + 200);
  }

  _formatToGrid(lines) {
    const grid = [];
    for (let r = 0; r < this.rows; r++) {
      const line = (lines[r] || '').toUpperCase();
      const padTotal = this.cols - line.length;
      const padLeft = Math.max(0, Math.floor(padTotal / 2));
      const padded = ' '.repeat(padLeft) + line + ' '.repeat(Math.max(0, this.cols - padLeft - line.length));
      grid.push(padded.split(''));
    }
    return grid;
  }
}
