import { json, parseJson, preflight } from "./_lib/http.js";
import { cleanRecoveryCode, hashRecoveryCode } from "./_lib/profileAuth.js";
import { findPlayerForLogin, upsertPlayer } from "./_lib/supabase.js";

function cleanText(value, max = 40) {
  return String(value || "").replace(/[^\w .@-]/g, "").trim().slice(0, max);
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  try {
    const body = parseJson(event);
    const username = cleanText(body.username, 24);
    const recoveryCode = cleanRecoveryCode(body.recoveryCode);
    const recoveryHash = hashRecoveryCode(recoveryCode);
    if (!username || !recoveryHash) return json(400, { error: "Enter your username and Farm Code." });

    const result = await findPlayerForLogin(username);
    if (!result.configured) return json(503, { error: "Player backend is not configured yet." });
    const player = result.player;
    if (!player || player.recovery_code_hash !== recoveryHash) {
      return json(401, { error: "That username and Farm Code did not match." });
    }

    await upsertPlayer({
      id: player.id,
      username: player.username,
      handle: player.handle,
      avatar_id: player.avatar_id,
      wallet: player.wallet,
      recovery_code_hash: player.recovery_code_hash,
      game_state: player.game_state || {},
      last_seen_at: new Date().toISOString()
    });

    return json(200, {
      configured: true,
      player: {
        id: player.id,
        username: player.username,
        handle: player.handle,
        avatarId: player.avatar_id,
        wallet: player.wallet,
        gameState: player.game_state || {},
        lastSeenAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return json(500, { error: error.message || "Could not restore player profile." });
  }
}
