import { json, parseJson, preflight, publicBaseUrl } from "./_lib/http.js";
import { createSocialPotato } from "./_lib/supabase.js";

const kinds = new Set(["normal", "tainted", "golden"]);

function cleanText(value, max = 40) {
  return String(value || "").replace(/[^\w .@-]/g, "").trim().slice(0, max);
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  try {
    const body = parseJson(event);
    const kind = String(body.kind || "").toLowerCase();
    if (!kinds.has(kind)) return json(400, { error: "Unknown social potato kind." });

    const record = await createSocialPotato({
      kind,
      from_name: cleanText(body.fromName, 32) || "A friend",
      target_handle: cleanText(body.targetHandle, 24),
      target_name: cleanText(body.targetName, 32)
    });

    const link = new URL(publicBaseUrl(event));
    link.searchParams.set("gift", record.id);

    return json(200, {
      id: record.id,
      kind: record.kind || kind,
      link: link.toString(),
      fallback: !!record.fallback
    });
  } catch (error) {
    return json(500, { error: error.message || "Could not create social potato." });
  }
}
