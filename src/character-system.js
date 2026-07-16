import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_CONFIG } from './config.js';

const CHARACTER_SCALE = 0.72;
const FLOOR_Y = 0.065;
const ROLE_ANIMATIONS = Object.freeze({
  player: Object.freeze([
    'Idle',
    'Walk_Player',
    'Pickup',
    'Carry_Idle',
    'Carry_Walk',
    'Serve',
    'Celebrate',
  ]),
  customer: Object.freeze([
    'Idle',
    'Walk_Customer',
    'Sit',
    'Eat',
    'Pay',
    'Angry',
    'Celebrate',
  ]),
});
const LOOPING_ANIMATIONS = new Set([
  'Idle',
  'Walk_Player',
  'Walk_Customer',
  'Carry_Idle',
  'Carry_Walk',
  'Sit',
]);
const PLAYER_SPEED = 4.25;
const CUSTOMER_SPEED = 1.75;
const CUSTOMER_SPAWN_DELAY = 0.35;
const CUSTOMER_SPAWN_INTERVAL = 1.1;
const CUSTOMER_ENTRY_POSITION = Object.freeze([-2.5, 8.15]);
const CUSTOMER_ENTRY_INSIDE = Object.freeze([-2.5, 6.72]);
const PLAYER_START_POSITION = Object.freeze([0, -2.5]);
const ORDER_COUNTER_POINT = Object.freeze([1.55, -0.82]);
const CUSTOMER_QUEUE_SLOTS = Object.freeze([
  Object.freeze([1.55, 0.55]),
  Object.freeze([2.55, 1.45]),
  Object.freeze([3.55, 2.35]),
  Object.freeze([4.55, 3.3]),
  Object.freeze([4.75, 4.55]),
  Object.freeze([3.75, 5.35]),
  Object.freeze([2.55, 5.85]),
  Object.freeze([1.15, 6.1]),
]);

function dampAngle(current, target, delta, speed = 14) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-speed * Math.min(delta, 0.05)));
}

function targetRotation(deltaX, deltaZ) {
  return Math.atan2(deltaX, deltaZ);
}

const CHARACTER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'player-worker',
    role: 'player',
    url: new URL('../character_exports_v2/character_Player_Worker.glb', import.meta.url).href,
    position: PLAYER_START_POSITION,
    faces: ORDER_COUNTER_POINT,
    animation: 'Idle',
  }),
  Object.freeze({
    id: 'police-officer',
    role: 'customer',
    url: new URL('../character_exports_v2/character_Police_Officer.glb', import.meta.url).href,
    position: Object.freeze([1.55, 0.55]),
    faces: Object.freeze([-0.6, -0.75]),
    animation: 'Idle',
  }),
  Object.freeze({
    id: 'casual-female',
    role: 'customer',
    url: new URL('../character_exports_v2/character_Casual_Female.glb', import.meta.url).href,
    position: Object.freeze([2.55, 1.45]),
    faces: Object.freeze([1.55, 0.55]),
    animation: 'Idle',
  }),
  Object.freeze({
    id: 'business-man',
    role: 'customer',
    url: new URL('../character_exports_v2/character_Business_Man.glb', import.meta.url).href,
    position: Object.freeze([3.55, 2.35]),
    faces: Object.freeze([2.55, 1.45]),
    animation: 'Idle',
  }),
  Object.freeze({
    id: 'cowboy-farmer',
    role: 'customer',
    url: new URL('../character_exports_v2/character_Cowboy_Farmer.glb', import.meta.url).href,
    position: Object.freeze([4.55, 3.3]),
    faces: Object.freeze([3.55, 2.35]),
    animation: 'Idle',
  }),
  Object.freeze({
    id: 'elderly-female',
    role: 'customer',
    url: new URL('../character_exports_v2/character_Elderly_Female.glb', import.meta.url).href,
    position: Object.freeze([4.75, 4.55]),
    faces: Object.freeze([4.55, 3.3]),
    animation: 'Idle',
  }),
  Object.freeze({
    id: 'elderly-male',
    role: 'customer',
    url: new URL('../character_exports_v2/character_Elderly_Male.glb', import.meta.url).href,
    position: Object.freeze([3.75, 5.35]),
    faces: Object.freeze([4.75, 4.55]),
    animation: 'Idle',
  }),
  Object.freeze({
    id: 'casual-male',
    role: 'customer',
    url: new URL('../character_exports_v2/character_Casual_Male.glb', import.meta.url).href,
    position: Object.freeze([2.55, 5.85]),
    faces: Object.freeze([3.75, 5.35]),
    animation: 'Idle',
  }),
  Object.freeze({
    id: 'business-woman',
    role: 'customer',
    url: new URL('../character_exports_v2/character_Business_Woman.glb', import.meta.url).href,
    position: Object.freeze([1.15, 6.1]),
    faces: Object.freeze([2.55, 5.85]),
    animation: 'Idle',
  }),
]);

function configureCharacterModel(model, definition) {
  const configuredMaterials = new Set();
  model.name = `Character_${definition.id}`;
  model.scale.setScalar(CHARACTER_SCALE);

  model.traverse((object) => {
    if (!object.isMesh) return;

    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (configuredMaterials.has(material)) return;
      material.roughness = Math.max(material.roughness ?? 0.72, 0.65);
      material.needsUpdate = true;
      configuredMaterials.add(material);
    });
  });

  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const [x, z] = definition.position;
  const [faceX, faceZ] = definition.faces;
  model.position.set(x, FLOOR_Y - bounds.min.y, z);

  // The authored v2 characters face local +Z, so point that axis at their target.
  model.rotation.y = targetRotation(faceX - x, faceZ - z);
  model.userData.characterId = definition.id;
  model.userData.characterRole = definition.role;
}

function configureAction(action, animationName, index) {
  const looping = LOOPING_ANIMATIONS.has(animationName);
  action.reset();
  action.enabled = true;
  action.clampWhenFinished = !looping;
  action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
  action.timeScale = 0.92 + (index % 4) * 0.035;
  if (looping) action.time = (index * 0.37) % Math.max(action.getClip().duration, 0.01);
  return action;
}

function createAnimationController(model, animations, definition, index) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(
    animations.map((clip) => [clip.name, mixer.clipAction(clip)]),
  );
  const initialAnimation = actions.has(definition.animation)
    ? definition.animation
    : actions.has('Idle') ? 'Idle' : animations[0]?.name;
  if (!initialAnimation) return null;

  const currentAction = configureAction(actions.get(initialAnimation), initialAnimation, index);
  currentAction.play();
  return {
    mixer,
    actions,
    currentAction,
    currentAnimation: initialAnimation,
  };
}

function createPlayerMarker() {
  const group = new THREE.Group();
  group.name = 'Player_Selection_Marker';
  group.position.set(PLAYER_START_POSITION[0], 0.055, PLAYER_START_POSITION[1]);

  const discMaterial = new THREE.MeshBasicMaterial({
    color: 0x50ee62,
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x83ff72,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.88, 32), discMaterial);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.77, 0.91, 32), ringMaterial);
  disc.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  disc.renderOrder = 2;
  ring.renderOrder = 3;
  group.add(disc, ring);
  group.userData.discMaterial = discMaterial;
  group.userData.ringMaterial = ringMaterial;
  return group;
}

export class CharacterSystem {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Restaurant_Characters';
    this.characters = [];
    this.player = null;
    this.customers = [];
    this.playerInput = new THREE.Vector3();
    this.mixers = [];
    this.playerColliders = [];
    this.playerCarrying = false;
    this.playerActionUntil = 0;
    this.elapsed = 0;
    this.playerMarker = createPlayerMarker();
    this.group.add(this.playerMarker);
  }

  addCharacter(model, animations, definition, index) {
    configureCharacterModel(model, definition);
    const controller = createAnimationController(model, animations, definition, index);
    if (controller) this.mixers.push(controller.mixer);

    const character = {
      definition,
      model,
      animations,
      index,
      mixer: controller?.mixer ?? null,
      actions: controller?.actions ?? new Map(),
      currentAction: controller?.currentAction ?? null,
      currentAnimation: controller?.currentAnimation ?? null,
      availableAnimations: ROLE_ANIMATIONS[definition.role]
        .filter((animationName) => controller?.actions.has(animationName)),
    };

    if (definition.role === 'player') {
      if (this.player) throw new Error('CharacterSystem only supports one active player');
      character.state = 'idle';
      this.player = character;
    } else {
      const queueIndex = this.customers.length;
      character.queueIndex = queueIndex;
      character.state = 'waiting-to-enter';
      character.spawnAt = CUSTOMER_SPAWN_DELAY + queueIndex * CUSTOMER_SPAWN_INTERVAL;
      character.route = [
        CUSTOMER_ENTRY_INSIDE,
        ...CUSTOMER_QUEUE_SLOTS.slice(queueIndex).reverse(),
      ];
      character.routeIndex = 0;
      model.position.x = CUSTOMER_ENTRY_POSITION[0];
      model.position.z = CUSTOMER_ENTRY_POSITION[1];
      model.rotation.y = targetRotation(0, -1);
      model.visible = false;
      this.customers.push(character);
    }

    this.characters.push(character);
    this.group.add(model);
  }

  setPlayerInput(direction) {
    this.playerInput.copy(direction);
  }

  setPlayerColliders(colliders) {
    this.playerColliders = colliders;
  }

  setPlayerCarrying(carrying) {
    this.playerCarrying = carrying;
    if (!this.player || this.elapsed < this.playerActionUntil) return;
    const animationName = this.player.state === 'walking'
      ? carrying ? 'Carry_Walk' : 'Walk_Player'
      : carrying ? 'Carry_Idle' : 'Idle';
    this.setAnimation(this.player.definition.id, animationName);
  }

  playPlayerAction(animationName, duration = 0.55) {
    if (!this.player) return false;
    this.playerActionUntil = this.elapsed + duration;
    return this.setAnimation(this.player.definition.id, animationName, 0.1);
  }

  _playerCollides(x, z) {
    return this.playerColliders.some((collider) => (
      x >= collider.minX && x <= collider.maxX
      && z >= collider.minZ && z <= collider.maxZ
    ));
  }

  get queuedCustomerCount() {
    return this.customers.filter(({ state }) => state === 'queued' || state === 'ordering').length;
  }

  _updatePlayer(delta) {
    if (!this.player) return;
    const { model, definition } = this.player;
    const strength = Math.min(this.playerInput.length(), 1);

    if (strength > 0.05) {
      const directionX = this.playerInput.x / strength;
      const directionZ = this.playerInput.z / strength;
      const step = PLAYER_SPEED * strength * delta;
      const bounds = WORLD_CONFIG.playerBounds;
      const nextX = THREE.MathUtils.clamp(
        model.position.x + directionX * step,
        bounds.minX,
        bounds.maxX,
      );
      if (!this._playerCollides(nextX, model.position.z)) {
        model.position.x = nextX;
      }

      const nextZ = THREE.MathUtils.clamp(
        model.position.z + directionZ * step,
        bounds.minZ,
        bounds.maxZ,
      );
      if (!this._playerCollides(model.position.x, nextZ)) {
        model.position.z = nextZ;
      }
      model.rotation.y = dampAngle(
        model.rotation.y,
        targetRotation(directionX, directionZ),
        delta,
      );
      const walkingAnimation = this.playerCarrying ? 'Carry_Walk' : 'Walk_Player';
      if (this.elapsed >= this.playerActionUntil
        && (this.player.state !== 'walking' || this.player.currentAnimation !== walkingAnimation)) {
        this.player.state = 'walking';
        this.setAnimation(definition.id, walkingAnimation);
      }
    } else {
      const idleAnimation = this.playerCarrying ? 'Carry_Idle' : 'Idle';
      if (this.elapsed >= this.playerActionUntil
        && (this.player.state !== 'idle' || this.player.currentAnimation !== idleAnimation)) {
      this.player.state = 'idle';
        this.setAnimation(definition.id, idleAnimation);
      }
    }

    this.playerMarker.position.x = model.position.x;
    this.playerMarker.position.z = model.position.z;
  }

  _updateCustomers(delta, elapsed) {
    this.customers.forEach((customer) => {
      const { model, definition } = customer;
      if (customer.state === 'celebrating') {
        if (elapsed < customer.stateUntil) return;
        customer.state = 'leaving';
        customer.route = [CUSTOMER_ENTRY_INSIDE, CUSTOMER_ENTRY_POSITION];
        customer.routeIndex = 0;
        this.setAnimation(definition.id, 'Walk_Customer');
      }

      if (customer.state === 'waiting-to-enter') {
        if (elapsed < customer.spawnAt) return;
        model.visible = true;
        customer.state = 'walking';
        this.setAnimation(definition.id, 'Walk_Customer');
      }

      if (customer.state === 'walking' || customer.state === 'leaving') {
        const target = customer.route[customer.routeIndex];
        const deltaX = target[0] - model.position.x;
        const deltaZ = target[1] - model.position.z;
        const distance = Math.hypot(deltaX, deltaZ);
        const step = CUSTOMER_SPEED * delta;

        if (distance <= step + 0.025) {
          model.position.x = target[0];
          model.position.z = target[1];
          customer.routeIndex += 1;
          if (customer.routeIndex >= customer.route.length) {
            if (customer.state === 'leaving') {
              customer.state = 'departed';
              model.visible = false;
            } else {
              customer.state = customer.queueIndex === 0 ? 'ordering' : 'queued';
              this.setAnimation(definition.id, 'Idle');
            }
          }
        } else {
          const inverseDistance = 1 / Math.max(distance, 0.001);
          const directionX = deltaX * inverseDistance;
          const directionZ = deltaZ * inverseDistance;
          model.position.x += directionX * step;
          model.position.z += directionZ * step;
          model.rotation.y = dampAngle(
            model.rotation.y,
            targetRotation(directionX, directionZ),
            delta,
          );
        }
        return;
      }

      if (customer.state === 'queued' || customer.state === 'ordering') {
        const facingPoint = customer.queueIndex === 0
          ? ORDER_COUNTER_POINT
          : CUSTOMER_QUEUE_SLOTS[customer.queueIndex - 1];
        model.rotation.y = dampAngle(
          model.rotation.y,
          targetRotation(facingPoint[0] - model.position.x, facingPoint[1] - model.position.z),
          delta,
          10,
        );
      }
    });
  }

  serveFrontCustomer(elapsed) {
    const servedCustomer = this.customers.find((customer) => (
      customer.queueIndex === 0 && customer.state === 'ordering'
    ));
    if (!servedCustomer) return false;

    servedCustomer.queueIndex = -1;
    servedCustomer.state = 'celebrating';
    servedCustomer.stateUntil = elapsed + 0.8;
    this.setAnimation(servedCustomer.definition.id, 'Celebrate', 0.1);

    this.customers.forEach((customer) => {
      if (customer === servedCustomer || customer.state === 'departed' || customer.queueIndex <= 0) return;
      customer.queueIndex -= 1;
      if (customer.state === 'waiting-to-enter') {
        customer.route = [
          CUSTOMER_ENTRY_INSIDE,
          ...CUSTOMER_QUEUE_SLOTS.slice(customer.queueIndex).reverse(),
        ];
        customer.routeIndex = 0;
        return;
      }

      customer.route = [CUSTOMER_QUEUE_SLOTS[customer.queueIndex]];
      customer.routeIndex = 0;
      customer.state = 'walking';
      this.setAnimation(customer.definition.id, 'Walk_Customer');
    });

    return true;
  }

  setAnimation(characterId, animationName, transition = 0.16) {
    const character = this.characters.find(({ definition }) => definition.id === characterId);
    const allowedAnimations = ROLE_ANIMATIONS[character?.definition.role] ?? [];
    if (!character || !allowedAnimations.includes(animationName)) return false;

    const nextAction = character.actions.get(animationName);
    if (!nextAction) return false;
    if (nextAction === character.currentAction) return true;

    configureAction(nextAction, animationName, character.index);
    nextAction.play();
    if (character.currentAction) {
      nextAction.crossFadeFrom(character.currentAction, Math.max(transition, 0), true);
    }
    character.currentAction = nextAction;
    character.currentAnimation = animationName;
    return true;
  }

  update(delta, elapsed) {
    this.elapsed = elapsed;
    this._updatePlayer(delta);
    this._updateCustomers(delta, elapsed);
    this.mixers.forEach((mixer) => mixer.update(delta));
    const pulse = 1 + Math.sin(elapsed * 3.1) * 0.035;
    this.playerMarker.scale.setScalar(pulse);
    this.playerMarker.userData.discMaterial.opacity = 0.25 + Math.sin(elapsed * 3.1) * 0.035;
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    this.mixers.forEach((mixer) => mixer.stopAllAction());

    this.group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
      if (object.isSkinnedMesh) object.skeleton.dispose();
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
}

export async function createCharacterSystem(onProgress) {
  const loader = new GLTFLoader();
  const system = new CharacterSystem();
  let completed = 0;

  const loadedCharacters = await Promise.all(CHARACTER_DEFINITIONS.map(async (definition, index) => {
    const gltf = await loader.loadAsync(definition.url);
    completed += 1;
    onProgress?.(completed / CHARACTER_DEFINITIONS.length);
    return { gltf, definition, index };
  }));

  loadedCharacters.forEach(({ gltf, definition, index }) => {
    system.addCharacter(gltf.scene, gltf.animations, definition, index);
  });

  if (!system.player || system.customers.length !== CHARACTER_DEFINITIONS.length - 1) {
    throw new Error('Character role assignment must include one player and eight customers');
  }

  return system;
}
