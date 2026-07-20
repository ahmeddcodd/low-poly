// Every gameplay number the progression depends on lives here, so balance passes
// never require touching system code. See the design doc for the reasoning behind
// each curve.

export const STARTING_CASH = 500;

// Added per scoop on top of the recipe base, so every machine bought raises the
// average ticket directly. Recipe definitions live in recipes.js.
export const FLAVOR_BONUS = Object.freeze({
  vanilla: 0,
  chocolate: 4,
  strawberry: 8,
  mint: 14,
});

// Weight applied to a recipe when rolling a customer order, keyed by how far the
// recipe's tier sits below the best one currently craftable. Newest tier dominates
// so the average ticket climbs as the menu grows.
export const RECIPE_TIER_WEIGHTS = Object.freeze([6, 3, 2, 1]);

// Sitting in pays more than taking away. This is the whole mechanical point of seating:
// it never gates service, it just raises the ticket on customers who get a clean seat.
export const DINE_IN_BONUS = 1.5;

// Soft time pressure: patience only ever changes the payout, never fails the run.
export const PATIENCE = Object.freeze({
  baseSeconds: 26,
  // Shrinks as the shop gets busier, floored so it never becomes unfair.
  minSeconds: 14,
  secondsLostPerLevel: 0.8,
  // The napkin holder buys back a little grace.
  napkinBonusSeconds: 4,
  tiers: Object.freeze([
    Object.freeze({ minRemaining: 0.8, multiplier: 1.5, stars: 2, label: 'PERFECT' }),
    Object.freeze({ minRemaining: 0.5, multiplier: 1.25, stars: 2, label: 'GREAT' }),
    Object.freeze({ minRemaining: 0, multiplier: 1, stars: 1, label: '' }),
  ]),
});

// 15 levels on a ~1.6n² curve.
//
// Calibrated against measured throughput, not a guess. An earlier ~3.2n² curve assumed
// roughly 20 customers/minute; instrumenting a real run showed 5-12/min once the player is
// also banking cash, buying pads and cleaning tables. That curve put levels 2-4 inside the
// first two minutes and then walled the player for six minutes with nothing to reach for.
// At ~12/min these thresholds put level 15 around the 25 minute mark with a level roughly
// every 90 seconds throughout.
export const LEVELS = Object.freeze([
  Object.freeze({ level: 1, stars: 0, spawnInterval: 5.0 }),
  Object.freeze({ level: 2, stars: 4, spawnInterval: 4.7 }),
  Object.freeze({ level: 3, stars: 10, spawnInterval: 4.4 }),
  Object.freeze({ level: 4, stars: 18, spawnInterval: 4.1 }),
  Object.freeze({ level: 5, stars: 28, spawnInterval: 3.8 }),
  Object.freeze({ level: 6, stars: 42, spawnInterval: 3.5 }),
  Object.freeze({ level: 7, stars: 58, spawnInterval: 3.2 }),
  Object.freeze({ level: 8, stars: 78, spawnInterval: 3.0 }),
  Object.freeze({ level: 9, stars: 100, spawnInterval: 2.8 }),
  Object.freeze({ level: 10, stars: 128, spawnInterval: 2.6 }),
  Object.freeze({ level: 11, stars: 160, spawnInterval: 2.4 }),
  Object.freeze({ level: 12, stars: 195, spawnInterval: 2.2 }),
  Object.freeze({ level: 13, stars: 232, spawnInterval: 2.0 }),
  Object.freeze({ level: 14, stars: 272, spawnInterval: 1.7 }),
  Object.freeze({ level: 15, stars: 315, spawnInterval: 1.4 }),
]);

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level;

// Purchase pads. The drain rate scales with price so a $1,500 item does not take
// 44 seconds of standing still the way a flat rate would.
export const PAD = Object.freeze({
  radius: 0.95,
  drainSeconds: 1.6,
  minDrainRate: 60,
  cashPerFlight: 4,
  flightDuration: 0.46,
  maxFlights: 18,
  revealDuration: 0.55,
  revealOvershoot: 0.16,
});

export function padDrainRate(cost) {
  return Math.max(PAD.minDrainRate, cost / PAD.drainSeconds);
}

// Cold open: the player starts on the pavement outside the south entrance. The
// bound is relaxed only until the shop opens, so nobody wanders off mid-game.
export const COLD_OPEN = Object.freeze({
  playerStart: Object.freeze([-2.5, 8.4]),
  outdoorMaxZ: 8.6,
  indoorMaxZ: 7.05,
});

export function levelForStars(stars) {
  let level = LEVELS[0];
  for (const entry of LEVELS) {
    if (stars >= entry.stars) level = entry;
    else break;
  }
  return level;
}

export function nextLevelFor(level) {
  return LEVELS.find((entry) => entry.level === level + 1) ?? null;
}
