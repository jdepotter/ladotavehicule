# LADOT Abandoned Vehicle Reporter

A small Next.js app for neighborhood residents to report abandoned vehicles to
[LADOT ETIMS](https://wmq1.etimspayments.com). The user snaps a photo, the app
extracts plate / make / color / body style via AI, detects the location from
GPS or a draggable map pin, and submits the complaint form on the user's
behalf.

---

## Stack

- **Next.js 16** (App Router, Turbopack dev)
- **React 19**
- **TypeScript**
- Deployed on **Netlify** (via `@netlify/plugin-nextjs`)
- Event logging to **Supabase** (Postgres, optional)

No authentication — it's shared via URL to a trusted neighborhood group and
relies on rate limiting + server-side caps to prevent abuse.

---

## Getting started

```bash
npm ci
cp .env.example .env.local   # fill in API keys (see below)
npm run dev                  # http://localhost:8087
```

### Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `PLATE_RECOGNIZER_TOKEN` | Server | Primary plate OCR (2.5k/mo free) |
| `GEMINI_API_KEY` | Server | Vehicle color/make/style vision model |
| `GEMINI_MODELS` | Server | Comma-separated fallback list (default: `gemini-3.1-flash-lite-preview,gemini-2.5-flash,gemini-2.0-flash`) |
| `MAPBOX_TOKEN` | Server | Vector-tile cross-street detection |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Client | Interactive Mapbox GL map |
| `NEXT_PUBLIC_GEO_PROVIDER` | Client (dev) | Optional: `mapbox` / `overpass` / `auto` for geocode provider testing |
| `SUPABASE_URL` | Server | Event logging (optional) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Event logging (optional) |

See [`.env.example`](./.env.example) for full comments and signup links.

---

## API routes

| Route | Purpose | Rate limit (prod, per IP) |
|---|---|---|
| `POST /api/analyze` | Image → plate + vehicle attrs | 10/hr, 40/day |
| `POST /api/geocode` | Coords → street + cross street + zip | 60/hr, 200/day |
| `GET /api/street-lookup` | LADOT street autocomplete | 120/hr, 600/day |
| `POST /api/proxy` | Submit complaint to LADOT ETIMS | 5/hr, 15/day |

All routes also enforce global per-minute/per-day caps and share an in-memory
rate limiter in [`src/lib/rateLimit.ts`](./src/lib/rateLimit.ts). Local dev
bypasses limits automatically (`NODE_ENV !== "production"`).

---

## Image scanning pipeline (`/api/analyze`)

The client uploads a base64 JPEG. The server runs two AI providers
**in parallel** and merges results:

### 1. PlateRecognizer (primary plate OCR)

- Endpoint: `api.platerecognizer.com/v1/plate-reader/`
- Input: image + `regions=us`
- Output: plate text, plate state, confidence score
- Retries once after 1.5s on HTTP 429
- Returns `{ license_plate, plate_state, plate_confidence: "high" | "medium" | "low" }`

### 2. Gemini vision (color / make / style + fallback plate)

- Endpoint: `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Prompt constrains the response to a fixed JSON schema
- Iterates a model fallback list (`gemini-3.1-flash-lite-preview` → `2.5-flash` → `2.0-flash`)
- Retries each model up to 2× on 5xx only (4xx is terminal — auth/quota
  won't change between attempts)
- Output mapped to ETIMS color / make / body-style codes via fuzzy match
  in [`matchClosest`](./src/app/api/analyze/route.ts)

### Merging

- Plate: PlateRecognizer wins; Gemini is only used if PR returned nothing
- Color / make / style: Gemini is authoritative (PR doesn't know them)
- Final output uses ETIMS-canonical values (`COLORS`, `MAKES`, `STYLES` in
  [`src/lib/etimsCodes.ts`](./src/lib/etimsCodes.ts)) so the submit step can
  map them to the short codes the complaint form expects

### Abuse guards

- Body size cap (~6 MB pre-parse via `Content-Length`)
- `imageBase64` length double-check post-parse
- Per-IP and global rate limits
- Silent boot warning if either API key is missing

---

## Geolocation resolution (`/api/geocode`)

Given lat/lon, returns `{ streetName, crossStreet, blockNumber, zipCode }`,
all normalized to ETIMS-canonical names so the complaint form accepts them
verbatim.

### Step 1: Reverse geocode (Nominatim)

- Endpoint: `nominatim.openstreetmap.org/reverse`
- 4 s abort
- Returns the street the pin sits on, the house number, and the zip
- House number → hundred-block (`1234` → `1200`) for ETIMS

### Step 2: Find the cross street (two-provider fallback)

Nominatim doesn't know about intersections. The app implements its own
cross-street detector with **two providers**, dispatched in
[`findCrossStreet`](./src/app/api/geocode/route.ts):

#### Provider A — Mapbox vector tiles (primary)

1. Convert pin coords to tile coords at zoom 15 (~1 km/tile at LA latitude).
2. Fetch the 3×3 block of surrounding `mapbox-streets-v8` MVT tiles in parallel.
3. Parse with `@mapbox/vector-tile` + `pbf` → GeoJSON LineStrings in WGS84.
4. Rank streets by **perpendicular distance** from the pin to the nearest
   line segment (not vertex — long straight roads have few vertices).
5. Pick `mainStreet`: prefer the Nominatim match (normalized, so "Airport
   Boulevard" matches "Airport Blvd"); fall back to closest by distance.
6. For each other candidate, find intersections with the main street via:
   - shared vertex within 20 m tolerance (standard Mapbox intersection
     model — roads split at intersection nodes, with some tile-boundary drift)
   - true segment-segment crossing (mid-segment overpasses, rare)
7. Return the candidate whose nearest intersection to the pin wins, capped
   at 250 m so distant "intersections" in sparse areas aren't picked.

Cost protection:
- **7-day** Next.js fetch cache on each tile URL → same neighborhood = zero
  upstream traffic after the first request
- Global daily hard cap of **5,000 tile fetches** (≈ 75 % of Mapbox free
  tier) — when hit, tiles return empty and the dispatcher falls back to
  Overpass automatically

#### Provider B — Overpass API (fallback)

Used when Mapbox returns `null`, or when `?provider=overpass` is set in dev.

1. Pre-flight to `overpass-api.de/api/status` (cached 30 s) — if 0 slots
   available, skip the query and return `null` immediately. Avoids burning
   time on guaranteed 429s.
2. Single **bbox** query (~200 m square; bbox is indexed, much faster than
   `around:`), returning all named highways and their nodes. Declares
   `[timeout:5][maxsize:10000000]` — small explicit budget increases server
   admission rate.
3. Filter out non-street road classes (`service`, `footway`, `path`, …) in JS.
4. Rank ways by point-to-segment distance to pin.
5. Apply the same Nominatim-preference → main-street selection as Mapbox.
6. Walk the main way's node list; any other way sharing a node is a real
   OSM intersection at that node.
7. Return the intersection closest to the pin.

Identifies politely with a `User-Agent: LADOT-Reporter/1.0 …` header. Uses
GET with `next: { revalidate: 3600 }` so repeat bbox queries are edge-cached.

### Step 3: LADOT normalization

Whatever the detector returns is finally run through
[`lookupStreet`](./src/lib/streetLookup.ts) (the LADOT ETIMS autocomplete).
If LADOT recognizes the name → ETIMS-canonical form is returned.
If it doesn't → `crossResolved: false` and the UI clears the cross-street
field and shows *"Cross street resolution failed — please type manually."*

### Dev testing both providers

```
NEXT_PUBLIC_GEO_PROVIDER=mapbox npm run dev    # Mapbox only
NEXT_PUBLIC_GEO_PROVIDER=overpass npm run dev  # Overpass only
npm run dev                                    # auto (Mapbox → Overpass)
```

Server-side the param is only honoured when `NODE_ENV !== "production"`.

---

## Submit pipeline (`/api/proxy`)

LADOT's ETIMS form requires session cookies + a CSRF-like `TokenKey`
extracted from the page HTML. The route:

1. GETs the complaint form, extracts `JSESSIONID` + `TokenKey`.
2. Maps the vehicle data through [`src/lib/etimsCodes.ts`](./src/lib/etimsCodes.ts)
   to ETIMS short codes (e.g. "TOYOTA" → "TOYT", "PASSENGER CAR" → "PA").
3. POSTs the form with a browser-like User-Agent.
4. Parses the response HTML to detect success ("Thank you for submitting")
   vs rejections (`<li class="error">` messages).

Input validation clamps plate (8 chars, `[A-Z0-9]` only), street (60),
comments (500), etc. before hitting LADOT — avoids burning ETIMS round-trips
on obvious junk.

A **per-minute global cap of 10** protects LADOT from any burst we might
accidentally send.

---

## Event logging (Supabase)

Fire-and-forget inserts via [`src/lib/logger.ts`](./src/lib/logger.ts).
Silent no-op if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` aren't set.

Schema:

```sql
create table events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  type text not null,        -- analyze | plate_reader | gemini |
                             -- street_lookup | geocode | submit | error
  ip text,
  success boolean,
  status int,
  duration_ms int,
  error text,
  meta jsonb
);
create index events_created_at_idx on events (created_at desc);
create index events_type_idx on events (type);
create index events_ip_idx on events (ip);
```

Useful queries:

```sql
-- Top IPs by submissions this week
select ip, count(*) from events
where type='submit' and created_at > now() - interval '7 days'
group by ip order by 2 desc;

-- Rate-limit rejections
select type, ip, count(*) from events
where status = 429 and created_at > now() - interval '24 hours'
group by 1,2 order by 3 desc;

-- Mapbox vs Overpass split
select meta->>'crossSource' as source, count(*) from events
where type='geocode' group by 1;
```

---

## Project layout

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/        # image → plate + vehicle attrs
│   │   ├── geocode/        # coords → street + cross street
│   │   ├── proxy/          # submit to LADOT
│   │   └── street-lookup/  # LADOT autocomplete
│   ├── layout.tsx
│   ├── page.tsx
│   └── privacy/page.tsx
├── components/
│   ├── PhotoStep.tsx       # camera capture
│   ├── AnalyzeStep.tsx     # calls /api/analyze
│   ├── ReviewStep.tsx      # editable form + map pin
│   ├── ResultStep.tsx      # submission confirmation
│   ├── StreetInput.tsx     # autocomplete + resolved-value UX
│   ├── ComboBox.tsx
│   └── InlineMap.tsx       # Mapbox GL JS map
└── lib/
    ├── etimsCodes.ts       # ETIMS short-code maps + display lists
    ├── streetLookup.ts     # LADOT autocomplete + normalizer
    ├── rateLimit.ts        # in-memory IP + global limiter
    └── logger.ts           # Supabase event logger
```

---

## Operational notes

- **Netlify free-tier functions have a 10 s timeout.** Overpass queries
  typically complete in 0.2–3 s but can queue longer. Mapbox stays primary
  so Overpass latency rarely matters in production.
- **In-memory rate limiter resets per serverless cold-start.** Acceptable at
  neighborhood scale but not against a determined abuser. Upgrade path:
  back with Netlify Blobs or Upstash Redis.
- **Grammarly injects body attributes** causing hydration warnings in dev;
  `<body suppressHydrationWarning>` in [`src/app/layout.tsx`](./src/app/layout.tsx) silences
  them without masking real issues.
- **Sensitive logs** — the app logs IPs and plates to Supabase. Privacy
  policy in [`/privacy`](./src/app/privacy/page.tsx) needs to reflect your
  deployment's actual retention policy.
