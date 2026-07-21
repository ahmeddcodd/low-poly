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

function makeProductionSystem(order, stage = 'need-container') {
  const calls = [];
  return {
    activeOrder: order,
    stage,
    servedCount: 0,
    stationPoints: new Map([
      ['cone', new THREE.Vector3(3.6, 0, -3.1)],
      ['cup', new THREE.Vector3(3.6, 0, -4.35)],
      ['serve', new THREE.Vector3(1.55, 0, -2.12)],
    ]),
    machines: [
      { flavor: 'vanilla', standPoint: new THREE.Vector3(-6.4, 0, -3.8) },
      { flavor: 'strawberry', standPoint: new THREE.Vector3(-4, 0, -3.8) },
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
      if (this.stage === 'need-container') this.stage = 'need-machine';
      else if (this.stage === 'need-machine') this.stage = 'dispensing';
      else if (this.stage === 'need-serve') this.stage = 'serving';
      return true;
    },
  };
}

const strawberryCup = Object.freeze({ flavor: 'strawberry', container: 'cup' });
const production = makeProductionSystem(strawberryCup);
const system = new WorkerAutomationSystem(makeSourceCharacter(), {}, production);
system.setWorkerCount(99);
assert.equal(system.workerCount, 2);
assert.deepEqual(system.workers.map(({ role }) => role), ['server', 'cleaner']);
system.setWorkerCount(0);
system.update(0.016, 0.1);
assert.equal(system.assignedOrder, strawberryCup);
assert.equal(system.assignedServerIndex, null);
system.setWorkerCount(1);
const cashier = system.workers[0];
const cupPoint = production.stationPoints.get('cup');
const counterStart = cashier.model.position.clone();
const startDistance = counterStart.distanceTo(cupPoint);

system.update(0.25, 0.5);
assert.equal(system.assignedServerIndex, 0);
assert.equal(production.stage, 'need-container');
assert.equal(cashier.currentAnimation, 'Walk_Player');
assert.ok(cashier.model.position.distanceTo(cupPoint) < startDistance);
assert.notDeepEqual(cashier.model.position.toArray(), counterStart.toArray());

system.setWorkerCount(2);
assert.equal(system.workerCount, 2);
assert.equal(system.workers[1].role, 'cleaner');
assert.equal(system.workers[1].model.visible, true);
assert.equal(system.assignedServerIndex, 0, 'hiring the cleaner interrupted the server');
assert.equal(system.assignedOrder, strawberryCup, 'the server lost its active order');

cashier.model.position.copy(cupPoint);
system.update(0.016, 1);

assert.equal(system.orderAutomationActive, true);
assert.equal(system.counterWorkerActive, true);
assert.equal(system.assignedServerIndex, 0);
assert.equal(production.stage, 'need-machine');

cashier.model.position.copy(production.machines.find(({ flavor }) => flavor === 'strawberry').standPoint);
system.update(0.016, 2);
assert.equal(production.stage, 'dispensing');

production.stage = 'need-serve';

cashier.model.position.copy(production.stationPoints.get('serve'));
system.update(0.016, 4);
assert.equal(production.stage, 'serving');
assert.equal(cashier.state, 'serving-customer');
assert.equal(cashier.currentAnimation, 'Serve');
assert.equal(cashier.tray.group.visible, true);
assert.equal(cashier.tray.cup.visible, true);
assert.equal(cashier.tray.cone.visible, false);
assert.equal(cashier.tray.scoopMaterial.color.getHex(), 0xff7690);

system._setServiceTray(cashier, { flavor: 'vanilla', container: 'cone' }, true);
assert.equal(cashier.tray.cone.visible, true);
assert.equal(cashier.tray.cup.visible, false);
assert.equal(cashier.tray.cone.rotation.x, Math.PI);
assert.ok(cashier.tray.cone.position.y < cashier.tray.scoop.position.y);
assert.equal(cashier.tray.scoopMaterial.color.getHex(), 0xffe7a0);

assert.deepEqual(production.calls.map(({ stage }) => stage), [
  'need-container',
  'need-machine',
  'need-serve',
]);
assert.ok(production.calls.every(({ index, role, flavor, container }) => (
  index === 0 && role === 'server' && flavor === 'strawberry' && container === 'cup'
)));

system.dispose();
console.log('worker automation tests passed');
