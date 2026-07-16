import * as THREE from 'three';

const MAX_DRAG_DISTANCE = 72;
const POINTER_DEAD_ZONE = 7;
const INPUT_DEAD_ZONE = 0.06;

export class PlayerController {
  constructor(canvas, joystick) {
    this.canvas = canvas;
    this.joystick = joystick;
    this.pointers = new Map();
    this.keys = new Set();
    this.activePointerId = null;
    this.dragStart = new THREE.Vector2();
    this.dragInput = new THREE.Vector2();
    this.screenInput = new THREE.Vector2();
    this.worldInput = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._forward = new THREE.Vector3();

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerEnd = this._onPointerEnd.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerEnd);
    canvas.addEventListener('pointercancel', this._onPointerEnd);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  _onPointerDown(event) {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size !== 1) {
      this._clearPointerInput();
      return;
    }

    this.activePointerId = event.pointerId;
    this.dragStart.set(event.clientX, event.clientY);
    this.dragInput.set(0, 0);
    this.joystick?.style.setProperty('--stick-x', `${event.clientX}px`);
    this.joystick?.style.setProperty('--stick-y', `${event.clientY}px`);
    this.joystick?.style.setProperty('--knob-x', '0px');
    this.joystick?.style.setProperty('--knob-y', '0px');
    this.joystick?.classList.add('is-active');
  }

  _onPointerMove(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (this.pointers.size !== 1 || event.pointerId !== this.activePointerId) return;

    const deltaX = event.clientX - this.dragStart.x;
    const deltaY = event.clientY - this.dragStart.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= POINTER_DEAD_ZONE) {
      this.dragInput.set(0, 0);
      this.joystick?.style.setProperty('--knob-x', '0px');
      this.joystick?.style.setProperty('--knob-y', '0px');
      return;
    }

    const scale = Math.min(distance, MAX_DRAG_DISTANCE) / Math.max(distance, 0.001);
    const knobX = deltaX * scale;
    const knobY = deltaY * scale;
    this.dragInput.set(knobX / MAX_DRAG_DISTANCE, knobY / MAX_DRAG_DISTANCE);
    this.joystick?.style.setProperty('--knob-x', `${knobX}px`);
    this.joystick?.style.setProperty('--knob-y', `${knobY}px`);
  }

  _onPointerEnd(event) {
    this.pointers.delete(event.pointerId);
    if (event.pointerId === this.activePointerId || this.pointers.size === 0) {
      this._clearPointerInput();
    }
  }

  _onKeyDown(event) {
    if (!/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|KeyW|KeyA|KeyS|KeyD)$/.test(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
  }

  _onKeyUp(event) {
    this.keys.delete(event.code);
  }

  _onBlur() {
    this.keys.clear();
    this.pointers.clear();
    this._clearPointerInput();
  }

  _clearPointerInput() {
    this.activePointerId = null;
    this.dragInput.set(0, 0);
    this.joystick?.classList.remove('is-active');
    this.joystick?.style.setProperty('--knob-x', '0px');
    this.joystick?.style.setProperty('--knob-y', '0px');
  }

  update(camera) {
    const keyboardX = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD'))
      - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA'));
    const keyboardY = Number(this.keys.has('ArrowDown') || this.keys.has('KeyS'))
      - Number(this.keys.has('ArrowUp') || this.keys.has('KeyW'));
    this.screenInput.set(this.dragInput.x + keyboardX, this.dragInput.y + keyboardY);

    const inputLength = this.screenInput.length();
    if (inputLength <= INPUT_DEAD_ZONE) {
      this.worldInput.set(0, 0, 0);
      return this.worldInput;
    }

    const strength = Math.min(inputLength, 1);
    this.screenInput.multiplyScalar(1 / inputLength);
    this._right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    camera.getWorldDirection(this._forward).setY(0).normalize();
    this.worldInput
      .copy(this._right)
      .multiplyScalar(this.screenInput.x)
      .addScaledVector(this._forward, -this.screenInput.y)
      .normalize()
      .multiplyScalar(strength);
    return this.worldInput;
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerEnd);
    this.canvas.removeEventListener('pointercancel', this._onPointerEnd);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
