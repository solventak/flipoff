/**
 * Config client — connects to the server via WebSocket and exposes
 * the current config. Call onChange() to register a callback that
 * fires whenever config is updated from the server.
 */

const DEFAULT_CONFIG = {
  grid: { cols: 16, rows: 10 },
  timing: {
    scramble_duration: 800,
    flip_duration: 300,
    stagger_delay: 25,
    total_transition: 3800,
    message_interval: 4000,
  },
  colors: {
    scramble_colors: ['#00AAFF', '#00FFCC', '#AA00FF', '#FF2D00', '#FFCC00', '#FFFFFF'],
    accent_colors: ['#00FF7F', '#FF4D00', '#AA00FF', '#00AAFF', '#00FFCC'],
  },
  messages: [
    ['', 'GOD IS IN', 'THE DETAILS .', '- LUDWIG MIES', ''],
    ['', 'STAY HUNGRY', 'STAY FOOLISH', '- STEVE JOBS', ''],
  ],
};

class ConfigClient {
  constructor() {
    this._config = structuredClone(DEFAULT_CONFIG);
    this._listeners = [];
    this._tempListeners = [];
    this._tempClearListeners = [];
    this._ws = null;
    this._reconnectDelay = 1000;
    this._connect();
  }

  get() {
    return this._config;
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  onTempMessage(fn) {
    this._tempListeners.push(fn);
  }

  onTempClear(fn) {
    this._tempClearListeners.push(fn);
  }

  _notify() {
    for (const fn of this._listeners) fn(this._config);
  }

  _notifyTemp(message) {
    for (const fn of this._tempListeners) fn(message);
  }

  _notifyTempClear() {
    for (const fn of this._tempClearListeners) fn();
  }

  _connect() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    this._ws = new WebSocket(`${protocol}://${location.host}/ws`);

    this._ws.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'config') {
          this._config = msg.data;
          this._reconnectDelay = 1000;
          this._notify();
        } else if (msg.type === 'temp_start') {
          this._notifyTemp(msg.data.message);
        } else if (msg.type === 'temp_clear') {
          this._notifyTempClear();
        }
      } catch {}
    });

    this._ws.addEventListener('close', () => {
      // Reconnect with exponential backoff, max 30s
      setTimeout(() => {
        this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 30000);
        this._connect();
      }, this._reconnectDelay);
    });
  }
}

export const configClient = new ConfigClient();
