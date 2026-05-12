import { json, parseJson, preflight } from "./_lib/http.js";
import { fetchSocialPotato, markSocialPotatoClaimed } from "./_lib/supabase.js";

function cleanText(value, max = 40) {
  return String(value || "").replace(/[^\w .,@!?'":()-]/g, "").trim().slice(0, max);
}

function cleanId(value) {
  return String(value || "").replace(/[^\w-]/g, "").trim().slice(0, 64);
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "Use GET or POST." });

  try {
    const body = event.httpMethod === "POST" ? parseJson(event) : {};
    const params = event.queryStringParameters || {};
    const id = cleanId(body.id || params.id);
    if (!id) return json(400, { error: "Missing social potato id." });

    const potato = await fetchSocialPotato(id);
    if (!potato) return json(404, { error: "That Hot Potato link was not found." });
    if (potato.claimed_at) {
      return json(409, {
        error: "That Hot Potato was already claimed.",
        claimed: true,
        id: potato.id,
        kind: potato.kind
      });
    }

    await markSocialPotatoClaimed(id, cleanText(body.claimedByName || params.claimedByName, 32));

    return json(200, {
      id: potato.id,
      kind: potato.kind,
      from: potato.from_name || "A friend",
      to: potato.target_handle || potato.target_name || "",
      message: cleanText(potato.message, 240),
      claimed: true
    });
  } catch (error) {
    return json(500, { error: error.message || "Could not claim social potato." });
  }
}
