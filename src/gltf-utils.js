// Shared GLB helpers. These were private to ice-cream-production.js; the build system
// needs the same ones to instance ghosts and purchase pads out of the already-loaded
// trays_support_all.glb, so they live here rather than being duplicated.

import * as THREE from 'three';
import { WORLD_CONFIG } from './config.js';

export function configureMaterial(material) {
  material.roughness = Math.max(material.roughness ?? 0.72, 0.62);
  material.needsUpdate = true;
}

/**
 * Prepare a cloned GLB subtree: hide collision proxies, enable shadows, and normalise
 * materials. Pass `collisionRecords` to harvest COL_* meshes for collider building.
 */
export function configureObject(root, collisionRecords = null, colliderOwner = null) {
  const configuredMaterials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;

    const isCollisionProxy = object.name.startsWith('COL_') || object.userData?.is_collider;
    if (isCollisionProxy) {
      if (collisionRecords && colliderOwner?.collider) {
        collisionRecords.push({ object, ownerId: colliderOwner.id });
      }
      object.visible = false;
      object.castShadow = false;
      object.receiveShadow = false;
      return;
    }

    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      if (configuredMaterials.has(material)) return;
      configureMaterial(material);
      configuredMaterials.add(material);
    });
  });
}

/**
 * Anchors must be found by `anchor_role`, never by node name — Product_Sundae_Deluxe's
 * anchors are named `Sundae__CarryPoint`, not `Product_Sundae_Deluxe__CarryPoint`, so
 * any name-prefix scheme silently misses them.
 */
export function findAnchor(root, role) {
  let anchor = null;
  root.traverse((object) => {
    if (!anchor && object.userData?.anchor_role === role) anchor = object;
  });
  return anchor;
}

/**
 * Clone a named node out of a loaded GLB scene and reset it to the origin. Source nodes
 * sit at Blender catalog coordinates, so the transform reset is required, not cosmetic.
 * Throws on a missing name — callers that can't guarantee the node exists should check first.
 */
export function cloneAsset(sourceScene, name) {
  const source = sourceScene.getObjectByName(name);
  if (!source) throw new Error(`Missing ice-cream asset node: ${name}`);
  const clone = source.clone(true);
  clone.position.set(0, 0, 0);
  clone.quaternion.identity();
  clone.scale.setScalar(1);
  return clone;
}

export function hasAsset(sourceScene, name) {
  return Boolean(sourceScene?.getObjectByName(name));
}

/**
 * Build padded AABB colliders from harvested COL_* meshes.
 *
 * Colliders are mutable objects with an `enabled` flag (collision-recovery.js treats
 * `enabled !== false` as solid), which is what lets the shop start empty: everything is
 * still built and measured at boot, then hidden and disabled until bought. Only the
 * containing array is frozen, never the entries.
 */
export function createColliders(group, records, ownerKey = 'ownerId') {
  const padding = WORLD_CONFIG.playerCollisionRadius;
  const bounds = new THREE.Box3();
  group.updateMatrixWorld(true);

  return records.map(({ object, ownerId }) => {
    bounds.setFromObject(object);
    return {
      name: object.name,
      [ownerKey]: ownerId,
      enabled: true,
      minX: bounds.min.x - padding,
      maxX: bounds.max.x + padding,
      minZ: bounds.min.z - padding,
      maxZ: bounds.max.z + padding,
    };
  });
}

export function disposeObjectResources(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });

  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
