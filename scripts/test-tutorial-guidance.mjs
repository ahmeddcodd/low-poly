import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CharacterSystem } from '../src/character-system.js';
import { IceCreamProductionSystem } from '../src/ice-cream-production.js';

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
production.markers = new Map([['serve', targetMarker], ['machine-vanilla', otherMarker]]);
production.cashMarker = cashMarker;
production.pendingCash = 15;
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
console.log('tutorial guidance tests passed');
