import * as THREE from 'three';

const PAD_RADIUS = 0.76;

export class PlacementZones {
  constructor(definitions) {
    this.group = new THREE.Group();
    this.group.name = 'Placement_Zones';
    this.interactables = [];
    this.zones = [];
    this.selectedId = null;
    this.visible = false;
    this.group.visible = false;

    this._rimGeometry = new THREE.CylinderGeometry(PAD_RADIUS + 0.13, PAD_RADIUS + 0.13, 0.08, 8);
    this._topGeometry = new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 0.09, 8);
    this._plusHorizontalGeometry = new THREE.BoxGeometry(0.68, 0.07, 0.16);
    this._plusVerticalGeometry = new THREE.BoxGeometry(0.16, 0.07, 0.68);
    this._rimMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fff0, roughness: 0.8 });
    this._plusMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68 });

    definitions.forEach((definition, index) => this._createZone(definition, index));
  }

  _createZone(definition, index) {
    const zone = new THREE.Group();
    zone.name = `Placement_${definition.id}`;
    zone.position.set(...definition.position);
    zone.rotation.y = Math.PI / 8;
    zone.userData.placementZone = definition;
    zone.userData.baseY = definition.position[1];
    zone.userData.phase = index * 1.9;

    const rim = new THREE.Mesh(this._rimGeometry, this._rimMaterial);
    rim.receiveShadow = true;
    rim.castShadow = true;
    rim.userData.placementZone = definition;

    const topMaterial = new THREE.MeshStandardMaterial({
      color: definition.color,
      roughness: 0.72,
      emissive: new THREE.Color(definition.color).multiplyScalar(0.045),
    });
    const top = new THREE.Mesh(this._topGeometry, topMaterial);
    top.position.y = 0.075;
    top.castShadow = true;
    top.receiveShadow = true;
    top.userData.placementZone = definition;

    const plusHorizontal = new THREE.Mesh(this._plusHorizontalGeometry, this._plusMaterial);
    const plusVertical = new THREE.Mesh(this._plusVerticalGeometry, this._plusMaterial);
    plusHorizontal.position.y = 0.16;
    plusVertical.position.y = 0.16;
    plusHorizontal.castShadow = true;
    plusVertical.castShadow = true;

    zone.add(rim, top, plusHorizontal, plusVertical);
    this.group.add(zone);
    this.interactables.push(top, rim);
    this.zones.push({ definition, group: zone, top, material: topMaterial });
  }

  setSelected(id) {
    this.selectedId = id;
    this.zones.forEach(({ definition, material }) => {
      const selected = definition.id === id;
      material.emissiveIntensity = selected ? 1.8 : 1;
      material.color.setHex(definition.color).offsetHSL(0, 0, selected ? 0.08 : 0);
    });
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }

  update(elapsed) {
    if (!this.visible) return;

    this.zones.forEach(({ definition, group }, index) => {
      const selected = definition.id === this.selectedId;
      const pulse = Math.sin(elapsed * (selected ? 4.2 : 2.3) + index * 1.9);
      const scale = selected ? 1.06 + pulse * 0.035 : 1 + pulse * 0.014;
      group.scale.setScalar(scale);
      group.position.y = group.userData.baseY + (pulse + 1) * (selected ? 0.025 : 0.012);
    });
  }

  dispose() {
    this._rimGeometry.dispose();
    this._topGeometry.dispose();
    this._plusHorizontalGeometry.dispose();
    this._plusVerticalGeometry.dispose();
    this._rimMaterial.dispose();
    this._plusMaterial.dispose();
    this.zones.forEach(({ material }) => material.dispose());
  }
}

