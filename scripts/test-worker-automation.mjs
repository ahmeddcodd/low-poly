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

function makeProductionSystem(order, stage = 'need-machine') {
  const calls = [];
  return {
    activeOrder: order,
    stage,
    servedCount: 0,
    stationPoints: new Map([
      ['machine-output', new THREE.Vector3(1.92, 0, -4.45)],
      ['serve', new THREE.Vector3(1.55, 0, -2.12)],
    ]),
    machines: [
      { id: 'vanilla-1', flavor: 'vanilla', standPoint: new THREE.Vector3(0.8, 0, -4.42) },
      { id: 'vanilla-2', flavor: 'vanilla', standPoint: new THREE.Vector3(-1.6, 0, -4.42) },
    ],
    tableCleanup: null,
    calls,
    performWorkerStage(worker) {
      calls.push({
        stage: this.stage,
        index: worker.index,
        role: worker.role,
        flavor: this.activeOrder.flavor,
        container: this.activeOrder.container,
      });
      if (this.stage === 'need-machine') this.stage = 'dispensing';
      else if (this.stage === 'need-pickup') this.stage = 'need-serve';
      else if (this.stage === 'need-serve') this.stage = 'serving';
      return true;
    },
  };
}

const vanillaCup = Object.freeze({ flavor: 'vanilla', container: 'cup', amount: 3, machineId: 'vanilla-2' });
const production = makeProductionSystem(vanillaCup);
const system = new WorkerAutomationSystem(makeSourceCharacter(), {}, production);
system.setWorkerCount(99);
assert.equal(system.workerCount, 2);
assert.deepEqual(system.workers.map(({ role }) => role), ['server', 'cleaner']);
system.setWorkerCount(0);
system.update(0.016, 0.1);
assert.equal(system.assignedOrder, vanillaCup);
assert.equal(system.assignedServerIndex, null);
system.setWorkerCount(1);
const cashier = system.workers[0];
const vanillaMachine = production.machines.find(({ id }) => id === 'vanilla-2');
const counterStart = cashier.model.position.clone();
const startDistance = counterStart.distanceTo(vanillaMachine.standPoint);

system.update(0.25, 0.5);
assert.equal(system.assignedServerIndex, 0);
assert.equal(production.stage, 'need-machine');
assert.equal(cashier.currentAnimation, 'Carry_Walk');
assert.ok(cashier.model.position.distanceTo(vanillaMachine.standPoint) < startDistance);
assert.notDeepEqual(cashier.model.position.toArray(), counterStart.toArray());
assert.equal(cashier.tray.group.visible, true);
assert.equal(cashier.tray.cups.filter(({ visible }) => visible).length, 0);
assert.equal(cashier.tray.scoops.filter(({ visible }) => visible).length, 0);

system.setWorkerCount(2);
assert.equal(system.workerCount, 2);
assert.equal(system.workers[1].role, 'cleaner');
assert.equal(system.workers[1].model.visible, true);
assert.equal(system.assignedServerIndex, 0, 'hiring the cleaner interrupted the server');
assert.equal(system.assignedOrder, vanillaCup, 'the server lost its active order');

cashier.model.position.copy(vanillaMachine.standPoint);
system.update(0.016, 1);
assert.equal(production.stage, 'dispensing');
assert.equal(cashier.currentAnimation, 'Pickup');
assert.equal(cashier.tray.cups.filter(({ visible }) => visible).length, 0);

production.stage = 'need-pickup';
const outputPoint = production.stationPoints.get('machine-output');
const outputStartDistance = cashier.model.position.distanceTo(outputPoint);
system.update(0.25, 2);
assert.equal(production.stage, 'need-pickup');
assert.equal(cashier.currentAnimation, 'Carry_Walk');
assert.ok(cashier.model.position.distanceTo(outputPoint) < outputStartDistance);
assert.equal(cashier.tray.group.visible, true);
assert.equal(cashier.tray.cups.filter(({ visible }) => visible).length, 0);
assert.equal(cashier.tray.scoops.filter(({ visible }) => visible).length, 0);

cashier.model.position.copy(outputPoint);
system.update(0.016, 3);
assert.equal(production.stage, 'need-serve');
assert.equal(cashier.state, 'collecting-stack');
assert.equal(cashier.currentAnimation, 'Pickup');

system.update(0.016, 3.1);
assert.equal(production.stage, 'need-serve');
assert.equal(cashier.tray.cup.visible, true);
assert.equal(cashier.tray.cone.visible, false);
assert.equal(cashier.tray.cups.filter(({ visible }) => visible).length, 3);
assert.equal(cashier.tray.cones.filter(({ visible }) => visible).length, 0);
assert.equal(cashier.tray.scoop.visible, true);
assert.equal(cashier.tray.scoops.filter(({ visible }) => visible).length, 3);
assert.equal(cashier.tray.scoopMaterial.color.getHex(), 0xffe7a0);

cashier.model.position.copy(production.stationPoints.get('serve'));
system.update(0.016, 4);
assert.equal(production.stage, 'serving');
assert.equal(cashier.state, 'serving-customer');
assert.equal(cashier.currentAnimation, 'Serve');
assert.equal(cashier.tray.group.visible, true);
assert.equal(cashier.tray.cup.visible, true);
assert.equal(cashier.tray.cone.visible, false);
assert.equal(cashier.tray.scoop.visible, true);
assert.equal(cashier.tray.scoops.filter(({ visible }) => visible).length, 3);

assert.deepEqual(production.calls.map(({ stage }) => stage), [
  'need-machine',
  'need-pickup',
  'need-serve',
]);
assert.ok(production.calls.every(({ index, role, flavor, container }) => (
  index === 0 && role === 'server' && flavor === 'vanilla' && container === 'cup'
)));

system.dispose();
console.log('worker automation tests passed');
