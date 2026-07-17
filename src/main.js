import * as THREE from 'three';
import { IsometricCameraController } from './camera-controller.js';
import { PlayerController } from './player-controller.js';
import { createRestaurantScene } from './restaurant-scene.js';
import './styles.css';

const canvas = document.querySelector('#game-canvas');
const loading = document.querySelector('#loading');
const loadingFill = document.querySelector('#loading-fill');
const loadingValue = document.querySelector('#loading-value');
const errorPanel = document.querySelector('#error-panel');
const resetButton = document.querySelector('#reset-view');
const guideButton = document.querySelector('#toggle-guides');
const objective = document.querySelector('#objective');
const movementStick = document.querySelector('#movement-stick');
const cashChip = document.querySelector('.cash-chip');
const cashValue = cashChip.querySelector('strong');
const managerUpgrades = document.querySelector('#manager-upgrades');
const managerUpgradeCards = [...managerUpgrades.querySelectorAll('[data-upgrade]')];
const managerUpgradeRoomLabel = managerUpgrades.querySelector('.manager-upgrades__header > span');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bd653);
scene.fog = new THREE.Fog(0x8bd653, 42, 78);

const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 120);
const cameraController = new IsometricCameraController(camera, canvas);
const playerController = new PlayerController(canvas, movementStick);
const timer = new THREE.Timer();
timer.connect(document);
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let restaurantScene = null;
let running = true;
let tapStart = null;
let displayedStatusRevision = -1;
let displayedCash = -1;
let displayedUpgradeRevision = -1;
let displayedUpgradeCash = -1;
let displayedUpgradeRoomId = null;
const debugTelemetryEnabled = location.hostname === '127.0.0.1' && new URLSearchParams(location.search).has('debug');

function addLights() {
  const skyLight = new THREE.HemisphereLight(0xfff7d7, 0x5b813c, 1.65);
  scene.add(skyLight);

  const keyLight = new THREE.DirectionalLight(0xfff0c8, 2.45);
  keyLight.name = 'Sun_Key_Light';
  keyLight.position.set(-15, 27, -12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -24;
  keyLight.shadow.camera.right = 24;
  keyLight.shadow.camera.top = 20;
  keyLight.shadow.camera.bottom = -20;
  keyLight.shadow.camera.near = 4;
  keyLight.shadow.camera.far = 58;
  keyLight.shadow.bias = -0.00045;
  keyLight.shadow.normalBias = 0.025;
  scene.add(keyLight);
}

function updateLoading(progress) {
  const percent = Math.round(THREE.MathUtils.clamp(progress, 0, 1) * 100);
  loadingFill.style.width = `${percent}%`;
  loadingValue.textContent = `${percent}%`;
}

function resize() {
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
  cameraController.resize(width, height);
}

function findPlacementDefinition(object) {
  let current = object;
  while (current) {
    if (current.userData?.placementZone) return current.userData.placementZone;
    current = current.parent;
  }
  return null;
}

function selectPlacementAt(clientX, clientY) {
  if (!restaurantScene?.placementZones.visible) return;

  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointerNdc, camera);
  const [intersection] = raycaster.intersectObjects(restaurantScene.placementZones.interactables, false);
  const definition = intersection ? findPlacementDefinition(intersection.object) : null;
  if (!definition) return;

  restaurantScene.placementZones.setSelected(definition.id);
  objective.querySelector('strong').textContent = definition.label;
  objective.querySelector('span').textContent = definition.hint;
  objective.classList.remove('is-selected');
  requestAnimationFrame(() => objective.classList.add('is-selected'));
}

function syncManagerUpgrades() {
  const hiringSystem = restaurantScene?.iceCreamProduction.hiringSystem;
  if (!hiringSystem) return;
  const roomId = hiringSystem.upgradeRoomId;
  if (roomId !== displayedUpgradeRoomId) {
    displayedUpgradeRoomId = roomId;
    managerUpgrades.hidden = !roomId;
    displayedUpgradeRevision = -1;
  }
  if (!roomId) return;
  if (hiringSystem.upgradeRevision === displayedUpgradeRevision
    && hiringSystem.productionSystem.cash === displayedUpgradeCash) return;

  displayedUpgradeRevision = hiringSystem.upgradeRevision;
  displayedUpgradeCash = hiringSystem.productionSystem.cash;
  managerUpgradeRoomLabel.textContent = roomId === 'wc-manager'
    ? 'WC MANAGER OFFICE'
    : 'GENERAL MANAGER OFFICE';

  const cards = hiringSystem.getUpgradeCards();
  managerUpgradeCards.forEach((button) => {
    const card = cards.find(({ id }) => id === button.dataset.upgrade);
    if (!card) return;
    const price = button.querySelector('.manager-card__price');
    const levelDisplay = button.querySelector('.manager-card__levels');
    const pips = [...levelDisplay.querySelectorAll('i')];
    const affordable = hiringSystem.productionSystem.cash >= card.cost;
    button.classList.toggle('is-locked', !card.managerHired);
    button.classList.toggle('is-maxed', card.maxed);
    button.classList.toggle('is-unaffordable', card.managerHired && !card.maxed && !affordable);
    button.disabled = card.maxed;
    button.setAttribute('aria-label', card.maxed
      ? `${card.title}, maximum level`
      : `${card.title}, level ${card.level} of ${card.maxLevel}, costs ${card.cost}`);
    levelDisplay.setAttribute('aria-label', card.maxed
      ? 'Maximum level reached'
      : `Level ${card.level} of ${card.maxLevel}`);
    pips.forEach((pip, index) => pip.classList.toggle('is-active', index < card.level));
    price.textContent = card.maxed
      ? 'MAX'
      : card.managerHired ? `$${card.cost}` : `HIRE ${card.managerId === 'wc-manager' ? 'WC' : 'GM'}`;
  });
}

function syncGameHud() {
  const production = restaurantScene?.iceCreamProduction;
  if (!production) return;

  if (production.cash !== displayedCash) {
    displayedCash = production.cash;
    cashValue.textContent = String(production.cash);
    cashChip.setAttribute('aria-label', `Cash: ${production.cash}`);
  }

  if (restaurantScene.placementZones.visible
    || production.statusRevision === displayedStatusRevision) return;
  displayedStatusRevision = production.statusRevision;
  objective.querySelector('strong').textContent = production.status.title;
  objective.querySelector('span').textContent = production.status.detail;
  objective.classList.remove('is-selected');
  requestAnimationFrame(() => objective.classList.add('is-selected'));
}

function bindInterface() {
  window.addEventListener('resize', resize, { passive: true });
  resetButton.addEventListener('click', () => {
    const playerPosition = restaurantScene?.characterSystem.player?.model.position;
    cameraController.reset(playerPosition);
  });
  guideButton.addEventListener('click', () => {
    const nextVisible = !restaurantScene.placementZones.visible;
    restaurantScene.placementZones.setVisible(nextVisible);
    guideButton.setAttribute('aria-pressed', String(nextVisible));
    objective.querySelector('strong').textContent = nextVisible ? 'Ice cream shop layout' : 'Serve ice cream customers';
    objective.querySelector('span').textContent = nextVisible
      ? 'Tap a green marker to inspect future expansion areas'
      : restaurantScene.iceCreamProduction.status.detail;
    objective.classList.remove('is-selected');
    if (!nextVisible) displayedStatusRevision = -1;
  });

  canvas.addEventListener('pointerdown', (event) => {
    tapStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!tapStart || tapStart.id !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y);
    const duration = performance.now() - tapStart.time;
    if (distance < 9 && duration < 500) selectPlacementAt(event.clientX, event.clientY);
    tapStart = null;
  });
  canvas.addEventListener('pointercancel', () => { tapStart = null; });

  managerUpgradeCards.forEach((button) => {
    button.addEventListener('click', () => {
      restaurantScene?.iceCreamProduction.hiringSystem?.purchaseUpgrade(button.dataset.upgrade);
      displayedUpgradeRevision = -1;
      syncManagerUpgrades();
    });
  });

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
  });
}

function animate(timestamp) {
  if (!running) return;

  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 0.05);
  const elapsed = timer.getElapsed();
  const characterSystem = restaurantScene?.characterSystem;
  if (characterSystem) {
    characterSystem.setPlayerInput(playerController.update(camera));
  }
  restaurantScene?.update(delta, elapsed);
  syncGameHud();
  syncManagerUpgrades();
  if (debugTelemetryEnabled && characterSystem) {
    const teleportX = Number(canvas.dataset.teleportX);
    const teleportZ = Number(canvas.dataset.teleportZ);
    if (Number.isFinite(teleportX) && Number.isFinite(teleportZ)) {
      characterSystem.player.model.position.x = teleportX;
      characterSystem.player.model.position.z = teleportZ;
      delete canvas.dataset.teleportX;
      delete canvas.dataset.teleportZ;
    }
    canvas.dataset.playerX = characterSystem.player.model.position.x.toFixed(3);
    canvas.dataset.playerZ = characterSystem.player.model.position.z.toFixed(3);
    canvas.dataset.productionStage = restaurantScene.iceCreamProduction.stage;
    canvas.dataset.carriedProduct = restaurantScene.iceCreamProduction.activeCarryProduct ?? '';
    canvas.dataset.collectedCash = String(restaurantScene.iceCreamProduction.cash);
    canvas.dataset.pendingCash = String(restaurantScene.iceCreamProduction.pendingCash);
    canvas.dataset.availableSeats = String(characterSystem.availableSeatCount);
    canvas.dataset.dirtyTables = String(characterSystem.dirtyTableCount);
    canvas.dataset.cleanableTables = String(characterSystem.cleanableTableCount);
    canvas.dataset.garbageCarry = restaurantScene.iceCreamProduction.tableCleanup?.carryingTableId ?? '';
    canvas.dataset.hiredEmployees = String(
      restaurantScene.iceCreamProduction.hiringSystem?.hiredCount ?? 0,
    );
    canvas.dataset.hiringPads = restaurantScene.iceCreamProduction.hiringSystem?.pads
      .map(({ definition, paid, hired }) => (
        `${definition.id}:${paid}/${definition.cost}${hired ? ':hired' : ''}`
      )).join('|') ?? '';
    canvas.dataset.employeeStates = restaurantScene.iceCreamProduction.hiringSystem?.pads
      .map(({ definition, hired, employee }) => (
        `${definition.id}:${hired ? 'seated' : 'locked'}:${employee.action?.paused ? 'idle' : 'moving'}:${(employee.action?.time ?? 0).toFixed(3)}`
      ))
      .join('|') ?? '';
    const hiringSystem = restaurantScene.iceCreamProduction.hiringSystem;
    canvas.dataset.upgradeRoom = hiringSystem?.upgradeRoomId ?? '';
    canvas.dataset.managerUpgrades = hiringSystem?.getUpgradeCards()
      .map(({ id, level, maxLevel, managerHired }) => `${id}:${level}/${maxLevel}:${managerHired ? 'open' : 'locked'}`)
      .join('|') ?? '';
    canvas.dataset.workerCount = String(hiringSystem?.workerCount ?? 0);
    canvas.dataset.workerSpeedLevel = String(hiringSystem?.workerSpeedLevel ?? 0);
    canvas.dataset.playerSpeedMultiplier = String(hiringSystem?.playerSpeedMultiplier ?? 1);
    canvas.dataset.profitMultiplier = String(hiringSystem?.profitMultiplier ?? 1);
    canvas.dataset.workerJobs = hiringSystem?.workers
      .map(({ index, role, state, taskTableId, currentAnimation, model }) => (
        `${index + 1}:${role}:${state}:${currentAnimation ?? 'none'}@${model.position.x.toFixed(2)},${model.position.z.toFixed(2)}`
        + (taskTableId ? `#${taskTableId}` : '')
      ))
      .join('|') ?? '';
    canvas.dataset.workerAutomationCount = String(hiringSystem?.workerAutomation?.workerCount ?? 0);
    canvas.dataset.assignedServer = String(hiringSystem?.workerAutomation?.assignedServerIndex ?? '');
    canvas.dataset.simulationTime = elapsed.toFixed(2);
    canvas.dataset.trashLid = restaurantScene.iceCreamProduction.tableCleanup?.lidState ?? 'closed';
    canvas.dataset.trashDisposal = restaurantScene.iceCreamProduction.tableCleanup?.disposal?.owner ?? '';
    canvas.dataset.customerStates = characterSystem.customers
      .map(({ definition, state, seatId }) => (
        `${definition.id}:${state}${seatId ? `@${seatId}` : ''}`
      ))
      .join('|');
  }
  const playerPosition = characterSystem?.player?.model.position;
  if (playerPosition) cameraController.follow(playerPosition);
  cameraController.update(delta);
  renderer.render(scene, camera);
}

async function boot() {
  try {
    addLights();
    resize();
    updateLoading(0.04);
    restaurantScene = await createRestaurantScene(scene, updateLoading);
    if (import.meta.env.DEV || debugTelemetryEnabled) {
      Object.defineProperty(window, '__iceCreamDebug', { value: restaurantScene, configurable: true });
    }
    bindInterface();
    syncGameHud();
    cameraController.follow(restaurantScene.characterSystem.player.model.position);
    cameraController.update(1 / 60);
    renderer.render(scene, camera);
    renderer.setAnimationLoop(animate);

    window.setTimeout(() => loading.classList.add('is-hidden'), 180);
    console.info('Ice cream shop ready', {
      size: restaurantScene.size.toArray().map((value) => Number(value.toFixed(2))),
      characters: restaurantScene.characterSystem.characters.length,
      player: restaurantScene.characterSystem.player?.definition.id,
      customers: restaurantScene.characterSystem.customers.length,
      customerFlow: 'entrance -> order counter queue',
      placementSlots: restaurantScene.placementZones.zones.length,
      wallColliders: restaurantScene.wallColliders.length,
      furniture: restaurantScene.iceCreamShop.instances.length,
      furnitureColliders: restaurantScene.furnitureColliders.length,
      iceCreamMachines: restaurantScene.iceCreamProduction.machines.length,
      productionAssets: restaurantScene.iceCreamProduction.supports.length,
      productionColliders: restaurantScene.productionColliders.length,
      interactionColliders: restaurantScene.interactionColliders.length,
      renderer: renderer.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1',
    });
  } catch (error) {
    console.error('Ice cream shop setup failed', error);
    loading.classList.add('is-hidden');
    errorPanel.hidden = false;
  }
}

boot();
