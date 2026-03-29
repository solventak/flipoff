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
    console.log('[StatusBar] tick', JSON.stringify(text), 'cols:', this.board.cols, 'rows:', this.board.rows);
    this.board.setStatusRow(text);
  }

  _format(now, cols) {
    const days  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    const day  = days[now.getDay()];
    const date = String(now.getDate()).padStart(2, '0');
    const mon  = months[now.getMonth()];

    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const time = `${h}:${m}`;

    const temp = this._temp || '';
    const fullLeft = `${time}  ${day} ${date} ${mon}`;
    const shortLeft = `${time} ${date}${mon}`;

    return this._composeRow(fullLeft, shortLeft, temp, cols);
  }

  _composeRow(fullLeft, shortLeft, temp, cols) {
    if (!temp) {
      const left = fullLeft.length <= cols ? fullLeft : shortLeft.slice(0, cols);
      return left.padEnd(cols, ' ');
    }

    if (fullLeft.length + 1 + temp.length <= cols) {
      return fullLeft + ' '.repeat(cols - fullLeft.length - temp.length) + temp;
    }

    if (shortLeft.length + 1 + temp.length <= cols) {
      return shortLeft + ' '.repeat(cols - shortLeft.length - temp.length) + temp;
    }

    return temp.length <= cols
      ? temp.padStart(cols, ' ')
      : temp.slice(-cols);
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
