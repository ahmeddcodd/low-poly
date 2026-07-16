import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_CONFIG } from './config.js';

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
const INTERACTION_RADIUS = 0.82;
const FLAVOR_SEQUENCE = Object.freeze(['vanilla', 'strawberry', 'chocolate', 'mint']);

const SUPPORT_LAYOUT = Object.freeze([
  Object.freeze({ id: 'basic-topping', source: 'Support_BasicToppingStation', position: [-7.78, 0.02, -0.7], rotation: Math.PI / 2, collider: true, station: 'topping' }),
  Object.freeze({ id: 'cone-dispenser', source: 'Support_ConeDispenser', position: [3.6, 0.02, -3.1], rotation: -Math.PI / 2, collider: true, station: 'cone' }),
  Object.freeze({ id: 'cup-dispenser', source: 'Support_CupDispenser', position: [3.6, 0.02, -4.35], rotation: -Math.PI / 2, collider: true, station: 'cup' }),
  Object.freeze({ id: 'spoon-wafer-dispenser', source: 'Support_SpoonWaferDispenser', position: [3.6, 0.02, -5.6], rotation: -Math.PI / 2, collider: true, station: 'spoon' }),

  Object.freeze({ id: 'starter-storage-shelf', source: 'Support_StarterStorageShelf', position: [12.8, 0.02, -5.3], rotation: 0, collider: true }),
  Object.freeze({ id: 'premium-freezer', source: 'Support_PremiumFreezer', position: [15.05, 0.02, -4.2], rotation: -Math.PI / 2, collider: true }),
  Object.freeze({ id: 'improved-refrigeration', source: 'Support_ImprovedRefrigeratedStorage', position: [15.05, 0.02, -1.5], rotation: -Math.PI / 2, collider: true }),
  Object.freeze({ id: 'storage-chest', source: 'Support_StorageChest', position: [12.8, 0.02, -0.95], rotation: Math.PI, collider: true }),
  Object.freeze({ id: 'tray-single-storage', source: 'Tray_1_Order', position: [12.05, 0.35, -5.18], rotation: 0, collider: false }),
  Object.freeze({ id: 'tray-four-storage', source: 'Tray_4_Order', position: [12.8, 1.13, -5.18], rotation: 0, collider: false }),
  Object.freeze({ id: 'tray-eight-storage', source: 'Tray_8_Order', position: [15.05, 2.69, -4.2], rotation: Math.PI / 2, collider: false }),

  Object.freeze({ id: 'ice-cream-holder', source: 'Support_IceCreamHolder', position: [12.2, 0.02, 0.75], rotation: 0, collider: true, displayProducts: true }),
  Object.freeze({ id: 'syrup-bottles', source: 'Support_SyrupBottleSet', position: [13.75, 0.02, 0.65], rotation: 0, collider: true }),
  Object.freeze({ id: 'napkin-holder', source: 'Support_NapkinHolder', position: [15.15, 0.02, 0.65], rotation: 0, collider: true }),
  Object.freeze({ id: 'purchase-pad', source: 'Upgrade_CashPurchasePad', position: [14.25, 0.02, 1.85], rotation: 0, collider: false }),
  Object.freeze({ id: 'speed-upgrade', source: 'Upgrade_SpeedBoosterModule', position: [12.05, 0.02, 4.05], rotation: 0, collider: true }),
  Object.freeze({ id: 'auto-dispense-upgrade', source: 'Upgrade_AutoDispenseModule', position: [12.05, 0.02, 5.15], rotation: Math.PI, collider: true }),
  Object.freeze({ id: 'capacity-upgrade', source: 'Upgrade_CapacityModule', position: [13.55, 0.02, 5.15], rotation: Math.PI, collider: true }),
  Object.freeze({ id: 'deluxe-topping', source: 'Support_DeluxeToppingStation', position: [15.15, 0.02, 4.05], rotation: -Math.PI / 2, collider: true }),
]);

const PRODUCT_NAMES = Object.freeze({
  cone: 'Piece_Cone',
  cup: 'Piece_Cup',
  vanilla: Object.freeze({ cone: 'Product_Vanilla_Cone', cup: 'Product_Vanilla_Cup' }),
  strawberry: Object.freeze({ cone: 'Product_Strawberry_Cone', cup: 'Product_Strawberry_Cup' }),
  chocolate: Object.freeze({ cone: 'Product_Chocolate_Cone', cup: 'Product_Chocolate_Cup' }),
  mint: Object.freeze({ cone: 'Product_Mint_Cone', cup: 'Product_Mint_Cup' }),
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

  return Object.freeze(records.map(({ object, ownerId }) => {
    bounds.setFromObject(object);
    return Object.freeze({
      name: object.name,
      productionAssetId: ownerId,
      minX: bounds.min.x - padding,
      maxX: bounds.max.x + padding,
      minZ: bounds.min.z - padding,
      maxZ: bounds.max.z + padding,
    });
  }));
}

function createInteractionMarker(position, color) {
  const group = new THREE.Group();
  group.position.set(position.x, 0.075, position.z);
  group.visible = false;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  group.add(disc, ring);
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
    this.carryRig.position.set(0, 1.23, 0.48);
    this.carryRig.visible = false;
    this.carryProducts = new Map();
    this.activeCarryProduct = null;
    this.stage = 'waiting';
    this.activeOrder = null;
    this.dispenseReadyAt = 0;
    this.serveReadyAt = 0;
    this.nextOrderAt = 0;
    const debugOrder = location.hostname === '127.0.0.1'
      ? Number(new URLSearchParams(location.search).get('order'))
      : 0;
    this.servedCount = Number.isInteger(debugOrder) && debugOrder >= 0 ? debugOrder : 0;
    this.cash = 0;
    this.statusRevision = 0;
    this.status = Object.freeze({
      title: 'Customer approaching',
      detail: 'Get ready to make the first ice cream order',
    });
    this.targetMarkerId = null;

    this._buildStations();
    this._buildCarryRig();
  }

  _buildStations() {
    this.group.updateMatrixWorld(true);

    this.machines.forEach((machine) => {
      const anchor = findAnchor(machine.model, 'StaffStandPoint');
      if (!anchor) throw new Error(`Missing StaffStandPoint on ${machine.flavor} machine`);
      anchor.getWorldPosition(machine.standPoint);
      const markerId = `machine-${machine.flavor}`;
      const marker = createInteractionMarker(machine.standPoint, machine.color);
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
    const flavor = FLAVOR_SEQUENCE[this.servedCount % FLAVOR_SEQUENCE.length];
    const container = this.servedCount % 2 === 0 ? 'cone' : 'cup';
    this.activeOrder = Object.freeze({ flavor, container });
    this.stage = 'need-container';
    this._setTargetMarker(`station-${container}`);
    this._setStatus(
      `Pick up a ${container}`,
      `Walk to the glowing ${container} dispenser for the ${flavor} order`,
    );
  }

  _triggerMachine(machine, elapsed) {
    machine.preview && (machine.preview.visible = true);
    machine.dispensingUntil = elapsed + 0.82;
    playMachineAction(machine, '_Machine_Dispense');
    playMachineAction(machine, '_Product_Pop');
    playMachineAction(machine, '_Tray_Load');
  }

  _near(playerPosition, point) {
    return squaredDistanceXZ(playerPosition, point) <= INTERACTION_RADIUS * INTERACTION_RADIUS;
  }

  _updateMarkers(elapsed) {
    const marker = this.targetMarkerId ? this.markers.get(this.targetMarkerId) : null;
    if (!marker) return;
    const pulse = 1 + Math.sin(elapsed * 4.4) * 0.08;
    marker.scale.setScalar(pulse);
  }

  update(delta, elapsed) {
    this.machines.forEach((machine) => {
      machine.mixer.update(delta);
      if (machine.preview && machine.preview.visible && elapsed > machine.dispensingUntil) {
        machine.preview.visible = false;
      }
    });
    this._updateMarkers(elapsed);

    const player = this.characterSystem?.player;
    if (!player) return;
    const playerPosition = player.model.position;

    if (this.stage === 'waiting') {
      if (this.servedCount >= this.characterSystem.customers.length) {
        this.stage = 'complete';
        this._setTargetMarker(null);
        this._setStatus('Ice cream rush complete!', `${this.servedCount} customers served successfully`);
        return;
      }

      if (elapsed < this.nextOrderAt) return;
      const frontCustomer = this.characterSystem.customers.find((customer) => customer.state === 'ordering');
      if (frontCustomer) {
        this._startOrder();
      } else {
        this._setTargetMarker(null);
        this._setStatus('Customer approaching', 'The next guest is walking to the order counter');
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
      this.dispenseReadyAt = elapsed + 0.74;
      this._setTargetMarker(null);
      this._setStatus(`Dispensing ${machine.label.toLowerCase()}…`, 'The machine is filling the order tray');
      return;
    }

    if (this.stage === 'dispensing') {
      if (elapsed < this.dispenseReadyAt) return;
      const productName = PRODUCT_NAMES[this.activeOrder.flavor][this.activeOrder.container];
      this._setCarryProduct(productName);
      this.stage = 'need-finish';
      const finishStation = this.activeOrder.container === 'cup' ? 'spoon' : 'topping';
      this._setTargetMarker(`station-${finishStation}`);
      this._setStatus(
        this.activeOrder.container === 'cup' ? 'Add a spoon and wafer' : 'Add the finishing topping',
        `Walk to the glowing ${finishStation === 'spoon' ? 'spoon dispenser' : 'topping station'}`,
      );
      return;
    }

    if (this.stage === 'need-finish') {
      const finishStation = this.activeOrder.container === 'cup' ? 'spoon' : 'topping';
      const stationPoint = this.stationPoints.get(finishStation);
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
      this.serveReadyAt = elapsed + 0.62;
      this._setTargetMarker(null);
      this._setStatus('Order served!', 'The customer is happy and the queue is moving forward');
      return;
    }

    if (this.stage === 'serving' && elapsed >= this.serveReadyAt) {
      const served = this.characterSystem.serveFrontCustomer(elapsed);
      if (!served) return;
      this._clearCarryProduct();
      this.characterSystem.setPlayerCarrying(false);
      this.cash += this.activeOrder.container === 'cup' ? 20 : 15;
      this.servedCount += 1;
      this.activeOrder = null;
      this.stage = 'waiting';
      this.nextOrderAt = elapsed + 0.55;
      this.statusRevision += 1;
    }
  }

  dispose() {
    this.machines.forEach(({ mixer }) => mixer.stopAllAction());
    this.carryRig.removeFromParent();
    disposeObjectResources([this.group, this.carryRig]);
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
