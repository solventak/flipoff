/**
 * StatusBar — drives the persistent bottom row with time, date, and temperature.
 * Updates clock every second, weather every 10 minutes.
 */
export class StatusBar {
  constructor(board) {
    this.board     = board;
    this._temp     = null;   // e.g. "72°F"
    this._timer    = null;
    this._weatherTimer = null;
  }

  start() {
    this._tick();
    this._fetchWeather();
    this._timer        = setInterval(() => this._tick(), 1000);
    this._weatherTimer = setInterval(() => this._fetchWeather(), 10 * 60 * 1000);
  }

  stop() {
    clearInterval(this._timer);
    clearInterval(this._weatherTimer);
  }

  _tick() {
    const now  = new Date();
    const text = this._format(now, this.board.cols);
    this.board.setStatusRow(text);
  }

  _format(now, cols) {
    const days  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    const day  = days[now.getDay()];
    const date = String(now.getDate()).padStart(2, '0');
    const mon  = months[now.getMonth()];

    let h = now.getHours();
    const m   = String(now.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const time = `${h}:${m} ${ampm}`;

    const temp = this._temp || '';

    // Build parts, fitting to available cols
    // Full:  "10:41 AM  MON 29 MAR  72°F"
    // Short: "10:41 29MAR 72F"
    const full  = [time, `${day} ${date} ${mon}`, temp].filter(Boolean).join('  ');
    const short = [time, `${date}${mon}`, temp.replace('°','')].filter(Boolean).join(' ');

    const str = full.length <= cols ? full : short.slice(0, cols);

    // Center-pad to cols
    const pad = Math.max(0, Math.floor((cols - str.length) / 2));
    return (' '.repeat(pad) + str).padEnd(cols, ' ');
  }

  async _fetchWeather() {
    try {
      // wttr.in returns plain text like "+72°F" — no API key, CORS-friendly
      const res  = await fetch('https://wttr.in/?format=%t', { signal: AbortSignal.timeout(5000) });
      const text = (await res.text()).trim().replace(/^\+/, '');
      this._temp = text;
      this._tick();
    } catch (e) {
      // Network unavailable or Pi offline — just leave temp as-is
    }
  }
}
