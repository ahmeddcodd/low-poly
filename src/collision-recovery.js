const DEFAULT_EPSILON = 0.035;
const FALLBACK_ANGLE_COUNT = 32;
const FALLBACK_RADIUS_STEP = 0.18;
const FALLBACK_MAX_RADIUS = 4.5;

function clampToBounds(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isEnabled(collider) {
  return collider?.enabled !== false;
}

export function pointInsideCollider(x, z, collider) {
  return isEnabled(collider)
    && x >= collider.minX
    && x <= collider.maxX
    && z >= collider.minZ
    && z <= collider.maxZ;
}

export function pointCollides(colliders, x, z) {
  return colliders.some((collider) => pointInsideCollider(x, z, collider));
}

function uniqueCoordinates(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toFixed(6);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nearestCandidate(colliders, originX, originZ, candidatesX, candidatesZ) {
  let best = null;
  let bestDistanceSquared = Infinity;

  candidatesX.forEach((x) => {
    candidatesZ.forEach((z) => {
      if (pointCollides(colliders, x, z)) return;
      const offsetX = x - originX;
      const offsetZ = z - originZ;
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared >= bestDistanceSquared) return;
      bestDistanceSquared = distanceSquared;
      best = { x, z };
    });
  });

  return best;
}

export function findNearestClearPoint(
  colliders,
  bounds,
  originX,
  originZ,
  epsilon = DEFAULT_EPSILON,
) {
  if (!pointCollides(colliders, originX, originZ)) {
    return { x: originX, z: originZ };
  }

  const overlapping = colliders.filter((collider) => (
    pointInsideCollider(originX, originZ, collider)
  ));
  const candidateX = [originX];
  const candidateZ = [originZ];

  overlapping.forEach((collider) => {
    candidateX.push(
      clampToBounds(collider.minX - epsilon, bounds.minX, bounds.maxX),
      clampToBounds(collider.maxX + epsilon, bounds.minX, bounds.maxX),
    );
    candidateZ.push(
      clampToBounds(collider.minZ - epsilon, bounds.minZ, bounds.maxZ),
      clampToBounds(collider.maxZ + epsilon, bounds.minZ, bounds.maxZ),
    );
  });

  const boundaryCandidate = nearestCandidate(
    colliders,
    originX,
    originZ,
    uniqueCoordinates(candidateX),
    uniqueCoordinates(candidateZ),
  );
  if (boundaryCandidate) return boundaryCandidate;

  for (let radius = FALLBACK_RADIUS_STEP; radius <= FALLBACK_MAX_RADIUS; radius += FALLBACK_RADIUS_STEP) {
    const ringX = [];
    const ringZ = [];
    for (let index = 0; index < FALLBACK_ANGLE_COUNT; index += 1) {
      const angle = index / FALLBACK_ANGLE_COUNT * Math.PI * 2;
      ringX.push(clampToBounds(originX + Math.cos(angle) * radius, bounds.minX, bounds.maxX));
      ringZ.push(clampToBounds(originZ + Math.sin(angle) * radius, bounds.minZ, bounds.maxZ));
    }
    const ringCandidate = nearestCandidate(
      colliders,
      originX,
      originZ,
      uniqueCoordinates(ringX),
      uniqueCoordinates(ringZ),
    );
    if (ringCandidate) return ringCandidate;
  }

  return null;
}
