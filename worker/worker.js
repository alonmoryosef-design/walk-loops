// Cloudflare Worker: a small server between the app and OpenRouteService.
// - The ORS key stays here (secret ORS_KEY), never in the browser.
// - Repeated requests are answered from Cloudflare's cache.
// - Only the app's own site may call it.
//
// Setup: paste this file into a Worker, add a secret named ORS_KEY, deploy.
// Endpoints:
//   POST /route    body {coordinates:[[lng,lat],...], green:bool}  -> ORS GeoJSON
//   GET  /geocode?q=...                                            -> [{lat,lng,label}]
//   GET  /reverse?lat=..&lng=..                                    -> {label}

const ALLOWED_ORIGINS = [
  'https://alonmoryosef-design.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];
const ORS = 'https://api.openrouteservice.org';
const MAX_POINTS = 10;
const CACHE_SECONDS = 7 * 24 * 3600; // streets don't change often

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, origin, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin), ...extra },
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Look up `cacheKey` in Cloudflare's cache; otherwise run `produce` and store a 200 answer.
async function cached(ctx, cacheKey, produce) {
  const cache = caches.default;
  const key = new Request('https://cache.walk-loops/' + cacheKey);
  const hit = await cache.match(key);
  if (hit) return { status: 200, body: await hit.text(), hit: true };
  const { status, body } = await produce();
  if (status === 200) {
    ctx.waitUntil(cache.put(key, new Response(body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
    })));
  }
  return { status, body, hit: false };
}

const validCoord = c => Array.isArray(c) && c.length === 2 &&
  Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;

async function route(request, env, ctx, origin) {
  let input;
  try { input = await request.json(); } catch { return json({ error: 'bad json' }, 400, origin); }
  const coords = input && input.coordinates;
  if (!Array.isArray(coords) || coords.length < 2 || coords.length > MAX_POINTS || !coords.every(validCoord)) {
    return json({ error: 'bad coordinates' }, 400, origin);
  }
  // Round to ~1 m so near-identical requests share a cache entry.
  const rounded = coords.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
  const body = {
    coordinates: rounded,
    radiuses: rounded.map(() => -1),
    language: 'en',
    ...(input.green ? { options: { profile_params: { weightings: { green: 1, quiet: 1 } } } } : {}),
  };
  const key = 'route/' + await sha256(JSON.stringify(body));
  const r = await cached(ctx, key, async () => {
    const res = await fetch(`${ORS}/v2/directions/foot-walking/geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: env.ORS_KEY },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text() };
  });
  return new Response(r.body, {
    status: r.status,
    headers: { 'Content-Type': 'application/json', 'X-Cache': r.hit ? 'HIT' : 'MISS', ...cors(origin) },
  });
}

async function geocode(url, env, ctx, origin) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
  if (!q) return json({ error: 'missing q' }, 400, origin);
  const r = await cached(ctx, 'geo/' + await sha256(q.toLowerCase()), async () => {
    const u = new URL(`${ORS}/geocode/search`);
    u.searchParams.set('api_key', env.ORS_KEY);
    u.searchParams.set('text', q);
    u.searchParams.set('size', '1');
    u.searchParams.set('lang', 'he');
    u.searchParams.set('boundary.country', 'IL');
    let res = await fetch(u);
    let data = res.ok ? await res.json() : null;
    if (data && !data.features.length) { // not in Israel? search everywhere
      u.searchParams.delete('boundary.country');
      res = await fetch(u);
      data = res.ok ? await res.json() : null;
    }
    if (!data) return { status: res.status, body: JSON.stringify({ error: 'geocode failed' }) };
    const out = data.features.map(f => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: f.properties.label }));
    return { status: 200, body: JSON.stringify(out) };
  });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}

async function reverse(url, env, ctx, origin) {
  const lat = +url.searchParams.get('lat'), lng = +url.searchParams.get('lng');
  if (!validCoord([lng, lat])) return json({ error: 'bad point' }, 400, origin);
  const k = `${lat.toFixed(4)},${lng.toFixed(4)}`; // ~10 m
  const r = await cached(ctx, 'rev/' + k, async () => {
    const u = new URL(`${ORS}/geocode/reverse`);
    u.searchParams.set('api_key', env.ORS_KEY);
    u.searchParams.set('point.lat', lat.toFixed(5));
    u.searchParams.set('point.lon', lng.toFixed(5));
    u.searchParams.set('size', '1');
    u.searchParams.set('lang', 'he');
    const res = await fetch(u);
    if (!res.ok) return { status: res.status, body: JSON.stringify({ error: 'reverse failed' }) };
    const data = await res.json();
    const f = data.features[0];
    return { status: 200, body: JSON.stringify({ label: f ? f.properties.label : null }) };
  });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (!env.ORS_KEY) return json({ error: 'ORS_KEY secret is not set on the worker' }, 500, origin);
    try {
      if (url.pathname === '/route' && request.method === 'POST') return await route(request, env, ctx, origin);
      if (url.pathname === '/geocode' && request.method === 'GET') return await geocode(url, env, ctx, origin);
      if (url.pathname === '/reverse' && request.method === 'GET') return await reverse(url, env, ctx, origin);
      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'upstream error' }, 502, origin);
    }
  },
};
