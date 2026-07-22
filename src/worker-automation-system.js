import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { WORLD_CONFIG } from './config.js';

const BASE_WORKER_SPEED = 1.55;
const WORKER_CLEARANCE = 0.26;
const NAV_CELL_SIZE = 0.42;
const NAV_GOAL_EPSILON = 0.06;
const NAV_SEGMENT_STEP = 0.16;
const NAV_MAX_SEARCH_NODES = 3500;
const SERVICE_AISLE_BACK_LIMIT = -4.78;
const NAV_PATH_SAFETY_MARGIN = 0.08;
const LOOPING_ACTIONS = new Set(['Idle', 'Walk_Player', 'Carry_Idle', 'Carry_Walk']);
const SERVICE_ROLES = new Set(['server']);
const FLAVOR_COLORS = Object.freeze({
  vanilla: 0xffe7a0,
});

const ROLE_DEFINITIONS = Object.freeze([
  Object.freeze({ role: 'server', label: 'Ice cream service', post: Object.freeze([1.55, -1.72]), face: Object.freeze([1.55, 0.55]) }),
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
  const coneGeometry = new THREE.ConeGeometry(0.13, 0.34, 8);
  const cupGeometry = new THREE.CylinderGeometry(0.13, 0.105, 0.22, 10);
  const scoopGeometry = new THREE.SphereGeometry(0.17, 10, 7);
  const tray = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.07, 0.48, 14, 0.028), trayMaterial);
  tray.position.y = 0.02;
  const cones = [];
  const cups = [];
  const scoops = [];
  for (let index = 0; index < 3; index += 1) {
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    const cup = new THREE.Mesh(cupGeometry, cupMaterial);
    const scoop = new THREE.Mesh(scoopGeometry, scoopMaterial);
    cone.position.set(0, 0.22 + index * 0.25, 0);
    cone.rotation.x = Math.PI;
    cup.position.set(0, 0.15 + index * 0.2, 0);
    scoop.position.set(0, 0.43 + index * 0.25, 0);
    cone.visible = false;
    cup.visible = false;
    scoop.visible = false;
    cones.push(cone);
    cups.push(cup);
    scoops.push(scoop);
  }
  [tray, ...cones, ...cups, ...scoops].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  group.add(tray, ...cones, ...cups, ...scoops);
  return {
    group,
    cone: cones[0],
    cup: cups[0],
    scoop: scoops[0],
    cones,
    cups,
    scoops,
    scoopMaterial,
    geometries: [tray.geometry, coneGeometry, cupGeometry, scoopGeometry],
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
    navigationGoal: null,
    navigationArrival: null,
    navigationPath: [],
    navigationIndex: 0,
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
    const previousCount = this.workerCount;
    const nextCount = THREE.MathUtils.clamp(Math.floor(count), 0, this.workers.length);
    const gainedFirstServer = previousCount === 0 && nextCount > 0;
    if (nextCount === 0 || gainedFirstServer) {
      this.assignedOrder = null;
      this.assignedServerIndex = null;
    }
    this.workerCount = nextCount;
    this.workers.forEach((worker, index) => {
      const active = index < this.workerCount;
      const newlyActive = active && index >= previousCount;
      worker.model.visible = active;
      if (!active) {
        worker.tray.group.visible = false;
        worker.state = 'at-post';
        worker.taskTableId = null;
        worker.lastHandledStage = null;
        this._resetNavigation(worker);
        return;
      }
      if (newlyActive) {
        worker.tray.group.visible = false;
        worker.state = 'at-post';
        worker.taskTableId = null;
        worker.lastHandledStage = null;
        this._resetNavigation(worker);
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

  get orderAutomationActive() {
    return this.workers.some((worker) => (
      worker.index < this.workerCount && SERVICE_ROLES.has(worker.role) && worker.model.visible
    ));
  }

  _setServiceTray(worker, order, visible, completed = false) {
    worker.tray.group.visible = visible;
    worker.tray.cones.forEach((product) => { product.visible = false; });
    worker.tray.cups.forEach((product) => { product.visible = false; });
    worker.tray.scoops.forEach((product) => { product.visible = false; });
    if (!visible || !order?.flavor || !completed) return;

    worker.tray.scoopMaterial.color.setHex(FLAVOR_COLORS[order.flavor] ?? FLAVOR_COLORS.vanilla);
    const amount = THREE.MathUtils.clamp(Math.floor(order.amount ?? 1), 1, 3);
    for (let index = 0; index < amount; index += 1) {
      worker.tray.cups[index].visible = true;
      worker.tray.scoops[index].visible = true;
      worker.tray.scoops[index].position.y = 0.31 + index * 0.2;
    }
  }

  _resetNavigation(worker) {
    worker.navigationGoal = null;
    worker.navigationArrival = null;
    worker.navigationPath.length = 0;
    worker.navigationIndex = 0;
  }

  _isNavigationBlocked(x, z, worker = null, safetyMargin = 0) {
    if (worker?.role === 'server' && z < SERVICE_AISLE_BACK_LIMIT) return true;
    const clearance = WORKER_CLEARANCE + Math.max(0, Number(safetyMargin) || 0);
    const bounds = WORLD_CONFIG.playerBounds;
    if (x < bounds.minX + clearance
      || x > bounds.maxX - clearance
      || z < bounds.minZ + clearance
      || z > bounds.maxZ - clearance) {
      return true;
    }
    return Boolean(this.characterSystem.isNavigationBlocked?.(
      x,
      z,
      clearance,
    ));
  }

  _segmentIsClear(startX, startZ, endX, endZ, worker = null, safetyMargin = 0) {
    const distance = Math.hypot(endX - startX, endZ - startZ);
    const steps = Math.max(1, Math.ceil(distance / NAV_SEGMENT_STEP));
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      const x = THREE.MathUtils.lerp(startX, endX, ratio);
      const z = THREE.MathUtils.lerp(startZ, endZ, ratio);
      if (this._isNavigationBlocked(x, z, worker, safetyMargin)) return false;
    }
    return true;
  }

  _planNavigation(worker, requestedTarget) {
    const target = [requestedTarget[0], requestedTarget[1]];
    this._resetNavigation(worker);

    const startX = worker.model.position.x;
    const startZ = worker.model.position.z;
    if (this._segmentIsClear(
      startX,
      startZ,
      target[0],
      target[1],
      worker,
      NAV_PATH_SAFETY_MARGIN,
    )) {
      worker.navigationGoal = target;
      worker.navigationArrival = target;
      worker.navigationPath.push(target);
      return true;
    }

    const bounds = WORLD_CONFIG.playerBounds;
    const columns = Math.floor((bounds.maxX - bounds.minX) / NAV_CELL_SIZE) + 1;
    const rows = Math.floor((bounds.maxZ - bounds.minZ) / NAV_CELL_SIZE) + 1;
    const cellKey = (x, z) => z * columns + x;
    const cellPoint = (x, z) => [
      bounds.minX + x * NAV_CELL_SIZE,
      bounds.minZ + z * NAV_CELL_SIZE,
    ];
    const clampedCell = (x, z) => ({
      x: THREE.MathUtils.clamp(
        Math.round((x - bounds.minX) / NAV_CELL_SIZE),
        0,
        columns - 1,
      ),
      z: THREE.MathUtils.clamp(
        Math.round((z - bounds.minZ) / NAV_CELL_SIZE),
        0,
        rows - 1,
      ),
    });
    const blockedCache = new Map();
    const cellIsBlocked = (x, z) => {
      if (x < 0 || x >= columns || z < 0 || z >= rows) return true;
      const key = cellKey(x, z);
      if (!blockedCache.has(key)) {
        const point = cellPoint(x, z);
        blockedCache.set(key, this._isNavigationBlocked(
          point[0],
          point[1],
          worker,
          NAV_PATH_SAFETY_MARGIN,
        ));
      }
      return blockedCache.get(key);
    };
    const nearestOpenCell = (origin) => {
      const maxRadius = Math.max(columns, rows);
      for (let radius = 0; radius <= maxRadius; radius += 1) {
        for (let z = origin.z - radius; z <= origin.z + radius; z += 1) {
          for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
            if (radius > 0
              && x !== origin.x - radius
              && x !== origin.x + radius
              && z !== origin.z - radius
              && z !== origin.z + radius) {
              continue;
            }
            if (!cellIsBlocked(x, z)) return { x, z };
          }
        }
      }
      return null;
    };

    const startCell = nearestOpenCell(clampedCell(startX, startZ));
    const goalCell = nearestOpenCell(clampedCell(target[0], target[1]));
    if (!startCell || !goalCell) return false;

    const startKey = cellKey(startCell.x, startCell.z);
    const goalKey = cellKey(goalCell.x, goalCell.z);
    const heuristic = (x, z) => {
      const deltaX = Math.abs(goalCell.x - x);
      const deltaZ = Math.abs(goalCell.z - z);
      return Math.max(deltaX, deltaZ) + (Math.SQRT2 - 1) * Math.min(deltaX, deltaZ);
    };
    const open = [{
      x: startCell.x,
      z: startCell.z,
      key: startKey,
      score: heuristic(startCell.x, startCell.z),
    }];
    const closed = new Set();
    const cameFrom = new Map();
    const costs = new Map([[startKey, 0]]);
    const directions = [
      [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
      [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2],
    ];
    let reached = false;
    let searched = 0;

    while (open.length > 0 && searched < NAV_MAX_SEARCH_NODES) {
      let bestIndex = 0;
      for (let index = 1; index < open.length; index += 1) {
        if (open[index].score < open[bestIndex].score) bestIndex = index;
      }
      const current = open.splice(bestIndex, 1)[0];
      if (closed.has(current.key)) continue;
      closed.add(current.key);
      searched += 1;
      if (current.key === goalKey) {
        reached = true;
        break;
      }

      directions.forEach(([offsetX, offsetZ, movementCost]) => {
        const nextX = current.x + offsetX;
        const nextZ = current.z + offsetZ;
        if (cellIsBlocked(nextX, nextZ)) return;
        if (offsetX !== 0 && offsetZ !== 0
          && (cellIsBlocked(current.x + offsetX, current.z)
            || cellIsBlocked(current.x, current.z + offsetZ))) {
          return;
        }
        const nextKey = cellKey(nextX, nextZ);
        if (closed.has(nextKey)) return;
        const nextCost = costs.get(current.key) + movementCost;
        if (nextCost >= (costs.get(nextKey) ?? Infinity)) return;
        costs.set(nextKey, nextCost);
        cameFrom.set(nextKey, current.key);
        open.push({
          x: nextX,
          z: nextZ,
          key: nextKey,
          score: nextCost + heuristic(nextX, nextZ),
        });
      });
    }
    if (!reached) return false;

    const reversePath = [];
    let cursor = goalKey;
    while (cursor !== startKey) {
      const x = cursor % columns;
      const z = Math.floor(cursor / columns);
      reversePath.push(cellPoint(x, z));
      cursor = cameFrom.get(cursor);
      if (cursor === undefined) return false;
    }
    reversePath.reverse();

    const goalPoint = cellPoint(goalCell.x, goalCell.z);
    const exactTargetIsUsable = !this._isNavigationBlocked(
      target[0],
      target[1],
      worker,
      NAV_PATH_SAFETY_MARGIN,
    ) && this._segmentIsClear(
      goalPoint[0], goalPoint[1], target[0], target[1], worker, NAV_PATH_SAFETY_MARGIN,
    );
    const candidates = reversePath;
    if (exactTargetIsUsable) candidates.push(target);
    const arrival = exactTargetIsUsable ? target : goalPoint;
    const smoothed = [];
    let anchorX = startX;
    let anchorZ = startZ;
    let candidateIndex = 0;
    while (candidateIndex < candidates.length) {
      let furthest = candidateIndex;
      for (let index = candidates.length - 1; index > candidateIndex; index -= 1) {
        const candidate = candidates[index];
        if (this._segmentIsClear(
          anchorX,
          anchorZ,
          candidate[0],
          candidate[1],
          worker,
          NAV_PATH_SAFETY_MARGIN,
        )) {
          furthest = index;
          break;
        }
      }
      const waypoint = candidates[furthest];
      smoothed.push(waypoint);
      anchorX = waypoint[0];
      anchorZ = waypoint[1];
      candidateIndex = furthest + 1;
    }
    worker.navigationGoal = target;
    worker.navigationArrival = arrival;
    worker.navigationPath.push(...smoothed);
    return worker.navigationPath.length > 0;
  }

  _moveWorker(worker, target, delta, carrying = false) {
    if (this._isNavigationBlocked(worker.model.position.x, worker.model.position.z, worker)) {
      const behindServiceAisle = worker.role === 'server'
        && worker.model.position.z < SERVICE_AISLE_BACK_LIMIT;
      const safePoint = behindServiceAisle
        ? { x: worker.model.position.x, z: SERVICE_AISLE_BACK_LIMIT }
        : this.characterSystem.findNearestNavigationPoint?.(
          worker.model.position.x,
          worker.model.position.z,
          WORKER_CLEARANCE,
        );
      if (!safePoint) {
        setWorkerAnimation(worker, carrying ? 'Carry_Idle' : 'Idle', this.speedLevel);
        return false;
      }
      worker.model.position.x = safePoint.x;
      worker.model.position.z = safePoint.z;
      this._resetNavigation(worker);
    }

    const goalChanged = !worker.navigationGoal
      || Math.hypot(
        worker.navigationGoal[0] - target[0],
        worker.navigationGoal[1] - target[1],
      ) > NAV_GOAL_EPSILON;
    if (goalChanged && !this._planNavigation(worker, target)) {
      setWorkerAnimation(worker, carrying ? 'Carry_Idle' : 'Idle', this.speedLevel);
      return false;
    }
    if (worker.navigationIndex >= worker.navigationPath.length) return true;

    const waypoint = worker.navigationPath[worker.navigationIndex];
    const deltaX = waypoint[0] - worker.model.position.x;
    const deltaZ = waypoint[1] - worker.model.position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    const speed = BASE_WORKER_SPEED * (1 + this.speedLevel * 0.22);
    const step = speed * delta;
    if (distance <= step + 0.025) {
      worker.model.position.x = waypoint[0];
      worker.model.position.z = waypoint[1];
      worker.navigationIndex += 1;
      return worker.navigationIndex >= worker.navigationPath.length;
    }
    const directionX = deltaX / Math.max(distance, 0.001);
    const directionZ = deltaZ / Math.max(distance, 0.001);
    const nextX = worker.model.position.x + directionX * step;
    const nextZ = worker.model.position.z + directionZ * step;
    if (this._isNavigationBlocked(nextX, nextZ, worker)) {
      this._resetNavigation(worker);
      setWorkerAnimation(worker, carrying ? 'Carry_Idle' : 'Idle', this.speedLevel);
      return false;
    }
    worker.model.position.x = nextX;
    worker.model.position.z = nextZ;
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
    if (stage === 'need-machine' || stage === 'dispensing') {
      const machine = this.productionSystem.machines.find(({ id }) => id === activeOrder.machineId);
      return machine ? [machine.standPoint.x, machine.standPoint.z] : null;
    }
    if (stage === 'need-pickup') {
      const point = this.productionSystem.stationPoints.get('machine-output');
      return point ? [point.x, point.z] : null;
    }
    if (stage === 'need-serve' || stage === 'serving' || stage === 'waiting-for-table') {
      const point = this.productionSystem.stationPoints.get('serve');
      return point ? [point.x, point.z] : null;
    }
    return null;
  }

  _chooseServer() {
    const activeServers = this.workers.filter((worker) => (
      SERVICE_ROLES.has(worker.role) && worker.index < this.workerCount
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

    this.workers.filter((worker) => SERVICE_ROLES.has(worker.role) && worker.index < this.workerCount)
      .forEach((worker) => {
        if (worker.index !== this.assignedServerIndex || !activeOrder) {
          this._holdPost(worker, delta);
          return;
        }

        const target = this._serverTarget();
        const carrying = !['waiting', 'complete'].includes(stage);
        const completed = ['need-serve', 'serving'].includes(stage);
        this._setServiceTray(worker, activeOrder, carrying, completed);
        if (!target) {
          setWorkerAnimation(worker, carrying ? 'Carry_Idle' : 'Idle', this.speedLevel);
          return;
        }
        const arrived = this._moveWorker(worker, target, delta, carrying);
        if (!arrived) return;
        if (stage === 'need-serve') {
          worker.state = 'serving-customer';
          if (worker.lastHandledStage === stage) return;
          worker.lastHandledStage = stage;
          setWorkerAnimation(worker, 'Serve', this.speedLevel, 0.08);
          this.productionSystem.performWorkerStage(worker, elapsed);
          return;
        }
        if (stage === 'serving' || stage === 'waiting-for-table') {
          worker.state = stage === 'serving' ? 'serving-customer' : 'holding-order';
          if (stage === 'waiting-for-table' || worker.currentAnimation !== 'Serve') {
            setWorkerAnimation(worker, 'Carry_Idle', this.speedLevel);
          }
          return;
        }
        setWorkerAnimation(worker, carrying ? 'Carry_Idle' : 'Idle', this.speedLevel);
        worker.state = stage === 'need-pickup' ? 'collecting-stack' : 'preparing-order';
        if (!['need-machine', 'need-pickup'].includes(stage)) return;
        if (worker.lastHandledStage === stage) return;
        worker.lastHandledStage = stage;
        setWorkerAnimation(worker, 'Pickup', this.speedLevel, 0.08);
        this.productionSystem.performWorkerStage(worker, elapsed);
      });
  }

  _assignNextCleanerTask(worker) {
    const dirtyTable = this.characterSystem.diningTables.find((table) => (
      this.characterSystem.canCleanTable(table.id)
    ));
    if (!dirtyTable) return false;

    worker.taskTableId = dirtyTable.id;
    worker.state = 'to-table';
    this._resetNavigation(worker);
    return true;
  }

  _updateCleaner(worker, delta, elapsed) {
    const cleanup = this.productionSystem.tableCleanup;
    if (!cleanup) return;

    if (worker.state === 'disposing') {
      const table = this.characterSystem.getDiningTable(worker.taskTableId);
      if (table?.state !== 'clean') return;
      worker.taskTableId = null;
      if (this._assignNextCleanerTask(worker)) return;
      worker.state = 'returning';
      this._resetNavigation(worker);
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
        if (this._assignNextCleanerTask(worker)) return;
        worker.state = 'returning';
        this._resetNavigation(worker);
        return;
      }
      const arrived = this._moveWorker(worker, table.interactionPoint, delta, false);
      if (!arrived) return;
      setWorkerAnimation(worker, 'Pickup', this.speedLevel, 0.08);
      if (cleanup.beginWorkerCleanup(worker.model, table.id)) {
        this._resetNavigation(worker);
        worker.state = 'to-bin';
      } else {
        worker.taskTableId = null;
        worker.state = 'returning';
      }
      return;
    }

    if (worker.state === 'returning') {
      if (this._assignNextCleanerTask(worker)) return;
      if (!this._moveWorker(worker, worker.definition.post, delta, false)) return;
      worker.state = 'at-post';
    }

    if (this._assignNextCleanerTask(worker)) return;
    this._holdPost(worker, delta);
  }

  update(delta, elapsed) {
    this.workers.forEach((worker, index) => {
      if (index >= this.workerCount) return;
      worker.mixer.update(delta);
    });

    this._updateServers(delta, elapsed);
    const cleaner = this.workers[1];
    if (this.workerCount > 1) this._updateCleaner(cleaner, delta, elapsed);
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
