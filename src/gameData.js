import manifest from "./assetManifest.js";

export const SAVE_KEY = "hot-potato-react-demo-v1";

export const SPUD = {
  riskFundTots: 6,
  riskFundSpud: 10,
  rewardedAdTots: 12,
  rewardedAdRevenue: 0.018,
  sponsorBreakTots: 5,
  sponsorBreakRevenue: 0.01,
  sponsorBreakSeconds: 8,
  passiveRevenuePerSecond: 0.000025,
  passiveImpressionSeconds: 18
};

export const equipment = {
  ovenMitts: {
    name: "Oven Mitts",
    cost: 18,
    use: "Wear",
    icon: "mitts",
    description: "Hold with less heat pressure.",
    tip: "Best before you start holding."
  },
  sourCream: {
    name: "Sour Cream",
    cost: 12,
    use: "Use",
    icon: "cream",
    description: "Cool the potato without slowing the pile.",
    tip: "Emergency delay when things look cooked."
  },
  hotSauce: {
    name: "Hot Sauce",
    cost: 14,
    use: "Squirt",
    icon: "sauce",
    description: "Three squirts on one potato. Bigger pile, nastier heat.",
    tip: "Greed button. Great prize, hotter hands."
  },
  foilWrap: {
    name: "Foil Wrap",
    cost: 10,
    use: "Wrap",
    icon: "foil",
    description: "Safer heat, slightly slower SPUD pile.",
    tip: "Use early to protect a big run."
  },
  thermometer: {
    name: "Thermometer",
    cost: 35,
    use: "Read",
    icon: "thermo",
    description: "Reveal exact SPUD inside this potato.",
    tip: "Scout a high-stakes potato before deciding."
  }
};

const avatarNames = {
  "avatar-flute-sprout.png": "Flute Sprout",
  "avatar-fork-friend.png": "Fork Friend",
  "avatar-harvest-hero.png": "Harvest Hero",
  "avatar-moss-sage.png": "Moss Sage",
  "avatar-paint-pal.png": "Paint Pal",
  "avatar-soup-chef.png": "Soup Chef",
  "avatar-spike-guard.png": "Spike Guard",
  "avatar-spud-king.png": "Spud King",
  "avatar-tater-runner.png": "Tater Runner",
  "avatar-trail-scout.png": "Trail Scout"
};

const fallbackAvatars = [
  "avatar-fork-friend.png",
  "avatar-paint-pal.png",
  "avatar-trail-scout.png",
  "avatar-flute-sprout.png",
  "avatar-harvest-hero.png",
  "avatar-spike-guard.png",
  "avatar-soup-chef.png",
  "avatar-tater-runner.png",
  "avatar-spud-king.png",
  "avatar-moss-sage.png"
];

export const avatars = (manifest.avatars?.length ? manifest.avatars : fallbackAvatars)
  .map((file, id) => ({ id, name: avatarNames[file] || file.replace(/\.[^.]+$/, ""), file }));

const fallbackPotatoFiles = [
  "21bb252d-7af3-496b-a597-52c48360d5b6.png",
  "2fc92bf1-5242-451d-abf4-15bc120e9b2d (1).png",
  "2fc92bf1-5242-451d-abf4-15bc120e9b2d.png",
  "34c503af-22ef-4fd3-8338-d62746bb68ed.png",
  "4b656750-c5cd-4770-878b-40b4f4f34729.png",
  "705a2a47-69be-44a7-b804-6e9957812cee.png",
  "72f24634-eca3-49d6-a21c-c949d10115f0.png",
  "83d78d0e-28ea-4b21-8d54-4b6e600b115e.png",
  "858f21c3-1e37-4b05-ac8a-aa7dd8ef5079.png",
  "9cf49c71-8422-4971-8dfa-657cc85f6ce6.png",
  "a3df9978-8a4c-445c-b208-875081004bd3.png",
  "cb6fb45c-d71e-4dac-a6b7-446a36abee18.png",
  "e636bb14-19ed-4740-b6c4-bbdbeadf8823.png"
];

export const potatoFiles = manifest.potatoFiles?.length ? manifest.potatoFiles : fallbackPotatoFiles;

export const potatoTypes = [
  { name: "Table Potato", rarity: "Common", heat: 18, growth: 1.0 },
  { name: "Golden Hot Potato", rarity: "Rare", heat: 24, growth: 1.45 },
  { name: "Pepper Russet", rarity: "Spicy", heat: 32, growth: 1.75 },
  { name: "Cold-Fire Potato", rarity: "Frostfire", heat: 14, growth: 1.35 },
  { name: "Glitch Potato", rarity: "Wild", heat: 28, growth: 1.9 }
];

export const sponsors = [
  { title: "Tater Threads", line: "Fresh skins for brave hands." },
  { title: "MashMart", line: "Fuel, flavor, and questionable choices." },
  { title: "Crispy Cloud", line: "Server heat handled somewhere else." },
  { title: "Spud Shield", line: "Gear up before the next throw." },
  { title: "Kettle Club", line: "Snacks for people who hold too long." }
];

export const adFiles = manifest.adFiles?.length ? manifest.adFiles : [
  "mp_.mp4",
  "ooh_that_s_awesome_but_where_i.mp4"
];

export const soundFiles = {
  hotStreak: manifest.sounds?.hotStreak || [],
  potatoExplode: manifest.sounds?.potatoExplode || [],
  babyVoice: manifest.sounds?.babyVoice || [],
  babyCry: manifest.sounds?.babyCry || [],
  scary: manifest.sounds?.scary || [],
  aLotOfSpud: manifest.sounds?.aLotOfSpud?.find((file) => /A_lot_of_spud/i.test(file)) || ""
};

export function assetUrl(...parts) {
  const encoded = parts
    .flatMap((part) => String(part).split(/[\\/]+/).filter(Boolean))
    .map((part) => encodeURIComponent(part));
  return `${import.meta.env.BASE_URL}${encoded.join("/")}`;
}

export function emptyEquipment() {
  return Object.keys(equipment).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
}
