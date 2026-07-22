import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_CONFIG } from './config.js';
import { TableCleanupSystem } from './table-cleanup-system.js';
import { HiringSystem } from './hiring-system.js';
import { STORY_SERVICE_GOAL, TUTORIAL_COLLECTION_TARGET } from './progression-system.js';

const VANILLA_MACHINE_URL = new URL('../ice_cream_glb/machine_vanilla.glb', import.meta.url).href;
export const VANILLA_MACHINE_IDS = Object.freeze(['vanilla-1', 'vanilla-2', 'vanilla-3']);
export const VANILLA_MACHINE_POSITIONS = Object.freeze({
  'vanilla-1': Object.freeze([0.8, 0.02, -6.42]),
  'vanilla-2': Object.freeze([-1.6, 0.02, -6.42]),
  'vanilla-3': Object.freeze([-4, 0.02, -6.42]),
});
const MACHINE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: VANILLA_MACHINE_IDS[0],
    flavor: 'vanilla',
    label: 'Vanilla',
    color: 0xffe7a0,
    position: VANILLA_MACHINE_POSITIONS[VANILLA_MACHINE_IDS[0]],
  }),
  Object.freeze({
    id: VANILLA_MACHINE_IDS[1],
    flavor: 'vanilla',
    label: 'Vanilla',
    color: 0xffe7a0,
    position: VANILLA_MACHINE_POSITIONS[VANILLA_MACHINE_IDS[1]],
  }),
  Object.freeze({
    id: VANILLA_MACHINE_IDS[2],
    flavor: 'vanilla',
    label: 'Vanilla',
    color: 0xffe7a0,
    position: VANILLA_MACHINE_POSITIONS[VANILLA_MACHINE_IDS[2]],
  }),
]);

const PRODUCTS_URL = new URL('../ice_cream_glb/products_all.glb', import.meta.url).href;
const SUPPORTS_URL = new URL('../ice_cream_glb/trays_support_all.glb', import.meta.url).href;
const SERVE_POINT = Object.freeze([1.55, 0.08, -2.12]);
const COUNTER_STOCK_POSITIONS = Object.freeze({
  cone: Object.freeze([0.72, 1.13, -0.82]),
  cup: Object.freeze([2.42, 1.13, -0.82]),
});
const CASH_POINT = Object.freeze([6.05, 0.08, -0.05]);
const INTERACTION_RADIUS = 0.82;
const CASH_PICKUP_RADIUS = 1;
const MAX_CASH_BILLS = 24;
export const MAX_ORDER_AMOUNT = 3;
const MAX_VISIBLE_COUNTER_STOCK = 9;
const STARTING_CASH = 500;
const ORDER_CONTAINER_COLORS = Object.freeze({
  cone: '#f3b45f',
  cup: '#bfeadd',
});
const ORDER_CONTAINER_LABELS = Object.freeze({
  cone: 'CONE',
  cup: 'CUP',
});

export const PRODUCTION_STATION_IDS = Object.freeze(['cone', 'cup']);
const SUPPORT_LAYOUT = Object.freeze([
  Object.freeze({ id: 'cone-dispenser', source: 'Support_ConeDispenser', position: [3.6, 0.02, -3.1], rotation: -Math.PI / 2, collider: true, station: 'cone' }),
  Object.freeze({ id: 'cup-dispenser', source: 'Support_CupDispenser', position: [3.6, 0.02, -4.35], rotation: -Math.PI / 2, collider: true, station: 'cup' }),
]);

const PRODUCT_NAMES = Object.freeze({
  cone: 'Piece_Cone',
  cup: 'Piece_Cup',
  vanilla: Object.freeze({ cone: 'Product_Vanilla_Cone', cup: 'Product_Vanilla_Cup' }),
});
const CUSTOMER_PRODUCT_SCALE = 0.31;
const CUSTOMER_PRODUCT_DINING_INSET = 0.035;
const CUSTOMER_PRODUCT_GRIP_OFFSET = Object.freeze({
  cone: -0.075,
  cup: -0.055,
});


function configureMaterial(material) {
  material.roughness = Math.max(material.roughness ?? 0.72, 0.62);
  material.needsUpdate = true;
}

function configureObject(root, collisionRecords = null, colliderOwner = null) {
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

function resetCloneTransform(object, definition) {
  object.position.set(...definition.position);
  object.quaternion.identity();
  object.rotation.y = definition.rotation;
  object.scale.setScalar(1);
  object.name = `Production_${definition.id}`;
  object.userData.productionAssetId = definition.id;
}

function findAnchor(root, role) {
  let anchor = null;
  root.traverse((object) => {
    if (!anchor && object.userData?.anchor_role === role) anchor = object;
  });
  return anchor;
}

function cloneAsset(sourceScene, name) {
  const source = sourceScene.getObjectByName(name);
  if (!source) throw new Error(`Missing ice-cream asset node: ${name}`);
  const clone = source.clone(true);
  clone.position.set(0, 0, 0);
  clone.quaternion.identity();
  clone.scale.setScalar(1);
  return clone;
}

export function orientConeProductUpright(root) {
  let corrected = false;
  root.traverse((object) => {
    if (!object.isMesh || object.userData.coneUprightCorrected) return;
    const isConeBody = object.name === 'Piece_Cone_Mesh' || /_Cone_Cone$/.test(object.name);
    if (!isConeBody) return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox;
    if (!bounds) return;
    object.rotation.x += Math.PI;
    object.position.y += bounds.min.y + bounds.max.y;
    object.userData.coneUprightCorrected = true;
    corrected = true;
  });
  return corrected;
}

function createColliders(group, records) {
  const padding = WORLD_CONFIG.playerCollisionRadius;
  const bounds = new THREE.Box3();
  group.updateMatrixWorld(true);

  return records.map(({ object, ownerId }) => {
    bounds.setFromObject(object);
    return {
      name: object.name,
      productionAssetId: ownerId,
      enabled: true,
      minX: bounds.min.x - padding,
      maxX: bounds.max.x + padding,
      minZ: bounds.min.z - padding,
      maxZ: bounds.max.z + padding,
    };
  });
}

function createInteractionMarker(position, color, { radius = 0.55, floatingArrow = false } = {}) {
  const group = new THREE.Group();
  group.position.set(position.x, Math.max(position.y ?? 0, 0) + 0.09, position.z);
  group.visible = false;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.06, radius + 0.1, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  disc.renderOrder = 40;
  ring.renderOrder = 41;
  group.add(disc, ring);

  if (floatingArrow) {
    const arrow = new THREE.Group();
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), arrowMaterial);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.18), arrowMaterial);
    tip.rotation.z = Math.PI;
    stem.position.y = 0.38;
    tip.renderOrder = 42;
    stem.renderOrder = 42;
    arrow.position.y = 1.35;
    arrow.userData.baseY = arrow.position.y;
    arrow.add(tip, stem);
    group.userData.floatingArrow = arrow;
    group.add(arrow);
  }

  return group;
}

function createMachine(gltf, definition, collisionRecords) {
  const model = gltf.scene;
  model.name = `Production_Machine_${definition.id}`;
  model.position.set(...definition.position);
  model.userData.productionAssetId = `machine-${definition.id}`;
  configureObject(model, collisionRecords, { id: `machine-${definition.id}`, collider: true });

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
  const idleEntry = [...actions.entries()].find(([name]) => name.endsWith('_Machine_Idle'));
  if (idleEntry) {
    idleEntry[1].setLoop(THREE.LoopRepeat, Infinity).reset().play();
  }

  const preview = [...model.children].find((object) => object.userData?.part_role === 'DispensedProductPreview')
    ?? model.getObjectByName(`Machine_${definition.label}_DispensePreviewScoop`);
  if (preview) preview.visible = false;

  return {
    ...definition,
    model,
    mixer,
    actions,
    preview,
    standPoint: new THREE.Vector3(),
    dispensingUntil: 0,
  };
}

function playMachineAction(machine, suffix) {
  const entry = [...machine.actions.entries()].find(([name]) => name.endsWith(suffix));
  if (!entry) return;
  const action = entry[1];
  action.reset();
  action.enabled = true;
  action.clampWhenFinished = true;
  action.setLoop(THREE.LoopOnce, 1);
  action.play();
}

function squaredDistanceXZ(position, target) {
  const deltaX = position.x - target.x;
  const deltaZ = position.z - target.z;
  return deltaX * deltaX + deltaZ * deltaZ;
}

function roundedRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function createOrderBubble(order) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 184;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);

  roundedRectPath(context, 10, 8, 354, 142, 28);
  context.fillStyle = 'rgba(40, 42, 37, 0.92)';
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = 'rgba(255, 255, 246, 0.96)';
  context.stroke();
  context.beginPath();
  context.moveTo(164, 148);
  context.lineTo(194, 178);
  context.lineTo(220, 148);
  context.closePath();
  context.fillStyle = 'rgba(40, 42, 37, 0.92)';
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = 'rgba(255, 255, 246, 0.96)';
  context.stroke();

  context.fillStyle = '#ffe7a0';
  context.beginPath();
  context.arc(77, 62, 35, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = '#5a3c2d';
  context.stroke();
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.beginPath();
  context.arc(65, 50, 9, 0, Math.PI * 2);
  context.fill();

  if (order.container === 'cone') {
    context.fillStyle = '#e7ad61';
    context.beginPath();
    context.moveTo(48, 83);
    context.lineTo(106, 83);
    context.lineTo(77, 137);
    context.closePath();
    context.fill();
    context.strokeStyle = '#8f5d36';
    context.lineWidth = 4;
    context.stroke();
  } else {
    roundedRectPath(context, 47, 82, 60, 52, 10);
    context.fillStyle = '#f9f1df';
    context.fill();
    context.strokeStyle = '#8c806f';
    context.lineWidth = 4;
    context.stroke();
  }

  context.textAlign = 'center';
  context.fillStyle = '#ffffff';
  context.font = '900 35px Arial, sans-serif';
  context.fillText('', 241, 62);
  context.fillStyle = '#d8ffd2';
  context.font = '800 27px Arial, sans-serif';
  context.fillText(`${order.container.toUpperCase()}  •  1`, 241, 108);

  context.fillStyle = 'rgba(40, 42, 37, 0.98)';
  context.fillRect(126, 23, 218, 112);
  context.textAlign = 'center';
  context.fillStyle = ORDER_CONTAINER_COLORS[order.container] ?? '#ffffff';
  context.font = '900 39px Arial, sans-serif';
  context.fillText(ORDER_CONTAINER_LABELS[order.container] ?? order.container.toUpperCase(), 235, 63);
  context.fillStyle = '#ffffff';
  context.font = '900 39px Arial, sans-serif';
  context.fillText(`x ${THREE.MathUtils.clamp(order.amount ?? 1, 1, MAX_ORDER_AMOUNT)}`, 235, 114);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = `Order_Bubble_${order.container}_${order.amount ?? 1}`;
  sprite.position.set(0, 2.75, 0);
  sprite.scale.set(2.55, 1.22, 1);
  sprite.renderOrder = 80;
  return sprite;
}

function createCashNoteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 144;
  const context = canvas.getContext('2d');
  context.fillStyle = '#50e531';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#209f20';
  context.lineWidth = 10;
  context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  context.fillStyle = '#d5ff78';
  context.fillRect(88, 31, 80, 82);
  context.fillRect(22, 20, 38, 28);
  context.fillRect(196, 96, 38, 28);
  context.fillStyle = '#9ef146';
  context.beginPath();
  context.arc(128, 72, 21, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createCashPile() {
  const group = new THREE.Group();
  group.name = 'Uncollected_Cash_Pile';
  group.position.set(...CASH_POINT);
  group.visible = false;

  const bills = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.78, 0.09, 0.44),
    new THREE.MeshStandardMaterial({ color: 0x52df31, roughness: 0.72 }),
    MAX_CASH_BILLS,
  );
  const accents = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.72, 0.38),
    new THREE.MeshBasicMaterial({ map: createCashNoteTexture() }),
    MAX_CASH_BILLS,
  );
  bills.name = 'Cash_Bills';
  accents.name = 'Cash_Bill_Accents';
  bills.castShadow = true;
  bills.receiveShadow = true;
  accents.castShadow = true;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const upAxis = new THREE.Vector3(0, 1, 0);
  const accentEuler = new THREE.Euler();
  for (let index = 0; index < MAX_CASH_BILLS; index += 1) {
    const layer = Math.floor(index / 6);
    const slot = index % 6;
    position.set((slot % 3 - 1) * 0.5, 0.05 + layer * 0.105, (Math.floor(slot / 3) - 0.5) * 0.34);
    rotation.setFromAxisAngle(upAxis, (index % 2 ? 1 : -1) * 0.04);
    matrix.compose(position, rotation, scale);
    bills.setMatrixAt(index, matrix);
    position.y += 0.048;
    rotation.setFromEuler(accentEuler.set(-Math.PI / 2, (index % 2 ? 1 : -1) * 0.04, 0));
    matrix.compose(position, rotation, scale);
    accents.setMatrixAt(index, matrix);
  }
  bills.count = 0;
  accents.count = 0;
  group.add(bills, accents);
  return { group, bills, accents };
}

function disposeObjectResources(roots) {
function createCounterStockDisplay(productsScene, container) {
  const group = new THREE.Group();
  group.name = `Counter_Stock_${container}`;
  group.position.set(...COUNTER_STOCK_POSITIONS[container]);

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.08, 0.68),
    new THREE.MeshStandardMaterial({
      color: container === 'cone' ? 0xf2c98d : 0xaee5dc,
      roughness: 0.7,
    }),
  );
  pad.name = `Counter_Stock_Pad_${container}`;
  pad.position.y = -0.02;
  pad.castShadow = true;
  pad.receiveShadow = true;
  group.add(pad);

  const products = [];
  for (let index = 0; index < MAX_VISIBLE_COUNTER_STOCK; index += 1) {
    const product = cloneAsset(productsScene, PRODUCT_NAMES.vanilla[container]);
    if (container === 'cone') orientConeProductUpright(product);
    const column = index % 3;
    const layer = Math.floor(index / 3);
    product.name = `Counter_Stock_${container}_${index + 1}`;
    product.position.set((column - 1) * 0.25, 0.16 + layer * 0.25, 0);
    product.scale.setScalar(0.27);
    product.visible = false;
    configureObject(product);
    group.add(product);
    products.push(product);
  }

  return { group, products };
}

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  roots.forEach((root) => root?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  }));

  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export class IceCreamProductionSystem {
  constructor({ group, machines, supports, colliders, productsScene, supportsScene }) {
    this.group = group;
    this.machines = machines;
    this.supports = supports;
    this.colliders = colliders;
    this.productsScene = productsScene;
    this.supportsScene = supportsScene;
    this.stationPoints = new Map();
    this.markers = new Map();
    this.tutorialGuidanceActive = true;
    this.characterSystem = null;
    this.carryRig = new THREE.Group();
    this.carryRig.name = 'Worker_IceCream_Tray';
    this.carryRig.position.set(0, 1.04, 0.48);
    this.carryRig.visible = false;
    this.carryProducts = new Map();
    this.activeCarryProduct = null;
    this.stage = 'waiting';
    this.activeOrder = null;
    this.counterStock = { cone: 0, cup: 0 };
    this.counterStockDisplays = new Map();
    this.nextProductionContainer = 'cone';
    this.dispenseReadyAt = 0;
    this.serveReadyAt = 0;
    this.nextOrderAt = 0;
    const debugParameters = location.hostname === '127.0.0.1'
      ? new URLSearchParams(location.search)
      : null;
    const debugOrder = debugParameters
      ? Number(debugParameters.get('order'))
      : 0;
    this.servedCount = Number.isInteger(debugOrder) && debugOrder >= 0 ? debugOrder : 0;
    const debugCashValue = debugParameters?.get('cash');
    const initialCash = debugCashValue === null || debugCashValue === undefined
      ? STARTING_CASH
      : Number(debugCashValue);
    this.cash = Number.isInteger(initialCash) && initialCash >= 0 ? initialCash : STARTING_CASH;
    this.pendingCash = 0;
    this.pendingPayments = 0;
    this.totalCollectedCash = 0;
    this.lastCollectedAmount = 0;
    this.orderBubbles = new Map();
    this.customerProducts = new Map();
    this.customerGripWorldQuaternion = new THREE.Quaternion();
    this.customerModelWorldQuaternion = new THREE.Quaternion();
    this.progressionSystem = null;
    this.unlockedMachines = new Set();
    this.tableCleanup = null;
    this.hiringSystem = null;
    this.interactionColliders = Object.freeze([]);
    this.suspendedTargetMarkerId = null;
    this.statusRevision = 0;
    this.status = Object.freeze({
      title: 'Enter your ice cream shop',
      detail: 'Walk through the front doors to begin building your business',
    });
    this.targetMarkerId = null;

    this.cashPile = createCashPile();
    this.group.add(this.cashPile.group);
    this.cashMarker = createInteractionMarker(
      new THREE.Vector3(CASH_POINT[0], CASH_POINT[1], CASH_POINT[2]),
      0x55ef3c,
    );
    this.group.add(this.cashMarker);
    this._buildStations();
    this._buildCounterStockDisplays();
    this._buildCarryRig();
    this.setSupportStationsVisible(false);
    this.setUnlockedMachines([]);
  }

  _buildStations() {
    this.group.updateMatrixWorld(true);

    this.machines.forEach((machine) => {
      const anchor = findAnchor(machine.model, 'StaffStandPoint');
      if (!anchor) throw new Error(`Missing StaffStandPoint on ${machine.id}`);
      anchor.getWorldPosition(machine.standPoint);
      const markerId = `machine-${machine.id}`;
      const marker = createInteractionMarker(machine.standPoint, 0x46ef3f, {
        radius: 0.7,
        floatingArrow: true,
      });
      this.markers.set(markerId, marker);
      this.group.add(marker);
    });

    this.supports.forEach(({ definition, model }) => {
      if (!definition.station) return;
      const anchor = findAnchor(model, 'InteractionPoint');
      if (!anchor) throw new Error(`Missing InteractionPoint on ${definition.source}`);
      const point = anchor.getWorldPosition(new THREE.Vector3());
      this.stationPoints.set(definition.station, point);
      const marker = createInteractionMarker(point, 0x57e87b);
      this.markers.set(`station-${definition.station}`, marker);
      this.group.add(marker);
    });

    const servePosition = new THREE.Vector3(...SERVE_POINT);
    this.stationPoints.set('serve', servePosition);
    const serveMarker = createInteractionMarker(servePosition, 0x4df05e);
    this.markers.set('serve', serveMarker);
    this.group.add(serveMarker);
  }

  _buildCounterStockDisplays() {
    Object.keys(ORDER_CONTAINER_LABELS).forEach((container) => {
      const display = createCounterStockDisplay(this.productsScene, container);
      this.counterStockDisplays.set(container, display);
      this.group.add(display.group);
    });
    this._syncCounterStock();
  }

  _buildCarryRig() {
    const tray = cloneAsset(this.supportsScene, 'Tray_1_Order');
    tray.name = 'Worker_Carry_Tray';
    tray.scale.setScalar(0.86);
    configureObject(tray);
    this.carryRig.add(tray);

    const carryNames = new Set([
      PRODUCT_NAMES.cone,
      PRODUCT_NAMES.cup,
      ...Object.values(PRODUCT_NAMES)
        .filter((value) => typeof value === 'object')
        .flatMap((value) => Object.values(value)),
    ]);

    carryNames.forEach((name) => {
      const products = [];
      for (let index = 0; index < MAX_ORDER_AMOUNT; index += 1) {
        const product = cloneAsset(this.productsScene, name);
        if (name === PRODUCT_NAMES.cone || name.endsWith('_Cone')) orientConeProductUpright(product);
        product.name = `Carry_${name}_${index + 1}`;
        product.position.set(0, 0.16 + index * 0.24, 0);
        product.scale.setScalar(name.startsWith('Piece_') ? 0.76 : 0.58);
        product.visible = false;
        configureObject(product);
        this.carryRig.add(product);
        products.push(product);
      }
      this.carryProducts.set(name, products);
    });
  }

  bindCharacterSystem(characterSystem) {
    this.characterSystem = characterSystem;
    const playerModel = characterSystem.player?.model;
    if (!playerModel) throw new Error('IceCreamProductionSystem requires the player character');
    playerModel.add(this.carryRig);
    this.tableCleanup = new TableCleanupSystem(characterSystem);
    this.group.add(this.tableCleanup.group);
    this.hiringSystem = new HiringSystem(characterSystem, this);
    this.group.add(this.hiringSystem.group);
    this.interactionColliders = Object.freeze([
      ...this.tableCleanup.colliders,
      ...this.hiringSystem.colliders,
    ]);
    this.setTutorialGuidanceActive(this.tutorialGuidanceActive);
  }

  bindProgressionSystem(progressionSystem) {
    this.progressionSystem = progressionSystem;
  }

  setTutorialGuidanceActive(active) {
    this.tutorialGuidanceActive = Boolean(active);
    this.characterSystem?.setTutorialGuidanceVisible(this.tutorialGuidanceActive);
    this.tableCleanup?.setTutorialGuidanceVisible(this.tutorialGuidanceActive);
    this.markers.forEach((marker, id) => {
      marker.visible = this.tutorialGuidanceActive && id === this.targetMarkerId;
    });
    if (this.cashMarker) {
      this.cashMarker.visible = this.tutorialGuidanceActive && this.pendingCash > 0;
    }
  }

  get unlockedMachineIds() {
    return MACHINE_DEFINITIONS
      .map(({ id }) => id)
      .filter((id) => this.unlockedMachines.has(id));
  }

  get unlockedFlavorIds() {
    return this.productionCapacity > 0 ? ['vanilla'] : [];
  }

  get productionCapacity() {
    return this.unlockedMachineIds.length;
  }

  setUnlockedMachines(machineIds) {
    this.unlockedMachines = new Set(machineIds);
    this.machines.forEach((machine) => {
      const unlocked = this.unlockedMachines.has(machine.id);
      machine.unlocked = unlocked;
      machine.model.visible = unlocked;
      this.colliders
        .filter(({ productionAssetId }) => productionAssetId === `machine-${machine.id}`)
        .forEach((collider) => { collider.enabled = unlocked; });
      if (!unlocked) {
        const marker = this.markers.get(`machine-${machine.id}`);
        if (marker) marker.visible = false;
      }
    });
  }

  setSupportStationsVisible(visible) {
    this.supportStationsVisible = Boolean(visible);
    this.counterStockDisplays.forEach(({ group }) => {
      group.visible = this.supportStationsVisible;
    });
    this.supports.forEach(({ definition, model }) => {
      model.visible = this.supportStationsVisible;
      this.colliders
        .filter(({ productionAssetId }) => productionAssetId === definition.id)
        .forEach((collider) => { collider.enabled = this.supportStationsVisible; });
      if (!this.supportStationsVisible && definition.station) {
        const marker = this.markers.get('station-' + definition.station);
        if (marker) marker.visible = false;
      }
    });
  }

  unlockMachine(machineId) {
    const machine = this.machines.find((candidate) => candidate.id === machineId);
    if (!machine) return null;
    const nextMachines = new Set(this.unlockedMachines);
    nextMachines.add(machineId);
    this.setUnlockedMachines(nextMachines);
    return machine.model;
  }

  _syncCounterStock(container = null) {
    const containers = container ? [container] : Object.keys(ORDER_CONTAINER_LABELS);
    containers.forEach((stockContainer) => {
      const display = this.counterStockDisplays.get(stockContainer);
      if (!display) return;
      const visibleCount = Math.min(
        MAX_VISIBLE_COUNTER_STOCK,
        Math.max(0, this.counterStock[stockContainer] ?? 0),
      );
      display.products.forEach((product, index) => {
        product.visible = index < visibleCount;
      });
    });
  }

  _addCounterStock(container, amount) {
    this.counterStock[container] = Math.max(0, (this.counterStock[container] ?? 0) + amount);
    this._syncCounterStock(container);
  }

  _takeCounterStock(container, amount) {
    if ((this.counterStock[container] ?? 0) < amount) return false;
    this.counterStock[container] -= amount;
    this._syncCounterStock(container);
    return true;
  }

  _setCarryProduct(productName, amount = 1) {
    this.carryProducts.forEach((products) => products.forEach((product) => { product.visible = false; }));
    const products = this.carryProducts.get(productName);
    if (!products) throw new Error(`Missing carry product: ${productName}`);
    const visibleCount = THREE.MathUtils.clamp(Math.floor(amount), 1, MAX_ORDER_AMOUNT);
    products.forEach((product, index) => { product.visible = index < visibleCount; });
    this.activeCarryProduct = productName;
    this.carryRig.visible = true;
  }

  _clearCarryProduct() {
    this.carryRig.visible = false;
    this.carryProducts.forEach((products) => products.forEach((product) => { product.visible = false; }));
    this.activeCarryProduct = null;
  }

  _showOrderBubble(customer, order) {
    const existing = this.orderBubbles.get(customer.definition.id);
    if (existing) {
      existing.removeFromParent();
      disposeObjectResources([existing]);
      this.orderBubbles.delete(customer.definition.id);
    }
    const bubble = createOrderBubble(order);
    customer.model.add(bubble);
    bubble.userData.orderKey = `${order.container}:${order.amount ?? 1}`;
    this.orderBubbles.set(customer.definition.id, bubble);
  }

  _hideOrderBubble(customer) {
    const bubble = this.orderBubbles.get(customer?.definition.id);
    if (bubble) bubble.visible = false;
  }

  _syncQueueOrderBubbles() {
    this.characterSystem?.customers.forEach((customer) => {
      const order = customer.order;
      const bubble = this.orderBubbles.get(customer.definition.id);
      if (customer.state !== 'ordering' || !order) {
        if (bubble) bubble.visible = false;
        return;
      }
      const orderKey = `${order.container}:${order.amount ?? 1}`;
      if (!bubble || bubble.userData.orderKey !== orderKey) {
        this._showOrderBubble(customer, order);
        return;
      }
      bubble.visible = true;
    });
  }

  _showCustomerProduct(customer, order) {
    const productName = PRODUCT_NAMES[order.flavor][order.container];
    const gripBone = customer.model.getObjectByName('RightHandProp');
    if (!gripBone) throw new Error(`Missing right-hand prop socket for ${customer.definition.id}`);

    const gripPivot = new THREE.Group();
    const product = new THREE.Group();
    gripPivot.name = `Customer_Meal_Grip_${customer.definition.id}`;
    product.name = `Customer_Meal_Stack_${customer.definition.id}`;
    const productCount = THREE.MathUtils.clamp(Math.floor(order.amount ?? 1), 1, MAX_ORDER_AMOUNT);
    for (let index = 0; index < productCount; index += 1) {
      const item = cloneAsset(this.productsScene, productName);
      if (order.container === 'cone') orientConeProductUpright(item);
      item.name = `Customer_Meal_${customer.definition.id}_${index + 1}`;
      item.position.set(0, index * 0.18, 0);
      item.quaternion.identity();
      item.scale.setScalar(CUSTOMER_PRODUCT_SCALE);
      item.userData.customerGripAttached = true;
      configureObject(item);
      product.add(item);
    }
    product.position.set(0, CUSTOMER_PRODUCT_GRIP_OFFSET[order.container], 0);
    product.userData.customerGripAttached = true;
    const previous = this.customerProducts.get(customer.definition.id);
    if (previous) previous.gripPivot.removeFromParent();
    gripBone.add(gripPivot);
    gripPivot.add(product);
    this.customerProducts.set(customer.definition.id, {
      customer, product, gripBone, gripPivot,
    });
    this._syncCustomerDiningVisuals();
  }

  _syncCustomerDiningVisuals() {
    this.customerProducts.forEach(({ customer, product, gripBone, gripPivot }) => {
      const mealVisible = customer.state === 'paying'
        || customer.state === 'walking-to-seat'
        || customer.state === 'seated'
        || customer.state === 'eating';
      const dining = customer.state === 'seated' || customer.state === 'eating';
      product.visible = mealVisible;
      product.position.x = dining ? CUSTOMER_PRODUCT_DINING_INSET : 0;
      customer.model.getWorldQuaternion(this.customerModelWorldQuaternion);
      gripBone.getWorldQuaternion(this.customerGripWorldQuaternion);
      gripPivot.quaternion.copy(this.customerGripWorldQuaternion)
        .invert()
        .multiply(this.customerModelWorldQuaternion);
    });
  }

  _syncCashPile() {
    const visibleBillCount = Math.min(MAX_CASH_BILLS, this.pendingPayments * 6);
    this.cashPile.bills.count = visibleBillCount;
    this.cashPile.accents.count = visibleBillCount;
    this.cashPile.bills.instanceMatrix.needsUpdate = true;
    this.cashPile.accents.instanceMatrix.needsUpdate = true;
    this.cashPile.group.visible = this.pendingCash > 0;
    this.cashMarker.visible = this.tutorialGuidanceActive && this.pendingCash > 0;
  }

  _addPendingCash(amount) {
    this.pendingCash += amount;
    this.pendingPayments += 1;
    this._syncCashPile();
  }

  _tryCollectCash(playerPosition) {
    if (this.pendingCash <= 0) return;
    const deltaX = playerPosition.x - CASH_POINT[0];
    const deltaZ = playerPosition.z - CASH_POINT[2];
    if (deltaX * deltaX + deltaZ * deltaZ > CASH_PICKUP_RADIUS * CASH_PICKUP_RADIUS) return;

    const collected = this.pendingCash;
    this.cash += collected;
    this.totalCollectedCash += collected;
    if (this.totalCollectedCash >= TUTORIAL_COLLECTION_TARGET) {
      this.setTutorialGuidanceActive(false);
    }
    this.pendingCash = 0;
    this.pendingPayments = 0;
    this.lastCollectedAmount = collected;
    this._syncCashPile();
    this.characterSystem.playPlayerAction('Pickup', 0.48);
    if (this.stage === 'waiting' || this.stage === 'complete') {
      this._setStatus('Cash collected!', `+$${collected} added to your total`);
    }
  }

  _handleTableCleanup(elapsed, playerPosition) {
    if (!this.tableCleanup) return false;
    const event = this.tableCleanup.update(elapsed, playerPosition, !this.activeCarryProduct);
    if (!event) return false;

    if (event.type === 'picked-up') {
      this.suspendedTargetMarkerId = this.targetMarkerId;
      this._setTargetMarker(null);
      this._setStatus('Take the garbage to the trash bin', 'Carry it to the green trash bin across the dining room');
      return true;
    }

    if (event.type === 'carrying') {
      this._setStatus('Throw away the table garbage', 'Walk to the green trash bin to finish cleaning');
      return true;
    }

    if (event.type === 'disposing') {
      this._setStatus('Throwing away the garbage', 'The trash lid is open while the waste drops inside');
      return true;
    }

    if (event.type === 'disposed') {
      this._setTargetMarker(this.suspendedTargetMarkerId);
      this.suspendedTargetMarkerId = null;
      if (this.activeOrder && this.stage === 'need-container') {
        this._setStatus(
          `Pick up a ${this.activeOrder.container}`,
          `The table is clean — continue the ${this.activeOrder.flavor} order at the glowing dispenser`,
        );
      } else {
        this._setStatus(
          'Table cleaned and ready!',
          `${this.characterSystem.availableSeatCount} seats are now available for customers`,
        );
      }
      return true;
    }

    return false;
  }

  _completeCustomerService(service, order, elapsed) {
    const basePayment = order.container === 'cup' ? 20 : 15;
    const profitMultiplier = this.hiringSystem?.profitMultiplier ?? 1;
    const payment = basePayment * (order.amount ?? 1) * profitMultiplier;
    this._hideOrderBubble(service.customer);
    this._showCustomerProduct(service.customer, order);
    this._addPendingCash(payment);
    this.servedCount += 1;
    this.nextOrderAt = Math.max(this.nextOrderAt, elapsed + 0.18);
    if (this.stage === 'waiting') {
      this._setStatus(
        `${(order.container ?? '').toUpperCase()} order collected`,
        `$${payment} was added to the cash stack on the left of the counter`,
      );
    }
  }

  _tryFulfillWaitingCustomers(elapsed) {
    let fulfilled = false;
    for (const container of Object.keys(ORDER_CONTAINER_LABELS)) {
      const customer = this.characterSystem.getFrontCustomer(container);
      const demand = customer?.order;
      if (!customer || !demand) continue;
      const amount = THREE.MathUtils.clamp(
        Math.floor(demand.amount ?? 1),
        1,
        MAX_ORDER_AMOUNT,
      );
      if ((this.counterStock[container] ?? 0) < amount) continue;
      const order = Object.freeze({ ...demand, flavor: 'vanilla', amount });
      const service = this.characterSystem.serveFrontCustomer(elapsed, order);
      if (!service.ok) continue;
      this._takeCounterStock(container, amount);
      this._completeCustomerService(service, order, elapsed);
      fulfilled = true;
    }
    return fulfilled;
  }

  _depositActiveBatch(elapsed) {
    const order = this.activeOrder;
    if (!order) return false;
    const amount = THREE.MathUtils.clamp(Math.floor(order.amount ?? 1), 1, MAX_ORDER_AMOUNT);
    this._addCounterStock(order.container, amount);
    this._clearCarryProduct();
    this.characterSystem.setPlayerCarrying(false);
    this.activeOrder = null;
    this.stage = 'waiting';
    this.nextOrderAt = elapsed + 0.12;
    const label = ORDER_CONTAINER_LABELS[order.container] ?? order.container.toUpperCase();
    this._setStatus(
      `${amount} x ${label} stocked on the counter`,
      `The front ${order.container} customer can collect the requested amount`,
    );
    return true;
  }

  spendCash(amount) {
    const requested = Math.max(0, Math.floor(amount));
    const spent = Math.min(requested, this.cash);
    this.cash -= spent;
    return spent;
  }

  setStatus(title, detail) {
    this._setStatus(title, detail);
  }

  updateHiring(delta, elapsed) {
    const playerPosition = this.characterSystem?.player?.model.position;
    if (!playerPosition) return;
    this.hiringSystem?.update(delta, elapsed, playerPosition);
  }

  _setStatus(title, detail) {
    const sanitize = (value) => value
      .replaceAll(/vanilla\s*/gi, '')
      .replaceAll(/\s{2,}/g, ' ')
      .trim();
    const resolvedTitle = sanitize(title);
    const resolvedDetail = sanitize(this.tutorialGuidanceActive ? detail : detail.replaceAll('glowing ', ''));
    if (this.status.title === resolvedTitle && this.status.detail === resolvedDetail) return;
    this.status = Object.freeze({ title: resolvedTitle, detail: resolvedDetail });
    this.statusRevision += 1;
  }

  _setTargetMarker(markerId) {
    this.targetMarkerId = markerId;
    this.markers.forEach((marker, id) => {
      marker.visible = this.tutorialGuidanceActive && id === markerId;
    });
  }

  _startOrder() {
    const unlockedMachines = this.machines.filter(({ id }) => this.unlockedMachines.has(id));
    if (unlockedMachines.length === 0) return false;

    const frontCustomers = this.characterSystem.getFrontCustomers();
    const lanePriority = this.nextProductionContainer === 'cone'
      ? ['cone', 'cup']
      : ['cup', 'cone'];
    let selected = null;
    for (const container of lanePriority) {
      const customer = frontCustomers.find((candidate) => candidate.queueContainer === container);
      const requestedAmount = customer?.order?.amount ?? 0;
      const shortage = Math.max(0, requestedAmount - (this.counterStock[container] ?? 0));
      if (!customer || shortage <= 0) continue;
      selected = { customer, container, requestedAmount, shortage };
      break;
    }
    if (!selected) return false;

    const machineIndex = (this.servedCount + selected.requestedAmount) % unlockedMachines.length;
    const machine = unlockedMachines[machineIndex];
    const order = Object.freeze({
      flavor: 'vanilla',
      container: selected.container,
      amount: selected.shortage,
      requestedAmount: selected.requestedAmount,
      machineId: machine.id,
      customerId: selected.customer.definition.id,
    });
    this.activeOrder = order;
    this.nextProductionContainer = selected.container === 'cone' ? 'cup' : 'cone';
    this.stage = 'need-container';
    this._setTargetMarker(`station-${selected.container}`);
    const itemLabel = order.amount === 1 ? selected.container : `${selected.container}s`;
    this._setStatus(
      `Pick up ${order.amount} ${itemLabel}`,
      `Prepare stock for the ${selected.container} customer line`,
    );
    return true;
  }

  _triggerMachine(machine, elapsed) {
    machine.preview && (machine.preview.visible = true);
    const staffSpeed = this.hiringSystem?.productionSpeedMultiplier ?? 1;
    const dispenseSpeed = staffSpeed * Math.max(1, this.productionCapacity);
    machine.dispensingUntil = elapsed + 0.82 / dispenseSpeed;
    playMachineAction(machine, '_Machine_Dispense');
    playMachineAction(machine, '_Product_Pop');
    playMachineAction(machine, '_Tray_Load');
    return dispenseSpeed;
  }

  performWorkerStage(worker, elapsed) {
    if (!worker || !this.activeOrder) return false;
    const order = this.activeOrder;
    const productionSpeed = this.hiringSystem?.productionSpeedMultiplier ?? 1;

    if (this.stage === 'need-container') {
      this.stage = 'need-machine';
      this._setTargetMarker(`machine-${order.machineId}`);
      this._setStatus(
        `${worker.label} worker picked up the ${order.container}`,
        `They are taking it to ${order.machineId.replace('-', ' machine ')}`,
      );
      return true;
    }

    if (this.stage === 'need-machine') {
      const machine = this.machines.find(({ id }) => id === order.machineId);
      if (!machine) return false;
      const dispenseSpeed = this._triggerMachine(machine, elapsed);
      this.stage = 'dispensing';
      this.dispenseReadyAt = elapsed + 0.74 / dispenseSpeed;
      this._setTargetMarker(null);
      this._setStatus(
        `${worker.label} worker is filling ${order.amount} ${order.container}${order.amount === 1 ? '' : 's'}`,
        'The machine is preparing a counter stock batch',
      );
      return true;
    }


    if (this.stage === 'need-serve') {
      this.stage = 'serving';
      this.serveReadyAt = elapsed + 0.62 / productionSpeed;
      this._setTargetMarker(null);
      this._setStatus(
        `${worker.label} worker is stocking the counter`,
        `They are placing ${order.amount} completed ${order.container}${order.amount === 1 ? '' : 's'} on the tray`,
      );
      return true;
    }

    return false;
  }

  _near(playerPosition, point) {
    return squaredDistanceXZ(playerPosition, point) <= INTERACTION_RADIUS * INTERACTION_RADIUS;
  }

  _updateMarkers(elapsed) {
    const marker = this.targetMarkerId ? this.markers.get(this.targetMarkerId) : null;
    if (marker) {
      const pulse = 1 + Math.sin(elapsed * 4.4) * 0.08;
      marker.scale.setScalar(pulse);
      const arrow = marker.userData.floatingArrow;
      if (arrow) {
        arrow.position.y = arrow.userData.baseY + Math.sin(elapsed * 5.2) * 0.1;
        arrow.rotation.y = elapsed * 1.35;
      }
    }
    if (this.cashMarker.visible) {
      this.cashMarker.scale.setScalar(1 + Math.sin(elapsed * 4.8) * 0.1);
    }
  }

  update(delta, elapsed) {
    this.machines.forEach((machine) => {
      if (!machine.unlocked) return;
      machine.mixer.update(delta);
      if (machine.preview && machine.preview.visible && elapsed > machine.dispensingUntil) {
        machine.preview.visible = false;
      }
    });
    this._syncQueueOrderBubbles();
    this._syncCustomerDiningVisuals();
    this._updateMarkers(elapsed);

    const player = this.characterSystem?.player;
    if (!player) return;
    const playerPosition = player.model.position;
    this._tryCollectCash(playerPosition);
    if (this._handleTableCleanup(elapsed, playerPosition)) return;
    this._tryFulfillWaitingCustomers(elapsed);

    if (this.stage === 'waiting' && this.progressionSystem?.blocksOrders) {
      this._setTargetMarker(null);
      return;
    }

    if (this.stage === 'waiting') {
      if (this.progressionSystem?.complete && this.servedCount >= STORY_SERVICE_GOAL) {
        this.characterSystem.setCustomerReturnsEnabled(false);
        this._setTargetMarker(null);
        const allDeparted = this.characterSystem.customers.every(({ state }) => state === 'departed');
        if (allDeparted) {
          if (this.characterSystem.dirtyTableCount > 0) {
            this._setStatus(
              'Clean the remaining dining tables',
              `${this.characterSystem.dirtyTableCount} table${this.characterSystem.dirtyTableCount === 1 ? '' : 's'} must be cleaned before closing`,
            );
          } else {
            this.stage = 'complete';
            this._setStatus(
              this.pendingCash > 0 ? 'Collect the final cash stack' : 'Ice cream rush complete!',
              this.pendingCash > 0
                ? `$${this.pendingCash} is waiting on the left side of the counter`
                : `${this.servedCount} customers served successfully`,
            );
          }
        } else if (this.characterSystem.cleanableTableCount > 0) {
          this._setStatus(
            'A dining table needs cleaning',
            'Pick up the table garbage, then carry it to the green trash bin',
          );
        } else {
          this._setStatus(
            'Customers are enjoying their ice cream',
            `${this.characterSystem.activeDiningCount} guests are seated or heading to a table`,
          );
        }
        return;
      }

      if (elapsed < this.nextOrderAt) return;
      const frontCustomers = this.characterSystem.getFrontCustomers();
      if (frontCustomers.length > 0) {
        if (!this._startOrder()) {
          this._setTargetMarker(null);
          const enoughStock = frontCustomers.some(({ order }) => (
            (this.counterStock[order.container] ?? 0) >= (order.amount ?? 1)
          ));
          this._setStatus(
            enoughStock ? 'A clean table is needed' : 'Cup and cone lines are waiting',
            enoughStock
              ? 'Customers will collect from the counter as soon as a dining seat is available'
              : 'Keep matching cup and cone stacks ready on the counter',
          );
        }
      } else {
        this._setTargetMarker(null);
        this._setStatus('Customers approaching', 'Cup and cone guests are walking to their separate lines');
      }
      return;
    }

    if (this.stage === 'waiting-for-table') {
      this.stage = 'waiting';
      this.activeOrder = null;
      return;
    }

    const workerAutomation = this.hiringSystem?.workerAutomation;
    if (workerAutomation?.orderAutomationActive
      && ['need-container', 'need-machine', 'need-serve'].includes(this.stage)) {
      const assignedWorker = workerAutomation.workers[workerAutomation.assignedServerIndex]
        ?? workerAutomation.workers[0];
      this._setTargetMarker(null);
      if (this.activeCarryProduct) {
        this._clearCarryProduct();
        this.characterSystem.setPlayerCarrying(false);
      }
      this._setStatus(
        `${assignedWorker?.label ?? 'Ice cream'} worker is preparing counter stock`,
        `They are making ${this.activeOrder.amount} ${this.activeOrder.container}${this.activeOrder.amount === 1 ? '' : 's'}`,
      );
      return;
    }

    if (this.stage === 'need-container') {
      const stationPoint = this.stationPoints.get(this.activeOrder.container);
      if (!stationPoint || !this._near(playerPosition, stationPoint)) return;
      this._setCarryProduct(PRODUCT_NAMES[this.activeOrder.container], this.activeOrder.amount);
      this.characterSystem.setPlayerCarrying(true);
      this.characterSystem.playPlayerAction('Pickup');
      this.stage = 'need-machine';
      this._setTargetMarker(`machine-${this.activeOrder.machineId}`);
      this._setStatus(
        `Fill ${this.activeOrder.amount} ${this.activeOrder.container}${this.activeOrder.amount === 1 ? '' : 's'}`,
        'Take the empty stack to the ice cream machine',
      );
      return;
    }

    if (this.stage === 'need-machine') {
      const machine = this.machines.find(({ id }) => id === this.activeOrder.machineId);
      if (!machine || !this._near(playerPosition, machine.standPoint)) return;
      const dispenseSpeed = this._triggerMachine(machine, elapsed);
      this.characterSystem.playPlayerAction('Pickup');
      this.stage = 'dispensing';
      this.dispenseReadyAt = elapsed + 0.74 / dispenseSpeed;
      this._setTargetMarker(null);
      this._setStatus(`Dispensing ${machine.label.toLowerCase()}…`, 'The machine is filling the order tray');
      return;
    }

    if (this.stage === 'dispensing') {
      if (elapsed < this.dispenseReadyAt) return;
      const productName = PRODUCT_NAMES[this.activeOrder.flavor][this.activeOrder.container];
      if (this.hiringSystem?.workerAutomation?.orderAutomationActive) {
        this._clearCarryProduct();
        this.characterSystem.setPlayerCarrying(false);
      } else {
        this._setCarryProduct(productName, this.activeOrder.amount);
      }
      this.stage = 'need-serve';
      this._setTargetMarker('serve');
      this._setStatus(
        `Stock ${this.activeOrder.amount} ${this.activeOrder.container}${this.activeOrder.amount === 1 ? '' : 's'}`,
        'Take the completed stack to the matching counter tray',
      );
      return;
    }


    if (this.stage === 'need-serve') {
      const servePoint = this.stationPoints.get('serve');
      if (!servePoint || !this._near(playerPosition, servePoint)) return;
      this.characterSystem.playPlayerAction('Serve');
      this.stage = 'serving';
      const productionSpeed = this.hiringSystem?.productionSpeedMultiplier ?? 1;
      this.serveReadyAt = elapsed + 0.62 / productionSpeed;
      this._setTargetMarker(null);
      this._setStatus('Stocking the counter', 'The matching customer line is ready to collect');
      return;
    }

    if (this.stage === 'serving' && elapsed >= this.serveReadyAt) {
      this._depositActiveBatch(elapsed);
      this._tryFulfillWaitingCustomers(elapsed);
    }
  }

  dispose() {
    this.machines.forEach(({ mixer }) => mixer.stopAllAction());
    this.tableCleanup?.dispose();
    this.hiringSystem?.dispose();
    const detachedVisuals = [
      ...this.orderBubbles.values(),
      ...[...this.customerProducts.values()].map(({ gripPivot }) => gripPivot),
    ];
    detachedVisuals.forEach((visual) => visual.removeFromParent());
    this.carryRig.removeFromParent();
    disposeObjectResources([this.group, this.carryRig, ...detachedVisuals]);
  }
}

export async function createIceCreamProduction(onProgress) {
  const loader = new GLTFLoader();
  const requests = [
    VANILLA_MACHINE_URL,
    PRODUCTS_URL,
    SUPPORTS_URL,
  ];
  let completed = 0;
  const loaded = await Promise.all(requests.map(async (url) => {
    const gltf = await loader.loadAsync(url);
    completed += 1;
    onProgress?.(completed / requests.length);
    return gltf;
  }));

  const vanillaMachineGltf = loaded[0];
  const productsScene = loaded[1].scene;
  const supportsScene = loaded[2].scene;
  productsScene.name = 'IceCream_Product_Source_Cache';
  supportsScene.name = 'IceCream_Support_Source_Cache';
  productsScene.visible = false;
  supportsScene.visible = false;

  const group = new THREE.Group();
  group.name = 'Ice_Cream_Production';
  const sourceCache = new THREE.Group();
  sourceCache.name = 'IceCream_Hidden_Asset_Cache';
  sourceCache.visible = false;
  sourceCache.add(productsScene, supportsScene);
  group.add(sourceCache);

  const collisionRecords = [];
  const machines = MACHINE_DEFINITIONS.map((definition) => {
    const machine = createMachine({
      scene: vanillaMachineGltf.scene.clone(true),
      animations: vanillaMachineGltf.animations,
    }, definition, collisionRecords);
    group.add(machine.model);
    return machine;
  });

  const supports = SUPPORT_LAYOUT.map((definition) => {
    const model = cloneAsset(supportsScene, definition.source);
    resetCloneTransform(model, definition);
    configureObject(model, collisionRecords, definition);
    group.add(model);
    return { definition, model };
  });

  const colliders = createColliders(group, collisionRecords);
  const system = new IceCreamProductionSystem({
    group,
    machines,
    supports,
    colliders,
    productsScene,
    supportsScene,
  });
  return system;
}
