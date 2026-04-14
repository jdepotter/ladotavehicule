import { NextRequest } from "next/server";

interface Limits {
  perHour: number;
  perDay: number;
  globalPerMinute?: number;
  globalPerDay: number;
}

interface Bucket {
  ipHits: Map<string, number[]>;
  globalTimestamps: number[];
  globalDay: string;
  globalCount: number;
}

const buckets = new Map<string, Bucket>();

function getBucket(name: string): Bucket {
  let b = buckets.get(name);
  if (!b) {
    b = { ipHits: new Map(), globalTimestamps: [], globalDay: "", globalCount: 0 };
    buckets.set(name, b);
  }
  return b;
}

export function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

export function checkRateLimit(name: string, ip: string, limits: Limits): string | null {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const b = getBucket(name);

  if (today !== b.globalDay) { b.globalDay = today; b.globalCount = 0; }
  if (b.globalCount >= limits.globalPerDay) {
    return "Daily capacity reached. Try again tomorrow.";
  }

  if (limits.globalPerMinute) {
    b.globalTimestamps = b.globalTimestamps.filter((t) => now - t < 60_000);
    if (b.globalTimestamps.length >= limits.globalPerMinute) {
      return "Service is busy. Please try again in a minute.";
    }
  }

  const hits = (b.ipHits.get(ip) || []).filter((t) => now - t < 86_400_000);
  const lastHour = hits.filter((t) => now - t < 3_600_000).length;
  if (lastHour >= limits.perHour) return "Too many requests. Try again in an hour.";
  if (hits.length >= limits.perDay) return "Daily limit reached for this device.";

  hits.push(now);
  b.ipHits.set(ip, hits);
  b.globalTimestamps.push(now);
  b.globalCount++;
  return null;
}
