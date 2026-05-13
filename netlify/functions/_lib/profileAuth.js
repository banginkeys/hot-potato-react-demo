import { createHash } from "node:crypto";

export function cleanRecoveryCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

export function hashRecoveryCode(value) {
  const clean = cleanRecoveryCode(value);
  if (clean.length < 4) return "";
  return createHash("sha256").update(`hot-potato-farm-code:${clean}`).digest("hex");
}

export function cleanGameState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > 24000) return {};
  return value;
}
