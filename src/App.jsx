import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  SAVE_KEY,
  SPUD,
  adFiles,
  assetUrl,
  avatars,
  emptyEquipment,
  equipment,
  soundFiles,
  sponsors
} from "./gameData.js";
import {
  advancePotato,
  applyPassiveAdRevenue,
  clamp,
  equipmentStressMultiplier,
  explosionChance,
  fmt,
  makePotato,
  money,
  nextPowerForStreak,
  passCost
} from "./gameMath.js";

const initialGame = {
  onboarded: false,
  connected: false,
  playerId: "",
  playerHandle: "",
  soundOn: true,
  playerName: "",
  avatar: 0,
  wallet: "",
  tots: 0,
  risk: 0,
  sac: 0,
  ads: 0,
  creatorAdRevenue: 0,
  passiveAdSeconds: 0,
  passiveAdImpressions: 0,
  sponsorSlot: 0,
  sponsorBreaks: 0,
  spudCreated: 0,
  spudSunk: 0,
  socialXp: 0,
  claimedGoals: [],
  favorsSent: [],
  socialSends: { tainted: 0, golden: 0, pigeon: 0 },
  pendingSocialPotato: null,
  sleepOpen: false,
  sleepEnabled: false,
  sleepStart: 23,
  sleepEnd: 7,
  snoozeUntil: 0,
  passes: 0,
  won: 0,
  bestWin: 0,
  burned: 0,
  explosions: 0,
  streak: 0,
  bestStreak: 0,
  quickPassChain: 0,
  babyHandsRounds: 0,
  fundClicks: 0,
  sacToPileClicks: 0,
  walletBurnNonce: 0,
  pendingPower: "",
  pendingPowerStreak: 0,
  overdriveActive: false,
  overdriveTaps: [],
  nextPotatoIndex: 0,
  nextAdIndex: 0,
  target: 0,
  holding: false,
  potato: null,
  nextAt: 0,
  sponsorBreak: null,
  seenGuides: {},
  unlocked: {
    sac: false,
    activity: false,
    target: false,
    sponsor: false,
    equipment: false,
    protection: false
  },
  equipment: emptyEquipment(),
  log: []
};

const ACTIVE_DELIVERY_MIN_MS = 4500;
const ACTIVE_DELIVERY_RANGE_MS = 4500;
const POST_PASS_DELIVERY_MIN_MS = 3600;
const POST_PASS_DELIVERY_RANGE_MS = 4200;
const READY_DELIVERY_MIN_MS = 1200;
const READY_DELIVERY_RANGE_MS = 1800;
const DELIVERY_BACKSTOP_MS = 8500;
const SOCIAL_DELIVERY_DELAY_MS = 650;
const SOCIAL_INBOX_POLL_MS = 1500;
const PLAYER_PROFILE_KEY = `${SAVE_KEY}-player-id`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PIGEON_FLAP_FRAMES = [
  "pigeon-potato-flap-frame-1.png",
  "pigeon-potato-flap-frame-2.png",
  "pigeon-potato-flap-frame-3.png",
  "pigeon-potato-flap-frame-4.png"
];

function makeLocalId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16 >> (Number(c) / 4))).toString(16)
  );
}

function coercePlayerId(value) {
  const id = String(value || "").trim();
  return UUID_RE.test(id) ? id.toLowerCase() : "";
}

function getOrCreatePlayerId() {
  if (typeof localStorage === "undefined") return makeLocalId();
  const existing = coercePlayerId(localStorage.getItem(PLAYER_PROFILE_KEY));
  if (existing) return existing;
  const created = makeLocalId();
  localStorage.setItem(PLAYER_PROFILE_KEY, created);
  return created;
}

function displayHandle(player) {
  return player?.handle || `@${String(player?.name || "player").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "player"}`;
}

function playerDisplayName(player) {
  return player?.name || player?.username || "Player";
}

function cleanUsername(value) {
  return String(value || "").replace(/[^\w -]/g, "").slice(0, 16);
}

function validUsername(value) {
  const name = cleanUsername(value).trim();
  const lower = name.toLowerCase();
  return name.length >= 3 && lower !== "spudrunner" && lower !== "player";
}

function soundCheckEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("soundCheck");
}

function secretSocialCopy(invite) {
  if (!invite) return "";
  const from = invite.from || "A friend";
  if (invite.kind === "normal") return `${from} tossed you a Hot Potato.`;
  return "A mystery Hot Potato is headed your way.";
}

function socialLandingCopy(social) {
  if (!social) return "";
  const from = social.from || "A friend";
  if (social.kind === "normal") return `${from} tossed you a Hot Potato.`;
  if (social.kind === "golden") return `A Golden Potato from ${from} landed.`;
  if (social.kind === "pigeon") return `A message potato from ${from} fluttered in.`;
  return "A Hot Potato landed. It feels... personal.";
}

function socialQueueToast(social, game) {
  if (social?.kind === "normal") return `${social.from || "A friend"} passed you a Hot Potato.`;
  if (game.risk <= 0) return "Friend potato waiting. Add SPUD to the Spud Pile.";
  if (game.potato) return "Friend potato queued after this potato.";
  if (deliveryProtectionActive(game)) return "Friend potato waits until sleep/snooze ends.";
  return "Friend potato is next.";
}

function adFileAtIndex(index, excluded = []) {
  if (!adFiles.length) return "";
  const excludedSet = new Set(excluded);
  const list = adFiles.filter((file) => !excludedSet.has(file));
  const usable = list.length ? list : adFiles;
  return usable[((index % usable.length) + usable.length) % usable.length];
}

const burnOverlayLayers = [
  { file: "burn-faint.png", start: 0.1, span: 0.28, max: 0.18, left: 38, top: 35, size: 38, scale: 0.9, rot: -14 },
  { file: "burn-medium.png", start: 0.26, span: 0.32, max: 0.28, left: 64, top: 42, size: 34, scale: 0.92, rot: 9 },
  { file: "burn-severe.png", start: 0.42, span: 0.3, max: 0.34, left: 42, top: 58, size: 36, scale: 0.84, rot: -8 },
  { file: "burn-burst-wide.png", start: 0.56, span: 0.3, max: 0.3, left: 58, top: 66, size: 38, scale: 0.88, rot: 15 },
  { file: "burn-focused.png", start: 0.68, span: 0.28, max: 0.34, left: 34, top: 48, size: 30, scale: 0.85, rot: -19 },
  { file: "burn-low-burst.png", start: 0.78, span: 0.28, max: 0.38, left: 50, top: 76, size: 42, scale: 0.86, rot: 6 },
  { file: "burn-low-focused.png", start: 0.9, span: 0.28, max: 0.32, left: 67, top: 56, size: 31, scale: 0.82, rot: 18 },
  { file: "burn-chaotic.png", start: 1.02, span: 0.26, max: 0.36, left: 45, top: 70, size: 34, scale: 0.85, rot: -12 }
];

const equipmentUnlocks = [
  { key: "foilWrap", label: "Starter gear", unlocked: () => true },
  { key: "ovenMitts", label: "Pass 5 potatoes", unlocked: (game) => game.passes >= 5 || game.explosions >= 1 },
  { key: "sourCream", label: "Win 60 SPUD", unlocked: (game) => game.won >= 60 || game.passes >= 8 },
  { key: "hotSauce", label: "Reach streak 5", unlocked: (game) => game.bestStreak >= 5 || game.passes >= 12 },
  { key: "thermometer", label: "Win 150 SPUD", unlocked: (game) => game.won >= 150 || game.bestWin >= 50 || game.passes >= 16 }
];

function isEquipmentUnlocked(game, key) {
  const rule = equipmentUnlocks.find((item) => item.key === key);
  return !!game.unlocked.equipment && (!!game.equipment?.[key] || !!rule?.unlocked(game));
}

function bestGearMilestone(milestones) {
  return milestones
    .map((item) => ({
      ...item,
      value: clamp(item.value, 0, item.goal),
      percent: clamp(item.value / item.goal, 0, 1)
    }))
    .sort((a, b) => b.percent - a.percent)[0];
}

function gearUnlockProgress(game, key) {
  if (key === "foilWrap") return { label: "Starter gear", value: 1, goal: 1, percent: 1 };
  if (key === "ovenMitts") {
    return bestGearMilestone([
      { label: "passes", value: game.passes, goal: 5 },
      { label: "explosion survived", value: game.explosions, goal: 1 }
    ]);
  }
  if (key === "sourCream") {
    return bestGearMilestone([
      { label: "SPUD won", value: game.won, goal: 60 },
      { label: "passes", value: game.passes, goal: 8 }
    ]);
  }
  if (key === "hotSauce") {
    return bestGearMilestone([
      { label: "best streak", value: game.bestStreak, goal: 5 },
      { label: "passes", value: game.passes, goal: 12 }
    ]);
  }
  if (key === "thermometer") {
    return bestGearMilestone([
      { label: "SPUD won", value: game.won, goal: 150 },
      { label: "best single win", value: game.bestWin, goal: 50 },
      { label: "passes", value: game.passes, goal: 16 }
    ]);
  }
  return { label: "progress", value: 0, goal: 1, percent: 0 };
}

function unlockedEquipmentEntries(game) {
  return equipmentUnlocks
    .filter(({ key }) => isEquipmentUnlocked(game, key))
    .map(({ key, label }) => [key, equipment[key], label])
    .filter(([, item]) => item);
}

const starterGoals = [
  {
    id: "first-fuel",
    title: "Fuel Up",
    description: "Watch one ad.",
    rewardLabel: "+4 Tots",
    complete: (game) => game.ads >= 1,
    reward: { tots: 4 }
  },
  {
    id: "first-pass",
    title: "First Toss",
    description: "Pass one Hot Potato.",
    rewardLabel: "Foil Wrap",
    complete: (game) => game.passes >= 1,
    reward: { gear: "foilWrap", count: 1 }
  },
  {
    id: "stash-safety",
    title: "Play It Safe",
    description: "Move SPUD into the Spud Sac.",
    rewardLabel: "+6 Tots",
    complete: (game) => game.sac > 0 || game.seenGuides?.moveSac,
    reward: { tots: 6 }
  },
  {
    id: "hot-starter",
    title: "Hot Starter",
    description: "Reach a streak of 3.",
    rewardLabel: "Oven Mitts",
    complete: (game) => game.bestStreak >= 3,
    reward: { gear: "ovenMitts", count: 1 }
  }
];

function rewardedAdPayout(adCount = 0) {
  if (adCount < 5) return { tots: SPUD.rewardedAdTots, revenue: SPUD.rewardedAdRevenue, tier: "Full" };
  if (adCount < 10) return { tots: 6, revenue: Number((SPUD.rewardedAdRevenue * 0.72).toFixed(4)), tier: "Cooling" };
  return { tots: 2, revenue: Number((SPUD.rewardedAdRevenue * 0.42).toFixed(4)), tier: "Low" };
}

function riskPosture(game, heatScore = 0) {
  const total = game.risk + game.sac;
  const exposed = total > 0 ? game.risk / total : 0;
  const streakPressure = clamp(game.streak / 10, 0, 0.32);
  const heatPressure = game.potato ? clamp(heatScore / 2.8, 0, 0.34) : 0;
  const score = clamp(exposed * 0.74 + streakPressure + heatPressure, 0, 1);
  if (score >= 0.78) return { label: "Reckless", note: "Huge upside, huge burn risk.", score };
  if (score >= 0.52) return { label: "Greedy", note: "Strong streak pressure.", score };
  if (score >= 0.24) return { label: "Warm", note: "Some SPUD exposed.", score };
  return { label: "Safe", note: "Most SPUD protected.", score };
}

const socialPotatoes = {
  normal: {
    name: "Friend Toss",
    cost: 0,
    title: "FRIEND TOSS",
    description: "A regular Hot Potato passed by another player.",
    logType: "info"
  },
  tainted: {
    name: "Tainted Tater",
    cost: 3,
    title: "TAINTED TATER",
    description: "A spicy prank potato. Fast, twitchy, and rude.",
    logType: "bad"
  },
  golden: {
    name: "Golden Potato",
    cost: 5,
    title: "GOLDEN POTATO",
    description: "A friendlier gift potato with a Golden Window run.",
    logType: "good"
  },
  pigeon: {
    name: "Pigeon Potato",
    cost: 1,
    title: "MESSAGE POTATO",
    description: "A silly message carrier. The note pops out after the potato resolves.",
    logType: "info"
  }
};

function socialSpendable(game) {
  return (Number(game.sac) || 0) + (Number(game.risk) || 0);
}

function spendSocialCost(game, cost) {
  const fromSac = Math.min(game.sac, cost);
  const fromRisk = Math.min(game.risk, cost - fromSac);
  return {
    ...game,
    sac: Number((game.sac - fromSac).toFixed(1)),
    risk: Number((game.risk - fromRisk).toFixed(1)),
    spudSunk: Number(((game.spudSunk || 0) + fromSac + fromRisk).toFixed(1))
  };
}

function socialPotatoLink(kind, fromName, target, message = "") {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("socialPotato", kind);
  url.searchParams.set("from", fromName || "A friend");
  url.searchParams.set("to", target?.handle || "");
  if (message) url.searchParams.set("message", message.slice(0, 220));
  url.searchParams.set("id", `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`);
  return url.toString();
}

async function parseBackendResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new Error(body?.error || fallbackMessage);
  }
  return body;
}

async function createBackendSocialPotato(kind, fromName, target, message = "") {
  const response = await fetch("/.netlify/functions/social-potatoes-create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      fromName: fromName || "A friend",
      targetHandle: target?.handle || "",
      targetName: target?.name || "",
      message: message || ""
    })
  });
  return parseBackendResponse(response, "Friend link backend is not available.");
}

async function claimBackendSocialPotato(id, claimedByName) {
  const params = new URLSearchParams({ id });
  if (claimedByName) params.set("claimedByName", claimedByName);
  const response = await fetch(`/.netlify/functions/social-potatoes-claim?${params}`);
  return parseBackendResponse(response, "That Hot Potato link could not be claimed.");
}

async function upsertBackendPlayer(game) {
  const playerId = coercePlayerId(game.playerId) || getOrCreatePlayerId();
  const response = await fetch("/.netlify/functions/players-upsert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: playerId,
      username: cleanUsername(game.playerName).trim(),
      avatarId: game.avatar || 0,
      wallet: game.wallet || ""
    })
  });
  return parseBackendResponse(response, "Player backend is not available.");
}

async function listBackendPlayers(currentPlayerId) {
  const params = currentPlayerId ? new URLSearchParams({ playerId: currentPlayerId }) : new URLSearchParams();
  const query = params.toString();
  const response = await fetch(`/.netlify/functions/players-list${query ? `?${query}` : ""}`);
  return parseBackendResponse(response, "Player list is not available.");
}

async function searchBackendPlayers(query, currentPlayerId) {
  const params = new URLSearchParams({ q: query || "" });
  if (currentPlayerId) params.set("playerId", currentPlayerId);
  const response = await fetch(`/.netlify/functions/players-search?${params}`);
  return parseBackendResponse(response, "Player search is not available.");
}

async function addBackendFriend(playerId, friendId) {
  const response = await fetch("/.netlify/functions/friends-add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId, friendId })
  });
  return parseBackendResponse(response, "Friend backend is not available.");
}

async function listBackendSocialInbox(playerHandle) {
  const params = new URLSearchParams({ handle: playerHandle || "" });
  const response = await fetch(`/.netlify/functions/social-potatoes-inbox?${params}`);
  return parseBackendResponse(response, "Friend potato inbox is not available.");
}

function readSocialInvite() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("socialPotato");
  if (!socialPotatoes[kind]) return null;
  return {
    kind,
    from: (params.get("from") || "A friend").slice(0, 24),
    to: (params.get("to") || "").slice(0, 24),
    message: (params.get("message") || "").slice(0, 220),
    id: (params.get("id") || `${Date.now()}`).slice(0, 36)
  };
}

function readBackendGiftId() {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("gift") || "").replace(/[^\w-]/g, "").slice(0, 64);
}

function clearSocialInviteUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("socialPotato") && !url.searchParams.has("gift")) return;
  url.searchParams.delete("socialPotato");
  url.searchParams.delete("gift");
  url.searchParams.delete("from");
  url.searchParams.delete("to");
  url.searchParams.delete("message");
  url.searchParams.delete("id");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function makeSocialPotato(base, invite) {
  if (!invite) return base;
  if (invite.kind === "golden") {
    return {
      ...base,
      name: "Golden Friend Potato",
      rarity: "Gift",
      sender: invite.from || "A friend",
      pool: Math.max(base.pool, 12),
      heat: Math.max(8, base.heat - 8),
      fuse: Math.max(base.fuse, 88),
      safeUntil: Math.max(base.safeUntil, 5),
      volatility: Math.min(base.volatility, 0.92),
      growth: Math.max(base.growth, 1.55),
      power: "golden-window",
      socialKind: "golden"
    };
  }
  if (invite.kind === "tainted") {
    return {
      ...base,
      name: "Tainted Tater",
      rarity: "Prank",
      sender: invite.from || "A friend",
      prankFrom: invite.from || "A friend",
      pool: Math.max(base.pool, 8),
      heat: base.heat + 26,
      fuse: Math.min(base.fuse, 16),
      safeUntil: Math.min(base.safeUntil, 1.4),
      volatility: Math.max(base.volatility, 2.15),
      growth: Math.max(base.growth, 1.65),
      danger: Math.max(base.danger, 0.075),
      socialKind: "tainted"
    };
  }
  if (invite.kind === "pigeon") {
    return {
      ...base,
      name: "Pigeon Potato",
      rarity: "Message",
      sender: invite.from || "A friend",
      message: invite.message || "",
      assetPath: "Social Potatoes/pigeon-potato-flap-frame-1.png",
      pool: Math.max(base.pool, 4),
      heat: Math.max(8, base.heat - 4),
      fuse: Math.max(base.fuse, 58),
      safeUntil: Math.max(base.safeUntil, 5),
      volatility: Math.min(base.volatility, 0.82),
      growth: Math.max(base.growth, 0.95),
      socialKind: "pigeon"
    };
  }
  return {
    ...base,
    name: "Friend Toss Potato",
    rarity: "Passed",
    sender: invite.from || "A friend",
    message: invite.message || "",
    pool: Math.max(base.pool, 6),
    heat: base.heat + 4,
    fuse: Math.max(base.fuse, 64),
    safeUntil: Math.max(base.safeUntil, 4),
    volatility: Math.max(base.volatility, 1.02),
    growth: Math.max(base.growth, 1.12),
    socialKind: "normal"
  };
}

function streakMilestones(streak = 0) {
  const nextBase = Math.floor(streak / 5) * 5 + 5;
  return [nextBase, nextBase + 5, nextBase + 10].map((value) => ({
    value,
    power: nextPowerForStreak(value)
  }));
}

function goalRewardCopy(goal) {
  const reward = goal.reward || {};
  if (reward.gear && equipment[reward.gear]) return `${reward.count || 1} ${equipment[reward.gear].name}`;
  if (reward.tots) return `+${reward.tots} Tots`;
  return goal.rewardLabel || "Reward";
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...initialGame, playerId: getOrCreatePlayerId() };
    const loaded = JSON.parse(raw);
    return {
      ...initialGame,
      ...loaded,
      playerId: coercePlayerId(loaded.playerId) || getOrCreatePlayerId(),
      holding: false,
      potato: null,
      sponsorBreak: null,
      seenGuides: { ...(loaded.seenGuides || {}) },
      socialSends: { ...initialGame.socialSends, ...(loaded.socialSends || {}) },
      equipment: { ...emptyEquipment(), ...(loaded.equipment || {}) },
      unlocked: { ...initialGame.unlocked, ...(loaded.unlocked || {}) }
    };
  } catch {
    return { ...initialGame, playerId: getOrCreatePlayerId() };
  }
}

function addLog(game, text, type = "info") {
  return {
    ...game,
    log: [{ id: Date.now() + Math.random(), text, type }, ...game.log].slice(0, 18)
  };
}

function unlockForProgress(game) {
  const resolved = game.passes > 0 || game.explosions > 0;
  const equipmentOwned = Object.values(game.equipment || {}).some((n) => n > 0);
  return {
    ...game,
    unlocked: {
      sac: game.unlocked.sac || resolved || game.sac > 0,
      activity: game.unlocked.activity || resolved || game.connected,
      target: game.unlocked.target || game.connected || game.passes >= 1,
      sponsor: game.unlocked.sponsor || game.passes >= 2 || game.sponsorBreaks > 0,
      equipment: game.unlocked.equipment || game.passes >= 2 || game.sac >= equipment.foilWrap.cost || game.won >= 20 || equipmentOwned,
      protection: game.unlocked.protection || game.passes >= 4
    }
  };
}

function guideFor(game) {
  const seen = game.seenGuides || {};
  if (!game.onboarded) return null;
  if (!game.connected && !seen.connect) return ["connect", "Step 1 of 7", "Connect your demo wallet", "Start with 0 Tots and 0 SPUD. Connect first."];
  if (game.risk <= 0 && game.sac > 0 && !seen.fundFromSac) return ["fundFromSac", "Step 2 of 7", "Use your Spud Sac", "Move some safe SPUD back into the Spud Pile to play."];
  if (game.risk <= 0 && game.tots < SPUD.riskFundTots && !seen.watchAd) return ["watchAd", "Step 2 of 7", "Earn Tots first", "Watch one ad to get pass fuel. Tots are not crypto."];
  if (game.risk <= 0 && !seen.fundRisk) return ["fundRisk", "Step 3 of 7", "Build your Spud Pile", "Convert Tots into exposed SPUD so Hot Potatoes can arrive."];
  if (!game.potato && game.passes === 0 && game.explosions === 0 && !seen.waitPotato) return ["waitPotato", "Step 4 of 7", "Wait for a potato", "A Hot Potato can land at any moment once your Spud Pile is funded."];
  if (game.potato && game.passes === 0 && game.explosions === 0 && !seen.pass) return ["decisionActions", "Step 5 of 7", "Decide under heat", "Hold grows the prize pile. Pass spends Tots. It can still explode."];
  if (game.unlocked.sac && game.risk > SPUD.riskFundSpud && game.sac <= 0 && !game.potato && !seen.moveSac) return ["moveSac", "Step 6 of 7", "Meet the Spud Sac", "Move SPUD to safety. Cashing out resets your streak."];
  if (game.unlocked.sponsor && !game.unlocked.equipment) {
    if (game.potato && !seen.sponsorBreak) return ["sponsorBreak", "Step 6 of 7", "Sponsor Breaks unlocked", "During a live potato, earn Tots while it keeps cooking."];
    if (!seen.waitPotato) return ["waitPotato", "Step 6 of 7", "Sponsor Breaks unlocked", "Wait for the next potato, then the Sponsor Break button appears."];
  }
  if (game.unlocked.equipment && game.passes < 5 && !seen.equipment) return ["equipment", "Step 7 of 7", "Gear Bag unlocked", "Foil Wrap is your first gear. New gear appears as you hit milestones."];
  return null;
}

function autoDeliveryPaused(game) {
  const guide = guideFor(game);
  return !!guide && guide[0] !== "waitPotato";
}

function socialDeliveryAt(game, now = Date.now()) {
  if (!game.pendingSocialPotato || !game.connected || game.risk <= 0 || game.potato || deliveryProtectionActive(game)) return game.nextAt || 0;
  const soon = now + SOCIAL_DELIVERY_DELAY_MS;
  return game.nextAt ? Math.min(game.nextAt, soon) : soon;
}

function soundUrl(file) {
  if (/^(?:https?:|data:|blob:|\/)/i.test(String(file || ""))) return file;
  return assetUrl(...String(file || "").split("/").filter(Boolean));
}

function goldenWindowActive(p) {
  return !!p && p.power === "golden-window" && p.age <= 10;
}

function goldenWindowUrgent(p) {
  return !!p && p.power === "golden-window" && p.age > 6 && p.age <= 10;
}

function recentOverdriveTaps(taps, now = Date.now()) {
  return (Array.isArray(taps) ? taps : []).filter((time) => now - Number(time) <= 2400);
}

function overdriveBoostPercent(game, now = Date.now()) {
  if (!game.potato || game.potato.power !== "overdrive" || !game.overdriveActive) return 0;
  const tapsPerSecond = recentOverdriveTaps(game.overdriveTaps, now).length / 2.4;
  return clamp(60 + tapsPerSecond * 34, 60, 220);
}

function overdriveGrowthMultiplier(game) {
  const boost = overdriveBoostPercent(game);
  return boost ? 1 + boost / 100 : 1;
}

function activePowerMode(game) {
  return !!game.potato && (goldenWindowActive(game.potato) || game.potato.power === "overdrive");
}

function hourLabel(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const display = normalized % 12 || 12;
  return `${display} ${suffix}`;
}

function isSleepHour(hour, start, end) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function protectionInfo(game, now = Date.now()) {
  const snoozeMs = Math.max(0, Number(game.snoozeUntil || 0) - now);
  if (snoozeMs > 0) {
    return {
      active: true,
      status: "Snoozed",
      note: `Ends in ${Math.ceil(snoozeMs / 60000)} min`
    };
  }
  const hour = new Date(now).getHours();
  const sleeping = !!game.sleepEnabled && isSleepHour(hour, Number(game.sleepStart), Number(game.sleepEnd));
  return {
    active: sleeping,
    status: sleeping ? "Sleeping" : "Open",
    note: game.sleepEnabled ? `Sleep ${hourLabel(game.sleepStart)} to ${hourLabel(game.sleepEnd)} local` : "Sleep schedule off"
  };
}

function deliveryProtectionActive(game) {
  return !!game.unlocked?.protection && protectionInfo(game).active;
}

function powerCopy(power) {
  if (power === "overdrive") {
    return {
      kind: "overdrive",
      title: "OVERDRIVE READY",
      subtitle: "Hit the button. Keep tapping for bigger SPUD growth.",
      note: "This potato only. No extra explosion risk."
    };
  }
  return {
    kind: "golden",
    title: "GOLDEN WINDOW",
    subtitle: "Pass right now for +40% payout.",
    note: "This potato only. If the window closes, the bonus is gone."
  };
}

export default function App() {
  const [game, setGame] = useState(loadGame);
  const [socialInvite, setSocialInvite] = useState(readSocialInvite);
  const [giftLinkId, setGiftLinkId] = useState(readBackendGiftId);
  const [adModal, setAdModal] = useState(null);
  const [adReady, setAdReady] = useState(false);
  const [toast, setToast] = useState("");
  const [fxQueue, setFxQueue] = useState([]);
  const [activeFx, setActiveFx] = useState(null);
  const [boom, setBoom] = useState(null);
  const [babyCry, setBabyCry] = useState(0);
  const [walletBurning, setWalletBurning] = useState(false);
  const [walletPulsing, setWalletPulsing] = useState(false);
  const [flightFx, setFlightFx] = useState(null);
  const [spudTransferFx, setSpudTransferFx] = useState(null);
  const [spudWinFx, setSpudWinFx] = useState(null);
  const [badAdFiles, setBadAdFiles] = useState([]);
  const [gearOpen, setGearOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(null);
  const [realPlayers, setRealPlayers] = useState([]);
  const [playersStatus, setPlayersStatus] = useState("idle");
  const [friendSearch, setFriendSearch] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState([]);
  const [friendSearchStatus, setFriendSearchStatus] = useState("idle");
  const [messageDraft, setMessageDraft] = useState("");
  const [messageReveal, setMessageReveal] = useState(null);
  const [soundCheckOpen, setSoundCheckOpen] = useState(false);
  const refs = useRef({});
  const coachRef = useRef(null);
  const lastSoundRef = useRef({});
  const holdDroneRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioBuffersRef = useRef(new Map());
  const audioElementsRef = useRef(new Map());
  const noiseBuffersRef = useRef(new Map());
  const soundOnRef = useRef(true);
  const unlockedGearRef = useRef(null);
  const guide = guideFor(game);

  const selectedAvatar = avatars[game.avatar] || avatars[0];
  const sponsor = sponsors[game.sponsorSlot % sponsors.length];
  const selectedTarget = realPlayers[game.target] || null;
  const currentPassCost = passCost(game.potato, game.babyHandsRounds);
  const heatScore = game.potato ? clamp(game.potato.age / 92, 0, 1.2) : 0;
  const overdriveBoost = overdriveBoostPercent(game);
  const currentRewardedAdFile = adFileAtIndex(game.nextAdIndex, badAdFiles);
  const showSoundCheck = soundCheckEnabled();

  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    soundOnRef.current = game.soundOn;
  }, [game]);

  useEffect(() => {
    const unlock = () => {
      if (!soundOnRef.current) return;
      const ctx = ensureAudio();
      ctx?.resume?.().catch(() => {});
      warmCoreSounds();
    };
    window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!game.connected) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await upsertBackendPlayer(game);
        const handle = result?.player?.handle || "";
        if (!cancelled && handle) {
          setGame((old) => (old.playerHandle === handle ? old : { ...old, playerHandle: handle }));
        }
        if (!cancelled) refreshPlayerDirectory(false);
      } catch (error) {
        if (!cancelled) {
          setPlayersStatus("offline");
          showToast(error.message || "Player backend is not available.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.connected, game.playerId, game.playerName, game.avatar, game.wallet]);

  useEffect(() => {
    if (!game.connected) {
      setRealPlayers([]);
      setPlayersStatus("idle");
      setFriendSearchResults([]);
      setFriendSearchStatus("idle");
      return undefined;
    }
    refreshPlayerDirectory(true);
    const timer = setInterval(() => refreshPlayerDirectory(false), 30000);
    return () => clearInterval(timer);
  }, [game.connected, game.playerId]);

  useEffect(() => {
    if (!game.connected || !game.playerHandle) return undefined;
    refreshIncomingPotatoes(false);
    const timer = setInterval(() => refreshIncomingPotatoes(false), SOCIAL_INBOX_POLL_MS);
    return () => clearInterval(timer);
  }, [game.connected, game.playerHandle, game.playerName, game.potato?.id, game.pendingSocialPotato?.id]);

  useEffect(() => {
    if (game.target > 0 && game.target >= realPlayers.length) {
      setGame((old) => ({ ...old, target: 0 }));
    }
  }, [game.target, realPlayers.length]);

  useEffect(() => {
    if (!socialInvite) return;
    setGame((old) => {
      if (old.pendingSocialPotato?.id === socialInvite.id || old.log.some((entry) => entry.socialInviteId === socialInvite.id)) return old;
      const queued = {
        ...old,
        pendingSocialPotato: socialInvite,
        unlocked: { ...old.unlocked, activity: true, target: true }
      };
      return addLog({
        ...queued,
        nextAt: socialDeliveryAt(queued)
      }, secretSocialCopy(socialInvite), "info");
    });
    showToast(socialQueueToast(socialInvite, game));
    notifyPlayer("Hot Potato incoming", socialInvite.kind === "pigeon" ? `${socialInvite.from} sent a message potato.` : "A social potato is waiting.");
    clearSocialInviteUrl();
    setSocialInvite(null);
  }, [socialInvite]);

  useEffect(() => {
    if (!giftLinkId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const claimed = await claimBackendSocialPotato(giftLinkId, game.playerName);
        if (cancelled) return;
        if (!claimed?.kind || !socialPotatoes[claimed.kind]) {
          throw new Error("That Hot Potato link was empty.");
        }
        setSocialInvite({
          kind: claimed.kind,
          from: (claimed.from || "A friend").slice(0, 24),
          to: (claimed.to || "").slice(0, 24),
          message: (claimed.message || "").slice(0, 220),
          id: (claimed.id || giftLinkId).slice(0, 64)
        });
      } catch (error) {
        if (!cancelled) {
          showToast(error.message || "That Hot Potato link could not be claimed.");
        }
      } finally {
        if (!cancelled) {
          clearSocialInviteUrl();
          setGiftLinkId("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [giftLinkId]);

  useEffect(() => {
    if (!adModal) return undefined;
    setAdReady(false);
    const timer = setTimeout(() => setAdReady(true), 4200);
    return () => clearTimeout(timer);
  }, [adModal, currentRewardedAdFile]);

  useEffect(() => {
    if (!adModal) return;
    setMobileSheet(null);
    setGearOpen(false);
  }, [adModal]);

  useEffect(() => {
    if (!game.potato) return;
    setMobileSheet(null);
    setGearOpen(false);
  }, [game.potato?.id]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!game.unlocked.equipment && gearOpen) setGearOpen(false);
  }, [game.unlocked.equipment, gearOpen]);

  useLayoutEffect(() => {
    if (!guide) return;
    const mobile = window.matchMedia?.("(max-width: 900px)").matches;
    if (!mobile) return;
    const target = guide[0];
    const walletTargets = new Set(["spudPile", "spudSac", "watchAd", "fundRisk", "fundFromSac", "moveSac", "sponsorPanel", "protection"]);
    if (walletTargets.has(target)) {
      setGearOpen(false);
      setMobileSheet("wallet");
    } else if (target === "activity") {
      setGearOpen(false);
      setMobileSheet("activity");
    } else if (target === "equipment") {
      setMobileSheet(null);
      setGearOpen(true);
    } else if (target !== "equipment" && mobileSheet) {
      setMobileSheet(null);
    }
  }, [guide?.[0], mobileSheet]);

  useEffect(() => {
    const currentGear = unlockedEquipmentEntries(game).map(([key]) => key);
    if (!game.onboarded || !game.connected) {
      unlockedGearRef.current = currentGear;
      return;
    }
    if (!unlockedGearRef.current) {
      unlockedGearRef.current = currentGear;
      return;
    }
    const newlyUnlocked = currentGear.filter((key) => !unlockedGearRef.current.includes(key));
    unlockedGearRef.current = currentGear;
    if (newlyUnlocked.length) {
      const item = equipment[newlyUnlocked[newlyUnlocked.length - 1]];
      enqueueFx({
        type: "gear-unlock",
        title: "GEAR UNLOCKED",
        subtitle: item.name,
        note: "Available in the Gear Bag.",
        gearKind: item.icon,
        duration: 2800,
        sfx: "chest"
      });
    }
  }, [game.onboarded, game.connected, game.unlocked.equipment, game.passes, game.explosions, game.won, game.bestWin, game.bestStreak]);

  useEffect(() => {
    if (activeFx || !fxQueue.length) return;
    const [next, ...rest] = fxQueue;
    setFxQueue(rest);
    setActiveFx(next);
  }, [activeFx, fxQueue]);

  useEffect(() => {
    if (!activeFx) return undefined;
    const timer = setTimeout(() => setActiveFx(null), activeFx.duration || 2400);
    return () => clearTimeout(timer);
  }, [activeFx?.id]);

  useEffect(() => {
    if (!activeFx) return;
    if (activeFx.sfx) playSfx(activeFx.sfx, activeFx.sfxIntensity || 1);
    if (activeFx.soundGroup) playRandomSound(activeFx.soundGroup, activeFx.soundVolume ?? 0.9);
    if (activeFx.soundFile) playSoundFile(activeFx.soundFile, activeFx.soundVolume ?? 0.9);
  }, [activeFx?.id]);

  useEffect(() => {
    if (!boom) return undefined;
    const timer = setTimeout(() => setBoom(null), 2400);
    return () => clearTimeout(timer);
  }, [boom]);

  useEffect(() => {
    if (!boom?.potatoId) return;
    setGame((old) => (
      old.potato?.id === boom.potatoId
        ? { ...old, potato: null, holding: false, sponsorBreak: null }
        : old
    ));
  }, [boom?.id, boom?.potatoId]);

  useEffect(() => {
    if (!walletBurning) return undefined;
    const timer = setTimeout(() => setWalletBurning(false), 2200);
    return () => clearTimeout(timer);
  }, [walletBurning]);

  useEffect(() => {
    if (!walletPulsing) return undefined;
    const timer = setTimeout(() => setWalletPulsing(false), 900);
    return () => clearTimeout(timer);
  }, [walletPulsing]);

  useEffect(() => {
    if (!flightFx) return undefined;
    const timer = setTimeout(() => setFlightFx(null), flightFx.type === "golden" ? 1650 : 900);
    return () => clearTimeout(timer);
  }, [flightFx]);

  useEffect(() => {
    if (!spudTransferFx) return undefined;
    const timer = setTimeout(() => setSpudTransferFx(null), 1100);
    return () => clearTimeout(timer);
  }, [spudTransferFx]);

  useEffect(() => {
    if (!spudWinFx) return undefined;
    const timer = setTimeout(() => setSpudWinFx(null), 1900);
    return () => clearTimeout(timer);
  }, [spudWinFx]);

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((old) => {
        let next = applyPassiveAdRevenue(old);
        const protectedNow = deliveryProtectionActive(next);
        const tutorialPaused = autoDeliveryPaused(next) && !next.potato;
        const socialPending = !!next.pendingSocialPotato;
        if ((protectedNow || (tutorialPaused && !socialPending)) && !next.potato && next.nextAt) {
          next = { ...next, nextAt: 0 };
        }
        if (!protectedNow && socialPending && next.connected && next.risk > 0 && !next.potato) {
          const socialAt = socialDeliveryAt(next);
          if (socialAt && next.nextAt !== socialAt) next = { ...next, nextAt: socialAt };
        }
        if (!protectedNow && !tutorialPaused && !socialPending && next.connected && next.risk > 0 && !next.potato && !next.nextAt) {
          next = { ...next, nextAt: Date.now() + ACTIVE_DELIVERY_MIN_MS + Math.random() * ACTIVE_DELIVERY_RANGE_MS };
        }
        if (!protectedNow && (socialPending || !tutorialPaused) && next.connected && !next.potato && next.nextAt && Date.now() >= next.nextAt) {
          next = deliverPotato(next);
        }
        if (next.potato) {
          const powerGrowth = overdriveGrowthMultiplier(next);
          const updated = advancePotato(next.potato, next.holding, powerGrowth);
          const explode = updated.fuse <= 0 || Math.random() < explosionChance(updated, next.holding);
          if (explode) {
            const socialKind = updated.socialKind || "";
            const sender = updated.prankFrom || updated.sender || "A friend";
            const burned = socialKind === "pigeon" ? 0 : next.risk;
            stopHoldDrone();
            const boomRect = document.querySelector(".potato-wrap")?.getBoundingClientRect();
            playExplosionSound();
            setBoom({
              id: Date.now(),
              potatoId: updated.id,
              burned,
              x: boomRect ? boomRect.left + boomRect.width / 2 : window.innerWidth / 2,
              y: boomRect ? boomRect.top + boomRect.height / 2 : window.innerHeight * 0.45
            });
            setWalletBurning(true);
            setFlightFx(null);
            if (socialKind === "tainted") {
              enqueueFx({
                type: "danger",
                title: `${sender} JUST MASHED YOU!`,
                subtitle: "That was a Tainted Tater.",
                note: burned > 0 ? `${fmt(burned)} SPUD got blasted out of the pile.` : "Pure prank energy. No SPUD was exposed.",
                duration: 3400
              });
            } else if (socialKind === "pigeon") {
              revealMessagePotato(updated, "popped");
              enqueueFx({
                type: "pigeon",
                title: "MESSAGE POPPED",
                subtitle: `${sender} tucked a note inside.`,
                note: "Read it before you toss a reply.",
                duration: 2800
              });
            } else if (socialKind === "golden") {
              enqueueFx({
                type: "golden",
                title: "GOLDEN GIFT POPPED",
                subtitle: `${sender}'s Golden Potato went boom before payday.`,
                note: "The Spud Sac still stayed safe.",
                duration: 3000
              });
            }
            const explosionCopy = socialKind === "tainted"
              ? `${sender} mashed you with a Tainted Tater. Explosion burned ${fmt(burned)} SPUD from the Spud Pile.`
              : socialKind === "pigeon"
                ? `${sender}'s Pigeon Potato popped open with a message.`
              : socialKind === "golden"
                ? `${sender}'s Golden Potato exploded. ${fmt(burned)} SPUD burned from the Spud Pile.`
                : `Explosion burned ${fmt(burned)} SPUD from the Spud Pile. Spud Sac stayed safe.`;
            next = addLog({
              ...markGuidesSeen(next, "pass"),
              potato: null,
              holding: false,
              sponsorBreak: null,
              risk: socialKind === "pigeon" ? next.risk : 0,
              burned: next.burned + burned,
              explosions: socialKind === "pigeon" ? next.explosions : next.explosions + 1,
              streak: socialKind === "pigeon" ? next.streak : 0,
              quickPassChain: socialKind === "pigeon" ? next.quickPassChain : 0,
              overdriveActive: false,
              overdriveTaps: [],
              pendingPower: socialKind === "pigeon" ? next.pendingPower : "",
              pendingPowerStreak: socialKind === "pigeon" ? next.pendingPowerStreak : 0,
              walletBurnNonce: socialKind === "pigeon" ? next.walletBurnNonce : next.walletBurnNonce + 1,
              unlocked: { ...next.unlocked, activity: true, sac: true }
            }, explosionCopy, "bad");
          } else {
            next = {
              ...next,
              potato: updated,
              overdriveTaps: recentOverdriveTaps(next.overdriveTaps)
            };
          }
        }
        if (next.sponsorBreak && Date.now() >= next.sponsorBreak.endsAt) {
          next = finishSponsorBreak(next);
        }
        return unlockForProgress(next);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!game.connected || game.risk <= 0 || game.potato || deliveryProtectionActive(game)) return undefined;
    const now = Date.now();
    const hasSocial = !!game.pendingSocialPotato;
    const targetAt = hasSocial
      ? socialDeliveryAt(game, now)
      : game.nextAt || now + READY_DELIVERY_MIN_MS + Math.random() * READY_DELIVERY_RANGE_MS;
    const delay = clamp(targetAt - now, hasSocial ? 250 : 700, hasSocial ? 1600 : DELIVERY_BACKSTOP_MS);
    const timer = setTimeout(() => {
      setGame((old) => {
        if (!old.connected || old.risk <= 0 || old.potato || deliveryProtectionActive(old)) return old;
        if (old.pendingSocialPotato) return deliverPotato({ ...old, nextAt: 0 });
        return deliverPotato({ ...old, nextAt: 0 });
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [game.connected, game.risk, game.potato?.id, game.nextAt, game.pendingSocialPotato?.id, game.sleepEnabled, game.snoozeUntil, game.unlocked.protection]);

  useLayoutEffect(() => {
    if (!guide || !coachRef.current) return;
    const target = refs.current[guide[0]];
    if (!target) return;
    const frame = requestAnimationFrame(() => positionCoach(coachRef.current, target));
    const refresh = () => positionCoach(coachRef.current, target);
    window.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, [guide?.[0], guide?.[2], mobileSheet, game.onboarded, game.connected, game.tots, game.risk, game.sac, game.potato?.id, game.passes]);

  function showToast(text) {
    setToast(text);
  }

  function requestNotifications() {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    Notification.requestPermission().catch(() => {});
  }

  function notifyPlayer(title, body = "") {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body });
    } catch {
      // Notifications are a convenience; gameplay should continue without them.
    }
  }

  function revealMessagePotato(potato, outcome = "popped") {
    if (!potato?.message) return;
    setMessageReveal({
      id: Date.now(),
      from: potato.sender || potato.prankFrom || "A friend",
      message: potato.message,
      outcome
    });
    notifyPlayer("Hot Potato message", `${potato.sender || "A friend"} sent you a message.`);
  }

  async function refreshPlayerDirectory(showLoading = false) {
    if (!game.connected) {
      setRealPlayers([]);
      setPlayersStatus("idle");
      return;
    }
    if (showLoading) setPlayersStatus("loading");
    try {
      const result = await listBackendPlayers(game.playerId);
      if (!result.configured) {
        setRealPlayers([]);
        setPlayersStatus("offline");
        return;
      }
      const players = (result.players || [])
        .filter((player) => player.id && player.id !== game.playerId)
        .map((player) => ({
          id: player.id,
          name: player.username || "Player",
          handle: player.handle || displayHandle(player),
          avatarId: Number(player.avatarId ?? player.avatar_id ?? 0) || 0,
          lastSeenAt: player.lastSeenAt || player.last_seen_at || "",
          wallet: player.wallet || ""
        }));
      setRealPlayers(players);
      setPlayersStatus(players.length ? "ready" : "empty");
    } catch {
      setRealPlayers([]);
      setPlayersStatus("offline");
    }
  }

  async function searchFriends() {
    const query = cleanUsername(friendSearch).trim();
    if (query.length < 2) {
      playSfx("error");
      showToast("Type at least 2 letters.");
      return;
    }
    setFriendSearchStatus("loading");
    try {
      const result = await searchBackendPlayers(query, game.playerId);
      if (!result.configured) {
        setFriendSearchResults([]);
        setFriendSearchStatus("offline");
        showToast("Friend search needs the backend online.");
        return;
      }
      const existingIds = new Set(realPlayers.map((player) => player.id));
      const players = (result.players || [])
        .filter((player) => player.id && player.id !== game.playerId && !existingIds.has(player.id))
        .map((player) => ({
          id: player.id,
          name: player.username || "Player",
          handle: player.handle || displayHandle(player),
          avatarId: Number(player.avatarId ?? player.avatar_id ?? 0) || 0,
          lastSeenAt: player.lastSeenAt || player.last_seen_at || "",
          wallet: player.wallet || ""
        }));
      setFriendSearchResults(players);
      setFriendSearchStatus(players.length ? "ready" : "empty");
    } catch (error) {
      setFriendSearchResults([]);
      setFriendSearchStatus("offline");
      showToast(error.message || "Friend search is offline.");
    }
  }

  async function addFriendFromSearch(friend) {
    if (!friend?.id) return;
    playSfx("tap");
    setFriendSearchStatus("adding");
    try {
      const result = await addBackendFriend(game.playerId, friend.id);
      if (!result.configured) {
        setFriendSearchStatus("offline");
        showToast("Friend backend is offline.");
        return;
      }
      await refreshPlayerDirectory(false);
      setFriendSearchResults((old) => old.filter((player) => player.id !== friend.id));
      setFriendSearchStatus("ready");
      showToast(`${playerDisplayName(friend)} added as a friend.`);
    } catch (error) {
      setFriendSearchStatus("offline");
      showToast(error.message || "Could not add friend.");
    }
  }

  async function refreshIncomingPotatoes() {
    if (!game.connected || !game.playerHandle || game.potato || game.pendingSocialPotato) return;
    try {
      const result = await listBackendSocialInbox(game.playerHandle);
      const incoming = (result.potatoes || []).find((item) => item.id && socialPotatoes[item.kind]);
      if (!incoming) return;
      const claimed = await claimBackendSocialPotato(incoming.id, game.playerName);
      if (!claimed?.kind || !socialPotatoes[claimed.kind]) return;
      const invite = {
        kind: claimed.kind,
        from: (claimed.from || incoming.from || "A friend").slice(0, 24),
        to: (claimed.to || incoming.to || game.playerHandle || "").slice(0, 32),
        message: (claimed.message || incoming.message || "").slice(0, 220),
        id: (claimed.id || incoming.id).slice(0, 64)
      };
      setGame((old) => {
        if (old.potato || old.pendingSocialPotato || old.log.some((entry) => entry.socialInviteId === invite.id)) return old;
        const queued = {
          ...old,
          pendingSocialPotato: invite,
          unlocked: { ...old.unlocked, activity: true, target: true }
        };
        return addLog({
          ...queued,
          nextAt: socialDeliveryAt(queued)
        }, secretSocialCopy(invite), "info");
      });
      showToast(socialQueueToast(invite, game));
      notifyPlayer("Hot Potato incoming", invite.kind === "pigeon" ? `${invite.from} sent a message potato.` : "A social potato is waiting.");
    } catch {
      // Keep social play non-blocking if the backend is temporarily unavailable.
    }
  }

  function clearFx() {
    setFxQueue([]);
    setActiveFx(null);
  }

  function markGuidesSeen(gameState, ...keys) {
    const seenGuides = { ...(gameState.seenGuides || {}) };
    keys.filter(Boolean).forEach((key) => {
      seenGuides[key] = true;
    });
    return { ...gameState, seenGuides };
  }

  function animateSpudToPile(sourceName = "fundRisk") {
    const target = refs.current.spudPile;
    if (!target) return;
    const source = refs.current[sourceName] || refs.current.fundRisk || refs.current.spudSac || refs.current.watchAd || target;
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const fromX = sourceRect.left + sourceRect.width / 2;
    const fromY = sourceRect.top + sourceRect.height / 2;
    const toX = targetRect.left + targetRect.width * 0.62;
    const toY = targetRect.top + targetRect.height * 0.56;
    setSpudTransferFx({
      id: Date.now(),
      fromX,
      fromY,
      toX,
      toY,
      count: 18
    });
  }

  function ensureAudio() {
    if (!soundOnRef.current || typeof window === "undefined") return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
    return audioCtxRef.current;
  }

  function tone(freq, offset = 0, duration = 0.14, type = "sine", gain = 0.04, endFreq = freq) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const start = ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), start);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.04);
  }

  function noise(offset = 0, duration = 0.16, gain = 0.035, filterFreq = 1200, filterType = "bandpass") {
    const ctx = ensureAudio();
    if (!ctx) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const key = `${ctx.sampleRate}:${frames}`;
    let buffer = noiseBuffersRef.current.get(key);
    if (!buffer) {
      buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
      noiseBuffersRef.current.set(key, buffer);
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const start = ctx.currentTime + offset;
    src.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(start);
    src.stop(start + duration + 0.03);
  }

  function playSfx(name, intensity = 1) {
    if (!soundOnRef.current) return;
    const power = clamp(intensity, 0.25, 2);
    ensureAudio();
    if (name === "connect") {
      tone(392, 0, 0.11, "triangle", 0.038);
      tone(587, 0.08, 0.14, "triangle", 0.04);
      tone(784, 0.18, 0.2, "sine", 0.034);
    } else if (name === "tap") {
      tone(360, 0, 0.055, "square", 0.018, 520);
    } else if (name === "arrive") {
      tone(220, 0, 0.1, "square", 0.036);
      tone(440, 0.09, 0.16, "sawtooth", 0.046);
      noise(0.02, 0.12, 0.018, 1800, "bandpass");
    } else if (name === "holdOn") {
      tone(150, 0, 0.28, "sawtooth", 0.032, 230);
      noise(0.03, 0.16, 0.018, 1200, "bandpass");
    } else if (name === "holdOff") {
      tone(260, 0, 0.12, "triangle", 0.025, 190);
    } else if (name === "pass") {
      noise(0, 0.18, 0.048, 1200, "highpass");
      tone(520, 0.03, 0.12, "triangle", 0.026, 760);
    } else if (name === "win") {
      [659, 784, 988, 1175, 1318, 1568].forEach((note, i) => tone(note, i * 0.045, 0.12, "triangle", 0.026 + Math.min(power, 1.4) * 0.006));
      noise(0.02, 0.24, 0.018, 2800, "bandpass");
    } else if (name === "boom") {
      tone(118, 0, 0.14, "square", 0.08, 74);
      tone(64, 0.06, 0.4, "sawtooth", 0.075, 32);
      noise(0, 0.48, 0.13, 520, "lowpass");
      noise(0.06, 0.28, 0.075, 1800, "bandpass");
    } else if (name === "error") {
      tone(180, 0, 0.11, "square", 0.04, 120);
      tone(132, 0.11, 0.16, "square", 0.035, 92);
    } else if (name === "fund") {
      [440, 554, 659, 880].forEach((note, i) => tone(note, i * 0.04, 0.1, "triangle", 0.026));
    } else if (name === "chest") {
      tone(330, 0, 0.1, "triangle", 0.03);
      tone(660, 0.08, 0.15, "triangle", 0.026);
    } else if (name === "power") {
      tone(220, 0, 0.12, "sawtooth", 0.034, 440);
      tone(880, 0.1, 0.24, "triangle", 0.036, 1320);
      noise(0.02, 0.22, 0.032, 2600, "bandpass");
    } else if (name === "heat") {
      tone(260 + power * 190, 0, 0.055, "sawtooth", 0.018 + power * 0.008, 180 + power * 110);
      noise(0.01, 0.055, 0.01 + power * 0.006, 1600 + power * 900, "bandpass");
    } else if (name === "baby") {
      tone(520, 0, 0.1, "square", 0.03, 420);
      tone(390, 0.1, 0.15, "square", 0.026, 320);
    } else if (name === "snooze") {
      tone(620, 0, 0.12, "sine", 0.024, 420);
      tone(420, 0.11, 0.18, "sine", 0.022, 300);
    } else if (name === "overdrive") {
      tone(180, 0, 0.12, "sawtooth", 0.034, 360);
      tone(720, 0.07, 0.2, "square", 0.026, 1280);
      noise(0.01, 0.18, 0.032, 3000, "bandpass");
    }
  }

  function startHoldDrone() {
    if (holdDroneRef.current || !soundOnRef.current) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const filter = ctx.createBiquadFilter();
    const master = ctx.createGain();
    const voices = [];
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(720, ctx.currentTime);
    filter.Q.setValueAtTime(0.62, ctx.currentTime);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.connect(filter).connect(ctx.destination);
    for (let i = 0; i < 8; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(36 * Math.pow(2, i / 2), ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.connect(gain).connect(master);
      osc.start();
      voices.push({ osc, gain });
    }
    const drone = { ctx, filter, master, voices, phase: Math.random(), lastAt: ctx.currentTime, timer: null };
    holdDroneRef.current = drone;
    const update = () => {
      if (!holdDroneRef.current) return;
      const now = ctx.currentTime;
      const dt = clamp(now - drone.lastAt, 0, 0.25);
      drone.lastAt = now;
      drone.phase = (drone.phase + dt * 0.075) % 1;
      master.gain.setTargetAtTime(0.014, now, 0.28);
      filter.frequency.setTargetAtTime(640 + Math.sin(now * 0.7) * 42, now, 0.4);
      voices.forEach((voice, index) => {
        const phase = (drone.phase + index / voices.length) % 1;
        const freq = 36 * Math.pow(2, phase * 4.15);
        const amp = Math.pow(Math.sin(Math.PI * phase), 1.85) * 0.42;
        const shimmer = 1 + Math.sin(now * 1.15 + index * 1.9) * 0.006 + Math.sin(now * 0.41 + index * 2.7) * 0.004;
        voice.osc.frequency.setTargetAtTime(freq * shimmer, now, 0.055);
        voice.gain.gain.setTargetAtTime(amp, now, 0.18);
      });
    };
    update();
    drone.timer = setInterval(update, 90);
  }

  function stopHoldDrone() {
    const drone = holdDroneRef.current;
    if (!drone) return;
    holdDroneRef.current = null;
    clearInterval(drone.timer);
    const now = drone.ctx.currentTime;
    drone.master.gain.cancelScheduledValues(now);
    drone.master.gain.setTargetAtTime(0.0001, now, 0.14);
    drone.voices.forEach((voice) => {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, 0.12);
      try {
        voice.osc.stop(now + 0.45);
      } catch {
        // It may already be stopping after a fast pass or explosion.
      }
    });
  }

  function enqueueFx(fx) {
    setFxQueue((old) => [
      ...old,
      {
        id: Date.now() + Math.random(),
        duration: 2400,
        ...fx
      }
    ]);
  }

  function pickSound(group) {
    const files = soundFiles[group] || [];
    if (!files.length) return "";
    const last = lastSoundRef.current[group];
    let next = files[Math.floor(Math.random() * files.length)];
    if (files.length > 1 && next === last) {
      next = files[(files.indexOf(next) + 1 + Math.floor(Math.random() * (files.length - 1))) % files.length];
    }
    lastSoundRef.current[group] = next;
    return next;
  }

  function playRandomSound(group, volume = 0.9) {
    if (!soundOnRef.current) return null;
    const file = pickSound(group);
    if (!file) return null;
    return playSoundFile(file, volume);
  }

  function playSoundFile(file, volume = 0.9, mode = "auto") {
    if (!soundOnRef.current || !file) return null;
    const ctx = ensureAudio();
    const url = soundUrl(file);
    const cached = audioBuffersRef.current.get(url);
    if (ctx && (cached?.buffer || (mode === "buffer" && cached?.promise))) {
      const buffered = playSoundBuffer(url, volume, ctx);
      if (buffered) return buffered;
    }
    const audio = getAssetAudio(url);
    audio.volume = clamp(volume, 0, 1);
    audio.muted = false;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // Some mobile browsers reject currentTime before metadata loads.
    }
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        console.warn("Could not play sound asset with HTML audio", url, error);
        playSoundBuffer(url, volume, ctx);
      });
    }
    return audio;
  }

  function playExplosionSound() {
    const file = pickSound("potatoExplode");
    if (!file) {
      playSfx("boom", 1.5);
      return null;
    }
    return playSoundFile(file, 1, "buffer");
  }

  function getAssetAudio(url) {
    const existing = audioElementsRef.current.get(url);
    if (existing) return existing;
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.playsInline = true;
    audioElementsRef.current.set(url, audio);
    try {
      audio.load();
    } catch {
      // Loading can be deferred by the browser; play() will try again later.
    }
    return audio;
  }

  function playSoundBuffer(url, volume = 0.9, ctx = ensureAudio()) {
    if (!ctx || !url) return null;
    const playBuffer = (buffer) => {
      const src = ctx.createBufferSource();
      const amp = ctx.createGain();
      src.buffer = buffer;
      amp.gain.setValueAtTime(clamp(volume, 0, 1), ctx.currentTime);
      src.connect(amp).connect(ctx.destination);
      src.start();
      return src;
    };
    const cached = audioBuffersRef.current.get(url);
    if (cached?.buffer) return playBuffer(cached.buffer);
    if (ctx) {
      if (!cached?.promise) {
        const promise = fetch(url)
          .then((response) => {
            if (!response.ok) throw new Error(`Sound HTTP ${response.status}`);
            return response.arrayBuffer();
          })
          .then((data) => ctx.decodeAudioData(data.slice(0)))
          .then((buffer) => {
            audioBuffersRef.current.set(url, { buffer });
            return buffer;
          })
          .catch((error) => {
            audioBuffersRef.current.delete(url);
            console.warn("Could not decode sound asset", url, error);
            return null;
          });
        audioBuffersRef.current.set(url, { promise });
      }
      audioBuffersRef.current.get(url)?.promise?.then((buffer) => {
        if (buffer) playBuffer(buffer);
      });
      return { pending: true };
    }
    return null;
  }

  function soundGroupFiles(group) {
    if (group === "aLotOfSpud") return soundFiles.aLotOfSpud ? [soundFiles.aLotOfSpud] : [];
    return soundFiles[group] || [];
  }

  function soundGroupLabel(group) {
    return {
      hotStreak: "Hot Streak",
      potatoExplode: "Potato Explode",
      babyVoice: "Baby Hands Voice",
      babyCry: "Baby Hands Cry",
      scary: "Scary Hold",
      aLotOfSpud: "A Lot of SPUD"
    }[group] || group;
  }

  function playSoundCheckOne(group) {
    warmCoreSounds();
    if (group === "aLotOfSpud") return playSoundFile(soundFiles.aLotOfSpud, 0.94);
    return playRandomSound(group, 0.9);
  }

  function playSoundCheckGroup(group) {
    warmCoreSounds();
    const files = soundGroupFiles(group);
    files.forEach((file, index) => {
      window.setTimeout(() => playSoundFile(file, 0.9), index * 1050);
    });
    showToast(`Testing ${files.length} ${soundGroupLabel(group)} sound${files.length === 1 ? "" : "s"}.`);
  }

  function warmCoreSounds() {
    ["hotStreak", "potatoExplode", "babyVoice", "babyCry", "scary"].forEach(warmSoundGroup);
    if (!soundFiles.aLotOfSpud) return;
    const url = soundUrl(soundFiles.aLotOfSpud);
    if (!url || audioBuffersRef.current.has(url)) return;
    getAssetAudio(url);
    const ctx = ensureAudio();
    if (!ctx) return;
    const promise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Sound HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data.slice(0)))
      .then((buffer) => {
        audioBuffersRef.current.set(url, { buffer });
        return buffer;
      })
      .catch((error) => {
        audioBuffersRef.current.delete(url);
        console.warn("Could not preload sound asset", url, error);
        return null;
      });
    audioBuffersRef.current.set(url, { promise });
  }

  function warmSoundGroup(group) {
    const files = soundFiles[group] || [];
    files.forEach((file) => {
      const url = soundUrl(file);
      if (!url || audioBuffersRef.current.has(url)) return;
      getAssetAudio(url);
      const ctx = ensureAudio();
      if (!ctx) return;
      const promise = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Sound HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data.slice(0)))
        .then((buffer) => {
          audioBuffersRef.current.set(url, { buffer });
          return buffer;
        })
        .catch((error) => {
          audioBuffersRef.current.delete(url);
          console.warn("Could not preload sound asset", url, error);
          return null;
        });
      audioBuffersRef.current.set(url, { promise });
    });
  }

  function announceHotStreak(streak, power) {
    playSfx("power");
    enqueueFx({
      type: "hot-streak",
      title: "HOT STREAK",
      subtitle: `Streak ${streak} unlocked ${powerName(power)} next.`,
      note: "Your next Hot Potato gets a surprise power run.",
      duration: 5400,
      soundGroup: "hotStreak",
      soundVolume: 0.94
    });
  }

  function announcePower(power, streak) {
    const copy = powerCopy(power);
    enqueueFx({
      type: copy.kind,
      title: copy.title,
      subtitle: copy.subtitle,
      note: `Streak ${streak || game.streak} power. ${copy.note}`,
      duration: power === "golden-window" ? 3600 : 4200
    });
  }

  function announceBabyHands() {
    enqueueFx({ type: "baby", title: "YOU HAVE", subtitle: "", note: "", duration: 1200, sfx: "baby" });
    enqueueFx({
      type: "baby",
      title: "BABY HANDS",
      subtitle: "Early passes cost 2x Tots for 5 rounds.",
      note: "Wait a few seconds before passing to dodge the penalty.",
      duration: 5600,
      soundGroup: "babyVoice",
      soundVolume: 0.95
    });
  }

  function register(name) {
    return (node) => {
      if (node) refs.current[name] = node;
    };
  }

  function completeOnboarding() {
    clearFx();
    playSfx("tap");
    const playerName = cleanUsername(game.playerName).trim();
    if (!validUsername(playerName)) {
      playSfx("error");
      showToast("Pick a unique username first.");
      return;
    }
    setGame((old) => ({ ...old, playerName, onboarded: true }));
    requestNotifications();
    showToast(`Welcome, ${playerName}.`);
  }

  function connect() {
    clearFx();
    playSfx("connect");
    warmCoreSounds();
    if (!validUsername(game.playerName)) {
      playSfx("error");
      setGame((old) => ({ ...old, onboarded: false }));
      showToast("Pick a unique username first.");
      return;
    }
    setGame((old) => markGuidesSeen({
        ...initialGame,
        onboarded: old.onboarded,
        playerId: coercePlayerId(old.playerId) || getOrCreatePlayerId(),
        playerName: cleanUsername(old.playerName).trim(),
        avatar: old.avatar,
        seenGuides: { ...(old.seenGuides || {}) },
        pendingSocialPotato: old.pendingSocialPotato || null,
        log: old.log || [],
        socialSends: old.socialSends || initialGame.socialSends,
        socialXp: old.socialXp || 0,
        unlocked: { ...initialGame.unlocked, activity: true, target: true },
        connected: true,
        wallet: "0xSPUD...DEMO"
      },
      "connect"
    ));
    showToast("Demo wallet connected.");
    requestNotifications();
  }

  function reset() {
    clearFx();
    stopHoldDrone();
    playSfx("tap");
    localStorage.removeItem(SAVE_KEY);
    clearSocialInviteUrl();
    setGame({ ...initialGame, playerId: getOrCreatePlayerId() });
    setMobileSheet(null);
    setGearOpen(false);
    setAdModal(null);
    setAdReady(false);
    showToast("Full demo reset.");
  }

  function replayTips() {
    clearFx();
    stopHoldDrone();
    playSfx("tap");
    setGame((old) => ({
      ...initialGame,
      onboarded: old.onboarded,
      playerId: coercePlayerId(old.playerId) || getOrCreatePlayerId(),
      playerName: cleanUsername(old.playerName).trim(),
      avatar: old.avatar,
      seenGuides: {}
    }));
    setAdModal(null);
    setAdReady(false);
    showToast("Tutorial tips reset.");
  }

  function toggleSound() {
    const nextSound = !game.soundOn;
    soundOnRef.current = nextSound;
    setGame((old) => ({ ...old, soundOn: nextSound }));
    if (nextSound) {
      playSfx("connect");
      warmCoreSounds();
      if (game.holding && game.potato) startHoldDrone();
      showToast("Sound on.");
    } else {
      stopHoldDrone();
      showToast("Sound off.");
    }
  }

  function claimAd() {
    if (!adReady) return;
    grantAdReward("Rewarded ad", true);
    setAdModal(null);
    setAdReady(false);
  }

  function grantAdReward(label = "Demo ad", advanceAd = false) {
    clearFx();
    playSfx("fund");
    setGame((old) => {
      const payout = rewardedAdPayout(old.ads);
      showToast(`+${payout.tots} Tots.`);
      return addLog({
        ...markGuidesSeen(old, "watchAd"),
        tots: Number((old.tots + payout.tots).toFixed(1)),
        ads: old.ads + 1,
        nextAdIndex: advanceAd ? old.nextAdIndex + 1 : old.nextAdIndex,
        creatorAdRevenue: Number((old.creatorAdRevenue + payout.revenue).toFixed(4))
      }, `${label} paid ${payout.tots} Tots. Ad pace: ${payout.tier}.`, "good");
    });
  }

  function skipBadAd(file) {
    if (!file) return;
    const nextBadFiles = badAdFiles.includes(file) ? badAdFiles : [...badAdFiles, file];
    setBadAdFiles(nextBadFiles);
    setAdReady(false);
    setGame((old) => ({
      ...old,
      nextAdIndex: old.nextAdIndex + 1,
      sponsorBreak: old.sponsorBreak?.adFile === file
        ? { ...old.sponsorBreak, adFile: adFileAtIndex(old.nextAdIndex, nextBadFiles) }
        : old.sponsorBreak
    }));
    showToast("Skipped an ad that did not render.");
  }

  function fundRisk() {
    clearFx();
    if (game.tots >= SPUD.riskFundTots && !game.potato) animateSpudToPile("fundRisk");
    setGame((old) => {
      if (old.tots < SPUD.riskFundTots || old.potato) {
        playSfx("error");
        showToast(old.potato ? "Wait until your hands are empty." : `Need ${SPUD.riskFundTots} Tots.`);
        return old;
      }
      playSfx("fund");
      const fundClicks = old.fundClicks + 1;
      return addLog({
        ...markGuidesSeen(old, "fundRisk"),
        fundClicks,
        sacToPileClicks: 0,
        tots: Number((old.tots - SPUD.riskFundTots).toFixed(1)),
        risk: old.risk + SPUD.riskFundSpud,
        spudCreated: old.spudCreated + SPUD.riskFundSpud,
        nextAt: old.nextAt || Date.now() + READY_DELIVERY_MIN_MS + Math.random() * READY_DELIVERY_RANGE_MS
      }, `${SPUD.riskFundTots} Tots converted into ${SPUD.riskFundSpud} SPUD in the Spud Pile.`, "good");
    });
  }

  function fundRiskFromSac() {
    clearFx();
    if (game.sac > 0 && !game.potato) animateSpudToPile("spudSac");
    setGame((old) => {
      if (old.potato || old.sac <= 0) {
        playSfx("error");
        showToast(old.potato ? "Wait until your hands are empty." : "No SPUD in the Spud Sac.");
        return old;
      }
      playSfx("fund");
      const moved = Math.min(SPUD.riskFundSpud, old.sac);
      const sacToPileClicks = (old.sacToPileClicks || 0) + 1;
      if (sacToPileClicks > 0 && sacToPileClicks % 10 === 0) {
        playSoundFile(soundFiles.aLotOfSpud, 0.96);
        enqueueFx({
          type: "spud",
          title: "A LOT OF SPUD",
          subtitle: "That Spud Pile is getting serious.",
          duration: 2400
        });
      }
      return addLog({
        ...markGuidesSeen(old, "fundFromSac"),
        sacToPileClicks,
        sac: old.sac - moved,
        risk: old.risk + moved,
        nextAt: old.nextAt || Date.now() + READY_DELIVERY_MIN_MS + Math.random() * READY_DELIVERY_RANGE_MS,
        unlocked: { ...old.unlocked, sac: true }
      }, `${fmt(moved)} SPUD moved from the Spud Sac into the Spud Pile.`, "info");
    });
  }

  function deliverPotato(old) {
    const social = old.pendingSocialPotato;
    const power = social ? (social.kind === "golden" ? "golden-window" : "") : old.pendingPower;
    playSfx("arrive");
    if (power) {
      setTimeout(() => announcePower(power, old.pendingPowerStreak || old.streak), 550);
    }
    const basePotato = makePotato(old.nextPotatoIndex, power);
    const potato = social ? makeSocialPotato(basePotato, social) : basePotato;
    const socialCopy = socialLandingCopy(social);
    if (social?.kind === "golden") {
      setTimeout(() => enqueueFx({
        type: "golden-pass",
        title: "GOLDEN GIFT",
        subtitle: `${social.from || "A friend"} sent you the shiny one.`,
        note: "Pass during the window for bonus SPUD.",
        duration: 2600
      }), 760);
    } else if (social?.kind === "tainted") {
      setTimeout(() => enqueueFx({
        type: "danger",
        title: "TAINTED TATER",
        subtitle: `${social.from || "A friend"} sent you a mean one.`,
        note: "It has to cool for a few seconds before you can pass it.",
        duration: 3200
      }), 760);
    } else if (social?.kind === "pigeon") {
      setTimeout(() => enqueueFx({
        type: "pigeon",
        title: "MESSAGE POTATO",
        subtitle: `${social.from || "A friend"} tucked a note inside.`,
        note: "The message reveals when this potato resolves.",
        duration: 3000
      }), 760);
    }
    return addLog({
      ...markGuidesSeen(old, "waitPotato"),
      potato,
      nextPotatoIndex: old.nextPotatoIndex + 1,
      nextAt: 0,
      pendingSocialPotato: null,
      pendingPower: social ? old.pendingPower : "",
      pendingPowerStreak: social ? old.pendingPowerStreak : 0,
      sacToPileClicks: 0,
      overdriveActive: false,
      overdriveTaps: []
    }, socialCopy || (power ? "A powered Hot Potato landed." : "A Hot Potato landed."), social?.kind === "golden" ? "good" : "info");
  }

  function sendPotato() {
    clearFx();
    if (!game.connected) {
      playSfx("error");
      showToast("Connect the demo wallet first.");
      return;
    }
    if (game.potato) {
      playSfx("error");
      showToast("You already have one Hot Potato.");
      return;
    }
    if (game.risk <= 0) {
      playSfx("error");
      showToast("Add SPUD to the Spud Pile first.");
      return;
    }
    const protection = protectionInfo(game);
    if (deliveryProtectionActive(game)) {
      playSfx("error");
      showToast(`${protection.status}: potatoes are paused.`);
      return;
    }
    setGame((old) => (old.potato || old.risk <= 0 ? old : deliverPotato({ ...old, nextAt: 0 })));
  }

  function toggleHold() {
    clearFx();
    setGame((old) => {
      if (!old.potato) return old;
      if (old.holding) {
        stopHoldDrone();
        playSfx("holdOff");
      } else {
        playSfx("holdOn");
        startHoldDrone();
      }
      return { ...old, holding: !old.holding };
    });
  }

  function activateOverdrive() {
    clearFx();
    playSfx("overdrive");
    setGame((old) => {
      if (!old.potato || old.potato.power !== "overdrive") return old;
      const taps = recentOverdriveTaps(old.overdriveTaps);
      const next = {
        ...old,
        overdriveActive: true,
        overdriveTaps: [...taps, Date.now()]
      };
      const boost = Math.round(overdriveBoostPercent(next));
      enqueueFx({
        type: "overdrive",
        title: old.overdriveActive ? `+${boost}% BOOST` : "OVERDRIVE",
        subtitle: old.overdriveActive ? "Keep tapping to push the pile." : "+60% pile growth is active.",
        note: "No extra explosion risk.",
        duration: old.overdriveActive ? 900 : 2200
      });
      showToast(`Overdrive boost +${boost}%`);
      return next;
    });
  }

  function passPotato() {
    clearFx();
    setGame((old) => {
      if (!old.potato) return old;
      const cost = passCost(old.potato, old.babyHandsRounds);
      if (old.potato.socialKind === "tainted" && old.potato.age < 6) {
        playSfx("error");
        enqueueFx({
          type: "danger",
          title: "TOO HOT",
          subtitle: "Tainted Taters cannot be passed immediately.",
          note: `${Math.ceil(6 - old.potato.age)}s until you can try.`,
          duration: 1400
        });
        showToast("Tainted Tater is too unstable to pass yet.");
        return addLog(old, "Tainted Tater fought the pass. Survive a few seconds first.", "bad");
      }
      const babyTax = old.babyHandsRounds > 0 && old.potato.age <= 5;
      if (old.tots < cost) {
        playSfx("error");
        if (babyTax) {
          setBabyCry(Date.now());
          playSfx("baby");
          playRandomSound("babyCry", 0.88);
        }
        const message = old.tots <= 0 ? "You have no Tots!" : `Need ${fmt(cost, 1)} Tots to pass.`;
        showToast(message);
        return addLog(old, babyTax ? `${message} Baby Hands doubles early passes.` : `${message} Wait longer or earn more Tots.`, "bad");
      }
      const quick = old.potato.age <= 5;
      if (babyTax) {
        setBabyCry(Date.now());
        playSfx("baby");
        playRandomSound("babyCry", 0.88);
      }
      const quickPassChain = quick ? old.quickPassChain + 1 : 0;
      const triggeredBabyHands = old.babyHandsRounds <= 0 && quickPassChain >= 3;
      const babyHandsRounds = old.babyHandsRounds > 0 ? Math.max(0, old.babyHandsRounds - 1) : triggeredBabyHands ? 5 : 0;
      const golden = goldenWindowActive(old.potato);
      const overdriveBonus = overdriveBoostPercent(old);
      const target = realPlayers[old.target] || null;
      const targetName = target ? playerDisplayName(target) : "";
      const receivedKind = old.potato.socialKind || "";
      const sender = old.potato.prankFrom || old.potato.sender || "A friend";
      const reward = Math.round(old.potato.pool * (golden ? 1.4 : 1));
      const streak = old.streak + 1;
      const pendingPower = nextPowerForStreak(streak) || old.pendingPower;
      const pendingPowerStreak = pendingPower && pendingPower !== old.pendingPower ? streak : old.pendingPowerStreak;
      stopHoldDrone();
      playSfx("pass");
      playSfx("win", Math.max(0.5, reward / 24));
      setSpudWinFx({
        id: Date.now(),
        amount: reward,
        note: golden ? "Golden Window bonus" : overdriveBonus ? "Overdrive boosted the pile" : "landed in the Spud Pile"
      });
      if (triggeredBabyHands) announceBabyHands();
      if (pendingPower && streak % 5 === 0) announceHotStreak(streak, pendingPower);
      if (golden) {
        setFlightFx({ id: Date.now(), type: "golden", file: old.potato.file, assetPath: old.potato.assetPath || "" });
        enqueueFx({
          type: "golden-pass",
          title: receivedKind === "golden" ? "GOLDEN GIFT CASHED" : "THROUGH THE WINDOW",
          subtitle: receivedKind === "golden" ? `${sender}'s Golden Potato paid out.` : "+40% Golden Window payout landed.",
          duration: 2100
        });
      } else {
        setFlightFx({ id: Date.now(), type: "pass", file: old.potato.file, assetPath: old.potato.assetPath || "", socialKind: receivedKind });
      }
      if (receivedKind === "tainted") {
        enqueueFx({
          type: "danger",
          title: "PRANK SURVIVED",
          subtitle: `${sender} tried to mash you. You cashed it instead.`,
          note: `+${fmt(reward)} SPUD. That's a spicy dodge.`,
          duration: 2800
        });
      } else if (receivedKind === "golden" && !golden) {
        enqueueFx({
          type: "golden-pass",
          title: "GOLDEN GIFT CASHED",
          subtitle: `${sender}'s Golden Potato landed safely.`,
          note: `+${fmt(reward)} SPUD.`,
          duration: 2400
        });
      } else if (receivedKind === "pigeon") {
        revealMessagePotato(old.potato, "passed");
        enqueueFx({
          type: "pigeon",
          title: "MESSAGE DELIVERED",
          subtitle: `${sender}'s note popped out.`,
          note: `+${fmt(reward)} SPUD for handling it.`,
          duration: 2400
        });
      }
      if (target) {
        createBackendSocialPotato("normal", old.playerName, target)
          .then(() => showToast(`Passed to ${targetName}. They will see it when online.`))
          .catch(() => showToast(`Passed to ${targetName} locally. Friend delivery is offline.`));
      }
      setWalletPulsing(true);
      return addLog({
        ...markGuidesSeen(old, "pass"),
        potato: null,
        holding: false,
        sponsorBreak: null,
        tots: Number((old.tots - cost).toFixed(1)),
        risk: old.risk + reward,
        won: old.won + reward,
        spudCreated: old.spudCreated + reward,
        socialXp: old.socialXp + 1,
        bestWin: Math.max(old.bestWin, reward),
        passes: old.passes + 1,
        streak,
        bestStreak: Math.max(old.bestStreak, streak),
        quickPassChain,
        babyHandsRounds,
        pendingPower,
        pendingPowerStreak,
        overdriveActive: false,
        overdriveTaps: [],
        nextAt: Date.now() + POST_PASS_DELIVERY_MIN_MS + Math.random() * POST_PASS_DELIVERY_RANGE_MS,
        unlocked: { ...old.unlocked, activity: true, sac: true }
      }, `${receivedKind === "tainted" ? `Survived ${sender}'s Tainted Tater. ` : receivedKind === "golden" ? `Cashed ${sender}'s Golden Potato. ` : receivedKind === "pigeon" ? `Opened ${sender}'s Pigeon Potato. ` : targetName ? `Passed to ${targetName}. ` : "Passed the Hot Potato. "}${golden ? "Golden Window +40%. " : ""}${overdriveBonus ? `Overdrive +${Math.round(overdriveBonus)}% fueled the pile. ` : ""}+${fmt(reward)} SPUD landed in the Spud Pile.`, "good");
    });
  }

  function moveToSac() {
    clearFx();
    stopHoldDrone();
    setGame((old) => {
      if (old.potato || old.risk <= 0) {
        playSfx("error");
        showToast(old.potato ? "Wait until your hands are empty." : "No SPUD in the Spud Pile.");
        return old;
      }
      playSfx("chest");
      return addLog({
        ...markGuidesSeen(old, "moveSac"),
        sac: old.sac + old.risk,
        risk: 0,
        streak: 0,
        sacToPileClicks: 0,
        overdriveActive: false,
        overdriveTaps: [],
        pendingPower: "",
        pendingPowerStreak: 0,
        unlocked: { ...old.unlocked, sac: true, equipment: true }
      }, "Moved the Spud Pile into the Spud Sac. Streak reset.", "info");
    });
  }

  async function shareSocialPotato(link, potato, target) {
    const text = `${game.playerName || "A friend"} sent you a ${potato.name} in Hot Potato.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: potato.name, text, url: link });
        showToast(`${potato.name} share opened.`);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        showToast(`${potato.name} link copied.`);
        return;
      }
    } catch {
      // Fall through to prompt so the player still gets the link.
    }
    window.prompt(`Copy this ${potato.name} link for ${playerDisplayName(target)}:`, link);
    showToast(`${potato.name} link ready.`);
  }

  function sendSocialPotato(kind, message = "") {
    clearFx();
    const potato = socialPotatoes[kind];
    if (!potato) return;
    if (!game.connected) {
      playSfx("error");
      showToast("Connect the demo wallet first.");
      return;
    }
    if (socialSpendable(game) < potato.cost) {
      playSfx("error");
      showToast(`Need ${potato.cost} SPUD to send ${potato.name}.`);
      return;
    }
    const cleanMessage = String(message || "").trim().slice(0, 220);
    if (kind === "pigeon" && cleanMessage.length < 1) {
      playSfx("error");
      showToast("Write a message first.");
      return;
    }
    const target = realPlayers[game.target] || null;
    if (!target) {
      playSfx("error");
      showToast(playersStatus === "offline" ? "Real player list is offline." : "No real player selected.");
      return;
    }
    const targetName = playerDisplayName(target);
    const fallbackLink = socialPotatoLink(kind, game.playerName, target, cleanMessage);
    playSfx(kind === "golden" || kind === "pigeon" ? "power" : "error");
    enqueueFx({
      type: kind === "golden" ? "golden-pass" : kind === "pigeon" ? "pigeon" : "baby",
      title: kind === "golden" ? "GOLDEN POTATO SENT" : kind === "pigeon" ? "PIGEON POTATO SENT" : "TAINTED TATER SENT",
      subtitle: `${targetName} gets it as their next potato.`,
      note: kind === "golden" ? "Gift energy. Golden Window included." : kind === "pigeon" ? "The message stays hidden until it resolves." : "Prank energy. Hotter and twitchier.",
      duration: 2600
    });
    setGame((old) => {
      if (socialSpendable(old) < potato.cost) return old;
      const paid = spendSocialCost(old, potato.cost);
      return addLog({
        ...paid,
        socialSends: {
          ...(old.socialSends || {}),
          [kind]: ((old.socialSends || {})[kind] || 0) + 1
        },
        socialXp: (old.socialXp || 0) + (kind === "golden" ? 5 : kind === "pigeon" ? 2 : 4),
        unlocked: { ...old.unlocked, activity: true, target: true }
      }, `Sent ${targetName} a ${potato.name}. -${potato.cost} SPUD, +${kind === "golden" ? 5 : kind === "pigeon" ? 2 : 4} Social XP.`, potato.logType);
    });
    showToast(`Sending ${potato.name} to ${targetName}...`);
    void (async () => {
      let link = fallbackLink;
      try {
        const created = await createBackendSocialPotato(kind, game.playerName, target, cleanMessage);
        if (created?.link && !created.fallback) {
          showToast(`${potato.name} sent to ${targetName}.`);
          if (kind === "pigeon") setMessageDraft("");
          return;
        }
      } catch {
        showToast("Using demo share link.");
      }
      await shareSocialPotato(link, potato, target);
      if (kind === "pigeon") setMessageDraft("");
    })();
  }

  function toggleSleepOpen() {
    clearFx();
    playSfx("tap");
    setGame((old) => ({ ...old, sleepOpen: !old.sleepOpen, unlocked: { ...old.unlocked, protection: true } }));
  }

  function setSleepHour(field, value) {
    const hour = clamp(Number(value) || 0, 0, 23);
    setGame((old) => ({ ...old, [field]: hour, sleepEnabled: true, unlocked: { ...old.unlocked, protection: true } }));
  }

  function snoozeGame(hours) {
    clearFx();
    playSfx("snooze");
    setGame((old) => ({
      ...old,
      snoozeUntil: Date.now() + hours * 60 * 60 * 1000,
      nextAt: old.potato ? old.nextAt : 0,
      unlocked: { ...old.unlocked, protection: true }
    }));
    showToast(`Snoozed for ${hours}h.`);
  }

  function clearSnooze() {
    clearFx();
    playSfx("tap");
    setGame((old) => ({ ...old, snoozeUntil: 0, unlocked: { ...old.unlocked, protection: true } }));
    showToast("Snooze cleared.");
  }

  function buyEquipment(key) {
    clearFx();
    const item = equipment[key];
    if (!item) return;
    setGame((old) => {
      if (!isEquipmentUnlocked(old, key)) {
        playSfx("error");
        showToast("That gear is not unlocked yet.");
        return old;
      }
      if (old.sac < item.cost) {
        playSfx("error");
        showToast(`Need ${item.cost} SPUD in the Spud Sac.`);
        return old;
      }
      playSfx("chest");
      return addLog({
        ...markGuidesSeen(old, "equipment"),
        sac: old.sac - item.cost,
        spudSunk: old.spudSunk + item.cost,
        equipment: { ...old.equipment, [key]: (old.equipment[key] || 0) + 1 },
        unlocked: { ...old.unlocked, equipment: true }
      }, `Bought ${item.name} for ${item.cost} SPUD.`, "info");
    });
  }

  function claimGoal(goalId) {
    clearFx();
    const goal = starterGoals.find((item) => item.id === goalId);
    if (!goal) return;
    setGame((old) => {
      const claimedGoals = old.claimedGoals || [];
      if (claimedGoals.includes(goalId) || !goal.complete(old)) {
        playSfx("error");
        showToast("That goal is not ready yet.");
        return old;
      }
      const reward = goal.reward || {};
      const nextEquipment = { ...(old.equipment || {}) };
      let tots = old.tots;
      let message = `${goal.title} claimed.`;
      if (reward.tots) {
        tots = Number((tots + reward.tots).toFixed(1));
        message = `${goal.title} claimed. +${reward.tots} Tots.`;
      }
      if (reward.gear && equipment[reward.gear]) {
        nextEquipment[reward.gear] = (nextEquipment[reward.gear] || 0) + (reward.count || 1);
        message = `${goal.title} claimed. ${equipment[reward.gear].name} added to the Gear Bag.`;
      }
      playSfx("chest");
      showToast(goalRewardCopy(goal));
      return addLog(unlockForProgress({
        ...old,
        tots,
        claimedGoals: [...claimedGoals, goalId],
        equipment: nextEquipment,
        unlocked: { ...old.unlocked, equipment: old.unlocked.equipment || !!reward.gear }
      }), message, "good");
    });
  }

  function useEquipment(key) {
    clearFx();
    setGame((old) => {
      if (!isEquipmentUnlocked(old, key)) {
        playSfx("error");
        showToast("That gear is not unlocked yet.");
        return old;
      }
      const existingBottle = key === "hotSauce" && old.potato?.equipment?.hotSauceBottle;
      if (!old.potato || ((old.equipment[key] || 0) <= 0 && !existingBottle)) {
        playSfx("error");
        showToast(!old.potato ? "Use gear on a live Hot Potato." : `You do not own ${equipment[key].name}.`);
        return old;
      }
      const p = { ...old.potato, equipment: { ...(old.potato.equipment || {}) } };
      const inv = { ...old.equipment, [key]: old.equipment[key] - 1 };
      if (key === "hotSauce") {
        if (!p.equipment.hotSauceBottle) {
          p.equipment.hotSauceBottle = true;
          p.equipment.hotSauceSquirts = 0;
        } else {
          inv.hotSauce = old.equipment.hotSauce;
        }
        if ((p.equipment.hotSauceSquirts || 0) >= 3) return old;
        p.equipment.hotSauceSquirts = (p.equipment.hotSauceSquirts || 0) + 1;
        p.heat += 4;
        playSfx("heat", 1 + p.equipment.hotSauceSquirts * 0.2);
      } else if (key === "sourCream") {
        p.equipment.sourCreamTicks = 8;
        p.heat = Math.max(0, p.heat - 12);
        p.fuse += 6;
        playSfx("snooze");
      } else if (key === "ovenMitts") {
        p.equipment.ovenMitts = true;
        playSfx("chest");
      } else if (key === "foilWrap") {
        p.equipment.foilWrap = true;
        p.fuse += 8;
        playSfx("chest");
      } else if (key === "thermometer") {
        p.equipment.thermometer = true;
        playSfx("tap");
      }
      return addLog({ ...markGuidesSeen(old, "equipment"), potato: p, equipment: inv }, `${equipment[key].name} used on this potato.`, "info");
    });
  }

  function startSponsorBreak() {
    clearFx();
    playSfx("tap");
    setGame((old) => {
      if (!old.potato || old.sponsorBreak) return old;
      return {
        ...markGuidesSeen(old, "sponsorBreak"),
        sponsorBreak: {
          endsAt: Date.now() + SPUD.sponsorBreakSeconds * 1000,
          adFile: adFileAtIndex(old.nextAdIndex, badAdFiles)
        },
        nextAdIndex: old.nextAdIndex + 1
      };
    });
  }

  function finishSponsorBreak(old) {
    if (!old.sponsorBreak || !old.potato) return { ...old, sponsorBreak: null };
    return addLog({
      ...old,
      sponsorBreak: null,
      tots: old.tots + SPUD.sponsorBreakTots,
      ads: old.ads + 1,
      sponsorBreaks: old.sponsorBreaks + 1,
      creatorAdRevenue: Number((old.creatorAdRevenue + SPUD.sponsorBreakRevenue).toFixed(4))
    }, `Sponsor Break survived. +${SPUD.sponsorBreakTots} Tots.`, "good");
  }

  function passButtonLabel() {
    if (!game.potato) return "Pass";
    if (game.potato.socialKind === "tainted" && game.potato.age < 6) return `Survive ${Math.ceil(6 - game.potato.age)}s`;
    const baby = game.babyHandsRounds > 0 && game.potato.age <= 5 ? " x2" : "";
    const golden = goldenWindowActive(game.potato) ? " Right Now +40%" : "";
    return `Pass${golden}${baby} - ${fmt(currentPassCost, 1)} Tots`;
  }

  const coins = useMemo(() => {
    const count = clamp(Math.floor((game.potato?.pool || 0) / 2.2), 0, 420);
    const baseCapacity = clamp(Math.ceil(Math.sqrt(count || 1) * 2.05), 5, 42);
    const rows = [];
    let placed = 0;
    let row = 0;
    while (placed < count) {
      const capacity = Math.max(1, baseCapacity - row * 2);
      const used = Math.min(capacity, count - placed);
      rows.push({ start: placed, used, row });
      placed += used;
      row += 1;
    }
    const spread = clamp(520 / (baseCapacity + 2), 9, 17);
    return Array.from({ length: count }, (_, i) => {
      const info = rows.find((item) => i >= item.start && i < item.start + item.used) || rows[0];
      const rowWidth = info.used;
      const inRow = i - info.start;
      const rowCenter = (rowWidth - 1) / 2;
      const stagger = info.row % 2 ? spread * 0.44 : 0;
      const x = (inRow - rowCenter) * spread + stagger + Math.sin(i * 1.7) * 2.4;
      const y = info.row * 8.8 + Math.cos(i * 1.3) * 1.2;
      return { x, y, r: (i * 47) % 34 - 17, z: info.row * 10 + inRow };
    });
  }, [game.potato?.pool]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="mark" />
          <div>
            <h1>Hot Potato</h1>
            <p>Player-facing demo: win SPUD, protect the Spud Sac, and chase streak-powered bonus moments.</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="chip">{game.connected ? "Live" : "Offline"}</span>
          <button className="blue sound-toggle" onClick={toggleSound}>
            Sound: {game.soundOn ? "On" : "Off"}
          </button>
          {showSoundCheck && (
            <button className="ghost mini-action" onClick={() => setSoundCheckOpen(true)}>
              Sound Check
            </button>
          )}
          <button ref={register("connect")} className="green" onClick={connect} disabled={game.connected}>
            {game.connected ? "Wallet Connected" : "Connect Demo Wallet"}
          </button>
          <button className="ghost mini-action" onClick={replayTips}>Replay Tips</button>
          <button className="ghost" onClick={reset}>Reset</button>
        </div>
      </header>

      <main className={`layout ${!game.unlocked.activity ? "compact" : ""} ${mobileSheet ? `mobile-sheet-${mobileSheet}` : ""}`}>
        <WalletPanel
          game={game}
          sponsor={sponsor}
          heatScore={heatScore}
          walletBurning={walletBurning}
          walletPulsing={walletPulsing}
          refs={refs}
          register={register}
          setAdModal={setAdModal}
          grantAdReward={grantAdReward}
          fundRisk={fundRisk}
          fundRiskFromSac={fundRiskFromSac}
          moveToSac={moveToSac}
          claimGoal={claimGoal}
          toggleSleepOpen={toggleSleepOpen}
          setSleepHour={setSleepHour}
          snoozeGame={snoozeGame}
          clearSnooze={clearSnooze}
        />

        <section className={`stage ${activePowerMode(game) ? `power-${game.potato?.power || "ready"}` : ""} ${game.pendingPower ? "power-armed" : ""}`}>
          <ScoreBar game={game} avatar={selectedAvatar} />
          <PotatoStage
            game={game}
            heatScore={heatScore}
            coins={coins}
            babyCry={babyCry}
            overdriveBoost={overdriveBoost}
            onBadVideo={skipBadAd}
          />
          <GameControls
            game={game}
            passLabel={passButtonLabel()}
            currentPassCost={currentPassCost}
            overdriveBoost={overdriveBoost}
            gearOpen={gearOpen}
            register={register}
            toggleHold={toggleHold}
            passPotato={passPotato}
            sendPotato={sendPotato}
            activateOverdrive={activateOverdrive}
            startSponsorBreak={startSponsorBreak}
            toggleGear={() => {
              setMobileSheet(null);
              setGearOpen((open) => !open);
              setGame((old) => markGuidesSeen(old, "equipment"));
            }}
            useEquipment={useEquipment}
          />
          {game.unlocked.equipment && (
            <EquipmentDrawer
              game={game}
              open={gearOpen}
              close={() => setGearOpen(false)}
              buyEquipment={buyEquipment}
              useEquipment={useEquipment}
            />
          )}
        </section>

        {game.unlocked.activity && (
          <ActivityPanel
            game={game}
            register={register}
            realPlayers={realPlayers}
            playersStatus={playersStatus}
            selectedTarget={selectedTarget}
            friendSearch={friendSearch}
            setFriendSearch={setFriendSearch}
            friendSearchResults={friendSearchResults}
            friendSearchStatus={friendSearchStatus}
            searchFriends={searchFriends}
            addFriendFromSearch={addFriendFromSearch}
            messageDraft={messageDraft}
            setMessageDraft={setMessageDraft}
            sendSocialPotato={sendSocialPotato}
            setTarget={(target) => setGame((old) => ({ ...old, target: Number(target) || 0 }))}
            refreshPlayers={() => refreshPlayerDirectory(true)}
          />
        )}
      </main>

      <MobileNav
        game={game}
        activeSheet={mobileSheet}
        gearOpen={gearOpen}
        showPlay={() => {
          setMobileSheet(null);
          setGearOpen(false);
        }}
        showWallet={() => {
          setGearOpen(false);
          setMobileSheet((sheet) => (sheet === "wallet" ? null : "wallet"));
        }}
        showActivity={() => {
          setGearOpen(false);
          setMobileSheet((sheet) => (sheet === "activity" ? null : "activity"));
        }}
        showGear={() => {
          setMobileSheet(null);
          setGearOpen((open) => !open);
        }}
      />

      {!game.onboarded && (
        <OnboardingModal
          game={game}
          setGame={setGame}
          completeOnboarding={completeOnboarding}
        />
      )}

      {guide && (
        <div className="coach-card floating" ref={coachRef}>
          <small>{guide[1]}</small>
          <strong>{guide[2]}</strong>
          <span>{guide[3]}</span>
        </div>
      )}

      {adModal && (
        <AdModal
          game={game}
          file={currentRewardedAdFile}
          adReady={adReady}
          claimAd={claimAd}
          close={() => setAdModal(null)}
          onBadVideo={skipBadAd}
        />
      )}

      {activeFx && <FullscreenFx fx={activeFx} />}
      {flightFx && <PotatoFlightFx fx={flightFx} />}
      {boom && <BoomOverlay boom={boom} />}
      {spudTransferFx && <SpudTransferFx fx={spudTransferFx} />}
      {spudWinFx && <SpudWinPop fx={spudWinFx} />}
      {messageReveal && (
        <MessagePotatoModal
          message={messageReveal}
          close={() => setMessageReveal(null)}
          reply={() => {
            const friendIndex = realPlayers.findIndex((player) => playerDisplayName(player).toLowerCase() === String(messageReveal.from || "").toLowerCase());
            if (friendIndex >= 0) setGame((old) => ({ ...old, target: friendIndex, unlocked: { ...old.unlocked, activity: true, target: true } }));
            setFriendSearch(friendIndex >= 0 ? "" : messageReveal.from || "");
            setMessageReveal(null);
            setMobileSheet("activity");
            setGearOpen(false);
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
      {showSoundCheck && soundCheckOpen && (
        <SoundCheckPanel
          close={() => setSoundCheckOpen(false)}
          playGroup={playSoundCheckGroup}
          playOne={playSoundCheckOne}
        />
      )}
    </div>
  );
}

function MobileNav({ game, activeSheet, gearOpen, showPlay, showWallet, showActivity, showGear }) {
  return (
    <nav className="mobile-nav" aria-label="Game menu">
      <button type="button" className={!activeSheet && !gearOpen ? "active" : ""} onClick={showPlay}>
        <span>Play</span>
      </button>
      <button type="button" className={activeSheet === "wallet" ? "active" : ""} onClick={showWallet}>
        <span>Wallet</span>
      </button>
      <button type="button" className={activeSheet === "activity" ? "active" : ""} onClick={showActivity} disabled={!game.unlocked.activity}>
        <span>Live</span>
      </button>
      <button type="button" className={gearOpen ? "active" : ""} onClick={showGear} disabled={!game.unlocked.equipment}>
        <span>Gear</span>
      </button>
    </nav>
  );
}

function WalletPanel({
  game,
  sponsor,
  heatScore,
  walletBurning,
  walletPulsing,
  register,
  setAdModal,
  grantAdReward,
  fundRisk,
  fundRiskFromSac,
  moveToSac,
  claimGoal,
  toggleSleepOpen,
  setSleepHour,
  snoozeGame,
  clearSnooze
}) {
  const payout = rewardedAdPayout(game.ads);
  const handsEmpty = !game.potato;
  const canFundRisk = handsEmpty && game.tots >= SPUD.riskFundTots;
  const canFundFromSac = handsEmpty && game.sac > 0;
  const canMoveToSac = handsEmpty && game.risk > 0;
  return (
    <aside className="panel wallet-panel">
      <h2>Wallet</h2>
      <div className="tiny">{game.wallet || "Not connected"}</div>

      {game.connected && (
        <div className="wallet-grid">
          <div ref={register("spudPile")} className={`spud-pile-hero ${game.risk <= 0 ? "pile-empty" : ""} ${walletBurning ? "burning" : ""} ${walletPulsing ? "pulsing" : ""}`}>
            <div className="spud-pile-copy">
              <small>Spud Pile</small>
              <strong>{fmt(game.risk)}</strong>
              <span>Earned SPUD lands here first.</span>
            </div>
            <SpudMiniPile amount={game.risk} />
          </div>
          {game.unlocked.sac && (
            <div ref={register("spudSac")} className="stat sac chest-bag-stat">
              <div className="potato-bag" aria-hidden="true"><span /></div>
              <div className="chest-bag-copy">
                <small>Spud Sac</small>
                <strong>{fmt(game.sac)}</strong>
                <span>Safe from explosions</span>
              </div>
            </div>
          )}
          <div className="stat info">
            <small>Tots</small>
            <strong>{fmt(game.tots, game.tots % 1 ? 1 : 0)}</strong>
            <span>Pass fuel</span>
          </div>
          <div className="stat wide">
            <small>Play Requirement</small>
            <strong>{game.risk > 0 ? "Ready" : "Build Spud Pile"}</strong>
            <span>{game.risk > 0 ? "Hot Potatoes can arrive." : game.sac > 0 ? "Move SPUD from the Spud Sac." : "Convert Tots before playing."}</span>
          </div>
        </div>
      )}

      {game.connected && <RiskPosturePanel posture={riskPosture(game, heatScore)} />}

      {game.connected && (
        <div className="row">
          <button ref={register("watchAd")} className="blue" onClick={() => setAdModal(true)}>
            Watch Ad +{payout.tots} Tots
          </button>
          <button className="ghost debug-ad-override" onClick={() => grantAdReward("Demo ad override")}>
            Test +{payout.tots} Tots
          </button>
          {handsEmpty && (
            <button ref={register("fundRisk")} className={`danger ${canFundRisk ? "" : "visually-disabled"}`} onClick={fundRisk} aria-disabled={!canFundRisk}>
              Add to Spud Pile - {SPUD.riskFundTots} Tots
            </button>
          )}
          {handsEmpty && (
            <button ref={register("fundFromSac")} className={`green ${canFundFromSac ? "" : "visually-disabled"}`} onClick={fundRiskFromSac} aria-disabled={!canFundFromSac}>
              Move SPUD to Spud Pile
            </button>
          )}
          {handsEmpty && (
            <button ref={register("moveSac")} className={`green ${canMoveToSac ? "" : "visually-disabled"}`} onClick={moveToSac} aria-disabled={!canMoveToSac}>
              Move to Spud Sac
            </button>
          )}
        </div>
      )}
      {game.connected && (
        <p className="wallet-hint">
          The Spud Pile is exposed SPUD, not a payout multiplier. Move SPUD to the Spud Sac when you want safety; doing that resets the streak.
        </p>
      )}

      {game.connected && <GoalBoard game={game} claimGoal={claimGoal} />}

      {game.unlocked.sponsor && (
        <div className="sponsor-panel" ref={register("sponsorPanel")}>
          <div className="sponsor-ad">
            <small>Side Sponsor</small>
            <strong>{sponsor.title}</strong>
            <span>{sponsor.line}</span>
          </div>
          <div className="sponsor-stats">
            <div><small>Ad $</small><strong>{money(game.creatorAdRevenue)}</strong></div>
            <div><small>Views</small><strong>{fmt(game.passiveAdImpressions)}</strong></div>
            <div><small>Breaks</small><strong>{fmt(game.sponsorBreaks)}</strong></div>
          </div>
        </div>
      )}

      {game.connected && game.unlocked.protection && (
        <ProtectionPanel
          game={game}
          register={register}
          toggleSleepOpen={toggleSleepOpen}
          setSleepHour={setSleepHour}
          snoozeGame={snoozeGame}
          clearSnooze={clearSnooze}
        />
      )}
    </aside>
  );
}

function RiskPosturePanel({ posture }) {
  return (
    <div className={`risk-posture risk-${posture.label.toLowerCase()}`}>
      <div className="between">
        <small>Risk Posture</small>
        <strong>{posture.label}</strong>
      </div>
      <div className="risk-meter" aria-hidden="true">
        <i style={{ "--risk": `${Math.round(posture.score * 100)}%` }} />
      </div>
      <span>{posture.note}</span>
    </div>
  );
}

function GoalBoard({ game, claimGoal }) {
  const claimed = game.claimedGoals || [];
  const remaining = starterGoals.filter((goal) => !claimed.includes(goal.id));
  if (!remaining.length) {
    return (
      <details className="goal-board">
        <summary><span>Starter Goals</span><strong>Complete</strong></summary>
        <p>New seasonal goals can drop here later.</p>
      </details>
    );
  }
  return (
    <details className="goal-board" open={game.passes < 2}>
      <summary><span>Starter Goals</span><strong>{remaining.length} left</strong></summary>
      <div className="goal-list">
        {starterGoals.map((goal) => {
          const done = goal.complete(game);
          const isClaimed = claimed.includes(goal.id);
          return (
            <div key={goal.id} className={`goal-item ${done ? "ready" : ""} ${isClaimed ? "claimed" : ""}`}>
              <div>
                <small>{isClaimed ? "Claimed" : goal.rewardLabel}</small>
                <strong>{goal.title}</strong>
                <span>{goal.description}</span>
              </div>
              <button className={done && !isClaimed ? "green" : "ghost"} onClick={() => claimGoal(goal.id)} disabled={!done || isClaimed}>
                {isClaimed ? "Done" : done ? "Claim" : goalRewardCopy(goal)}
              </button>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ProtectionPanel({ game, register, toggleSleepOpen, setSleepHour, snoozeGame, clearSnooze }) {
  const info = protectionInfo(game);
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  return (
    <div className="protection-section" ref={register("protection")}>
      <div className="divider" />
      <div className="between row">
        <h2>Protection</h2>
        <button className="ghost" type="button" onClick={toggleSleepOpen}>
          {game.sleepOpen ? "Hide" : "Sleep & Snooze"}
        </button>
      </div>
      <div className={`stat protection-card ${info.active ? "active" : ""}`}>
        <small>Protected Status</small>
        <strong>{info.status}</strong>
        <span>{info.note}</span>
      </div>
      {game.sleepOpen && (
        <div className="sleep-tools stack">
          <div className="sleep-row">
            <label>
              Sleep Start
              <select value={game.sleepStart} onChange={(event) => setSleepHour("sleepStart", event.target.value)}>
                {hours.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
              </select>
            </label>
            <label>
              Sleep End
              <select value={game.sleepEnd} onChange={(event) => setSleepHour("sleepEnd", event.target.value)}>
                {hours.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <button className="ghost" onClick={() => snoozeGame(1)}>Snooze 1h</button>
            <button className="ghost" onClick={() => snoozeGame(4)}>Snooze 4h</button>
            <button className="ghost" onClick={clearSnooze}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ game, avatar }) {
  return (
    <div className="scorebar">
      <div className="score-player">
        <div className="avatar">
          <img src={assetUrl("Avatars", avatar.file)} alt="" />
        </div>
      <div><strong>{game.playerName}</strong><span>player</span></div>
      </div>
      <span className="chip spud">Spud Pile {fmt(game.risk)}</span>
      <span className="chip tots">Tots {fmt(game.tots, game.tots % 1 ? 1 : 0)}</span>
    </div>
  );
}

function PotatoStage({ game, heatScore, coins, babyCry, overdriveBoost, onBadVideo }) {
  const p = game.potato;
  const [landing, setLanding] = useState(false);
  const steam = p && p.age > 5;
  const smoke = p && p.age > 24;
  const burning = p && p.age > 44;
  const golden = goldenWindowActive(p);
  const goldenClosed = p?.power === "golden-window" && !golden;
  const overdriveReady = p?.power === "overdrive" && !game.overdriveActive;
  const overdriveActive = p?.power === "overdrive" && game.overdriveActive;
  const gear = p?.equipment || {};
  const potatoImage = p?.assetPath ? assetUrl(p.assetPath) : p ? assetUrl("Generic Potatoes Transparent", p.file) : "";
  const pigeonPotato = p?.socialKind === "pigeon";

  useEffect(() => {
    if (!p) {
      setLanding(false);
      return undefined;
    }
    setLanding(true);
    const timer = setTimeout(() => setLanding(false), 820);
    return () => clearTimeout(timer);
  }, [p?.id, p?.file]);

  return (
    <div className={`potato-zone ${p ? "active" : ""}`} style={{ "--heat": heatScore }}>
      {!p && (
        <div className="empty-stage">
          {game.connected ? (
            <>
              <div className="big">HP</div>
              <h2>Hands empty</h2>
              <p>Waiting for a Hot Potato.</p>
            </>
          ) : (
            <>
              <div className="big">HP</div>
              <h2>Connect to start</h2>
              <p>Choose a player, connect, earn Tots, then play.</p>
            </>
          )}
        </div>
      )}
      {p && (
        <>
          {p.power && p.power !== "golden-window" && <PowerBanner power={p.power} active={p.power === "overdrive" ? game.overdriveActive : golden} />}
          {game.babyHandsRounds > 0 && <BabyHandsBadge rounds={game.babyHandsRounds} crying={babyCry} />}
          {(golden || goldenClosed) && <GoldenWindow active={golden} urgent={goldenWindowUrgent(p)} closed={goldenClosed} />}
          {(overdriveReady || overdriveActive) && <OverdriveGauge active={overdriveActive} boost={overdriveBoost || 60} />}
          <EquipmentStatus gear={gear} />
          <StageFire heatScore={heatScore} holding={game.holding} />
          <div className="potato-anchor">
            <div
              className={`potato-wrap ${landing ? `throw-in-${p.throwSide || "left"}` : ""} ${game.holding ? "holding" : ""} ${heatScore > 0.45 ? "hot" : ""} ${steam ? "steaming" : ""} ${smoke ? "smoking" : ""} ${burning ? "burning" : ""} ${gear.sourCreamTicks > 0 ? "sour-cream-active" : ""} ${gear.hotSauceSquirts ? "hot-sauce-active" : ""} ${gear.foilWrap ? "foil-wrapped" : ""} ${gear.ovenMitts ? "mitts-on" : ""}`}
              style={{
                "--steam-intensity": clamp((p.age - 5) / 24, 0, 1),
                "--smoke-intensity": clamp((p.age - 24) / 40, 0, 1),
                "--sauce-level": clamp((gear.hotSauceSquirts || 0) / 3, 0, 1)
              }}
            >
              <div className="heat-halo" />
              {game.holding && <VisualShepard />}
              <HeatWisps />
              <EquipmentFx />
              <div className={`potato-sprite ${pigeonPotato ? "pigeon-potato-sprite" : ""}`}>
                {pigeonPotato ? (
                  <PigeonPotatoSprite alt="Pigeon Potato" />
                ) : (
                  <>
                    <img src={potatoImage} alt="Hot Potato" />
                    <BurnOverlays heatScore={heatScore} />
                  </>
                )}
              </div>
              {p.equipment.foilWrap && <div className="gear-badge">Foil</div>}
              {p.equipment.ovenMitts && <div className="gear-badge mitts">Mitts</div>}
              {p.equipment.thermometer && <div className="gear-badge thermo">{fmt(p.pool)} SPUD</div>}
            </div>
          </div>
          <div className={`spud-pile ${game.holding || p.power === "overdrive" ? "fast" : ""}`}>
            <div className="pile-shadow" />
            <div className="pile-coins">
              {coins.map((coin, i) => (
                <span key={i} style={{ "--x": `${coin.x}px`, "--y": `${coin.y}px`, "--r": `${coin.r}deg`, "--z": coin.z }} />
              ))}
            </div>
          </div>
          {game.sponsorBreak && (
            <div className="risk-ad">
              <strong>Risky Sponsor Break</strong>
              <SponsorBreakAd game={game} onBadVideo={onBadVideo} />
              <span>Potato keeps cooking.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BurnOverlays({ heatScore }) {
  return (
    <div className="burn-overlays" aria-hidden="true">
      {burnOverlayLayers.map((layer, index) => {
        const opacity = clamp((heatScore - layer.start) / layer.span, 0, 1) * layer.max;
        return (
          <img
            key={layer.file}
            src={assetUrl("BurnOverlays", layer.file)}
            alt=""
            style={{
              "--burn-opacity": opacity,
              "--burn-left": `${layer.left}%`,
              "--burn-top": `${layer.top}%`,
              "--burn-size": `${layer.size}%`,
              "--burn-scale": layer.scale,
              "--burn-rot": `${layer.rot}deg`,
              "--burn-i": index
            }}
          />
        );
      })}
    </div>
  );
}

function PigeonPotatoSprite({ className = "", alt = "" }) {
  return (
    <div className={`pigeon-flap ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined}>
      {PIGEON_FLAP_FRAMES.map((frame, index) => (
        <img
          key={frame}
          className="pigeon-frame"
          src={assetUrl("Social Potatoes", frame)}
          alt=""
          aria-hidden="true"
          style={{ "--frame": index }}
        />
      ))}
    </div>
  );
}

function EquipmentStatus({ gear }) {
  const chips = [];
  if (gear.ovenMitts) chips.push(["safe", "Oven Mitts"]);
  if (gear.sourCreamTicks > 0) chips.push(["cool", `Sour Cream ${gear.sourCreamTicks}s`]);
  if (gear.hotSauceBottle || gear.hotSauceSquirts) chips.push(["spicy", `Hot Sauce ${gear.hotSauceSquirts || 0}/3`]);
  if (gear.foilWrap) chips.push(["safe", "Foil Wrap"]);
  if (gear.thermometer) chips.push(["cool", "Thermometer"]);
  if (!chips.length) return null;
  return (
    <div className="equipment-status">
      {chips.map(([kind, label]) => <span key={label} className={kind}>{label}</span>)}
    </div>
  );
}

function EquipmentFx() {
  return (
    <>
      <div className="equipment-fx mitts-fx" aria-hidden="true" />
      <div className="equipment-fx sour-cream-fx" aria-hidden="true" />
      <div className="equipment-fx hot-sauce-fx" aria-hidden="true" />
      <div className="equipment-fx foil-wrap-fx" aria-hidden="true" />
    </>
  );
}

function PowerBanner({ power, active }) {
  const copy = powerCopy(power);
  return (
    <div className={`power-banner ${power}`}>
      <strong>{copy.title}</strong>
      <span>{active ? copy.subtitle : "Power run on this potato."}</span>
    </div>
  );
}

function HeatWisps() {
  return (
    <div className="heat-wisps" aria-hidden="true">
      <span className="steam-wisp w1" />
      <span className="steam-wisp w2" />
      <span className="steam-wisp w3" />
      <span className="smoke-puff s1" />
      <span className="smoke-puff s2" />
      <span className="smoke-puff s3" />
      <span className="potato-flame f1" />
      <span className="potato-flame f2" />
      <span className="potato-flame f3" />
    </div>
  );
}

function PlayableAdVideo({ file, soundOn, loop = false, onBadVideo }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !file) return undefined;
    video.muted = !soundOn;
    video.volume = soundOn ? 0.76 : 0;
    const attempt = video.play();
    if (attempt?.catch) attempt.catch(() => {});
    return undefined;
  }, [file, soundOn]);

  function checkLoadable() {
    const video = videoRef.current;
    if (!video || !file) return;
    window.setTimeout(() => {
      if (!videoRef.current || videoRef.current.src !== video.src) return;
      if (video.error || video.readyState === 0) onBadVideo?.(file);
    }, 1600);
  }

  if (!file) return <div className="ad-placeholder">No ad videos found.</div>;

  return (
    <video
      ref={videoRef}
      src={assetUrl("Game_Ads", file)}
      autoPlay
      controls
      loop={loop}
      playsInline
      muted={!soundOn}
      onLoadedData={checkLoadable}
      onCanPlay={checkLoadable}
      onError={() => onBadVideo?.(file)}
    />
  );
}

function SponsorBreakAd({ game, onBadVideo }) {
  return (
    <PlayableAdVideo
      file={game.sponsorBreak?.adFile}
      soundOn={game.soundOn}
      loop
      onBadVideo={onBadVideo}
    />
  );
}

function VisualShepard() {
  return (
    <div className="visual-shepard" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function StageFire({ heatScore, holding }) {
  const flames = Array.from({ length: 10 }, (_, i) => i);
  return (
    <div className={`stage-fire ${holding ? "holding" : ""}`} style={{ "--stage-fire": clamp((heatScore - 0.32) / 0.8, 0, 1) }} aria-hidden="true">
      {flames.map((i) => <span key={i} style={{ "--i": i }} />)}
    </div>
  );
}

function BabyHandsBadge({ rounds, crying }) {
  return (
    <div className={`baby-hands-badge ${crying ? "crying" : ""}`}>
      <div className="baby-face" aria-hidden="true"><span /><span /></div>
      <div><strong>Baby Hands</strong><span>{rounds} rounds</span></div>
    </div>
  );
}

function GoldenWindow({ active, urgent, closed }) {
  return (
    <div className={`golden-window ${urgent ? "urgent" : ""} ${closed ? "closed" : ""}`}>
      <div className="golden-window-copy">
        <small>Golden Window</small>
        <strong>{active ? "Pass Right Now" : "Window Closed"}</strong>
        <span>{active ? "+40% payout if this pass lands now." : "Bonus missed on this potato."}</span>
      </div>
      <div className="golden-light" />
      <div className="golden-frame-wrap">
        <div className="golden-frame">
          <div className="golden-shutter left" />
          <div className="golden-shutter right" />
          <div className="golden-bonus-chip">{active ? "+40%" : "Closed"}</div>
        </div>
      </div>
    </div>
  );
}

function OverdriveGauge({ active, boost }) {
  return (
    <div className={`overdrive-gauge ${active ? "active" : "ready"}`} style={{ "--boost-level": clamp((boost - 60) / 160, 0, 1) }}>
      <div className="overdrive-gauge-label">Boost</div>
      <div className="overdrive-gauge-track"><div className="overdrive-gauge-fill" /></div>
      <div className="overdrive-gauge-readout">+{Math.round(boost)}%</div>
    </div>
  );
}

function GameControls({ game, passLabel, currentPassCost, overdriveBoost, gearOpen, register, toggleHold, passPotato, sendPotato, activateOverdrive, startSponsorBreak, toggleGear, useEquipment }) {
  const p = game.potato;
  const canPass = !p || game.tots >= currentPassCost;
  const protectedNow = deliveryProtectionActive(game);
  const golden = goldenWindowActive(p);
  const potatoOrigin = p ? `${p.rarity} - sent by ${p.sender}` : "Waiting for a valid delivery window.";
  const ownedGear = Object.values(game.equipment || {}).reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
  const activeGear = p ? Object.entries(p.equipment || {}).filter(([key, value]) => key !== "hotSauceSquirts" && value).length : 0;
  return (
    <div className="details">
      <div className="between">
        <div>
          <h2>{p ? p.name : "No Hot Potato"}</h2>
          <div className="tiny">{potatoOrigin}</div>
        </div>
        <span className="chip">{p ? "Active" : "No holder"}</span>
      </div>
      <div className="vibes">
        <div className="stat"><small>Prize Pile</small><strong>{p?.equipment?.thermometer ? fmt(p.pool) : p ? "Growing" : "Empty"}</strong><span>{p?.equipment?.thermometer ? "Thermometer readout" : "Visual estimate"}</span></div>
        <div className="stat"><small>Vibe</small><strong>{p ? vibeText(p.age) : "Empty"}</strong><span>No exact explosion hint</span></div>
        <div className={`stat streak-stat ${game.pendingPower ? "armed" : ""}`}><small>Streak</small><strong>{fmt(game.streak)}</strong><span>{game.pendingPower ? `${powerName(game.pendingPower)} next` : "Spud Sac resets it"}</span></div>
        <div className="stat"><small>In Play / Held</small><strong>{p ? `${Math.floor(p.age)}s / ${Math.floor(p.held)}s` : "0s / 0s"}</strong><span>Time vs hold time</span></div>
      </div>
      <StreakLadder streak={game.streak} pendingPower={game.pendingPower} />
      {p && <QuickGearBar game={game} useEquipment={useEquipment} />}
      <div ref={p ? register("decisionActions") : undefined} className="actions">
        {p && <button className="danger" onClick={toggleHold}>{game.holding ? "Stop Holding" : "Hold"}</button>}
        {p && <button ref={register("pass")} className={`blue ${golden ? "golden-pass" : ""} ${canPass ? "" : "visually-disabled"}`} onClick={passPotato} aria-disabled={!canPass}>{passLabel}</button>}
        {p?.power === "overdrive" && (
          <button className={`overdrive-btn ${game.overdriveActive ? "active" : ""}`} onClick={activateOverdrive}>
            {game.overdriveActive ? `Tap Boost +${Math.round(overdriveBoost)}%` : "Overdrive"}
          </button>
        )}
        {!p && game.risk > 0 && (
          <>
            <button className="ghost send-potato-btn" onClick={sendPotato} disabled={protectedNow}>Send Potato</button>
            <div ref={register("waitPotato")} className="wait-potato-note">Waiting for potato</div>
          </>
        )}
        {p && game.unlocked.sponsor && <button ref={register("sponsorBreak")} className="sponsor-btn" onClick={startSponsorBreak} disabled={!!game.sponsorBreak}>Sponsor Break +{SPUD.sponsorBreakTots} Tots</button>}
        {game.unlocked.equipment && (
          <button
            ref={register("equipment")}
            className={`gear-bag-btn ${gearOpen ? "open" : ""}`}
            onClick={toggleGear}
            aria-expanded={gearOpen}
          >
            <span className="gear-bag-symbol" aria-hidden="true"><i /></span>
            <span>Gear Bag</span>
            <em>{ownedGear + activeGear}</em>
          </button>
        )}
      </div>
    </div>
  );
}

function StreakLadder({ streak, pendingPower }) {
  const milestones = streakMilestones(streak);
  return (
    <div className={`streak-ladder ${pendingPower ? "armed" : ""}`}>
      <div>
        <small>Streak Ladder</small>
        <strong>{pendingPower ? `${powerName(pendingPower)} armed` : `Next at ${milestones[0].value}`}</strong>
      </div>
      <div className="streak-steps">
        {milestones.map((item) => (
          <span key={item.value} className={item.value - streak <= 5 ? "next" : ""}>
            {item.value}<em>{powerName(item.power)}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function QuickGearBar({ game, useEquipment }) {
  const p = game.potato;
  if (!p) return null;
  const quickItems = unlockedEquipmentEntries(game).filter(([key]) => {
    const owned = (game.equipment?.[key] || 0) > 0;
    const active = key === "sourCream"
      ? (p.equipment?.sourCreamTicks || 0) > 0
      : !!p.equipment?.[key] || (key === "hotSauce" && !!p.equipment?.hotSauceBottle);
    return owned || active;
  });
  if (!quickItems.length) return null;
  return (
    <div className="quick-gear-row">
      {quickItems.map(([key, item]) => {
        const count = game.equipment?.[key] || 0;
        const hotSauceBottle = key === "hotSauce" && p.equipment?.hotSauceBottle;
        const hotSauceSquirts = p.equipment?.hotSauceSquirts || 0;
        const active = key === "sourCream" ? (p.equipment?.sourCreamTicks || 0) > 0 : !!p.equipment?.[key] || hotSauceBottle;
        const canUse = key === "hotSauce"
          ? (count > 0 && !hotSauceBottle) || (hotSauceBottle && hotSauceSquirts < 3)
          : count > 0 && !active;
        return (
          <button key={key} className={`quick-gear ${active ? "active" : ""}`} onClick={() => useEquipment(key)} disabled={!canUse}>
            <GearIcon kind={item.icon} />
            <span>{key === "hotSauce" && hotSauceBottle ? `${hotSauceSquirts}/3` : item.name}</span>
            <em>{count}</em>
          </button>
        );
      })}
    </div>
  );
}

function GearIcon({ kind }) {
  return <i className={`gear-icon gear-icon-${kind || "bag"}`} aria-hidden="true" />;
}

function EquipmentDrawer({ game, open, close, buyEquipment, useEquipment }) {
  if (!open) return null;
  const visibleEquipment = unlockedEquipmentEntries(game);
  const nextUnlock = equipmentUnlocks.find(({ key }) => !isEquipmentUnlocked(game, key));
  const nextItem = nextUnlock ? equipment[nextUnlock.key] : null;
  const nextProgress = nextUnlock ? gearUnlockProgress(game, nextUnlock.key) : null;
  const ownedGear = Object.values(game.equipment || {}).reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
  return (
    <div className="gear-drawer-layer" role="dialog" aria-modal="true" aria-label="Gear Bag">
      <button className="gear-drawer-backdrop" type="button" onClick={close} aria-label="Close Gear Bag" />
      <div className="gear-drawer">
        <div className="gear-drawer-head">
          <div>
            <small>Inventory</small>
            <strong>Gear Bag</strong>
          </div>
          <div className="gear-drawer-meta">
            <span>{ownedGear} owned</span>
            <button className="ghost mini-action" type="button" onClick={close}>Close</button>
          </div>
        </div>
        <div className="gear-drawer-note">
          {nextUnlock ? `More gear unlocks later. Next: ${nextUnlock.label}.` : "All gear unlocked."}
        </div>
        {nextUnlock && nextItem && nextProgress && (
          <div className="gear-unlock-panel">
            <div>
              <small>Next Gear Drop</small>
              <strong>{nextItem.name}</strong>
            </div>
            <div className="gear-progress-track" aria-hidden="true">
              <i style={{ "--progress": `${Math.round(nextProgress.percent * 100)}%` }} />
            </div>
            <span>{fmt(nextProgress.value)} / {fmt(nextProgress.goal)} {nextProgress.label}</span>
          </div>
        )}
        <div className="gear-tray">
          {visibleEquipment.map(([key, item]) => {
            const count = game.equipment[key] || 0;
            const hotSauceBottle = key === "hotSauce" && game.potato?.equipment?.hotSauceBottle;
            const hotSauceSquirts = game.potato?.equipment?.hotSauceSquirts || 0;
            const active = key === "sourCream"
              ? (game.potato?.equipment?.sourCreamTicks || 0) > 0
              : game.potato?.equipment?.[key] || hotSauceBottle || (key === "hotSauce" && hotSauceSquirts);
            const canUse = key === "hotSauce"
              ? !!game.potato && ((count > 0 && !hotSauceBottle) || (hotSauceBottle && hotSauceSquirts < 3))
              : !!game.potato && count > 0 && !active;
            return (
              <div key={key} className={`gear-card ${active ? "active" : ""}`}>
                <div className="gear-card-top">
                  <div className="gear-card-icon" aria-hidden="true"><GearIcon kind={item.icon} /></div>
                  <em>{count}</em>
                </div>
                <small>{active ? "Equipped" : count > 0 ? "Owned" : game.sac >= item.cost ? "Can buy" : "Locked by SPUD"}</small>
                <strong>{item.name}</strong>
                <span>{item.description}</span>
                <p className="gear-tip">{item.tip}</p>
                <div className="gear-controls">
                  <button className={`ghost ${game.sac < item.cost ? "visually-disabled" : ""}`} onClick={() => buyEquipment(key)} aria-disabled={game.sac < item.cost}>Buy {item.cost}</button>
                  <button className="blue" onClick={() => useEquipment(key)} disabled={!canUse}>{key === "hotSauce" && hotSauceBottle ? `Squirt ${hotSauceSquirts}/3` : item.use}</button>
                </div>
              </div>
            );
          })}
          {nextUnlock && nextItem && (
            <div className="gear-card locked">
              <div className="gear-card-top">
                <div className="gear-card-icon" aria-hidden="true"><GearIcon kind={nextItem.icon} /></div>
                <em>?</em>
              </div>
              <small>Coming next</small>
              <strong>{nextItem.name}</strong>
              <span>Unlock: {nextUnlock.label}.</span>
              <div className="gear-lock">Locked</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityPanel({
  game,
  register,
  realPlayers,
  playersStatus,
  selectedTarget,
  friendSearch,
  setFriendSearch,
  friendSearchResults,
  friendSearchStatus,
  searchFriends,
  addFriendFromSearch,
  messageDraft,
  setMessageDraft,
  sendSocialPotato,
  setTarget,
  refreshPlayers
}) {
  const spotlight = game.log.find((entry) => entry.type === "good" || entry.type === "bad");
  const playerStatusCopy = playersStatus === "loading"
    ? "Looking..."
    : playersStatus === "offline"
      ? "Offline"
      : realPlayers.length
        ? `${realPlayers.length} friend${realPlayers.length === 1 ? "" : "s"}`
        : "No friends yet";
  return (
    <aside className="panel activity-panel" ref={register("activity")}>
      {game.unlocked.target && (
        <details className="target-drawer" open>
          <summary><span>Friends</span><strong>{selectedTarget ? playerDisplayName(selectedTarget) : playerStatusCopy}</strong></summary>
          <FriendSearch
            query={friendSearch}
            setQuery={setFriendSearch}
            results={friendSearchResults}
            status={friendSearchStatus}
            searchFriends={searchFriends}
            addFriend={addFriendFromSearch}
          />
          {realPlayers.length > 0 ? (
            <>
              <select value={Math.min(game.target, realPlayers.length - 1)} onChange={(e) => setTarget(e.target.value)}>
                {realPlayers.map((target, index) => (
                  <option key={target.id || target.handle} value={index}>{playerDisplayName(target)}</option>
                ))}
              </select>
              <TargetProfile
                game={game}
                target={selectedTarget}
                messageDraft={messageDraft}
                setMessageDraft={setMessageDraft}
                sendSocialPotato={sendSocialPotato}
              />
            </>
          ) : (
            <div className="target-empty">
              <strong>{playersStatus === "offline" ? "Friends offline" : playersStatus === "loading" ? "Loading friends..." : "No friends yet"}</strong>
              <span>{playersStatus === "offline" ? "The friend backend is not responding." : "Search a username above, add them, then send potatoes even when they are away."}</span>
              <button className="ghost mini-action" type="button" onClick={refreshPlayers}>Refresh Friends</button>
            </div>
          )}
        </details>
      )}
      <h2>Live Read</h2>
      {spotlight && (
        <div className={`side-alert show ${spotlight.type}`}>
          <strong>{spotlight.type === "bad" ? "Big loss" : "SPUD move"}</strong>
          <span>{spotlight.text}</span>
        </div>
      )}
      <div className="grid2">
        <div className="stat"><small>Passes</small><strong>{fmt(game.passes)}</strong><span>1 active potato max</span></div>
        <div className="stat good"><small>SPUD Won</small><strong>{fmt(game.won)}</strong><span>From passed potatoes</span></div>
        <div className="stat"><small>Best Win</small><strong>{fmt(game.bestWin)}</strong><span>Single pass</span></div>
        <div className="stat bad"><small>Explosions</small><strong>{fmt(game.explosions)}</strong><span>Spud Pile burns</span></div>
        <div className="stat bad"><small>SPUD Burned</small><strong>{fmt(game.burned)}</strong><span>Explosion losses</span></div>
        <div className="stat good"><small>Social XP</small><strong>{fmt(game.socialXp || 0)}</strong><span>Rivals and passes</span></div>
      </div>
      <EconomyPulse game={game} />
      <h2>SPUD Activity</h2>
      <div className="log">
        {game.log.map((entry) => <div key={entry.id} className={`log-entry ${entry.type}`}>{entry.text}</div>)}
      </div>
    </aside>
  );
}

function FriendSearch({ query, setQuery, results, status, searchFriends, addFriend }) {
  const busy = status === "loading" || status === "adding";
  return (
    <div className="friend-search">
      <div className="friend-search-row">
        <input
          value={query}
          placeholder="Search username"
          maxLength={16}
          onChange={(event) => setQuery(cleanUsername(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") searchFriends();
          }}
        />
        <button className="blue mini-action" type="button" onClick={searchFriends} disabled={busy}>
          {busy ? "..." : "Find"}
        </button>
      </div>
      {status === "empty" && <small>No matching player found.</small>}
      {status === "offline" && <small>Friend search is offline.</small>}
      {results.length > 0 && (
        <div className="friend-results">
          {results.map((player) => (
            <button key={player.id} type="button" onClick={() => addFriend(player)} disabled={busy}>
              <span>{playerDisplayName(player)}</span>
              <strong>Add</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TargetProfile({ game, target, messageDraft, setMessageDraft, sendSocialPotato }) {
  if (!target) return null;
  const targetName = playerDisplayName(target);
  const spendable = socialSpendable(game);
  return (
    <div className="target-profile">
      <div className="target-vibe">
        <small>Friend</small>
        <strong>{targetName}</strong>
      </div>
      <p>Send special potatoes to friends. Messages stay hidden until the potato resolves.</p>
      <div className="target-social-row no-action">
        <span>{target.lastSeenAt ? `Last seen ${new Date(target.lastSeenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Friend"}</span>
      </div>
      <div className="pigeon-message-box">
        <textarea
          value={messageDraft}
          maxLength={180}
          placeholder={`Write ${targetName} a hidden message`}
          onChange={(event) => setMessageDraft(event.target.value.slice(0, 180))}
        />
        <button className="pigeon" type="button" onClick={() => sendSocialPotato("pigeon", messageDraft)} disabled={spendable < socialPotatoes.pigeon.cost || !messageDraft.trim()}>
          Pigeon Potato <small>{socialPotatoes.pigeon.cost} SPUD</small>
        </button>
      </div>
      <div className="social-potato-actions">
        <button className="tainted" type="button" onClick={() => sendSocialPotato("tainted")} disabled={spendable < socialPotatoes.tainted.cost}>
          Tainted Tater <small>{socialPotatoes.tainted.cost} SPUD</small>
        </button>
        <button className="golden" type="button" onClick={() => sendSocialPotato("golden")} disabled={spendable < socialPotatoes.golden.cost}>
          Golden Potato <small>{socialPotatoes.golden.cost} SPUD</small>
        </button>
      </div>
      <small className="social-potato-note">Special potatoes reveal themselves during play.</small>
    </div>
  );
}

function EconomyPulse({ game }) {
  const net = (game.spudCreated || 0) - (game.burned || 0) - (game.spudSunk || 0);
  return (
    <details className="economy-pulse">
      <summary><span>Demo Economy</span><strong>{fmt(net)} net SPUD</strong></summary>
      <div className="economy-grid">
        <div><small>Created</small><strong>{fmt(game.spudCreated || 0)}</strong></div>
        <div><small>Burned</small><strong>{fmt(game.burned || 0)}</strong></div>
        <div><small>Gear Sink</small><strong>{fmt(game.spudSunk || 0)}</strong></div>
        <div><small>Saved</small><strong>{fmt(game.sac || 0)}</strong></div>
      </div>
    </details>
  );
}

function OnboardingModal({ game, setGame, completeOnboarding }) {
  const avatar = avatars[game.avatar] || avatars[0];
  return (
    <div className="modal show">
      <div className="modal-card onboarding-card">
        <h2>Choose Your Player</h2>
        <div className="onboarding-rules">
          <span><strong>1</strong> Earn Tots from sponsors.</span>
          <span><strong>2</strong> Move SPUD into the Spud Pile.</span>
          <span><strong>3</strong> Pass before it blows.</span>
        </div>
        <div className="onboarding-preview">
          <div className="avatar large"><img src={assetUrl("Avatars", avatar.file)} alt="" /></div>
          <div><strong>{game.playerName || "Your Name"}</strong><span>{avatar.name} style</span></div>
        </div>
        <label>
          Username
          <input
            value={game.playerName}
            placeholder="Pick a unique name"
            maxLength={16}
            onChange={(e) => setGame((old) => ({ ...old, playerName: cleanUsername(e.target.value) }))}
          />
        </label>
        <div className="avatar-picker">
          {avatars.map((item) => (
            <button key={item.id} className={item.id === game.avatar ? "selected" : ""} onClick={() => setGame((old) => ({ ...old, avatar: item.id }))}>
              <img src={assetUrl("Avatars", item.file)} alt={item.name} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        <button className="green" onClick={completeOnboarding} disabled={!validUsername(game.playerName)}>Start Playing</button>
      </div>
    </div>
  );
}

function AdModal({ game, file, adReady, claimAd, close, onBadVideo }) {
  const payout = rewardedAdPayout(game.ads);
  return (
    <div className="modal show">
      <div className="modal-card">
        <h2>Rewarded Ad</h2>
        <div className="ad-frame">
          <PlayableAdVideo file={file} soundOn={game.soundOn} onBadVideo={onBadVideo} />
        </div>
        <p>{adReady ? "Ad complete." : "Ad playing..."}</p>
        <button className="green" onClick={claimAd} disabled={!adReady}>Claim +{payout.tots} Tots</button>
        <button className="ghost" onClick={close}>Close</button>
        <p className="ad-pace-note">Reward pace: {payout.tier}. Fresh ad views pay the most Tots.</p>
      </div>
    </div>
  );
}

function MessagePotatoModal({ message, close, reply }) {
  return (
    <div className="modal show message-potato-modal">
      <div className="modal-card message-potato-card">
        <div className="message-potato-head">
          <PigeonPotatoSprite className="message-pigeon-flap" />
          <div>
            <small>{message.outcome === "popped" ? "Message popped open" : "Message delivered"}</small>
            <h2>{message.from} sent a potato note</h2>
          </div>
        </div>
        <blockquote>{message.message}</blockquote>
        <div className="message-actions">
          <button className="blue" type="button" onClick={reply}>Reply</button>
          <button className="ghost" type="button" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}

function SoundCheckPanel({ close, playGroup, playOne }) {
  const groups = [
    ["hotStreak", "Hot Streak", soundFiles.hotStreak?.length || 0],
    ["babyVoice", "Baby Hands Voice", soundFiles.babyVoice?.length || 0],
    ["babyCry", "Baby Hands Cry", soundFiles.babyCry?.length || 0],
    ["potatoExplode", "Potato Explode", soundFiles.potatoExplode?.length || 0],
    ["scary", "Scary Hold", soundFiles.scary?.length || 0],
    ["aLotOfSpud", "A Lot of SPUD", soundFiles.aLotOfSpud ? 1 : 0]
  ];
  return (
    <div className="modal show sound-check-modal">
      <div className="modal-card sound-check-card">
        <div className="sound-check-head">
          <div>
            <small>Debug</small>
            <h2>Sound Check</h2>
          </div>
          <button className="ghost mini-action" type="button" onClick={close}>Close</button>
        </div>
        <p>Use this with <strong>?soundCheck=1</strong> to verify every generated sound group in the React app.</p>
        <div className="sound-check-list">
          {groups.map(([key, label, count]) => (
            <div key={key} className="sound-check-row">
              <div>
                <strong>{label}</strong>
                <span>{count} file{count === 1 ? "" : "s"}</span>
              </div>
              <button className="blue mini-action" type="button" onClick={() => playOne(key)} disabled={!count}>Random</button>
              <button className="ghost mini-action" type="button" onClick={() => playGroup(key)} disabled={!count}>Play All</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FullscreenFx({ fx }) {
  return (
    <div className={`fullscreen-fx ${fx.type}`}>
      <div className="fx-backdrop" />
      <div className="fx-words">
        {fx.gearKind && (
          <div className="fx-gear-prize" aria-hidden="true">
            <div className="gear-card-icon"><GearIcon kind={fx.gearKind} /></div>
          </div>
        )}
        <strong>{fx.title}</strong>
        {fx.subtitle && <span>{fx.subtitle}</span>}
        {fx.note && <em>{fx.note}</em>}
      </div>
      <div className="fx-bursts" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--i": i }} />)}
      </div>
    </div>
  );
}

function PotatoFlightFx({ fx }) {
  const image = fx.assetPath ? assetUrl(fx.assetPath) : assetUrl("Generic Potatoes Transparent", fx.file);
  const pigeon = fx.socialKind === "pigeon" || /pigeon-potato/i.test(fx.assetPath || "");
  return (
    <div className={`potato-flight-fx ${fx.type}`}>
      {fx.type === "golden" && (
        <div className="flight-window" aria-hidden="true">
          <div className="flight-light" />
          <div className="flight-frame">
            <span className="flight-shutter left" />
            <span className="flight-shutter right" />
          </div>
        </div>
      )}
      {pigeon ? <PigeonPotatoSprite className="flight-pigeon-flap" /> : <img src={image} alt="" />}
    </div>
  );
}

function BoomOverlay({ boom }) {
  const sparkCount = typeof window !== "undefined" && window.innerWidth < 760 ? 30 : 46;
  const bitCount = typeof window !== "undefined" && window.innerWidth < 760 ? 20 : 30;
  const smokeCount = typeof window !== "undefined" && window.innerWidth < 760 ? 5 : 8;
  const x = `${boom.x || 0}px`;
  const y = `${boom.y || 0}px`;
  return (
    <div className="boom-overlay" style={{ "--boom-x": x, "--boom-y": y }}>
      <div className="boom-screen-flash" />
      <div className="boom-local-fx" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => <span key={`ring-${i}`} className="boom-local-ring" style={{ "--delay": `${i * 70}ms` }} />)}
        {Array.from({ length: sparkCount }, (_, i) => {
          const angle = (i / sparkCount) * Math.PI * 2 + ((i * 0.37) % 0.8);
          const distance = 130 + ((i * 47) % 230);
          return (
            <span
              key={`spark-${i}`}
              className="boom-spark"
              style={{
                "--dx": `${Math.cos(angle) * distance}px`,
                "--dy": `${Math.sin(angle) * distance + ((i * 31) % 120) - 48}px`,
                "--rot": `${Math.round(angle * 57.2958)}deg`,
                "--delay": `${(i % 7) * 11}ms`
              }}
            />
          );
        })}
        {Array.from({ length: smokeCount }, (_, i) => (
          <span
            key={`smoke-${i}`}
            className="boom-smoke-puff"
            style={{
              "--dx": `${((i * 43) % 96) - 48}px`,
              "--dy": `${((i * 37) % 74) - 28}px`,
              "--delay": `${i * 45}ms`
            }}
          />
        ))}
        {Array.from({ length: bitCount }, (_, i) => (
          <span
            key={`bit-${i}`}
            className={`boom-blast-bit ${i % 5 === 0 ? "chunk" : i % 3 === 0 ? "flash" : ""}`}
            style={{
              "--dx": `${((i * 73) % 86) - 43}vw`,
              "--dy": `${((i * 59) % 70) - 35}vh`,
              "--rot": `${((i * 97) % 1520) - 760}deg`,
              "--size": `${18 + ((i * 11) % 42)}px`,
              "--delay": `${(i % 9) * 12}ms`
            }}
          />
        ))}
      </div>
      <div className="boom-card">
        <div className="boom-emoji">BOOM!</div>
        <strong>SPUD AT RISK COOKED</strong>
        <p>{fmt(boom.burned)} SPUD burned. Spud Sac stayed safe.</p>
      </div>
    </div>
  );
}

function SpudTransferFx({ fx }) {
  const dx = fx.toX - fx.fromX;
  const dy = fx.toY - fx.fromY;
  return (
    <div className="spud-transfer-fx" aria-hidden="true">
      {Array.from({ length: fx.count }, (_, i) => {
        const spread = (i - fx.count / 2) * 5;
        const jitterX = Math.sin(i * 1.7) * 26;
        const jitterY = Math.cos(i * 1.3) * 18;
        return (
          <span
            key={`${fx.id}-${i}`}
            style={{
              "--from-x": `${fx.fromX}px`,
              "--from-y": `${fx.fromY}px`,
              "--dx": `${dx + jitterX}px`,
              "--dy": `${dy + jitterY}px`,
              "--mid-x": `${dx * 0.48 + spread}px`,
              "--mid-y": `${dy * 0.42 - 96 - Math.abs(spread)}px`,
              "--delay": `${i * 24}ms`,
              "--r": `${(i * 37) % 64 - 32}deg`
            }}
          />
        );
      })}
    </div>
  );
}

function SpudWinPop({ fx }) {
  return (
    <div className="spud-win-pop" aria-live="polite" aria-label={`${fmt(fx.amount)} SPUD won`}>
      <div className="spud-win-card">
        <small>SPUD WON</small>
        <strong>+{fmt(fx.amount)}</strong>
        <span>SPUD</span>
        <em>{fx.note}</em>
      </div>
      <div className="spud-win-burst" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => {
          const angle = (i / 14) * Math.PI * 2 - Math.PI / 2;
          const radiusX = 110 + (i % 4) * 20;
          const radiusY = 72 + (i % 3) * 14;
          return (
            <i
              key={`${fx.id}-${i}`}
              style={{
                "--i": i,
                "--dx": `${Math.cos(angle) * radiusX}px`,
                "--dy": `${Math.sin(angle) * radiusY}px`
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function SpudMiniPile({ amount }) {
  const count = clamp(Math.floor(Math.sqrt(Math.max(0, amount)) * 4.7), 0, 190);
  const rows = [];
  const baseCapacity = clamp(Math.ceil(Math.sqrt(count || 1) * 2.2), 5, 22);
  let placed = 0;
  let row = 0;
  while (placed < count) {
    const capacity = Math.max(2, baseCapacity - row * 2);
    const used = Math.min(capacity, count - placed);
    rows.push({ start: placed, used, capacity, row });
    placed += used;
    row += 1;
  }
  return (
    <div className={`spud-pile-stack ${count ? "" : "empty"}`}>
      {Array.from({ length: count }, (_, i) => {
        const info = rows.find((item) => i >= item.start && i < item.start + item.used) || rows[0];
        const inRow = i - info.start;
        const rowCenter = (info.used - 1) / 2;
        const layerStagger = info.row % 2 ? 4.5 : 0;
        const spread = clamp(13.5 - info.row * 0.7, 8, 13.5);
        const x = (inRow - rowCenter) * spread + layerStagger + Math.sin(i * 2.1) * 1.1;
        const y = info.row * 8.1 + Math.cos(i * 1.7) * 0.6;
        const size = clamp(19 - info.row * 0.35 + (i % 4) * 0.8, 14, 21);
        const r = (i * 37) % 44 - 22;
        return (
          <span
            key={i}
            style={{
              "--x": `${x}px`,
              "--y": `${y}px`,
              "--size": `${size}px`,
              "--r": `${r}deg`,
              "--z": info.row * 10 + inRow
            }}
          />
        );
      })}
    </div>
  );
}

function finishCoachSide(target, targetRect, cardRect) {
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fitsTop = targetRect.top - margin - cardRect.height >= margin;
  const fitsBottom = targetRect.bottom + margin + cardRect.height <= vh - margin;
  const fitsRight = targetRect.right + margin + cardRect.width <= vw - margin;
  const fitsLeft = targetRect.left - margin - cardRect.width >= margin;
  const isActionRow = target.classList?.contains("actions");
  const inActionRow = !!target.closest?.(".actions");

  if (isActionRow && fitsBottom) return "bottom";
  if ((inActionRow || targetRect.top > vh * 0.55) && fitsTop) return "top";
  if (!inActionRow && fitsRight) return "right";
  if (!inActionRow && fitsLeft) return "left";
  if (fitsBottom) return "bottom";
  if (fitsTop) return "top";
  if (fitsRight) return "right";
  if (fitsLeft) return "left";
  return "bottom";
}

function positionCoach(card, target) {
  if (!card || !target) return;
  const targetRect = target.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const isMobile = window.matchMedia?.("(max-width: 900px)").matches;
  const side = isMobile
    ? (targetRect.top > window.innerHeight * 0.48 ? "top" : "bottom")
    : finishCoachSide(target, targetRect, cardRect);
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = targetRect.right + margin;
  let top = targetRect.top + targetRect.height / 2 - cardRect.height / 2;
  if (side === "left") left = targetRect.left - cardRect.width - margin;
  if (side === "bottom") {
    left = targetRect.left + targetRect.width / 2 - cardRect.width / 2;
    top = targetRect.bottom + margin;
  }
  if (side === "top") {
    left = targetRect.left + targetRect.width / 2 - cardRect.width / 2;
    top = targetRect.top - cardRect.height - margin;
  }
  left = clamp(left, margin, vw - cardRect.width - margin);
  top = clamp(top, margin, vh - cardRect.height - margin);
  if (isMobile) {
    top = clamp(top, 70, Math.max(70, vh - cardRect.height - 112));
  }

  card.style.setProperty("--coach-left", `${left}px`);
  card.style.setProperty("--coach-top", `${top}px`);
  card.dataset.side = side;
  if (side === "right" || side === "left") {
    const arrowTop = clamp(targetRect.top + targetRect.height / 2 - top, 20, cardRect.height - 20);
    card.style.setProperty("--coach-arrow-top", `${arrowTop}px`);
    card.style.setProperty("--coach-arrow-left", "24px");
  } else {
    const arrowLeft = clamp(targetRect.left + targetRect.width / 2 - left, 24, cardRect.width - 24);
    card.style.setProperty("--coach-arrow-left", `${arrowLeft}px`);
    card.style.setProperty("--coach-arrow-top", "0px");
  }
}

function vibeText(age) {
  if (age > 80) return "Screaming";
  if (age > 55) return "Smoking";
  if (age > 34) return "Twitchy";
  if (age > 18) return "Warm";
  return "Too calm";
}

function powerName(power) {
  return power === "overdrive" ? "Overdrive" : "Golden Window";
}
