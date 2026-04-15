import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logEvent } from "@/lib/logger";
import { lookupStreet } from "@/lib/streetLookup";

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
    const results = await lookupStreet(term);
    logEvent({
      type: "street_lookup",
      ip,
      success: true,
      duration_ms: Date.now() - start,
      meta: { term, matched: results.length },
    });
    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent({ type: "error", error: message, meta: { source: "street_lookup" } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
