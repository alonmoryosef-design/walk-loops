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
   * Share of the route (0..1) that walks a street it already walked
   * ("there and back" spurs, or the same street out and home).
   */
  function overlapRatio(path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += haversine(path[i - 1], path[i]);
    const STEP = 20, NEAR = 12, APART = 200; // meters
    const n = Math.min(800, Math.max(20, Math.round(total / STEP)));
    const step = total / (n - 1);
    const pts = samplePath(path, n);
    const kx = Math.cos(toRad(pts[0].lat)) * 111320, ky = 110540;
    const xy = pts.map(p => [p.lng * kx, p.lat * ky]);
    const gap = Math.ceil(APART / step);
    let repeated = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (Math.abs(i - j) < gap) continue;
        const dx = xy[i][0] - xy[j][0], dy = xy[i][1] - xy[j][1];
        if (dx * dx + dy * dy < NEAR * NEAR) { repeated++; break; }
      }
    }
    return repeated / n;
  }

  // Lower is better: distance error, plus a penalty for walking the same street twice.
  const score = r => r.err + 0.6 * r.overlap;

  /**
   * Find one loop of ~targetM meters heading in `bearing`.
   * fetchRoute(start, waypoints) -> Promise<{distanceM, durationS, path:[{lat,lng}]}>
   */
  async function findLoop(start, targetM, bearing, fetchRoute, opts = {}) {
    const n = opts.waypoints || 3;
    const maxIter = opts.maxIter || 5;
    const tol = opts.tolerance || 0.05;
    let radius = targetM / (2 * Math.PI * DETOUR);
    let dir = bearing, nudge = 0;
    let best = null;
    for (let i = 0; i < maxIter; i++) {
      const wps = circleWaypoints(start, radius, dir, n);
      let route;
      try { route = await fetchRoute(start, wps); } catch (e) { if (i === 0) throw e; break; }
      const cand = { ...route, waypoints: wps, bearing: dir,
        err: Math.abs(route.distanceM - targetM) / targetM, overlap: overlapRatio(route.path) };
      if (!best || score(cand) < score(best)) best = cand;
      if (cand.err <= tol && cand.overlap <= 0.08) break;
      if (cand.err <= tol) {
        // Right length but retraces streets: turn the loop a little and try again.
        nudge++;
        dir = (bearing + (nudge % 2 ? 1 : -1) * 18 * Math.ceil(nudge / 2) + 360) % 360;
        continue;
      }
      // Scale radius toward target; damp to avoid oscillation.
      const ratio = targetM / route.distanceM;
      radius *= Math.min(1.8, Math.max(0.5, Math.pow(ratio, 0.9)));
    }
    return best;
  }

  /** Generate `count` loops in evenly spread directions. */
  // opts.direction (deg): keep all loops within about ±55° of that compass direction.
  async function findLoops(start, targetM, count, fetchRoute, onProgress, opts = {}) {
    const hasDir = typeof opts.direction === 'number';
    const startBearing = hasDir ? opts.direction - 55 : Math.random() * 360;
    const span = hasDir ? 110 : 360;
    let done = 0;
    const jobs = Array.from({ length: count }, (_, k) => {
      const frac = hasDir ? (count === 1 ? 0.5 : k / (count - 1)) : k / count;
      const bearing = (startBearing + span * frac + 360) % 360;
      return findLoop(start, targetM, bearing, fetchRoute)
        .catch(e => ({ error: e }))
        .finally(() => onProgress && onProgress(++done, count));
    });
    const res = await Promise.all(jobs);
    const ok = res.filter(r => r && !r.error);
    if (!ok.length) throw (res.find(r => r && r.error) || {}).error || new Error('no routes');
    return ok.sort((a, b) => score(a) - score(b));
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

  function haversine(a, b) {
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(h));
  }

  // n points evenly spaced (by distance) along a path.
  function samplePath(path, n) {
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
    const total = cum[cum.length - 1];
    const out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const d = total * k / (n - 1);
      while (j < path.length - 1 && cum[j] < d) j++;
      const seg = cum[j] - cum[j - 1] || 1;
      const t = Math.min(1, Math.max(0, (d - cum[j - 1]) / seg));
      const a = path[j - 1], b = path[j] || a;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
    return out;
  }

  // Total climb in meters, after light smoothing so DEM noise isn't counted as hills.
  function ascent(elev) {
    const s = elev.map((_, i) => {
      const w = elev.slice(Math.max(0, i - 1), i + 2);
      return w.reduce((x, y) => x + y, 0) / w.length;
    });
    let up = 0;
    for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1]) up += s[i] - s[i - 1];
    return up;
  }

  global.LoopRouting = { offset, circleWaypoints, findLoop, findLoops, decodePolyline, samplePath, ascent, overlapRatio, score };
})(typeof window !== 'undefined' ? window : globalThis);
