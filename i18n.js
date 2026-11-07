// Languages (Hebrew / English) and units (metric / imperial).
// Language: saved choice, otherwise the phone's language. Units: saved choice,
// otherwise miles for US English and kilometers for everyone else.
(function () {
  const L_KEY = 'walkLoops.lang', U_KEY = 'walkLoops.units';
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const nav = (navigator.language || 'en').toLowerCase();

  const lang = get(L_KEY) || (/^(he|iw)/.test(nav) ? 'he' : 'en');
  let units = get(U_KEY) || (/^en-(us|lr)|^my/.test(nav) ? 'imperial' : 'metric');

  const D = {
    he: {
      title: 'מסלולי הליכה מעגליים',
      start: 'נקודת מוצא', startPh: 'כתובת, למשל: דיזנגוף 100, תל אביב', myLocation: 'המיקום שלי',
      mapHint: 'אפשר גם ללחוץ על המפה כדי לבחור נקודה.',
      howFar: 'כמה ללכת', unitKm: 'ק״מ', unitMi: 'מייל', unitMin: 'דקות',
      hills: 'עליות', hillsAny: 'לא משנה', hillsFlat: 'כמה שפחות עליות', hillsHilly: 'עם עליות',
      direction: 'כיוון', dirAny: 'כל הכיוונים',
      dirs: ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'],
      green: 'להעדיף פארקים ורחובות שקטים', count: 'כמה מסלולים להציע', go: 'צור מסלולים',
      settings: '⚙️ הגדרות', orsKey: 'מפתח OpenRouteService', orsPh: 'מדביקים כאן את המפתח',
      orsHint: 'מפעיל את האפשרות "פארקים ורחובות שקטים" ומשמש גיבוי כשהשרת הציבורי עמוס. נשמר רק במכשיר הזה.',
      save: 'שמירה', orsSaved: 'נשמר. האפשרות "פארקים ורחובות שקטים" זמינה עכשיו.', orsRemoved: 'המפתח הוסר.',
      history: '📊 ההליכות שלי', favs: '★ המסלולים השמורים שלי', privacy: 'מדיניות פרטיות', mapsBy: 'מפות © OpenStreetMap',
      voiceTitle: 'הנחיות קוליות', toMe: '📍 אליי', stop: 'סיום', language: 'English',
      min: '{m} דק׳', hm: '{h} ש׳ {m} דק׳',
      routeTitle: 'מסלול {n} · לכיוון {dir}', retrace: '⚠ בערך {p}% מהמסלול חוזר על אותם רחובות',
      about: 'כ-{t}', climb: '↗ {h} עלייה',
      walk: '▶ התחל הליכה', share: 'שיתוף', onTheWay: '🚰 מה יש בדרך', saved: '★ שמור', saveBtn: '☆ שמירה', del: 'מחיקה',
      poisLoading: 'מחפש ברזיות, שירותים וספסלים…',
      pois: '🚰 {w} ברזיות · 🚻 {t} שירותים · 🪑 {b} ספסלים (מסומנים על המפה)',
      poisNone: 'לא נמצאו ברזיות, שירותים או ספסלים במפה לאורך המסלול.', poisFail: 'השירות לא זמין כרגע. נסה שוב בעוד דקה.',
      shareText: 'מסלול הליכה מעגלי של {d}', shareTitle: 'מסלול הליכה', copied: 'הקישור הועתק. אפשר להדביק אותו בוואטסאפ או בכל מקום אחר.',
      copyPrompt: 'העתק את הקישור:', gpxName: 'מסלול הליכה {d}', favPrompt: 'שם למסלול:', routeWord: 'מסלול',
      loadingFav: 'טוען מסלול שמור…', loadFail: 'לא הצלחתי לטעון את המסלול: {e}',
      geoInApp: 'אין הרשאה למיקום. פתחו את האתר בדפדפן עצמו (Safari או Chrome) ולא מתוך אפליקציה אחרת.',
      geoIos: 'אין הרשאה למיקום. באייפון: הגדרות ← פרטיות ואבטחה ← שירותי מיקום ← Safari (או Chrome) ← "בזמן השימוש ביישום", ואז לרענן את הדף.',
      geoAndroid: 'אין הרשאה למיקום. לוחצים על סמל המנעול ליד כתובת האתר ← הרשאות ← מיקום ← אפשר, ואז מרעננים את הדף.',
      geoTimeout: 'לקח יותר מדי זמן למצוא את המיקום. נסו שוב, רצוי בחוץ.',
      geoFail: 'לא הצלחתי לקבל מיקום. בדקו ששירותי המיקום בטלפון מופעלים, או בחרו נקודה על המפה.',
      noGeo: 'הדפדפן לא תומך באיתור מיקום.', locating: 'מאתר מיקום…', findingYou: 'מחפש את המיקום שלך…',
      turns: { 'left': 'פנה שמאלה', 'right': 'פנה ימינה', 'slight left': 'המשך מעט שמאלה', 'slight right': 'המשך מעט ימינה',
        'sharp left': 'פנה חדות שמאלה', 'sharp right': 'פנה חדות ימינה', 'uturn': 'הסתובב לאחור', 'roundabout': 'בכיכר, המשך לפי המסלול' },
      continue: 'המשך', onto: ' אל {name}',
      weekSummary: 'השבוע: {w} ב-{n} הליכות · סה״כ: {all}',
      sayStart: 'מתחילים. {d}.', sayFirst: ' {turn} בהמשך.', sayIn: 'עוד {d}, {turn}', sayOff: 'סטית מהמסלול', sayDone: 'סיימת את המסלול. כל הכבוד!',
      progress: 'עברת {w} · נשארו {l} ({p}%)', inDist: 'בעוד {d}', offRoute: '⚠ סטית מהמסלול (כ-{d}). ', done: '🎉 סיימת את המסלול!',
      minDist: 'הזן מרחק של לפחות 0.5 ק״מ (או 10 דקות).', findingStart: 'מאתר את נקודת המוצא…',
      computing: 'מחשב מסלולים… {d}/{n}', checkingHills: 'בודק עליות…',
      found: 'נמצאו {n} מסלולים{o}. לחץ על מסלול כדי להדגיש אותו.', flatFirst: ' (מהשטוח ביותר)', hillyFirst: ' (מהתלול ביותר)',
      noElev: ' (נתוני גובה לא זמינים כרגע)',
      notFound: 'לא מצאתי את הכתובת. נסה לנסח אחרת או לבחור נקודה על המפה.', busy: 'שרת המסלולים עמוס כרגע. נסה שוב בעוד דקה.',
      orsMissing: 'בקובץ config.js נבחר OpenRouteService אבל לא הוזן ORS_KEY.', offline: 'אין חיבור לשרת המסלולים. בדוק את החיבור לאינטרנט.',
      routeFail: 'לא הצלחתי לחשב מסלולים: {e}',
      sharedLoading: 'טוען את המסלול ששותף איתך…', sharedTitle: 'מסלול ששותף איתך',
      sharedDone: 'זה המסלול ששותף איתך. אפשר גם ליצור מסלולים חדשים מכאן.', sharedFail: 'לא הצלחתי לטעון את המסלול מהקישור.',
      km: 'ק״מ', mi: 'מייל', m: 'מ׳', ft: 'רגל', kmSpoken: 'קילומטר', miSpoken: 'מייל', mSpoken: 'מטר', ftSpoken: 'רגל',
    },
    en: {
      title: 'Loop Walking Routes',
      start: 'Starting point', startPh: 'Address, e.g. 10 Downing St, London', myLocation: 'My location',
      mapHint: 'You can also tap the map to pick a point.',
      howFar: 'How far', unitKm: 'km', unitMi: 'miles', unitMin: 'minutes',
      hills: 'Hills', hillsAny: 'Don’t mind', hillsFlat: 'As flat as possible', hillsHilly: 'With hills',
      direction: 'Direction', dirAny: 'Any direction',
      dirs: ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'],
      green: 'Prefer parks and quiet streets', count: 'How many routes', go: 'Find routes',
      settings: '⚙️ Settings', orsKey: 'OpenRouteService key', orsPh: 'Paste your key here',
      orsHint: 'Turns on “parks and quiet streets” and is used as a backup when the public server is busy. Saved only on this device.',
      save: 'Save', orsSaved: 'Saved. “Parks and quiet streets” is now available.', orsRemoved: 'Key removed.',
      history: '📊 My walks', favs: '★ My saved routes', privacy: 'Privacy policy', mapsBy: 'Maps © OpenStreetMap',
      voiceTitle: 'Voice directions', toMe: '📍 Me', stop: 'Finish', language: 'עברית',
      min: '{m} min', hm: '{h} h {m} min',
      routeTitle: 'Route {n} · heading {dir}', retrace: '⚠ About {p}% of this route repeats the same streets',
      about: '~{t}', climb: '↗ {h} climb',
      walk: '▶ Start walk', share: 'Share', onTheWay: '🚰 Along the way', saved: '★ Saved', saveBtn: '☆ Save', del: 'Delete',
      poisLoading: 'Looking for water fountains, toilets and benches…',
      pois: '🚰 {w} water · 🚻 {t} toilets · 🪑 {b} benches (shown on the map)',
      poisNone: 'No water fountains, toilets or benches are mapped along this route.', poisFail: 'This service is unavailable right now. Try again in a minute.',
      shareText: 'A {d} loop walk', shareTitle: 'Walking route', copied: 'Link copied. Paste it anywhere to share.',
      copyPrompt: 'Copy this link:', gpxName: 'Walking route {d}', favPrompt: 'Name this route:', routeWord: 'Route',
      loadingFav: 'Loading saved route…', loadFail: 'Couldn’t load the route: {e}',
      geoInApp: 'No location access. Open this site in Safari or Chrome directly, not inside another app.',
      geoIos: 'No location access. On iPhone: Settings → Privacy & Security → Location Services → Safari (or Chrome) → “While Using the App”, then reload.',
      geoAndroid: 'No location access. Tap the lock icon next to the address → Permissions → Location → Allow, then reload.',
      geoTimeout: 'Finding your location took too long. Try again, ideally outdoors.',
      geoFail: 'Couldn’t get your location. Check that location services are on, or tap a point on the map.',
      noGeo: 'This browser can’t share your location.', locating: 'Finding your location…', findingYou: 'Finding your location…',
      turns: { 'left': 'turn left', 'right': 'turn right', 'slight left': 'bear left', 'slight right': 'bear right',
        'sharp left': 'turn sharp left', 'sharp right': 'turn sharp right', 'uturn': 'turn around', 'roundabout': 'at the roundabout, follow the route' },
      continue: 'continue', onto: ' onto {name}',
      weekSummary: 'This week: {w} in {n} walks · Total: {all}',
      sayStart: 'Let’s go. {d}.', sayFirst: ' Then {turn}.', sayIn: 'In {d}, {turn}', sayOff: 'You are off the route', sayDone: 'You finished the route. Well done!',
      progress: 'Walked {w} · {l} to go ({p}%)', inDist: 'In {d}', offRoute: '⚠ Off route (about {d}). ', done: '🎉 Route complete!',
      minDist: 'Enter at least 0.5 km / 0.3 mi (or 10 minutes).', findingStart: 'Finding the starting point…',
      computing: 'Finding routes… {d}/{n}', checkingHills: 'Checking hills…',
      found: 'Found {n} routes{o}. Tap a route to highlight it.', flatFirst: ' (flattest first)', hillyFirst: ' (hilliest first)',
      noElev: ' (elevation data unavailable right now)',
      notFound: 'Couldn’t find that address. Try wording it differently or tap a point on the map.', busy: 'The routing server is busy. Try again in a minute.',
      orsMissing: 'config.js selects OpenRouteService but ORS_KEY is empty.', offline: 'Can’t reach the routing server. Check your internet connection.',
      routeFail: 'Couldn’t find routes: {e}',
      sharedLoading: 'Loading the route shared with you…', sharedTitle: 'Route shared with you',
      sharedDone: 'This is the route that was shared with you. You can also find new routes from here.', sharedFail: 'Couldn’t load the route from this link.',
      km: 'km', mi: 'mi', m: 'm', ft: 'ft', kmSpoken: 'kilometers', miSpoken: 'miles', mSpoken: 'meters', ftSpoken: 'feet',
    },
  };

  function t(key, vars) {
    let s = (D[lang] && D[lang][key]) ?? D.he[key] ?? key;
    if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    return s;
  }

  const imperial = () => units === 'imperial';
  // Formatting helpers. dist: route lengths; short: distances to the next turn; height: climbs.
  const fmt = {
    dist(m, digits = 2) { return imperial() ? `${(m / 1609.344).toFixed(digits)} ${t('mi')}` : `${(m / 1000).toFixed(digits)} ${t('km')}`; },
    spokenDist(m) { return imperial() ? `${(m / 1609.344).toFixed(1)} ${t('miSpoken')}` : `${(m / 1000).toFixed(1)} ${t('kmSpoken')}`; },
    short(m) { return imperial() ? `${Math.round(m * 3.281 / 10) * 10} ${t('ft')}` : `${Math.round(m / 10) * 10} ${t('m')}`; },
    spokenShort(m) { return imperial() ? `${Math.round(m * 3.281 / 10) * 10} ${t('ftSpoken')}` : `${Math.round(m / 10) * 10} ${t('mSpoken')}`; },
    height(m) { return imperial() ? `${Math.round(m * 3.281)} ${t('ft')}` : `${Math.round(m)} ${t('m')}`; },
  };

  function apply() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-dir]').forEach(el => { el.textContent = t('dirs')[+el.dataset.dir]; });
  }

  window.I18N = {
    lang, t, fmt, apply,
    get units() { return units; },
    setUnits(u) { units = u; set(U_KEY, u); },
    toggleLang() { set(L_KEY, lang === 'he' ? 'en' : 'he'); location.reload(); },
    voiceLang: lang === 'he' ? 'he-IL' : 'en-US',
  };
})();
