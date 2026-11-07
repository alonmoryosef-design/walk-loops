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
    const r = await fetch(`${base}/route/v1/foot/${pts}?overview=full&geometries=polyline`);
    if (r.status === 429) throw new Error('rate-limit');
    const data = await r.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) throw new Error(data.message || data.code || 'no-route');
    const route = data.routes[0];
    return {
      distanceM: route.distance,
      durationS: route.distance / WALK_SPEED,
      path: LoopRouting.decodePolyline(route.geometry),
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
      }),
    });
    if (r.status === 429) throw new Error('rate-limit');
    const data = await r.json();
    if (!r.ok) throw new Error((data.error && (data.error.message || data.error)) || r.statusText);
    const f = data.features[0];
    return {
      distanceM: f.properties.summary.distance,
      durationS: f.properties.summary.duration,
      path: f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    };
  }

  const impl = cfg.ROUTER === 'ors' ? ors : osrm; // 'osm-public' and 'osrm' both speak OSRM
  window.Providers = {
    fetchRoute: (start, wps) => limit(() => impl(start, wps)),

    async geocode(text) {
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=he&countrycodes=il&q=' + encodeURIComponent(text);
      let res = await (await fetch(url)).json();
      if (!res.length) { // retry without the Israel restriction
        res = await (await fetch(url.replace('&countrycodes=il', ''))).json();
      }
      if (!res.length) throw new Error('geocode-notfound');
      return { lat: +res[0].lat, lng: +res[0].lon };
    },

    async reverse(p) {
      try {
        const r = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=he&lat=${p.lat}&lon=${p.lng}`)).json();
        return r.display_name ? r.display_name.split(',').slice(0, 3).join(',') : null;
      } catch { return null; }
    },
  };
})();
