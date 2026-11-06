// Extraction des données de la feuille de temps oHRis.
(function (root) {
  const { parseDuration, parseRange, parseHM } = root.AgateTime;

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

  // Toutes les lignes jour de la feuille : théorique et effectif (colonne « Effectif », écrêtage inclus)
  function parseSheetDays(doc) {
    const days = {};
    for (const row of doc.querySelectorAll('tr[id^="td-"]')) {
      const key = row.id.slice(3);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const theoEl = row.querySelector('.theoricalColumn');
      const effEl = [...row.children].find((td) => td.classList.contains('text-end') && !td.classList.contains('d-none'));
      days[key] = {
        theo: theoEl ? parseDuration(theoEl.textContent) : null,
        eff: effEl ? parseDuration(effEl.textContent) : null,
      };
    }
    return days;
  }

  // Récapitulatif mensuel de la feuille, présent une fois la dernière semaine du mois écoulée
  function parseMonthRecap(doc) {
    const recap = { diff: null, worked: null, recup: null };
    for (const td of doc.querySelectorAll('tr.summaryTr td[title]')) {
      const title = td.getAttribute('title');
      const valueEl = td.parentElement.querySelector('td[colspan="4"]');
      const v = valueEl ? parseDuration(valueEl.textContent) : null;
      if (v == null) continue;
      if (/diff[ée]rentiel mensuel/i.test(title)) recap.diff = v;
      else if (/total d.heures/i.test(title)) recap.worked = v;
      else if (/r[ée]cup[ée]rations g[ée]n[ée]r[ée]es/i.test(title)) recap.recup = v;
    }
    return recap;
  }

  // Page Absences > Compteur(s) : solde du compteur « Récupération Horaire »
  function parseRecupBalance(doc) {
    for (const row of doc.querySelectorAll('#userAbsenceMeters tbody tr')) {
      const cells = row.querySelectorAll(':scope > td');
      if (cells.length < 6 || !/r[ée]cup[ée]ration horaire/i.test(cells[0].textContent)) continue;
      return parseHM(cells[5].textContent);
    }
    return null;
  }

  root.AgateParser = { findUserId, findLocale, parseDay, parsePunchModal, parseSheetDays, parseMonthRecap, parseRecupBalance };
})(typeof window !== 'undefined' ? window : globalThis);
