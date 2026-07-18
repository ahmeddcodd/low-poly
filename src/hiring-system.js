import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { WORLD_CONFIG } from './config.js';

import { WorkerAutomationSystem } from './worker-automation-system.js';
const GLASSES_CHARACTER_ID = 'elderly-male';
const PAYMENT_RATE = 34;
const PAYMENT_RADIUS = 0.9;
const CASH_PER_FLIGHT = 4;
const FLIGHT_DURATION = 0.48;
const MAX_CASH_FLIGHTS = 18;
const MAX_WORKER_LEVEL = 4;
const BASE_WORKER_SPEED = 1.45;

const UPGRADE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'workers',
    managerId: 'gym-manager',
    title: 'Hire more workers',
    detail: 'Adds another active ice cream worker',
    maxLevel: MAX_WORKER_LEVEL,
    costs: Object.freeze([30, 45, 65, 90]),
  }),
  Object.freeze({
    id: 'worker-speed',
    managerId: 'gym-manager',
    title: 'Worker speed',
    detail: 'Makes every hired worker move and work faster',
    maxLevel: MAX_WORKER_LEVEL,
    costs: Object.freeze([25, 40, 60, 85]),
  }),
  Object.freeze({
    id: 'wc-boost',
    managerId: 'wc-manager',
    title: 'Player + profit',
    detail: 'Boosts player speed and doubles every payment',
    maxLevel: 1,
    costs: Object.freeze([60]),
  }),
]);

const WORKER_ROUTES = Object.freeze([
  Object.freeze([Object.freeze([-6.35, -3.15]), Object.freeze([-2.2, -3.15]), Object.freeze([1.25, -2.2])]),
  Object.freeze([Object.freeze([-4.05, -3.75]), Object.freeze([0.55, -3.65]), Object.freeze([2.8, -2.45])]),
  Object.freeze([Object.freeze([-7.1, -1.25]), Object.freeze([-4.5, -2.35]), Object.freeze([-1.25, -2.25])]),
  Object.freeze([Object.freeze([2.75, -4.75]), Object.freeze([0.7, -3.2]), Object.freeze([-3.5, -3.2])]),
]);

function targetRotation(deltaX, deltaZ) {
  return Math.atan2(deltaX, deltaZ);
}

const HIRE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'gym-manager',
    roomLabel: 'HR OFFICE',
    hireLabel: 'HIRE HR',
    title: 'HR manager',
    cost: 60,
    padPosition: Object.freeze([13.7, 0.04, -3]),
    chairPosition: Object.freeze([15.3, 0.02, -3]),
    chairColor: 0xf0a48d,
    roomBounds: Object.freeze({ minX: 11.05, maxX: 16.8, minZ: -5.65, maxZ: -0.45 }),
  }),
  Object.freeze({
    id: 'wc-manager',
    roomLabel: 'GENERAL OFFICE',
    hireLabel: 'HIRE GENERAL MANAGER',
    title: 'General manager',
    cost: 80,
    padPosition: Object.freeze([13.7, 0.04, 3]),
    chairPosition: Object.freeze([15.3, 0.02, 3]),
    chairColor: 0x8bd7c5,
    roomBounds: Object.freeze({ minX: 11.05, maxX: 16.8, minZ: 0.45, maxZ: 5.65 }),
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

function drawCashNote(context, x, y, width, height) {
  roundedRect(context, x, y, width, height, 13);
  context.fillStyle = '#50e531';
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = '#1f9f1f';
  context.stroke();
  context.fillStyle = '#cfff74';
  context.fillRect(x + width * 0.34, y + height * 0.22, width * 0.32, height * 0.56);
  context.fillRect(x + width * 0.08, y + height * 0.12, width * 0.14, height * 0.22);
  context.fillRect(x + width * 0.78, y + height * 0.66, width * 0.14, height * 0.22);
}

function createPadLabel(definition) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const redraw = (remaining, hired = false) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = hired ? '#a9ff83' : '#ffffff';
    const heading = hired ? 'HIRED' : definition.hireLabel;
    const headingSize = heading.length > 12 ? 34 : 49;
    context.font = `900 ${headingSize}px Arial, sans-serif`;
    context.fillText(heading, 256, 105);
    if (!hired) drawCashNote(context, 78, 184, 150, 82);
    context.fillStyle = '#ffffff';
    context.font = '900 88px Arial, sans-serif';
    context.fillText(hired ? '✓' : String(remaining), hired ? 256 : 341, 226);
    context.fillStyle = hired ? '#d8ffd0' : '#cfd5c9';
    context.font = '800 34px Arial, sans-serif';
    context.fillText(definition.roomLabel, 256, 345);
    texture.needsUpdate = true;
  };
  redraw(definition.cost);
  return { texture, redraw };
}

function createHirePad(definition) {
  const group = new THREE.Group();
  group.name = `Hire_Pad_${definition.id}`;
  group.position.set(...definition.padPosition);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.04, 1.04, 0.12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf8fff1, roughness: 0.72 }),
  );
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.91, 0.91, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0x555a50, roughness: 0.82 }),
  );
  rim.rotation.y = Math.PI / 8;
  base.rotation.y = Math.PI / 8;
  base.position.y = 0.07;
  rim.receiveShadow = true;
  base.castShadow = true;
  base.receiveShadow = true;

  const label = createPadLabel(definition);
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(1.58, 1.58),
    new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false }),
  );
  top.name = `Hire_Pad_Label_${definition.id}`;
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.165;
  top.renderOrder = 5;
  const labelPivot = new THREE.Group();
  labelPivot.rotation.y = -Math.PI * 0.75;
  labelPivot.add(top);
  group.add(rim, base, labelPivot);
  return { group, label };
}

function createChair(definition) {
  const group = new THREE.Group();
  group.name = `Manager_Chair_${definition.id}`;
  group.position.set(...definition.chairPosition);
  group.rotation.y = -Math.PI / 2;

  const seatMaterial = new THREE.MeshStandardMaterial({
    color: definition.chairColor,
    roughness: 0.8,
  });
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x567a70, roughness: 0.67 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.42), seatMaterial);
  seat.position.set(0, 0.41, -0.16);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.74, 0.12), seatMaterial);
  back.position.set(0, 0.78, -0.43);

  const legGeometry = new THREE.BoxGeometry(0.12, 0.41, 0.12);
  [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0], [0.3, 0]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(x, 0.205, z);
    group.add(leg);
  });
  group.add(seat, back);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return group;
}

function createManager(sourceCharacter, definition) {
  const rig = new THREE.Group();
  rig.name = `Hired_Employee_${definition.id}`;
  rig.position.set(definition.chairPosition[0], 0, definition.chairPosition[2]);
  rig.rotation.y = -Math.PI / 2;
  rig.visible = false;
  rig.scale.setScalar(0.001);

  const model = cloneSkeleton(sourceCharacter.model);
  model.name = `Employee_Glasses_${definition.id}`;
  // The Sit clip moves the hips 0.4 m backward. This forward offset keeps the
  // final seated body in front of the chair back instead of inside it.
  model.position.set(0, sourceCharacter.model.position.y, 0.18);
  model.rotation.set(0, 0, 0);
  model.visible = true;
  model.userData.characterId = definition.id;
  model.userData.characterRole = 'employee';
  rig.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const clip = sourceCharacter.animations.find(({ name }) => name === 'Sit');
  const action = clip ? mixer.clipAction(clip) : null;
  if (action) {
    // Sit is a stand-to-sit transition, not an idle loop. Hold its final pose
    // so the employee remains seated instead of repeatedly sliding backward.
    action.reset();
    action.enabled = true;
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.play();
    mixer.setTime(Math.max(clip.duration - 1 / 30, 0));
    action.paused = true;
  }
  return { rig, model, mixer, action };
}

function createAutomatedWorker(sourceCharacter, route, index) {
  const model = cloneSkeleton(sourceCharacter.model);
  model.name = `Hired_IceCream_Worker_${index + 1}`;
  model.getObjectByName('Worker_IceCream_Tray')?.removeFromParent();
  model.position.set(route[0][0], sourceCharacter.model.position.y, route[0][1]);
  model.rotation.set(0, targetRotation(route[1][0] - route[0][0], route[1][1] - route[0][1]), 0);
  model.visible = false;
  model.userData.characterId = `hired-worker-${index + 1}`;
  model.userData.characterRole = 'employee';

  const mixer = new THREE.AnimationMixer(model);
  const walkClip = sourceCharacter.animations.find(({ name }) => name === 'Walk_Player');
  const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  if (walkAction) {
    walkAction.reset();
    walkAction.enabled = true;
    walkAction.setLoop(THREE.LoopRepeat, Infinity);
    walkAction.play();
  }
  return {
    model,
    mixer,
    walkAction,
    route,
    routeIndex: 1,
  };
}

function pointInsideBounds(position, bounds) {
  return position.x >= bounds.minX && position.x <= bounds.maxX
    && position.z >= bounds.minZ && position.z <= bounds.maxZ;
}

function upgradeLevel(upgrades, id) {
  if (id === 'workers') return upgrades.workers;
  if (id === 'worker-speed') return upgrades.workerSpeed;
  return upgrades.wcBoost;
}

function setUpgradeLevel(upgrades, id, level) {
  if (id === 'workers') upgrades.workers = level;
  else if (id === 'worker-speed') upgrades.workerSpeed = level;
  else upgrades.wcBoost = level;
}

function createFlyingCash() {
  const group = new THREE.Group();
  group.visible = false;
  const bill = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.035, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x50e531, roughness: 0.68 }),
  );
  const center = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.042, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xd5ff78, roughness: 0.72 }),
  );
  center.position.y = 0.006;
  bill.castShadow = true;
  group.add(bill, center);
  group.userData.active = false;
  group.userData.start = new THREE.Vector3();
  group.userData.end = new THREE.Vector3();
  return group;
}

function chairCollider(definition) {
  const padding = WORLD_CONFIG.playerCollisionRadius;
  const [x, , z] = definition.chairPosition;
  return Object.freeze({
    name: `Manager_Chair_Collider_${definition.id}`,
    hiringAssetId: definition.id,
    minX: x - 0.48 - padding,
    maxX: x + 0.48 + padding,
    minZ: z - 0.48 - padding,
    maxZ: z + 0.48 + padding,
  });
}

function distanceSquaredXZ(position, target) {
  const x = position.x - target[0];
  const z = position.z - target[2];
  return x * x + z * z;
}

function disposeProcedural(root) {
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

export class HiringSystem {
  constructor(characterSystem, productionSystem) {
    this.characterSystem = characterSystem;
    this.productionSystem = productionSystem;
    this.group = new THREE.Group();
    this.group.name = 'Employee_Hiring_System';
    this.cashFlights = [];
    this.lastCompletedPad = null;
    this.completionMessageUntil = 0;
    this.upgrades = { workers: 0, workerSpeed: 0, wcBoost: 0 };
    this.upgradeRoomId = null;
    this.upgradeRevision = 0;
    this.upgradeMessage = null;
    this.upgradeMessageUntil = 0;
    this.lastElapsed = 0;

    const glassesCharacter = characterSystem.characters.find(
      ({ definition }) => definition.id === GLASSES_CHARACTER_ID,
    );
    if (!glassesCharacter) throw new Error('The glasses-wearing employee source is missing');
    const playerCharacter = characterSystem.player;
    if (!playerCharacter) throw new Error('The player worker source is missing');

    this.pads = HIRE_DEFINITIONS.map((definition) => {
      const pad = createHirePad(definition);
      const chair = createChair(definition);
      const employee = createManager(glassesCharacter, definition);
      this.group.add(pad.group, chair, employee.rig);
      return {
        definition,
        ...pad,
        chair,
        employee,
        paid: 0,
        available: true,
        hired: false,
        hiredAt: Infinity,
        paymentBudget: 0,
        cashVisualBudget: 0,
      };
    });

    if (location.hostname === '127.0.0.1') {
      const debugHire = new URLSearchParams(location.search).get('hire');
      const debugHireIds = debugHire === 'all'
        ? new Set(HIRE_DEFINITIONS.map(({ id }) => id))
        : new Set((debugHire ?? '').split(',').filter(Boolean));
      this.pads.forEach((pad) => {
        if (!debugHireIds.has(pad.definition.id)) return;
        pad.hired = true;
        pad.hiredAt = 0;
        pad.paid = pad.definition.cost;
        pad.label.redraw(0, true);
        pad.employee.rig.visible = true;
      });
    }

    this.workerAutomation = new WorkerAutomationSystem(playerCharacter, characterSystem, productionSystem);
    this.workerAutomation.setWorkerCount(this.workerCount);
    this.workerAutomation.setSpeedLevel(this.workerSpeedLevel);
    this.workers = this.workerAutomation.workers;
    this.group.add(this.workerAutomation.group);
    this.colliders = Object.freeze(HIRE_DEFINITIONS.map(chairCollider));

    for (let index = 0; index < MAX_CASH_FLIGHTS; index += 1) {
      const flight = createFlyingCash();
      this.cashFlights.push(flight);
      this.group.add(flight);
    }
  }

  get hiredCount() {
    return this.pads.reduce((count, pad) => count + (pad.hired ? 1 : 0), 0);
  }

  get workerCount() {
    return this.upgrades.workers;
  }

  setHiringAvailable(managerId, available) {
    const pad = this.pads.find(({ definition }) => definition.id === managerId);
    if (!pad) return false;
    pad.available = Boolean(available);
    if (!pad.hired) pad.group.visible = pad.available;
    return true;
  }

  get workerSpeedLevel() {
    return this.upgrades.workerSpeed;
  }

  get playerSpeedMultiplier() {
    return this.upgrades.wcBoost > 0 ? 1.35 : 1;
  }

  get profitMultiplier() {
    return this.upgrades.wcBoost > 0 ? 2 : 1;
  }

  get productionSpeedMultiplier() {
    const activeSpeedLevel = this.workerCount > 0 ? this.workerSpeedLevel : 0;
    return 1 + this.workerCount * 0.08 + activeSpeedLevel * 0.12;
  }

  getUpgradeCards() {
    return UPGRADE_DEFINITIONS.map((definition) => {
      const level = upgradeLevel(this.upgrades, definition.id);
      const managerHired = this.pads.some(({ definition: padDefinition, hired }) => (
        padDefinition.id === definition.managerId && hired
      ));
      const maxed = level >= definition.maxLevel;
      return Object.freeze({
        ...definition,
        level,
        cost: maxed ? 0 : definition.costs[level],
        maxed,
        managerHired,
      });
    });
  }

  purchaseUpgrade(id) {
    if (!this.upgradeRoomId) return Object.freeze({ ok: false, reason: 'outside-room' });
    const definition = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === id);
    if (!definition) return Object.freeze({ ok: false, reason: 'unknown-upgrade' });
    const manager = this.pads.find(({ definition: padDefinition }) => padDefinition.id === definition.managerId);
    if (!manager?.hired) {
      this.upgradeMessage = `Hire the ${manager?.definition.title ?? 'required manager'} first`;
      this.upgradeMessageUntil = this.lastElapsed + 1.6;
      this.upgradeRevision += 1;
      return Object.freeze({ ok: false, reason: 'manager-locked' });
    }

    const level = upgradeLevel(this.upgrades, id);
    if (level >= definition.maxLevel) return Object.freeze({ ok: false, reason: 'maxed' });
    const cost = definition.costs[level];
    if (this.productionSystem.cash < cost) {
      this.upgradeMessage = `Need $${cost - this.productionSystem.cash} more for ${definition.title.toLowerCase()}`;
      this.upgradeMessageUntil = this.lastElapsed + 1.6;
      this.upgradeRevision += 1;
      return Object.freeze({ ok: false, reason: 'cash' });
    }

    this.productionSystem.spendCash(cost);
    setUpgradeLevel(this.upgrades, id, level + 1);
    if (id === 'workers') {
      this.workerAutomation.setWorkerCount(this.workerCount);
    } else if (id === 'worker-speed') {
      this.workerAutomation.setSpeedLevel(this.workerSpeedLevel);
    } else if (id === 'wc-boost') {
      this.characterSystem.setPlayerSpeedMultiplier(this.playerSpeedMultiplier);
    }
    this.upgradeMessage = `${definition.title} upgraded!`;
    this.upgradeMessageUntil = this.lastElapsed + 1.6;
    this.upgradeRevision += 1;
    this.characterSystem.playPlayerAction('Celebrate', 0.55);
    return Object.freeze({ ok: true, id, level: level + 1 });
  }

  _updateWorkers(delta, elapsed) {
    this.workerAutomation.update(delta, elapsed);
  }

  _spawnCashFlight(playerPosition, pad, elapsed) {
    const flight = this.cashFlights.find(({ userData }) => !userData.active);
    if (!flight) return;
    const { start, end } = flight.userData;
    start.set(playerPosition.x + 0.18, playerPosition.y + 1.08, playerPosition.z + 0.08);
    end.set(
      pad.definition.padPosition[0],
      pad.definition.padPosition[1] + 0.24,
      pad.definition.padPosition[2],
    );
    flight.position.copy(start);
    flight.rotation.set(-0.18, (elapsed * 5.7) % Math.PI, 0.2);
    flight.userData.active = true;
    flight.userData.startedAt = elapsed;
    flight.visible = true;
  }

  _updateCashFlights(elapsed) {
    this.cashFlights.forEach((flight) => {
      if (!flight.userData.active) return;
      const progress = THREE.MathUtils.clamp(
        (elapsed - flight.userData.startedAt) / FLIGHT_DURATION,
        0,
        1,
      );
      const eased = 1 - (1 - progress) ** 3;
      flight.position.lerpVectors(flight.userData.start, flight.userData.end, eased);
      flight.position.y += Math.sin(progress * Math.PI) * 0.8;
      flight.rotation.y += 0.18;
      flight.rotation.z += 0.11;
      if (progress < 1) return;
      flight.visible = false;
      flight.userData.active = false;
    });
  }

  _completeHire(pad, elapsed) {
    pad.hired = true;
    pad.hiredAt = elapsed;
    pad.label.redraw(0, true);
    pad.employee.rig.visible = true;
    this.lastCompletedPad = pad;
    this.completionMessageUntil = elapsed + 2.2;
    this.characterSystem.playPlayerAction('Celebrate', 0.72);
  }

  _updateHireReveal(pad, elapsed) {
    if (!pad.hired && !pad.available) {
      pad.group.visible = false;
      return;
    }
    if (!pad.hired) {
      pad.group.visible = true;
      const pulse = 1 + Math.sin(elapsed * 4.5 + pad.definition.cost) * 0.035;
      pad.group.scale.setScalar(pulse);
      return;
    }
    const progress = THREE.MathUtils.clamp((elapsed - pad.hiredAt) / 0.52, 0, 1);
    const pop = 1 + Math.sin(progress * Math.PI) * 0.24;
    pad.employee.rig.scale.setScalar(Math.max(0.001, pop * progress));
    pad.group.scale.setScalar(Math.max(0.001, 1 - progress));
    if (progress >= 1) pad.group.visible = false;
  }

  _payPad(pad, delta, elapsed, playerPosition) {
    const remainingBefore = pad.definition.cost - pad.paid;
    if (remainingBefore <= 0) return;
    if (this.productionSystem.cash <= 0) {
      pad.paymentBudget = 0;
      return;
    }
    pad.paymentBudget += delta * PAYMENT_RATE;
    const requested = Math.min(Math.floor(pad.paymentBudget), remainingBefore);
    if (requested <= 0) return;

    const spent = this.productionSystem.spendCash(requested);
    if (spent <= 0) return;
    pad.paymentBudget -= spent;
    pad.paid += spent;
    pad.cashVisualBudget += spent;
    while (pad.cashVisualBudget >= CASH_PER_FLIGHT) {
      pad.cashVisualBudget -= CASH_PER_FLIGHT;
      this._spawnCashFlight(playerPosition, pad, elapsed);
    }

    const remaining = Math.max(0, pad.definition.cost - pad.paid);
    pad.label.redraw(remaining);
    if (remaining === 0) this._completeHire(pad, elapsed);
  }

  update(delta, elapsed, playerPosition) {
    this.lastElapsed = elapsed;
    this._updateCashFlights(elapsed);
    this._updateWorkers(delta, elapsed);
    this.pads.forEach((pad) => {
      this._updateHireReveal(pad, elapsed);
    });

    const activeRoom = this.pads.find((pad) => (
      pad.hired && pointInsideBounds(playerPosition, pad.definition.roomBounds)
    ));
    const nextRoomId = activeRoom?.definition.id ?? null;
    if (nextRoomId !== this.upgradeRoomId) {
      this.upgradeRoomId = nextRoomId;
      this.upgradeRevision += 1;
    }

    if (this.upgradeMessage && elapsed < this.upgradeMessageUntil) {
      this.productionSystem.setStatus(this.upgradeMessage, 'Choose another manager upgrade or return to the shop');
      return;
    }

    if (this.lastCompletedPad && elapsed < this.completionMessageUntil) {
      this.productionSystem.setStatus(
        `${this.lastCompletedPad.definition.title} hired!`,
        'The glasses-wearing employee is now seated and ready to manage this room',
      );
      return;
    }

    if (activeRoom) {
      this.productionSystem.setStatus(
        `${activeRoom.definition.title} upgrades`,
        'Choose one of the three cards to improve the ice cream shop',
      );
      return;
    }

    const pad = this.pads.find((candidate) => (
      candidate.available
      && !candidate.hired
      && distanceSquaredXZ(playerPosition, candidate.definition.padPosition)
        <= PAYMENT_RADIUS * PAYMENT_RADIUS
    ));
    if (!pad) return;

    this._payPad(pad, delta, elapsed, playerPosition);
    const remaining = Math.max(0, pad.definition.cost - pad.paid);
    if (pad.hired) return;
    if (this.productionSystem.cash > 0) {
      this.productionSystem.setStatus(
        `Hiring ${pad.definition.title.toLowerCase()}…`,
        `$${pad.paid} of $${pad.definition.cost} paid • keep standing on the cash pad`,
      );
    } else {
      this.productionSystem.setStatus(
        `${pad.definition.title} needs $${remaining}`,
        'Collect customer cash, then return and stand on this hiring pad',
      );
    }
  }

  dispose() {
    this.pads.forEach(({ employee }) => {
      employee.mixer.stopAllAction();
      employee.model.traverse((object) => {
        if (object.isSkinnedMesh) object.skeleton.dispose();
      });
    });
    this.workerAutomation.dispose();
    this.group.removeFromParent();
    disposeProcedural(this.group);
  }
}

