import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_CONFIG } from './config.js';
import { TableCleanupSystem } from './table-cleanup-system.js';
import { HiringSystem } from './hiring-system.js';
import { DINE_IN_BONUS } from './tuning.js';

const MACHINE_DEFINITIONS = Object.freeze([
  Object.freeze({
    flavor: 'vanilla',
    label: 'Vanilla',
    color: 0xffe7a0,
    url: new URL('../ice_cream_glb/machine_vanilla.glb', import.meta.url).href,
    position: Object.freeze([-6.4, 0.02, -4.72]),
  }),
  Object.freeze({
    flavor: 'strawberry',
    label: 'Strawberry',
    color: 0xff7690,
    url: new URL('../ice_cream_glb/machine_strawberry.glb', import.meta.url).href,
    position: Object.freeze([-4, 0.02, -4.72]),
  }),
  Object.freeze({
    flavor: 'chocolate',
    label: 'Chocolate',
    color: 0x9b583c,
    url: new URL('../ice_cream_glb/machine_chocolate.glb', import.meta.url).href,
    position: Object.freeze([-1.6, 0.02, -4.72]),
  }),
  Object.freeze({
    flavor: 'mint',
    label: 'Mint',
    color: 0x63e2b7,
    url: new URL('../ice_cream_glb/machine_mint.glb', import.meta.url).href,
    position: Object.freeze([0.8, 0.02, -4.72]),
  }),
]);

const PRODUCTS_URL = new URL('../ice_cream_glb/products_all.glb', import.meta.url).href;
const SUPPORTS_URL = new URL('../ice_cream_glb/trays_support_all.glb', import.meta.url).href;
const SERVE_POINT = Object.freeze([1.55, 0.08, -2.12]);
const CASH_POINT = Object.freeze([6.05, 0.08, -0.05]);
const INTERACTION_RADIUS = 0.82;
const CASH_PICKUP_RADIUS = 1;
const MAX_CASH_BILLS = 24;
const ORDER_FLAVOR_COLORS = Object.freeze({
  vanilla: '#ffe7a0',
  strawberry: '#ff7690',
  chocolate: '#9b583c',
  mint: '#63e2b7',
});
const ORDER_FLAVOR_LABELS = Object.freeze({
  vanilla: 'VANILLA',
  strawberry: 'STRAWBERRY',
  chocolate: 'CHOCOLATE',
  mint: 'MINT',
});

const SUPPORT_LAYOUT = Object.freeze([
  Object.freeze({ id: 'basic-topping', source: 'Support_BasicToppingStation', position: [-7.78, 0.02, -0.7], rotation: Math.PI / 2, collider: true, station: 'topping' }),
  Object.freeze({ id: 'cone-dispenser', source: 'Support_ConeDispenser', position: [3.6, 0.02, -3.1], rotation: -Math.PI / 2, collider: true, station: 'cone' }),
  Object.freeze({ id: 'cup-dispenser', source: 'Support_CupDispenser', position: [3.6, 0.02, -4.35], rotation: -Math.PI / 2, collider: true, station: 'cup' }),
  Object.freeze({ id: 'spoon-wafer-dispenser', source: 'Support_SpoonWaferDispenser', position: [3.6, 0.02, -5.6], rotation: -Math.PI / 2, collider: true, station: 'spoon' }),
]);

const PRODUCT_NAMES = Object.freeze({
  cone: 'Piece_Cone',
  cup: 'Piece_Cup',
  vanilla: Object.freeze({ cone: 'Product_Vanilla_Cone', cup: 'Product_Vanilla_Cup' }),
  strawberry: Object.freeze({ cone: 'Product_Strawberry_Cone', cup: 'Product_Strawberry_Cup' }),
  chocolate: Object.freeze({ cone: 'Product_Chocolate_Cone', cup: 'Product_Chocolate_Cup' }),
  mint: Object.freeze({ cone: 'Product_Mint_Cone', cup: 'Product_Mint_Cup' }),
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
  model.name = `Production_Machine_${definition.flavor}`;
  model.position.set(...definition.position);
  model.userData.productionAssetId = `machine-${definition.flavor}`;
  configureObject(model, collisionRecords, { id: `machine-${definition.flavor}`, collider: true });

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

  const flavorColor = ORDER_FLAVOR_COLORS[order.flavor];
  context.fillStyle = flavorColor;
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
  context.fillText(ORDER_FLAVOR_LABELS[order.flavor], 241, 62);
  context.fillStyle = '#d8ffd2';
  context.font = '800 27px Arial, sans-serif';
  context.fillText(`${order.container.toUpperCase()}  •  1`, 241, 108);

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
  sprite.name = `Order_Bubble_${order.flavor}_${order.container}`;
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
    this.characterSystem = null;
    this.carryRig = new THREE.Group();
    this.carryRig.name = 'Worker_IceCream_Tray';
    this.carryRig.position.set(0, 1.04, 0.48);
    this.carryRig.visible = false;
    this.carryProducts = new Map();
    this.activeCarryProduct = null;
    this.stage = 'waiting';
    this.activeOrder = null;
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
    const debugCash = debugParameters ? Number(debugParameters.get('cash')) : 0;
    this.cash = Number.isInteger(debugCash) && debugCash >= 0 ? debugCash : 0;
    this.pendingCash = 0;
    this.pendingPayments = 0;
    this.lastCollectedAmount = 0;
    this.orderBubbles = new Map();
    this.customerProducts = new Map();
    this.customerGripWorldQuaternion = new THREE.Quaternion();
    this.customerModelWorldQuaternion = new THREE.Quaternion();
    this.unlockedFlavors = new Set();
    this.unlockedSupports = new Set();
    this.buildSystem = null;
    this.tableCleanup = null;
    this.hiringSystem = null;
    this.interactionColliders = Object.freeze([]);
    this.suspendedTargetMarkerId = null;
    this.statusRevision = 0;
    this.status = Object.freeze({
      title: 'Customer approaching',
      detail: 'Get ready to make the first ice cream order',
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
    this._buildCarryRig();
    // The shop opens bare. The build system pushes the real owned set down immediately
    // after construction, and again after every purchase.
    this.menuBonuses = new Map();
    this.setUnlockedFlavors([]);
    this.setUnlockedSupports([]);
  }

  _buildStations() {
    this.group.updateMatrixWorld(true);

    this.machines.forEach((machine) => {
      const anchor = findAnchor(machine.model, 'StaffStandPoint');
      if (!anchor) throw new Error(`Missing StaffStandPoint on ${machine.flavor} machine`);
      anchor.getWorldPosition(machine.standPoint);
      const markerId = `machine-${machine.flavor}`;
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
      const color = definition.station === 'topping' ? 0xffae45 : 0x57e87b;
      const marker = createInteractionMarker(point, color);
      this.markers.set(`station-${definition.station}`, marker);
      this.group.add(marker);
    });

    const servePosition = new THREE.Vector3(...SERVE_POINT);
    this.stationPoints.set('serve', servePosition);
    const serveMarker = createInteractionMarker(servePosition, 0x4df05e);
    this.markers.set('serve', serveMarker);
    this.group.add(serveMarker);
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
      const product = cloneAsset(this.productsScene, name);
      product.name = `Carry_${name}`;
      product.position.set(0, 0.16, 0);
      product.scale.setScalar(name.startsWith('Piece_') ? 0.76 : 0.58);
      product.visible = false;
      configureObject(product);
      this.carryRig.add(product);
      this.carryProducts.set(name, product);
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
  }

  get unlockedFlavorIds() {
    return MACHINE_DEFINITIONS
      .map(({ flavor }) => flavor)
      .filter((flavor) => this.unlockedFlavors.has(flavor));
  }

  setUnlockedFlavors(flavorIds) {
    this.unlockedFlavors = new Set(flavorIds);
    this.machines.forEach((machine) => {
      const unlocked = this.unlockedFlavors.has(machine.flavor);
      machine.unlocked = unlocked;
      machine.model.visible = unlocked;
      this.colliders
        .filter(({ productionAssetId }) => productionAssetId === `machine-${machine.flavor}`)
        .forEach((collider) => { collider.enabled = unlocked; });
      if (!unlocked) {
        const marker = this.markers.get(`machine-${machine.flavor}`);
        if (marker) marker.visible = false;
      }
    });
  }

  unlockFlavor(flavor) {
    const machine = this.machines.find((candidate) => candidate.flavor === flavor);
    if (!machine) return null;
    const nextFlavors = new Set(this.unlockedFlavors);
    nextFlavors.add(flavor);
    this.setUnlockedFlavors(nextFlavors);
    return machine.model;
  }

  bindBuildSystem(buildSystem) {
    this.buildSystem = buildSystem;
  }

  /**
   * Which finishing station an order should visit, or null when the shop has not built
   * one yet. Cups want the spoon/wafer dispenser, cones want toppings; either may be
   * missing for most of the early game.
   */
  /**
   * Between orders, tell the player what to do next rather than leaving a stale
   * "Customer approaching" on screen. Uncollected cash comes first — it is the one thing
   * that blocks every purchase.
   */
  _showIdleGuidance() {
    if (this.pendingCash > 0) {
      this._setStatus('Collect your cash', `$${this.pendingCash} is waiting by the counter`);
      return;
    }
    const guidance = this.buildSystem?.guidance;
    if (guidance) {
      this._setStatus(guidance.title, guidance.detail);
      return;
    }
    this._setStatus('Customer approaching', 'The next guest is walking to the order counter');
  }

  _finishStationFor(order) {
    const preferred = order.container === 'cup' ? 'spoon' : 'topping';
    const stations = this.unlockedStationKeys;
    if (stations.has(preferred) && this.stationPoints.has(preferred)) return preferred;
    return null;
  }

  getMachineModel(flavor) {
    return this.machines.find((candidate) => candidate.flavor === flavor)?.model ?? null;
  }

  getSupportModel(supportId) {
    return this.supports.find(({ definition }) => definition.id === supportId)?.model ?? null;
  }

  get unlockedSupportIds() {
    return [...this.unlockedSupports];
  }

  /** Station keys ('cone', 'cup', 'topping', 'spoon') the shop can currently use. */
  get unlockedStationKeys() {
    return new Set(
      this.supports
        .filter(({ definition }) => definition.station && this.unlockedSupports.has(definition.id))
        .map(({ definition }) => definition.station),
    );
  }

  /**
   * Mirror of setUnlockedFlavors for the prep stations, so the shop can start with no
   * dispensers at all. Idempotent set-replacement — the build system recomputes and calls
   * this after every purchase rather than toggling individual stations.
   */
  setUnlockedSupports(supportIds) {
    this.unlockedSupports = new Set(supportIds);
    this.supports.forEach(({ definition, model }) => {
      const unlocked = this.unlockedSupports.has(definition.id);
      model.visible = unlocked;
      this.colliders
        .filter(({ productionAssetId }) => productionAssetId === definition.id)
        .forEach((collider) => { collider.enabled = unlocked; });
      if (!unlocked && definition.station) {
        const marker = this.markers.get(`station-${definition.station}`);
        if (marker) marker.visible = false;
      }
    });
  }

  /** Per-recipe price bonuses from decorative purchases (syrup bottles, etc.). */
  setMenuBonuses(bonuses) {
    this.menuBonuses = bonuses ?? new Map();
  }

  _setCarryProduct(productName) {
    this.carryProducts.forEach((product) => { product.visible = false; });
    const product = this.carryProducts.get(productName);
    if (!product) throw new Error(`Missing carry product: ${productName}`);
    product.visible = true;
    this.activeCarryProduct = productName;
    this.carryRig.visible = true;
  }

  _clearCarryProduct() {
    this.carryRig.visible = false;
    this.carryProducts.forEach((product) => { product.visible = false; });
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
    this.orderBubbles.set(customer.definition.id, bubble);
  }

  _hideOrderBubble(customer) {
    const bubble = this.orderBubbles.get(customer?.definition.id);
    if (bubble) bubble.visible = false;
  }

  _showCustomerProduct(customer, order) {
    const productName = PRODUCT_NAMES[order.flavor][order.container];
    const product = cloneAsset(this.productsScene, productName);
    const gripBone = customer.model.getObjectByName('RightHandProp');
    if (!gripBone) throw new Error(`Missing right-hand prop socket for ${customer.definition.id}`);

    const gripPivot = new THREE.Group();
    gripPivot.name = `Customer_Meal_Grip_${customer.definition.id}`;
    product.name = `Customer_Meal_${customer.definition.id}`;
    product.position.set(0, CUSTOMER_PRODUCT_GRIP_OFFSET[order.container], 0);
    product.quaternion.identity();
    product.scale.setScalar(CUSTOMER_PRODUCT_SCALE);
    product.userData.customerGripAttached = true;
    configureObject(product);
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
    this.cashMarker.visible = this.pendingCash > 0;
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
      this._setStatus('Take the garbage to the trash bin', 'Carry it to the glowing green bin across the dining room');
      return true;
    }

    if (event.type === 'carrying') {
      this._setStatus('Throw away the table garbage', 'Walk to the glowing green trash bin to finish cleaning');
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

  _completeService(service, elapsed) {
    const order = this.activeOrder;
    const basePayment = order.container === 'cup' ? 20 : 15;
    const profitMultiplier = this.hiringSystem?.profitMultiplier ?? 1;
    // Customers who got a clean seat are worth more than takeaway. This is what the
    // player actually feels when they buy a table.
    const dineIn = service.seatId ? DINE_IN_BONUS : 1;
    const payment = Math.round(basePayment * dineIn * profitMultiplier);
    this._hideOrderBubble(service.customer);
    this._showCustomerProduct(service.customer, order);
    this._clearCarryProduct();
    this.characterSystem.setPlayerCarrying(false);
    this._addPendingCash(payment);
    this.servedCount += 1;
    // Stars are the second progression axis: cash decides what you can afford, stars
    // decide what is even offered. Patience tiers will scale this in the economy pass.
    this.buildSystem?.addStars(1);
    this.activeOrder = null;
    this.stage = 'waiting';
    this.nextOrderAt = elapsed + 0.55;
    this._setStatus(
      'Payment stacked on the left of the counter',
      `Walk to the cash pile to collect $${this.pendingCash}`,
    );
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
    if (this.status.title === title && this.status.detail === detail) return;
    this.status = Object.freeze({ title, detail });
    this.statusRevision += 1;
  }

  _setTargetMarker(markerId) {
    this.targetMarkerId = markerId;
    this.markers.forEach((marker, id) => {
      marker.visible = id === markerId;
    });
  }

  _startOrder() {
    const unlockedFlavors = this.unlockedFlavorIds;
    if (unlockedFlavors.length === 0) return false;
    const flavor = unlockedFlavors[this.servedCount % unlockedFlavors.length];
    // Only ask for containers the shop can actually hand out — early on there is a cone
    // dispenser and nothing else.
    const containers = ['cone', 'cup'].filter((option) => this.unlockedStationKeys.has(option));
    if (containers.length === 0) return false;
    const container = containers[this.servedCount % containers.length];
    const order = Object.freeze({ flavor, container });
    const customer = this.characterSystem.assignFrontCustomerOrder(order);
    if (!customer) return false;
    this.activeOrder = order;
    this._showOrderBubble(customer, order);
    this.stage = 'need-container';
    this._setTargetMarker(`station-${container}`);
    this._setStatus(
      `Pick up a ${container}`,
      `Walk to the glowing ${container} dispenser for the ${flavor} order`,
    );
    return true;
  }

  _triggerMachine(machine, elapsed) {
    machine.preview && (machine.preview.visible = true);
    const productionSpeed = this.hiringSystem?.productionSpeedMultiplier ?? 1;
    machine.dispensingUntil = elapsed + 0.82 / productionSpeed;
    playMachineAction(machine, '_Machine_Dispense');
    playMachineAction(machine, '_Product_Pop');
    playMachineAction(machine, '_Tray_Load');
  }

  performWorkerStage(worker, elapsed) {
    if (!worker || !this.activeOrder) return false;
    const order = this.activeOrder;
    const productionSpeed = this.hiringSystem?.productionSpeedMultiplier ?? 1;

    if (this.stage === 'need-container') {
      this.stage = 'need-machine';
      this._setTargetMarker(`machine-${order.flavor}`);
      this._setStatus(
        `${worker.label} worker picked up the ${order.container}`,
        `They are taking it to the ${order.flavor} machine`,
      );
      return true;
    }

    if (this.stage === 'need-machine') {
      const machine = this.machines.find(({ flavor }) => flavor === order.flavor);
      if (!machine) return false;
      this._triggerMachine(machine, elapsed);
      this.stage = 'dispensing';
      this.dispenseReadyAt = elapsed + 0.74 / productionSpeed;
      this._setTargetMarker(null);
      this._setStatus(
        `${worker.label} worker is dispensing ${order.flavor}`,
        'The machine is filling the employee service tray',
      );
      return true;
    }

    if (this.stage === 'need-finish') {
      this.stage = 'need-serve';
      this._setTargetMarker('serve');
      this._setStatus(
        `${worker.label} worker added the finishing touch`,
        'They are carrying the completed ice cream to the customer',
      );
      return true;
    }

    if (this.stage === 'need-serve') {
      this.stage = 'serving';
      this.serveReadyAt = elapsed + 0.62 / productionSpeed;
      this._setTargetMarker(null);
      this._setStatus(
        `${worker.label} worker served the order!`,
        'The customer will pay and walk to a clean dining seat',
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
    this._syncCustomerDiningVisuals();
    this._updateMarkers(elapsed);

    const player = this.characterSystem?.player;
    if (!player) return;
    const playerPosition = player.model.position;
    this._tryCollectCash(playerPosition);
    if (this._handleTableCleanup(elapsed, playerPosition)) return;

    if (this.stage === 'waiting') {
      if (elapsed < this.nextOrderAt) return;
      const frontCustomer = this.characterSystem.customers.find((customer) => customer.state === 'ordering');
      if (frontCustomer) {
        this._startOrder();
      } else {
        this._setTargetMarker(null);
        this._showIdleGuidance();
      }
      return;
    }

    if (this.stage === 'need-container') {
      const stationPoint = this.stationPoints.get(this.activeOrder.container);
      if (!stationPoint || !this._near(playerPosition, stationPoint)) return;
      this._setCarryProduct(PRODUCT_NAMES[this.activeOrder.container]);
      this.characterSystem.setPlayerCarrying(true);
      this.characterSystem.playPlayerAction('Pickup');
      this.stage = 'need-machine';
      this._setTargetMarker(`machine-${this.activeOrder.flavor}`);
      this._setStatus(
        `Make ${this.activeOrder.flavor} ice cream`,
        `Take the ${this.activeOrder.container} to the glowing ${this.activeOrder.flavor} machine`,
      );
      return;
    }

    if (this.stage === 'need-machine') {
      const machine = this.machines.find(({ flavor }) => flavor === this.activeOrder.flavor);
      if (!machine || !this._near(playerPosition, machine.standPoint)) return;
      this._triggerMachine(machine, elapsed);
      this.characterSystem.playPlayerAction('Pickup');
      this.stage = 'dispensing';
      const productionSpeed = this.hiringSystem?.productionSpeedMultiplier ?? 1;
      this.dispenseReadyAt = elapsed + 0.74 / productionSpeed;
      this._setTargetMarker(null);
      this._setStatus(`Dispensing ${machine.label.toLowerCase()}…`, 'The machine is filling the order tray');
      return;
    }

    if (this.stage === 'dispensing') {
      if (elapsed < this.dispenseReadyAt) return;
      const productName = PRODUCT_NAMES[this.activeOrder.flavor][this.activeOrder.container];
      this._setCarryProduct(productName);

      // The finishing station is optional — early on there is no topping station or spoon
      // dispenser at all. Sending the player to one that has not been built yet is an
      // unwinnable instruction, so skip straight to serving instead.
      const finishStation = this._finishStationFor(this.activeOrder);
      if (!finishStation) {
        this.stage = 'need-serve';
        this._setTargetMarker('serve');
        this._setStatus(
          `Serve the ${this.activeOrder.flavor} ${this.activeOrder.container}`,
          'Take it to the glowing spot behind the counter',
        );
        return;
      }

      this.stage = 'need-finish';
      this._setTargetMarker(`station-${finishStation}`);
      this._setStatus(
        finishStation === 'spoon' ? 'Add a spoon and wafer' : 'Add the finishing topping',
        `Walk to the glowing ${finishStation === 'spoon' ? 'spoon dispenser' : 'topping station'}`,
      );
      return;
    }

    if (this.stage === 'need-finish') {
      const finishStation = this._finishStationFor(this.activeOrder);
      const stationPoint = finishStation ? this.stationPoints.get(finishStation) : null;
      if (!stationPoint || !this._near(playerPosition, stationPoint)) return;
      this.characterSystem.playPlayerAction('Pickup');
      this.stage = 'need-serve';
      this._setTargetMarker('serve');
      this._setStatus(
        `Serve the ${this.activeOrder.flavor} ${this.activeOrder.container}`,
        'Take the completed tray to the glowing staff point behind the counter',
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
      this._setStatus('Order served!', 'The customer is happy and the queue is moving forward');
      return;
    }

    if (this.stage === 'serving' && elapsed >= this.serveReadyAt) {
      // Only 'no-customer' can fail now — seating never blocks a serve.
      const service = this.characterSystem.serveFrontCustomer(elapsed, this.activeOrder);
      if (!service.ok) return;
      this._completeService(service, elapsed);
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

function addDisplayProducts(holder, productsScene) {
  const flavors = ['vanilla', 'strawberry', 'chocolate', 'mint'];
  flavors.forEach((flavor, index) => {
    const anchor = findAnchor(holder, `ServingSlot_0${index + 1}`);
    if (!anchor) return;
    const product = cloneAsset(productsScene, PRODUCT_NAMES[flavor].cone);
    product.name = `Display_${flavor}`;
    product.scale.setScalar(0.4);
    configureObject(product);
    anchor.add(product);
  });
}

export async function createIceCreamProduction(onProgress) {
  const loader = new GLTFLoader();
  const requests = [
    ...MACHINE_DEFINITIONS.map(({ url }) => url),
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

  const machineGltfs = loaded.slice(0, MACHINE_DEFINITIONS.length);
  const productsScene = loaded[MACHINE_DEFINITIONS.length].scene;
  const supportsScene = loaded[MACHINE_DEFINITIONS.length + 1].scene;
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
  const machines = machineGltfs.map((gltf, index) => {
    const machine = createMachine(gltf, MACHINE_DEFINITIONS[index], collisionRecords);
    group.add(machine.model);
    return machine;
  });

  const supports = SUPPORT_LAYOUT.map((definition) => {
    const model = cloneAsset(supportsScene, definition.source);
    resetCloneTransform(model, definition);
    configureObject(model, collisionRecords, definition);
    group.add(model);
    if (definition.displayProducts) addDisplayProducts(model, productsScene);
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
