import * as THREE from 'three';
import { WORLD_CONFIG } from './config.js';

const MIN_ZOOM = 0.58;
const DEFAULT_ZOOM = 0.72;
const MAX_ZOOM = 1.72;

export class IsometricCameraController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.target = new THREE.Vector3(...WORLD_CONFIG.center);
    this.goalTarget = this.target.clone();
    this.defaultTarget = this.target.clone();
    this.zoom = DEFAULT_ZOOM;
    this.goalZoom = DEFAULT_ZOOM;
    this.aspect = 1;
    this.viewHeight = 30;
    this.baseViewHeight = 30;
    this.pointers = new Map();
    this.previousPinchDistance = 0;
    this._direction = new THREE.Vector3(-1, 1.35, -1).normalize();
    this._offset = new THREE.Vector3();

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerEnd = this._onPointerEnd.bind(this);
    this._onWheel = this._onWheel.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerEnd);
    canvas.addEventListener('pointercancel', this._onPointerEnd);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _onPointerDown(event) {
    this.canvas.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.previousPinchDistance = this._getPinchDistance();
  }

  _onPointerMove(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;

    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (this.pointers.size < 2) return;

    const distance = this._getPinchDistance();
    if (distance > 0 && this.previousPinchDistance > 0) {
      this.goalZoom = THREE.MathUtils.clamp(
        this.goalZoom * (this.previousPinchDistance / distance),
        MIN_ZOOM,
        MAX_ZOOM,
      );
    }
    this.previousPinchDistance = distance;
  }

  _onPointerEnd(event) {
    this.pointers.delete(event.pointerId);
    this.previousPinchDistance = this._getPinchDistance();
  }

  _onWheel(event) {
    event.preventDefault();
    const multiplier = Math.exp(event.deltaY * 0.0011);
    this.goalZoom = THREE.MathUtils.clamp(this.goalZoom * multiplier, MIN_ZOOM, MAX_ZOOM);
  }


  _getPinchDistance() {
    if (this.pointers.size < 2) return 0;
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(b.x - a.x, b.y - a.y);
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
    this.goalZoom = DEFAULT_ZOOM;
  }

  update(delta) {
    const damping = 1 - Math.exp(-10 * Math.min(delta, 0.05));
    this.target.lerp(this.goalTarget, damping);
    this.zoom = THREE.MathUtils.lerp(this.zoom, this.goalZoom, damping);
    this._updateProjection(false);

    this._offset.copy(this._direction).multiplyScalar(42);
    this.camera.position.copy(this.target).add(this._offset);
    this.camera.lookAt(this.target.x, 0, this.target.z);
    this.camera.updateMatrixWorld();
  }

  _updateProjection(force) {
    const nextHeight = this.baseViewHeight * this.zoom;
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

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerEnd);
    this.canvas.removeEventListener('pointercancel', this._onPointerEnd);
    this.canvas.removeEventListener('wheel', this._onWheel);
  }
}

