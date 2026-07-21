import assert from 'node:assert/strict';
import { STARTING_CASH, STORY_STEPS } from '../src/progression-system.js';

const starterSteps = STORY_STEPS.slice(1, 5);
assert.deepEqual(
  starterSteps.map(({ id }) => id),
  ['starter-counter', 'vanilla-machine', 'strawberry-machine', 'starter-seating'],
);
assert.equal(starterSteps.reduce((total, step) => total + step.cost, 0), 450);
assert.ok(starterSteps.at(-1).opensCustomers);

const servedTargets = STORY_STEPS
  .filter(({ type }) => type === 'served')
  .map(({ target }) => target);
assert.ok(servedTargets.every((target, index) => index === 0 || target > servedTargets[index - 1]));
assert.equal(servedTargets.at(-1), 40);

assert.deepEqual(
  STORY_STEPS.filter(({ unlockType }) => unlockType === 'flavor').map(({ unlockId }) => unlockId),
  ['vanilla', 'strawberry', 'chocolate', 'mint'],
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

STORY_STEPS.forEach((step) => {
  if (step.type === 'served') {
    while (served < step.target) {
      cash += (served % 2 === 0 ? 15 : 20) * profitMultiplier;
      served += 1;
    }
  } else if (step.type === 'purchase') {
    cash -= step.cost;
  } else if (step.type === 'manager') {
    cash -= managerCosts[step.managerId];
  } else if (step.type === 'upgrade') {
    while (upgradeLevels[step.upgradeId] < step.target) {
      const level = upgradeLevels[step.upgradeId];
      cash -= upgradeCosts[step.upgradeId][level];
      upgradeLevels[step.upgradeId] += 1;
    }
    if (step.upgradeId === 'wc-boost') profitMultiplier = 2;
  }
  assert.ok(cash >= 0, 'Progression becomes unaffordable at ' + step.id + ' (cash ' + cash + ')');
});

console.log('progression economy tests passed with $' + cash + ' remaining');
