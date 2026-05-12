import { json, preflight } from "./_lib/http.js";
import { listIncomingSocialPotatoes } from "./_lib/supabase.js";

function cleanHandle(value) {
  return String(value || "").replace(/[^\w@.-]/g, "").trim().slice(0, 40);
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET." });

  try {
    const handle = cleanHandle(event.queryStringParameters?.handle);
    const result = await listIncomingSocialPotatoes(handle);
    return json(200, {
      configured: result.configured,
      potatoes: (result.potatoes || []).map((potato) => ({
        id: potato.id,
        kind: potato.kind,
        from: potato.from_name || "A friend",
        to: potato.target_handle || potato.target_name || "",
        createdAt: potato.created_at
      }))
    });
  } catch (error) {
    return json(500, { error: error.message || "Could not list incoming friend potatoes." });
  }
}
