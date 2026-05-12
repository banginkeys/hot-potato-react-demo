import { json, preflight } from "./_lib/http.js";
import { searchPlayersByUsername } from "./_lib/supabase.js";

function cleanText(value, max = 32) {
  return String(value || "").replace(/[^\w .@-]/g, "").trim().slice(0, max);
}

function cleanId(value) {
  return String(value || "").replace(/[^\w-]/g, "").trim().slice(0, 64);
}

const hiddenTestUsers = new Set([
  "debuguser",
  "legacyuser",
  "spudrunner",
  "player",
  "desktopace",
  "mobilemia",
  "desksocial",
  "phonesocial",
  "deskt",
  "phonet"
]);

function isHiddenTestPlayer(player) {
  const username = String(player.username || "").trim().toLowerCase();
  return hiddenTestUsers.has(username);
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET." });

  try {
    const query = cleanText(event.queryStringParameters?.q || event.queryStringParameters?.username, 24);
    const playerId = cleanId(event.queryStringParameters?.playerId);
    const result = await searchPlayersByUsername(query, playerId);
    return json(200, {
      configured: result.configured,
      players: (result.players || [])
        .filter((player) => !isHiddenTestPlayer(player))
        .map((player) => ({
          id: player.id,
          username: player.username,
          handle: player.handle,
          avatarId: player.avatar_id,
          wallet: player.wallet,
          lastSeenAt: player.last_seen_at
        }))
    });
  } catch (error) {
    return json(500, { error: error.message || "Could not search players." });
  }
}
