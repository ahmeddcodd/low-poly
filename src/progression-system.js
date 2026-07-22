import * as THREE from 'three';

export const STARTING_CASH = 500;
export const STORY_SERVICE_GOAL = 30;
export const TUTORIAL_COLLECTION_TARGET = 15;

const PAYMENT_RADIUS = 0.95;
const PAYMENT_RATE = 42;
const CASH_PER_FLIGHT = 4;
const CASH_FLIGHT_DURATION = 0.46;
const MAX_CASH_FLIGHTS = 18;

const STORY_CATALOG = Object.freeze([
  Object.freeze({
    id: 'enter-shop',
    type: 'location',
    position: Object.freeze([-2.5, 0.04, 6.15]),
    radius: 1.05,
    title: 'Enter your ice cream shop',
    detail: 'Walk through the opening front doors to begin your business',
  }),
  Object.freeze({
    id: 'starter-counter',
    type: 'purchase',
    unlockType: 'counter',
    cost: 140,
    position: Object.freeze([1.55, 0.04, 0.65]),
    label: 'COUNTER',
    footer: 'CONE + CUP',
    title: 'Build the counter and container machines',
    detail: 'Invest $140 to add the counter plus the cone and cup machines',
  }),
  Object.freeze({
    id: 'vanilla-machine',
    type: 'purchase',
    unlockType: 'flavor',
    unlockId: 'vanilla',
    cost: 100,
    position: Object.freeze([-6.4, 0.04, -3.45]),
    label: 'VANILLA',
    footer: 'FIRST FLAVOUR',
    title: 'Install the vanilla machine',
    detail: 'Invest $100 at the vanilla equipment pad',
  }),
  Object.freeze({
    id: 'strawberry-machine',
    type: 'purchase',
    unlockType: 'flavor',
    unlockId: 'strawberry',
    cost: 100,
    position: Object.freeze([-4, 0.04, -3.45]),
    label: 'STRAWBERRY',
    footer: 'SECOND FLAVOUR',
    title: 'Install the strawberry machine',
    detail: 'Invest $100 to offer a second starter flavour',
  }),
  Object.freeze({
    id: 'starter-seating',
    type: 'purchase',
    unlockType: 'table',
    unlockId: 'compact-table',
    opensCustomers: true,
    cost: 110,
    position: Object.freeze([-4.3, 0.04, 2.55]),
    label: '2 SEATS',
    footer: 'GRAND OPENING',
    title: 'Build the first seating area',
    detail: 'Invest $110 in a table and two chairs to open the shop',
  }),
  Object.freeze({
    id: 'first-sales',
    type: 'served',
    target: 3,
    title: 'Serve the first 3 customers',
    detail: 'Make vanilla and strawberry orders and stack their payments',
  }),
  Object.freeze({
    id: 'first-collection',
    type: 'collected',
    target: 50,
    title: 'Collect the first cash stack',
    detail: 'Walk to the green cash pile on the left side of the counter',
  }),
  Object.freeze({
    id: 'north-seating',
    type: 'purchase',
    unlockType: 'table',
    unlockId: 'dining-set-north',
    cost: 60,
    position: Object.freeze([-6.5, 0.04, 1.35]),
    label: 'MORE SEATS',
    footer: 'DINING UPGRADE',
    title: 'Add another seating area',
    detail: 'Invest $60 so more customers can sit and eat',
  }),
  Object.freeze({
    id: 'steady-sales',
    type: 'served',
    target: 6,
    title: 'Serve 6 customers',
    detail: 'Use the extra seats to build enough cash for HR',
  }),
  Object.freeze({
    id: 'hire-hr',
    type: 'manager',
    managerId: 'gym-manager',
    title: 'Hire HR',
    detail: 'Enter the HR office and fund the $60 hiring pad',
  }),
  Object.freeze({
    id: 'first-worker',
    type: 'upgrade',
    upgradeId: 'workers',
    target: 1,
    title: 'Hire your first worker',
    detail: 'Use the HR cards to assign an employee to the counter',
  }),
  Object.freeze({
    id: 'worker-sales',
    type: 'served',
    target: 9,
    title: 'Keep your first worker serving',
    detail: 'The server now prepares each order while you manage the growing shop',
  }),
  Object.freeze({
    id: 'flavour-fund',
    type: 'served',
    target: 12,
    title: 'Serve 12 customers',
    detail: 'Save enough profit to add a premium flavour',
  }),
  Object.freeze({
    id: 'chocolate-machine',
    type: 'purchase',
    unlockType: 'flavor',
    unlockId: 'chocolate',
    cost: 80,
    position: Object.freeze([-1.6, 0.04, -3.45]),
    label: 'CHOCOLATE',
    footer: 'NEW FLAVOUR',
    title: 'Unlock chocolate ice cream',
    detail: 'Invest $80 to install the chocolate machine',
  }),
  Object.freeze({
    id: 'chocolate-sales',
    type: 'served',
    target: 15,
    title: 'Serve 15 customers',
    detail: 'Sell all three flavours to fund a larger dining room',
  }),
  Object.freeze({
    id: 'center-seating',
    type: 'purchase',
    unlockType: 'table',
    unlockId: 'dining-set-center',
    cost: 50,
    position: Object.freeze([-6.5, 0.04, 5.95]),
    label: 'MORE TABLES',
    footer: 'DINING UPGRADE',
    title: 'Complete the dining area',
    detail: 'Invest $50 to unlock the final customer table',
  }),
  Object.freeze({
    id: 'team-fund',
    type: 'served',
    target: 18,
    title: 'Serve 18 customers',
    detail: 'Use the expanded dining area to fund another employee',
  }),
  Object.freeze({
    id: 'second-worker',
    type: 'upgrade',
    upgradeId: 'workers',
    target: 2,
    title: 'Hire a second worker',
    detail: 'Add a dedicated cleaner who removes leftovers and carries them to the trash',
  }),
  Object.freeze({
    id: 'team-sales',
    type: 'served',
    target: 21,
    title: 'Serve 21 customers',
    detail: 'The server handles orders while the cleaner keeps tables available',
  }),
  Object.freeze({
    id: 'manager-fund',
    type: 'served',
    target: 24,
    title: 'Serve 24 customers',
    detail: 'Build the cash reserve needed for a General Manager',
  }),
  Object.freeze({
    id: 'hire-gm',
    type: 'manager',
    managerId: 'wc-manager',
    title: 'Hire the General Manager',
    detail: 'Enter the GM office and fund the $80 hiring pad',
  }),
  Object.freeze({
    id: 'gm-fund',
    type: 'served',
    target: 28,
    title: 'Serve 28 customers',
    detail: 'Earn enough for the General Manager profit plan',
  }),
  Object.freeze({
    id: 'gm-boost',
    type: 'upgrade',
    upgradeId: 'wc-boost',
    target: 1,
    title: 'Activate 2x shop profit',
    detail: 'Buy Player + profit to double payments and increase player speed',
  }),
  Object.freeze({
    id: 'mint-fund',
    type: 'served',
    target: 31,
    title: 'Serve 31 customers with 2x profit',
    detail: 'Use the faster earnings to fund the final flavour',
  }),
  Object.freeze({
    id: 'mint-machine',
    type: 'purchase',
    unlockType: 'flavor',
    unlockId: 'mint',
    cost: 100,
    position: Object.freeze([0.8, 0.04, -3.45]),
    label: 'MINT',
    footer: 'FINAL FLAVOUR',
    title: 'Unlock mint ice cream',
    detail: 'Invest $100 to complete the four-flavour machine line',
  }),
  Object.freeze({
    id: 'staff-fund',
    type: 'served',
    target: 34,
    title: 'Serve 34 customers',
    detail: 'Run the complete two-worker team through the final flavour rush',
  }),
  Object.freeze({
    id: 'grand-finale',
    type: 'served',
    target: 40,
    title: 'Complete the four-flavour rush',
    detail: 'Serve 40 customers to finish the ice cream shop story',
  }),
]);

const SIMPLE_STORY_IDS = Object.freeze([
  'enter-shop',
  'starter-counter',
  'vanilla-machine',
  'starter-seating',
  'first-sales',
  'first-collection',
  'hire-hr',
  'first-worker',
  'north-seating',
  'chocolate-machine',
  'second-worker',
  'hire-gm',
  'gm-boost',
  'mint-machine',
  'grand-finale',
]);

const SIMPLE_STEP_OVERRIDES = Object.freeze({
  'vanilla-machine': Object.freeze({
    id: 'first-vanilla-machine',
    unlockType: 'machine',
    unlockId: 'vanilla-1',
    cost: 100,
    position: Object.freeze([0.8, 0.04, -3.45]),
    label: 'MACHINE 1',
    footer: 'START PRODUCTION',
    title: 'Install the first ice cream machine',
    detail: 'Invest $100 to begin stocking cup and cone orders',
  }),
  'first-sales': Object.freeze({
    id: 'first-sale',
    target: 1,
    title: 'Serve your first customer',
    detail: 'Prepare the requested amount and stock it on the counter',
  }),
  'first-collection': Object.freeze({
    target: TUTORIAL_COLLECTION_TARGET,
    title: 'Collect your first payment',
    detail: 'Walk to the green cash stack on the left of the counter',
  }),
  'north-seating': Object.freeze({
    id: 'expand-seating',
    unlockIds: Object.freeze(['dining-set-north', 'dining-set-center']),
    cost: 110,
    position: Object.freeze([-6.5, 0.04, 3.75]),
    label: '4 SEATS',
    footer: 'DINING UPGRADE',
    title: 'Expand the dining room',
    detail: 'Invest $110 to add two more customer tables',
  }),
  'chocolate-machine': Object.freeze({
    id: 'second-vanilla-machine',
    unlockType: 'machine',
    unlockId: 'vanilla-2',
    cost: 80,
    position: Object.freeze([-1.6, 0.04, -3.45]),
    label: 'MACHINE 2',
    footer: '2X CAPACITY',
    title: 'Increase ice cream production',
    detail: 'Invest $80 in a second machine for 2x production',
  }),
  'mint-machine': Object.freeze({
    id: 'third-vanilla-machine',
    unlockType: 'machine',
    unlockId: 'vanilla-3',
    cost: 100,
    position: Object.freeze([-4, 0.04, -3.45]),
    label: 'MACHINE 3',
    footer: '3X CAPACITY',
    title: 'Maximise ice cream production',
    detail: 'Invest $100 in a third machine for 3x production',
  }),
  'grand-finale': Object.freeze({
    target: STORY_SERVICE_GOAL,
    title: `Serve ${STORY_SERVICE_GOAL} customers`,
    detail: 'Run all three machines and both customer lines to finish the story',
  }),
});

export const STORY_STEPS = Object.freeze(SIMPLE_STORY_IDS.map((id) => {
  const baseStep = STORY_CATALOG.find((step) => step.id === id);
  if (!baseStep) throw new Error(`Missing story step: ${id}`);
  return Object.freeze({ ...baseStep, ...(SIMPLE_STEP_OVERRIDES[id] || {}) });
}));

function roundedRect(context, x, y, width, height, radius) {
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

function drawCashNote(context, x, y) {
  roundedRect(context, x, y, 132, 70, 11);
  context.fillStyle = '#55e83a';
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = '#1f9c25';
  context.stroke();
  context.fillStyle = '#d7ff79';
  context.fillRect(x + 46, y + 15, 40, 40);
}

function createPadLabel(step) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const redraw = (remaining) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.font = '900 ' + (step.label.length > 10 ? 38 : 48) + 'px Arial, sans-serif';
    context.fillText(step.label, 256, 108);
    drawCashNote(context, 74, 181);
    context.font = '900 86px Arial, sans-serif';
    context.fillText(String(remaining), 344, 217);
    context.fillStyle = '#d8e2d1';
    context.font = '800 29px Arial, sans-serif';
    context.fillText(step.footer || 'SHOP UPGRADE', 256, 348);
    texture.needsUpdate = true;
  };
  redraw(step.cost);
  return { texture, redraw };
}

function createUnlockPad(step) {
  const group = new THREE.Group();
  group.name = 'Story_Unlock_Pad_' + step.id;
  group.position.set(...step.position);
  group.visible = false;

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.06, 1.06, 0.11, 8),
    new THREE.MeshStandardMaterial({ color: 0xf7fff0, roughness: 0.74 }),
  );
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 0.92, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0x4d594c, roughness: 0.82 }),
  );
  rim.rotation.y = Math.PI / 8;
  base.rotation.y = Math.PI / 8;
  base.position.y = 0.07;

  const label = createPadLabel(step);
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(1.62, 1.62),
    new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.165;
  top.renderOrder = 6;
  const labelPivot = new THREE.Group();
  labelPivot.rotation.y = -Math.PI * 0.75;
  labelPivot.add(top);
  group.add(rim, base, labelPivot);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return { group, label, paid: 0, paymentBudget: 0, cashVisualBudget: 0 };
}

function createWaypointMarker(step) {
  const group = new THREE.Group();
  group.name = 'Story_Waypoint_' + step.id;
  group.position.set(...step.position);
  group.visible = false;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 32),
    new THREE.MeshBasicMaterial({
      color: 0x4def45,
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.91, 32),
    new THREE.MeshBasicMaterial({
      color: 0x9dff6f,
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

  const arrow = new THREE.Group();
  const arrowMaterial = new THREE.MeshBasicMaterial({
    color: 0x37e72f,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 4), arrowMaterial);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.2), arrowMaterial);
  tip.rotation.z = Math.PI;
  stem.position.y = 0.42;
  tip.renderOrder = 42;
  stem.renderOrder = 42;
  arrow.position.y = 1.5;
  arrow.userData.baseY = arrow.position.y;
  arrow.add(tip, stem);
  group.userData.arrow = arrow;
  group.add(disc, ring, arrow);
  return group;
}

function createFlyingCash() {
  const group = new THREE.Group();
  group.visible = false;
  const bill = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.035, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x50e531, roughness: 0.68 }),
  );
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.042, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xd5ff78, roughness: 0.72 }),
  );
  accent.position.y = 0.006;
  group.add(bill, accent);
  group.userData.active = false;
  group.userData.start = new THREE.Vector3();
  group.userData.end = new THREE.Vector3();
  return group;
}

function squaredDistanceXZ(position, target) {
  const deltaX = position.x - target[0];
  const deltaZ = position.z - target[2];
  return deltaX * deltaX + deltaZ * deltaZ;
}

function disposeRoot(root) {
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

export class ShopProgressionSystem {
  constructor(iceCreamShop, productionSystem, characterSystem) {
    this.iceCreamShop = iceCreamShop;
    this.productionSystem = productionSystem;
    this.characterSystem = characterSystem;
    this.hiringSystem = productionSystem.hiringSystem;
    this.group = new THREE.Group();
    this.group.name = 'Ice_Cream_Shop_Story_Progression';
    this.stageIndex = 0;
    this.revision = 0;
    this.lastElapsed = 0;
    this.lastGuidedStepId = null;
    this.customersOpen = false;
    this.reveals = [];
    this.pads = new Map();
    this.waypoints = new Map();
    this.cashFlights = [];

    STORY_STEPS.filter(({ type }) => type === 'purchase').forEach((step) => {
      const pad = createUnlockPad(step);
      this.pads.set(step.id, pad);
      this.group.add(pad.group);
    });
    STORY_STEPS.filter(({ type }) => type === 'location').forEach((step) => {
      const waypoint = createWaypointMarker(step);
      this.waypoints.set(step.id, waypoint);
      this.group.add(waypoint);
    });
    for (let index = 0; index < MAX_CASH_FLIGHTS; index += 1) {
      const flight = createFlyingCash();
      this.cashFlights.push(flight);
      this.group.add(flight);
    }

    this.iceCreamShop.setCounterUnlocked(false);
    this.iceCreamShop.setUnlockedDiningTables([]);
    this.characterSystem.setUnlockedDiningTables([]);
    this.characterSystem.setCustomerFlowEnabled(false);
    this.productionSystem.setSupportStationsVisible(false);
    this.productionSystem.setUnlockedMachines([]);
    this.hiringSystem.setHiringAvailable('gym-manager', false);
    this.hiringSystem.setHiringAvailable('wc-manager', false);
    this._syncActiveStep(true);
  }

  get activeStep() {
    return STORY_STEPS[this.stageIndex] || null;
  }

  get complete() {
    return this.stageIndex >= STORY_STEPS.length;
  }

  get nextTitle() {
    return this.activeStep ? this.activeStep.title : 'Ice cream shop mastered!';
  }

  get nextDetail() {
    return this.activeStep
      ? this.activeStep.detail
      : 'Three ice cream machines, cone and cup stations, seating, staff, HR and GM are active';
  }

  get progressPercent() {
    if (this.complete) return 100;
    return Math.round(((this.stageIndex + this._activeStepProgress()) / STORY_STEPS.length) * 100);
  }

  get unlockedMachines() {
    return this.productionSystem.unlockedMachineIds;
  }

  get unlockedTables() {
    return this.characterSystem.unlockedDiningTableIds;
  }

  get blocksOrders() {
    return !this.customersOpen;
  }

  _upgradeLevel(id) {
    if (id === 'workers') return this.hiringSystem.workerCount;
    if (id === 'worker-speed') return this.hiringSystem.workerSpeedLevel;
    return this.hiringSystem.upgrades.wcBoost;
  }


  _isStepComplete(step, playerPosition) {
    if (step.type === 'location') {
      return Boolean(playerPosition)
        && squaredDistanceXZ(playerPosition, step.position) <= step.radius * step.radius;
    }
    if (step.type === 'served') return this.productionSystem.servedCount >= step.target;
    if (step.type === 'collected') return this.productionSystem.totalCollectedCash >= step.target;
    if (step.type === 'purchase') return (this.pads.get(step.id)?.paid || 0) >= step.cost;
    if (step.type === 'manager') {
      return this.hiringSystem.pads.some(({ definition, hired }) => (
        definition.id === step.managerId && hired
      ));
    }
    if (step.type === 'upgrade') return this._upgradeLevel(step.upgradeId) >= step.target;
    return false;
  }

  _previousTarget(step) {
    return STORY_STEPS.slice(0, this.stageIndex).reduce((highest, candidate) => {
      if (candidate.type !== step.type) return highest;
      if (step.type === 'upgrade' && candidate.upgradeId !== step.upgradeId) return highest;
      return Math.max(highest, candidate.target || 0);
    }, 0);
  }

  _activeStepProgress() {
    const step = this.activeStep;
    if (!step) return 1;
    if (step.type === 'location') return 0;
    if (step.type === 'served') {
      const previousTarget = this._previousTarget(step);
      return THREE.MathUtils.clamp(
        (this.productionSystem.servedCount - previousTarget) / (step.target - previousTarget),
        0,
        1,
      );
    }
    if (step.type === 'collected') {
      return THREE.MathUtils.clamp(this.productionSystem.totalCollectedCash / step.target, 0, 1);
    }
    if (step.type === 'purchase') {
      return THREE.MathUtils.clamp((this.pads.get(step.id)?.paid || 0) / step.cost, 0, 1);
    }
    if (step.type === 'manager') {
      const manager = this.hiringSystem.pads.find(({ definition }) => definition.id === step.managerId);
      return manager ? THREE.MathUtils.clamp(manager.paid / manager.definition.cost, 0, 1) : 0;
    }
    if (step.type === 'upgrade') {
      const previousTarget = this._previousTarget(step);
      return THREE.MathUtils.clamp(
        (this._upgradeLevel(step.upgradeId) - previousTarget) / (step.target - previousTarget),
        0,
        1,
      );
    }
    return 0;
  }

  _queueReveal(objects, elapsed) {
    objects.filter(Boolean).forEach((object) => {
      const finalScale = object.scale.clone();
      object.scale.setScalar(0.001);
      object.visible = true;
      this.reveals.push({ object, finalScale, startedAt: elapsed });
    });
  }

  _completePurchase(step, elapsed) {
    let furniture = [];
    const unlockIds = step.unlockIds
      ? [...step.unlockIds]
      : (step.unlockId ? [step.unlockId] : []);
    if (step.unlockType === 'counter') {
      furniture = this.iceCreamShop.unlockCounter();
      this.productionSystem.setSupportStationsVisible(true);
      furniture.push(...this.productionSystem.supports.map(({ model }) => model));
    } else if (step.unlockType === 'table') {
      unlockIds.forEach((unlockId) => {
        furniture.push(...this.iceCreamShop.unlockDiningTable(unlockId));
        this.characterSystem.unlockDiningTable(unlockId);
      });
    } else if (step.unlockType === 'machine') {
      unlockIds.forEach((unlockId) => {
        const machine = this.productionSystem.unlockMachine(unlockId);
        if (machine) furniture.push(machine);
      });
    }
    this._queueReveal(furniture, elapsed);

    if (step.opensCustomers && !this.customersOpen) {
      this.customersOpen = true;
      this.characterSystem.setCustomerFlowEnabled(true, elapsed);
    }

    this.characterSystem.resolvePlayerCollisionOverlap();
    this.characterSystem.playPlayerAction('Celebrate', 0.7);
  }

  _advanceCompletedSteps(elapsed, playerPosition) {
    let advanced = false;
    while (this.activeStep && this._isStepComplete(this.activeStep, playerPosition)) {
      const completedStep = this.activeStep;
      if (completedStep.type === 'purchase') this._completePurchase(completedStep, elapsed);
      if (completedStep.type === 'location') {
        this.characterSystem.playPlayerAction('Celebrate', 0.55);
      }
      this.stageIndex += 1;
      this.revision += 1;
      advanced = true;
    }

    if (advanced && this.complete) {
      this.productionSystem.setStatus(
        'Ice cream shop story complete!',
        'The full shop, three machines, expanded seating, HR, GM, and the two-worker team are active',
      );
    }
  }

  _syncActiveStep(force = false) {
    const step = this.activeStep;
    this.pads.forEach((pad, id) => {
      pad.group.visible = step && step.id === id;
    });
    this.waypoints.forEach((waypoint, id) => {
      waypoint.visible = step && step.id === id;
    });
    this.hiringSystem.setHiringAvailable(
      'gym-manager',
      Boolean(step && step.managerId === 'gym-manager'),
    );
    this.hiringSystem.setHiringAvailable(
      'wc-manager',
      Boolean(step && step.managerId === 'wc-manager'),
    );

    const nextStepId = step ? step.id : 'complete';
    if (!force && this.lastGuidedStepId === nextStepId) return;
    this.lastGuidedStepId = nextStepId;
    if (step) this.productionSystem.setStatus(step.title, step.detail);
  }

  _spawnCashFlight(playerPosition, step, elapsed) {
    const flight = this.cashFlights.find(({ userData }) => !userData.active);
    if (!flight) return;
    flight.userData.start.set(playerPosition.x + 0.18, playerPosition.y + 1.05, playerPosition.z);
    flight.userData.end.set(step.position[0], step.position[1] + 0.25, step.position[2]);
    flight.position.copy(flight.userData.start);
    flight.userData.startedAt = elapsed;
    flight.userData.active = true;
    flight.visible = true;
  }

  _updateCashFlights(elapsed) {
    this.cashFlights.forEach((flight) => {
      if (!flight.userData.active) return;
      const progress = THREE.MathUtils.clamp(
        (elapsed - flight.userData.startedAt) / CASH_FLIGHT_DURATION,
        0,
        1,
      );
      const eased = 1 - (1 - progress) ** 3;
      flight.position.lerpVectors(flight.userData.start, flight.userData.end, eased);
      flight.position.y += Math.sin(progress * Math.PI) * 0.75;
      flight.rotation.y += 0.18;
      if (progress < 1) return;
      flight.visible = false;
      flight.userData.active = false;
    });
  }

  _updateReveals(elapsed) {
    this.reveals = this.reveals.filter((reveal) => {
      const progress = THREE.MathUtils.clamp((elapsed - reveal.startedAt) / 0.55, 0, 1);
      const overshoot = 1 + Math.sin(progress * Math.PI) * 0.16;
      reveal.object.scale.copy(reveal.finalScale).multiplyScalar(progress * overshoot);
      return progress < 1;
    });
  }

  _payActivePad(delta, elapsed, playerPosition) {
    const step = this.activeStep;
    if (!step || step.type !== 'purchase') return;
    const pad = this.pads.get(step.id);
    if (!pad || squaredDistanceXZ(playerPosition, step.position) > PAYMENT_RADIUS * PAYMENT_RADIUS) {
      if (pad) pad.paymentBudget = 0;
      return;
    }
    if (this.productionSystem.cash <= 0) return;
    pad.paymentBudget += delta * PAYMENT_RATE;
    const requested = Math.min(Math.floor(pad.paymentBudget), step.cost - pad.paid);
    if (requested <= 0) return;
    const spent = this.productionSystem.spendCash(requested);
    if (spent <= 0) return;
    pad.paymentBudget -= spent;
    pad.paid += spent;
    pad.cashVisualBudget += spent;
    while (pad.cashVisualBudget >= CASH_PER_FLIGHT) {
      pad.cashVisualBudget -= CASH_PER_FLIGHT;
      this._spawnCashFlight(playerPosition, step, elapsed);
    }
    pad.label.redraw(Math.max(0, step.cost - pad.paid));
    this.revision += 1;
  }

  _updateWaypoint(elapsed) {
    const step = this.activeStep;
    if (!step || step.type !== 'location') return;
    const waypoint = this.waypoints.get(step.id);
    if (!waypoint || !waypoint.visible) return;
    waypoint.scale.setScalar(1 + Math.sin(elapsed * 4.4) * 0.06);
    const arrow = waypoint.userData.arrow;
    arrow.position.y = arrow.userData.baseY + Math.sin(elapsed * 5.2) * 0.12;
    arrow.rotation.y = elapsed * 1.35;
  }

  update(delta, elapsed, playerPosition) {
    this.lastElapsed = elapsed;
    this._updateCashFlights(elapsed);
    this._updateReveals(elapsed);
    this._advanceCompletedSteps(elapsed, playerPosition);
    this._syncActiveStep();
    this._payActivePad(delta, elapsed, playerPosition);
    this._advanceCompletedSteps(elapsed, playerPosition);
    this._syncActiveStep();
    this._updateWaypoint(elapsed);

    const pad = this.activeStep && this.activeStep.type === 'purchase'
      ? this.pads.get(this.activeStep.id)
      : null;
    if (pad && pad.group.visible) {
      const pulse = 1 + Math.sin(elapsed * 4.4) * 0.04;
      pad.group.scale.setScalar(pulse);
    }
  }

  dispose() {
    disposeRoot(this.group);
    this.group.removeFromParent();
  }
}

export const STORY_STEP_COUNT = STORY_STEPS.length;
