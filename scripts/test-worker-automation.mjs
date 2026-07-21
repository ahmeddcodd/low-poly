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

function makeProductionSystem(order, stage = 'need-serve') {
  const calls = [];
  return {
    activeOrder: order,
    stage,
    servedCount: 0,
    stationPoints: new Map([
      ['cone', new THREE.Vector3(3.6, 0, -3.1)],
      ['cup', new THREE.Vector3(3.6, 0, -4.35)],
      ['topping', new THREE.Vector3(-7.78, 0, -0.7)],
      ['spoon', new THREE.Vector3(3.6, 0, -5.6)],
      ['serve', new THREE.Vector3(1.55, 0, -2.12)],
    ]),
    machines: [
      { flavor: 'vanilla', standPoint: new THREE.Vector3(-6.4, 0, -3.8) },
      { flavor: 'strawberry', standPoint: new THREE.Vector3(-4, 0, -3.8) },
    ],
    tableCleanup: null,
    calls,
    performWorkerStage(worker) {
      calls.push({ index: worker.index, role: worker.role, flavor: this.activeOrder.flavor, container: this.activeOrder.container });
      if (this.stage === 'need-serve') this.stage = 'serving';
      return true;
    },
  };
}

const strawberryCup = Object.freeze({ flavor: 'strawberry', container: 'cup' });
const production = makeProductionSystem(strawberryCup);
const characterSystem = {
  player: { model: new THREE.Group() },
  playerCarrying: true,
};
const system = new WorkerAutomationSystem(makeSourceCharacter(), characterSystem, production);
system.setWorkerCount(1);
system.update(0.016, 1);
assert.equal(production.calls.length, 0);
assert.equal(system.workers[0].state, 'waiting-for-order');

characterSystem.player.model.position.copy(production.stationPoints.get('serve'));
system.update(0.016, 1.1);

const cashier = system.workers[0];
assert.equal(system.counterWorkerActive, true);
assert.deepEqual(production.calls, [
  { index: 0, role: 'cashier', flavor: 'strawberry', container: 'cup' },
]);
assert.equal(production.stage, 'serving');
assert.equal(cashier.state, 'serving-customer');
assert.equal(cashier.currentAnimation, 'Serve');
assert.equal(cashier.tray.group.visible, true);
assert.equal(cashier.tray.cup.visible, true);
assert.equal(cashier.tray.cone.visible, false);
assert.equal(cashier.tray.scoopMaterial.color.getHex(), 0xff7690);

production.activeOrder = Object.freeze({ flavor: 'vanilla', container: 'cone' });
production.stage = 'need-machine';
system.setWorkerCount(2);
system.update(0.016, 2);
assert.equal(system.assignedServerIndex, 1);
assert.deepEqual(system._serverTarget(), [-6.4, -3.8]);

production.activeOrder = Object.freeze({ flavor: 'strawberry', container: 'cup' });
production.stage = 'need-serve';
const server = system.workers[1];
server.model.position.copy(production.stationPoints.get('serve'));
system.update(0.016, 3);
assert.equal(server.state, 'handoff-ready');
assert.equal(production.calls.at(-1).index, 0);
assert.equal(production.calls.at(-1).flavor, 'strawberry');
assert.equal(production.calls.at(-1).container, 'cup');

system.dispose();
console.log('worker automation tests passed');
