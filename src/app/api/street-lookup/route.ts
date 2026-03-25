import { NextRequest, NextResponse } from "next/server";

const ETIMS_BASE = "https://wmq1.etimspayments.com";

const SUFFIX_MAP: Record<string, string> = {
  avenue: "AVE", street: "ST", boulevard: "BLVD", drive: "DR", place: "PL",
  court: "CT", lane: "LN", road: "RD", way: "WAY", circle: "CIR",
  terrace: "TER", parkway: "PKWY",
};

const DIR_MAP: Record<string, string> = {
  north: "N", south: "S", east: "E", west: "W",
  n: "N", s: "S", e: "E", w: "W",
};

// Generate search terms from a street name
// "West 82nd Street" → ["West 82nd Street", "82nd Street", "82nd ST", "82nd"]
function searchTerms(name: string): string[] {
  const terms: string[] = [];
  const trimmed = name.trim();
  if (!trimmed) return terms;

  terms.push(trimmed);

  // Strip direction prefix
  const core = trimmed.replace(/^(north|south|east|west|[nsew])\s+/i, "").trim();
  if (core !== trimmed) terms.push(core);

  // Replace full suffix with abbreviation
  for (const [full, abbr] of Object.entries(SUFFIX_MAP)) {
    const re = new RegExp(`\\s+${full}$`, "i");
    if (re.test(core)) {
      terms.push(core.replace(re, ` ${abbr}`));
      terms.push(core.replace(re, ""));
      break;
    }
  }

  // First word only (e.g. "82nd" or "Osage")
  const firstWord = core.split(/\s+/)[0];
  if (firstWord.length >= 2 && !terms.includes(firstWord)) terms.push(firstWord);

  return [...new Set(terms)];
}

// Extract direction from original name
function extractDirection(name: string): string | null {
  const match = name.match(/^(north|south|east|west|[nsew])\s+/i);
  if (!match) return null;
  return DIR_MAP[match[1].toLowerCase()] || null;
}

async function fetchETIMS(term: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${ETIMS_BASE}/pbw/getAutocompleteAction.doh?term=${encodeURIComponent(term)}&client=17&lkname=hh_streets`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("term");
  if (!term || term.length < 2) {
    return NextResponse.json([]);
  }

  const direction = extractDirection(term);
  const terms = searchTerms(term);

  // Try each search term until we get results
  for (const t of terms) {
    const results = await fetchETIMS(t);
    if (results.length === 0) continue;

    // If we have a direction, sort results to put the matching direction first
    if (direction) {
      results.sort((a, b) => {
        const aHasDir = a.endsWith(` ${direction}`) ? 0 : 1;
        const bHasDir = b.endsWith(` ${direction}`) ? 0 : 1;
        return aHasDir - bHasDir;
      });
    }

    return NextResponse.json(results);
  }

  return NextResponse.json([]);
}
