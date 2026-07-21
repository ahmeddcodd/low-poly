import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const BASE_WORKER_SPEED = 1.55;
const COUNTER_HANDOFF_RADIUS = 0.9;
const LOOPING_ACTIONS = new Set(['Idle', 'Walk_Player', 'Carry_Idle', 'Carry_Walk']);
const FLAVOR_COLORS = Object.freeze({
  vanilla: 0xffe7a0,
  strawberry: 0xff7690,
  chocolate: 0x9b583c,
  mint: 0x63e2b7,
});

const ROLE_DEFINITIONS = Object.freeze([
  Object.freeze({ role: 'cashier', label: 'Counter', post: Object.freeze([1.55, -1.72]), face: Object.freeze([1.55, 0.55]) }),
  Object.freeze({ role: 'server', label: 'Ice cream', post: Object.freeze([-2.25, -3.1]), face: Object.freeze([1.55, -1.1]) }),
  Object.freeze({ role: 'server', label: 'Ice cream', post: Object.freeze([-5.15, -3.1]), face: Object.freeze([-1.6, -3.1]) }),
  Object.freeze({ role: 'cleaner', label: 'Cleaning', post: Object.freeze([4.85, 4.65]), face: Object.freeze([-4.3, 3.6]) }),
]);

function targetRotation(deltaX, deltaZ) {
  return Math.atan2(deltaX, deltaZ);
}

function createServiceTray() {
  const group = new THREE.Group();
  group.name = 'Employee_Service_Tray';
  group.position.set(0, 1.04, 0.48);
  group.visible = false;

  const trayMaterial = new THREE.MeshStandardMaterial({ color: 0xe7f1ea, roughness: 0.68 });
  const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xe4a95e, roughness: 0.76 });
  const cupMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f0e9, roughness: 0.7 });
  const scoopMaterial = new THREE.MeshStandardMaterial({ color: 0xffe7a0, roughness: 0.72 });
  const tray = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.07, 0.48, 14, 0.028), trayMaterial);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 8), coneMaterial);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.105, 0.22, 10), cupMaterial);
  const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 7), scoopMaterial);
  tray.position.y = 0.02;
  cone.position.set(0, 0.22, 0);
  cone.rotation.x = Math.PI;
  cup.position.set(0, 0.15, 0);
  cup.visible = false;
  scoop.position.set(0, 0.43, 0);
  [tray, cone, cup, scoop].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  group.add(tray, cone, cup, scoop);
  return {
    group,
    cone,
    cup,
    scoop,
    scoopMaterial,
    geometries: [tray.geometry, cone.geometry, cup.geometry, scoop.geometry],
    materials: [trayMaterial, coneMaterial, cupMaterial, scoopMaterial],
  };
}

function configureAction(action, name, speedLevel) {
  const looping = LOOPING_ACTIONS.has(name);
  action.reset();
  action.enabled = true;
  action.clampWhenFinished = !looping;
  action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
  action.timeScale = 1 + speedLevel * 0.18;
  return action;
}

function setWorkerAnimation(worker, name, speedLevel, transition = 0.12) {
  const nextAction = worker.actions.get(name) ?? worker.actions.get('Idle');
  if (!nextAction || nextAction === worker.currentAction) return;
  configureAction(nextAction, name, speedLevel).play();
  if (worker.currentAction) nextAction.crossFadeFrom(worker.currentAction, transition, true);
  worker.currentAction = nextAction;
  worker.currentAnimation = name;
}

function createWorker(sourceCharacter, definition, index) {
  const model = cloneSkeleton(sourceCharacter.model);
  model.name = `Hired_IceCream_Worker_${index + 1}`;
  model.getObjectByName('Worker_IceCream_Tray')?.removeFromParent();
  model.position.set(definition.post[0], sourceCharacter.model.position.y, definition.post[1]);
  model.rotation.set(0, targetRotation(
    definition.face[0] - definition.post[0],
    definition.face[1] - definition.post[1],
  ), 0);
  model.visible = false;
  model.userData.characterId = `hired-worker-${index + 1}`;
  model.userData.characterRole = 'employee';
  model.userData.workerRole = definition.role;

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(sourceCharacter.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
  const idleAction = actions.get('Idle') ?? actions.values().next().value ?? null;
  if (idleAction) configureAction(idleAction, 'Idle', 0).play();

  const tray = createServiceTray();
  model.add(tray.group);
  return {
    index,
    definition,
    role: definition.role,
    label: definition.label,
    model,
    mixer,
    actions,
    currentAction: idleAction,
    currentAnimation: idleAction ? 'Idle' : null,
    tray,
    state: 'at-post',
    taskTableId: null,
    lastHandledStage: null,
  };
}

export class WorkerAutomationSystem {
  constructor(sourceCharacter, characterSystem, productionSystem) {
    this.characterSystem = characterSystem;
    this.productionSystem = productionSystem;
    this.group = new THREE.Group();
    this.group.name = 'Automated_IceCream_Workers';
    this.workerCount = 0;
    this.speedLevel = 0;
    this.assignedServerIndex = null;
    this.assignedOrder = null;
    this.workers = ROLE_DEFINITIONS.map((definition, index) => createWorker(sourceCharacter, definition, index));
    this.workers.forEach(({ model }) => this.group.add(model));
  }

  setWorkerCount(count) {
    const nextCount = THREE.MathUtils.clamp(Math.floor(count), 0, this.workers.length);
    if (nextCount !== this.workerCount) {
      this.assignedOrder = null;
      this.assignedServerIndex = null;
    }
    this.workerCount = nextCount;
    this.workers.forEach((worker, index) => {
      worker.model.visible = index < this.workerCount;
      if (index >= this.workerCount) {
        worker.tray.group.visible = false;
        worker.state = 'at-post';
        worker.taskTableId = null;
      }
    });
  }

  setSpeedLevel(level) {
    this.speedLevel = THREE.MathUtils.clamp(Math.floor(level), 0, 4);
    this.workers.forEach((worker) => {
      if (worker.currentAction) worker.currentAction.timeScale = 1 + this.speedLevel * 0.18;
    });
  }

  get counterWorkerActive() {
    return this.workerCount > 0 && this.workers[0]?.model.visible;
  }

  _setServiceTray(worker, order, visible) {
    worker.tray.group.visible = visible;
    if (order?.flavor) {
      worker.tray.scoopMaterial.color.setHex(FLAVOR_COLORS[order.flavor] ?? FLAVOR_COLORS.vanilla);
      const isCup = order.container === 'cup';
      worker.tray.cone.visible = !isCup;
      worker.tray.cup.visible = isCup;
      worker.tray.scoop.position.y = isCup ? 0.31 : 0.43;
    }
  }

  _moveWorker(worker, target, delta, carrying = false) {
    const deltaX = target[0] - worker.model.position.x;
    const deltaZ = target[1] - worker.model.position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    const speed = BASE_WORKER_SPEED * (1 + this.speedLevel * 0.22);
    const step = speed * delta;
    if (distance <= step + 0.025) {
      worker.model.position.x = target[0];
      worker.model.position.z = target[1];
      return true;
    }
    const directionX = deltaX / Math.max(distance, 0.001);
    const directionZ = deltaZ / Math.max(distance, 0.001);
    worker.model.position.x += directionX * step;
    worker.model.position.z += directionZ * step;
    worker.model.rotation.y = targetRotation(directionX, directionZ);
    setWorkerAnimation(worker, carrying ? 'Carry_Walk' : 'Walk_Player', this.speedLevel);
    return false;
  }

  _holdPost(worker, delta) {
    this._setServiceTray(worker, null, false);
    const arrived = this._moveWorker(worker, worker.definition.post, delta, false);
    if (!arrived) return;
    worker.model.rotation.y = targetRotation(
      worker.definition.face[0] - worker.model.position.x,
      worker.definition.face[1] - worker.model.position.z,
    );
    worker.state = 'at-post';
    setWorkerAnimation(worker, 'Idle', this.speedLevel);
  }

  _serverTarget() {
    const { activeOrder, stage } = this.productionSystem;
    if (!activeOrder) return null;
    if (stage === 'need-container') {
      const point = this.productionSystem.stationPoints.get(activeOrder.container);
      return point ? [point.x, point.z] : null;
    }
    if (stage === 'need-machine' || stage === 'dispensing') {
      const machine = this.productionSystem.machines.find(({ flavor }) => flavor === activeOrder.flavor);
      return machine ? [machine.standPoint.x, machine.standPoint.z] : null;
    }
    if (stage === 'need-finish') {
      const finishStation = activeOrder.container === 'cup' ? 'spoon' : 'topping';
      const point = this.productionSystem.stationPoints.get(finishStation);
      return point ? [point.x, point.z] : null;
    }
    if (stage === 'need-serve') {
      const point = this.productionSystem.stationPoints.get('serve');
      return point ? [point.x, point.z] : null;
    }
    return null;
  }

  _chooseServer() {
    const activeServers = this.workers.filter((worker) => (
      worker.role === 'server' && worker.index < this.workerCount
    ));
    if (activeServers.length === 0) return null;
    return activeServers[this.productionSystem.servedCount % activeServers.length];
  }

  _updateServers(delta, elapsed) {
    const { activeOrder, stage } = this.productionSystem;
    if (activeOrder !== this.assignedOrder) {
      this.assignedOrder = activeOrder;
      const server = activeOrder ? this._chooseServer() : null;
      this.assignedServerIndex = server?.index ?? null;
      this.workers.forEach((worker) => {
        worker.lastHandledStage = null;
      });
    }

    this.workers.filter((worker) => worker.role === 'server' && worker.index < this.workerCount)
      .forEach((worker) => {
        if (worker.index !== this.assignedServerIndex || !activeOrder) {
          this._holdPost(worker, delta);
          return;
        }

        if (stage === 'serving' || stage === 'waiting-for-table') {
          this._holdPost(worker, delta);
          return;
        }

        const target = this._serverTarget();
        const carrying = !['need-container', 'waiting', 'complete'].includes(stage);
        this._setServiceTray(worker, activeOrder, carrying);
        if (!target) {
          setWorkerAnimation(worker, carrying ? 'Carry_Idle' : 'Idle', this.speedLevel);
          return;
        }
        const arrived = this._moveWorker(worker, target, delta, carrying);
        if (!arrived) return;
        setWorkerAnimation(worker, carrying ? 'Carry_Idle' : 'Idle', this.speedLevel);
        if (stage === 'need-serve') {
          worker.state = 'handoff-ready';
          return;
        }
        worker.state = carrying ? 'preparing-order' : 'collecting-container';
        if (!['need-container', 'need-machine', 'need-finish'].includes(stage)) return;
        if (worker.lastHandledStage === stage) return;
        worker.lastHandledStage = stage;
        setWorkerAnimation(worker, 'Pickup', this.speedLevel, 0.08);
        this.productionSystem.performWorkerStage(worker, elapsed);
      });
  }

  _updateCashier(worker, delta, elapsed) {
    const { activeOrder, stage } = this.productionSystem;
    const arrived = this._moveWorker(worker, worker.definition.post, delta, false);
    if (!arrived) return;
    worker.model.rotation.y = targetRotation(
      worker.definition.face[0] - worker.model.position.x,
      worker.definition.face[1] - worker.model.position.z,
    );

    if (!activeOrder) {
      this._setServiceTray(worker, null, false);
      worker.state = 'at-counter';
      setWorkerAnimation(worker, 'Idle', this.speedLevel);
      return;
    }

    if (stage === 'need-serve') {
      const assignedServer = this.workers[this.assignedServerIndex];
      const servePoint = this.productionSystem.stationPoints.get('serve');
      const player = this.characterSystem.player?.model;
      const playerHandoffReady = Boolean(
        player
        && this.characterSystem.playerCarrying
        && servePoint
        && (player.position.x - servePoint.x) ** 2 + (player.position.z - servePoint.z) ** 2
          <= COUNTER_HANDOFF_RADIUS ** 2
      );
      const serverHandoffReady = assignedServer?.index < this.workerCount
        && assignedServer.state === 'handoff-ready';
      const handoffReady = playerHandoffReady || serverHandoffReady;
      this._setServiceTray(worker, activeOrder, handoffReady);
      if (!handoffReady) {
        worker.state = 'waiting-for-order';
        setWorkerAnimation(worker, 'Idle', this.speedLevel);
        return;
      }
      worker.state = 'serving-customer';
      if (worker.lastHandledStage === stage) return;
      worker.lastHandledStage = stage;
      setWorkerAnimation(worker, 'Serve', this.speedLevel, 0.08);
      this.productionSystem.performWorkerStage(worker, elapsed);
      return;
    }

    if (stage === 'serving' || stage === 'waiting-for-table') {
      this._setServiceTray(worker, activeOrder, true);
      worker.state = stage === 'serving' ? 'serving-customer' : 'holding-order';
      if (stage === 'waiting-for-table' || worker.currentAnimation !== 'Serve') {
        setWorkerAnimation(worker, 'Carry_Idle', this.speedLevel);
      }
      return;
    }

    this._setServiceTray(worker, null, false);
    worker.state = 'taking-order';
    setWorkerAnimation(worker, 'Idle', this.speedLevel);
  }

  _updateCleaner(worker, delta, elapsed) {
    const cleanup = this.productionSystem.tableCleanup;
    if (!cleanup) return;

    if (worker.state === 'disposing') {
      const table = this.characterSystem.getDiningTable(worker.taskTableId);
      if (table?.state !== 'clean') return;
      worker.taskTableId = null;
      worker.state = 'returning';
    }

    if (worker.state === 'to-bin') {
      const arrived = this._moveWorker(worker, cleanup.binInteractionPoint, delta, true);
      if (!arrived) return;
      setWorkerAnimation(worker, 'Serve', this.speedLevel, 0.08);
      if (cleanup.startWorkerDisposal(worker.model, worker.taskTableId, elapsed)) {
        worker.state = 'disposing';
      }
      return;
    }

    if (worker.state === 'to-table') {
      const table = this.characterSystem.getDiningTable(worker.taskTableId);
      if (!table || !this.characterSystem.canCleanTable(table.id)) {
        worker.taskTableId = null;
        worker.state = 'returning';
        return;
      }
      const arrived = this._moveWorker(worker, table.interactionPoint, delta, false);
      if (!arrived) return;
      setWorkerAnimation(worker, 'Pickup', this.speedLevel, 0.08);
      if (cleanup.beginWorkerCleanup(worker.model, table.id)) {
        worker.state = 'to-bin';
      } else {
        worker.taskTableId = null;
        worker.state = 'returning';
      }
      return;
    }

    if (worker.state === 'returning') {
      if (!this._moveWorker(worker, worker.definition.post, delta, false)) return;
      worker.state = 'at-post';
    }

    const dirtyTable = this.characterSystem.diningTables.find((table) => (
      this.characterSystem.canCleanTable(table.id)
    ));
    if (dirtyTable) {
      worker.taskTableId = dirtyTable.id;
      worker.state = 'to-table';
      return;
    }
    this._holdPost(worker, delta);
  }

  update(delta, elapsed) {
    this.workers.forEach((worker, index) => {
      if (index >= this.workerCount) return;
      worker.mixer.update(delta);
    });

    this._updateServers(delta, elapsed);
    const cashier = this.workers[0];
    if (this.workerCount > 0) this._updateCashier(cashier, delta, elapsed);
    const cleaner = this.workers[3];
    if (this.workerCount > 3) this._updateCleaner(cleaner, delta, elapsed);
  }

  dispose() {
    this.workers.forEach((worker) => {
      worker.mixer.stopAllAction();
      worker.model.traverse((object) => {
        if (object.isSkinnedMesh) object.skeleton.dispose();
      });
      worker.tray.geometries.forEach((geometry) => geometry.dispose());
      worker.tray.materials.forEach((material) => material.dispose());
    });
    this.group.removeFromParent();
  }
}
