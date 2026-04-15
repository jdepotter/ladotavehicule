import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logEvent } from "@/lib/logger";
import { lookupStreet } from "@/lib/streetLookup";

if (!process.env.MAPBOX_TOKEN) console.warn("[geocode] MAPBOX_TOKEN not set — cross-street detection will fail");

// Reverse geocode using Nominatim (street name + house number + postcode).
async function reverseGeocode(lat: number, lon: number) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
    { headers: { "User-Agent": "LADOT-Reporter/1.0" }, signal: AbortSignal.timeout(4000) },
  );
  if (!res.ok) return null;
  return res.json();
}

// Compute distance in metres between two WGS84 points (equirectangular, fine at street scale).
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 111_000;
  const dLon = (lon2 - lon1) * 111_000 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// Convert lat/lon to tile coordinates at a given zoom.
function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

// Hard cap on Mapbox tile calls per UTC day. 200k/mo free ÷ 30 ≈ 6,600/day.
// We cap at 5,000 as a safety net (~150k/mo, 75% of free tier).
const MAPBOX_TILES_DAILY_CAP = 5000;
let mapboxTilesDay = "";
let mapboxTilesCount = 0;
function reserveMapboxTile(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== mapboxTilesDay) { mapboxTilesDay = today; mapboxTilesCount = 0; }
  if (mapboxTilesCount >= MAPBOX_TILES_DAILY_CAP) return false;
  mapboxTilesCount++;
  return true;
}

// Fetch one Mapbox vector tile and return road features with LineString geometries in WGS84.
type RoadLine = { name: string; line: number[][] }; // line = [[lon, lat], ...]
async function fetchTileRoads(z: number, x: number, y: number, token: string): Promise<RoadLine[]> {
  if (!reserveMapboxTile()) {
    console.error(`[geocode] Mapbox daily tile cap reached (${MAPBOX_TILES_DAILY_CAP}) — skipping ${z}/${x}/${y}`);
    return [];
  }
  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${z}/${x}/${y}.mvt?access_token=${encodeURIComponent(token)}`;
  let res: Response;
  try {
    // 7-day cache: street geometry rarely changes, maximizing Netlify cache hit rate.
    res = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 604800 } });
  } catch (err) {
    console.error(`[geocode] tile fetch failed ${z}/${x}/${y}: ${err}`);
    return [];
  }
  if (!res.ok) {
    if (res.status !== 404) console.error(`[geocode] tile HTTP ${res.status} for ${z}/${x}/${y}`);
    return [];
  }
  const { VectorTile } = await import("@mapbox/vector-tile");
  const Protobuf = (await import("pbf")).default;
  const buf = new Uint8Array(await res.arrayBuffer());
  const tile = new VectorTile(new Protobuf(buf));
  const layer = tile.layers.road;
  if (!layer) return [];

  const out: RoadLine[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feat = layer.feature(i);
    const name = (feat.properties.name as string | undefined) || "";
    if (!name) continue;
    const gj = feat.toGeoJSON(x, y, z) as {
      geometry: { type: string; coordinates: number[][] | number[][][] };
    };
    if (gj.geometry.type === "LineString") {
      out.push({ name, line: gj.geometry.coordinates as number[][] });
    } else if (gj.geometry.type === "MultiLineString") {
      for (const ls of gj.geometry.coordinates as number[][][]) {
        out.push({ name, line: ls });
      }
    }
  }
  return out;
}

// Shortest distance from point p to segment (a, b). In metres, using local equirect projection.
function pointToSegmentMeters(plat: number, plon: number, alat: number, alon: number, blat: number, blon: number): number {
  const mPerDegLat = 111_000;
  const mPerDegLon = 111_000 * Math.cos(plat * Math.PI / 180);
  const px = plon * mPerDegLon, py = plat * mPerDegLat;
  const ax = alon * mPerDegLon, ay = alat * mPerDegLat;
  const bx = blon * mPerDegLon, by = blat * mPerDegLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Normalize a street name so Nominatim and OSM/Mapbox variants match:
// lowercase, strip punctuation, strip leading directional, expand trailing suffix.
const SUFFIX_EXPAND: Record<string, string> = {
  ave: "avenue", avenue: "avenue",
  blvd: "boulevard", boulevard: "boulevard",
  st: "street", street: "street",
  dr: "drive", drive: "drive",
  rd: "road", road: "road",
  ln: "lane", lane: "lane",
  ct: "court", court: "court",
  pl: "place", place: "place",
  pkwy: "parkway", parkway: "parkway",
  ter: "terrace", terrace: "terrace",
  cir: "circle", circle: "circle",
  way: "way",
};
function normalizeStreetName(name: string): string {
  const tokens = name.toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  while (tokens.length && /^(n|s|e|w|north|south|east|west)$/.test(tokens[0])) tokens.shift();
  if (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (SUFFIX_EXPAND[last]) tokens[tokens.length - 1] = SUFFIX_EXPAND[last];
  }
  return tokens.join(" ");
}

// Segment-segment intersection in lon/lat (fine at street scale); returns crossing point or null.
function segIntersect(
  a1x: number, a1y: number, a2x: number, a2y: number,
  b1x: number, b1y: number, b2x: number, b2y: number,
): [number, number] | null {
  const dxA = a2x - a1x, dyA = a2y - a1y;
  const dxB = b2x - b1x, dyB = b2y - b1y;
  const denom = dxA * dyB - dyA * dxB;
  if (denom === 0) return null;
  const t = ((b1x - a1x) * dyB - (b1y - a1y) * dxB) / denom;
  const u = ((b1x - a1x) * dyA - (b1y - a1y) * dxA) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a1x + t * dxA, a1y + t * dyA];
}

// Mapbox-based cross-street detection — returns the crossing street, or null on any failure
// (cap reached, no tiles, no main street match, no crossings). Caller can fall back to Overpass.
async function findCrossStreetMapbox(lat: number, lon: number, mainStreet: string, token: string): Promise<string | null> {
  if (!token) {
    console.error(`[geocode] MAPBOX_TOKEN missing`);
    return null;
  }

  // Zoom 15 covers ~1km/tile at LA latitude. Fetch 3x3 so intersections can't fall off the edge.
  const Z = 15;
  const { x, y } = lonLatToTile(lon, lat, Z);
  const tilesToFetch: Array<[number, number]> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      tilesToFetch.push([x + dx, y + dy]);
    }
  }
  const tileResults = await Promise.all(tilesToFetch.map(([tx, ty]) => fetchTileRoads(Z, tx, ty, token)));
  const roads = tileResults.flat();
  console.log(`[geocode] MVT: ${roads.length} road line-parts from 9 tiles`);

  if (roads.length === 0) {
    console.warn(`[geocode] No roads returned from tiles near (${lat}, ${lon})`);
    return null;
  }

  // Group all LineStrings by name; distance to pin = shortest perpendicular distance
  // from pin to any segment of the road (not just to vertices — long straight roads
  // have few vertices, so vertex-only distance falsely puts them "far").
  const linesByName = new Map<string, number[][][]>();
  const nearestToPinByName = new Map<string, number>();
  for (const r of roads) {
    const arr = linesByName.get(r.name) ?? [];
    arr.push(r.line);
    linesByName.set(r.name, arr);

    let d = nearestToPinByName.get(r.name) ?? Infinity;
    for (let i = 0; i < r.line.length - 1; i++) {
      const [alon, alat] = r.line[i];
      const [blon, blat] = r.line[i + 1];
      const dd = pointToSegmentMeters(lat, lon, alat, alon, blat, blon);
      if (dd < d) d = dd;
    }
    nearestToPinByName.set(r.name, d);
  }

  const ranked = [...nearestToPinByName.entries()].sort((a, b) => a[1] - b[1]);
  console.log(`[geocode] Nearby streets: ${ranked.slice(0, 6).map(([n, d]) => `${n} (${Math.round(d)}m)`).join(", ")}`);

  // Main street = the feature the pin sits on (closest vertex to pin).
  // Nominatim and Mapbox disagree on suffix spelling ("Airport Boulevard" vs "Airport Blvd"),
  // so compare normalized forms: lowercase, strip punctuation, expand suffixes, strip directions.
  const SUFFIX_EXPAND: Record<string, string> = {
    ave: "avenue", avenue: "avenue",
    blvd: "boulevard", boulevard: "boulevard",
    st: "street", street: "street",
    dr: "drive", drive: "drive",
    rd: "road", road: "road",
    ln: "lane", lane: "lane",
    ct: "court", court: "court",
    pl: "place", place: "place",
    pkwy: "parkway", parkway: "parkway",
    ter: "terrace", terrace: "terrace",
    cir: "circle", circle: "circle",
    way: "way",
  };
  const normalize = (name: string): string => {
    const tokens = name.toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
    // Strip leading directionals.
    while (tokens.length && /^(n|s|e|w|north|south|east|west)$/.test(tokens[0])) tokens.shift();
    // Expand trailing suffix.
    if (tokens.length) {
      const last = tokens[tokens.length - 1];
      if (SUFFIX_EXPAND[last]) tokens[tokens.length - 1] = SUFFIX_EXPAND[last];
    }
    return tokens.join(" ");
  };

  const mainNominatimNorm = normalize(mainStreet);

  // Prefer Nominatim's street if it appears in the Mapbox features — Nominatim is
  // authoritative about which road the pin sits on. Fall back to closest-by-distance
  // only when Nominatim's name isn't present (e.g. name mismatch, or Nominatim failed).
  let mainName = ranked[0][0]; // default: closest
  if (mainNominatimNorm) {
    const nominatimMatch = ranked.find(([n]) => normalize(n) === mainNominatimNorm);
    if (nominatimMatch) mainName = nominatimMatch[0];
  }

  const mainNameNorm = normalize(mainName);
  const isMainName = (name: string) => {
    const n = normalize(name);
    return n === mainNameNorm || n === mainNominatimNorm;
  };
  const mainLines = linesByName.get(mainName) ?? [];
  console.log(`[geocode] Main street selected: "${mainName}" (Nominatim="${mainStreet}", closest-by-distance="${ranked[0][0]}")`);

  // Intersection = the candidate road's geometry gets very close to the main
  // road's geometry somewhere. Use vertex-to-segment distance so roads that
  // "end at" the main road (T-intersections, tile-clipped endpoints, slight
  // coordinate drift) are still detected even when vertices don't align exactly.
  const INTERSECT_TOL_M = 20;
  const MAX_INTERSECTION_FROM_PIN_M = 250;

  const minDistVertexToLine = (plat: number, plon: number, ml: number[][]): number => {
    let best = Infinity;
    for (let j = 0; j < ml.length - 1; j++) {
      const [alon, alat] = ml[j];
      const [blon, blat] = ml[j + 1];
      const d = pointToSegmentMeters(plat, plon, alat, alon, blat, blon);
      if (d < best) best = d;
    }
    return best;
  };

  const candidates: { name: string; distToPin: number }[] = [];
  for (const [name, lines] of linesByName) {
    if (isMainName(name)) continue;
    let closestIntersectionToPin = Infinity;

    // For each vertex V of the candidate: find its closest approach to any main-street line.
    // If within tolerance, treat V as an intersection point.
    for (const ls of lines) {
      for (const [vlon, vlat] of ls) {
        let minToMain = Infinity;
        for (const ml of mainLines) {
          const d = minDistVertexToLine(vlat, vlon, ml);
          if (d < minToMain) minToMain = d;
        }
        if (minToMain <= INTERSECT_TOL_M) {
          const dp = distanceMeters(lat, lon, vlat, vlon);
          if (dp < closestIntersectionToPin) closestIntersectionToPin = dp;
        }
      }
    }

    // Reverse pass: main-street vertices approaching the candidate road (catches
    // the case where candidate has sparse vertices but main has dense ones).
    for (const ml of mainLines) {
      for (const [vlon, vlat] of ml) {
        let minToCand = Infinity;
        for (const ls of lines) {
          const d = minDistVertexToLine(vlat, vlon, ls);
          if (d < minToCand) minToCand = d;
        }
        if (minToCand <= INTERSECT_TOL_M) {
          const dp = distanceMeters(lat, lon, vlat, vlon);
          if (dp < closestIntersectionToPin) closestIntersectionToPin = dp;
        }
      }
    }

    // True segment crossings (for cases with no shared vertices at all).
    for (const ls of lines) {
      for (let i = 0; i < ls.length - 1; i++) {
        const [bx1, by1] = ls[i];
        const [bx2, by2] = ls[i + 1];
        for (const ml of mainLines) {
          for (let j = 0; j < ml.length - 1; j++) {
            const [ax1, ay1] = ml[j];
            const [ax2, ay2] = ml[j + 1];
            const p = segIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2);
            if (!p) continue;
            const d = distanceMeters(lat, lon, p[1], p[0]);
            if (d < closestIntersectionToPin) closestIntersectionToPin = d;
          }
        }
      }
    }

    if (closestIntersectionToPin < MAX_INTERSECTION_FROM_PIN_M) {
      candidates.push({ name, distToPin: closestIntersectionToPin });
    }
  }

  if (candidates.length === 0) {
    console.warn(`[geocode] No crossing street found for "${mainName}"`);
    return null;
  }

  candidates.sort((a, b) => a.distToPin - b.distToPin);
  console.log(`[geocode] Crossing streets of "${mainName}": ${candidates.slice(0, 4).map((c) => `${c.name} (${Math.round(c.distToPin)}m)`).join(", ")}`);
  return candidates[0].name;
}

// ───── Overpass fallback (original committed implementation) ─────
// Used when Mapbox returns null. POST to the canonical overpass-api.de endpoint;
// public mirrors throttle GET aggressively and rotating mirrors just multiplies
// our visible traffic without helping. Generous timeout because Overpass is slow
// but reliable when not throttled.
// Track Overpass slot availability so we fail fast when we know we'll be rejected.
// See https://dev.overpass-api.de/overpass-doc/en/preface/commons.html (slot model)
const OVERPASS_UA = "LADOT-Reporter/1.0 (neighborhood abandoned-vehicle reporting)";
let slotStatus: { available: number; checkedAt: number } | null = null;
async function overpassSlotsAvailable(): Promise<number> {
  const now = Date.now();
  if (slotStatus && now - slotStatus.checkedAt < 30_000) return slotStatus.available;
  try {
    const res = await fetch("https://overpass-api.de/api/status", {
      headers: { "User-Agent": OVERPASS_UA },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      slotStatus = { available: 0, checkedAt: now };
      return 0;
    }
    const text = await res.text();
    const m = text.match(/(\d+)\s+slots available now\./);
    const n = m ? parseInt(m[1], 10) : 0;
    slotStatus = { available: n, checkedAt: now };
    return n;
  } catch {
    slotStatus = { available: 0, checkedAt: now };
    return 0;
  }
}

async function findCrossStreetOverpass(lat: number, lon: number, mainStreet: string): Promise<string | null> {
  // Pre-flight: if 0 slots are free, the query will 429. Skip and let caller
  // fall back (Mapbox in prod, or just return null in dev/overpass-only mode).
  const slots = await overpassSlotsAvailable();
  if (slots <= 0) {
    console.warn(`[geocode] Overpass: 0 slots available — skipping request`);
    return null;
  }
  console.log(`[geocode] Overpass: ${slots} slot(s) available`);

  // Get ALL named highways near the pin + their nodes in one query. Then pick
  // the geometrically-closest way as "main" — using OSM's own name. This avoids
  // every Nominatim-vs-OSM name mismatch that the old exact-match query hit.
  // bbox-filter ~200m square around the pin; Overpass indexes bbox efficiently.
  // ~0.0018° lat ≈ 200m, ~0.0022° lon at LA latitude ≈ 200m.
  const BBOX_HALF_LAT = 0.0018;
  const BBOX_HALF_LON = 0.0022;
  const south = lat - BBOX_HALF_LAT;
  const north = lat + BBOX_HALF_LAT;
  const west = lon - BBOX_HALF_LON;
  const east = lon + BBOX_HALF_LON;

  // Explicit [timeout][maxsize] signals polite resource use; server admission
  // requires declared cost ≤ half of remaining budget, so small values help.
  // 10 MB maxsize is plenty for 1 bbox of named highways.
  const query = `[out:json][timeout:5][maxsize:10000000];(way(${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)})["highway"]["name"];>;);out body;`;
  const VALID_HIGHWAY_CLASSES = new Set([
    "primary", "secondary", "tertiary", "residential", "unclassified",
    "living_street", "trunk", "primary_link", "secondary_link", "tertiary_link",
    "trunk_link", "motorway", "motorway_link",
  ]);

  console.log(`[geocode] Overpass query: ${query}`);

  const t0 = Date.now();
  // GET (not POST) so Next.js fetch cache + Netlify edge cache can dedupe
  // identical bbox queries. Server treats GET and POST identically.
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": OVERPASS_UA },
      signal: AbortSignal.timeout(20000),
      next: { revalidate: 3600 },
    });
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`[geocode] Overpass fetch failed after ${ms}ms: ${err}`);
    return null;
  }
  const ms = Date.now() - t0;
  if (!res.ok) {
    console.error(`[geocode] Overpass HTTP ${res.status} after ${ms}ms`);
    return null;
  }
  console.log(`[geocode] Overpass POST ok in ${ms}ms`);

  const data = await res.json();
  type El = { type: string; id: number; tags?: { name?: string; highway?: string }; nodes?: number[]; lat?: number; lon?: number };

  // Build way + node lookup tables, filtering road classes that aren't real cross streets.
  const ways = new Map<number, { name: string; nodes: number[] }>();
  for (const el of data.elements as El[]) {
    if (el.type !== "way" || !el.tags?.name || !el.nodes) continue;
    if (el.tags.highway && !VALID_HIGHWAY_CLASSES.has(el.tags.highway)) continue;
    ways.set(el.id, { name: el.tags.name, nodes: el.nodes });
  }
  const nodes = new Map<number, { lat: number; lon: number }>();
  for (const el of data.elements as El[]) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }
  if (ways.size === 0) {
    console.warn(`[geocode] Overpass: 0 named ways within 500m of pin`);
    return null;
  }

  // Pick the main way by proximity: shortest perpendicular distance from pin
  // to any of its segments. This uses OSM's own `name` tag, so no Nominatim
  // exact-match problem.
  const wayDistance = (nodeIds: number[]): number => {
    let best = Infinity;
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const a = nodes.get(nodeIds[i]);
      const b = nodes.get(nodeIds[i + 1]);
      if (!a || !b) continue;
      const d = pointToSegmentMeters(lat, lon, a.lat, a.lon, b.lat, b.lon);
      if (d < best) best = d;
    }
    return best;
  };

  const ranked: { id: number; name: string; dist: number }[] = [];
  for (const [id, w] of ways) {
    ranked.push({ id, name: w.name, dist: wayDistance(w.nodes) });
  }
  ranked.sort((a, b) => a.dist - b.dist);
  console.log(`[geocode] Overpass ranked ways: ${ranked.slice(0, 6).map((r) => `${r.name} (${Math.round(r.dist)}m)`).join(", ")}`);

  // Prefer Nominatim's street if it's in the ranked list (authoritative on
  // which road the pin sits on). Fall back to closest-by-distance.
  const mainNominatimNorm = normalizeStreetName(mainStreet);
  let chosen = ranked[0];
  if (mainNominatimNorm) {
    const match = ranked.find((r) => normalizeStreetName(r.name) === mainNominatimNorm);
    if (match) chosen = match;
  }
  const mainWay = ways.get(chosen.id);
  const mainName = chosen.name;
  if (!mainWay) return null;
  console.log(`[geocode] Overpass main street: "${mainName}" (Nominatim="${mainStreet}", closest="${ranked[0].name}")`);

  // Index: node id → set of way ids that use it (for O(1) intersection lookup).
  const nodeToWays = new Map<number, Set<number>>();
  for (const [wid, w] of ways) {
    for (const nid of w.nodes) {
      let set = nodeToWays.get(nid);
      if (!set) { set = new Set(); nodeToWays.set(nid, set); }
      set.add(wid);
    }
  }

  // Walk the main way's nodes; any OTHER way touching one of them is a real
  // OSM intersection at that node. Exclude by normalized name so the same
  // street split into multiple OSM ways isn't treated as its own crossing.
  const mainNameNorm = normalizeStreetName(mainName);
  const crossByName = new Map<string, number>(); // name → min distance to pin
  for (const nid of mainWay.nodes) {
    const wids = nodeToWays.get(nid);
    if (!wids) continue;
    for (const wid of wids) {
      if (wid === chosen.id) continue;
      const w = ways.get(wid);
      if (!w) continue;
      const n = normalizeStreetName(w.name);
      if (n === mainNameNorm || n === mainNominatimNorm) continue;
      const node = nodes.get(nid);
      if (!node) continue;
      const d = distanceMeters(lat, lon, node.lat, node.lon);
      const prev = crossByName.get(w.name);
      if (prev === undefined || d < prev) crossByName.set(w.name, d);
    }
  }

  if (crossByName.size === 0) {
    console.warn(`[geocode] Overpass: no intersections found for "${mainName}"`);
    return null;
  }

  const crosses = [...crossByName.entries()].sort((a, b) => a[1] - b[1]);
  console.log(`[geocode] Overpass crossings of "${mainName}": ${crosses.slice(0, 4).map(([n, d]) => `${n} (${Math.round(d)}m)`).join(", ")}`);
  return crosses[0][0];
}

// ───── Dispatcher ─────
// Production: Mapbox first, Overpass fallback on failure.
// Local dev: respects ?provider=mapbox|overpass|auto query param for A/B testing.
type Provider = "mapbox" | "overpass" | "auto";

async function findCrossStreet(
  lat: number, lon: number, mainStreet: string, token: string, provider: Provider,
): Promise<{ cross: string | null; source: string }> {
  if (provider === "overpass") {
    const cross = await findCrossStreetOverpass(lat, lon, mainStreet);
    return { cross, source: "overpass" };
  }
  if (provider === "mapbox") {
    const cross = await findCrossStreetMapbox(lat, lon, mainStreet, token);
    return { cross, source: "mapbox" };
  }
  // auto: Mapbox primary, Overpass fallback.
  const mapboxResult = await findCrossStreetMapbox(lat, lon, mainStreet, token);
  if (mapboxResult) return { cross: mapboxResult, source: "mapbox" };
  console.log(`[geocode] Mapbox returned null → falling back to Overpass`);
  const overpassResult = await findCrossStreetOverpass(lat, lon, mainStreet);
  return { cross: overpassResult, source: overpassResult ? "overpass" : "none" };
}

// Compute hundred-block: 1234 → 1200
function toHundredBlock(houseNumber: string): string {
  const num = parseInt(houseNumber, 10);
  if (isNaN(num)) return "";
  return (Math.floor(num / 100) * 100).toString();
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const ip = getClientIp(req);

  // Overpass handles overflow when Mapbox cap is reached, so these limits
  // can be generous enough to cover natural usage (pin adjustments 3–4× per report).
  // rateLimit.ts auto-bypasses in local dev.
  const limitError = checkRateLimit("geocode", ip, {
    perHour: 60,
    perDay: 200,
    globalPerMinute: 30,
    globalPerDay: 2000,
  });
  if (limitError) {
    logEvent({ type: "geocode", ip, success: false, status: 429, meta: { rate_limited: true } });
    return NextResponse.json({ error: limitError }, { status: 429 });
  }

  try {
    const { latitude, longitude } = await req.json();
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json({ error: "Coordinates required" }, { status: 400 });
    }

    const geo = await reverseGeocode(latitude, longitude);
    const addr = geo?.address || {};
    const streetName = addr.road || "";
    const houseNumber = addr.house_number || "";
    const blockNumber = toHundredBlock(houseNumber);
    console.log(`[geocode] Nominatim → street="${streetName}" house="${houseNumber}" zip="${addr.postcode ?? ""}"`);

    // Provider selection. Dev can override via ?provider=mapbox|overpass for testing;
    // production ignores the param and always uses "auto" (Mapbox then Overpass).
    const paramProvider = req.nextUrl.searchParams.get("provider");
    let provider: Provider = "auto";
    if (process.env.NODE_ENV !== "production" && (paramProvider === "mapbox" || paramProvider === "overpass" || paramProvider === "auto")) {
      provider = paramProvider;
    }
    console.log(`[geocode] Provider: ${provider}`);

    const { cross: crossStreet, source: crossSource } = await findCrossStreet(
      latitude, longitude, streetName, process.env.MAPBOX_TOKEN ?? "", provider,
    );
    console.log(`[geocode] Cross street resolved to: "${crossStreet ?? "(null)"}" (via ${crossSource})`);

    // Normalize through LADOT so the client receives canonical ETIMS names.
    // This lets the form mark both fields as already-resolved (no "Not found" flicker, no auto-rewrite).
    const [streetLadot, crossLadot] = await Promise.all([
      streetName ? lookupStreet(streetName) : Promise.resolve([]),
      crossStreet ? lookupStreet(crossStreet) : Promise.resolve([]),
    ]);
    const resolvedStreet = streetLadot[0] || streetName;
    // Cross street is "resolved" only when LADOT confirms it. If the detector
    // returned nothing OR LADOT didn't recognize what it returned, leave it
    // blank and let the client surface a clear "resolution failed" message
    // instead of pre-filling an unmatched value that triggers "Not found".
    const crossResolved = !!(crossStreet && crossLadot[0]);
    const resolvedCross = crossResolved ? crossLadot[0] : "";
    console.log(`[geocode] LADOT-normalized: "${streetName}" → "${resolvedStreet}", "${crossStreet}" → "${resolvedCross || "(unresolved)"}"`);

    const ms = Date.now() - start;
    console.log(`[geocode] ${blockNumber} ${streetName} x ${crossStreet || "?"} zip=${addr.postcode?.substring(0, 5)} ${ms}ms`);
    logEvent({
      type: "geocode",
      ip,
      success: !!streetName,
      duration_ms: ms,
      meta: { hasStreet: !!streetName, hasCross: !!crossStreet, crossSource },
    });

    return NextResponse.json({
      zipCode: addr.postcode?.substring(0, 5) || "",
      blockNumber,
      streetName: resolvedStreet,
      crossStreet: resolvedCross,
      crossResolved,
      fullAddress: geo?.display_name || "",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[geocode] error: ${message}`);
    logEvent({ type: "error", error: message, meta: { source: "geocode" } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
