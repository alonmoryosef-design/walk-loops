// Loop-route generation. Pure logic: the actual routing call is injected (fetchRoute),
// so this file can be tested without Google.
(function (global) {
  const R_EARTH = 6371000;
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;

  // Point at a given distance (m) and bearing (deg) from {lat,lng}.
  function offset(p, distM, bearingDeg) {
    const d = distM / R_EARTH, b = toRad(bearingDeg);
    const lat1 = toRad(p.lat), lng1 = toRad(p.lng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: toDeg(lat2), lng: toDeg(lng2) };
  }

  // Waypoints on a circle that passes through the start point.
  // The circle's center lies at `radius` from start in direction `bearing`;
  // we place `n` points evenly around it (excluding the start itself).
  function circleWaypoints(start, radius, bearing, n) {
    const center = offset(start, radius, bearing);
    const back = (bearing + 180) % 360; // direction from center to start
    const pts = [];
    for (let i = 1; i <= n; i++) {
      pts.push(offset(center, radius, back + (360 / (n + 1)) * i));
    }
    return pts;
  }

  // Typical ratio between walked street distance and the ideal circle.
  const DETOUR = 1.25;

  /**
   * Find one loop of ~targetM meters heading in `bearing`.
   * fetchRoute(start, waypoints) -> Promise<{distanceM, durationS, path:[{lat,lng}]}>
   */
  async function findLoop(start, targetM, bearing, fetchRoute, opts = {}) {
    const n = opts.waypoints || 3;
    const maxIter = opts.maxIter || 4;
    const tol = opts.tolerance || 0.05;
    let radius = targetM / (2 * Math.PI * DETOUR);
    let best = null;
    for (let i = 0; i < maxIter; i++) {
      const wps = circleWaypoints(start, radius, bearing, n);
      let route;
      try { route = await fetchRoute(start, wps); } catch (e) { if (i === 0) throw e; break; }
      const err = Math.abs(route.distanceM - targetM) / targetM;
      if (!best || err < best.err) best = { ...route, waypoints: wps, bearing, err };
      if (err <= tol) break;
      // Scale radius toward target; damp to avoid oscillation.
      const ratio = targetM / route.distanceM;
      radius *= Math.min(1.8, Math.max(0.5, Math.pow(ratio, 0.9)));
    }
    return best;
  }

  /** Generate `count` loops in evenly spread directions. */
  async function findLoops(start, targetM, count, fetchRoute, onProgress) {
    const startBearing = Math.random() * 360;
    let done = 0;
    const jobs = Array.from({ length: count }, (_, k) => {
      const bearing = (startBearing + (360 / count) * k) % 360;
      return findLoop(start, targetM, bearing, fetchRoute)
        .catch(e => ({ error: e }))
        .finally(() => onProgress && onProgress(++done, count));
    });
    const res = await Promise.all(jobs);
    const ok = res.filter(r => r && !r.error);
    if (!ok.length) throw (res.find(r => r && r.error) || {}).error || new Error('no routes');
    return ok.sort((a, b) => a.err - b.err);
  }

  // Google encoded polyline decoder.
  function decodePolyline(str) {
    let i = 0, lat = 0, lng = 0;
    const out = [];
    while (i < str.length) {
      for (const which of [0, 1]) {
        let shift = 0, result = 0, b;
        do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const d = (result & 1) ? ~(result >> 1) : (result >> 1);
        if (which === 0) lat += d; else lng += d;
      }
      out.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return out;
  }

  global.LoopRouting = { offset, circleWaypoints, findLoop, findLoops, decodePolyline };
})(typeof window !== 'undefined' ? window : globalThis);
