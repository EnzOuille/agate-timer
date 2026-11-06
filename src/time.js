// Helpers de manipulation des durées, exprimées en minutes.
(function (root) {
  // "7h42", "- 0h04", "-1h07", "155h04", "07:42" -> minutes (signées)
  function parseDuration(text) {
    if (!text) return null;
    const m = String(text).replace(/\s+/g, '').match(/^(-)?(\d+)[h:](\d{1,2})$/);
    if (!m) return null;
    const v = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    return m[1] ? -v : v;
  }

  // "De 7h38 à 12h27" -> { start: 458, end: 747 } ; "De 7h38" -> { start: 458, end: null }
  function parseRange(text) {
    if (!text) return null;
    const m = text.match(/De\s+(\d{1,2})h(\d{2})(?:\s+à\s+(\d{1,2})h(\d{2}))?/i);
    if (!m) return null;
    return {
      start: +m[1] * 60 + +m[2],
      end: m[3] !== undefined ? +m[3] * 60 + +m[4] : null,
    };
  }

  function fmtClock(min) {
    const d = Math.floor(min / 1440);
    const r = ((Math.round(min) % 1440) + 1440) % 1440;
    const s = `${Math.floor(r / 60)}h${String(r % 60).padStart(2, '0')}`;
    return d > 0 ? `${s} (J+${d})` : s;
  }

  function fmtDuration(min, { sign = false } = {}) {
    const v = Math.round(min);
    const a = Math.abs(v);
    const s = `${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`;
    if (v < 0) return `-${s}`;
    return sign ? `+${s}` : s;
  }

  // "HH:MM" (input type=time) <-> minutes
  function toInputTime(min) {
    if (min == null) return '';
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  function fromInputTime(v) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v || '');
    return m ? +m[1] * 60 + +m[2] : null;
  }

  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // "3h 32m", "-1h 05m", "0h" (compteurs d'absences) -> minutes
  function parseHM(text) {
    const m = String(text || '').replace(/\s+/g, '').match(/^(-)?(\d+)h(?:(\d+)m?)?$/);
    if (!m) return null;
    const v = +m[2] * 60 + (m[3] ? +m[3] : 0);
    return m[1] ? -v : v;
  }

  // Dates manipulées sous forme de clés "YYYY-MM-DD" (heure locale)
  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(key, n) {
    const d = fromKey(key);
    d.setDate(d.getDate() + n);
    return todayKey(d);
  }
  // Dimanche de la semaine (lundi → dimanche) contenant la date
  function sundayOf(key) {
    const dow = fromKey(key).getDay();
    return addDays(key, dow === 0 ? 0 : 7 - dow);
  }

  root.AgateTime = {
    parseDuration, parseRange, parseHM, fmtClock, fmtDuration, toInputTime, fromInputTime, nowMinutes, todayKey,
    fromKey, addDays, sundayOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
