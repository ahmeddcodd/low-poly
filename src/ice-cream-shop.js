import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_CONFIG } from './config.js';

const ASSET_URLS = Object.freeze({
  counterCorner: new URL('../ice_cream_shop_glb_exports/counter_corner.glb', import.meta.url).href,
  counterExtension: new URL('../ice_cream_shop_glb_exports/counter_extension.glb', import.meta.url).href,
  diningChairCoral: new URL('../ice_cream_shop_glb_exports/dining_chair_coral.glb', import.meta.url).href,
  diningChairMint: new URL('../ice_cream_shop_glb_exports/dining_chair_mint.glb', import.meta.url).href,
  diningSet: new URL('../ice_cream_shop_glb_exports/dining_set_two_person.glb', import.meta.url).href,
  diningTable: new URL('../ice_cream_shop_glb_exports/dining_table_compact.glb', import.meta.url).href,
  displayCounter: new URL('../ice_cream_shop_glb_exports/ice_cream_display_counter.glb', import.meta.url).href,
  servingCounter: new URL('../ice_cream_shop_glb_exports/main_serving_counter.glb', import.meta.url).href,
});

const FURNITURE_LAYOUT = Object.freeze([
  Object.freeze({ id: 'ice-cream-display', asset: 'displayCounter', position: [-2.47, 0.02, -0.82], rotation: 0 }),
  Object.freeze({ id: 'main-serving-counter', asset: 'servingCounter', position: [2, 0.02, -0.82], rotation: 0 }),
  Object.freeze({ id: 'counter-corner', asset: 'counterCorner', position: [4.72, 0.02, -0.82], rotation: 0 }),
  Object.freeze({ id: 'counter-return', asset: 'counterExtension', position: [4.72, 0.02, -2.55], rotation: Math.PI / 2 }),
  Object.freeze({ id: 'dining-set-north', asset: 'diningSet', position: [-6.5, 0.02, 2.45], rotation: 0 }),
  Object.freeze({ id: 'dining-set-center', asset: 'diningSet', position: [-6.5, 0.02, 5], rotation: 0 }),
  Object.freeze({ id: 'compact-table', asset: 'diningTable', position: [-4.3, 0.02, 3.6], rotation: 0 }),
  Object.freeze({ id: 'mint-chair', asset: 'diningChairMint', position: [-5.3, 0.02, 3.6], rotation: -Math.PI / 2 }),
  Object.freeze({ id: 'coral-chair', asset: 'diningChairCoral', position: [-3.3, 0.02, 3.6], rotation: Math.PI / 2 }),
]);

const DINING_FURNITURE_IDS = Object.freeze({
  'compact-table': Object.freeze(['compact-table', 'mint-chair', 'coral-chair']),
  'dining-set-north': Object.freeze(['dining-set-north']),
  'dining-set-center': Object.freeze(['dining-set-center']),
});

const COLLISION_PROXY_PATTERN = /^COL_/;
const COLLIDER_PADDING = WORLD_CONFIG.playerCollisionRadius;

function configureInstance(instance, definition, collisionMeshes) {
  instance.name = `Furniture_${definition.id}`;
  instance.position.set(...definition.position);
  instance.rotation.y = definition.rotation;
  instance.userData.furnitureId = definition.id;

  const configuredMaterials = new Set();
  instance.traverse((object) => {
    if (!object.isMesh) return;

    if (COLLISION_PROXY_PATTERN.test(object.name)) {
      collisionMeshes.push({ object, furnitureId: definition.id });
      object.castShadow = false;
      object.receiveShadow = false;
      return;
    }

    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      if (configuredMaterials.has(material)) return;
      material.roughness = Math.max(material.roughness ?? 0.7, 0.6);
      material.needsUpdate = true;
      configuredMaterials.add(material);
    });
  });
}

function createFurnitureColliders(group, collisionMeshes) {
  const bounds = new THREE.Box3();
  group.updateMatrixWorld(true);

  const colliders = collisionMeshes.map(({ object, furnitureId }) => {
    bounds.setFromObject(object);
    const collider = {
      name: object.name,
      furnitureId,
      minX: bounds.min.x - COLLIDER_PADDING,
      enabled: true,
      maxX: bounds.max.x + COLLIDER_PADDING,
      minZ: bounds.min.z - COLLIDER_PADDING,
      maxZ: bounds.max.z + COLLIDER_PADDING,
    };
    object.visible = false;
    return collider;
  });

  return colliders;
}

function disposeFurniture(group) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  group.traverse((object) => {
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

export async function createIceCreamShop(onProgress) {
  const loader = new GLTFLoader();
  const entries = Object.entries(ASSET_URLS);
  let completed = 0;

  const loadedEntries = await Promise.all(entries.map(async ([assetId, url]) => {
    const gltf = await loader.loadAsync(url);
    completed += 1;
    onProgress?.(completed / entries.length);
    return [assetId, gltf.scene];
  }));

  const assets = new Map(loadedEntries);
  const group = new THREE.Group();
  group.name = 'Ice_Cream_Shop_Furniture';
  const instances = [];
  const collisionMeshes = [];

  FURNITURE_LAYOUT.forEach((definition) => {
    const source = assets.get(definition.asset);
    if (!source) throw new Error(`Missing ice-cream furniture asset: ${definition.asset}`);

    const instance = source.clone(true);
    configureInstance(instance, definition, collisionMeshes);
    group.add(instance);
    instances.push(instance);
  });

  const colliders = createFurnitureColliders(group, collisionMeshes);

  const instancesById = new Map(instances.map((instance) => [instance.userData.furnitureId, instance]));
  const unlockedDiningTables = new Set();
  const setTableVisibility = (tableId, visible) => {
    const furnitureIds = DINING_FURNITURE_IDS[tableId] ?? [];
    furnitureIds.forEach((furnitureId) => {
      const instance = instancesById.get(furnitureId);
      if (instance) instance.visible = visible;
      colliders.filter((collider) => collider.furnitureId === furnitureId)
        .forEach((collider) => { collider.enabled = visible; });
    });
    if (visible) unlockedDiningTables.add(tableId);
    else unlockedDiningTables.delete(tableId);
    return furnitureIds.map((id) => instancesById.get(id)).filter(Boolean);
  };
  const setUnlockedDiningTables = (tableIds) => {
    const nextUnlocked = new Set(tableIds);
    Object.keys(DINING_FURNITURE_IDS).forEach((tableId) => {
      setTableVisibility(tableId, nextUnlocked.has(tableId));
    });
  };
  setUnlockedDiningTables(['compact-table']);

  return {
    group,
    instances: Object.freeze(instances),
    colliders,
    get unlockedDiningTableIds() {
      return [...unlockedDiningTables];
    },
    setUnlockedDiningTables,
    unlockDiningTable(tableId) {
      return setTableVisibility(tableId, true);
    },
    dispose() {
      disposeFurniture(group);
    },
  };
}
