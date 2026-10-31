(function () {
  'use strict';
  if (window.top !== window || window.__agateTimer) return;
  // Fragments HTML (contenu de modale ouvert directement) : pas de panneau
  if (!document.querySelector('.navbar-custom, .wrapper')) return;
  window.__agateTimer = true;

  const T = window.AgateTime;
  const P = window.AgateParser;

  const DEFAULT_SETTINGS = {
    minLunch: 45, // en dessous, oHRis écrête la pause du midi
    defaultLunch: 45, // pause prévue quand elle n'est pas encore prise
    fallbackTheoretical: 7 * 60 + 42,
    maxDaily: 10 * 60, // seuil d'alerte
    plages: [[9 * 60 + 30, 11 * 60 + 30], [13 * 60 + 30, 15 * 60 + 30]], // plages fixes obligatoires
  };
  const REFETCH_MS = 5 * 60 * 1000;
  const RENDER_MS = 20 * 1000;
  const KEEP_DAYS = 14;

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    days: {},
    collapsed: false,
    day: null,
    modalTimes: [],
    error: null,
    loading: true,
  };

  const today = () => T.todayKey();
  const dayPrefs = () => state.days[today()] || {};

  // ---------- Stockage ----------

  async function load() {
    const s = await chrome.storage.local.get(['settings', 'days', 'collapsed']);
    state.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
    state.days = s.days || {};
    state.collapsed = !!s.collapsed;
    const limit = T.todayKey(new Date(Date.now() - KEEP_DAYS * 864e5));
    for (const k of Object.keys(state.days)) if (k < limit) delete state.days[k];
  }

  function save() {
    return chrome.storage.local.set({ settings: state.settings, days: state.days, collapsed: state.collapsed });
  }

  function setDayPref(key, value) {
    const d = { ...dayPrefs() };
    if (value == null) delete d[key];
    else d[key] = value;
    state.days[today()] = d;
    save();
    render();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) state.settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    if (changes.days) state.days = changes.days.newValue || {};
    render();
  });

  // ---------- Récupération des données ----------

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  async function refresh() {
    const key = today();
    try {
      let day = P.parseDay(document, key);
      const uid = P.findUserId(document);
      const locale = P.findLocale(location);
      if (!day) {
        if (!uid) throw new Error("Identifiant utilisateur introuvable sur cette page.");
        const [y, m] = key.split('-');
        day = P.parseDay(await fetchDoc(`/${locale}/time/sheet/${uid}/month/${y}/${+m}`), key);
        if (!day) throw new Error("Ligne du jour introuvable dans la feuille de temps.");
      }
      state.day = day;
      state.error = null;

      state.modalTimes = [];
      if (uid) {
        try {
          state.modalTimes = P.parsePunchModal(await fetchDoc(`/${locale}/time/punch/${uid}/${key}`));
        } catch (e) {
          console.debug('[Agate Timer] modale des pointages indisponible', e);
        }
      }
    } catch (e) {
      state.error = e.message;
    }
    state.loading = false;
    render();
  }

  // ---------- Calcul ----------

  function compute() {
    const s = state.settings;
    const prefs = dayPrefs();
    const day = state.day || { theoretical: null, notWorked: false, punches: [], lunch: null, credits: [] };
    const now = T.nowMinutes();

    const theoretical = day.theoretical ?? (day.notWorked ? 0 : s.fallbackTheoretical);
    const supp = prefs.supp || 0;

    // Badgeages bruts (entrée, sortie, entrée…) : à jour en temps réel, contrairement à la feuille
    // qui n'affiche un pointage qu'une fois clos. On les privilégie quand ils sont disponibles.
    const badges = state.modalTimes.filter((t) => t <= now + 1);
    let punches;
    let punchSource;
    if (badges.length) {
      punches = [];
      for (let i = 0; i < badges.length; i += 2) punches.push({ start: badges[i], end: badges[i + 1] ?? null });
      punchSource = 'badgeuse';
    } else {
      punches = day.punches.map((p) => ({ ...p }));
      punchSource = 'feuille de temps';
    }
    const last = punches[punches.length - 1];

    let first = null;
    let firstSource = null;
    if (prefs.firstOverride != null) {
      first = prefs.firstOverride;
      firstSource = 'manuel';
    } else if (punches.length) {
      first = punches[0].start;
      firstSource = punchSource;
    }

    // Congé : demi-journée = moitié du théorique (3h51), journée = théorique (7h42).
    // "auto" se base sur les absences de la feuille ; une saisie manuelle les remplace.
    const ABSENCE = /absence|cong[ée]/i;
    const sheetAbsence = day.credits.filter((c) => ABSENCE.test(c.label)).reduce((a, c) => a + c.duration, 0);
    const otherCredits = day.credits.filter((c) => !ABSENCE.test(c.label)).reduce((a, c) => a + c.duration, 0);
    const half = Math.round(theoretical / 2);
    // Moitié non travaillée d'une demi-journée : déduite de l'heure d'arrivée (ou de l'heure actuelle)
    const guessHalf = () => ((first ?? now) < 12 * 60 ? 'pm' : 'am');
    let leave;
    let leaveCredit;
    const leaveAuto = prefs.leave == null;
    if (!leaveAuto) {
      leave = prefs.leave === 'half' ? guessHalf() : prefs.leave;
      leaveCredit = { none: 0, am: half, pm: half, full: theoretical }[leave];
    } else {
      leaveCredit = sheetAbsence;
      leave = sheetAbsence <= 0 ? 'none' : sheetAbsence >= theoretical ? 'full' : guessHalf();
    }
    const credited = otherCredits + leaveCredit;
    const required = theoretical + supp - credited;

    // Écarts entre pointages consécutifs
    const gaps = [];
    for (let i = 1; i < punches.length; i++) {
      const prev = punches[i - 1];
      if (prev.end != null) gaps.push({ start: prev.end, end: punches[i].start, d: Math.max(0, punches[i].start - prev.end) });
    }

    let lunchGapIdx = -1;
    if (day.lunch && day.lunch.start != null) {
      lunchGapIdx = gaps.findIndex((g) => g.start === day.lunch.start);
    }
    if (lunchGapIdx < 0) {
      // L'écart le plus long qui chevauche 11h00-14h30
      let best = -1;
      gaps.forEach((g, i) => {
        if (g.end > 660 && g.start < 870 && (best < 0 || g.d > gaps[best].d)) best = i;
      });
      lunchGapIdx = best;
    }

    let lunch;
    let lunchState;
    // Demi-journée de congé : pas de pause méridienne imposée, donc ni pause prévue ni écrêtage
    const halfLeave = leave === 'am' || leave === 'pm';
    const minLunch = halfLeave ? 0 : s.minLunch;
    const planned = prefs.plannedLunch ?? (halfLeave ? 0 : s.defaultLunch);
    const clip = (d) => (d === 0 ? 0 : Math.max(d, minLunch));
    if (day.lunch && day.lunch.duration != null) {
      lunch = Math.max(day.lunch.duration, minLunch);
      lunchState = { label: 'prise', taken: day.lunch.duration };
    } else if (lunchGapIdx >= 0) {
      lunch = Math.max(gaps[lunchGapIdx].d, minLunch);
      lunchState = { label: 'prise', taken: gaps[lunchGapIdx].d };
    } else if (!halfLeave && last && last.end != null && now > last.end && last.end >= 600) {
      // Sortie badgée en fin de matinée, pas encore de retour : pause en cours
      const sofar = now - last.end;
      lunch = clip(Math.max(planned, sofar));
      lunchState = { label: 'en cours', taken: sofar, since: last.end };
    } else {
      lunch = clip(planned);
      lunchState = { label: 'prévue', taken: planned };
    }
    const otherGaps = gaps.reduce((a, g, i) => (i === lunchGapIdx ? a : a + g.d), 0);

    // Plages fixes obligatoires, sauf celles couvertes par le congé
    const plages = (s.plages || [])
      .filter(([a]) => !(leave === 'full' || (leave === 'am' && a < 12 * 60) || (leave === 'pm' && a >= 12 * 60)))
      .sort((x, y) => x[0] - y[0]);
    const applyPlages = (t) => {
      let plage = null;
      for (const p of plages) {
        if (first != null && p[1] > first && t < p[1]) {
          t = p[1];
          plage = p;
        }
      }
      return { t, plage };
    };

    const result = {
      theoretical, credited, otherCredits, leave, leaveAuto, leaveCredit, supp, required,
      first, firstSource, lunch, lunchState, halfLeave, otherGaps, minLunch, now, plages,
    };
    // Week-end, jour férié ou jour non travaillé : pas de théorique sur la feuille
    result.offDay = theoretical === 0 && supp === 0;
    if (required <= 0) return { ...result, covered: true };
    if (first == null) return result;

    result.lateFor = plages.find(([a, b]) => first > a && first < b) || null;
    result.target = first + required + lunch + otherGaps;
    const dep = applyPlages(result.target);
    result.departure = dep.t;
    result.plage = dep.plage;
    result.baseDeparture = applyPlages(result.target - supp).t;
    result.remaining = result.departure - now;
    result.progress = Math.min(1, Math.max(0, (now - first) / (result.departure - first)));
    result.overMax = theoretical + supp > s.maxDaily;
    return result;
  }

  // ---------- Interface ----------

  const host = document.createElement('div');
  host.id = 'agate-timer-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2937; }
      .pill { display: flex; align-items: center; gap: 8px; background: #1e3a8a; color: #fff; border: 0; border-radius: 999px; padding: 8px 14px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25); font: inherit; font-weight: 600; }
      .pill .sub { font-weight: 400; opacity: .85; }
      .panel { width: 300px; background: #fff; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.25); overflow: hidden; }
      .head { display: flex; justify-content: space-between; align-items: center; background: #1e3a8a; color: #fff; padding: 8px 12px; font-weight: 600; }
      .head button { background: none; border: 0; color: #fff; cursor: pointer; font-size: 16px; line-height: 1; }
      .hero { padding: 12px; text-align: center; border-bottom: 1px solid #e5e7eb; }
      .hero .big { font-size: 32px; font-weight: 700; color: #1e3a8a; font-variant-numeric: tabular-nums; }
      .hero .muted, .muted { color: #6b7280; font-size: 12px; }
      .bar { height: 6px; background: #e5e7eb; border-radius: 3px; margin-top: 8px; overflow: hidden; }
      .bar > div { height: 100%; background: #16a34a; }
      .done .big { color: #16a34a; }
      .warn { color: #b45309; font-size: 12px; margin-top: 6px; }
      .err { color: #b91c1c; padding: 10px 12px; font-size: 12px; }
      .rows { padding: 8px 12px; }
      .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; }
      .row label { color: #374151; }
      .row .v { font-variant-numeric: tabular-nums; font-weight: 600; }
      input.wide { width: 150px; }
      select { font: inherit; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 6px; }
      input[type=time], input[type=number], input.dur { font: inherit; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 6px; width: 84px; }
      .supp { background: #eff6ff; margin: 0 -12px; padding: 8px 12px; }
      .chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .chips button, .link { font: inherit; font-size: 12px; border: 1px solid #93c5fd; background: #fff; color: #1e40af; border-radius: 999px; padding: 1px 8px; cursor: pointer; }
      .link { border: 0; padding: 0; background: none; text-decoration: underline; }
      details { border-top: 1px solid #e5e7eb; padding: 6px 12px 10px; }
      summary { cursor: pointer; color: #4b5563; font-size: 12px; }
    </style>
    <div class="wrap"></div>`;
  const wrap = shadow.querySelector('.wrap');
  document.documentElement.appendChild(host);
  // Rendu différé pendant l'édition d'un champ : on rattrape à la sortie
  shadow.addEventListener('focusout', () => setTimeout(render, 0));

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content;
  }

  // Évite de reconstruire le panneau pendant qu'un champ est en cours d'édition
  function editing() {
    const a = shadow.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT');
  }

  function render() {
    if (editing()) return;
    const r = compute();
    wrap.textContent = '';

    if (state.collapsed) {
      let txt = 'Agate Timer';
      let sub = '';
      if (r.offDay) txt = 'Jour non travaillé';
      else if (r.covered) txt = 'Journée couverte';
      else if (r.departure != null) {
        txt = `Départ ${T.fmtClock(r.departure)}`;
        sub = r.remaining > 0 ? `dans ${T.fmtDuration(r.remaining)}` : 'c’est l’heure !';
      } else if (!state.loading) sub = 'pas de badgeage';
      const pill = el(`<button class="pill" title="Agate Timer"><span>${txt}</span><span class="sub">${sub}</span></button>`);
      pill.firstElementChild.addEventListener('click', () => { state.collapsed = false; save(); render(); });
      wrap.appendChild(pill);
      return;
    }

    const s = state.settings;
    const prefs = dayPrefs();
    let hero;
    if (state.loading) hero = `<div class="hero"><div class="muted">Chargement…</div></div>`;
    else if (r.offDay) hero = `<div class="hero"><div class="big">—</div><div class="muted">Pas de temps à faire aujourd'hui<br>(week-end, jour férié ou jour non travaillé sur la feuille)</div></div>`;
    else if (r.covered) hero = `<div class="hero done"><div class="big">✔</div><div class="muted">${r.leave === 'full' ? 'Congé toute la journée' : 'Temps du jour déjà couvert (télétravail, absence…)'}</div></div>`;
    else if (r.departure == null) hero = `<div class="hero"><div class="muted">Aucun badgeage trouvé aujourd'hui.<br>Saisis ton heure d'arrivée ci-dessous.</div></div>`;
    else {
      const late = r.remaining <= 0;
      hero = `<div class="hero ${late ? 'done' : ''}">
        <div class="muted">Heure de départ</div>
        <div class="big">${T.fmtClock(r.departure)}</div>
        <div class="muted">${late ? `Objectif atteint depuis ${T.fmtDuration(-r.remaining)}` : `Encore ${T.fmtDuration(r.remaining)}`}
          ${r.supp ? ` · sans supp : ${T.fmtClock(r.baseDeparture)}` : ''}</div>
        ${r.plage ? `<div class="muted">Heures faites à ${T.fmtClock(r.target)} · plage fixe jusqu'à ${T.fmtClock(r.plage[1])}</div>` : ''}
        <div class="bar"><div style="width:${(r.progress * 100).toFixed(1)}%"></div></div>
        ${r.lateFor ? `<div class="warn">⚠ Arrivée après le début de la plage fixe ${fmtPlage(r.lateFor)}.</div>` : ''}
        ${r.overMax ? `<div class="warn">⚠ Plus de ${T.fmtDuration(s.maxDaily)} de travail prévues aujourd'hui.</div>` : ''}
      </div>`;
    }

    const ls = r.lunchState;
    const lunchTxt = ls.label === 'prévue'
      ? (r.halfLeave && !ls.taken ? 'aucune (demi-journée)' : `prévue ${T.fmtDuration(ls.taken)}`)
      : ls.label === 'en cours'
        ? `en cours depuis ${T.fmtClock(ls.since)} (${T.fmtDuration(ls.taken)})`
        : `prise ${T.fmtDuration(ls.taken)}`;
    const clipped = r.lunch > ls.taken && ls.label !== 'en cours' ? ` → comptée ${T.fmtDuration(r.lunch)}` : '';

    const frag = el(`
      <div class="panel">
        <div class="head"><span>Agate Timer</span>
          <span><button data-a="refresh" title="Actualiser">⟳</button> <button data-a="collapse" title="Réduire">–</button></span>
        </div>
        ${state.error ? `<div class="err">${escapeHtml(state.error)}</div>` : ''}
        ${hero}
        <div class="rows">
          <div class="row"><label>Congé</label>
            <select data-f="leave">${LEAVE_OPTIONS.map(([v, l]) => `<option value="${v}"${(prefs.leave ?? '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          ${r.leave !== 'none' ? `<div class="row"><span class="muted">${r.leaveAuto ? 'détecté sur la feuille : ' : ''}${LEAVE_LABELS[r.leave]}</span><span class="v">${T.fmtDuration(r.leaveCredit)}</span></div>` : ''}
          ${r.covered ? '' : `
          <div class="row"><label>Premier badgeage</label>
            <span class="v">${r.first != null ? T.fmtClock(r.first) : '—'}</span></div>
          <div class="row"><span class="muted">${r.firstSource ? `source : ${r.firstSource}` : ''}</span>
            <span><input type="time" data-f="firstOverride" value="${T.toInputTime(prefs.firstOverride)}" title="Forcer l'heure d'arrivée">
            ${prefs.firstOverride != null ? '<button class="link" data-a="clearFirst">auto</button>' : ''}</span></div>
          <div class="row"><label>Pause du midi</label><span class="v">${lunchTxt}${clipped}</span></div>
          ${ls.label !== 'prise' ? `<div class="row"><span class="muted">Durée prévue (min, 0 = pas de pause)</span>
            <input type="number" min="0" step="5" data-f="plannedLunch" value="${ls.label === 'prévue' ? ls.taken : prefs.plannedLunch ?? s.defaultLunch}"></div>` : ''}
          ${r.otherGaps ? `<div class="row"><label>Autres interruptions</label><span class="v">${T.fmtDuration(r.otherGaps)}</span></div>` : ''}
          <div class="row"><label>Théorique</label><span class="v">${T.fmtDuration(r.theoretical)}</span></div>
          ${r.otherCredits ? `<div class="row"><label>Autres crédits</label><span class="v">${T.fmtDuration(r.otherCredits)}</span></div>` : ''}
          <div class="row"><label>Plages fixes</label><span class="v">${r.plages.length ? r.plages.map(fmtPlage).join(', ') : 'aucune'}</span></div>`}
          <div class="supp">
            <div class="row"><label><b>Heures supp aujourd'hui</b></label>
              <input type="text" class="dur" data-f="supp" placeholder="0h00" value="${r.supp ? T.fmtDuration(r.supp) : ''}" title="Durée, ex. 0h30 ou 1:15"></div>
            <div class="chips">
              <button data-supp="-15">−15</button><button data-supp="15">+15</button>
              <button data-supp="30">+30</button><button data-supp="60">+1h</button>
              ${r.supp ? '<button data-a="clearSupp">aucune</button>' : ''}
            </div>
          </div>
        </div>
        <details>
          <summary>Réglages</summary>
          <div class="row"><span>Plages fixes</span><input type="text" class="wide" data-s="plages" value="${(s.plages || []).map(fmtPlage).join(', ')}" placeholder="9h30-11h30, 13h30-15h30"></div>
          <div class="row"><span>Pause mini (écrêtage, min)</span><input type="number" min="0" step="5" data-s="minLunch" value="${s.minLunch}"></div>
          <div class="row"><span>Pause prévue par défaut (min)</span><input type="number" min="0" step="5" data-s="defaultLunch" value="${s.defaultLunch}"></div>
          <div class="row"><span>Théorique par défaut</span><input type="time" data-s="fallbackTheoretical" value="${T.toInputTime(s.fallbackTheoretical)}"></div>
          <div class="row"><span>Alerte au-delà de</span><input type="time" data-s="maxDaily" value="${T.toInputTime(s.maxDaily)}"></div>
        </details>
      </div>`);

    frag.querySelector('[data-a=collapse]').addEventListener('click', () => { state.collapsed = true; save(); render(); });
    frag.querySelector('[data-a=refresh]').addEventListener('click', () => { state.loading = true; render(); refresh(); });
    frag.querySelector('[data-a=clearFirst]')?.addEventListener('click', () => setDayPref('firstOverride', null));
    frag.querySelector('[data-a=clearSupp]')?.addEventListener('click', () => setDayPref('supp', null));
    frag.querySelectorAll('[data-supp]').forEach((b) =>
      b.addEventListener('click', () => {
        const v = Math.max(0, (dayPrefs().supp || 0) + +b.dataset.supp);
        setDayPref('supp', v || null);
      })
    );
    frag.querySelector('select[data-f=leave]').addEventListener('change', (e) => {
      e.target.blur();
      setDayPref('leave', e.target.value || null);
    });
    frag.querySelectorAll('input[data-f]').forEach((i) =>
      i.addEventListener('change', () => {
        const f = i.dataset.f;
        let v;
        if (i.type === 'time') v = T.fromInputTime(i.value);
        else if (i.classList.contains('dur')) v = i.value.trim() === '' ? null : T.parseDuration(i.value.trim().replace(/^(\d+)$/, '0h$1'));
        else v = i.value === '' ? null : Math.max(0, parseInt(i.value, 10));
        i.blur();
        setDayPref(f, f === 'supp' && !v ? null : v);
      })
    );
    frag.querySelectorAll('input[data-s]').forEach((i) =>
      i.addEventListener('change', () => {
        i.blur();
        if (i.dataset.s === 'plages') {
          state.settings = { ...state.settings, plages: parsePlages(i.value) };
          save();
          return render();
        }
        const v = i.type === 'time' ? T.fromInputTime(i.value) : parseInt(i.value, 10);
        if (v == null || Number.isNaN(v)) return render();
        state.settings = { ...state.settings, [i.dataset.s]: Math.max(0, v) };
        save();
        render();
      })
    );
    wrap.appendChild(frag);
  }

  const LEAVE_OPTIONS = [['', 'Auto (feuille)'], ['none', 'Aucun'], ['half', 'Demi-journée'], ['am', 'Matin'], ['pm', 'Après-midi'], ['full', 'Journée']];
  const LEAVE_LABELS = { none: 'aucun', am: 'demi-journée (matin)', pm: 'demi-journée (après-midi)', full: 'journée entière' };

  function fmtPlage([a, b]) {
    return `${T.fmtClock(a)}–${T.fmtClock(b)}`;
  }

  function parsePlages(text) {
    return [...String(text).matchAll(/(\d{1,2})[h:](\d{2})\s*[-–à]\s*(\d{1,2})[h:](\d{2})/g)]
      .map((m) => [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]])
      .filter(([a, b]) => b > a);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Démarrage ----------

  let lastDay = today();
  load().then(() => {
    render();
    refresh();
    setInterval(() => {
      if (today() !== lastDay) {
        lastDay = today();
        refresh();
      } else render();
    }, RENDER_MS);
    setInterval(refresh, REFETCH_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  });
})();
