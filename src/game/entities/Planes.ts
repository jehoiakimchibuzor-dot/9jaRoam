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

/** Swept, tapered horizontal surface (wing or tailplane) pointing down +z. */
function sweptWing(
  parent: THREE.Object3D,
  dir: 1 | -1,
  span: number,
  rootChord: number,
  tipChord: number,
  sweep: number,
  thickness: number,
  color: number,
  y: number,
  z: number
): THREE.Mesh {
  const points: Array<[number, number]> = [
    [0, -rootChord / 2],
    [dir * span, -tipChord / 2 + sweep],
    [dir * span, tipChord / 2 + sweep],
    [0, rootChord / 2]
  ];
  if (dir < 0) points.reverse();
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 })
  );
  mesh.position.set(0, y, z);
  parent.add(mesh);
  return mesh;
}

/** Swept vertical fin with a rounded tip and a dorsal fillet. */
function sweptFin(
  parent: THREE.Object3D,
  height: number,
  rootChord: number,
  tipChord: number,
  sweep: number,
  thickness: number,
  color: number,
  y: number,
  z: number,
  dorsalLength = 0,
  rootDrop = 0
): THREE.Mesh {
  const tipRadius = Math.max(0.05, tipChord / 2);
  const tipCentreZ = -sweep;
  const shape = new THREE.Shape();
  shape.moveTo(rootChord / 2 + dorsalLength, 0);
  shape.lineTo(rootChord / 2, dorsalLength * 0.3);
  shape.lineTo(tipCentreZ + tipRadius, height - tipRadius);
  shape.absarc(tipCentreZ, height - tipRadius, tipRadius, 0, Math.PI, false);
  shape.lineTo(-rootChord / 2, -rootDrop);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 6
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 })
  );
  mesh.position.set(0, y, z);
  parent.add(mesh);
  return mesh;
}

/** A single low-poly airliner pointing down +z. */
function buildAirliner(livery: number): { group: THREE.Group; beacon: THREE.Mesh } {
  const group = new THREE.Group();
  const white = 0xf0f2f4;
  const dark = 0x20242a;
  const glass = 0x16202a;

  // Low-poly tube: fewer sides keeps the faceted reference look.
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 18, 12),
    new THREE.MeshStandardMaterial({ color: white, roughness: 0.4 })
  );
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  // Blunt radome: taper the fuselage down and cap it with a rounded nose.
  // A cone here is what gave the parked airliners a pencil silhouette.
  const noseTaper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.85, 1.9, 12),
    new THREE.MeshStandardMaterial({ color: white, roughness: 0.4 })
  );
  noseTaper.rotation.x = Math.PI / 2;
  noseTaper.position.z = 9.95;
  group.add(noseTaper);

  const radome = new THREE.Mesh(
    new THREE.SphereGeometry(0.56, 14, 10),
    new THREE.MeshStandardMaterial({ color: white, roughness: 0.4 })
  );
  radome.position.z = 10.9;
  radome.scale.set(1, 0.92, 0.95);
  group.add(radome);

  const tailCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.34, 4, 12),
    new THREE.MeshStandardMaterial({ color: white, roughness: 0.4 })
  );
  tailCone.rotation.x = -Math.PI / 2;
  tailCone.position.z = -10.6;
  group.add(tailCone);

  // Blue belly, like the reference livery.
  box(group, 1.55, 0.56, 16.2, livery, 0, -0.64, 0.6, 0.65);

  // Tail fin: tall, swept back, white with the blue globe emblem and a dorsal
  // fillet, the same livery treatment the player-flown jet gets. The old box
  // slab read as a fence panel; this is a real tapered aerofoil shape.
  sweptFin(group, 4.3, 3.6, 1.4, 2.0, 0.22, white, 0.55, -10.2, 2.8, 0.25);

  // Globe: blue disc with a white meridian, one on each side of the fin.
  for (const side of [-1, 1]) {
    const globe = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 16),
      new THREE.MeshStandardMaterial({ color: livery, roughness: 0.5 })
    );
    globe.rotation.y = side * Math.PI / 2;
    globe.position.set(side * 0.12, 2.3, -10.75);
    group.add(globe);
    box(group, 0.03, 0.09, 1.0, white, side * 0.14, 2.3, -10.75, 0.5);
  }

  // Tailplane (horizontal stabilizers), low on the rear cone and swept back.
  sweptWing(group, 1, 4.8, 2.6, 1.1, 0.9, 0.14, white, 0.38, -10.8);
  sweptWing(group, -1, 4.8, 2.6, 1.1, 0.9, 0.14, white, 0.38, -10.8);

  // Main wings: two swept halves instead of one straight slab.
  for (const side of [-1, 1]) {
    const wing = box(group, 13, 0.2, 3.2, white, side * 6.3, -0.1, 0.3, 0.5);
    wing.rotation.y = side * 0.16;
    // Blue winglet.
    box(group, 0.12, 1.4, 1.0, livery, side * 12.85, 0.6, -1.55, 0.5);
    // Root fairing.
    box(group, 1.8, 0.26, 3.4, livery, side * 1.0, -0.1, 0.3, 0.6);
  }

  // Engine nacelles under wings (proper pylons)
  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.58, 2.6, 12),
      new THREE.MeshStandardMaterial({ color: white, roughness: 0.4, metalness: 0.1 })
    );
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 4.4, -0.8, 0.4);
    group.add(engine);

    // Blue cowl band.
    box(group, 1.06, 0.34, 0.3, livery, side * 4.4, -0.8, 1.5, 0.6);
    // Engine pylon (strut)
    box(group, 0.2, 0.6, 1.0, dark, side * 4.4, -0.55, -0.2, 0.5);
    // Dark intake.
    const intake = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 12),
      new THREE.MeshStandardMaterial({ color: glass, roughness: 0.8 })
    );
    intake.position.set(side * 4.4, -0.8, 1.72);
    group.add(intake);
  }

  // Livery stripe along fuselage
  for (const side of [-1, 1]) {
    box(group, 0.05, 0.2, 15.2, livery, side * 0.86, -0.18, 0.8, 0.55);
    box(group, 0.05, 0.3, 11.2, glass, side * 0.87, 0.24, 0.4, 0.3);
  }

  // Cockpit glazing wrapped over the crown of the nose.
  box(group, 1.2, 0.26, 0.85, glass, 0, 0.62, 9.35, 0.3);

  // Landing gear (visible wheels under fuselage)
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.14, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.6, -1.05, 2.4);
    group.add(wheel);
    // Wheel strut
    box(group, 0.1, 0.9, 0.1, dark, side * 1.6, -0.6, 2.4, 0.5);
  }

  // Nose gear
  const noseWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
  );
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -0.95, 8.4);
  group.add(noseWheel);

  // Marker beacon on the spine.
  mergeVehicleShell(group);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), navMat(0xfff2c0));
  beacon.position.set(0, 1.05, -1.2);
  group.add(beacon);

  // Wingtip navigation lights (kept out of the merged shell so they glow).
  const left = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), navMat(0xff3a2a));
  left.position.set(-12.8, -0.05, -1.4);
  group.add(left);
  const right = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), navMat(0x2aff6a));
  right.position.set(12.8, -0.05, -1.4);
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
      { color: 0x1d5fa8, radiusX: 280, radiusZ: 420, height: 64, speed: 0.026, angle: 0.4 },
      { color: 0x2a6fbd, radiusX: 220, radiusZ: 330, height: 82, speed: 0.035, angle: 2.2 },
      { color: 0x123f73, radiusX: 330, radiusZ: 250, height: 96, speed: 0.021, angle: 4.4 }
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
