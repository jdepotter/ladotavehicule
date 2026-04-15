import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logEvent } from "@/lib/logger";
import { COLORS, MAKES, STYLES, US_STATES } from "@/lib/etimsCodes";

// Warn once at module load if keys are missing so misconfigs don't fail silently.
if (!process.env.PLATE_RECOGNIZER_TOKEN) console.warn("[analyze] PLATE_RECOGNIZER_TOKEN not set");
if (!process.env.GEMINI_API_KEY) console.warn("[analyze] GEMINI_API_KEY not set");

const STYLE_MAP: Record<string, string> = {
  sedan: "PASSENGER CAR", coupe: "PASSENGER CAR", hatchback: "PASSENGER CAR",
  convertible: "PASSENGER CAR", wagon: "PASSENGER CAR", suv: "PASSENGER CAR",
  "suv-crossover": "PASSENGER CAR", crossover: "PASSENGER CAR",
  pickup: "PICK-UP TRUCK", "pick-up": "PICK-UP TRUCK",
  van: "VAN", minivan: "VAN",
  truck: "TRUCK", bus: "BUS",
  motorcycle: "MOTOR CYCLE",
};

function matchClosest(value: string, options: string[]): string {
  if (!value) return "UNKNOWN";
  const upper = value.toUpperCase().trim();
  const exact = options.find((o) => o === upper);
  if (exact) return exact;
  // Require ≥3 chars for substring matches to avoid spurious hits (e.g. "VAN" in "CARAVAN").
  if (upper.length >= 3) {
    const contains = options.find((o) => o === upper || o.split(/\s+/).includes(upper));
    if (contains) return contains;
  }
  if (upper === "SUV") return "PASSENGER CAR";
  const words = upper.split(/\s+/).filter((w) => w.length >= 3);
  const partial = options.find((o) => words.some((w) => o.split(/\s+/).includes(w)));
  if (partial) return partial;
  return options.includes("OTHER") ? "OTHER" : options.includes("UNKNOWN") ? "UNKNOWN" : options[0];
}

function validateState(state: string | null | undefined): string | null {
  if (!state) return null;
  const upper = state.toUpperCase().trim().replace("US-", "");
  return US_STATES.includes(upper) ? upper : null;
}

// ─── Plate Recognizer ───────────────────────────────────────────────────────

interface PlateResult {
  license_plate: string | null;
  plate_state: string | null;
  plate_confidence: string;
}

async function callPlateRecognizer(token: string, imageBase64: string): Promise<PlateResult | null> {
  const formData = new URLSearchParams();
  formData.append("upload", `data:image/jpeg;base64,${imageBase64}`);
  formData.append("regions", "us");

  let res = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
    method: "POST",
    headers: { Authorization: `Token ${token}` },
    body: formData,
  });

  if (res.status === 429) {
    console.log("[analyze] PlateRecognizer rate limited, retrying in 1.5s");
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
      method: "POST",
      headers: { Authorization: `Token ${token}` },
      body: formData,
    });
  }

  if (!res.ok) {
    console.error(`[analyze] PlateRecognizer error: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const result = data.results?.[0];
  if (!result) return null;

  const plate = result.plate?.toUpperCase() || null;
  const plateScore = result.score || 0;
  const regionCode = result.region?.code || "";
  const state = regionCode.startsWith("us-") ? regionCode.slice(3).toUpperCase() : null;

  return {
    license_plate: plate,
    plate_state: validateState(state),
    plate_confidence: plateScore > 0.7 ? "high" : plateScore > 0.5 ? "medium" : "low",
  };
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

const GEMINI_PROMPT = `Identify the vehicle in this photo. Return ONLY valid JSON, no markdown:
{
  "color": "vehicle color in CAPS (BLACK, WHITE, SILVER, RED, BLUE, GREEN, GREY, BROWN, GOLD, BEIGE, TAN, MAROON, ORANGE, YELLOW, PURPLE, COPPER, TURQUOISE, or UNKNOWN)",
  "make": "manufacturer in CAPS (TOYOTA, HONDA, FORD, CHEVROLET, BMW, TESLA, NISSAN, HYUNDAI, KIA, SUBARU, MAZDA, LEXUS, etc.)",
  "style": "one of: PASSENGER CAR, PICK-UP TRUCK, VAN, TRUCK, SUV, MOTOR CYCLE, BUS, COMMERCIAL, MOTOR HOME, TRAILER, LIMOUSINE, BOAT ON TRAILER",
  "license_plate": "plate text in CAPS or null if not readable",
  "plate_state": "2-letter US state read from the plate, or null"
}`;

interface GeminiResult {
  color: string;
  make: string;
  style: string;
  license_plate: string | null;
  plate_state: string | null;
}

async function callGemini(apiKey: string, imageBase64: string): Promise<GeminiResult | null> {
  const models = (process.env.GEMINI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean))
    || ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "gemini-2.0-flash"];
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
        { text: GEMINI_PROMPT },
      ],
    }],
  });

  let res: Response | null = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
      );
      if (res.ok) break;
      // Only retry transient 5xx. 4xx (429 quota, 400 bad request, 403 auth) are terminal.
      if (res.status < 500) break;
      console.warn(`[analyze] Gemini ${model} ${res.status}, retry ${attempt + 1}/2`);
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
    if (res?.ok) break;
    // On 4xx (e.g. 429 quota), don't fall through to next model — same key, same quota.
    if (res && res.status < 500) break;
  }

  if (!res || !res.ok) {
    console.error(`[analyze] Gemini error: ${res?.status}`);
    return null;
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) return null;

  const raw = JSON.parse(text.replace(/```json|```/g, "").trim());
  return {
    color: matchClosest(raw.color, COLORS),
    make: matchClosest(raw.make, MAKES),
    style: STYLE_MAP[raw.style?.toLowerCase()] || matchClosest(raw.style, STYLES),
    license_plate: raw.license_plate?.toUpperCase() || null,
    plate_state: validateState(raw.plate_state),
  };
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const ip = getClientIp(req);
    const limitError = checkRateLimit("analyze", ip, {
      perHour: 10,
      perDay: 40,
      globalPerDay: 2000,
    });
    if (limitError) {
      logEvent({ type: "analyze", ip, success: false, status: 429, meta: { rate_limited: true } });
      return NextResponse.json({ error: limitError }, { status: 429 });
    }

    // Reject oversized payloads before parsing (image b64 + JSON overhead).
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_IMAGE_BYTES * 1.5) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const { imageBase64 } = await req.json();
    if (typeof imageBase64 !== "string" || !imageBase64) {
      return NextResponse.json({ error: "Image required" }, { status: 400 });
    }
    if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const prToken = process.env.PLATE_RECOGNIZER_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!prToken && !geminiKey) {
      return NextResponse.json({ error: "No API keys configured" }, { status: 500 });
    }

    const warnings: string[] = [];

    // Step 1: Plate Recognizer
    let prResult: PlateResult | null = null;
    if (prToken) {
      const t0 = Date.now();
      try { prResult = await callPlateRecognizer(prToken, imageBase64); }
      catch (e) {
        warnings.push("Plate Recognizer failed");
        logEvent({ type: "error", error: e instanceof Error ? e.message : String(e), meta: { source: "plate_reader" } });
      }
      logEvent({
        type: "plate_reader",
        ip,
        success: !!prResult,
        duration_ms: Date.now() - t0,
        meta: { plate: prResult?.license_plate, state: prResult?.plate_state },
      });
    }

    // Step 2: Gemini for color/make/style
    let geminiResult: GeminiResult | null = null;
    if (geminiKey) {
      const t0 = Date.now();
      try { geminiResult = await callGemini(geminiKey, imageBase64); }
      catch (e) {
        warnings.push("Gemini unavailable — color/make/style may be incomplete");
        logEvent({ type: "error", error: e instanceof Error ? e.message : String(e), meta: { source: "gemini" } });
      }
      logEvent({
        type: "gemini",
        ip,
        success: !!geminiResult,
        duration_ms: Date.now() - t0,
        meta: { color: geminiResult?.color, make: geminiResult?.make, style: geminiResult?.style },
      });
    }

    // Merge
    const plate = prResult?.license_plate || geminiResult?.license_plate || null;
    const plateState = prResult?.plate_state || geminiResult?.plate_state || null;
    const plateConfidence = prResult?.license_plate
      ? prResult.plate_confidence
      : geminiResult?.license_plate ? "medium" : "low";
    const color = geminiResult?.color || "UNKNOWN";
    const make = geminiResult?.make || "OTHER";
    const style = geminiResult?.style || "PASSENGER CAR";

    const sources: string[] = [];
    if (prResult?.license_plate) sources.push("pr");
    if (geminiResult) sources.push("gemini");

    const ms = Date.now() - start;
    console.log(`[analyze] plate=${plate} state=${plateState} color=${color} make=${make} sources=${sources.join("+")} ${ms}ms`);
    logEvent({
      type: "analyze",
      ip,
      success: true,
      duration_ms: ms,
      meta: { sources: sources.join("+") || "none", has_plate: !!plate },
    });

    return NextResponse.json({
      license_plate: plate,
      plate_state: plateState,
      plate_confidence: plateConfidence,
      color, make, style,
      source: sources.join("+") || "none",
      warnings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[analyze] error: ${message}`);
    logEvent({ type: "error", error: message, meta: { source: "analyze" } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
