import assert from 'node:assert/strict';
import * as THREE from 'three';

const context = {
  beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
  fill() {}, stroke() {}, fillRect() {}, clearRect() {}, fillText() {},
};
globalThis.document = {
  createElement() {
    return { width: 0, height: 0, getContext: () => context };
  },
};

const { ShopProgressionSystem, STORY_STEPS } = await import('../src/progression-system.js');
const makeObject = () => new THREE.Group();
const furniture = new Map();
const iceCreamShop = {
  counterUnlocked: true,
  setCounterUnlocked(value) { this.counterUnlocked = value; },
  setUnlockedDiningTables(ids) { this.tables = [...ids]; },
  unlockCounter() { this.counterUnlocked = true; return [makeObject(), makeObject()]; },
  unlockDiningTable(id) { this.tables.push(id); return [makeObject()]; },
};
const managerPads = [
  { definition: { id: 'gym-manager', cost: 60 }, paid: 0, hired: false },
  { definition: { id: 'wc-manager', cost: 80 }, paid: 0, hired: false },
];
const hiringSystem = {
  pads: managerPads,
  workerCount: 0,
  workerSpeedLevel: 0,
  upgrades: { wcBoost: 0 },
  setHiringAvailable() {},
  getUpgradeCards() {
    return [
      { id: 'workers', cost: [30, 45][this.workerCount] ?? 0, maxed: this.workerCount >= 2 },
      { id: 'worker-speed', cost: [25, 40, 60, 85][this.workerSpeedLevel] ?? 0, maxed: this.workerSpeedLevel >= 4 },
      { id: 'wc-boost', cost: this.upgrades.wcBoost ? 0 : 60, maxed: Boolean(this.upgrades.wcBoost) },
    ];
  },
};
const production = {
  hiringSystem,
  cash: 500,
  servedCount: 0,
  totalCollectedCash: 0,
  supports: Array.from({ length: 4 }, () => ({ model: makeObject() })),
  unlockedFlavorIds: [],
  setSupportStationsVisible(value) { this.supportStationsVisible = value; },
  setUnlockedFlavors(ids) { this.unlockedFlavorIds = [...ids]; },
  unlockFlavor(id) { this.unlockedFlavorIds.push(id); return makeObject(); },
  spendCash(amount) { const spent = Math.min(amount, this.cash); this.cash -= spent; return spent; },
  setStatus(title, detail) { this.status = { title, detail }; },
};
const character = {
  unlockedDiningTableIds: [],
  setUnlockedDiningTables(ids) { this.unlockedDiningTableIds = [...ids]; },
  unlockDiningTable(id) { this.unlockedDiningTableIds.push(id); },
  setCustomerFlowEnabled(value) { this.customerFlowEnabled = value; },
  resolvePlayerCollisionOverlap() {},
  playPlayerAction() {},
};

const system = new ShopProgressionSystem(iceCreamShop, production, character);
assert.equal(system.activeStep.id, 'enter-shop');
assert.equal(STORY_STEPS.length, 15);
assert.equal(production.cash, 500);
assert.equal(iceCreamShop.counterUnlocked, false);
assert.deepEqual(production.unlockedFlavorIds, []);
assert.deepEqual(character.unlockedDiningTableIds, []);
assert.equal(character.customerFlowEnabled, false);

let elapsed = 0;
system.update(0.1, elapsed, new THREE.Vector3(-2.5, 0, 8.15));
assert.equal(system.activeStep.id, 'enter-shop');
elapsed += 0.1;
system.update(0.1, elapsed, new THREE.Vector3(-2.5, 0, 6.15));
assert.equal(system.activeStep.id, 'starter-counter');

while (!system.customersOpen) {
  const step = system.activeStep;
  assert.equal(step.type, 'purchase');
  for (let frame = 0; frame < 80 && system.activeStep === step; frame += 1) {
    elapsed += 0.1;
    system.update(0.1, elapsed, new THREE.Vector3(...step.position));
  }
}

assert.equal(production.cash, 50);
assert.equal(iceCreamShop.counterUnlocked, true);
assert.equal(production.supportStationsVisible, true);
assert.deepEqual(production.unlockedFlavorIds, ['vanilla', 'strawberry']);
assert.deepEqual(character.unlockedDiningTableIds, ['compact-table']);
assert.equal(character.customerFlowEnabled, true);
assert.equal(system.activeStep.id, 'first-sale');
assert.equal(system.blocksOrders, false);
assert.equal(system._activeStepProgress(), 0);
production.servedCount = 1;
assert.equal(system._activeStepProgress(), 1);
production.servedCount = 0;

production.cash = 10000;
while (!system.complete) {
  const step = system.activeStep;
  assert.equal(system.blocksOrders, false, 'open shop paused customer orders during progression');
  if (step.type === 'served') production.servedCount = step.target;
  if (step.type === 'collected') production.totalCollectedCash = step.target;
  if (step.type === 'manager') {
    const pad = managerPads.find(({ definition }) => definition.id === step.managerId);
    pad.paid = pad.definition.cost;
    pad.hired = true;
  }
  if (step.type === 'upgrade') {
    if (step.upgradeId === 'workers') hiringSystem.workerCount = step.target;
    if (step.upgradeId === 'worker-speed') hiringSystem.workerSpeedLevel = step.target;
    if (step.upgradeId === 'wc-boost') hiringSystem.upgrades.wcBoost = step.target;
  }
  if (step.type === 'purchase') {
    for (let frame = 0; frame < 80 && system.activeStep === step; frame += 1) {
      elapsed += 0.1;
      system.update(0.1, elapsed, new THREE.Vector3(...step.position));
    }
    continue;
  }
  elapsed += 0.1;
  system.update(0.1, elapsed, new THREE.Vector3());
}

assert.equal(system.progressPercent, 100);
assert.deepEqual(production.unlockedFlavorIds, ['vanilla', 'strawberry', 'chocolate', 'mint']);
assert.deepEqual(character.unlockedDiningTableIds, [
  'compact-table', 'dining-set-north', 'dining-set-center',
]);
assert.equal(hiringSystem.workerCount, 2);
assert.equal(hiringSystem.workerSpeedLevel, 0);
assert.equal(hiringSystem.upgrades.wcBoost, 1);
system.dispose();

console.log('progression runtime tests passed');
