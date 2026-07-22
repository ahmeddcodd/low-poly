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
const serviceBarrier = Object.freeze({
  minX: -0.6,
  maxX: 0.6,
  minZ: -4.72,
  maxZ: -3.9,
});
const routeWall = Object.freeze({
  minX: -0.25,
  maxX: 0.25,
  minZ: -20,
  maxZ: 20,
});
let routeBlocked = false;
let serviceBarrierEnabled = false;
const EXPECTED_WORKER_CLEARANCE = 0.26;
const pointInside = (collider, x, z, extraClearance) => (
  x >= collider.minX - extraClearance
  && x <= collider.maxX + extraClearance
  && z >= collider.minZ - extraClearance
  && z <= collider.maxZ + extraClearance
);
const isBlocked = (x, z, extraClearance = 0) => (
  pointInside(obstacle, x, z, extraClearance)
  || (serviceBarrierEnabled && pointInside(serviceBarrier, x, z, extraClearance))
  || (routeBlocked && pointInside(routeWall, x, z, extraClearance))
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

serviceBarrierEnabled = true;
worker.model.position.set(-2, 0, -4.3);
system._resetNavigation(worker);
const barrierTarget = [2, -4.3];
let barrierArrived = false;
let minimumBarrierZ = worker.model.position.z;
let maximumBarrierZ = worker.model.position.z;
for (let frame = 0; frame < 1200 && !barrierArrived; frame += 1) {
  barrierArrived = system._moveWorker(worker, barrierTarget, 1 / 60, true);
  minimumBarrierZ = Math.min(minimumBarrierZ, worker.model.position.z);
  maximumBarrierZ = Math.max(maximumBarrierZ, worker.model.position.z);
  assert.equal(
    isBlocked(worker.model.position.x, worker.model.position.z, EXPECTED_WORKER_CLEARANCE),
    false,
    'server entered the service barrier',
  );
}
assert.equal(barrierArrived, true, 'worker repeated the same blocked corner path');
assert.ok(minimumBarrierZ >= -4.78 - 1e-6, 'server routed behind the machine line');
assert.ok(
  maximumBarrierZ > serviceBarrier.maxZ + EXPECTED_WORKER_CLEARANCE,
  'server did not preserve a safe path around the furniture corner',
);
serviceBarrierEnabled = false;

assert.equal(system._isNavigationBlocked(3, -4.9, worker), true);
worker.model.position.set(3.6, 0, -4.35);
system._resetNavigation(worker);
const serviceTarget = [0.8, -4.42];
let serviceArrived = false;
let minimumServiceZ = worker.model.position.z;
for (let frame = 0; frame < 1200 && !serviceArrived; frame += 1) {
  serviceArrived = system._moveWorker(worker, serviceTarget, 1 / 60, true);
  minimumServiceZ = Math.min(minimumServiceZ, worker.model.position.z);
}
assert.equal(serviceArrived, true);
assert.ok(minimumServiceZ >= -4.78 - 1e-6, 'server routed behind the machine line');

worker.model.position.set(3, 0, -5.1);
system._resetNavigation(worker);
system._moveWorker(worker, [3, -4.4], 1 / 60, true);
assert.ok(
  worker.model.position.z >= -4.78 - 1e-6,
  'server was not recovered from behind the machine line',
);

const dirtyTable = {
  id: 'test-table',
  state: 'dirty',
  interactionPoint: [2, 0],
};
const secondDirtyTable = {
  id: 'second-test-table',
  state: 'dirty',
  interactionPoint: [2, 2],
};
const diningTables = [dirtyTable, secondDirtyTable];
const cleanupCalls = [];
characterSystem.diningTables = diningTables;
characterSystem.getDiningTable = (tableId) => (
  diningTables.find(({ id }) => id === tableId) ?? null
);
characterSystem.canCleanTable = (tableId) => (
  characterSystem.getDiningTable(tableId)?.state === 'dirty'
);
productionSystem.tableCleanup = {
  binInteractionPoint: [-2, 0],
  beginWorkerCleanup(model, tableId) {
    const table = characterSystem.getDiningTable(tableId);
    assert.equal(table?.state, 'dirty');
    table.state = 'garbage-carried';
    if (tableId === dirtyTable.id) routeBlocked = true;
    cleanupCalls.push('picked-up:' + tableId);
    return true;
  },
  startWorkerDisposal(model, tableId) {
    const table = characterSystem.getDiningTable(tableId);
    assert.equal(table?.state, 'garbage-carried');
    assert.ok(
      Math.hypot(model.position.x + 2, model.position.z) < 0.08,
      'cleaner disposed trash before reaching the bin',
    );
    assert.equal(routeBlocked, false);
    table.state = 'clean';
    cleanupCalls.push('disposed:' + tableId);
    return true;
  },
};

system.setWorkerCount(2);
const cleaner = system.workers[1];
let cleanerDetour = 0;
for (let frame = 0; frame < 2400 && !cleanupCalls.includes('picked-up:' + dirtyTable.id); frame += 1) {
  system.update(1 / 60, frame / 60);
  cleanerDetour = Math.max(cleanerDetour, Math.abs(cleaner.model.position.z));
  assert.equal(
    isBlocked(cleaner.model.position.x, cleaner.model.position.z, EXPECTED_WORKER_CLEARANCE),
    false,
    'cleaner entered the furniture collider',
  );
}

assert.deepEqual(cleanupCalls, ['picked-up:' + dirtyTable.id]);
assert.equal(cleaner.state, 'to-bin');
const pickupPosition = cleaner.model.position.clone();
assert.equal(system._isNavigationBlocked(3, -4.9, cleaner), false);
system.update(1 / 60, 40);
system.update(1 / 60, 40 + 1 / 60);
assert.deepEqual(cleanupCalls, ['picked-up:' + dirtyTable.id], 'cleaner treated a failed route as bin arrival');
assert.equal(cleaner.state, 'to-bin');
assert.ok(cleaner.model.position.distanceTo(pickupPosition) < 0.001);

routeBlocked = false;
system.update(1 / 60, 40 + 2 / 60);
cleanerDetour = Math.max(cleanerDetour, Math.abs(cleaner.model.position.z));
assert.equal(cleaner.state, 'to-bin');
assert.ok(cleaner.model.position.distanceTo(pickupPosition) > 0.001, 'cleaner did not resume walking');
assert.equal(cleaner.currentAnimation, 'Carry_Walk');

for (let frame = 0; frame < 2400 && !cleanupCalls.includes('disposed:' + dirtyTable.id); frame += 1) {
  system.update(1 / 60, 41 + frame / 60);
  cleanerDetour = Math.max(cleanerDetour, Math.abs(cleaner.model.position.z));
  assert.equal(
    isBlocked(cleaner.model.position.x, cleaner.model.position.z, EXPECTED_WORKER_CLEARANCE),
    false,
    'cleaner entered the furniture collider',
  );
}

assert.deepEqual(cleanupCalls, [
  'picked-up:' + dirtyTable.id,
  'disposed:' + dirtyTable.id,
]);
assert.equal(cleaner.role, 'cleaner');
assert.equal(cleaner.state, 'disposing');

system.update(1 / 60, 82);
assert.equal(cleaner.state, 'to-table');
assert.equal(cleaner.taskTableId, secondDirtyTable.id);

for (let frame = 0; frame < 2400 && !cleanupCalls.includes('disposed:' + secondDirtyTable.id); frame += 1) {
  system.update(1 / 60, 83 + frame / 60);
  assert.equal(
    isBlocked(cleaner.model.position.x, cleaner.model.position.z, EXPECTED_WORKER_CLEARANCE),
    false,
    'cleaner entered the furniture collider while processing the next table',
  );
}
assert.deepEqual(cleanupCalls, [
  'picked-up:' + dirtyTable.id,
  'disposed:' + dirtyTable.id,
  'picked-up:' + secondDirtyTable.id,
  'disposed:' + secondDirtyTable.id,
]);
assert.ok(diningTables.every(({ state }) => state === 'clean'));
system.update(1 / 60, 124);
assert.equal(cleaner.state, 'returning');
assert.equal(cleaner.taskTableId, null);
assert.ok(cleanerDetour > obstacle.maxZ + EXPECTED_WORKER_CLEARANCE, 'cleaner clearance was not preserved');
system.dispose();
console.log('worker navigation tests passed');
