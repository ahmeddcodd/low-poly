import * as THREE from 'three';
import { WORLD_CONFIG } from './config.js';

const LOCKED_ZOOM = 0.58;

export class IsometricCameraController {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(...WORLD_CONFIG.center);
    this.goalTarget = this.target.clone();
    this.defaultTarget = this.target.clone();
    this.aspect = 1;
    this.viewHeight = 30;
    this.baseViewHeight = 30;
    this._direction = new THREE.Vector3(-1, 1.35, -1).normalize();
    this._offset = new THREE.Vector3();
  }

  _clampTarget() {
    const bounds = WORLD_CONFIG.panBounds;
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x, bounds.minX, bounds.maxX);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z, bounds.minZ, bounds.maxZ);
  }

  resize(width, height) {
    this.aspect = Math.max(width / Math.max(height, 1), 0.25);
    this.baseViewHeight = this.aspect < 0.8
      ? 22.5
      : Math.max(12.5, 19 / this.aspect);
    this._direction
      .set(this.aspect < 0.8 ? -0.28 : -1, this.aspect < 0.8 ? 1.55 : 1.35, -1)
      .normalize();
    this._updateProjection(true);
  }

  follow(position) {
    const [offsetX, , offsetZ] = WORLD_CONFIG.cameraFollowOffset;
    this.goalTarget.set(position.x + offsetX, 0, position.z + offsetZ);
    this._clampTarget();
  }

  reset(position) {
    if (position) this.follow(position);
    else this.goalTarget.copy(this.defaultTarget);
  }

  update(delta) {
    const damping = 1 - Math.exp(-10 * Math.min(delta, 0.05));
    this.target.lerp(this.goalTarget, damping);
    this._updateProjection(false);

    this._offset.copy(this._direction).multiplyScalar(42);
    this.camera.position.copy(this.target).add(this._offset);
    this.camera.lookAt(this.target.x, 0, this.target.z);
    this.camera.updateMatrixWorld();
  }

  _updateProjection(force) {
    const nextHeight = this.baseViewHeight * LOCKED_ZOOM;
    if (!force && Math.abs(nextHeight - this.viewHeight) < 0.002) return;

    this.viewHeight = nextHeight;
    const halfHeight = this.viewHeight / 2;
    const halfWidth = halfHeight * this.aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {}
}
