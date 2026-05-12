import { randomUUID } from "node:crypto";

const socialTable = "social_potatoes";
const playersTable = "players";

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
    select: "id,kind,from_name,target_handle,target_name,created_at,claimed_at"
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

  const params = new URLSearchParams({
    target_handle: `eq.${target}`,
    claimed_at: "is.null",
    select: "id,kind,from_name,target_handle,target_name,created_at",
    order: "created_at.asc",
    limit: "5"
  });
  const response = await fetch(`${config.url}/rest/v1/${socialTable}?${params}`, {
    headers: headers(config.serviceRoleKey)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Could not list incoming social potatoes.");
  }
  return { configured: true, potatoes: Array.isArray(body) ? body : [] };
}
