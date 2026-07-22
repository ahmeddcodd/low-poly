import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CharacterSystem,
  CUSTOMER_QUEUE_CONTAINERS,
  CUSTOMER_QUEUE_LANES,
} from '../src/character-system.js';
import {
  createCounterStockDisplay,
  IceCreamProductionSystem,
  MAX_ORDER_AMOUNT,
} from '../src/ice-cream-production.js';

assert.deepEqual(CUSTOMER_QUEUE_CONTAINERS, ['cone', 'cup']);
assert.equal(CUSTOMER_QUEUE_LANES.cone.length, 4);
assert.equal(CUSTOMER_QUEUE_LANES.cup.length, 4);
assert.equal(MAX_ORDER_AMOUNT, 3);

const productAssets = new THREE.Group();
const coneAsset = new THREE.Group();
coneAsset.name = 'Product_Vanilla_Cone';
const cupAsset = new THREE.Group();
cupAsset.name = 'Product_Vanilla_Cup';
productAssets.add(coneAsset, cupAsset);
const coneStockDisplay = createCounterStockDisplay(productAssets, 'cone');
const cupStockDisplay = createCounterStockDisplay(productAssets, 'cup');
assert.equal(coneStockDisplay.products.length, 9);
assert.equal(cupStockDisplay.products.length, 9);
assert.equal(coneStockDisplay.group.name, 'Counter_Stock_cone');
assert.equal(cupStockDisplay.group.name, 'Counter_Stock_cup');

function customer(id, container, queueIndex, amount) {
  return {
    definition: { id, role: 'customer' },
    model: new THREE.Group(),
    state: queueIndex === 0 ? 'ordering' : 'queued',
    queueContainer: container,
    queueIndex,
    order: Object.freeze({ container, amount }),
    route: [],
    routeIndex: 0,
  };
}

const characters = new CharacterSystem();
const coneFront = customer('cone-front', 'cone', 0, 2);
const coneNext = customer('cone-next', 'cone', 1, 1);
const cupFront = customer('cup-front', 'cup', 0, 3);
const cupNext = customer('cup-next', 'cup', 1, 2);
characters.customers = [coneFront, coneNext, cupFront, cupNext];

assert.equal(characters.getFrontCustomer('cone'), coneFront);
assert.equal(characters.getFrontCustomer('cup'), cupFront);
assert.deepEqual(characters.getFrontCustomers(), [coneFront, cupFront]);

const coneService = characters.serveFrontCustomer(
  1,
  Object.freeze({ flavor: 'vanilla', container: 'cone', amount: 2 }),
);
assert.equal(coneService.ok, true);
assert.equal(coneFront.state, 'paying');
assert.equal(coneNext.queueIndex, 0);
assert.equal(cupFront.queueIndex, 0, 'serving the cone line shifted the cup line');
assert.equal(cupNext.queueIndex, 1, 'serving the cone line shifted a waiting cup');

const production = Object.create(IceCreamProductionSystem.prototype);
const stockCone = customer('stock-cone', 'cone', 0, 2);
const stockCup = customer('stock-cup', 'cup', 0, 3);
const served = [];
const payments = [];
production.counterStock = { cone: 2, cup: 1 };
production.counterStockDisplays = new Map();
production.orderBubbles = new Map();
production.hiringSystem = { profitMultiplier: 1 };
production.stage = 'waiting';
production.servedCount = 0;
production.nextOrderAt = 0;
production._syncCounterStock = () => {};
production._showCustomerProduct = (servedCustomer, order) => {
  served.push({ customer: servedCustomer, order });
};
production._addPendingCash = (amount) => {
  payments.push(amount);
};
production._setStatus = () => {};
production.characterSystem = {
  getFrontCustomer(container) {
    return container === 'cone' ? stockCone : stockCup;
  },
  serveFrontCustomer(_elapsed, order) {
    const servedCustomer = order.container === 'cone' ? stockCone : stockCup;
    return { ok: true, customer: servedCustomer };
  },
};

assert.equal(production._tryFulfillWaitingCustomers(2), true);
assert.equal(production.counterStock.cone, 0);
assert.equal(production.counterStock.cup, 1, 'cup stock was consumed before meeting cup demand');
assert.equal(production.servedCount, 1);
assert.deepEqual(payments, [30]);
assert.equal(served.length, 1);
assert.equal(served[0].customer, stockCone);
assert.deepEqual(served[0].order, { flavor: 'vanilla', container: 'cone', amount: 2 });

console.log('dual queue and counter inventory tests passed');
