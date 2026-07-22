import assert from 'node:assert/strict';
import * as THREE from 'three';

const context = {
  clearRect() {},
  fillRect() {},
  strokeRect() {},
  fillText() {},
};
globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext: () => context,
    };
  },
};

const { TableCleanupSystem } = await import('../src/table-cleanup-system.js');

const table = {
  id: 'test-table',
  state: 'dirty',
  garbageCount: 1,
  position: [0, 0, 0],
  interactionPoint: [0, 0],
};
const playerModel = new THREE.Group();
const characterSystem = {
  diningTables: [table],
  player: { model: playerModel },
  canCleanTable(tableId) {
    return tableId === table.id && table.state === 'dirty';
  },
  beginTableCleanup(tableId) {
    if (!this.canCleanTable(tableId)) return false;
    table.state = 'garbage-carried';
    return true;
  },
  getDiningTable(tableId) {
    return tableId === table.id ? table : null;
  },
  completeTableCleanup(tableId) {
    assert.equal(tableId, table.id);
    table.state = 'clean';
  },
  setPlayerCarrying() {},
  playPlayerAction() {},
};

const cleanup = new TableCleanupSystem(characterSystem);
const worker = new THREE.Group();
worker.name = 'Cleaner';
worker.position.set(7.2, 0, 5.05);
playerModel.add(worker);

assert.equal(cleanup.beginWorkerCleanup(worker, table.id), true);
const carryRig = cleanup.workerCarryRigs.get(worker);
playerModel.updateMatrixWorld(true);
carryRig.updateWorldMatrix(true, false);
const expectedStart = carryRig.getWorldPosition(new THREE.Vector3());
assert.equal(cleanup.startWorkerDisposal(worker, table.id, 0), true);
assert.ok(cleanup.dropRig.position.distanceTo(expectedStart) < 1e-9);
assert.equal(carryRig.visible, false);
assert.equal(cleanup.lidState, 'opening');

cleanup._updateDisposal(0.18);
assert.equal(cleanup.lidState, 'opening');
assert.ok(cleanup.dropRig.position.distanceTo(expectedStart) < 1e-9);

cleanup._updateDisposal(0.75);
assert.equal(cleanup.lidState, 'open');
assert.ok(cleanup.dropRig.position.distanceTo(expectedStart) > 0.1);
assert.ok(cleanup.dropRig.position.y > 0.78);
const deterministicRotation = cleanup.dropRig.rotation.toArray();
cleanup._updateDisposal(0.75);
assert.deepEqual(cleanup.dropRig.rotation.toArray(), deterministicRotation);

cleanup._updateDisposal(1.15);
assert.equal(cleanup.lidState, 'closing');
assert.equal(cleanup.dropRig.visible, false);

const completedEvent = cleanup._updateDisposal(1.5);
assert.equal(completedEvent, null);
assert.equal(table.state, 'clean');
assert.equal(cleanup.lidState, 'closed');
assert.equal(cleanup.dropRig.visible, false);
assert.equal(cleanup.dropRig.scale.x, 1);
assert.deepEqual(cleanup.dropRig.rotation.toArray(), [0, 0, 0, 'XYZ']);

cleanup.dispose();
console.log('trash disposal animation tests passed');
