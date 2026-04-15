import { NextRequest, NextResponse } from "next/server";

// Reverse geocode using Nominatim
async function reverseGeocode(lat: number, lon: number) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
    { headers: { "User-Agent": "LADOT-Reporter/1.0" }, signal: AbortSignal.timeout(4000) },
  );
  if (!res.ok) return null;
  return res.json();
}

// Find the nearest cross street that actually intersects with the main street.
// Uses the exact street name to filter the Overpass query so we only get
// streets that share a node with THAT specific road.
async function findCrossStreet(lat: number, lon: number, mainStreet: string): Promise<string | null> {
  if (!mainStreet) return null;

  // Escape quotes in street name for Overpass
  const escaped = mainStreet.replace(/"/g, '\\"');

  const query = `
    [out:json][timeout:5];
    way(around:500,${lat},${lon})["highway"]["name"="${escaped}"]->.mystreet;
    node(w.mystreet)->.mynodes;
    way(bn.mynodes)["highway"]["name"]->.crossing;
    (.crossing; - .mystreet;)->.otherstreets;
    .otherstreets out body;
    node(w.otherstreets)(w.mystreet);
    out;
  `;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    type El = { type: string; id: number; tags?: { name?: string }; nodes?: number[]; lat?: number; lon?: number };

    // Collect crossing ways
    const ways = new Map<number, { name: string; nodes: Set<number> }>();
    for (const el of data.elements as El[]) {
      if (el.type === "way" && el.tags?.name) {
        ways.set(el.id, { name: el.tags.name, nodes: new Set(el.nodes || []) });
      }
    }

    // Collect intersection node coordinates
    const nodes = new Map<number, { lat: number; lon: number }>();
    for (const el of data.elements as El[]) {
      if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
        nodes.set(el.id, { lat: el.lat, lon: el.lon });
      }
    }

    if (ways.size === 0) return null;

    // For each crossing street, find its nearest intersection node to the pin
    const mainLower = mainStreet.toLowerCase();
    const results: { name: string; dist: number }[] = [];

    for (const [, way] of ways) {
      if (way.name.toLowerCase() === mainLower) continue;

      let bestDist = Infinity;
      for (const nid of way.nodes) {
        const node = nodes.get(nid);
        if (!node) continue;
        const dist = Math.sqrt(
          Math.pow((node.lat - lat) * 111000, 2) +
          Math.pow((node.lon - lon) * 111000 * Math.cos(lat * Math.PI / 180), 2),
        );
        if (dist < bestDist) bestDist = dist;
      }
      if (bestDist < Infinity) results.push({ name: way.name, dist: bestDist });
    }

    if (results.length === 0) return null;

    results.sort((a, b) => a.dist - b.dist);
    console.log(`[geocode] Cross streets of "${mainStreet}": ${results.slice(0, 4).map((r) => `${r.name} (${Math.round(r.dist)}m)`).join(", ")}`);
    return results[0].name;
  } catch (err) {
    console.error(`[geocode] Overpass error: ${err}`);
    return null;
  }
}

// Compute hundred-block: 1234 → 1200
function toHundredBlock(houseNumber: string): string {
  const num = parseInt(houseNumber, 10);
  if (isNaN(num)) return "";
  return (Math.floor(num / 100) * 100).toString();
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const { latitude, longitude } = await req.json();
    if (!latitude || !longitude) {
      return NextResponse.json({ error: "Coordinates required" }, { status: 400 });
    }

    // Step 1: Reverse geocode to get street name
    const geo = await reverseGeocode(latitude, longitude);
    const addr = geo?.address || {};
    const streetName = addr.road || "";
    const houseNumber = addr.house_number || "";
    const blockNumber = toHundredBlock(houseNumber);

    // Step 2: Find nearest cross street that actually intersects this street
    const crossStreet = await findCrossStreet(latitude, longitude, streetName);

    const ms = Date.now() - start;
    console.log(`[geocode] ${blockNumber} ${streetName} x ${crossStreet || "?"} zip=${addr.postcode?.substring(0, 5)} ${ms}ms`);

    return NextResponse.json({
      zipCode: addr.postcode?.substring(0, 5) || "",
      blockNumber,
      streetName,
      crossStreet: crossStreet || "",
      fullAddress: geo?.display_name || "",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[geocode] error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
