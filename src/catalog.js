// The buildable catalog. Every purchasable thing in the shop is one entry here,
// and nothing else in the codebase decides what can be bought or when.
//
// Fields
//   id         unique key, also the save key
//   label      text stamped on the purchase pad
//   cost       price in dollars (0 for reveal-only entries)
//   level      shop level at which the ghost appears on the floor
//   requires   ids that must be owned first (prereq chain)
//   ghost      Ghost_* node in trays_support_all.glb. null means "derive one procedurally"
//              via makeGhost() — the counter pack in ice_cream_shop_glb_exports ships no
//              ghosts at all, and the counter is the very first thing the player buys, so
//              the authored ghosts are an art upgrade for some entries, never the mechanism.
//   position   [x, y, z] for the ghost
//   padAt      [x, z] for the purchase pad; defaults to the ghost position
//   rotation   Y rotation of the ghost, radians
//   padless    true for entries that only reveal something (the office hire pads charge
//              their own cost inside the room, so the catalog just gates availability)
//   effect     { type, ... } applied on purchase — see build-system.js EFFECT_HANDLERS
//
// Costs follow ice_cream_glb/manifest.json `unlock_cost_placeholder` except the three
// Act 1 items, which are tuned so the opening spend lands exactly on the $500 balance.

const MACHINE_Z = -4.72;
const MACHINE_PAD_Z = -3.2;
const DISPENSER_X = 3.6;
const DISPENSER_PAD_X = 2.45;
const STORAGE_X = -8.15;

export const CATALOG = Object.freeze([
  // ── Act 1 — opening day. Strictly linear, one pad at a time. ──────────────
  Object.freeze({
    id: 'serving-counter',
    label: 'COUNTER',
    cost: 180,
    level: 1,
    ghost: null,
    position: Object.freeze([2, 0.02, -0.82]),
    padAt: Object.freeze([2, -2.2]),
    rotation: 0,
    effect: Object.freeze({ type: 'furniture', ids: Object.freeze(['main-serving-counter']) }),
  }),
  Object.freeze({
    id: 'vanilla-machine',
    label: 'VANILLA',
    cost: 220,
    level: 1,
    requires: Object.freeze(['serving-counter']),
    ghost: 'Ghost_MachineVanilla',
    position: Object.freeze([-6.4, 0.02, MACHINE_Z]),
    padAt: Object.freeze([-6.4, MACHINE_PAD_Z]),
    rotation: 0,
    effect: Object.freeze({ type: 'flavor', flavor: 'vanilla' }),
  }),
  Object.freeze({
    id: 'cone-dispenser',
    label: 'CONES',
    cost: 100,
    level: 1,
    requires: Object.freeze(['vanilla-machine']),
    ghost: 'Ghost_SupportConeDispenser',
    position: Object.freeze([DISPENSER_X, 0.02, -3.1]),
    padAt: Object.freeze([DISPENSER_PAD_X, -3.1]),
    rotation: -Math.PI / 2,
    // Buying the last Act 1 item is what opens the shop.
    effect: Object.freeze({ type: 'station', id: 'cone-dispenser', opensShop: true }),
  }),

  // ── Act 2 — first customers ───────────────────────────────────────────────
  Object.freeze({
    id: 'ice-cream-holder',
    label: 'HOLDER',
    cost: 90,
    level: 2,
    ghost: 'Ghost_SupportIceCreamHolder',
    position: Object.freeze([3.05, 0.02, -1.75]),
    rotation: -Math.PI / 2,
    effect: Object.freeze({ type: 'counterBuffer', capacity: 4 }),
  }),
  Object.freeze({
    id: 'cup-dispenser',
    label: 'CUPS',
    cost: 120,
    level: 2,
    ghost: 'Ghost_SupportCupDispenser',
    position: Object.freeze([DISPENSER_X, 0.02, -4.35]),
    padAt: Object.freeze([DISPENSER_PAD_X, -4.35]),
    rotation: -Math.PI / 2,
    effect: Object.freeze({ type: 'station', id: 'cup-dispenser' }),
  }),
  Object.freeze({
    id: 'starter-storage',
    label: 'STORAGE',
    cost: 100,
    level: 3,
    ghost: 'Ghost_SupportStarterStorageShelf',
    position: Object.freeze([STORAGE_X, 0.02, -3.2]),
    padAt: Object.freeze([-7.1, -3.2]),
    rotation: Math.PI / 2,
    effect: Object.freeze({ type: 'storage', capacity: 12 }),
  }),
  Object.freeze({
    id: 'chocolate-machine',
    label: 'CHOCOLATE',
    cost: 180,
    level: 3,
    ghost: 'Ghost_MachineChocolate',
    position: Object.freeze([-1.6, 0.02, MACHINE_Z]),
    padAt: Object.freeze([-1.6, MACHINE_PAD_Z]),
    rotation: 0,
    // Owning a second machine is what unlocks double scoops.
    effect: Object.freeze({ type: 'flavor', flavor: 'chocolate' }),
  }),

  // Until this is bought the shop has no seating at all and every order goes out as
  // takeaway. Seating is the upgrade that lets customers stay.
  Object.freeze({
    id: 'first-table',
    label: 'FIRST TABLE',
    cost: 150,
    level: 3,
    ghost: null,
    position: Object.freeze([-4.3, 0.02, 3.6]),
    padAt: Object.freeze([-4.3, 2.3]),
    rotation: 0,
    effect: Object.freeze({ type: 'table', id: 'compact-table' }),
  }),

  // ── Act 3 — the tray ──────────────────────────────────────────────────────
  Object.freeze({
    id: 'tray-four',
    label: '4 ORDERS',
    cost: 100,
    level: 4,
    ghost: 'Ghost_TrayFourOrder',
    position: Object.freeze([3.4, 0.02, -1.9]),
    padAt: Object.freeze([2.6, -1.9]),
    rotation: -Math.PI / 2,
    effect: Object.freeze({ type: 'tray', asset: 'Tray_4_Order', capacity: 4 }),
  }),
  Object.freeze({
    id: 'dining-north',
    label: 'MORE SEATS',
    cost: 250,
    level: 4,
    ghost: null,
    position: Object.freeze([-6.5, 0.02, 2.45]),
    rotation: 0,
    effect: Object.freeze({ type: 'table', id: 'dining-set-north' }),
  }),
  Object.freeze({
    id: 'counter-extension',
    label: 'BIGGER SHOP',
    cost: 200,
    level: 5,
    ghost: null,
    position: Object.freeze([-2.47, 0.02, -0.82]),
    padAt: Object.freeze([-2.47, -2.2]),
    rotation: 0,
    effect: Object.freeze({
      type: 'furniture',
      ids: Object.freeze(['ice-cream-display', 'counter-corner', 'counter-return']),
    }),
  }),
  Object.freeze({
    id: 'spoon-wafer-dispenser',
    label: 'SPOONS',
    cost: 120,
    level: 5,
    ghost: 'Ghost_SupportSpoonWaferDispenser',
    position: Object.freeze([DISPENSER_X, 0.02, -5.6]),
    padAt: Object.freeze([DISPENSER_PAD_X, -5.6]),
    rotation: -Math.PI / 2,
    effect: Object.freeze({ type: 'station', id: 'spoon-wafer-dispenser' }),
  }),
  Object.freeze({
    id: 'napkin-holder',
    label: 'NAPKINS',
    cost: 60,
    level: 5,
    ghost: null,
    position: Object.freeze([0.35, 0.02, -1.55]),
    rotation: 0,
    // Buys back a little customer grace — see PATIENCE.napkinBonusSeconds.
    effect: Object.freeze({ type: 'patience', bonusSeconds: 4 }),
  }),
  Object.freeze({
    id: 'strawberry-machine',
    label: 'STRAWBERRY',
    cost: 360,
    level: 6,
    ghost: 'Ghost_MachineStrawberry',
    position: Object.freeze([-4, 0.02, MACHINE_Z]),
    padAt: Object.freeze([-4, MACHINE_PAD_Z]),
    rotation: 0,
    effect: Object.freeze({ type: 'flavor', flavor: 'strawberry' }),
  }),

  // ── Act 4 — hire help ─────────────────────────────────────────────────────
  Object.freeze({
    id: 'hr-office',
    label: 'HR OFFICE',
    cost: 0,
    level: 6,
    padless: true,
    // The hire pad inside the office charges its own cost; this only reveals it.
    effect: Object.freeze({ type: 'office', managerId: 'gym-manager' }),
  }),
  Object.freeze({
    id: 'dining-center',
    label: 'MORE TABLES',
    cost: 250,
    level: 7,
    ghost: null,
    position: Object.freeze([-6.5, 0.02, 5]),
    rotation: 0,
    effect: Object.freeze({ type: 'table', id: 'dining-set-center' }),
  }),
  Object.freeze({
    id: 'storage-chest',
    label: 'FREEZER',
    cost: 300,
    level: 7,
    requires: Object.freeze(['starter-storage']),
    ghost: 'Ghost_SupportStorageChest',
    position: Object.freeze([STORAGE_X, 0.02, -1.5]),
    padAt: Object.freeze([-7.1, -1.5]),
    rotation: Math.PI / 2,
    effect: Object.freeze({ type: 'storage', capacity: 16 }),
  }),

  // ── Act 5 — the premium menu ──────────────────────────────────────────────
  Object.freeze({
    id: 'basic-topping',
    label: 'TOPPINGS',
    cost: 220,
    level: 8,
    ghost: 'Ghost_SupportBasicToppingStation',
    position: Object.freeze([-7.78, 0.02, -0.7]),
    padAt: Object.freeze([-6.7, -0.7]),
    rotation: Math.PI / 2,
    effect: Object.freeze({ type: 'station', id: 'basic-topping' }),
  }),
  Object.freeze({
    id: 'syrup-bottles',
    label: 'SYRUP',
    cost: 140,
    level: 8,
    requires: Object.freeze(['basic-topping']),
    ghost: null,
    position: Object.freeze([-7.78, 0.02, 0.75]),
    padAt: Object.freeze([-6.7, 0.75]),
    rotation: Math.PI / 2,
    // Deliberately NOT a sundae prereq — Support_DeluxeToppingStation already has syrup
    // bottles modelled in, and gating the headline recipe on a small prop would be fussy.
    // It just makes sundaes worth more.
    effect: Object.freeze({ type: 'menuBonus', recipe: 'sundae', bonus: 15 }),
  }),
  Object.freeze({
    id: 'takeaway-window',
    label: 'TAKEAWAY',
    cost: 350,
    level: 9,
    ghost: null,
    position: Object.freeze([5.6, 0.02, -1.35]),
    padAt: Object.freeze([5.6, -1.35]),
    rotation: 0,
    // Decouples throughput from the six-seat ceiling.
    effect: Object.freeze({ type: 'takeaway', share: 0.5 }),
  }),
  // Tray_8_Order is 3.45 x 1.90 m — that is furniture, not a hand prop, and there is no
  // clear floor slot for it either. Carry capacity therefore caps at 1 -> 4, and the
  // Act 5 throughput upgrade is a bigger counter buffer instead. Revisit the 8-tray once
  // the 4-tray can be judged on screen.
  Object.freeze({
    id: 'mint-machine',
    label: 'MINT',
    cost: 620,
    level: 9,
    ghost: 'Ghost_MachineMint',
    position: Object.freeze([0.8, 0.02, MACHINE_Z]),
    padAt: Object.freeze([0.8, MACHINE_PAD_Z]),
    rotation: 0,
    effect: Object.freeze({ type: 'flavor', flavor: 'mint' }),
  }),

  // ── Act 6 — the machine ───────────────────────────────────────────────────
  Object.freeze({
    id: 'speed-booster',
    label: 'FASTER',
    cost: 480,
    level: 10,
    ghost: 'Ghost_UpgradeSpeedBooster',
    position: Object.freeze([-5.2, 0.02, -3.55]),
    padAt: Object.freeze([-5.2, -2.75]),
    rotation: 0,
    effect: Object.freeze({ type: 'machineModule', module: 'speed', asset: 'Upgrade_SpeedBoosterModule' }),
  }),
  Object.freeze({
    id: 'capacity-module',
    label: 'BIGGER TANKS',
    cost: 560,
    level: 11,
    ghost: 'Ghost_UpgradeCapacityModule',
    position: Object.freeze([-2.8, 0.02, -3.55]),
    padAt: Object.freeze([-2.8, -2.75]),
    rotation: 0,
    effect: Object.freeze({ type: 'machineModule', module: 'capacity', asset: 'Upgrade_CapacityModule' }),
  }),
  Object.freeze({
    id: 'improved-storage',
    label: 'COLD ROOM',
    cost: 650,
    level: 11,
    requires: Object.freeze(['storage-chest']),
    ghost: 'Ghost_SupportImprovedRefrigeratedStorage',
    position: Object.freeze([STORAGE_X, 0.02, 0.3]),
    padAt: Object.freeze([-7.1, 0.3]),
    rotation: Math.PI / 2,
    effect: Object.freeze({ type: 'storage', capacity: 24 }),
  }),
  Object.freeze({
    id: 'gm-office',
    label: 'GM OFFICE',
    cost: 0,
    level: 12,
    padless: true,
    effect: Object.freeze({ type: 'office', managerId: 'wc-manager' }),
  }),
  Object.freeze({
    id: 'deluxe-topping',
    label: 'DELUXE BAR',
    cost: 780,
    level: 12,
    requires: Object.freeze(['basic-topping']),
    ghost: 'Ghost_SupportDeluxeToppingStation',
    position: Object.freeze([-7.78, 0.02, -0.7]),
    padAt: Object.freeze([-6.7, -0.7]),
    rotation: Math.PI / 2,
    // Replaces the basic station in the same slot.
    effect: Object.freeze({ type: 'station', id: 'deluxe-topping', replaces: 'basic-topping' }),
  }),
  Object.freeze({
    id: 'auto-dispense',
    label: 'AUTO',
    cost: 920,
    level: 13,
    requires: Object.freeze(['speed-booster', 'capacity-module']),
    ghost: 'Ghost_UpgradeAutoDispense',
    position: Object.freeze([-0.4, 0.02, -3.55]),
    padAt: Object.freeze([-0.4, -2.75]),
    rotation: 0,
    effect: Object.freeze({ type: 'machineModule', module: 'auto', asset: 'Upgrade_AutoDispenseModule' }),
  }),
  Object.freeze({
    id: 'premium-freezer',
    label: 'PREMIUM',
    cost: 1500,
    level: 14,
    requires: Object.freeze(['improved-storage']),
    ghost: 'Ghost_SupportPremiumFreezer',
    position: Object.freeze([STORAGE_X, 0.02, 2.3]),
    padAt: Object.freeze([-7.1, 2.3]),
    rotation: Math.PI / 2,
    effect: Object.freeze({ type: 'storage', capacity: 48, finale: true }),
  }),
]);

export const CATALOG_BY_ID = Object.freeze(
  new Map(CATALOG.map((entry) => [entry.id, entry])),
);

// The line under the price on each pad. Every pad used to read the same generic
// "SHOP EXPANSION", which told the player nothing about what they were buying. These say
// what the thing DOES — kept to two or three short words so they stay legible on a small
// pad seen from a fixed isometric camera.
const PAD_SUBTITLES = Object.freeze({
  'serving-counter': 'SERVE FROM HERE',
  'vanilla-machine': 'MAKES ICE CREAM',
  'cone-dispenser': 'OPENS THE SHOP',

  'ice-cream-holder': 'HOLDS 4 ORDERS',
  'cup-dispenser': 'CUPS PAY MORE',
  'starter-storage': 'MORE STOCK',
  'chocolate-machine': 'NEW FLAVOUR',

  'first-table': 'GUESTS SIT IN',
  'tray-four': 'CARRY 4 AT ONCE',
  'dining-north': '+2 SEATS',
  'counter-extension': 'BIGGER COUNTER',
  'spoon-wafer-dispenser': 'FINISH CUPS',
  'napkin-holder': 'HAPPIER GUESTS',
  'strawberry-machine': 'NEW FLAVOUR',

  'hr-office': 'HIRE STAFF',
  'dining-center': '+2 SEATS',
  'storage-chest': 'MORE STOCK',

  'basic-topping': 'UNLOCKS SUNDAES',
  'syrup-bottles': 'RICHER SUNDAES',
  'takeaway-window': 'NO SEAT NEEDED',
  'mint-machine': 'PREMIUM FLAVOUR',

  'speed-booster': 'FASTER MACHINES',
  'capacity-module': 'BIGGER TANKS',
  'improved-storage': 'MORE STOCK',
  'gm-office': 'DOUBLE PROFIT',
  'deluxe-topping': '9 TOPPINGS',
  'auto-dispense': 'RUNS ITSELF',
  'premium-freezer': 'MAXIMUM STOCK',
});

export function padSubtitle(id) {
  return PAD_SUBTITLES[id] ?? 'SHOP EXPANSION';
}

// The Act 1 chain, in order. Used to keep the opening strictly linear.
export const OPENING_CHAIN = Object.freeze(['serving-counter', 'vanilla-machine', 'cone-dispenser']);

export function totalCatalogCost() {
  return CATALOG.reduce((sum, entry) => sum + entry.cost, 0);
}
