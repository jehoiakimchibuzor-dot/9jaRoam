import * as THREE from 'three';
import { mergeVehicleShell } from './MeshMerge';

interface Plane {
  group: THREE.Group;
  radiusX: number;
  radiusZ: number;
  angle: number;
  speed: number;
  height: number;
  bob: number;
  beacon: THREE.Mesh;
  beaconPhase: number;
}

const navMaterials = new Map<number, THREE.MeshBasicMaterial>();
function navMat(color: number): THREE.MeshBasicMaterial {
  let material = navMaterials.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    navMaterials.set(color, material);
  }
  return material;
}

function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  roughness = 0.6
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 })
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** A single low-poly airliner pointing down +z. */
function buildAirliner(livery: number): { group: THREE.Group; beacon: THREE.Mesh } {
  const group = new THREE.Group();
  const white = 0xe8eaec;
  const dark = 0x20242a;
  const glass = 0x16202a;

  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 15, 12),
    new THREE.MeshStandardMaterial({ color: white, roughness: 0.45 })
  );
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.95, 2.6, 12),
    new THREE.MeshStandardMaterial({ color: white, roughness: 0.45 })
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 8.8;
  group.add(nose);

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.95, 3.2, 12),
    new THREE.MeshStandardMaterial({ color: white, roughness: 0.45 })
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -9.1;
  group.add(tail);

  // Main wings and tailplane.
  box(group, 23, 0.22, 2.7, white, 0, -0.15, 0.6, 0.5);
  box(group, 6.4, 0.18, 1.7, white, 0, -0.02, -2.2, 0.5);
  box(group, 7.2, 0.16, 1.5, white, 0, 0.5, -6.4, 0.5);
  const fin = box(group, 0.22, 3.3, 2.2, livery, 0, 2.0, -6.5, 0.5);
  fin.rotation.x = -0.16;

  // Engine nacelles.
  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.62, 2.3, 10),
      new THREE.MeshStandardMaterial({ color: 0xb8bdc2, roughness: 0.4, metalness: 0.2 })
    );
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 3.6, -0.75, 0.2);
    group.add(engine);
    box(group, 0.16, 0.5, 1.2, dark, side * 3.6, -0.95, 0.4, 0.7);
  }

  // Livery stripe and cockpit glass.
  for (const side of [-1, 1]) {
    box(group, 0.06, 0.24, 12.6, livery, side * 0.9, -0.18, 1.2, 0.55);
    box(group, 0.06, 0.34, 11.2, glass, side * 0.92, 0.28, 0.6, 0.3);
  }
  box(group, 1.5, 0.32, 0.08, glass, 0, 0.34, 7.2, 0.3);

  // Marker beacon on the spine.
  mergeVehicleShell(group);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), navMat(0xfff2c0));
  beacon.position.set(0, 1.05, -1.2);
  group.add(beacon);

  // Wingtip navigation lights (kept out of the merged shell so they glow).
  const left = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), navMat(0xff3a2a));
  left.position.set(-11.4, -0.12, 1.4);
  group.add(left);
  const right = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), navMat(0x2aff6a));
  right.position.set(11.4, -0.12, 1.4);
  group.add(right);

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });

  return { group, beacon };
}

export class Planes {
  readonly list: Plane[] = [];

  constructor(scene: THREE.Scene) {
    const specs: Array<{
      color: number;
      radiusX: number;
      radiusZ: number;
      height: number;
      speed: number;
      angle: number;
    }> = [
      { color: 0x2f5d9e, radiusX: 280, radiusZ: 420, height: 64, speed: 0.026, angle: 0.4 },
      { color: 0xc23b2e, radiusX: 220, radiusZ: 330, height: 82, speed: 0.035, angle: 2.2 },
      { color: 0x1f8a7a, radiusX: 330, radiusZ: 250, height: 96, speed: 0.021, angle: 4.4 }
    ];

    specs.forEach((spec, index) => {
      const { group, beacon } = buildAirliner(spec.color);
      group.position.y = spec.height;
      scene.add(group);
      this.list.push({
        group,
        radiusX: spec.radiusX,
        radiusZ: spec.radiusZ,
        angle: spec.angle,
        speed: spec.speed,
        height: spec.height,
        bob: index * 1.7,
        beacon,
        beaconPhase: Math.random() * 2
      });
      this.place(this.list[index], 0);
    });
  }

  update(dt: number): void {
    for (const plane of this.list) {
      plane.angle = (plane.angle + plane.speed * dt) % (Math.PI * 2);
      plane.bob += dt;
      this.place(plane, dt);
    }
  }

  private place(plane: Plane, dt: number): void {
    const a = plane.angle;
    const x = Math.cos(a) * plane.radiusX;
    const z = Math.sin(a) * plane.radiusZ;
    const height = plane.height + Math.sin(plane.bob * 0.35) * 2.4;
    plane.group.position.set(x, height, z);

    const dx = -Math.sin(a) * plane.radiusX;
    const dz = Math.cos(a) * plane.radiusZ;
    plane.group.rotation.y = Math.atan2(dx, dz);
    plane.group.rotation.z = Math.sin(a) * 0.12 - 0.05;

    plane.beaconPhase += dt;
    const on = plane.beaconPhase % 1.4 < 0.16;
    plane.beacon.visible = on;
  }
}
