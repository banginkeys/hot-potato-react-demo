import { json, parseJson, preflight } from "./_lib/http.js";
import { findPlayerByUsername, upsertPlayer } from "./_lib/supabase.js";
import { createHash } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value, max = 40) {
  return String(value || "").replace(/[^\w .@-]/g, "").trim().slice(0, max);
}

function cleanId(value) {
  return String(value || "").replace(/[^\w-]/g, "").trim().slice(0, 64);
}

function asUuid(value) {
  const raw = cleanId(value);
  if (!raw) return "";
  if (UUID_RE.test(raw)) return raw.toLowerCase();

  const hash = createHash("sha1").update(raw).digest("hex");
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = `5${hash.slice(13, 16)}`;
  const variantNibble = (8 + (parseInt(hash.slice(16, 17), 16) % 4)).toString(16);
  const part4 = `${variantNibble}${hash.slice(17, 20)}`;
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
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

function isReservedUsername(username) {
  const lower = String(username || "").trim().toLowerCase();
  return lower.length < 3 || lower === "spudrunner" || lower === "player";
}

export async function handler(event) {
  const options = preflight(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  try {
    const body = parseJson(event);
    const id = asUuid(body.id);
    if (!id) return json(400, { error: "Missing player id." });

    const username = cleanText(body.username, 24) || "SpudRunner";
    if (isReservedUsername(username)) {
      return json(400, { error: "Choose a unique username before connecting." });
    }
    const existing = await findPlayerByUsername(username);
    if (existing && existing.id !== id) {
      return json(409, { error: "That username is already taken." });
    }
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
