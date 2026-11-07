// Routing + geocoding backends. Each router returns
// fetchRoute(start, waypoints) -> Promise<{distanceM, durationS, path:[{lat,lng}]}>
(function () {
  const cfg = window.WALK_CONFIG;
  const WALK_SPEED = 1.3; // m/s (~4.7 km/h), used when a service gives no usable time

  function limiter(max) {
    let active = 0; const queue = [];
    const next = () => {
      if (active >= max || !queue.length) return;
      active++;
      const { fn, res, rej } = queue.shift();
      fn().then(res, rej).finally(() => { active--; next(); });
    };
    return fn => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); });
  }
  const limit = limiter(cfg.CONCURRENCY || 2);

  async function osrm(start, wps) {
    const pts = [start, ...wps, start].map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const base = cfg.OSRM_URL.replace(/\/$/, '');
    const r = await fetch(`${base}/route/v1/foot/${pts}?overview=full&geometries=polyline&steps=true`);
    if (r.status === 429) throw new Error('rate-limit');
    const data = await r.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) throw new Error(data.message || data.code || 'no-route');
    const route = data.routes[0];
    return {
      distanceM: route.distance,
      durationS: route.distance / WALK_SPEED,
      path: LoopRouting.decodePolyline(route.geometry),
      steps: osrmSteps(route),
    };
  }

  // Turn instructions in one shape for both routers: {lat, lng, turn, name}
  // turn: left | right | slight left | slight right | sharp left | sharp right | uturn | roundabout
  function osrmSteps(route) {
    const out = [];
    (route.legs || []).forEach(leg => (leg.steps || []).forEach(st => {
      const m = st.maneuver || {};
      if (['depart', 'arrive'].includes(m.type)) return;
      let turn = m.modifier;
      if (/roundabout|rotary/.test(m.type)) turn = 'roundabout';
      if (!turn || turn === 'straight') return;
      out.push({ lng: m.location[0], lat: m.location[1], turn, name: st.name || '' });
    }));
    return out;
  }

  const ORS_TURNS = { 0: 'left', 1: 'right', 2: 'sharp left', 3: 'sharp right', 4: 'slight left', 5: 'slight right', 7: 'roundabout', 9: 'uturn', 12: 'slight left', 13: 'slight right' };
  function orsSteps(feature) {
    const coords = feature.geometry.coordinates, out = [];
    (feature.properties.segments || []).forEach(seg => (seg.steps || []).forEach(st => {
      const turn = ORS_TURNS[st.type];
      if (!turn) return;
      const [lng, lat] = coords[st.way_points[0]];
      out.push({ lat, lng, turn, name: st.name && st.name !== '-' ? st.name : '' });
    }));
    return out;
  }

  // Through our Cloudflare Worker (key hidden there). Same answer shape as ORS.
  async function proxy(start, wps) {
    const r = await fetch(cfg.PROXY_URL.replace(/\/$/, '') + '/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [start, ...wps, start].map(p => [p.lng, p.lat]), green: !!window.Providers.prefs.green }),
    });
    if (r.status === 429) throw new Error('rate-limit');
    const data = await r.json();
    if (!r.ok) throw new Error((data.error && (data.error.message || data.error)) || r.statusText);
    return orsResult(data.features[0]);
  }

  function orsResult(f) {
    return {
      distanceM: f.properties.summary.distance,
      durationS: f.properties.summary.distance / WALK_SPEED,
      path: f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      steps: orsSteps(f),
    };
  }

  async function ors(start, wps) {
    if (!cfg.ORS_KEY) throw new Error('ors-key-missing');
    const r = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: cfg.ORS_KEY },
      body: JSON.stringify({
        coordinates: [start, ...wps, start].map(p => [p.lng, p.lat]),
        radiuses: [-1, ...wps.map(() => -1), -1], // snap waypoints to the nearest path, however far
        ...(window.Providers.prefs.green ? { options: { profile_params: { weightings: { green: 1, quiet: 1 } } } } : {}),
      }),
    });
    if (r.status === 429) throw new Error('rate-limit');
    const data = await r.json();
    if (!r.ok) throw new Error((data.error && (data.error.message || data.error)) || r.statusText);
    return orsResult(data.features[0]);
  }

  const impl = cfg.ROUTER === 'ors' ? ors : osrm; // 'osm-public' and 'osrm' both speak OSRM
  window.Providers = {
    prefs: { green: false }, // green/quiet streets (OpenRouteService only)
    // Green/quiet uses OpenRouteService; everything else uses the default router,
    // falling back to OpenRouteService (when a key exists) if the default is busy or down.
    fetchRoute: (start, wps) => limit(async () => {
      if (cfg.PROXY_URL) {
        try { return await proxy(start, wps); }
        catch (e) { console.warn('proxy failed, using public server', e); return osrm(start, wps); }
      }
      if (window.Providers.prefs.green && cfg.ORS_KEY) return ors(start, wps);
      try { return await impl(start, wps); }
      catch (e) {
        if (impl !== ors && cfg.ORS_KEY && (e.message === 'rate-limit' || e instanceof TypeError)) return ors(start, wps);
        throw e;
      }
    }),

    // Nominatim first: it reads Hebrew addresses well. Our server (OpenRouteService) is the backup.
    async geocode(text) {
      try {
        const he = !window.I18N || I18N.lang === 'he';
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=${he ? 'he' : 'en'}${he ? '&countrycodes=il' : ''}&q=` + encodeURIComponent(text);
        let res = await (await fetch(url)).json();
        if (!res.length && he) res = await (await fetch(url.replace('&countrycodes=il', ''))).json(); // outside Israel
        if (res.length) return { lat: +res[0].lat, lng: +res[0].lon };
      } catch (e) { console.warn('nominatim failed', e); }
      if (cfg.PROXY_URL) {
        try {
          const r = await fetch(cfg.PROXY_URL.replace(/\/$/, '') + '/geocode?q=' + encodeURIComponent(text));
          const res = r.ok ? await r.json() : [];
          if (res.length) return { lat: res[0].lat, lng: res[0].lng };
        } catch (e) { console.warn('proxy geocode failed', e); }
      }
      throw new Error('geocode-notfound');
    },

    // Elevation (m) for up to 100 points per call. Open-Meteo: free, no key
    // (free tier is for non-commercial use, ~10,000 calls/day).
    async elevation(points) {
      const out = [];
      for (let i = 0; i < points.length; i += 100) {
        const chunk = points.slice(i, i + 100);
        const url = 'https://api.open-meteo.com/v1/elevation?latitude=' +
          chunk.map(p => p.lat.toFixed(5)).join(',') + '&longitude=' + chunk.map(p => p.lng.toFixed(5)).join(',');
        const r = await fetch(url);
        if (!r.ok) throw new Error('elevation-failed');
        const data = await r.json();
        out.push(...data.elevation);
      }
      return out;
    },

    // Drinking water, toilets and benches within ~30 m of the route (OpenStreetMap / Overpass).
    async pois(path) {
      const pts = LoopRouting.samplePath(path, Math.min(120, Math.max(20, path.length)));
      const line = pts.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(',');
      const q = `[out:json][timeout:25];(
        node(around:30,${line})[amenity=drinking_water];
        node(around:30,${line})[amenity=toilets];
        node(around:20,${line})[amenity=bench];
        node(around:20,${line})[leisure=picnic_table];
      );out body;`;
      const r = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!r.ok) throw new Error('pois-failed');
      const data = await r.json();
      return data.elements.map(e => ({
        lat: e.lat, lng: e.lon,
        kind: e.tags.amenity === 'drinking_water' ? 'water' : e.tags.amenity === 'toilets' ? 'toilet' : 'bench',
      }));
    },

    async reverse(p) {
      try {
        const r = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=${!window.I18N || I18N.lang === 'he' ? 'he' : 'en'}&lat=${p.lat}&lon=${p.lng}`)).json();
        if (r.display_name) return r.display_name.split(',').slice(0, 3).join(',');
      } catch {}
      if (cfg.PROXY_URL) {
        try {
          const r = await (await fetch(`${cfg.PROXY_URL.replace(/\/$/, '')}/reverse?lat=${p.lat}&lng=${p.lng}`)).json();
          if (r.label) return r.label;
        } catch {}
      }
      return null;
    },
  };
})();
