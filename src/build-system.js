// Drives everything the player can build. Replaces the old 10-step linear story with a
// data-driven catalog, ghost holograms, and pads that can be live several at a time.
//
// The one rule that keeps this simple: effects are never applied incrementally. Any change
// to the owned set recomputes ALL derived state from scratch via _applyOwnedSet() and pushes
// it down to the systems that own it. Every one of those setters is an idempotent
// set-replacement, so loading a save is just "assign owned, recompute once" — no replay
// ordering, no already-applied bookkeeping.

import * as THREE from 'three';
import { CATALOG, CATALOG_BY_ID, OPENING_CHAIN, padSubtitle } from './catalog.js';
import { LEVELS, MAX_LEVEL, PAD, levelForStars, nextLevelFor } from './tuning.js';
import { CashFlightPool, PurchasePad } from './purchase-pad.js';
import { cloneAsset, disposeObjectResources, hasAsset } from './gltf-utils.js';

// Matches the authored Ghost_Locked material in trays_support_all.glb so procedural
// ghosts are indistinguishable from the ones that shipped with holograms.
const GHOST_COLOR = 0x89f1c1;
const GHOST_OPACITY = 0.3;
// Only a few pads are live during normal play, but a returning player can come back to a
// backlog — a level-4 save with nothing bought already wants 6. Each pad costs one label
// canvas, so this is cheap; pooling 27 would not be.
const PAD_POOL_SIZE = 8;

// Act 1 is the only place the copy is hand-written; everything after it reads well enough
// generated from the catalog label.
const OPENING_HINTS = Object.freeze({
  'serving-counter': 'Build the serving counter',
  'vanilla-machine': 'Now add an ice cream machine',
  'cone-dispenser': 'Last one — add a cone dispenser',
});

function createGhostMaterial() {
  return new THREE.MeshStandardMaterial({
    color: GHOST_COLOR,
    emissive: GHOST_COLOR,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: GHOST_OPACITY,
    depthWrite: false,
    roughness: 0.5,
  });
}

/**
 * Turn any instance into a hologram. Six buildables — the whole counter pack, plus the
 * napkin holder and syrup bottles — ship no authored Ghost_* node, and the counter is the
 * very first thing the player buys. So ghosts are generated, and the authored ones are
 * simply a nicer starting mesh.
 *
 * All ghosts share one material: tinting per-ghost for affordability would force a clone
 * per instance and break batching. Affordability is shown on the pad instead.
 */
function makeGhost(source, material) {
  const ghost = source.clone(true);
  const strip = [];
  ghost.traverse((object) => {
    if (!object.isMesh) return;
    if (object.name.startsWith('COL_') || object.userData?.is_collider) {
      strip.push(object);
      return;
    }
    object.material = material;
    // A 30%-alpha hologram casting an opaque shadow reads as a bug.
    object.castShadow = false;
    object.receiveShadow = false;
    object.renderOrder = 3;
  });
  strip.forEach((object) => object.removeFromParent());
  ghost.position.set(0, 0, 0);
  ghost.quaternion.identity();
  ghost.scale.setScalar(1);
  return ghost;
}

export class BuildSystem {
  constructor({ shop, production, characters, hiring, supportsScene }) {
    this.shop = shop;
    this.production = production;
    this.characters = characters;
    this.hiring = hiring;
    this.supportsScene = supportsScene;

    this.group = new THREE.Group();
    this.group.name = 'Shop_Build_System';

    this.owned = new Set();
    this.stars = 0;
    this.level = 1;
    this.revision = 0;
    this.shopOpen = false;
    this.onShopOpen = null;
    this.onPurchase = null;
    this.onLevelUp = null;

    this.ghostMaterial = createGhostMaterial();
    this.ghosts = new Map();
    this.reveals = [];
    this.flights = new CashFlightPool(this.group);

    this.padPool = [];
    this.activePads = new Map();

    this._buildGhosts();
    this._buildPadPool();
    this._applyOwnedSet();
    this._syncAvailability();
    this.characters.setSpawnInterval?.(this.spawnInterval);
  }

  // ── construction ────────────────────────────────────────────────────────────

  _buildGhosts() {
    CATALOG.forEach((entry) => {
      if (entry.padless || !entry.position) return;

      let source = null;
      if (entry.ghost && hasAsset(this.supportsScene, entry.ghost)) {
        source = cloneAsset(this.supportsScene, entry.ghost);
      } else {
        // No authored hologram — derive one from the real thing once it exists.
        source = this._deriveGhostSource(entry);
      }
      if (!source) return;

      const ghost = makeGhost(source, this.ghostMaterial);
      ghost.name = `Ghost_${entry.id}`;
      ghost.position.set(...entry.position);
      ghost.rotation.y = entry.rotation ?? 0;
      ghost.visible = false;
      this.ghosts.set(entry.id, ghost);
      this.group.add(ghost);
    });
  }

  /**
   * For catalog entries with no authored ghost, borrow the real model. Furniture lives in
   * ice-cream-shop.js and machines/supports in ice-cream-production.js, so ask whichever
   * owns it. Returns null when there is nothing to mirror (abstract upgrades), in which
   * case the entry simply gets a pad and no hologram.
   */
  _deriveGhostSource(entry) {
    const effect = entry.effect;
    if (effect.type === 'furniture' || effect.type === 'table') {
      const ids = effect.type === 'table' ? [effect.id] : effect.ids;
      const instance = this.shop.getFurnitureInstance?.(ids[0]);
      return instance ?? null;
    }
    if (effect.type === 'station' && hasAsset(this.supportsScene, effect.asset ?? '')) {
      return cloneAsset(this.supportsScene, effect.asset);
    }
    return null;
  }

  _buildPadPool() {
    // Only a handful are ever live; one pad per catalog entry would mean 28 label
    // canvases sitting in VRAM.
    for (let index = 0; index < PAD_POOL_SIZE; index += 1) {
      const pad = new PurchasePad({
        id: `pool-${index}`,
        cost: 0,
        label: '',
        flights: this.flights,
      });
      this.group.add(pad.group);
      this.padPool.push(pad);
    }
  }

  // ── derived state ───────────────────────────────────────────────────────────

  /**
   * Recompute every piece of derived state from the owned set and push it down.
   * Called after each purchase and once on load. Never mutates incrementally.
   */
  _applyOwnedSet() {
    const flavors = [];
    const stations = new Set();
    const furniture = [];
    const tables = [];
    const menuBonuses = new Map();
    const modules = new Set();
    let trayCapacity = 1;
    let counterBuffer = 0;
    let storageCapacity = 0;
    let patienceBonus = 0;
    let takeawayShare = 0;

    this.owned.forEach((id) => {
      const effect = CATALOG_BY_ID.get(id)?.effect;
      if (!effect) return;
      switch (effect.type) {
        case 'flavor': flavors.push(effect.flavor); break;
        case 'station':
          stations.add(effect.id);
          if (effect.replaces) stations.delete(effect.replaces);
          break;
        case 'furniture': furniture.push(...effect.ids); break;
        case 'table': tables.push(effect.id); break;
        case 'tray': trayCapacity = Math.max(trayCapacity, effect.capacity); break;
        case 'counterBuffer': counterBuffer = Math.max(counterBuffer, effect.capacity); break;
        case 'storage': storageCapacity = Math.max(storageCapacity, effect.capacity); break;
        case 'patience': patienceBonus += effect.bonusSeconds; break;
        case 'takeaway': takeawayShare = Math.max(takeawayShare, effect.share); break;
        case 'menuBonus': menuBonuses.set(effect.recipe, (menuBonuses.get(effect.recipe) ?? 0) + effect.bonus); break;
        case 'machineModule': modules.add(effect.module); break;
        case 'office': break; // handled in _syncAvailability
        default: break;
      }
    });

    this.derived = Object.freeze({
      flavors, stations, furniture, tables, menuBonuses, modules,
      trayCapacity, counterBuffer, storageCapacity, patienceBonus, takeawayShare,
    });

    this.production.setUnlockedFlavors(flavors);
    this.production.setUnlockedSupports?.([...stations]);
    this.production.setMenuBonuses?.(menuBonuses);
    this.shop.setVisibleFurniture?.([...furniture, ...tables]);
    this.characters.setUnlockedDiningTables(tables);
    this.characters.setPatienceBonus?.(patienceBonus);
    this.characters.setTakeawayShare?.(takeawayShare);

    // The shop opens the moment it can actually serve someone.
    const canServe = furniture.includes('main-serving-counter')
      && flavors.length > 0
      && (stations.has('cone-dispenser') || stations.has('cup-dispenser'));
    if (canServe && !this.shopOpen) {
      this.shopOpen = true;
      this.characters.setCustomerSpawningEnabled?.(true);
      this.onShopOpen?.();
    }
  }

  /** Which catalog entries are revealed right now. */
  _isAvailable(entry) {
    if (this.owned.has(entry.id)) return false;
    if (entry.level > this.level) return false;
    if ((entry.requires ?? []).some((id) => !this.owned.has(id))) return false;
    // Act 1 stays strictly linear so the opening has zero cognitive load.
    const openingIndex = OPENING_CHAIN.indexOf(entry.id);
    if (openingIndex > 0 && !this.owned.has(OPENING_CHAIN[openingIndex - 1])) return false;
    return true;
  }

  get availableEntries() {
    return CATALOG.filter((entry) => this._isAvailable(entry));
  }

  /** Show ghosts and assign pads for everything currently available. */
  _syncAvailability() {
    // Padless entries are reveals, not purchases — the office hire pad charges its own
    // cost inside the room. Take ownership the moment they unlock, or they linger forever
    // as the cheapest "next target" and the catalog can never read as complete.
    const pendingReveals = CATALOG.filter(
      (entry) => entry.padless && this._isAvailable(entry),
    );
    if (pendingReveals.length > 0) {
      pendingReveals.forEach((entry) => this.owned.add(entry.id));
      this._applyOwnedSet();
      this.revision += 1;
    }

    const available = this.availableEntries;
    const availableIds = new Set(available.map(({ id }) => id));

    this.ghosts.forEach((ghost, id) => {
      ghost.visible = availableIds.has(id);
    });

    // Release pads whose entry is no longer available.
    [...this.activePads.entries()].forEach(([id, pad]) => {
      if (availableIds.has(id)) return;
      pad.group.visible = false;
      this.activePads.delete(id);
    });

    available
      .filter((entry) => !entry.padless && !this.activePads.has(entry.id))
      .forEach((entry) => {
        const pad = this.padPool.find((candidate) => !candidate.group.visible);
        if (!pad) {
          // Never fail silently — a missing pad reads to the player as missing content.
          console.warn(`[build] pad pool exhausted, "${entry.id}" has no pad this frame`);
          return;
        }
        pad.reset(entry.cost, entry.label, padSubtitle(entry.id));
        const [x, z] = entry.padAt ?? [entry.position[0], entry.position[2]];
        pad.placeAt(x, z);
        pad.group.visible = true;
        this.activePads.set(entry.id, pad);
      });

    // Manager offices reveal their own hire pad rather than getting a shop-floor pad.
    ['gym-manager', 'wc-manager'].forEach((managerId) => {
      const entry = CATALOG.find((candidate) => candidate.effect.managerId === managerId);
      const unlocked = Boolean(entry) && (this.owned.has(entry.id) || this._isAvailable(entry));
      this.hiring.setHiringAvailable(managerId, unlocked);
    });
  }

  // ── progression ─────────────────────────────────────────────────────────────

  addStars(count) {
    if (count <= 0) return;
    this.stars += count;
    const next = levelForStars(this.stars);
    if (next.level === this.level) return;

    const previous = this.level;
    this.level = next.level;
    this.revision += 1;
    this._syncAvailability();
    // A higher-level shop is a busier shop — this is both the balance knob and the
    // visible reward for levelling.
    this.characters.setSpawnInterval?.(this.spawnInterval);
    this.onLevelUp?.(this.level, previous);
  }

  _purchase(entry, elapsed) {
    this.owned.add(entry.id);
    this.revision += 1;

    const revealed = this._collectRevealTargets(entry);
    this._applyOwnedSet();
    this._queueReveal(revealed, elapsed);

    const ghost = this.ghosts.get(entry.id);
    if (ghost) ghost.visible = false;

    // A purchase can drop furniture on top of the player.
    this.characters.resolvePlayerCollisionOverlap();
    this.characters.playPlayerAction('Celebrate', 0.7);
    this._syncAvailability();
    this.onPurchase?.(entry);
  }

  /**
   * Objects to scale-pop after a purchase. Collected before _applyOwnedSet so we can
   * diff what became visible.
   */
  _collectRevealTargets(entry) {
    const effect = entry.effect;
    if (effect.type === 'flavor') {
      const machine = this.production.getMachineModel?.(effect.flavor);
      return machine ? [machine] : [];
    }
    if (effect.type === 'station') {
      const model = this.production.getSupportModel?.(effect.id);
      return model ? [model] : [];
    }
    if (effect.type === 'furniture' || effect.type === 'table') {
      const ids = effect.type === 'table' ? [effect.id] : effect.ids;
      return ids.map((id) => this.shop.getFurnitureInstance?.(id)).filter(Boolean);
    }
    return [];
  }

  _queueReveal(objects, elapsed) {
    objects.filter(Boolean).forEach((object) => {
      const finalScale = object.scale.clone();
      object.scale.setScalar(0.001);
      object.visible = true;
      this.reveals.push({ object, finalScale, startedAt: elapsed });
    });
  }

  _updateReveals(elapsed) {
    this.reveals = this.reveals.filter((reveal) => {
      const progress = THREE.MathUtils.clamp(
        (elapsed - reveal.startedAt) / PAD.revealDuration, 0, 1,
      );
      const overshoot = 1 + Math.sin(progress * Math.PI) * PAD.revealOvershoot;
      reveal.object.scale.copy(reveal.finalScale).multiplyScalar(progress * overshoot);
      return progress < 1;
    });
  }

  // ── frame ───────────────────────────────────────────────────────────────────

  update(delta, elapsed, playerPosition) {
    this.flights.update(elapsed);
    this._updateReveals(elapsed);

    const wallet = this.production;
    let completedId = null;
    this.activePads.forEach((pad, id) => {
      if (completedId) return;
      if (pad.update(delta, elapsed, playerPosition, wallet)) completedId = id;
    });

    if (!completedId) return;
    const pad = this.activePads.get(completedId);
    if (pad) pad.group.visible = false;
    this.activePads.delete(completedId);
    const entry = CATALOG_BY_ID.get(completedId);
    if (entry) this._purchase(entry, elapsed);
  }

  // ── save / restore ──────────────────────────────────────────────────────────

  serialize() {
    return {
      owned: [...this.owned],
      stars: this.stars,
      padPaid: Object.fromEntries(
        [...this.activePads].map(([id, pad]) => [id, pad.paid]).filter(([, paid]) => paid > 0),
      ),
    };
  }

  restore({ owned = [], stars = 0, padPaid = {} } = {}) {
    // Filter against the live catalog so deleting an entry never breaks an old save.
    this.owned = new Set(owned.filter((id) => CATALOG_BY_ID.has(id)));
    this.stars = stars;
    this.level = levelForStars(stars).level;
    this._applyOwnedSet();
    this._syncAvailability();
    this.characters.setSpawnInterval?.(this.spawnInterval);
    Object.entries(padPaid).forEach(([id, paid]) => {
      const pad = this.activePads.get(id);
      if (!pad) return;
      pad.paid = Math.min(paid, pad.cost);
      pad.refreshLabel();
    });
    this.revision += 1;
  }

  // ── HUD surface (same shape the old story system exposed) ───────────────────

  get complete() {
    return this.owned.size >= CATALOG.length;
  }

  get nextTarget() {
    return this.availableEntries.sort((a, b) => a.cost - b.cost)[0] ?? null;
  }

  get nextTitle() {
    if (this.complete) return 'Ice cream empire complete!';
    const target = this.nextTarget;
    if (!target) return `Serve customers to reach level ${this.level + 1}`;
    return `${target.label} — $${target.cost}`;
  }

  get nextDetail() {
    if (this.complete) return 'Every machine, station and upgrade is built';
    const target = this.nextTarget;
    if (!target) {
      const next = nextLevelFor(this.level);
      return next ? `${this.stars}/${next.stars} stars to the next unlock` : 'Max level reached';
    }
    return `Stand on the ${target.label.toLowerCase()} pad to build it`;
  }

  get progressPercent() {
    return Math.round((this.owned.size / CATALOG.length) * 100);
  }

  /**
   * What the player should be doing right now, whenever they are not mid-order.
   * Before this existed the banner just said "Customer approaching" forever — including
   * through the entire cold open, when there were no customers and no counter.
   */
  get guidance() {
    const cash = this.production.cash;
    const target = this.nextTarget;

    // Cold open: the shop cannot serve anyone yet, so the only job is building.
    if (!this.shopOpen) {
      if (!target) return { title: 'Opening up…', detail: 'Getting the shop ready' };
      // Read live rather than from update(), because production.update() — which asks for
      // this guidance — runs before buildSystem.update() each frame.
      const outside = (this.characters.player?.model.position.z ?? 0) > 7.2;
      if (outside && this.owned.size === 0) {
        return {
          title: 'Welcome to your shop',
          detail: 'Head in through the front door — you have $500 to spend',
        };
      }
      const step = OPENING_CHAIN.indexOf(target.id);
      const remaining = OPENING_CHAIN.length - step;
      return {
        title: OPENING_HINTS[target.id] ?? `Build the ${target.label.toLowerCase()}`,
        detail: cash >= target.cost
          ? `Stand on the green pad to spend $${target.cost}`
          + (remaining > 1 ? ` — ${remaining - 1} more to open` : ' — this one opens the shop!')
          : `You need $${target.cost - cash} more`,
      };
    }

    if (this.complete) {
      return { title: 'Your ice cream empire is complete!', detail: 'Every machine, station and upgrade is built' };
    }

    if (!target) {
      const next = nextLevelFor(this.level);
      if (!next) return { title: 'Max level reached', detail: 'Keep serving — the shop is yours' };
      const needed = Math.max(1, next.stars - this.stars);
      return {
        title: `Serve ${needed} more customer${needed === 1 ? '' : 's'}`,
        detail: `Level ${next.level} unlocks the next upgrade`,
      };
    }

    if (cash >= target.cost) {
      return {
        title: `You can afford the ${target.label.toLowerCase()}!`,
        detail: `Stand on its green pad to build it — $${target.cost}`,
      };
    }
    return {
      title: `Saving for the ${target.label.toLowerCase()}`,
      detail: `$${target.cost - cash} to go — keep serving customers`,
    };
  }

  get levelProgress() {
    const next = nextLevelFor(this.level);
    if (!next) return { level: this.level, stars: this.stars, goal: this.stars, percent: 100 };
    const floor = LEVELS.find((entry) => entry.level === this.level)?.stars ?? 0;
    const span = Math.max(1, next.stars - floor);
    return {
      level: this.level,
      stars: this.stars,
      goal: next.stars,
      percent: Math.round(THREE.MathUtils.clamp((this.stars - floor) / span, 0, 1) * 100),
    };
  }

  get spawnInterval() {
    return LEVELS.find((entry) => entry.level === this.level)?.spawnInterval
      ?? LEVELS[LEVELS.length - 1].spawnInterval;
  }

  get maxLevel() {
    return MAX_LEVEL;
  }

  get unlockedFlavors() {
    return this.production.unlockedFlavorIds;
  }

  get unlockedTables() {
    return this.characters.unlockedDiningTableIds;
  }

  dispose() {
    this.padPool.forEach((pad) => pad.dispose());
    this.flights.dispose();
    this.ghostMaterial.dispose();
    disposeObjectResources(this.group);
    this.group.removeFromParent();
  }
}
