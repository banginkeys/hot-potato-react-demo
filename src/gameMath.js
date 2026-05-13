import { SPUD, potatoFiles, potatoTypes } from "./gameData.js";

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function rand(min, max) {
  return Math.random() * (max - min) + min;
}

export function int(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function fmt(n, digits = 0) {
  return (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function money(n) {
  return `$${(Number(n) || 0).toFixed(3)}`;
}

export function passCost(p, babyHandsRounds = 0) {
  if (!p) return 1;
  const riskSeconds = p.age + p.held * 1.4;
  const base = clamp(7 - clamp(riskSeconds / 78, 0, 1) * 6, 1, 7);
  const babyTax = babyHandsRounds > 0 && p.age <= 5;
  return Number((babyTax ? base * 2 : base).toFixed(1));
}

export function makePotato(nextIndex = 0, pendingPower = "") {
  const type = potatoTypes[int(0, potatoTypes.length - 1)];
  const file = potatoFiles[nextIndex % potatoFiles.length];
  return {
    id: Math.floor(1000 + Math.random() * 9000),
    name: type.name,
    rarity: type.rarity,
    file,
    sender: "the table",
    throwSide: Math.random() < 0.5 ? "left" : "right",
    pool: 0,
    age: 0,
    held: 0,
    heat: type.heat + rand(-4, 6),
    fuse: rand(58, 98),
    safeUntil: rand(3, 5.8),
    volatility: rand(0.86, 1.22),
    growth: type.growth,
    danger: 0,
    equipment: {},
    power: pendingPower || ""
  };
}

export function equipmentGrowthMultiplier(p) {
  if (!p) return 1;
  const gear = p.equipment || {};
  let mult = 1;
  if (gear.foilWrap) mult *= 0.92;
  if (gear.hotSauceSquirts) mult *= 1 + gear.hotSauceSquirts * 0.24;
  return clamp(mult, 0.8, 2.6);
}

export function equipmentStressMultiplier(p, holding) {
  if (!p) return 1;
  const gear = p.equipment || {};
  let mult = 1;
  if (gear.foilWrap) mult *= 0.84;
  if (gear.sourCreamTicks > 0) mult *= 0.56;
  if (gear.ovenMitts && holding) mult *= 0.72;
  if (gear.hotSauceSquirts) mult *= 1 + gear.hotSauceSquirts * 0.085;
  return clamp(mult, 0.42, 1.55);
}

export function advancePotato(p, holding, powerGrowth = 1) {
  if (!p) return p;
  const next = {
    ...p,
    age: p.age + 1,
    equipment: { ...(p.equipment || {}) }
  };
  if (next.equipment.sourCreamTicks > 0) next.equipment.sourCreamTicks -= 1;
  if (next.equipment.hotSauceTicks > 0) next.equipment.hotSauceTicks -= 1;
  if (next.equipment.sizzleMeterTicks > 0) next.equipment.sizzleMeterTicks -= 1;
  const growthMult = equipmentGrowthMultiplier(next) * clamp(powerGrowth, 1, 8);
  const stressMult = equipmentStressMultiplier(next, holding);
  const holdingBoost = holding ? 1 : 0;
  next.pool = Number((next.pool + (holding ? 1.8 : 0.46) * next.growth * next.volatility * growthMult + holdingBoost * next.held * 0.04).toFixed(1));
  next.heat += (holding ? 1.05 : 0.24) * next.volatility * stressMult;
  next.danger += (holding ? 0.005 : 0.0015) * next.volatility * stressMult;
  next.fuse -= (holding ? 1.72 : 0.58) * next.volatility * stressMult;
  if (holding) next.held += 1;
  return next;
}

export function explosionChance(p, holding) {
  if (!p || p.age < p.safeUntil) return 0;
  const gear = p.equipment || {};
  const base = 0.0022;
  const holdBoost = holding ? (0.006 + clamp(p.held / 90, 0, 0.03)) * (gear.ovenMitts ? 0.72 : 1) : 0;
  const panicBoost = p.age > 90 ? clamp((p.age - 90) / 70, 0, 1) * 0.026 : 0;
  const equipmentBias = (gear.foilWrap ? -0.0025 : 0) + (gear.sourCreamTicks > 0 ? -0.004 : 0) + (gear.hotSauceSquirts || 0) * 0.0016;
  return clamp(base + p.danger * 0.03 + holdBoost + panicBoost + equipmentBias, 0.001, holding ? 0.16 : 0.095);
}

export function nextPowerForStreak(streak) {
  if (!streak || streak % 5 !== 0) return "";
  const run = Math.floor(streak / 5);
  return run % 2 === 1 ? "golden-window" : "overdrive";
}

export function applyPassiveAdRevenue(game) {
  if (!game.connected || !game.unlocked.sponsor) return game;
  const passiveAdSeconds = game.passiveAdSeconds + 1;
  const passiveAdImpressions = passiveAdSeconds % SPUD.passiveImpressionSeconds === 0
    ? game.passiveAdImpressions + 2
    : game.passiveAdImpressions;
  const sponsorSlot = passiveAdSeconds % SPUD.passiveImpressionSeconds === 0
    ? game.sponsorSlot + 1
    : game.sponsorSlot;
  return {
    ...game,
    passiveAdSeconds,
    passiveAdImpressions,
    sponsorSlot,
    creatorAdRevenue: Number((game.creatorAdRevenue + SPUD.passiveRevenuePerSecond).toFixed(4))
  };
}
