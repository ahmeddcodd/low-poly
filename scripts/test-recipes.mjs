// Regression tests for the menu.
//
// Two real bugs motivated this file:
//   1. Double-scoop product nodes follow a fixed flavour priority (vanilla, chocolate,
//      strawberry, mint) that is NOT the order MACHINE_DEFINITIONS uses. Resolving a pair
//      naively produced names like Product_Strawberry_Chocolate_Cone, which do not exist,
//      and cloneAsset() throws on a missing node — a hard crash mid-order.
//   2. requiresStations was written with catalog ids ('cone-dispenser') while the runtime
//      reports station keys ('cone'), so no recipe was ever available and the shop silently
//      stopped taking orders.
//
// Run: node scripts/test-recipes.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const { RECIPES, resolveProductNode, priceOrder, rollOrder, ALL_PRODUCT_NODES } =
  await import(pathToFileURL(path.join(root, 'src', 'recipes.js')).href);

const buf = fs.readFileSync(path.join(root, 'ice_cream_glb', 'products_all.glb'));
const gltf = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
const nodes = new Set(gltf.nodes.map((n) => n.name).filter(Boolean));

const FLAVORS = ['vanilla', 'chocolate', 'strawberry', 'mint'];
let failures = 0;
const check = (ok, message) => {
  if (!ok) { failures += 1; console.error('  FAIL ' + message); }
};

// Every product the code can ask for must exist in the GLB.
for (const name of ALL_PRODUCT_NODES) {
  check(nodes.has(name), `ALL_PRODUCT_NODES lists a missing node: ${name}`);
}

// Singles, both containers.
for (const flavor of FLAVORS) {
  for (const recipeId of ['single-cone', 'single-cup']) {
    const node = resolveProductNode({ recipeId, flavors: [flavor] });
    check(node && nodes.has(node), `${recipeId} [${flavor}] -> ${node}`);
  }
}

// Every flavour pair in BOTH input orders must canonicalise to the same real node.
for (let i = 0; i < FLAVORS.length; i += 1) {
  for (let j = 0; j < FLAVORS.length; j += 1) {
    if (i === j) continue;
    const node = resolveProductNode({ recipeId: 'double-cone', flavors: [FLAVORS[i], FLAVORS[j]] });
    check(node && nodes.has(node), `double [${FLAVORS[i]},${FLAVORS[j]}] -> ${node}`);
  }
}
check(
  resolveProductNode({ recipeId: 'double-cone', flavors: ['mint', 'mint'] }) === null,
  'a same-flavour double must fail soft, not resolve to a bogus node',
);
check(nodes.has(resolveProductNode({ recipeId: 'sundae', flavors: ['vanilla', 'strawberry'] })), 'sundae node');

// Prices must match the design table.
const priced = [
  [{ recipeId: 'single-cone', flavors: ['vanilla'], quantity: 1 }, 15],
  [{ recipeId: 'single-cone', flavors: ['mint'], quantity: 1 }, 29],
  [{ recipeId: 'single-cup', flavors: ['vanilla'], quantity: 1 }, 22],
  [{ recipeId: 'double-cone', flavors: ['strawberry', 'mint'], quantity: 1 }, 62],
  [{ recipeId: 'sundae', flavors: ['vanilla', 'strawberry'], quantity: 1 }, 95],
];
for (const [order, want] of priced) {
  const got = priceOrder(order);
  check(got === want, `price ${order.recipeId} ${order.flavors} = ${got}, want ${want}`);
}

// Station keys must be the runtime keys, not catalog ids. If this regresses, rollOrder
// returns null forever and the shop silently stops taking orders.
const menus = [
  { flavors: new Set(['vanilla']), stations: new Set(['cone']) },
  { flavors: new Set(['vanilla', 'chocolate']), stations: new Set(['cone', 'cup']) },
  { flavors: new Set(FLAVORS), stations: new Set(['cone', 'cup', 'topping', 'spoon']) },
];
const averages = [];
for (const menu of menus) {
  let total = 0;
  let rolled = 0;
  for (let i = 0; i < 4000; i += 1) {
    const order = rollOrder(menu);
    check(Boolean(order), 'rollOrder returned null for a menu that can make something');
    if (!order) break;
    const node = resolveProductNode(order);
    check(node && nodes.has(node), `rolled an unresolvable order: ${JSON.stringify(order)}`);
    total += priceOrder(order);
    rolled += 1;
  }
  averages.push(rolled ? total / rolled : 0);
}

// The whole point of the tier weighting: a bigger menu must be worth more per order.
for (let i = 1; i < averages.length; i += 1) {
  check(averages[i] > averages[i - 1] * 1.2,
    `average ticket must climb with the menu: ${averages.map((a) => a.toFixed(2)).join(' -> ')}`);
}

// An empty shop can make nothing at all.
check(rollOrder({ flavors: new Set(), stations: new Set() }) === null, 'empty shop rolls nothing');
check(rollOrder({ flavors: new Set(['vanilla']), stations: new Set() }) === null, 'no dispenser rolls nothing');

console.log(`average ticket by menu: ${averages.map((a) => '$' + a.toFixed(2)).join('  ->  ')}`);
console.log(failures === 0 ? 'recipes: all checks passed' : `recipes: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
