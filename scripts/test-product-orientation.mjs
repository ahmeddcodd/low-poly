import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { orientConeProductUpright } from '../src/ice-cream-production.js';

function edgeRadius(mesh, upperEdge) {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.attributes.position;
  const vertices = [];
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
    vertices.push(point.clone());
  }
  const heights = vertices.map(({ y }) => y);
  const minimum = Math.min(...heights);
  const maximum = Math.max(...heights);
  const tolerance = (maximum - minimum) * 0.08 + 1e-6;
  const edge = vertices.filter(({ y }) => (
    upperEdge ? y >= maximum - tolerance : y <= minimum + tolerance
  ));
  return edge.reduce((sum, { x, z }) => sum + Math.hypot(x, z), 0) / edge.length;
}

const bytes = fs.readFileSync(new URL('../ice_cream_glb/products_all.glb', import.meta.url));
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new GLTFLoader().parseAsync(buffer, '');

for (const productName of ['Piece_Cone', 'Product_Vanilla_Cone']) {
  const source = gltf.scene.getObjectByName(productName);
  assert.ok(source, `missing ${productName}`);
  const product = source.clone(true);
  product.position.set(0, 0, 0);
  product.quaternion.identity();
  product.scale.setScalar(1);
  const body = product.getObjectByName(
    productName === 'Piece_Cone' ? 'Piece_Cone_Mesh' : `${productName}_Cone`,
  );
  assert.ok(body, `missing cone body for ${productName}`);
  assert.equal(orientConeProductUpright(product), true);
  product.updateMatrixWorld(true);
  assert.ok(edgeRadius(body, false) < edgeRadius(body, true), `${productName} tip must point downward`);
  assert.equal(orientConeProductUpright(product), false, `${productName} correction must be idempotent`);
}

console.log('product orientation tests passed');
