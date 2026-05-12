import { json, preflight } from "./_lib/http.js";
import { checkBackendHealth } from "./_lib/supabase.js";

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  const status = await checkBackendHealth();
  return json(status.ok ? 200 : 500, {
    ok: status.ok,
    supabaseConfigured: status.configured,
    reason: status.reason || ""
  });
}
