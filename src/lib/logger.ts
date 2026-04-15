import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

// Fire-and-forget: never blocks the caller, never throws.
export function logEvent(payload: EventPayload): void {
  const c = getClient();
  if (!c) return;
  c.from("events").insert({
    type: payload.type,
    ip: payload.ip ?? null,
    success: payload.success ?? null,
    status: payload.status ?? null,
    duration_ms: payload.duration_ms ?? null,
    meta: payload.meta ?? null,
    error: payload.error ?? null,
  }).then(({ error }) => {
    if (error) console.error(`[logger] insert failed: ${error.message}`);
  });
}
