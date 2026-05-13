import { randomUUID } from "node:crypto";

const socialTable = "social_potatoes";
const playersTable = "players";
const friendsTable = "player_friends";

function cleanEnv(value) {
  return String(value || "").trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function envConfig() {
  const url = cleanEnv(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL).replace(/\/+$/, "");
  const serviceRoleKey = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY
  ).replace(/\s+/g, "");

  if (!url || !serviceRoleKey) {
    return { configured: false, reason: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." };
  }
  if (/^https?:\/\//i.test(serviceRoleKey)) {
    return { configured: false, reason: "SUPABASE_SERVICE_ROLE_KEY appears to be a URL, not an API key." };
  }
  return { configured: true, url: url.replace(/\/+$/, ""), serviceRoleKey };
}

function isLegacyJwtKey(key) {
  return key.split(".").length === 3;
}

function cleanUuid(value) {
  return String(value || "").replace(/[^\w-]/g, "").trim().slice(0, 64);
}

function headers(serviceRoleKey, prefer) {
  return {
    apikey: serviceRoleKey,
    "content-type": "application/json",
    ...(isLegacyJwtKey(serviceRoleKey) ? { authorization: `Bearer ${serviceRoleKey}` } : {}),
    ...(prefer ? { prefer } : {})
  };
}

export function backendStatus() {
  const config = envConfig();
  return { configured: config.configured, reason: config.reason || "" };
}

export async function checkBackendHealth() {
  const config = envConfig();
  if (!config.configured) {
    return { ok: false, configured: false, reason: config.reason || "Supabase is not configured." };
  }

  const params = new URLSearchParams({
    select: "id",
    limit: "1"
  });
  const response = await fetch(`${config.url}/rest/v1/${playersTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  if (response.ok) {
    return { ok: true, configured: true, reason: "" };
  }
  const body = await response.json().catch(() => null);
  return {
    ok: false,
    configured: true,
    reason: body?.message || body?.hint || "Supabase rejected the player directory request."
  };
}

export async function createSocialPotato(record) {
  const config = envConfig();
  if (!config.configured) {
    return {
      id: randomUUID(),
      fallback: true,
      ...record,
      created_at: new Date().toISOString()
    };
  }

  const response = await fetch(`${config.url}/rest/v1/${socialTable}`, {
    method: "POST",
    headers: headers(config.serviceRoleKey, "return=representation"),
    body: JSON.stringify(record)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not create social potato.");
  }
  return Array.isArray(body) ? body[0] : body;
}

export async function fetchSocialPotato(id) {
  const config = envConfig();
  if (!config.configured) {
    throw new Error("Social potato database is not configured.");
  }
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "id,kind,from_name,target_handle,target_name,message,created_at,claimed_at"
  });
  const response = await fetch(`${config.url}/rest/v1/${socialTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not fetch social potato.");
  }
  return Array.isArray(body) ? body[0] : null;
}

export async function markSocialPotatoClaimed(id, claimedByName = "") {
  const config = envConfig();
  if (!config.configured) {
    throw new Error("Social potato database is not configured.");
  }
  const params = new URLSearchParams({ id: `eq.${id}` });
  const response = await fetch(`${config.url}/rest/v1/${socialTable}?${params}`, {
    method: "PATCH",
    headers: headers(config.serviceRoleKey, "return=minimal"),
    body: JSON.stringify({
      claimed_at: new Date().toISOString(),
      claimed_by_name: claimedByName || null
    })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Could not claim social potato.");
  }
}

export async function upsertPlayer(record) {
  const config = envConfig();
  if (!config.configured) {
    return {
      configured: false,
      fallback: true,
      ...record,
      last_seen_at: new Date().toISOString()
    };
  }

  const response = await fetch(`${config.url}/rest/v1/${playersTable}?on_conflict=id`, {
    method: "POST",
    headers: headers(config.serviceRoleKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(record)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not save player profile.");
  }
  return Array.isArray(body) ? body[0] : body;
}

export async function findPlayerByUsername(username = "") {
  const config = envConfig();
  if (!config.configured) return null;
  const name = String(username || "").trim();
  if (!name) return null;

  const params = new URLSearchParams({
    select: "id,username",
    username: `ilike.${name}`,
    limit: "5"
  });
  const response = await fetch(`${config.url}/rest/v1/${playersTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not check username.");
  }
  return (Array.isArray(body) ? body : []).find((player) =>
    String(player.username || "").trim().toLowerCase() === name.toLowerCase()
  ) || null;
}

export async function findPlayerForLogin(username = "") {
  const config = envConfig();
  if (!config.configured) return { configured: false, player: null };
  const name = String(username || "").trim();
  if (!name) return { configured: true, player: null };

  const params = new URLSearchParams({
    select: "id,username,handle,avatar_id,wallet,last_seen_at,recovery_code_hash,game_state",
    username: `ilike.${name}`,
    limit: "5"
  });
  const response = await fetch(`${config.url}/rest/v1/${playersTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not find player profile.");
  }
  const player = (Array.isArray(body) ? body : []).find((record) =>
    String(record.username || "").trim().toLowerCase() === name.toLowerCase()
  ) || null;
  return { configured: true, player };
}

export async function searchPlayersByUsername(query = "", excludeId = "") {
  const config = envConfig();
  if (!config.configured) return { configured: false, players: [] };
  const q = String(query || "").trim().replace(/[%*,]/g, "").slice(0, 24);
  if (q.length < 2) return { configured: true, players: [] };

  const params = new URLSearchParams({
    select: "id,username,handle,avatar_id,wallet,last_seen_at",
    username: `ilike.*${q}*`,
    order: "username.asc",
    limit: "8"
  });
  const playerId = cleanUuid(excludeId);
  if (playerId) params.set("id", `neq.${playerId}`);

  const response = await fetch(`${config.url}/rest/v1/${playersTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not search players.");
  }
  return { configured: true, players: Array.isArray(body) ? body : [] };
}

async function fetchPlayersByIds(config, ids = []) {
  const cleanIds = [...new Set(ids.map(cleanUuid).filter(Boolean))];
  if (!cleanIds.length) return [];
  const params = new URLSearchParams({
    select: "id,username,handle,avatar_id,wallet,last_seen_at",
    id: `in.(${cleanIds.join(",")})`
  });
  const response = await fetch(`${config.url}/rest/v1/${playersTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not fetch friend profiles.");
  }
  const byId = new Map((Array.isArray(body) ? body : []).map((player) => [player.id, player]));
  return cleanIds.map((id) => byId.get(id)).filter(Boolean);
}

export async function listFriends(playerId = "") {
  const config = envConfig();
  if (!config.configured) {
    return { configured: false, players: [] };
  }
  const id = cleanUuid(playerId);
  if (!id) return { configured: true, players: [] };

  const params = new URLSearchParams({
    player_id: `eq.${id}`,
    select: "friend_id,created_at",
    order: "created_at.desc",
    limit: "50"
  });
  const response = await fetch(`${config.url}/rest/v1/${friendsTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not list friends.");
  }
  const friends = Array.isArray(body) ? body : [];
  const players = await fetchPlayersByIds(config, friends.map((friend) => friend.friend_id));
  return { configured: true, players };
}

export async function addFriend(playerId = "", friendId = "") {
  const config = envConfig();
  if (!config.configured) {
    return { configured: false, players: [] };
  }
  const id = cleanUuid(playerId);
  const target = cleanUuid(friendId);
  if (!id || !target || id === target) {
    throw new Error("Choose a real player to add.");
  }

  const records = [
    { player_id: id, friend_id: target },
    { player_id: target, friend_id: id }
  ];
  const response = await fetch(`${config.url}/rest/v1/${friendsTable}?on_conflict=player_id,friend_id`, {
    method: "POST",
    headers: headers(config.serviceRoleKey, "resolution=ignore-duplicates,return=minimal"),
    body: JSON.stringify(records)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Could not add friend.");
  }
  const players = await fetchPlayersByIds(config, [target]);
  return { configured: true, players };
}

export async function listPlayers(excludeId = "") {
  const config = envConfig();
  if (!config.configured) {
    return { configured: false, players: [] };
  }

  const params = new URLSearchParams({
    select: "id,username,handle,avatar_id,wallet,created_at,last_seen_at",
    order: "last_seen_at.desc.nullslast",
    limit: "50"
  });
  if (excludeId) params.set("id", `neq.${excludeId}`);

  const response = await fetch(`${config.url}/rest/v1/${playersTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not list players.");
  }
  return { configured: true, players: Array.isArray(body) ? body : [] };
}

export async function listIncomingSocialPotatoes(handle = "") {
  const config = envConfig();
  if (!config.configured) {
    return { configured: false, potatoes: [] };
  }
  const target = String(handle || "").trim();
  if (!target) return { configured: true, potatoes: [] };

  const select = "id,kind,from_name,target_handle,target_name,message,created_at";
  const fetchIncoming = async (extra = {}) => {
    const params = new URLSearchParams({
      target_handle: `eq.${target}`,
      claimed_at: "is.null",
      select,
      ...extra
    });
    const response = await fetch(`${config.url}/rest/v1/${socialTable}?${params}`, {
      headers: headers(config.serviceRoleKey)
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.message || "Could not list incoming social potatoes.");
    }
    return Array.isArray(body) ? body : [];
  };

  const special = await fetchIncoming({
    kind: "in.(tainted,golden,pigeon)",
    order: "created_at.asc",
    limit: "10"
  });
  const normal = await fetchIncoming({
    kind: "eq.normal",
    order: "created_at.asc",
    limit: "5"
  });

  return { configured: true, potatoes: [...special, ...normal] };
}
