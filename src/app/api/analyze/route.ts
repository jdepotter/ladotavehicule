import { NextRequest, NextResponse } from "next/server";

// Valid ETIMS form values
const COLORS = ['BEIGE','BLACK','BLUE','BROWN','COPPER','GOLD','GREEN','GREY','MAROON','ORANGE','PURPLE','RED','SILVER','TAN','TURQUOISE','UNKNOWN','WHITE','YELLOW'];
const MAKES = ['ACURA','ALFA ROMEO','ASTON MARTIN','AUBURN','AUDI','AUSTIN HEALY','AVANTI','BENTLEY','BMW','BUGATTI','BUICK','CADILLAC','CHECKER','CHEVROLET','CHRYSLER','CITROEN','CUSHMAN','DAEWOO','DAIHATSU','DATSUN','DODGE','DUESENBERG','EAGLE','FERRARI','FIAT','FORD','FREIGHTLINER','GENERAL MOTORS','GEO','GRUMMAN','HARLEY-DAVIDSON','HONDA','HUMMER','HYUNDAI','INDIAN','INFINITI','INTERNATIONAL','ISUZU','IVECCO','JAGUAR','JEEP','JENSEN','KAWASAKI','KENWORTH','KIA','LAMBORGHINI','LANCIA','LAND ROVER','LEXUS','LINCOLN','MACK','MASERATI','MAZDA','MERCEDES BENZ','MERCURY','MERKUR','MINI COOPER','MITSUBISHI','NISSAN','OLDSMOBILE','OTHER','PACKARD','PETERBILT','PEUGOT','PLYMOUTH','PONTIAC','PORSCHE','RANGE ROVER','RENAULT','REO','ROLLS ROYCE','SAAB','SATURN','SPECIAL CONSTRUCTION','STERLING','STUDEBAKER','SUBARU','SUZUKI','TESLA','TOYOTA','TRIUMPH','VOLKSWAGEN','VOLVO','WHITE / UTILITY','WINNEBAGO','YAMAHA'];
const STYLES = ['BOAT ON TRAILER','BUS','COMMERCIAL','LIMOUSINE','MOTOR CYCLE','MOTOR HOME','PASSENGER CAR','PICK-UP TRUCK','TRAILER','TRUCK','VAN'];
const STATES_ABBR = ['AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','MA','MD','ME','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

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
  const contains = options.find((o) => upper.includes(o) || o.includes(upper));
  if (contains) return contains;
  if (upper === "SUV") return "PASSENGER CAR";
  const words = upper.split(/\s+/);
  const partial = options.find((o) => words.some((w) => w.length > 2 && o.includes(w)));
  if (partial) return partial;
  return options.includes("OTHER") ? "OTHER" : options.includes("UNKNOWN") ? "UNKNOWN" : options[0];
}

function validateState(state: string | null | undefined): string | null {
  if (!state) return null;
  const upper = state.toUpperCase().trim().replace("US-", "");
  return STATES_ABBR.includes(upper) ? upper : null;
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
          { text: GEMINI_PROMPT },
        ],
      }],
    }),
  });

  if (!res.ok) {
    console.error(`[analyze] Gemini error: ${res.status}`);
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

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "Image required" }, { status: 400 });
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
      try { prResult = await callPlateRecognizer(prToken, imageBase64); }
      catch { warnings.push("Plate Recognizer failed"); }
    }

    // Step 2: Gemini for color/make/style
    let geminiResult: GeminiResult | null = null;
    if (geminiKey) {
      try { geminiResult = await callGemini(geminiKey, imageBase64); }
      catch { warnings.push("Gemini unavailable — color/make/style may be incomplete"); }
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
