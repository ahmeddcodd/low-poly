import * as THREE from 'three';

const STARTING_FLAVORS = Object.freeze(['vanilla', 'strawberry']);
const STARTING_TABLES = Object.freeze(['compact-table']);
const PAYMENT_RADIUS = 0.95;
const PAYMENT_RATE = 36;
const CASH_PER_FLIGHT = 4;
const CASH_FLIGHT_DURATION = 0.46;
const MAX_CASH_FLIGHTS = 16;

const STORY_STEPS = Object.freeze([
  Object.freeze({
    id: 'starter-sales',
    type: 'served',
    target: 2,
    title: 'Serve 2 starter orders',
    detail: 'Build your first cash stack with vanilla and strawberry sales',
  }),
  Object.freeze({
    id: 'north-seating',
    type: 'purchase',
    unlockType: 'table',
    unlockId: 'dining-set-north',
    cost: 20,
    position: Object.freeze([-6.5, 0.04, 2.45]),
    label: 'MORE SEATS',
    title: 'Unlock another seating area',
    detail: 'Stand on the dining expansion pad and invest $20',
  }),
  Object.freeze({
    id: 'hire-hr',
    type: 'manager',
    managerId: 'gym-manager',
    title: 'Hire HR',
    detail: 'Save $60, then stand on the cash pad inside the HR office',
  }),
  Object.freeze({
    id: 'first-worker',
    type: 'upgrade',
    upgradeId: 'workers',
    target: 1,
    title: 'Hire your first worker',
    detail: 'Enter the HR office and buy More workers',
  }),
  Object.freeze({
    id: 'worker-speed',
    type: 'upgrade',
    upgradeId: 'worker-speed',
    target: 1,
    title: 'Train the ice cream team',
    detail: 'Buy one Worker speed upgrade in the HR office',
  }),
  Object.freeze({
    id: 'chocolate-machine',
    type: 'purchase',
    unlockType: 'flavor',
    unlockId: 'chocolate',
    cost: 30,
    position: Object.freeze([-1.6, 0.04, -4.72]),
    label: 'CHOCOLATE',
    title: 'Unlock chocolate ice cream',
    detail: 'Invest $30 at the chocolate machine pad to add a new flavour',
  }),
  Object.freeze({
    id: 'center-seating',
    type: 'purchase',
    unlockType: 'table',
    unlockId: 'dining-set-center',
    cost: 35,
    position: Object.freeze([-6.5, 0.04, 5]),
    label: 'MORE TABLES',
    title: 'Expand customer seating',
    detail: 'Invest $35 at the final dining expansion pad',
  }),
  Object.freeze({
    id: 'hire-gm',
    type: 'manager',
    managerId: 'wc-manager',
    title: 'Hire the General Manager',
    detail: 'Save $80, then fund the pad inside the GM office',
  }),
  Object.freeze({
    id: 'gm-boost',
    type: 'upgrade',
    upgradeId: 'wc-boost',
    target: 1,
    title: 'Boost player speed and profit',
    detail: 'Enter the GM office and purchase the 2x profit upgrade',
  }),
  Object.freeze({
    id: 'mint-machine',
    type: 'purchase',
    unlockType: 'flavor',
    unlockId: 'mint',
    cost: 50,
    position: Object.freeze([0.8, 0.04, -4.72]),
    label: 'MINT',
    title: 'Unlock the final mint machine',
    detail: 'Invest $50 to complete the four-flavour ice cream shop',
  }),
]);

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
    context.font = `900 ${step.label.length > 10 ? 38 : 48}px Arial, sans-serif`;
    context.fillText(step.label, 256, 108);
    drawCashNote(context, 74, 181);
    context.font = '900 86px Arial, sans-serif';
    context.fillText(String(remaining), 344, 217);
    context.fillStyle = '#d8e2d1';
    context.font = '800 29px Arial, sans-serif';
    context.fillText('SHOP EXPANSION', 256, 348);
    texture.needsUpdate = true;
  };
  redraw(step.cost);
  return { texture, redraw };
}

function createUnlockPad(step) {
  const group = new THREE.Group();
  group.name = `Story_Unlock_Pad_${step.id}`;
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
    this.reveals = [];
    this.pads = new Map();
    this.cashFlights = [];

    STORY_STEPS.filter(({ type }) => type === 'purchase').forEach((step) => {
      const pad = createUnlockPad(step);
      this.pads.set(step.id, pad);
      this.group.add(pad.group);
    });
    for (let index = 0; index < MAX_CASH_FLIGHTS; index += 1) {
      const flight = createFlyingCash();
      this.cashFlights.push(flight);
      this.group.add(flight);
    }

    this.iceCreamShop.setUnlockedDiningTables(STARTING_TABLES);
    this.characterSystem.setUnlockedDiningTables(STARTING_TABLES);
    this.productionSystem.setUnlockedFlavors(STARTING_FLAVORS);
    this.hiringSystem.setHiringAvailable('gym-manager', false);
    this.hiringSystem.setHiringAvailable('wc-manager', false);
    this._advanceCompletedSteps(0);
    this._syncActiveStep();
  }

  get activeStep() {
    return STORY_STEPS[this.stageIndex] ?? null;
  }

  get complete() {
    return this.stageIndex >= STORY_STEPS.length;
  }

  get nextTitle() {
    return this.activeStep?.title ?? 'Ice cream shop mastered!';
  }

  get nextDetail() {
    return this.activeStep?.detail ?? 'Four flavours, expanded seating, trained staff, HR and GM are all active';
  }

  get progressPercent() {
    if (this.complete) return 100;
    return Math.round(((this.stageIndex + this._activeStepProgress()) / STORY_STEPS.length) * 100);
  }

  get unlockedFlavors() {
    return this.productionSystem.unlockedFlavorIds;
  }

  get unlockedTables() {
    return this.characterSystem.unlockedDiningTableIds;
  }

  _upgradeLevel(id) {
    if (id === 'workers') return this.hiringSystem.workerCount;
    if (id === 'worker-speed') return this.hiringSystem.workerSpeedLevel;
    return this.hiringSystem.upgrades.wcBoost;
  }

  _isStepComplete(step) {
    if (step.type === 'served') return this.productionSystem.servedCount >= step.target;
    if (step.type === 'purchase') return (this.pads.get(step.id)?.paid ?? 0) >= step.cost;
    if (step.type === 'manager') {
      return this.hiringSystem.pads.some(({ definition, hired }) => (
        definition.id === step.managerId && hired
      ));
    }
    if (step.type === 'upgrade') return this._upgradeLevel(step.upgradeId) >= step.target;
    return false;
  }

  _activeStepProgress() {
    const step = this.activeStep;
    if (!step) return 1;
    if (step.type === 'served') {
      return THREE.MathUtils.clamp(this.productionSystem.servedCount / step.target, 0, 1);
    }
    if (step.type === 'purchase') {
      return THREE.MathUtils.clamp((this.pads.get(step.id)?.paid ?? 0) / step.cost, 0, 1);
    }
    if (step.type === 'manager') {
      const manager = this.hiringSystem.pads.find(({ definition }) => definition.id === step.managerId);
      return manager ? THREE.MathUtils.clamp(manager.paid / manager.definition.cost, 0, 1) : 0;
    }
    if (step.type === 'upgrade') {
      return THREE.MathUtils.clamp(this._upgradeLevel(step.upgradeId) / step.target, 0, 1);
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
    if (step.unlockType === 'table') {
      const furniture = this.iceCreamShop.unlockDiningTable(step.unlockId);
      this.characterSystem.unlockDiningTable(step.unlockId);
      this._queueReveal(furniture, elapsed);
    } else if (step.unlockType === 'flavor') {
      const machine = this.productionSystem.unlockFlavor(step.unlockId);
      this._queueReveal(machine ? [machine] : [], elapsed);
    }
    this.characterSystem.resolvePlayerCollisionOverlap();
    this.characterSystem.playPlayerAction('Celebrate', 0.7);
  }

  _advanceCompletedSteps(elapsed) {
    let advanced = false;
    while (this.activeStep && this._isStepComplete(this.activeStep)) {
      const completedStep = this.activeStep;
      if (completedStep.type === 'purchase') this._completePurchase(completedStep, elapsed);
      this.stageIndex += 1;
      this.revision += 1;
      advanced = true;
    }
    if (advanced && this.complete) {
      this.productionSystem.setStatus(
        'Ice cream shop story complete!',
        'All four flavours, three dining areas, HR, GM and trained workers are active',
      );
    }
  }

  _syncActiveStep() {
    const step = this.activeStep;
    this.pads.forEach((pad, id) => {
      pad.group.visible = step?.id === id;
    });
    this.hiringSystem.setHiringAvailable('gym-manager', step?.managerId === 'gym-manager');
    this.hiringSystem.setHiringAvailable('wc-manager', step?.managerId === 'wc-manager');
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
    if (step?.type !== 'purchase') return;
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

  update(delta, elapsed, playerPosition) {
    this.lastElapsed = elapsed;
    this._updateCashFlights(elapsed);
    this._updateReveals(elapsed);
    this._advanceCompletedSteps(elapsed);
    this._syncActiveStep();
    this._payActivePad(delta, elapsed, playerPosition);
    this._advanceCompletedSteps(elapsed);
    this._syncActiveStep();

    const pad = this.activeStep?.type === 'purchase' ? this.pads.get(this.activeStep.id) : null;
    if (pad?.group.visible) {
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
