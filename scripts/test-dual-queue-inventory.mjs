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

assert.deepEqual(CUSTOMER_QUEUE_CONTAINERS, ['cup']);
assert.equal(CUSTOMER_QUEUE_LANES.cup.length, 8);
assert.equal(MAX_ORDER_AMOUNT, 3);

const productAssets = new THREE.Group();
const cupAsset = new THREE.Group();
cupAsset.name = 'Product_Vanilla_Cup';
productAssets.add(cupAsset);
const cupStockDisplay = createCounterStockDisplay(productAssets, 'cup');
assert.equal(cupStockDisplay.products.length, 9);
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
const cupFront = customer('cup-front', 'cup', 0, 3);
const cupNext = customer('cup-next', 'cup', 1, 2);
characters.customers = [cupFront, cupNext];

assert.equal(characters.getFrontCustomer('cup'), cupFront);
assert.deepEqual(characters.getFrontCustomers(), [cupFront]);

const cupService = characters.serveFrontCustomer(
  1,
  Object.freeze({ flavor: 'vanilla', container: 'cup', amount: 3 }),
);
assert.equal(cupService.ok, true);
assert.equal(cupFront.state, 'paying');
assert.equal(cupNext.queueIndex, 0);

const production = Object.create(IceCreamProductionSystem.prototype);
const stockCup = customer('stock-cup', 'cup', 0, 3);
const served = [];
const payments = [];
production.counterStock = { cup: 3 };
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
    assert.equal(container, 'cup');
    return stockCup;
  },
  serveFrontCustomer(_elapsed, order) {
    return { ok: true, customer: stockCup };
  },
};

assert.equal(production._tryFulfillWaitingCustomers(2), true);
assert.equal(production.counterStock.cup, 0);
assert.equal(production.servedCount, 1);
assert.deepEqual(payments, [60]);
assert.equal(served.length, 1);
assert.equal(served[0].customer, stockCup);
assert.deepEqual(served[0].order, { flavor: 'vanilla', container: 'cup', amount: 3 });

console.log('cup queue and counter inventory tests passed');
