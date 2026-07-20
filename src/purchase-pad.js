// One drip-pay purchase pad, replacing three near-identical implementations
// (progression-system.js paid at 36/s, hiring-system.js at 34/s, and each carried its
// own copy of the label drawing and the flying-cash pool).
//
// Two behaviours differ deliberately from what they replaced:
//
//   * The drain rate scales with price so every purchase takes the same ~1.6s regardless
//     of cost. At the old flat 36/s the $1,500 premium freezer would be 42 seconds of
//     standing still.
//   * The label only re-uploads its texture when the displayed number actually changes.
//     The old code set `needsUpdate` on every payment tick, which at 512x512 RGBA is
//     ~60 MB/s of texture traffic per active pad.

import * as THREE from 'three';
import { PAD, padDrainRate } from './tuning.js';
import { disposeObjectResources } from './gltf-utils.js';

const LABEL_SIZE = 256;

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

function drawCashNote(context, x, y, width = 66, height = 35) {
  roundedRect(context, x, y, width, height, 6);
  context.fillStyle = '#55e83a';
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = '#1f9c25';
  context.stroke();
  context.fillStyle = '#d7ff79';
  context.fillRect(x + width * 0.35, y + height * 0.21, width * 0.3, height * 0.57);
}

function createPadLabel(labelText, subtitle) {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_SIZE;
  canvas.height = LABEL_SIZE;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  let drawn = null;

  const redraw = (remaining) => {
    // The whole point of the change guard: skip the GPU upload when nothing moved.
    if (remaining === drawn) return;
    drawn = remaining;

    context.clearRect(0, 0, LABEL_SIZE, LABEL_SIZE);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.font = `900 ${labelText.length > 10 ? 19 : 24}px Arial, sans-serif`;
    context.fillText(labelText, 128, 54);
    drawCashNote(context, 37, 90);
    context.font = '900 43px Arial, sans-serif';
    context.fillText(String(remaining), 172, 108);
    context.fillStyle = '#d8e2d1';
    context.font = '800 15px Arial, sans-serif';
    context.fillText(subtitle, 128, 174);
    texture.needsUpdate = true;
  };

  return { texture, redraw };
}

function createProceduralBase() {
  const group = new THREE.Group();
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
  group.add(rim, base);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return group;
}

/** Pool of flying bills, shared by every pad rather than one pool per system. */
export class CashFlightPool {
  constructor(parent, size = PAD.maxFlights) {
    this.group = new THREE.Group();
    this.group.name = 'Purchase_Cash_Flights';
    this.flights = [];
    parent.add(this.group);

    const billGeometry = new THREE.BoxGeometry(0.38, 0.035, 0.22);
    const accentGeometry = new THREE.BoxGeometry(0.14, 0.042, 0.11);
    const billMaterial = new THREE.MeshStandardMaterial({ color: 0x50e531, roughness: 0.68 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xd5ff78, roughness: 0.72 });

    for (let index = 0; index < size; index += 1) {
      const flight = new THREE.Group();
      flight.visible = false;
      const accent = new THREE.Mesh(accentGeometry, accentMaterial);
      accent.position.y = 0.006;
      flight.add(new THREE.Mesh(billGeometry, billMaterial), accent);
      flight.userData.active = false;
      flight.userData.start = new THREE.Vector3();
      flight.userData.end = new THREE.Vector3();
      this.group.add(flight);
      this.flights.push(flight);
    }
  }

  spawn(from, to, elapsed) {
    const flight = this.flights.find(({ userData }) => !userData.active);
    if (!flight) return;
    flight.userData.start.set(from.x + 0.18, from.y + 1.05, from.z);
    flight.userData.end.copy(to);
    flight.position.copy(flight.userData.start);
    flight.userData.startedAt = elapsed;
    flight.userData.active = true;
    flight.visible = true;
  }

  update(elapsed) {
    this.flights.forEach((flight) => {
      if (!flight.userData.active) return;
      const progress = THREE.MathUtils.clamp(
        (elapsed - flight.userData.startedAt) / PAD.flightDuration, 0, 1,
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

  dispose() {
    disposeObjectResources(this.group);
    this.group.removeFromParent();
  }
}

export class PurchasePad {
  /**
   * @param {object}   options
   * @param {THREE.Object3D} [options.baseModel] cloned Upgrade_CashPurchasePad; falls back
   *                                             to procedural geometry when unavailable.
   * @param {CashFlightPool} options.flights     shared bill pool
   */
  constructor({ id, cost, label, subtitle = 'SHOP EXPANSION', baseModel = null, flights }) {
    this.id = id;
    this.cost = cost;
    this.paid = 0;
    this.flights = flights;
    this._budget = 0;
    this._visualBudget = 0;
    this._target = new THREE.Vector3();

    this.group = new THREE.Group();
    this.group.name = `Purchase_Pad_${id}`;
    this.group.visible = false;

    const base = baseModel ?? createProceduralBase();
    this.coin = base.getObjectByName('PurchasePad_Coin') ?? null;
    this.ring = base.getObjectByName('PurchasePad_Ring') ?? null;
    // The pad ships with a COL_ proxy; a pad you cannot stand on is useless.
    base.traverse((object) => {
      if (object.isMesh && (object.name.startsWith('COL_') || object.userData?.is_collider)) {
        object.visible = false;
      }
    });

    this.label = createPadLabel(label, subtitle);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.62, 1.62),
      new THREE.MeshBasicMaterial({ map: this.label.texture, transparent: true, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.165;
    plane.renderOrder = 6;
    const labelPivot = new THREE.Group();
    labelPivot.rotation.y = -Math.PI * 0.75;
    labelPivot.add(plane);

    this.group.add(base, labelPivot);
    this.label.redraw(cost);
  }

  get remaining() {
    return Math.max(0, this.cost - this.paid);
  }

  get complete() {
    return this.paid >= this.cost;
  }

  placeAt(x, z, y = 0.04) {
    this.group.position.set(x, y, z);
    this._target.set(x, y + 0.25, z);
  }

  reset(cost, label, subtitle) {
    this.cost = cost;
    this.paid = 0;
    this._budget = 0;
    this._visualBudget = 0;
    if (label !== undefined) {
      this.label = createPadLabel(label, subtitle ?? 'SHOP EXPANSION');
    }
    this.label.redraw(cost);
  }

  /**
   * Drain the wallet while the player stands on the pad.
   * @returns {boolean} true on the frame the pad completes.
   */
  update(delta, elapsed, playerPosition, wallet) {
    if (!this.group.visible || this.complete) return false;

    const pulse = 1 + Math.sin(elapsed * 4.4) * 0.04;
    this.group.scale.setScalar(pulse);
    if (this.coin) {
      this.coin.rotation.y += delta * 2.4;
      this.coin.position.y = 0.28 + Math.sin(elapsed * 3.1) * 0.05;
    }
    if (this.ring) this.ring.rotation.y -= delta * 0.9;

    const deltaX = playerPosition.x - this.group.position.x;
    const deltaZ = playerPosition.z - this.group.position.z;
    if (deltaX * deltaX + deltaZ * deltaZ > PAD.radius * PAD.radius) {
      this._budget = 0;
      return false;
    }
    if (wallet.cash <= 0) return false;

    this._budget += delta * padDrainRate(this.cost);
    const requested = Math.min(Math.floor(this._budget), this.remaining);
    if (requested <= 0) return false;

    const spent = wallet.spendCash(requested);
    if (spent <= 0) return false;

    this._budget -= spent;
    this.paid += spent;
    this._visualBudget += spent;
    while (this._visualBudget >= PAD.cashPerFlight) {
      this._visualBudget -= PAD.cashPerFlight;
      this.flights.spawn(playerPosition, this._target, elapsed);
    }
    this.label.redraw(this.remaining);

    return this.complete;
  }

  dispose() {
    disposeObjectResources(this.group);
    this.group.removeFromParent();
  }
}
