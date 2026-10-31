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

  // Modale "Contrôle des pointages" (/time/punch/{id}/{date}) : un formulaire dont chaque ligne porte
  // l'heure dans <input type="time" name="punch_manage[punches][n][time]" value="07:06">.
  // Les badgeages cochés « Supprimer » sont ignorés.
  function parsePunchModal(doc) {
    const times = [];
    for (const input of doc.querySelectorAll('input[type="time"][name$="[time]"]')) {
      const row = input.closest('tr');
      const canceled = row && row.querySelector('input[type="checkbox"][name$="[canceled]"]');
      if (canceled && (canceled.checked || canceled.hasAttribute('checked'))) continue;
      const m = /^(\d{1,2}):(\d{2})/.exec(input.getAttribute('value') || '');
      if (m) times.push(+m[1] * 60 + +m[2]);
    }
    return times.sort((a, b) => a - b);
  }

  root.AgateParser = { findUserId, findLocale, parseDay, parsePunchModal };
})(typeof window !== 'undefined' ? window : globalThis);
