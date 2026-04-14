import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logEvent } from "@/lib/logger";

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
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const term = req.nextUrl.searchParams.get("term");
  if (!term || term.length < 2) {
    return NextResponse.json([]);
  }

  const ip = getClientIp(req);
  const limitError = checkRateLimit("street-lookup", ip, {
    perHour: 120,
    perDay: 600,
    globalPerMinute: 60,
    globalPerDay: 10000,
  });
  if (limitError) {
    logEvent({ type: "street_lookup", ip, success: false, status: 429, meta: { rate_limited: true } });
    return NextResponse.json({ error: limitError }, { status: 429 });
  }

  try {
    const direction = extractDirection(term);
    const terms = searchTerms(term);

    for (const t of terms) {
      const results = await fetchETIMS(t);
      if (results.length === 0) continue;

      if (direction) {
        results.sort((a, b) => {
          const aHasDir = a.endsWith(` ${direction}`) ? 0 : 1;
          const bHasDir = b.endsWith(` ${direction}`) ? 0 : 1;
          return aHasDir - bHasDir;
        });
      }

      logEvent({
        type: "street_lookup",
        ip,
        success: true,
        duration_ms: Date.now() - start,
        meta: { term, matched: results.length },
      });
      return NextResponse.json(results);
    }

    logEvent({
      type: "street_lookup",
      ip,
      success: true,
      duration_ms: Date.now() - start,
      meta: { term, matched: 0 },
    });
    return NextResponse.json([]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent({ type: "error", error: message, meta: { source: "street_lookup" } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
