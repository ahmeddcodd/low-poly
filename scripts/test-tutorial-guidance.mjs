import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CharacterSystem } from '../src/character-system.js';
import { IceCreamProductionSystem, PRODUCTION_STATION_IDS, VANILLA_MACHINE_IDS } from '../src/ice-cream-production.js';

assert.deepEqual(PRODUCTION_STATION_IDS, ['cone', 'cup']);
assert.deepEqual(VANILLA_MACHINE_IDS, ['vanilla-1', 'vanilla-2', 'vanilla-3']);

const characterSystem = new CharacterSystem();
assert.equal(characterSystem.playerMarker.visible, true);
characterSystem.setTutorialGuidanceVisible(false);
assert.equal(characterSystem.playerMarker.visible, false);

const targetMarker = new THREE.Group();
const otherMarker = new THREE.Group();
const cashMarker = new THREE.Group();
let characterVisibility = null;
let cleanupVisibility = null;
const production = Object.create(IceCreamProductionSystem.prototype);
production.tutorialGuidanceActive = true;
production.targetMarkerId = 'serve';
production.markers = new Map([['serve', targetMarker], ['machine-vanilla-1', otherMarker]]);
production.cashMarker = cashMarker;
production.pendingCash = 15;
production.unlockedMachines = new Set(['vanilla-1', 'vanilla-2']);
assert.equal(production.productionCapacity, 2);
assert.deepEqual(production.unlockedFlavorIds, ['vanilla']);
production.hiringSystem = { productionSpeedMultiplier: 1 };
const machine = {
  preview: { visible: false },
  actions: new Map(),
  dispensingUntil: 0,
};
assert.equal(production._triggerMachine(machine, 1), 2);
assert.equal(machine.preview.visible, true);
assert.ok(Math.abs(machine.dispensingUntil - 1.41) < 1e-9);
production.characterSystem = {
  setTutorialGuidanceVisible(value) { characterVisibility = value; },
};
production.tableCleanup = {
  setTutorialGuidanceVisible(value) { cleanupVisibility = value; },
};
production.status = Object.freeze({ title: '', detail: '' });
production.statusRevision = 0;

production.setTutorialGuidanceActive(true);
assert.equal(targetMarker.visible, true);
assert.equal(otherMarker.visible, false);
assert.equal(cashMarker.visible, true);
assert.equal(characterVisibility, true);
assert.equal(cleanupVisibility, true);

production.setTutorialGuidanceActive(false);
assert.equal(targetMarker.visible, false);
assert.equal(cashMarker.visible, false);
assert.equal(characterVisibility, false);
assert.equal(cleanupVisibility, false);

production._setTargetMarker('serve');
assert.equal(targetMarker.visible, false);
production._setStatus('Continue serving', 'Use the glowing dispenser');
assert.equal(production.status.detail, 'Use the dispenser');

const routedProduction = Object.create(IceCreamProductionSystem.prototype);
routedProduction.unlockedMachines = new Set(['vanilla-1', 'vanilla-2']);
routedProduction.machines = [
  { id: 'vanilla-1' },
  { id: 'vanilla-2' },
];
routedProduction.servedCount = 1;
routedProduction.tutorialGuidanceActive = false;
routedProduction.markers = new Map();
routedProduction.status = Object.freeze({ title: '', detail: '' });
routedProduction.statusRevision = 0;
routedProduction._showOrderBubble = () => {};
let routedOrder = null;
routedProduction.characterSystem = {
  assignFrontCustomerOrder(order) {
    routedOrder = order;
    return { definition: { id: 'test-customer' }, model: new THREE.Group() };
  },
};
assert.equal(routedProduction._startOrder(), true);
assert.deepEqual(routedOrder, { flavor: 'vanilla', container: 'cup', machineId: 'vanilla-2' });
console.log('tutorial guidance tests passed');
