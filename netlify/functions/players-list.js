import { json, preflight } from "./_lib/http.js";
import { listPlayers } from "./_lib/supabase.js";

function cleanId(value) {
  return String(value || "").replace(/[^\w-]/g, "").trim().slice(0, 64);
}

const hiddenTestUsers = new Set([
  "debuguser",
  "legacyuser",
  "desktopace",
  "mobilemia",
  "desksocial",
  "phonesocial",
  "deskt",
  "phonet"
]);

const hiddenTestWallets = new Set([
  "0xtest",
  "0xlegacy",
  "0xdesktop",
  "0xmobile",
  "0xa",
  "0xb"
]);

function isHiddenTestPlayer(player) {
  const username = String(player.username || "").trim().toLowerCase();
  const wallet = String(player.wallet || "").trim().toLowerCase();
  return hiddenTestUsers.has(username) || hiddenTestWallets.has(wallet);
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET." });

  try {
    const exclude = cleanId(event.queryStringParameters?.exclude);
    const result = await listPlayers(exclude);
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
    return json(500, { error: error.message || "Could not list players." });
  }
}
