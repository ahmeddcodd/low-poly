import assert from 'node:assert/strict';
import {
  findNearestClearPoint,
  pointCollides,
} from '../src/collision-recovery.js';

const bounds = Object.freeze({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });

function recover(colliders, x = 0, z = 0) {
  const result = findNearestClearPoint(colliders, bounds, x, z);
  assert.ok(result, 'expected a safe recovery point');
  assert.equal(pointCollides(colliders, result.x, result.z), false);
  return result;
}

const table = { minX: -1.2, maxX: 1.2, minZ: -0.8, maxZ: 0.8, enabled: true };
const single = recover([table]);
assert.ok(Math.hypot(single.x, single.z) < 0.9, 'single collider should use its nearest edge');

const chair = { minX: 0.6, maxX: 1.8, minZ: -1.1, maxZ: 1.1, enabled: true };
const overlapping = recover([table, chair], 0.8, 0);
assert.equal(pointCollides([table, chair], overlapping.x, overlapping.z), false);

const wall = { minX: -1.5, maxX: -1.21, minZ: -2, maxZ: 2, enabled: true };
const nearWall = recover([table, wall], -0.8, 0);
assert.ok(nearWall.x > table.maxX || Math.abs(nearWall.z) > table.maxZ);

const disabledMachine = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, enabled: false };
assert.deepEqual(findNearestClearPoint([disabledMachine], bounds, 0, 0), { x: 0, z: 0 });

const boundaryCollider = { minX: -10, maxX: -9.2, minZ: -0.8, maxZ: 0.8, enabled: true };
const atWorldEdge = recover([boundaryCollider], -9.8, 0);
assert.ok(atWorldEdge.x > boundaryCollider.maxX || Math.abs(atWorldEdge.z) > boundaryCollider.maxZ);

console.log('collision recovery tests passed');
