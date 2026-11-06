// Différentiel mensuel : une semaine (lundi → dimanche) compte pour le mois qui contient son dimanche,
// comme le récapitulatif de la feuille oHRis.
(function (root) {
  const T = root.AgateTime;

  const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

  function shiftMonth({ y, m }, n) {
    const d = new Date(y, m - 1 + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  }

  // Mois auquel est rattachée une date : celui du dimanche de sa semaine
  function attributedMonth(key) {
    const [y, m] = T.sundayOf(key).split('-').map(Number);
    return { y, m };
  }

  // Lundi de la première semaine et dimanche de la dernière semaine rattachées au mois
  function period({ y, m }) {
    const first = `${ym(y, m)}-01`;
    const firstSunday = T.sundayOf(first);
    const lastDay = T.todayKey(new Date(y, m, 0));
    const lastSunday = T.addDays(T.sundayOf(lastDay), T.fromKey(lastDay).getDay() === 0 ? 0 : -7);
    return { start: T.addDays(firstSunday, -6), end: lastSunday };
  }

  function monthName({ y, m }) {
    const s = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // days : { "YYYY-MM-DD": { theo, eff } } ; todayProjection : différentiel prévu pour aujourd'hui (null = feuille)
  function compute({ days, period: p, todayKey, todayProjection }) {
    let pastDiff = 0;
    let allTheo = 0;
    let allEff = 0;
    let workdaysLeft = 0;
    let todaySheetDiff = 0;
    const missing = [];
    for (let k = p.start; k <= p.end; k = T.addDays(k, 1)) {
      const d = days[k];
      if (!d) {
        missing.push(k);
        continue;
      }
      const theo = d.theo || 0;
      const eff = d.eff || 0;
      allTheo += theo;
      allEff += eff;
      if (k < todayKey) pastDiff += eff - theo;
      else {
        if (k === todayKey) todaySheetDiff = eff - theo;
        if (theo > 0 && eff < theo) workdaysLeft++;
      }
    }
    const todayDiff = todayProjection ?? todaySheetDiff;
    const remaining = allTheo - allEff;
    return {
      pastDiff,
      withToday: pastDiff + todayDiff,
      allTheo,
      allEff,
      remaining,
      workdaysLeft,
      perDay: workdaysLeft > 0 && remaining > 0 ? Math.ceil(remaining / workdaysLeft) : 0,
      missing,
    };
  }

  root.AgateMonth = { ym, shiftMonth, attributedMonth, period, monthName, compute };
})(typeof window !== 'undefined' ? window : globalThis);
