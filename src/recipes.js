// What the shop can actually sell, and what each order is worth.
//
// Every recipe here is backed by a real node in products_all.glb. That constrains the
// design in two ways worth knowing before editing:
//
//   1. The six authored doubles are cone-only and pair two DISTINCT flavors. There is no
//      double cup and no Vanilla_Vanilla.
//   2. Product_Sundae_Deluxe is a fixed model whose children are Sundae_Vanilla and
//      Sundae_Strawberry, so the sundae hard-requires those two machines.
//
// Node names follow a fixed flavor priority that is NOT the order MACHINE_DEFINITIONS
// uses. Resolving a pair naively yields e.g. "Product_Strawberry_Chocolate_Cone", which
// does not exist — and cloneAsset() throws on a missing node rather than falling back,
// so that would be a hard crash. Everything routes through canonicalPair() below.

import { FLAVOR_BONUS, RECIPE_TIER_WEIGHTS } from './tuning.js';

// The order product node names are built in. Do not reorder.
const NODE_FLAVOR_PRIORITY = Object.freeze(['vanilla', 'chocolate', 'strawberry', 'mint']);

const SUNDAE_FLAVORS = Object.freeze(['vanilla', 'strawberry']);

export const RECIPES = Object.freeze({
  'single-cone': Object.freeze({
    id: 'single-cone',
    label: 'Cone',
    container: 'cone',
    scoops: 1,
    base: 15,
    tier: 1,
    requiresStations: Object.freeze(['cone-dispenser']),
    minFlavors: 1,
  }),
  'single-cup': Object.freeze({
    id: 'single-cup',
    label: 'Cup',
    container: 'cup',
    scoops: 1,
    base: 22,
    tier: 2,
    requiresStations: Object.freeze(['cup-dispenser']),
    minFlavors: 1,
  }),
  'double-cone': Object.freeze({
    id: 'double-cone',
    label: 'Double',
    container: 'cone',
    scoops: 2,
    base: 40,
    tier: 3,
    requiresStations: Object.freeze(['cone-dispenser']),
    // Two distinct flavors — enforced by the authored product set, not just by design.
    minFlavors: 2,
    distinctFlavors: true,
  }),
  sundae: Object.freeze({
    id: 'sundae',
    label: 'Sundae',
    container: 'cup',
    scoops: 2,
    base: 95,
    tier: 4,
    requiresStations: Object.freeze(['cup-dispenser', 'basic-topping', 'spoon-wafer-dispenser']),
    // The model bakes in which two scoops it has.
    fixedFlavors: SUNDAE_FLAVORS,
    flatPrice: true,
  }),
});

const RECIPE_LIST = Object.freeze(Object.values(RECIPES));

/**
 * Sort a flavor pair into the order the authored product nodes use.
 * Without this, `['strawberry', 'chocolate']` resolves to a node that does not exist.
 */
export function canonicalPair(flavors) {
  return [...flavors].sort(
    (a, b) => NODE_FLAVOR_PRIORITY.indexOf(a) - NODE_FLAVOR_PRIORITY.indexOf(b),
  );
}

function capitalise(flavor) {
  return flavor.charAt(0).toUpperCase() + flavor.slice(1);
}

/**
 * Resolve an order to its node name in products_all.glb.
 * Returns null rather than a bad guess, so callers can fail soft instead of letting
 * cloneAsset throw.
 */
export function resolveProductNode(order) {
  const recipe = RECIPES[order.recipeId];
  if (!recipe) return null;

  if (recipe.id === 'sundae') return 'Product_Sundae_Deluxe';

  if (recipe.scoops === 2) {
    const pair = canonicalPair(order.flavors);
    if (pair.length !== 2 || pair[0] === pair[1]) return null;
    return `Product_${capitalise(pair[0])}_${capitalise(pair[1])}_Cone`;
  }

  const flavor = order.flavors[0];
  if (!flavor) return null;
  return `Product_${capitalise(flavor)}_${recipe.container === 'cup' ? 'Cup' : 'Cone'}`;
}

/**
 * Can the shop currently make this recipe, given owned machines and stations?
 */
export function isRecipeAvailable(recipe, { flavors, stations }) {
  const hasStations = (recipe.requiresStations ?? []).every((id) => stations.has(id));
  if (!hasStations) return false;

  if (recipe.fixedFlavors) return recipe.fixedFlavors.every((flavor) => flavors.has(flavor));
  return flavors.size >= (recipe.minFlavors ?? 1);
}

export function availableRecipes(context) {
  return RECIPE_LIST.filter((recipe) => isRecipeAvailable(recipe, context));
}

/**
 * Roll an order, weighted toward the richest recipe the shop can make so the average
 * ticket climbs as the menu grows rather than being diluted by cheap cones.
 */
export function rollOrder(context, random = Math.random) {
  const available = availableRecipes(context);
  if (available.length === 0) return null;

  const bestTier = available.reduce((max, recipe) => Math.max(max, recipe.tier), 0);
  const weighted = available.map((recipe) => {
    const stepsBelowBest = Math.min(bestTier - recipe.tier, RECIPE_TIER_WEIGHTS.length - 1);
    return { recipe, weight: RECIPE_TIER_WEIGHTS[stepsBelowBest] };
  });

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  const picked = weighted.find((entry) => {
    roll -= entry.weight;
    return roll <= 0;
  }) ?? weighted[weighted.length - 1];

  return buildOrder(picked.recipe, context, random);
}

function buildOrder(recipe, { flavors }, random) {
  const owned = [...flavors];
  let chosen;

  if (recipe.fixedFlavors) {
    chosen = [...recipe.fixedFlavors];
  } else if (recipe.scoops === 2) {
    const first = owned[Math.floor(random() * owned.length)];
    const rest = owned.filter((flavor) => flavor !== first);
    chosen = canonicalPair([first, rest[Math.floor(random() * rest.length)]]);
  } else {
    chosen = [owned[Math.floor(random() * owned.length)]];
  }

  return {
    recipeId: recipe.id,
    container: recipe.container,
    flavors: chosen,
    // Tray tier fills this in; 1 until batching lands.
    quantity: 1,
  };
}

/**
 * (recipeBase + per-scoop flavor bonus + menu bonuses) x quantity x tip x profit.
 * Sundaes price flat because the model is not parameterised by flavor.
 */
export function priceOrder(order, {
  menuBonuses = null,
  tipMultiplier = 1,
  profitMultiplier = 1,
} = {}) {
  const recipe = RECIPES[order.recipeId];
  if (!recipe) return 0;

  const flavorTotal = recipe.flatPrice
    ? 0
    : order.flavors.reduce((sum, flavor) => sum + (FLAVOR_BONUS[flavor] ?? 0), 0);
  const bonus = menuBonuses?.get(recipe.id) ?? 0;
  const unit = recipe.base + flavorTotal + bonus;

  return Math.round(unit * (order.quantity ?? 1) * tipMultiplier * profitMultiplier);
}

export function recipeLabel(order) {
  const recipe = RECIPES[order.recipeId];
  if (!recipe) return '';
  if (recipe.id === 'sundae') return 'SUNDAE';
  return order.flavors.map((flavor) => flavor.toUpperCase()).join(' + ');
}
