// Extraction des données de la feuille de temps oHRis.
(function (root) {
  const { parseDuration, parseRange } = root.AgateTime;

  const LUNCH = /pause du midi/i;
  const CLIPPING = /cr[eê]tage/i; // "Ecrêtage de la pause du midi" : conséquence de la pause, déjà modélisée
  const PUNCH = /^pointage$/i;

  function findUserId(doc) {
    const el = doc.querySelector('[data-time-sheet-user-id]');
    if (el) return el.getAttribute('data-time-sheet-user-id');
    for (const a of doc.querySelectorAll('a[href*="/time/sheet/"], a[href*="/time/punch/"]')) {
      const m = a.getAttribute('href').match(/\/time\/(?:sheet|punch)\/(\d+)\//);
      if (m) return m[1];
    }
    return null;
  }

  function findLocale(loc) {
    const m = loc.pathname.match(/^\/([a-z]{2})\//);
    return m ? m[1] : 'fr';
  }

  // Lit la ligne d'un jour : pointages, pause du midi, autres temps crédités (télétravail, absence, compensation…)
  function parseDay(doc, dateKey) {
    const row = doc.getElementById(`td-${dateKey}`);
    if (!row) return null;

    const theoEl = row.querySelector('.theoricalColumn');
    const day = {
      theoretical: theoEl ? parseDuration(theoEl.textContent) : null,
      notWorked: row.classList.contains('notworkedTr'),
      punches: [],
      lunch: null,
      credits: [],
    };

    for (const dd of row.querySelectorAll('.hourButtonDropdown')) {
      const btn = dd.querySelector('button.hourButton');
      if (!btn) continue;
      const label = (btn.getAttribute('title') || '').trim();
      const duration = parseDuration(btn.textContent);
      const detail = dd.querySelector('.dropdown-menu p');
      const range = parseRange(detail ? detail.textContent : '');
      const status = btn.getAttribute('data-time-status');

      if (CLIPPING.test(label)) continue;
      if (status === 'cancelled') continue;
      if (PUNCH.test(label) && range) {
        day.punches.push(range);
      } else if (LUNCH.test(label)) {
        day.lunch = range ? { ...range, duration } : { start: null, end: null, duration };
      } else if (duration != null) {
        day.credits.push({ label, duration });
      }
    }
    day.punches.sort((a, b) => a.start - b.start);
    return day;
  }

  // Modale "Contrôle des pointages" : on récupère toutes les heures présentes dans les cellules du tableau.
  // Structure HTML non documentée -> extraction volontairement tolérante.
  function parsePunchModal(doc) {
    const times = new Set();
    const cells = doc.querySelectorAll('td, li, .badge');
    const scope = cells.length ? cells : [doc.body];
    for (const el of scope) {
      if (el.children.length > 3) continue;
      for (const m of el.textContent.matchAll(/\b(\d{1,2})[h:](\d{2})\b/g)) {
        const h = +m[1];
        const mn = +m[2];
        if (h < 24 && mn < 60) times.add(h * 60 + mn);
      }
    }
    return [...times].sort((a, b) => a - b);
  }

  root.AgateParser = { findUserId, findLocale, parseDay, parsePunchModal };
})(typeof window !== 'undefined' ? window : globalThis);
