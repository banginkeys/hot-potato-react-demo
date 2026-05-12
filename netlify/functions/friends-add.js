import { json, parseJson, preflight } from "./_lib/http.js";
import { addFriend } from "./_lib/supabase.js";

function cleanId(value) {
  return String(value || "").replace(/[^\w-]/g, "").trim().slice(0, 64);
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  try {
    const body = parseJson(event);
    const result = await addFriend(cleanId(body.playerId), cleanId(body.friendId));
    return json(200, {
      configured: result.configured,
      players: (result.players || []).map((player) => ({
        id: player.id,
        username: player.username,
        handle: player.handle,
        avatarId: player.avatar_id,
        wallet: player.wallet,
        lastSeenAt: player.last_seen_at
      }))
    });
  } catch (error) {
    return json(500, { error: error.message || "Could not add friend." });
  }
}
