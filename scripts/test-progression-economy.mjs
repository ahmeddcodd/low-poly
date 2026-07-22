import assert from 'node:assert/strict';
import { STARTING_CASH, STORY_SERVICE_GOAL, STORY_STEPS, TUTORIAL_COLLECTION_TARGET } from '../src/progression-system.js';

const starterSteps = STORY_STEPS.slice(1, 4);
assert.deepEqual(
  starterSteps.map(({ id }) => id),
  ['starter-counter', 'first-vanilla-machine', 'starter-seating'],
);
assert.equal(starterSteps.reduce((total, step) => total + step.cost, 0), 350);
assert.ok(starterSteps.at(-1).opensCustomers);
assert.match(starterSteps[0].detail, /cone and cup machines/);

const servedTargets = STORY_STEPS
  .filter(({ type }) => type === 'served')
  .map(({ target }) => target);
assert.deepEqual(servedTargets, [1, STORY_SERVICE_GOAL]);
assert.equal(STORY_SERVICE_GOAL, 30);
assert.equal(STORY_STEPS.length, 15);
const tutorialCollectionStep = STORY_STEPS.find(({ id }) => id === 'first-collection');
assert.equal(tutorialCollectionStep.target, TUTORIAL_COLLECTION_TARGET);
assert.equal(TUTORIAL_COLLECTION_TARGET, 15);

const machineUnlocks = STORY_STEPS
  .filter(({ unlockType }) => unlockType === 'machine')
  .flatMap(({ unlockId, unlockIds }) => unlockIds || [unlockId]);
assert.deepEqual(
  machineUnlocks,
  ['vanilla-1', 'vanilla-2', 'vanilla-3'],
);
assert.equal(STORY_STEPS.some(({ unlockType }) => unlockType === 'flavor'), false);
assert.deepEqual(
  STORY_STEPS
    .filter(({ unlockType }) => unlockType === 'machine')
    .map(({ position }) => position),
  [[0.8, 0.04, -3.45], [-1.6, 0.04, -3.45], [-4, 0.04, -3.45]],
);
assert.deepEqual(
  STORY_STEPS.filter(({ type }) => type === 'manager').map(({ managerId }) => managerId),
  ['gym-manager', 'wc-manager'],
);
assert.equal(
  STORY_STEPS.some(({ upgradeId }) => upgradeId === 'worker-speed'),
  false,
);

const managerCosts = { 'gym-manager': 60, 'wc-manager': 80 };
const upgradeCosts = {
  workers: [30, 45],
  'worker-speed': [25, 40, 60, 85],
  'wc-boost': [60],
};
const upgradeLevels = { workers: 0, 'worker-speed': 0, 'wc-boost': 0 };
let cash = STARTING_CASH;
let served = 0;
let profitMultiplier = 1;
let shopOpen = false;

function earnSale() {
  cash += (served % 2 === 0 ? 15 : 20) * profitMultiplier;
  served += 1;
}

function ensureCash(cost) {
  while (cash < cost) {
    assert.equal(shopOpen, true, 'setup must be affordable before customers arrive');
    earnSale();
  }
}

STORY_STEPS.forEach((step) => {
  if (step.type === 'served') {
    while (served < step.target) {
      earnSale();
    }
  } else if (step.type === 'purchase') {
    ensureCash(step.cost);
    cash -= step.cost;
    if (step.opensCustomers) shopOpen = true;
  } else if (step.type === 'manager') {
    const cost = managerCosts[step.managerId];
    ensureCash(cost);
    cash -= cost;
  } else if (step.type === 'upgrade') {
    while (upgradeLevels[step.upgradeId] < step.target) {
      const level = upgradeLevels[step.upgradeId];
      const cost = upgradeCosts[step.upgradeId][level];
      ensureCash(cost);
      cash -= cost;
      upgradeLevels[step.upgradeId] += 1;
    }
    if (step.upgradeId === 'wc-boost') profitMultiplier = 2;
  }
  assert.ok(cash >= 0, 'Progression becomes unaffordable at ' + step.id + ' (cash ' + cash + ')');
});

console.log('progression economy tests passed with $' + cash + ' remaining');
