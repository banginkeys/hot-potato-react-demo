import { json, parseJson, preflight } from "./_lib/http.js";
import { upsertPlayer } from "./_lib/supabase.js";

function cleanText(value, max = 40) {
  return String(value || "").replace(/[^\w .@-]/g, "").trim().slice(0, max);
}

function cleanId(value) {
  return String(value || "").replace(/[^\w-]/g, "").trim().slice(0, 64);
}

function makeHandle(username, id) {
  const slug = cleanText(username, 24)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18) || "player";
  const suffix = cleanId(id).replace(/-/g, "").slice(0, 5) || "00000";
  return `@${slug}-${suffix}`;
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  try {
    const body = parseJson(event);
    const id = cleanId(body.id);
    if (!id) return json(400, { error: "Missing player id." });

    const username = cleanText(body.username, 24) || "SpudRunner";
    const record = await upsertPlayer({
      id,
      username,
      handle: makeHandle(username, id),
      avatar_id: Math.max(0, Math.min(99, Number(body.avatarId) || 0)),
      wallet: cleanText(body.wallet, 32),
      last_seen_at: new Date().toISOString()
    });

    return json(200, {
      configured: !record.fallback,
      player: {
        id: record.id,
        username: record.username,
        handle: record.handle,
        avatarId: record.avatar_id,
        wallet: record.wallet,
        lastSeenAt: record.last_seen_at
      }
    });
  } catch (error) {
    return json(500, { error: error.message || "Could not save player profile." });
  }
}
