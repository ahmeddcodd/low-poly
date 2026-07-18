import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLACEMENT_ZONES, WORLD_CONFIG } from './config.js';
import { PlacementZones } from './placement-zones.js';
import { createCharacterSystem } from './character-system.js';
import { createIceCreamShop } from './ice-cream-shop.js';
import { ShopProgressionSystem } from './progression-system.js';
import { createIceCreamProduction } from './ice-cream-production.js';

const MODEL_URL = new URL('../Untitled.glb', import.meta.url).href;
const WALL_COLLIDER_PATTERN = /^Wall_.+_Solid_\d+$/;

function configureMaterial(material) {
  material.roughness = Math.max(material.roughness ?? 0.7, 0.58);

  if (material.name === 'MAT_Entrance_Glass') {
    material.transparent = true;
    material.opacity = 0.44;
    material.depthWrite = false;
  }

  material.needsUpdate = true;
}

function configureModel(root) {
  const configuredMaterials = new Set();

  root.traverse((object) => {
    if (WORLD_CONFIG.cutawayPrefixes.some((prefix) => object.name.startsWith(prefix))) {
      object.visible = false;
    }

    if (!object.isMesh) return;

    const isGround = /Floor|Platform|Exterior/.test(object.name);
    object.castShadow = !isGround;
    object.receiveShadow = true;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!configuredMaterials.has(material)) {
        configureMaterial(material);
        configuredMaterials.add(material);
      }
    });
  });
}

function createWallColliders(root) {
  const colliders = [];
  const bounds = new THREE.Box3();
  const padding = WORLD_CONFIG.playerCollisionRadius;
  root.updateMatrixWorld(true);

  root.traverse((object) => {
    if (!object.isMesh || !WALL_COLLIDER_PATTERN.test(object.name)) return;

    bounds.setFromObject(object);
    const width = bounds.max.x - bounds.min.x;
    const depth = bounds.max.z - bounds.min.z;
    const runsAlongZ = depth > width;
    const padX = runsAlongZ ? padding : 0.04;
    const padZ = runsAlongZ ? 0.04 : padding;

    colliders.push(Object.freeze({
      name: object.name,
      minX: bounds.min.x - padX,
      maxX: bounds.max.x + padX,
      minZ: bounds.min.z - padZ,
      maxZ: bounds.max.z + padZ,
    }));
  });

  return Object.freeze(colliders);
}

function startEntranceAnimation(root, animations) {
  const clip = animations.find((animation) => animation.name === 'Entrance_Open');
  if (!clip) return null;

  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset().play();
  return mixer;
}

function applyLocalDebugStart(characterSystem) {
  if (location.hostname !== '127.0.0.1') return;
  const start = new URLSearchParams(location.search).get('start');
  const positions = {
    gym: [13.05, -3],
    wc: [13.05, 3],
    north: [-6.5, 2.45],
    chocolate: [-1.6, -4.72],
    center: [-6.5, 5],
    mint: [0.8, -4.72],
    trash: [7.2, 5.05],
  };
  const position = positions[start];
  if (!position || !characterSystem.player) return;
  characterSystem.player.model.position.x = position[0];
  characterSystem.player.model.position.z = position[1];
  characterSystem.playerMarker.position.set(position[0], 0.055, position[1]);
}

export async function createRestaurantScene(scene, onProgress) {
  const loader = new GLTFLoader();
  const world = new THREE.Group();
  world.name = 'Restaurant_World';
  scene.add(world);

  let buildingProgress = 0;
  let furnitureProgress = 0;
  let productionProgress = 0;
  let characterProgress = 0;
  let reportedProgress = 0;
  const reportProgress = () => {
    const combined = buildingProgress * 0.08 + furnitureProgress * 0.12
      + productionProgress * 0.28 + characterProgress * 0.52;
    reportedProgress = Math.max(reportedProgress, combined);
    onProgress?.(Math.min(reportedProgress, 0.98));
  };

  const [gltf, iceCreamShop, iceCreamProduction, characterSystem] = await Promise.all([
    loader.loadAsync(MODEL_URL, (event) => {
      buildingProgress = event.total > 0 ? event.loaded / event.total : 0.15;
      reportProgress();
    }),
    createIceCreamShop((progress) => {
      furnitureProgress = progress;
      reportProgress();
    }),
    createIceCreamProduction((progress) => {
      productionProgress = progress;
      reportProgress();
    }),
    createCharacterSystem((progress) => {
      characterProgress = progress;
      reportProgress();
    }),
  ]);

  const restaurant = gltf.scene;
  restaurant.name = 'Restaurant_Model';
  configureModel(restaurant);
  world.add(restaurant);
  world.add(iceCreamShop.group);
  world.add(iceCreamProduction.group);
  const wallColliders = createWallColliders(restaurant);
  world.add(characterSystem.group);
  iceCreamProduction.bindCharacterSystem(characterSystem);
  const progressionSystem = new ShopProgressionSystem(
    iceCreamShop,
    iceCreamProduction,
    characterSystem,
  );
  world.add(progressionSystem.group);
  iceCreamProduction.bindProgressionSystem(progressionSystem);
  applyLocalDebugStart(characterSystem);
  const playerColliders = Object.freeze([
    ...wallColliders,
    ...iceCreamShop.colliders,
    ...iceCreamProduction.colliders,
    ...iceCreamProduction.interactionColliders,
  ]);
  characterSystem.setPlayerColliders(playerColliders);

  const placementZones = new PlacementZones(PLACEMENT_ZONES);
  world.add(placementZones.group);

  const mixer = startEntranceAnimation(restaurant, gltf.animations);
  const bounds = new THREE.Box3().setFromObject(restaurant);
  const size = bounds.getSize(new THREE.Vector3());

  onProgress?.(1);

  return {
    world,
    restaurant,
    iceCreamShop,
    iceCreamProduction,
    progressionSystem,
    characterSystem,
    placementZones,
    wallColliders,
    furnitureColliders: iceCreamShop.colliders,
    productionColliders: iceCreamProduction.colliders,
    interactionColliders: iceCreamProduction.interactionColliders,
    playerColliders,
    bounds,
    size,
    update(delta, elapsed) {
      mixer?.update(delta);
      characterSystem.update(delta, elapsed);
      iceCreamProduction.update(delta, elapsed);
      iceCreamProduction.updateHiring(delta, elapsed);
      progressionSystem.update(
        delta,
        elapsed,
        characterSystem.player.model.position,
      );
      placementZones.update(elapsed);
    },
    dispose() {
      mixer?.stopAllAction();
      progressionSystem.dispose();
      iceCreamProduction.dispose();
      iceCreamShop.dispose();
      characterSystem.dispose();
      placementZones.dispose();
    },
  };
}
