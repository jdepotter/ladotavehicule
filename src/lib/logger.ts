import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

export type EventType =
  | "analyze"
  | "plate_reader"
  | "gemini"
  | "street_lookup"
  | "geocode"
  | "submit"
  | "error";

interface EventPayload {
  type: EventType;
  ip?: string | null;
  success?: boolean;
  status?: number;
  duration_ms?: number;
  meta?: Record<string, unknown>;
  error?: string;
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Defer the insert until after the response is sent. On Netlify/Lambda this
// keeps the function alive long enough for the HTTPS call to complete —
// without `after()`, the runtime freezes mid-fetch and undici later throws
// "TypeError: fetch failed" when the container is thawed for another request.
export function logEvent(payload: EventPayload): void {
  const c = getClient();
  if (!c) return;
  after(async () => {
    const { error } = await c.schema("private").from("events").insert({
      type: payload.type,
      ip: payload.ip ?? null,
      success: payload.success ?? null,
      status: payload.status ?? null,
      duration_ms: payload.duration_ms ?? null,
      meta: payload.meta ?? null,
      error: payload.error ?? null,
    });
    if (error) console.error(`[logger] insert failed: ${error.message}`);
  });
}
