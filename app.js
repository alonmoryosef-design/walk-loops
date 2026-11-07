(function () {
  const cfg = window.WALK_CONFIG;
  const COLORS = ['#1f8a4c', '#1a5fb4', '#c64600', '#8e3fb5', '#c01c6b', '#0f7c8a'];
  const WALK_KMH = 4.7; // used to turn minutes into km
  const FAV_KEY = 'walkLoops.favorites';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let startPoint = null, startMarker = null, lines = [], shown = [];
  const HIST_KEY = 'walkLoops.history';

  const map = L.map('map', { zoomControl: false }).setView([32.0853, 34.7818], 13);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer(cfg.TILE_URL, { maxZoom: 19, attribution: cfg.TILE_ATTRIBUTION }).addTo(map);
  const poiLayer = L.layerGroup().addTo(map);

  // OpenRouteService key: entered in the app and kept only on this device (never in the code).
  const ORS_STORE = 'walkLoops.orsKey';
  try { cfg.ORS_KEY = cfg.ORS_KEY || localStorage.getItem(ORS_STORE) || ''; } catch {}
  const refreshGreen = () => { $('greenRow').hidden = !(cfg.ROUTER === 'ors' || cfg.ORS_KEY || cfg.PROXY_URL); };
  refreshGreen();
  // The key box is for the owner only: shown with #settings in the address, or once a key is saved.
  // With the Cloudflare Worker connected it is never needed (the key lives on the server).
  $('settings').hidden = !!cfg.PROXY_URL || !(location.hash === '#settings' || cfg.ORS_KEY);
  $('orsKey').value = cfg.ORS_KEY;
  $('saveOrs').addEventListener('click', () => {
    cfg.ORS_KEY = $('orsKey').value.trim();
    try { cfg.ORS_KEY ? localStorage.setItem(ORS_STORE, cfg.ORS_KEY) : localStorage.removeItem(ORS_STORE); } catch {}
    refreshGreen();
    $('orsSaved').textContent = cfg.ORS_KEY ? 'נשמר. האפשרות "פארקים ורחובות שקטים" זמינה עכשיו.' : 'המפתח הוסר.';
  });

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
    if (Tracker.active) return;
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
    poiLayer.clearLayers();
    lines.forEach(l => l.remove());
    lines = [];
    shown = [];
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

  function bearingTo(a, b) {
    const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
    const x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) -
      Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos((b.lng - a.lng) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function select(i) {
    lines.forEach((l, j) => {
      l.setStyle({ opacity: j === i ? 0.95 : 0.35, weight: j === i ? 6 : 4 });
      if (j === i) l.bringToFront();
    });
    document.querySelectorAll('#results li').forEach((li, j) => li.classList.toggle('active', j === i));
    map.fitBounds(lines[i].getBounds(), { padding: [30, 30] });
  }

  function routeTitle(r, i) {
    return r.title || `מסלול ${i + 1} · לכיוון ${dirName(r.bearing)}`;
  }

  function showRoutes(routes) {
    clearRoutes();
    shown = routes;
    const group = [];
    routes.forEach((r, i) => {
      const color = COLORS[i % COLORS.length];
      const line = L.polyline(r.path, { color, weight: 5, opacity: 0.8 }).addTo(map);
      line.on('click', () => select(i));
      lines.push(line);
      group.push(line);

      const retrace = r.overlap > 0.15 ? `<div class="warn">⚠ בערך ${Math.round(r.overlap * 100)}% מהמסלול חוזר על אותם רחובות</div>` : '';
      const li = document.createElement('li');
      li.style.setProperty('--c', color);
      li.innerHTML = `
        <div class="title"><span class="dot"></span>${esc(routeTitle(r, i))}</div>
        <div class="meta">${(r.distanceM / 1000).toFixed(2)} ק״מ · כ-${fmtDuration(r.durationS)}${r.ascentM != null ? ` · ↗ ${Math.round(r.ascentM)} מ׳ עלייה` : ''}</div>
        ${retrace}
        ${r.elev ? profileSvg(r.elev, color) : ''}
        <div class="pois-line"></div>
        <div class="actions">
          <button type="button" data-act="walk" class="primary">▶ התחל הליכה</button>
          <button type="button" data-act="share">שיתוף</button>
          <button type="button" data-act="gpx">GPX</button>
          <button type="button" data-act="pois">🚰 מה יש בדרך</button>
          <button type="button" data-act="fav">${isFavorite(r) ? '★ שמור' : '☆ שמירה'}</button>
          <a href="${mapsLink(r.start || startPoint, r.waypoints)}" target="_blank" rel="noopener">Google Maps ↗</a>
        </div>`;
      li.addEventListener('click', e => {
        const act = e.target.dataset && e.target.dataset.act;
        if (act === 'walk') Tracker.start(r, color);
        else if (act === 'share') shareRoute(r);
        else if (act === 'gpx') gpxRoute(r, i);
        else if (act === 'pois') showPois(r, li);
        else if (act === 'fav') { toggleFavorite(r, routeTitle(r, i)); e.target.textContent = isFavorite(r) ? '★ שמור' : '☆ שמירה'; }
        if (e.target.tagName !== 'A') select(i);
      });
      $('results').appendChild(li);
    });
    if (group.length) map.fitBounds(L.featureGroup(group).getBounds(), { padding: [30, 30] });
  }

  async function addElevation(routes) {
    try {
      await Promise.all(routes.map(async r => {
        if (r.elev) return;
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

  // Rebuild one route from its start + waypoints (shared links, favorites).
  async function loadRoute(start, wps, title) {
    const r = await Providers.fetchRoute(start, wps);
    const c = wps.reduce((a, p) => ({ lat: a.lat + p.lat / wps.length, lng: a.lng + p.lng / wps.length }), { lat: 0, lng: 0 });
    Object.assign(r, { start, waypoints: wps, bearing: bearingTo(start, c), err: 0, overlap: LoopRouting.overlapRatio(r.path), title });
    await addElevation([r]);
    return r;
  }

  // ---------- Water, toilets, benches along the route ----------
  const POI_ICON = { water: '🚰', toilet: '🚻', bench: '🪑' };
  async function showPois(r, li) {
    const out = li.querySelector('.pois-line');
    out.textContent = 'מחפש ברזיות, שירותים וספסלים…';
    try {
      r.pois = r.pois || await Providers.pois(r.path);
      poiLayer.clearLayers();
      r.pois.forEach(p => L.marker(p, {
        icon: L.divIcon({ className: 'poi', html: POI_ICON[p.kind], iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(poiLayer));
      const n = k => r.pois.filter(p => p.kind === k).length;
      out.textContent = r.pois.length
        ? `🚰 ${n('water')} ברזיות · 🚻 ${n('toilet')} שירותים · 🪑 ${n('bench')} ספסלים (מסומנים על המפה)`
        : 'לא נמצאו ברזיות, שירותים או ספסלים במפה לאורך המסלול.';
    } catch {
      out.textContent = 'השירות לא זמין כרגע. נסה שוב בעוד דקה.';
    }
  }

  // ---------- Share link ----------
  const f5 = p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  function routeUrl(r) {
    const u = new URL(location.href.split('?')[0].split('#')[0]);
    u.searchParams.set('s', f5(r.start || startPoint));
    u.searchParams.set('w', r.waypoints.map(f5).join(';'));
    u.searchParams.set('km', (r.distanceM / 1000).toFixed(1));
    return u.toString();
  }

  async function shareRoute(r) {
    const url = routeUrl(r);
    const text = `מסלול הליכה מעגלי של ${(r.distanceM / 1000).toFixed(1)} ק״מ`;
    try {
      if (navigator.share) { await navigator.share({ title: 'מסלול הליכה', text, url }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); setStatus('הקישור הועתק. אפשר להדביק אותו בוואטסאפ או בכל מקום אחר.'); }
    catch { prompt('העתק את הקישור:', url); }
  }

  // ---------- GPX ----------
  function gpxRoute(r, i) {
    const name = `מסלול הליכה ${(r.distanceM / 1000).toFixed(1)} ק״מ`;
    const pts = r.path.map((p, k) => {
      const ele = r.elev ? `<ele>${r.elev[Math.round(k / (r.path.length - 1) * (r.elev.length - 1))].toFixed(1)}</ele>` : '';
      return `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${ele}</trkpt>`;
    }).join('\n      ');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="walk-loops" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name></metadata>
  <trk><name>${esc(name)}</name><type>walking</type>
    <trkseg>
      ${pts}
    </trkseg>
  </trk>
</gpx>`;
    const filename = `walk-${(r.distanceM / 1000).toFixed(1)}km-${i + 1}.gpx`;
    const file = new File([gpx], filename, { type: 'application/gpx+xml' });
    // On phones: open the share sheet so the file can go straight to Strava / Garmin / WhatsApp.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- Favorites (kept on this device) ----------
  const favKey = r => [r.start || startPoint, ...r.waypoints].map(f5).join(';');
  function loadFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; } }
  function saveFavs(list) { try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {} renderFavs(); }
  function isFavorite(r) { const k = favKey(r); return loadFavs().some(f => f.key === k); }

  function toggleFavorite(r, title) {
    const k = favKey(r), list = loadFavs();
    const idx = list.findIndex(f => f.key === k);
    if (idx >= 0) { list.splice(idx, 1); saveFavs(list); return; }
    const name = (prompt('שם למסלול:', `${$('start').value.split(',')[0] || 'מסלול'} · ${(r.distanceM / 1000).toFixed(1)} ק״מ`) || '').trim();
    if (!name) return;
    list.unshift({ key: k, name, start: r.start || startPoint, waypoints: r.waypoints,
      distanceM: r.distanceM, ascentM: r.ascentM, savedAt: Date.now() });
    saveFavs(list);
  }

  function renderFavs() {
    const list = loadFavs();
    $('favBox').hidden = !list.length;
    $('favCount').textContent = list.length;
    $('favList').innerHTML = list.map((f, i) => `
      <li data-i="${i}">
        <span class="fav-name">${esc(f.name)}</span>
        <span class="fav-meta">${(f.distanceM / 1000).toFixed(1)} ק״מ${f.ascentM != null ? ` · ↗ ${Math.round(f.ascentM)} מ׳` : ''}</span>
        <button type="button" class="link" data-del="${i}" title="מחיקה">✕</button>
      </li>`).join('');
  }

  $('favList').addEventListener('click', async e => {
    const li = e.target.closest('li');
    if (!li) return;
    const list = loadFavs();
    if (e.target.dataset.del != null) { list.splice(+e.target.dataset.del, 1); saveFavs(list); return; }
    const f = list[+li.dataset.i];
    setStatus('טוען מסלול שמור…');
    try {
      setStart(f.start);
      setStartText(f5(f.start));
      showRoutes([await loadRoute(f.start, f.waypoints, '★ ' + f.name)]);
      select(0);
      setStatus('');
    } catch (err) { setStatus('לא הצלחתי לטעון את המסלול: ' + err.message, true); }
  });

  // Explain why location failed, with the fix for the viewer's phone.
  function geoErrorText(err) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|GSA\//.test(navigator.userAgent);
    if (err && err.code === 1) {
      if (inApp) return 'אין הרשאה למיקום. פתחו את האתר בדפדפן עצמו (Safari או Chrome) ולא מתוך אפליקציה אחרת.';
      return ios
        ? 'אין הרשאה למיקום. באייפון: הגדרות ← פרטיות ואבטחה ← שירותי מיקום ← Safari (או Chrome) ← "בזמן השימוש ביישום", ואז לרענן את הדף.'
        : 'אין הרשאה למיקום. לוחצים על סמל המנעול ליד כתובת האתר ← הרשאות ← מיקום ← אפשר, ואז מרעננים את הדף.';
    }
    if (err && err.code === 3) return 'לקח יותר מדי זמן למצוא את המיקום. נסו שוב, רצוי בחוץ.';
    return 'לא הצלחתי לקבל מיקום. בדקו ששירותי המיקום בטלפון מופעלים, או בחרו נקודה על המפה.';
  }

  // ---------- Voice + vibration ----------
  const TURN_TEXT = {
    'left': 'פנה שמאלה', 'right': 'פנה ימינה', 'slight left': 'המשך מעט שמאלה', 'slight right': 'המשך מעט ימינה',
    'sharp left': 'פנה חדות שמאלה', 'sharp right': 'פנה חדות ימינה', 'uturn': 'הסתובב לאחור', 'roundabout': 'בכיכר, המשך לפי המסלול',
  };
  const TURN_ARROW = { 'left': '⬅', 'right': '➡', 'slight left': '↖', 'slight right': '↗', 'sharp left': '↙', 'sharp right': '↘', 'uturn': '↩', 'roundabout': '⟳' };
  const turnText = t => (TURN_TEXT[t.turn] || 'המשך') + (t.name && t.turn !== 'roundabout' ? ` אל ${t.name}` : '');

  const Voice = {
    on: (() => { try { return localStorage.getItem('walkLoops.voice') !== 'off'; } catch { return true; } })(),
    say(text) {
      if (!this.on || !window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'he-IL';
      const v = speechSynthesis.getVoices().find(v => /^he|^iw/i.test(v.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    },
    buzz(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); },
    toggle() {
      this.on = !this.on;
      try { localStorage.setItem('walkLoops.voice', this.on ? 'on' : 'off'); } catch {}
      if (!this.on && window.speechSynthesis) speechSynthesis.cancel();
      $('trackVoice').textContent = this.on ? '🔊' : '🔇';
    },
  };
  $('trackVoice').textContent = Voice.on ? '🔊' : '🔇';
  $('trackVoice').addEventListener('click', () => Voice.toggle());

  // ---------- Walk history (kept on this device) ----------
  function loadHist() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch { return []; } }
  function addHistory(h) {
    const list = loadHist();
    list.unshift(h);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 500))); } catch {}
    renderHist();
  }
  function renderHist() {
    const list = loadHist();
    $('histBox').hidden = !list.length;
    if (!list.length) return;
    const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    const week = list.filter(h => h.date >= weekStart.getTime());
    const km = a => (a.reduce((s, h) => s + h.walkedM, 0) / 1000).toFixed(1);
    $('histSummary').textContent = `השבוע: ${km(week)} ק״מ ב-${week.length} הליכות · סה״כ: ${km(list)} ק״מ`;
    const fmtDate = t => new Date(t).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
    $('histList').innerHTML = list.slice(0, 15).map(h => `
      <li><span>${fmtDate(h.date)}</span><span>${(h.walkedM / 1000).toFixed(2)} ק״מ</span>
      <span>${fmtDuration(h.seconds)}</span><span>${h.finished ? '✓' : ''}</span></li>`).join('');
  }

  // ---------- Live walk tracking ----------
  const Tracker = {
    active: false,
    start(r, color) {
      if (!navigator.geolocation) return setStatus('הדפדפן לא תומך באיתור מיקום.', true);
      this.stop();
      this.active = true;
      this.route = r;
      const n = Math.max(20, Math.round(r.distanceM / 10)); // a point every ~10 m
      this.samples = LoopRouting.samplePath(r.path, n);
      this.step = r.distanceM / (n - 1);
      this.idx = 0;
      this.kx = Math.cos(r.path[0].lat * Math.PI / 180) * 111320;
      this.done = L.polyline([], { color: '#888', weight: 7, opacity: 0.9 }).addTo(map);
      this.dot = L.circleMarker(r.path[0], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
      lines.forEach(l => l.setStyle({ opacity: l.options.color === color ? 0.95 : 0.12 }));
      document.body.classList.add('walking');
      map.invalidateSize();
      $('trackBar').hidden = false;
      $('trackText').textContent = 'מחפש את המיקום שלך…';
      map.fitBounds(L.polyline(r.path).getBounds(), { padding: [30, 30] });
      this.follow = true;
      this.startedAt = Date.now();
      this.offAnnounced = false;
      this.finished = false;
      // Turn instructions mapped to their position along the route.
      let from = 0;
      this.turns = (r.steps || []).map(t => {
        let best = from, bestD = Infinity;
        for (let k = from; k < Math.min(this.samples.length, from + 400); k++) {
          const dx = (this.samples[k].lng - t.lng) * this.kx, dy = (this.samples[k].lat - t.lat) * 110540;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = k; }
        }
        from = best;
        return { ...t, idx: best, said: false };
      }).filter(t => t.idx > 2 && t.idx < this.samples.length - 3);
      Voice.say(`מתחילים. ${(r.distanceM / 1000).toFixed(1)} קילומטר.` + (this.turns[0] ? ' ' + turnText(this.turns[0]) + ' בהמשך.' : ''));
      this.watch = navigator.geolocation.watchPosition(p => this.update(p), err =>
        $('trackText').textContent = geoErrorText(err), { enableHighAccuracy: true, maximumAge: 2000 });
      if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => this.lock = l).catch(() => {});
    },
    update(pos) {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      this.dot.setLatLng(me);
      if (this.follow) map.panTo(me);
      // Look for the nearest route point a bit behind and up to ~3 km ahead of where we were,
      // so a loop that passes the same street twice doesn't jump around.
      let best = this.idx, bestD = Infinity;
      const from = Math.max(0, this.idx - 20), to = Math.min(this.samples.length - 1, this.idx + 300);
      for (let k = from; k <= to; k++) {
        const s = this.samples[k];
        const dx = (s.lng - me.lng) * this.kx, dy = (s.lat - me.lat) * 110540;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = k; }
      }
      const off = Math.sqrt(bestD);
      if (off < 60) this.idx = best;
      this.done.setLatLngs(this.samples.slice(0, this.idx + 1));
      const walked = this.idx * this.step, left = Math.max(0, this.route.distanceM - walked);
      const pct = Math.round(walked / this.route.distanceM * 100);
      let msg = `עברת ${(walked / 1000).toFixed(2)} ק״מ · נשארו ${(left / 1000).toFixed(2)} ק״מ (${pct}%)`;
      // Next turn: show it, and say it once when ~35 m away.
      const next = this.turns.find(t => t.idx > this.idx);
      let turnLine = '';
      if (next) {
        const dist = Math.round((next.idx - this.idx) * this.step / 10) * 10;
        turnLine = `${TURN_ARROW[next.turn] || '↑'} בעוד ${dist} מ׳: ${turnText(next)}`;
        if (!next.said && dist <= 35 && off < 60) {
          next.said = true;
          Voice.say(`עוד ${dist} מטר, ${turnText(next)}`);
          Voice.buzz(/left/.test(next.turn) ? [150, 100, 150] : [400]);
        }
      }
      if (off >= 60) {
        msg = `⚠ סטית מהמסלול (כ-${Math.round(off)} מ׳). ` + msg;
        if (!this.offAnnounced) { this.offAnnounced = true; Voice.say('סטית מהמסלול'); Voice.buzz([300, 100, 300, 100, 300]); }
      } else this.offAnnounced = false;
      if (left < 30 && this.idx > this.samples.length * 0.9) {
        msg = '🎉 סיימת את המסלול!';
        turnLine = '';
        if (!this.finished) { this.finished = true; Voice.say('סיימת את המסלול. כל הכבוד!'); Voice.buzz([200, 100, 200, 100, 500]); }
      }
      this.walked = walked;
      $('trackText').innerHTML = (turnLine ? `<div class="turn">${esc(turnLine)}</div>` : '') + esc(msg);
    },
    stop() {
      if (this.active && this.walked > 200) {
        addHistory({ date: Date.now(), walkedM: Math.round(this.walked), seconds: Math.round((Date.now() - this.startedAt) / 1000),
          routeM: Math.round(this.route.distanceM), finished: !!this.finished });
      }
      this.walked = 0;
      if (this.watch != null) navigator.geolocation.clearWatch(this.watch);
      this.watch = null;
      if (this.lock) { this.lock.release().catch(() => {}); this.lock = null; }
      if (this.done) this.done.remove();
      if (this.dot) this.dot.remove();
      this.done = this.dot = null;
      this.active = false;
      document.body.classList.remove('walking');
      map.invalidateSize();
      $('trackBar').hidden = true;
      lines.forEach(l => l.setStyle({ opacity: 0.8 }));
    },
  };
  map.on('dragstart', () => { Tracker.follow = false; });
  $('trackCenter').addEventListener('click', () => {
    Tracker.follow = true;
    if (Tracker.dot) map.panTo(Tracker.dot.getLatLng());
  });
  $('trackStop').addEventListener('click', () => Tracker.stop());

  // ---------- Form ----------
  $('unit').addEventListener('change', () => {
    const v = parseFloat($('amount').value) || 0;
    if ($('unit').value === 'min') {
      $('amount').value = Math.round(v / WALK_KMH * 60 / 5) * 5 || 60;
      Object.assign($('amount'), { min: 10, max: 600, step: 5 });
    } else {
      $('amount').value = (Math.round(v / 60 * WALK_KMH * 2) / 2) || 5;
      Object.assign($('amount'), { min: 0.5, max: 50, step: 0.5 });
    }
  });

  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const amount = parseFloat($('amount').value);
    const km = $('unit').value === 'min' ? amount / 60 * WALK_KMH : amount;
    if (!(km >= 0.5)) return setStatus('הזן מרחק של לפחות 0.5 ק״מ (או 10 דקות).', true);
    const btn = $('go');
    btn.disabled = true;
    Tracker.stop();
    clearRoutes();
    try {
      setStatus('מאתר את נקודת המוצא…');
      const text = $('start').value;
      if (!startPoint || text !== $('start').dataset.resolved) {
        setStart(await resolveStart(text));
        $('start').dataset.resolved = text;
      }
      Providers.prefs.green = !$('greenRow').hidden && $('green').checked;
      const count = parseInt($('count').value, 10);
      const terrain = $('terrain').value;
      // Try a few extra directions and keep the best ones.
      const tries = Math.min(count + (terrain === 'any' ? 2 : 3), 9);
      setStatus(`מחשב מסלולים… 0/${tries}`);
      const dir = $('direction').value;
      let routes = await LoopRouting.findLoops(startPoint, km * 1000, tries, Providers.fetchRoute,
        (d, n) => setStatus(`מחשב מסלולים… ${d}/${n}`), dir === 'any' ? {} : { direction: +dir });
      routes.forEach(r => { r.start = startPoint; });
      setStatus('בודק עליות…');
      const elevOk = await addElevation(routes);
      if (terrain !== 'any' && elevOk) {
        const good = routes.filter(r => r.err <= 0.12 && r.overlap <= 0.25);
        const pool = good.length >= count ? good : routes;
        pool.sort((a, b) => terrain === 'flat' ? a.ascentM - b.ascentM : b.ascentM - a.ascentM);
        routes = pool.slice(0, count);
      } else {
        routes = routes.slice(0, count); // already sorted: closest length, least retracing
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
    }, err => setStatus(geoErrorText(err), true), { enableHighAccuracy: true, timeout: 15000 });
  });

  // ---------- Startup ----------
  renderFavs();
  renderHist();

  // Opened from a shared link: ?s=lat,lng&w=lat,lng;lat,lng;...
  (async () => {
    const q = new URLSearchParams(location.search);
    if (!q.get('s') || !q.get('w')) return;
    const parse = t => { const [lat, lng] = t.split(',').map(Number); return { lat, lng }; };
    try {
      const s = parse(q.get('s'));
      const wps = q.get('w').split(';').map(parse);
      if (![s, ...wps].every(p => isFinite(p.lat) && isFinite(p.lng)) || wps.length > 8) throw new Error('bad link');
      setStart(s);
      setStartText(f5(s));
      setStatus('טוען את המסלול ששותף איתך…');
      showRoutes([await loadRoute(s, wps, 'מסלול ששותף איתך')]);
      select(0);
      setStatus('זה המסלול ששותף איתך. אפשר גם ליצור מסלולים חדשים מכאן.');
    } catch (err) {
      setStatus('לא הצלחתי לטעון את המסלול מהקישור.', true);
    }
  })();

  // Installable app (home-screen icon, full screen).
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
