import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorkerAutomationSystem } from '../src/worker-automation-system.js';

function makeSourceCharacter() {
  const animationNames = ['Idle', 'Walk_Player', 'Carry_Idle', 'Carry_Walk', 'Pickup', 'Serve'];
  return {
    model: new THREE.Group(),
    animations: animationNames.map((name) => new THREE.AnimationClip(name, 0.5, [])),
  };
}

const obstacle = Object.freeze({
  minX: -0.7,
  maxX: 0.7,
  minZ: -1,
  maxZ: 1,
});
const EXPECTED_WORKER_CLEARANCE = 0.26;
const isBlocked = (x, z, extraClearance = 0) => (
  x >= obstacle.minX - extraClearance
  && x <= obstacle.maxX + extraClearance
  && z >= obstacle.minZ - extraClearance
  && z <= obstacle.maxZ + extraClearance
);
const characterSystem = {
  isNavigationBlocked: isBlocked,
  findNearestNavigationPoint(x, z, extraClearance = 0) {
    return isBlocked(x, z, extraClearance) ? null : { x, z };
  },
};
const productionSystem = {
  activeOrder: null,
  stage: 'waiting',
  servedCount: 0,
  stationPoints: new Map(),
  machines: [],
  tableCleanup: null,
};
const system = new WorkerAutomationSystem(
  makeSourceCharacter(),
  characterSystem,
  productionSystem,
);
system.setWorkerCount(1);

const worker = system.workers[0];
worker.model.position.set(-2, 0, 0);
const target = [2, 0];
let arrived = false;
let greatestDetour = 0;

for (let frame = 0; frame < 1200 && !arrived; frame += 1) {
  arrived = system._moveWorker(worker, target, 1 / 60, false);
  greatestDetour = Math.max(greatestDetour, Math.abs(worker.model.position.z));
  assert.equal(
    isBlocked(worker.model.position.x, worker.model.position.z, EXPECTED_WORKER_CLEARANCE),
    false,
    'worker entered the furniture collider',
  );
}

assert.equal(arrived, true);
assert.ok(greatestDetour > obstacle.maxZ + EXPECTED_WORKER_CLEARANCE, 'worker clearance was not preserved');
assert.ok(Math.hypot(worker.model.position.x - target[0], worker.model.position.z - target[1]) < 0.03);

const dirtyTable = {
  id: 'test-table',
  state: 'dirty',
  interactionPoint: [2, 0],
};
const cleanupCalls = [];
characterSystem.diningTables = [dirtyTable];
characterSystem.getDiningTable = (tableId) => (
  tableId === dirtyTable.id ? dirtyTable : null
);
characterSystem.canCleanTable = (tableId) => (
  tableId === dirtyTable.id && dirtyTable.state === 'dirty'
);
productionSystem.tableCleanup = {
  binInteractionPoint: [-2, 0],
  beginWorkerCleanup(model, tableId) {
    assert.equal(tableId, dirtyTable.id);
    dirtyTable.state = 'garbage-carried';
    cleanupCalls.push('picked-up');
    return true;
  },
  startWorkerDisposal(model, tableId) {
    assert.equal(tableId, dirtyTable.id);
    dirtyTable.state = 'clean';
    cleanupCalls.push('disposed');
    return true;
  },
};

system.setWorkerCount(2);
const cleaner = system.workers[1];
let cleanerDetour = 0;
for (let frame = 0; frame < 2400 && !cleanupCalls.includes('disposed'); frame += 1) {
  system.update(1 / 60, frame / 60);
  cleanerDetour = Math.max(cleanerDetour, Math.abs(cleaner.model.position.z));
  assert.equal(
    isBlocked(cleaner.model.position.x, cleaner.model.position.z, EXPECTED_WORKER_CLEARANCE),
    false,
    'cleaner entered the furniture collider',
  );
}

assert.deepEqual(cleanupCalls, ['picked-up', 'disposed']);
assert.equal(cleaner.role, 'cleaner');
assert.equal(cleaner.state, 'disposing');
assert.ok(cleanerDetour > obstacle.maxZ + EXPECTED_WORKER_CLEARANCE, 'cleaner clearance was not preserved');
system.dispose();
console.log('worker navigation tests passed');
