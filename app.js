(function () {
  const cfg = window.WALK_CONFIG;
  const COLORS = ['#1f8a4c', '#1a5fb4', '#c64600', '#8e3fb5', '#c01c6b', '#0f7c8a'];
  const $ = id => document.getElementById(id);

  let startPoint = null, startMarker = null, lines = [];

  const map = L.map('map').setView([32.0853, 34.7818], 13);
  L.tileLayer(cfg.TILE_URL, { maxZoom: 19, attribution: cfg.TILE_ATTRIBUTION }).addTo(map);

  function setStatus(msg, isError) {
    const el = $('status');
    el.textContent = msg || '';
    el.className = 'status' + (isError ? ' error' : '');
  }

  function setStart(p) {
    startPoint = p;
    const icon = L.divIcon({ className: '', html: '<div class="start-pin" style="width:26px;height:26px">S</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
    if (!startMarker) startMarker = L.marker(p, { icon, zIndexOffset: 1000 }).addTo(map);
    else startMarker.setLatLng(p);
    map.panTo(p);
  }

  function setStartText(text) {
    $('start').value = text;
    $('start').dataset.resolved = text;
  }

  map.on('click', async e => {
    const p = { lat: e.latlng.lat, lng: e.latlng.lng };
    setStart(p);
    setStartText(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    const name = await Providers.reverse(p);
    if (name && startPoint === p) setStartText(name);
  });

  function resolveStart(text) {
    const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return Promise.resolve({ lat: +m[1], lng: +m[2] });
    return Providers.geocode(text);
  }

  function clearRoutes() {
    lines.forEach(l => l.remove());
    lines = [];
    $('results').innerHTML = '';
  }

  function fmtDuration(s) {
    const m = Math.round(s / 60);
    return m < 60 ? `${m} דק׳` : `${Math.floor(m / 60)} ש׳ ${m % 60} דק׳`;
  }

  // Opening a route in the Google Maps app is just a link: free, no key needed.
  function mapsLink(start, wps) {
    const f = p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    return 'https://www.google.com/maps/dir/?api=1&travelmode=walking' +
      `&origin=${f(start)}&destination=${f(start)}&waypoints=${encodeURIComponent(wps.map(f).join('|'))}`;
  }

  function dirName(b) {
    const names = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'];
    return names[Math.round(b / 45) % 8];
  }

  function select(i) {
    lines.forEach((l, j) => {
      l.setStyle({ opacity: j === i ? 0.95 : 0.35, weight: j === i ? 6 : 4 });
      if (j === i) l.bringToFront();
    });
    document.querySelectorAll('#results li').forEach((li, j) => li.classList.toggle('active', j === i));
    map.fitBounds(lines[i].getBounds(), { padding: [30, 30] });
  }

  function showRoutes(routes) {
    clearRoutes();
    const group = [];
    routes.forEach((r, i) => {
      const color = COLORS[i % COLORS.length];
      const line = L.polyline(r.path, { color, weight: 5, opacity: 0.8 }).addTo(map);
      line.on('click', () => select(i));
      lines.push(line);
      group.push(line);

      const li = document.createElement('li');
      li.style.setProperty('--c', color);
      li.innerHTML = `
        <div class="title"><span class="dot"></span>מסלול ${i + 1} · לכיוון ${dirName(r.bearing)}</div>
        <div class="meta">${(r.distanceM / 1000).toFixed(2)} ק״מ · כ-${fmtDuration(r.durationS)}${r.ascentM != null ? ` · ↗ ${Math.round(r.ascentM)} מ׳ עלייה` : ''}</div>
        ${r.elev ? profileSvg(r.elev, color) : ''}
        <a href="${mapsLink(startPoint, r.waypoints)}" target="_blank" rel="noopener">פתח ניווט ב-Google Maps ↗</a>`;
      li.addEventListener('click', e => { if (e.target.tagName !== 'A') select(i); });
      $('results').appendChild(li);
    });
    map.fitBounds(L.featureGroup(group).getBounds(), { padding: [30, 30] });
  }

  async function addElevation(routes) {
    try {
      await Promise.all(routes.map(async r => {
        const pts = LoopRouting.samplePath(r.path, 80);
        r.elev = await Providers.elevation(pts);
        r.ascentM = LoopRouting.ascent(r.elev);
      }));
      return true;
    } catch (e) {
      console.warn('elevation failed', e);
      return false;
    }
  }

  // Tiny elevation profile as inline SVG.
  function profileSvg(elev, color) {
    const w = 300, h = 44, min = Math.min(...elev), max = Math.max(...elev);
    const span = Math.max(max - min, 10); // at least 10 m so flat routes look flat
    const pts = elev.map((e, i) => `${(i / (elev.length - 1) * w).toFixed(1)},${(h - 4 - (e - min) / span * (h - 8)).toFixed(1)}`);
    return `<svg class="profile" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="0,${h} ${pts.join(' ')} ${w},${h}" fill="${color}" fill-opacity=".15"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const km = parseFloat($('km').value);
    if (!(km >= 0.5)) return setStatus('הזן מרחק של לפחות 0.5 ק״מ.', true);
    const btn = $('go');
    btn.disabled = true;
    clearRoutes();
    try {
      setStatus('מאתר את נקודת המוצא…');
      const text = $('start').value;
      if (!startPoint || text !== $('start').dataset.resolved) {
        setStart(await resolveStart(text));
        $('start').dataset.resolved = text;
      }
      const count = parseInt($('count').value, 10);
      const terrain = $('terrain').value;
      // When the user cares about hills, try extra directions and keep the best ones.
      const tries = terrain === 'any' ? count : Math.min(count + 3, 9);
      setStatus(`מחשב מסלולים… 0/${tries}`);
      let routes = await LoopRouting.findLoops(startPoint, km * 1000, tries, Providers.fetchRoute,
        (d, n) => setStatus(`מחשב מסלולים… ${d}/${n}`));
      setStatus('בודק עליות…');
      const elevOk = await addElevation(routes);
      if (terrain !== 'any' && elevOk) {
        const close = routes.filter(r => r.err <= 0.12);
        const pool = close.length >= count ? close : routes;
        pool.sort((a, b) => terrain === 'flat' ? a.ascentM - b.ascentM : b.ascentM - a.ascentM);
        routes = pool.slice(0, count);
      } else {
        routes = routes.slice(0, count);
      }
      showRoutes(routes);
      const order = terrain === 'flat' ? ' (מהשטוח ביותר)' : terrain === 'hilly' ? ' (מהתלול ביותר)' : '';
      setStatus(`נמצאו ${routes.length} מסלולים${elevOk ? order : ''}. לחץ על מסלול כדי להדגיש אותו.` +
        (elevOk ? '' : ' (נתוני גובה לא זמינים כרגע)'));
    } catch (err) {
      console.error(err);
      const msg = String(err && err.message || err);
      if (msg === 'geocode-notfound') setStatus('לא מצאתי את הכתובת. נסה לנסח אחרת או לבחור נקודה על המפה.', true);
      else if (msg === 'rate-limit') setStatus('שרת המסלולים עמוס כרגע. נסה שוב בעוד דקה.', true);
      else if (msg === 'ors-key-missing') setStatus('בקובץ config.js נבחר OpenRouteService אבל לא הוזן ORS_KEY.', true);
      else if (/Failed to fetch|NetworkError/i.test(msg)) setStatus('אין חיבור לשרת המסלולים. בדוק את החיבור לאינטרנט.', true);
      else setStatus('לא הצלחתי לחשב מסלולים: ' + msg, true);
    } finally {
      btn.disabled = false;
    }
  });

  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('הדפדפן לא תומך באיתור מיקום.', true);
    setStatus('מאתר מיקום…');
    navigator.geolocation.getCurrentPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setStart(p);
      setStartText(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
      setStatus('');
    }, () => setStatus('לא הצלחתי לקבל מיקום. אשר גישה למיקום בדפדפן.', true), { enableHighAccuracy: true, timeout: 10000 });
  });
})();
