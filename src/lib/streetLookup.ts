import { ETIMS_BASE } from "./etimsCodes";

// Normalize a street name so variants match across data sources
// (Nominatim vs OSM/Mapbox vs LADOT). Lowercase, strip punctuation, strip
// leading directional, expand trailing suffix to canonical long form.
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

export function normalizeStreetName(name: string): string {
  const tokens = name.toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  while (tokens.length && /^(n|s|e|w|north|south|east|west)$/.test(tokens[0])) tokens.shift();
  if (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (SUFFIX_EXPAND[last]) tokens[tokens.length - 1] = SUFFIX_EXPAND[last];
  }
  return tokens.join(" ");
}

const SUFFIX_MAP: Record<string, string> = {
  avenue: "AVE", street: "ST", boulevard: "BLVD", drive: "DR", place: "PL",
  court: "CT", lane: "LN", road: "RD", way: "WAY", circle: "CIR",
  terrace: "TER", parkway: "PKWY",
};

const DIR_MAP: Record<string, string> = {
  north: "N", south: "S", east: "E", west: "W",
  n: "N", s: "S", e: "E", w: "W",
};

export function searchTerms(name: string): string[] {
  const terms: string[] = [];
  const trimmed = name.trim();
  if (!trimmed) return terms;
  terms.push(trimmed);

  const core = trimmed.replace(/^(north|south|east|west|[nsew])\s+/i, "").trim();
  if (core !== trimmed) terms.push(core);

  for (const [full, abbr] of Object.entries(SUFFIX_MAP)) {
    const re = new RegExp(`\\s+${full}$`, "i");
    if (re.test(core)) {
      terms.push(core.replace(re, ` ${abbr}`));
      terms.push(core.replace(re, ""));
      break;
    }
  }

  const firstWord = core.split(/\s+/)[0];
  if (firstWord.length >= 2 && !terms.includes(firstWord)) terms.push(firstWord);

  return [...new Set(terms)];
}

export function extractDirection(name: string): string | null {
  const match = name.match(/^(north|south|east|west|[nsew])\s+/i);
  if (!match) return null;
  return DIR_MAP[match[1].toLowerCase()] || null;
}

async function fetchETIMS(term: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${ETIMS_BASE}/pbw/getAutocompleteAction.doh?term=${encodeURIComponent(term)}&client=17&lkname=hh_streets`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Search LADOT autocomplete with fallbacks. Returns ordered results, best first.
export async function lookupStreet(name: string): Promise<string[]> {
  const direction = extractDirection(name);
  const terms = searchTerms(name);
  for (const t of terms) {
    const results = await fetchETIMS(t);
    if (results.length === 0) continue;
    if (direction) {
      results.sort((a, b) => {
        const aHas = a.endsWith(` ${direction}`) ? 0 : 1;
        const bHas = b.endsWith(` ${direction}`) ? 0 : 1;
        return aHas - bHas;
      });
    }
    return results;
  }
  return [];
}
