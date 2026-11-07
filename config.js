// Which routing service to use. Change only this file to switch.
//
//  'osm-public' – free public OpenStreetMap servers (FOSSGIS). No key, no signup.
//                 Fair-use only: fine for personal use, not for a distributed app.
//  'ors'        – OpenRouteService (https://openrouteservice.org/dev/#/signup).
//                 Free key without a credit card, ~2,000 routes/day. Put the key in ORS_KEY.
//  'osrm'       – Your own OSRM server with the foot profile. Put its URL in OSRM_URL.
window.WALK_CONFIG = {
  // Address of our Cloudflare Worker (see worker/README.md). When set, routes and address
  // search go through it (OpenRouteService, key hidden), with the public server as backup.
  PROXY_URL: 'https://walk-loops-api.alonmoryosef.workers.dev',

  ROUTER: 'osm-public',
  ORS_KEY: '',
  OSRM_URL: 'https://routing.openstreetmap.de/routed-foot',

  // Map tiles. tile.openstreetmap.org is OK for light use; for a distributed app
  // use a tile provider (e.g. MapTiler / Stadia free tiers) and put its URL here.
  TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',

  // Max parallel routing requests (be polite to free servers).
  CONCURRENCY: 2,
};
