import * as THREE from 'three';
import { WORLD_CONFIG } from './config.js';

const TRASH_BIN_POSITION = Object.freeze([7.2, 0.02, 6.15]);
const TRASH_BIN_INTERACTION_POINT = Object.freeze([7.2, 5.05]);
const TABLE_INTERACTION_RADIUS = 1.2;
const BIN_INTERACTION_RADIUS = 1.2;
const TRASH_BIN_HALF_WIDTH = 0.75;
const TRASH_BIN_HALF_DEPTH = 0.45;
const DISPOSAL_DURATION = 1.16;
const LID_CLOSED_ANGLE = -0.08;
const LID_OPEN_ANGLE = 1.18;

export const TRASH_BIN_COLLIDER = Object.freeze({
  name: 'Procedural_Trash_Bin_Collider',
  cleanupAssetId: 'trash-bin',
  minX: TRASH_BIN_POSITION[0] - TRASH_BIN_HALF_WIDTH - WORLD_CONFIG.playerCollisionRadius,
  maxX: TRASH_BIN_POSITION[0] + TRASH_BIN_HALF_WIDTH + WORLD_CONFIG.playerCollisionRadius,
  minZ: TRASH_BIN_POSITION[2] - TRASH_BIN_HALF_DEPTH - WORLD_CONFIG.playerCollisionRadius,
  maxZ: TRASH_BIN_POSITION[2] + TRASH_BIN_HALF_DEPTH + WORLD_CONFIG.playerCollisionRadius,
});

function squaredDistanceXZ(position, point) {
  const deltaX = position.x - point[0];
  const deltaZ = position.z - point[1];
  return deltaX * deltaX + deltaZ * deltaZ;
}

function easeInOut(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function createInteractionMarker(point, color) {
  const group = new THREE.Group();
  group.name = 'Cleanup_Interaction_Marker';
  group.position.set(point[0], 0.078, point[1]);
  group.visible = false;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.61, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.54, 0.69, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  disc.renderOrder = 4;
  ring.renderOrder = 5;
  group.add(disc, ring);
  return group;
}

function createGarbageKit() {
  return {
    cupGeometry: new THREE.CylinderGeometry(0.13, 0.18, 0.32, 8, 1, true),
    rimGeometry: new THREE.TorusGeometry(0.155, 0.025, 4, 8),
    napkinGeometry: new THREE.BoxGeometry(0.34, 0.035, 0.27),
    spoonGeometry: new THREE.BoxGeometry(0.06, 0.035, 0.42),
    crumbGeometry: new THREE.DodecahedronGeometry(0.085, 0),
    cupMaterial: new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.88 }),
    rimMaterial: new THREE.MeshStandardMaterial({ color: 0xbfd3df, roughness: 0.72 }),
    napkinMaterial: new THREE.MeshStandardMaterial({ color: 0xe4f2ff, roughness: 0.92 }),
    spoonMaterial: new THREE.MeshStandardMaterial({ color: 0x9fb0ba, roughness: 0.55, metalness: 0.16 }),
    crumbMaterial: new THREE.MeshStandardMaterial({ color: 0x9b5a3c, roughness: 0.9 }),
  };
}

function createGarbageBatch(kit, index) {
  const batch = new THREE.Group();
  batch.name = `Garbage_Batch_${index + 1}`;
  const direction = index === 0 ? -1 : 1;
  batch.position.set(direction * 0.2, 0.02, direction * 0.08);
  batch.rotation.y = direction * 0.28;

  const cup = new THREE.Mesh(kit.cupGeometry, kit.cupMaterial);
  cup.position.set(0, 0.18, 0);
  cup.rotation.z = direction * 0.09;
  const rim = new THREE.Mesh(kit.rimGeometry, kit.rimMaterial);
  rim.position.set(0, 0.34, 0);
  rim.rotation.x = Math.PI / 2;
  const napkin = new THREE.Mesh(kit.napkinGeometry, kit.napkinMaterial);
  napkin.position.set(-direction * 0.22, 0.045, 0.12);
  napkin.rotation.y = direction * 0.48;
  const spoon = new THREE.Mesh(kit.spoonGeometry, kit.spoonMaterial);
  spoon.position.set(direction * 0.2, 0.065, -0.08);
  spoon.rotation.y = direction * 0.42;
  const crumb = new THREE.Mesh(kit.crumbGeometry, kit.crumbMaterial);
  crumb.position.set(-direction * 0.06, 0.09, -0.18);

  [cup, rim, napkin, spoon, crumb].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  batch.add(cup, rim, napkin, spoon, crumb);
  return batch;
}

function createGarbageCluster(kit, name) {
  const group = new THREE.Group();
  group.name = name;
  const batches = [createGarbageBatch(kit, 0), createGarbageBatch(kit, 1)];
  group.add(...batches);
  return { group, batches };
}

function createTrashLabelMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#274d2b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#82d66f';
  context.lineWidth = 12;
  context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 66px Arial, sans-serif';
  context.fillText('TRASH', canvas.width / 2, canvas.height / 2 + 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true });
}

function createTrashBin() {
  const group = new THREE.Group();
  group.name = 'Procedural_Trash_Bin';
  group.position.set(...TRASH_BIN_POSITION);

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x396b3c, roughness: 0.8 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x24462b, roughness: 0.72 });
  const openingMaterial = new THREE.MeshStandardMaterial({ color: 0x172019, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.05, 0.8), bodyMaterial);
  body.position.y = 0.55;
  const lowerTrim = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.15, 0.9), trimMaterial);
  lowerTrim.position.y = 0.1;
  const lidPivot = new THREE.Group();
  lidPivot.name = 'Trash_Bin_Animated_Lid_Pivot';
  lidPivot.position.set(0, 1.12, 0.42);
  lidPivot.rotation.x = LID_CLOSED_ANGLE;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.9), trimMaterial);
  lid.position.set(0, 0.04, -0.38);
  lidPivot.add(lid);
  const opening = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.3), openingMaterial);
  opening.position.set(0, 1.1, -0.34);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.34), createTrashLabelMaterial());
  label.name = 'Trash_Bin_Label';
  label.position.set(0, 0.7, -0.406);
  label.rotation.y = Math.PI;

  [body, lowerTrim, lid, opening].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  group.add(body, lowerTrim, lidPivot, opening, label);
  return { group, lidPivot };
}

function disposeResources(roots) {
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

export class TableCleanupSystem {
  constructor(characterSystem) {
    this.characterSystem = characterSystem;
    this.group = new THREE.Group();
    this.group.name = 'Table_Cleanup_Assets';
    this.garbageKit = createGarbageKit();
    this.tableVisuals = new Map();
    this.workerCarryRigs = new Map();
    this.carryingTableId = null;
    this.carryingEvent = { type: 'carrying', tableId: null };
    this.disposal = null;
    this.playerDisposalComplete = null;
    this.lidState = 'closed';

    characterSystem.diningTables.forEach((table) => {
      const cluster = createGarbageCluster(this.garbageKit, `Table_Garbage_${table.id}`);
      cluster.group.position.set(...table.position);
      cluster.group.visible = false;
      const marker = createInteractionMarker(table.interactionPoint, 0xffb13b);
      this.group.add(cluster.group, marker);
      this.tableVisuals.set(table.id, { ...cluster, marker });
    });

    const trashBin = createTrashBin();
    this.trashBin = trashBin.group;
    this.lidPivot = trashBin.lidPivot;
    this.binMarker = createInteractionMarker(TRASH_BIN_INTERACTION_POINT, 0x67f05c);
    const dropCluster = createGarbageCluster(this.garbageKit, 'Animated_Trash_Drop');
    this.dropRig = dropCluster.group;
    this.dropRig.visible = false;
    this.group.add(this.trashBin, this.binMarker, this.dropRig);

    const carryCluster = createGarbageCluster(this.garbageKit, 'Player_Carried_Garbage');
    this.carryRig = carryCluster.group;
    this.carryRig.position.set(0, 1.18, 0.48);
    this.carryRig.scale.setScalar(0.78);
    this.carryRig.visible = false;
    characterSystem.player.model.add(this.carryRig);

    this.scratchStart = new THREE.Vector3();
    this.scratchTarget = new THREE.Vector3();
    this.scratchPosition = new THREE.Vector3();
    this._syncVisuals();
  }

  get colliders() {
    return [TRASH_BIN_COLLIDER];
  }

  get binInteractionPoint() {
    return TRASH_BIN_INTERACTION_POINT;
  }

  get isCarrying() {
    return this.carryingTableId !== null;
  }

  _getWorkerCarryRig(workerModel) {
    let rig = this.workerCarryRigs.get(workerModel);
    if (rig) return rig;
    rig = createGarbageCluster(this.garbageKit, `${workerModel.name}_Carried_Garbage`).group;
    rig.position.set(0, 1.18, 0.48);
    rig.scale.setScalar(0.78);
    rig.visible = false;
    workerModel.add(rig);
    this.workerCarryRigs.set(workerModel, rig);
    return rig;
  }

  beginWorkerCleanup(workerModel, tableId) {
    if (!workerModel || !this.characterSystem.beginTableCleanup(tableId)) return false;
    const rig = this._getWorkerCarryRig(workerModel);
    rig.visible = true;
    this._syncVisuals();
    return true;
  }

  _startDisposal(owner, actorModel, tableId, carryRig, elapsed) {
    if (this.disposal || !actorModel || !tableId || !carryRig) return false;
    const table = this.characterSystem.getDiningTable(tableId);
    if (table?.state !== 'garbage-carried') return false;

    actorModel.updateMatrixWorld(true);
    actorModel.getWorldPosition(this.scratchStart);
    this.scratchStart.y += 1.12;
    this.scratchStart.z += 0.16;
    carryRig.visible = false;
    this.dropRig.position.copy(this.scratchStart);
    this.dropRig.rotation.set(0, actorModel.rotation.y, 0);
    this.dropRig.scale.setScalar(0.8);
    this.dropRig.visible = true;
    this.disposal = {
      owner,
      actorModel,
      tableId,
      carryRig,
      startedAt: elapsed,
      start: this.scratchStart.clone(),
    };
    this.lidState = 'opening';
    if (owner === 'player') this.characterSystem.setPlayerCarrying(false);
    this._syncVisuals();
    return true;
  }

  startWorkerDisposal(workerModel, tableId, elapsed) {
    return this._startDisposal('worker', workerModel, tableId, this._getWorkerCarryRig(workerModel), elapsed);
  }

  _updateDisposal(elapsed) {
    if (!this.disposal) return null;
    const progress = THREE.MathUtils.clamp(
      (elapsed - this.disposal.startedAt) / DISPOSAL_DURATION,
      0,
      1,
    );

    const openProgress = easeInOut(progress / 0.28);
    const closeProgress = easeInOut((progress - 0.72) / 0.28);
    const lidBlend = openProgress * (1 - closeProgress);
    this.lidPivot.rotation.x = THREE.MathUtils.lerp(LID_CLOSED_ANGLE, LID_OPEN_ANGLE, lidBlend);
    this.lidState = progress < 0.28 ? 'opening' : progress < 0.72 ? 'open' : progress < 1 ? 'closing' : 'closed';

    const dropProgress = easeInOut((progress - 0.18) / 0.58);
    this.scratchTarget.set(TRASH_BIN_POSITION[0], 0.94, TRASH_BIN_POSITION[2] - 0.28);
    this.scratchPosition.lerpVectors(this.disposal.start, this.scratchTarget, dropProgress);
    this.scratchPosition.y += Math.sin(dropProgress * Math.PI) * 0.42;
    this.dropRig.position.copy(this.scratchPosition);
    this.dropRig.rotation.y += 0.055;
    this.dropRig.rotation.z = dropProgress * 0.42;
    this.dropRig.scale.setScalar(THREE.MathUtils.lerp(0.8, 0.16, dropProgress));
    this.dropRig.visible = progress < 0.83;

    if (progress < 1) {
      return this.disposal.owner === 'player'
        ? { type: 'disposing', tableId: this.disposal.tableId }
        : null;
    }

    const completed = this.disposal;
    this.characterSystem.completeTableCleanup(completed.tableId);
    completed.carryRig.visible = false;
    this.disposal = null;
    this.dropRig.visible = false;
    this.dropRig.scale.setScalar(1);
    this.lidPivot.rotation.x = LID_CLOSED_ANGLE;
    this.lidState = 'closed';
    if (completed.owner === 'player') {
      this.carryingTableId = null;
      this.carryingEvent.tableId = null;
      this.playerDisposalComplete = completed.tableId;
    }
    this._syncVisuals();
    return completed.owner === 'player'
      ? { type: 'disposed', tableId: completed.tableId }
      : null;
  }

  _syncVisuals() {
    this.characterSystem.diningTables.forEach((table) => {
      const visual = this.tableVisuals.get(table.id);
      if (!visual) return;
      const showGarbage = table.state === 'dirty' && table.garbageCount > 0;
      visual.group.visible = showGarbage;
      visual.batches.forEach((batch, index) => {
        batch.visible = index < table.garbageCount;
      });
      visual.marker.visible = !this.isCarrying && this.characterSystem.canCleanTable(table.id);
    });
    this.binMarker.visible = this.isCarrying && this.disposal?.owner !== 'player';
  }

  _pulseMarkers(elapsed) {
    const pulse = 1 + Math.sin(elapsed * 4.6) * 0.09;
    this.tableVisuals.forEach(({ marker }) => {
      if (marker.visible) marker.scale.setScalar(pulse);
    });
    if (this.binMarker.visible) this.binMarker.scale.setScalar(pulse);
  }

  update(elapsed, playerPosition, canPickUp) {
    const disposalEvent = this._updateDisposal(elapsed);
    this._syncVisuals();
    this._pulseMarkers(elapsed);
    if (disposalEvent) return disposalEvent;

    if (this.isCarrying) {
      if (squaredDistanceXZ(playerPosition, TRASH_BIN_INTERACTION_POINT)
        <= BIN_INTERACTION_RADIUS * BIN_INTERACTION_RADIUS) {
        if (this._startDisposal('player', this.characterSystem.player.model, this.carryingTableId, this.carryRig, elapsed)) {
          this.characterSystem.playPlayerAction('Serve', 0.74);
          return { type: 'disposing', tableId: this.carryingTableId };
        }
      }
      return this.carryingEvent;
    }

    if (!canPickUp) return null;
    for (const table of this.characterSystem.diningTables) {
      if (!this.characterSystem.canCleanTable(table.id)) continue;
      if (squaredDistanceXZ(playerPosition, table.interactionPoint)
        > TABLE_INTERACTION_RADIUS * TABLE_INTERACTION_RADIUS) continue;
      if (!this.characterSystem.beginTableCleanup(table.id)) continue;

      this.carryingTableId = table.id;
      this.carryingEvent.tableId = table.id;
      this.carryRig.visible = true;
      this.characterSystem.setPlayerCarrying(true);
      this.characterSystem.playPlayerAction('Pickup', 0.5);
      this._syncVisuals();
      return { type: 'picked-up', tableId: table.id };
    }

    return null;
  }

  dispose() {
    const workerRigs = [...this.workerCarryRigs.values()];
    disposeResources([this.group, this.carryRig, ...workerRigs]);
    this.carryRig.removeFromParent();
    workerRigs.forEach((rig) => rig.removeFromParent());
    this.workerCarryRigs.clear();
    this.group.removeFromParent();
  }
}
