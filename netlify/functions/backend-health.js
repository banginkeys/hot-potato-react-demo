import { json, preflight } from "./_lib/http.js";
import { backendStatus } from "./_lib/supabase.js";

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  const status = backendStatus();
  return json(200, {
    ok: true,
    supabaseConfigured: status.configured,
    reason: status.reason || ""
  });
}
