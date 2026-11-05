import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeDirectMeshes, mergeDriverGroup, mergeVehicleShell } from './MeshMerge';

export interface VehicleAccess {
  label: string;
  entry: THREE.Vector3;
  seat: THREE.Vector3;
  interactionRange: number;
  cameraHeight: number;
}

export interface VehicleRig {
  group: THREE.Group;
  steerPivots: THREE.Group[];
  spinners: THREE.Group[];
  wheelRadius: number;
  length: number;
  width: number;
  centerOfMassY: number;
  doorPivot?: THREE.Group;
  driver?: THREE.Group;
  steeringWheel?: THREE.Mesh;
  doorOpen?: boolean;
  access?: VehicleAccess;
  /** Optional top speed override, in metres per second. */
  maxSpeed?: number;
  /** Runtime damage state used by the game for player-driven vehicles. */
  health?: number;
  maxHealth?: number;
  burning?: number;
  wrecked?: boolean;
  fuel?: number;
  maxFuel?: number;
  /** Aircraft specific metadata */
  kind?: 'car' | 'bike' | 'plane' | 'helicopter';
  propellers?: THREE.Group[];
  rotors?: THREE.Group[];
  rotorSpeed?: number;
  pitch?: number;
  roll?: number;
  yaw?: number;
  altitude?: number;
  verticalSpeed?: number;
}

export interface VehicleOverlap {
  normalX: number;
  normalZ: number;
  depth: number;
}

/** Returns the minimum separating axis for two oriented vehicle footprints. */
export function vehicleOverlap(
  a: THREE.Vector3,
  yawA: number,
  widthA: number,
  lengthA: number,
  b: THREE.Vector3,
  yawB: number,
  widthB: number,
  lengthB: number
): VehicleOverlap | null {
  const axes: Array<[number, number]> = [
    [Math.cos(yawA), -Math.sin(yawA)],
    [Math.sin(yawA), Math.cos(yawA)],
    [Math.cos(yawB), -Math.sin(yawB)],
    [Math.sin(yawB), Math.cos(yawB)]
  ];
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  let minimumDepth = Infinity;
  let normalX = 0;
  let normalZ = 0;

  for (const [axisX, axisZ] of axes) {
    const projection = dx * axisX + dz * axisZ;
    const radiusA =
      (widthA / 2) * Math.abs(Math.cos(yawA) * axisX - Math.sin(yawA) * axisZ) +
      (lengthA / 2) * Math.abs(Math.sin(yawA) * axisX + Math.cos(yawA) * axisZ);
    const radiusB =
      (widthB / 2) * Math.abs(Math.cos(yawB) * axisX - Math.sin(yawB) * axisZ) +
      (lengthB / 2) * Math.abs(Math.sin(yawB) * axisX + Math.cos(yawB) * axisZ);
    const depth = radiusA + radiusB - Math.abs(projection);
    if (depth <= 0) return null;
    if (depth < minimumDepth) {
      minimumDepth = depth;
      const direction = projection >= 0 ? 1 : -1;
      normalX = axisX * direction;
      normalZ = axisZ * direction;
    }
  }

  return { normalX, normalZ, depth: minimumDepth };
}

const surfaceMaterials = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: number, roughness = 0.7, metalness = 0.05): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}:${metalness}`;
  let material = surfaceMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: false });
    surfaceMaterials.set(key, material);
  }
  return material;
}

const glassMaterials = new Map<number, THREE.MeshStandardMaterial>();

function glassMat(color = 0x4a7fae): THREE.MeshStandardMaterial {
  let material = glassMaterials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.16,
      metalness: 0.25,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    });
    glassMaterials.set(color, material);
  }
  return material;
}

const glowMaterials = new Map<string, THREE.MeshStandardMaterial>();

function glowMat(
  color: number,
  emissive: number,
  intensity: number,
  roughness = 0.25
): THREE.MeshStandardMaterial {
  const key = `${color}:${emissive}:${intensity}:${roughness}`;
  let material = glowMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: intensity,
      roughness,
      metalness: 0
    });
    glowMaterials.set(key, material);
  }
  return material;
}

function rbox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  radius: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  roughness = 0.7
): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mat(color, roughness));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  roughness = 0.7
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, roughness));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function emissive(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: number,
  glow: number,
  intensity: number,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glowMat(color, glow, intensity));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addWheels(
  group: THREE.Group,
  wheelRadius: number,
  positions: Array<[number, number, boolean]>,
  width: number
): { steerPivots: THREE.Group[]; spinners: THREE.Group[] } {
  const steerPivots: THREE.Group[] = [];
  const spinners: THREE.Group[] = [];
  for (const [x, z, steerable] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, wheelRadius, z);
    group.add(pivot);
    if (steerable) steerPivots.push(pivot);
    const spinner = new THREE.Group();
    pivot.add(spinner);
    spinners.push(spinner);
    const tyre = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius, wheelRadius, width, 16),
      mat(0x141416, 0.92)
    );
    tyre.rotation.z = Math.PI / 2;
    spinner.add(tyre);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius * 0.55, wheelRadius * 0.55, width + 0.02, 12),
      mat(0x9aa0a6, 0.4, 0.5)
    );
    rim.rotation.z = Math.PI / 2;
    spinner.add(rim);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius * 0.2, wheelRadius * 0.2, width + 0.04, 8),
      mat(0xc8ccd0, 0.35, 0.6)
    );
    hub.rotation.z = Math.PI / 2;
    spinner.add(hub);
  }
  return { steerPivots, spinners };
}

let headlightBeamMaterial: THREE.MeshBasicMaterial | null = null;
let headlightBeamGeometry: THREE.BufferGeometry | null = null;

/** Soft painted pool used by NPC headlights instead of real spotlights. */
function getHeadlightBeamTexture(): THREE.CanvasTexture {
  const width = 128;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // v = 0 is the bumper edge, so the wash fades away from the car.
    const wash = ctx.createLinearGradient(0, height, 0, 0);
    wash.addColorStop(0, 'rgba(255, 244, 214, 0.8)');
    wash.addColorStop(0.4, 'rgba(255, 236, 194, 0.4)');
    wash.addColorStop(1, 'rgba(255, 228, 178, 0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    for (const cx of [width * 0.28, width * 0.72]) {
      const core = ctx.createRadialGradient(cx, height * 0.94, 1, cx, height * 0.84, height * 0.52);
      core.addColorStop(0, 'rgba(255, 250, 236, 0.9)');
      core.addColorStop(0.45, 'rgba(255, 238, 200, 0.26)');
      core.addColorStop(1, 'rgba(255, 230, 190, 0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, width, height);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function getHeadlightBeamMaterial(): THREE.MeshBasicMaterial {
  if (!headlightBeamMaterial) {
    headlightBeamMaterial = new THREE.MeshBasicMaterial({
      map: getHeadlightBeamTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.3,
      toneMapped: false,
      side: THREE.DoubleSide
    });
  }
  return headlightBeamMaterial;
}

/** Unit trapezoid: 1 m wide at the bumper, widening to 2.1 m, 1 m long. */
function getHeadlightBeamGeometry(): THREE.BufferGeometry {
  if (headlightBeamGeometry) return headlightBeamGeometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.5, 0, 0, 0.5, 0, 0, 1.05, 0, 1, -1.05, 0, 1],
      3
    )
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)
  );
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  geometry.computeVertexNormals();
  headlightBeamGeometry = geometry;
  return geometry;
}

function defaultToughness(rig: VehicleRig): number {
  const label = rig.access?.label ?? '';
  if (label === 'OKADA') return 180;
  if (label === 'SPORT CAR') return 300;
  if (label === 'LUXURY CAR') return 420;
  if (label === 'DANFO') return 480;
  if (label === 'KEKE') return 280;
  if (label === 'SEDAN') return 360;
  // Police cruisers are the only rig without an access descriptor.
  return 400;
}

/** Gives a rig a damage pool the first time it is touched. */
export function ensureVehicleHealth(rig: VehicleRig): void {
  if (rig.maxHealth === undefined || rig.health === undefined) {
    rig.maxHealth = defaultToughness(rig);
    rig.health = rig.maxHealth;
    rig.burning = 0;
    rig.wrecked = false;
  }
}

/**
 * Vehicles were tuned before the characters were rebuilt, so they read a
 * little small next to the new 1.8 m bodies. Scale the whole rig (and its
 * collision/access numbers) as one unit. Bikes get the biggest bump so the
 * rider no longer looks like a child on a toy.
 */
function scaleVehicle(rig: VehicleRig, factor: number): void {
  if (factor === 1) return;
  rig.group.scale.setScalar(factor);
  rig.width *= factor;
  rig.length *= factor;
  rig.wheelRadius *= factor;
  rig.centerOfMassY *= factor;
  if (rig.access) {
    rig.access.entry.multiplyScalar(factor);
    rig.access.seat.multiplyScalar(factor);
    rig.access.cameraHeight *= factor;
    rig.access.interactionRange *= factor;
  }
}

function finishVehicle(rig: VehicleRig): VehicleRig {
  ensureVehicleHealth(rig);
  const exclude = new Set<THREE.Object3D>();
  if (rig.steeringWheel) exclude.add(rig.steeringWheel);
  const spinnerSet = new Set<THREE.Object3D>(rig.spinners);

  mergeVehicleShell(rig.group, exclude);

  for (const child of rig.group.children) {
    if (!(child instanceof THREE.Group)) continue;
    if (child === rig.doorPivot) {
      mergeVehicleShell(child, exclude);
      continue;
    }
    if (child.children.some((sub) => spinnerSet.has(sub))) {
      for (const spinner of child.children) {
        if (spinnerSet.has(spinner)) mergeDirectMeshes(spinner, 'vertexColor');
      }
      continue;
    }
    mergeVehicleShell(child, exclude);
    for (const sub of child.children) {
      if (sub instanceof THREE.Group && sub !== rig.driver) {
        mergeVehicleShell(sub, exclude);
      }
    }
  }

  if (rig.driver) mergeDriverGroup(rig.driver);

  rig.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const label = rig.access?.label ?? '';
  const factor = label === 'OKADA' ? 1.2 : label === 'KEKE' ? 1.06 : 1.08;
  scaleVehicle(rig, factor);
  if (
    label === 'SEDAN' ||
    label === 'SPORT CAR' ||
    label === 'LUXURY CAR' ||
    (!rig.access && rig.length >= 4)
  ) {
    const heightFactor = 1.15;
    rig.group.scale.y *= heightFactor;
    rig.centerOfMassY *= heightFactor;
    if (rig.access) rig.access.cameraHeight *= heightFactor;
  }

  // Headlights are two real spotlights aimed down at the tarmac. There is
  // deliberately no additive cone mesh: a glowing volume above the bonnet
  // reads as a searchlight and washes out the whole car at night.
  const headlightSpots = new THREE.Group();
  headlightSpots.name = 'headlight-spots';
  for (const side of [-1, 1]) {
    // Soft low beam aimed down the tarmac. The wide penumbra keeps the pool
    // gentle instead of a hard white wedge, and because the cone is tipped at
    // the road it never glows up over the bonnet.
    const spot = new THREE.SpotLight(0xfff1cf, 1800, 55, Math.PI / 10, 0.9, 1.7);
    spot.position.set(side * Math.min(rig.width * 0.28, 0.68), 0.7, rig.length / 2 - 0.05);
    spot.castShadow = false;
    spot.target.position.set(
      side * Math.min(rig.width * 0.3, 0.72),
      -0.55,
      rig.length / 2 + 18
    );
    headlightSpots.add(spot, spot.target);
  }
  headlightSpots.visible = false;
  rig.group.add(headlightSpots);
  rig.group.userData.headlightSpots = headlightSpots;

  // A single additive trapezoid on the road for NPC traffic. One draw call per
  // car, unlike a pair of real spotlights per car.
  const headlightBeams = new THREE.Mesh(
    getHeadlightBeamGeometry(),
    getHeadlightBeamMaterial()
  );
  headlightBeams.name = 'headlight-beams';
  headlightBeams.position.set(0, 0.035, rig.length / 2 - 0.25);
  headlightBeams.scale.set(rig.width * 1.15, 1, 17);
  headlightBeams.castShadow = false;
  headlightBeams.receiveShadow = false;
  headlightBeams.renderOrder = 2;
  headlightBeams.visible = false;
  rig.group.add(headlightBeams);
  rig.group.userData.headlightBeams = headlightBeams;
  return rig;
}

export function setVehicleNightLighting(
  rig: VehicleRig,
  enabled: boolean,
  illuminateRoad = false
): void {
  const spots = rig.group.userData.headlightSpots as THREE.Group | undefined;
  if (spots) spots.visible = enabled && illuminateRoad;
  // Traffic cars get a cheap painted beam instead of two extra spotlights, so
  // every car on the road reads as having its headlights on at night.
  const beams = rig.group.userData.headlightBeams as THREE.Mesh | undefined;
  if (beams) beams.visible = enabled && !illuminateRoad;
}

function buildDriver(helmetColor?: number): THREE.Group {
  const driver = new THREE.Group();
  const skins = [0x7a4a28, 0x8a5a36, 0x6b3f22, 0x9a6a45, 0x5c3218];
  const shirts = [0x3a4a5c, 0x2f5d9e, 0x2f7f5b, 0x7a4a2a, 0xd4a12f];
  const skin = skins[Math.floor(Math.random() * skins.length)];
  const shirt = shirts[Math.floor(Math.random() * shirts.length)];
  const pants = 0x22252e;

  // Torso with shoulders and a collar.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.26, 6, 12), mat(shirt, 0.9));
  torso.position.set(0, 0.33, 0);
  driver.add(torso);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), mat(shirt, 0.9));
    shoulder.position.set(side * 0.155, 0.43, 0);
    driver.add(shoulder);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.08, 10), mat(skin, 0.85));
  neck.position.set(0, 0.52, 0);
  driver.add(neck);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.025, 12), mat(0xe8e4dc, 0.9));
  collar.position.set(0, 0.485, 0);
  driver.add(collar);

  // Head with jaw, ears, eyes, nose and mouth so the driver reads as a person.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.103, 18, 14), mat(skin, 0.85));
  head.position.set(0, 0.625, 0.008);
  head.scale.set(0.94, 1.06, 1.0);
  driver.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(skin, 0.85));
  jaw.position.set(0, 0.545, 0.055);
  jaw.scale.set(1.3, 0.7, 0.9);
  driver.add(jaw);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mat(skin, 0.85));
    ear.position.set(side * 0.098, 0.62, 0.002);
    ear.scale.set(0.45, 1, 0.8);
    driver.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 8, 6), mat(0xf0e8da, 0.6));
    eye.position.set(side * 0.041, 0.64, 0.094);
    eye.scale.z = 0.55;
    driver.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 6, 5), mat(0x17110c, 0.5));
    pupil.position.set(side * 0.041, 0.64, 0.104);
    driver.add(pupil);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.038, 8), mat(skin, 0.85));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.605, 0.11);
  driver.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.006, 0.008), mat(0x4a2a1c, 0.8));
  mouth.position.set(0, 0.57, 0.103);
  driver.add(mouth);

  if (helmetColor !== undefined) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.132, 16, 12), mat(helmetColor, 0.35, 0.2));
    helmet.position.set(0, 0.65, -0.005);
    helmet.scale.set(1.0, 0.95, 1.06);
    driver.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.075, 0.045), mat(0x11151a, 0.2, 0.4));
    visor.position.set(0, 0.668, 0.113);
    visor.rotation.x = -0.06;
    driver.add(visor);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat(0x17181c, 0.85));
    cap.position.set(0, 0.675, -0.008);
    cap.scale.set(1.02, 0.68, 1.05);
    driver.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.1), mat(0x17181c, 0.85));
    brim.position.set(0, 0.675, 0.1);
    brim.rotation.x = -0.12;
    driver.add(brim);
  }

  for (const side of [-1, 1]) {
    // Upper arm, forearm and a hand on the wheel.
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.19, 5, 8), mat(shirt, 0.9));
    upper.position.set(side * 0.205, 0.33, 0.06);
    upper.rotation.x = -0.85;
    driver.add(upper);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.043, 8, 6), mat(skin, 0.85));
    elbow.position.set(side * 0.205, 0.22, 0.16);
    driver.add(elbow);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.18, 5, 8), mat(skin, 0.85));
    forearm.position.set(side * 0.19, 0.24, 0.28);
    forearm.rotation.x = -1.15;
    driver.add(forearm);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.075), mat(skin, 0.85));
    palm.position.set(side * 0.17, 0.29, 0.4);
    palm.rotation.x = -0.4;
    driver.add(palm);
    for (let f = 0; f < 3; f += 1) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.04), mat(skin, 0.85));
      finger.position.set(side * (0.155 + f * 0.014), 0.305, 0.43);
      finger.rotation.x = -0.5;
      driver.add(finger);
    }

    // Thigh forward, knee, shin down and a shoe.
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.26, 5, 8), mat(pants, 0.9));
    thigh.position.set(side * 0.09, 0.17, 0.14);
    thigh.rotation.x = Math.PI / 2 - 0.12;
    driver.add(thigh);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), mat(pants, 0.9));
    knee.position.set(side * 0.09, 0.175, 0.3);
    driver.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.24, 5, 8), mat(pants, 0.9));
    shin.position.set(side * 0.09, 0.075, 0.33);
    shin.rotation.x = -0.1;
    driver.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.19), mat(0x18191c, 0.75));
    shoe.position.set(side * 0.09, 0.005, 0.38);
    driver.add(shoe);
  }

  driver.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  driver.visible = false;
  return driver;
}

export function createDanfo(color = 0xd08a25): VehicleRig {
  const group = new THREE.Group();
  const dark = 0x1b1d20;
  const glass = glassMat(0x4a7fae);
  const wheelRadius = 0.44;
  const length = 7;

  rbox(group, 2.4, 0.5, length - 0.1, 0.12, 0x1a1b1e, 0, 0.42, 0, 0.95);
  rbox(group, 2.4, 0.62, length, 0.18, color, 0, 1.0, 0, 0.72);
  rbox(group, 2.4, 0.12, length, 0.18, color, 0, 2.1, 0, 0.72);
  rbox(group, 2.36, 0.45, length - 0.5, 0.14, color, 0, 2.32, -0.2, 0.72);

  box(group, 2.42, 0.09, length - 0.15, dark, 0, 1.28, 0, 0.85);
  box(group, 2.43, 0.06, length - 0.15, 0x9a7218, 0, 1.12, 0, 0.8);

  const wind = rbox(group, 2.12, 0.85, 0.07, 0.02, 0x4a7fae, 0, 1.78, 3.32, 0.24);
  wind.rotation.x = -0.5;
  wind.material = glass;
  rbox(group, 2.1, 0.6, 0.06, 0.02, 0x4a7fae, 0, 1.42, 3.48, 0.24).material = glass;
  box(group, 0.12, 0.95, 0.3, color, -1.08, 1.76, 3.2);
  box(group, 0.12, 0.95, 0.3, color, 1.08, 1.76, 3.2);

  for (const side of [-1, 1]) {
    rbox(group, 0.06, 0.62, 1.7, 0.02, 0x4a7fae, side * 1.21, 1.75, 0.5, 0.22).material = glass;
    rbox(group, 0.06, 0.62, 1.5, 0.02, 0x4a7fae, side * 1.21, 1.75, -1.4, 0.22).material = glass;
    rbox(group, 0.06, 0.62, 1.1, 0.02, 0x4a7fae, side * 1.21, 1.75, -2.7, 0.22).material = glass;
    box(group, 0.07, 0.65, 0.1, dark, side * 1.22, 1.73, 1.48);
    box(group, 0.07, 0.65, 0.1, dark, side * 1.22, 1.73, 1.42);
    box(group, 0.07, 0.65, 0.1, dark, side * 1.22, 1.73, -0.5);
    box(group, 0.07, 0.65, 0.1, dark, side * 1.22, 1.73, -2.1);
    box(group, 0.12, 0.8, 0.12, color, side * 1.16, 1.72, 3.4);
    box(group, 0.12, 0.8, 0.12, color, side * 1.16, 1.72, -3.4);
  }

  rbox(group, 2.14, 0.55, 0.07, 0.02, 0x4a7fae, 0, 1.72, -3.46, 0.22).material = glass;
  box(group, 2.2, 0.5, 0.06, color, 0, 1.5, -3.48);
  box(group, 2.24, 0.08, 0.09, dark, 0, 1.74, -3.5);
  box(group, 0.03, 0.8, 0.04, dark, -0.72, 1.62, -3.52);
  box(group, 0.03, 0.8, 0.04, dark, 0.72, 1.62, -3.52);
  box(group, 0.56, 0.13, 0.04, 0xf1efe6, 0, 1.02, -3.53);

  rbox(group, 2.3, 0.16, 0.22, 0.05, dark, 0, 0.52, length / 2 - 0.05, 0.9);
  rbox(group, 2.3, 0.16, 0.22, 0.05, dark, 0, 0.52, -length / 2 + 0.05, 0.9);

  box(group, 1.7, 0.3, 0.12, dark, 0, 1.05, 3.51);
  for (const dx of [-0.55, 0, 0.55]) {
    box(group, 0.08, 0.26, 0.08, dark, dx, 1.2, 3.52);
  }
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), glowMat(0xfdf8e8, 0xfff3c0, 1.4));
  hl.position.set(-0.78, 1.28, 3.5);
  hl.scale.set(1, 0.72, 0.5);
  group.add(hl);
  const hl2 = hl.clone();
  hl2.position.x = 0.78;
  group.add(hl2);

  emissive(group, 0.3, 0.18, 0.05, 0x8c1f1f, 0xff2a1a, 1.2, -0.8, 1.1, -3.52);
  emissive(group, 0.3, 0.18, 0.05, 0x8c1f1f, 0xff2a1a, 1.2, 0.8, 1.1, -3.52);

  for (const side of [-1, 1]) {
    box(group, 0.07, 0.1, 0.24, dark, side * 1.3, 1.95, 2.75);
    box(group, 0.16, 0.08, 0.06, 0x2a2c30, side * 1.4, 1.95, 2.65);
  }

  const interior = new THREE.Group();
  group.add(interior);
  box(interior, 2.1, 0.08, length - 0.4, 0x555048, 0, 0.72, 0);
  box(interior, 1.9, 0.5, 0.55, 0x3a352c, 0, 1.0, -0.6);
  box(interior, 1.9, 0.5, 0.55, 0x3a352c, 0, 1.0, -1.8);
  box(interior, 1.9, 0.45, 0.5, 0x3a352c, 0, 0.98, -2.9);
  box(interior, 1.9, 0.5, 0.5, 0x2e2b25, 0, 1.0, 0.5);
  box(interior, 2.0, 0.36, 0.4, 0x1e1f22, 0, 1.28, 2.7);
  box(interior, 1.8, 0.06, 0.3, 0x33363a, 0, 1.5, 2.55);

  const steering = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.028, 8, 18),
    mat(0x17181b, 0.6)
  );
  steering.position.set(0.68, 1.45, 2.42);
  steering.rotation.x = -0.55;
  interior.add(steering);
  box(interior, 0.06, 0.28, 0.06, 0x2a2c30, 0.68, 1.3, 2.5);

  const driver = buildDriver();
  driver.position.set(0.68, 1.0, 1.55);
  interior.add(driver);

  const doorPivot = new THREE.Group();
  doorPivot.position.set(1.21, 1.5, 2.5);
  group.add(doorPivot);
  rbox(doorPivot, 0.07, 0.55, 1.3, 0.03, color, 0, -0.35, -0.65);
  rbox(doorPivot, 0.07, 0.6, 1.26, 0.02, 0x4a7fae, 0, 0.28, -0.65, 0.22).material = glass;
  box(doorPivot, 0.08, 0.07, 1.3, dark, 0, 0.0, -0.65);
  box(doorPivot, 0.09, 0.08, 0.24, dark, 0.02, -0.05, -1.1);
  doorPivot.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const wheels = addWheels(
    group,
    wheelRadius,
    [
      [-1.24, 2.15, true],
      [1.24, 2.15, true],
      [-1.24, -2.15, false],
      [1.24, -2.15, false]
    ],
    0.32
  );

  return finishVehicle({
    group,
    steerPivots: wheels.steerPivots,
    spinners: wheels.spinners,
    wheelRadius,
    length,
    width: 2.4,
    centerOfMassY: 0.85,
    doorPivot,
    driver,
    steeringWheel: steering,
    doorOpen: false,
    access: {
      label: 'DANFO',
      entry: new THREE.Vector3(1.72, 0, 1.35),
      seat: new THREE.Vector3(0.68, 0, 1.55),
      interactionRange: 2.9,
      cameraHeight: 2.0
    }
  });
}

export function createSedan(color = 0x2f5d9e, police = false, luxury = false): VehicleRig {
  const group = new THREE.Group();
  const dark = 0x1b1d20;
  const glass = glassMat(0x3d5a72);
  const wheelRadius = 0.34;
  const length = 4.4;
  const bodyColor = police ? 0xe8e8e6 : color;

  rbox(group, 1.8, 0.5, length, 0.14, bodyColor, 0, 0.55, 0, 0.7);
  rbox(group, 1.7, 0.1, 2.15, 0.04, bodyColor, 0, 1.32, -0.2, 0.7);
  rbox(group, 1.7, 0.1, 2.05, 0.1, 0x141519, 0, 0.8, -0.2, 0.95);
  for (const side of [-1, 1]) {
    box(group, 0.07, 0.52, 0.09, bodyColor, side * 0.78, 1.06, 0.84);
    box(group, 0.07, 0.52, 0.09, bodyColor, side * 0.78, 1.06, -1.14);
  }
  rbox(group, 1.34, 0.12, 0.92, 0.08, bodyColor, 0, 0.84, 1.47, 0.48);
  rbox(group, 1.28, 0.1, 0.62, 0.06, bodyColor, 0, 0.82, -1.63, 0.48);
  rbox(group, 0.78, 0.18, 0.045, 0.035, 0x24282c, 0, 0.69, 2.22, 0.55);
  for (let i = 0; i < 5; i += 1) {
    box(group, 0.025, 0.12, 0.02, 0x9aa0a6, -0.28 + i * 0.14, 0.69, 2.25, 0.45);
  }
  box(group, 0.72, 0.12, 0.035, 0xb9c0c6, 0, 0.47, 2.21, 0.35);
  box(group, 0.54, 0.1, 0.035, 0xb9c0c6, 0, 0.48, -2.2, 0.35);
  const windshield = rbox(group, 1.56, 0.4, 0.06, 0.02, 0x3d5a72, 0, 1.1, 0.95, 0.22);
  windshield.rotation.x = -0.32;
  windshield.material = glass;
  const rearWindow = rbox(group, 1.54, 0.36, 0.06, 0.02, 0x3d5a72, 0, 1.1, -1.22, 0.22);
  rearWindow.rotation.x = 0.32;
  rearWindow.material = glass;
  rbox(group, 0.05, 0.32, 1.7, 0.02, 0x3d5a72, -0.81, 1.1, -0.15, 0.22).material = glass;
  rbox(group, 0.05, 0.32, 1.7, 0.02, 0x3d5a72, 0.81, 1.1, -0.15, 0.22).material = glass;
  for (const side of [-1, 1]) {
    rbox(group, 0.16, 0.035, 0.045, 0.012, 0xd4d8dc, side * 0.91, 0.91, 0.1, 0.35);
    box(group, 0.035, 0.16, 0.035, dark, side * 0.92, 1.0, 1.0, 0.8);
    rbox(group, 0.18, 0.12, 0.12, 0.035, bodyColor, side * 0.99, 1.05, 1.03, 0.55);
    rbox(group, 0.035, 0.045, 0.06, 0.012, 0xffd98b, side * 0.99, 1.05, 1.09, 0.45);
    for (const z of [-1.38, 1.38]) {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(wheelRadius + 0.08, 0.035, 7, 20, Math.PI),
        mat(bodyColor, 0.72)
      );
      arch.rotation.y = Math.PI / 2;
      arch.position.set(side * 0.91, 0.4, z);
      group.add(arch);
    }
  }
  rbox(group, 0.94, 0.22, 0.055, 0.035, 0x202327, 0, 0.55, 2.22, 0.45);
  rbox(group, 1.92, 0.1, 0.16, 0.035, dark, 0, 0.34, 2.14, 0.7);
  rbox(group, 1.92, 0.1, 0.16, 0.035, dark, 0, 0.34, -2.13, 0.7);
  for (const side of [-1, 1]) {
    box(group, 0.06, 0.5, 0.1, bodyColor, side * 0.82, 1.08, -0.1);
    box(group, 0.06, 0.5, 0.1, bodyColor, side * 0.82, 1.08, 0.78);
    box(group, 0.16, 0.055, 0.08, 0xd1d7dc, side * 0.92, 1.17, 0.74, 0.35);
    box(group, 0.16, 0.08, 0.055, dark, side * 0.91, 1.18, 0.72, 0.85);
    rbox(group, 0.08, 0.045, 0.4, 0.02, dark, side * 0.91, 0.49, 0.04, 0.85);
    box(group, 0.08, 0.06, 0.22, 0x272b30, side * 0.52, 0.78, -0.38, 0.9);
    box(group, 0.04, 0.34, 0.04, 0xd4d8dc, side * 0.22, 0.65, 0.47, 0.3);
    box(group, 0.04, 0.05, 0.18, 0x252a30, side * 0.1, 0.59, -0.03, 0.9);
    box(group, 0.04, 0.05, 0.18, 0xc3c8cc, side * 0.13, 0.59, -0.03, 0.4);
  }

  const driver = buildDriver();
  driver.position.set(0.45, 0.58, 0.1);
  group.add(driver);

  rbox(group, 1.84, 0.12, 0.18, 0.04, dark, 0, 0.42, 2.15, 0.9);
  rbox(group, 1.84, 0.12, 0.18, 0.04, dark, 0, 0.42, -2.15, 0.9);
  box(group, 1.0, 0.16, 0.06, dark, 0, 0.68, 2.18);
  box(group, 0.42, 0.09, 0.05, 0xc9cbcc, 0, 0.86, 2.19);

  if (police) {
    box(group, 1.82, 0.18, 2.6, 0x26418c, 0, 0.72, -0.2);
    rbox(group, 0.7, 0.1, 0.28, 0.03, 0x26418c, 0, 1.42, -0.2, 0.85);
    emissive(group, 0.3, 0.09, 0.24, 0xd43a2a, 0xff2a1a, 1.6, -0.16, 1.46, -0.2);
    emissive(group, 0.3, 0.09, 0.24, 0x2a5ad4, 0x2a6aff, 1.6, 0.16, 1.46, -0.2);
  }

  emissive(group, 0.32, 0.15, 0.05, 0xfdf6d8, 0xfff2c0, 1.6, -0.58, 0.72, 2.19);
  emissive(group, 0.32, 0.15, 0.05, 0xfdf6d8, 0xfff2c0, 1.6, 0.58, 0.72, 2.19);
  emissive(group, 0.28, 0.13, 0.05, 0x8c1f1f, 0xff2a1a, 1.2, -0.6, 0.7, -2.19);
  emissive(group, 0.28, 0.13, 0.05, 0x8c1f1f, 0xff2a1a, 1.2, 0.6, 0.7, -2.19);

  for (const side of [-1, 1]) {
    box(group, 0.06, 0.08, 0.2, dark, side * 0.92, 1.15, 1.05);
    box(group, 0.1, 0.05, 0.05, 0x2a2c30, side * 1.0, 1.15, 1.0);
    rbox(group, 0.16, 0.1, 0.05, 0.025, 0xf7eed4, side * 0.66, 0.78, 2.2, 0.25);
    rbox(group, 0.11, 0.08, 0.05, 0.02, 0xff4b42, side * 0.67, 0.76, -2.2, 0.3);
  }

  if (luxury) {
    const chrome = 0xc8cbd0;
    rbox(group, 1.1, 0.18, 0.07, 0.02, chrome, 0, 0.58, 2.2, 0.35);
    for (let i = 0; i < 3; i += 1) {
      box(group, 0.9, 0.025, 0.035, 0x6f747b, 0, 0.58 + i * 0.045, 2.245);
    }
    for (const side of [-1, 1]) {
      box(group, 0.045, 0.045, 3.2, chrome, side * 0.91, 0.68, 0, 0.4);
      box(group, 0.22, 0.06, 0.08, 0xffd989, side * 0.65, 0.98, 1.05, 0.35);
      box(group, 0.1, 0.06, 0.08, chrome, side * 0.92, 1.16, 1.04, 0.35);
    }
    rbox(group, 0.36, 0.035, 0.22, 0.02, chrome, 0, 0.83, -2.2, 0.35);
  }

  const wheels = addWheels(
    group,
    wheelRadius,
    [
      [-0.83, 1.38, true],
      [0.83, 1.38, true],
      [-0.83, -1.38, false],
      [0.83, -1.38, false]
    ],
    0.26
  );

  return finishVehicle({
    group,
    steerPivots: wheels.steerPivots,
    spinners: wheels.spinners,
    wheelRadius,
    length,
    width: 1.8,
    centerOfMassY: 0.62,
    maxSpeed: luxury && !police ? 27 : undefined,
    driver,
    access: police
      ? undefined
      : {
          label: luxury ? 'LUXURY CAR' : 'SEDAN',
          entry: new THREE.Vector3(1.32, 0, 0.2),
          seat: new THREE.Vector3(0.45, 0, 0.1),
          interactionRange: 2.7,
          cameraHeight: 1.55
        }
  });
}

export function createLuxuryCar(color = 0x15191f): VehicleRig {
  return createSedan(color, false, true);
}

export function createKeke(): VehicleRig {
  const group = new THREE.Group();
  const yellow = 0xefc12c;
  const dark = 0x1a1b1e;
  const glass = glassMat(0x4a7fae);
  const wheelRadius = 0.28;

  rbox(group, 1.25, 0.55, 2.2, 0.12, yellow, 0, 0.6, -0.15, 0.72);
  rbox(group, 1.18, 0.45, 1.7, 0.1, dark, 0, 0.9, -0.35, 0.8);
  rbox(group, 1.3, 0.12, 2.1, 0.05, yellow, 0, 1.38, -0.2, 0.72);
  rbox(group, 1.16, 0.1, 1.6, 0.04, dark, 0, 1.44, -0.25, 0.85);
  rbox(group, 0.9, 0.5, 0.55, 0.1, yellow, 0, 0.75, 0.95, 0.72);
  rbox(group, 0.84, 0.38, 0.06, 0.02, 0x4a7fae, 0, 1.08, 1.2, 0.22).material = glass;
  box(group, 0.92, 0.1, 0.5, dark, 0, 1.0, 0.92);
  box(group, 1.28, 0.1, 0.5, dark, 0, 0.44, 0.5);
  for (const side of [-1, 1]) {
    box(group, 0.06, 0.32, 0.6, dark, side * 0.64, 1.14, -0.2);
  }

  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glowMat(0xfdf8e8, 0xfff3c0, 1.5));
  hl.position.set(0, 0.8, 1.24);
  group.add(hl);
  emissive(group, 0.14, 0.09, 0.05, 0x8c1f1f, 0xff2a1a, 1.2, -0.42, 0.66, -1.24);
  emissive(group, 0.14, 0.09, 0.05, 0x8c1f1f, 0xff2a1a, 1.2, 0.42, 0.66, -1.24);

  const driver = buildDriver();
  driver.position.set(0, 0.55, 0.6);
  group.add(driver);

  const wheels = addWheels(
    group,
    wheelRadius,
    [
      [0, 0.95, true],
      [-0.56, -0.8, false],
      [0.56, -0.8, false]
    ],
    0.18
  );

  return finishVehicle({
    group,
    steerPivots: wheels.steerPivots,
    spinners: wheels.spinners,
    wheelRadius,
    length: 2.55,
    width: 1.28,
    centerOfMassY: 0.55,
    driver,
    access: {
      label: 'KEKE',
      entry: new THREE.Vector3(-1.08, 0, 0.05),
      seat: new THREE.Vector3(0, 0, 0),
      interactionRange: 2.45,
      cameraHeight: 1.3
    }
  });
}

export function createBike(color = 0xc23b2e): VehicleRig {
  const group = new THREE.Group();
  const dark = 0x1b1d20;
  const wheelRadius = 0.3;
  const length = 1.9;

  rbox(group, 0.24, 0.27, 1.08, 0.08, color, 0, 0.74, 0.02, 0.38);
  rbox(group, 0.4, 0.34, 0.62, 0.12, color, 0, 0.91, 0.06, 0.32);
  rbox(group, 0.32, 0.2, 0.5, 0.08, 0x272b30, 0, 0.5, -0.02, 0.9);
  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, 0.2, 12),
      mat(0x858b90, 0.45, 0.55)
    );
    engine.rotation.z = Math.PI / 2;
    engine.position.set(side * 0.1, 0.52, -0.04);
    group.add(engine);
    box(group, 0.035, 0.025, 0.38, 0xaeb4b9, side * 0.19, 0.54, -0.04, 0.45);
    box(group, 0.08, 0.08, 0.54, 0x8c9298, side * 0.23, 0.4, -0.55, 0.45);
    const rotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.025, 20),
      mat(0xb9c0c6, 0.45, 0.5)
    );
    rotor.rotation.z = Math.PI / 2;
    rotor.position.set(side * 0.08, wheelRadius, 0.62);
    group.add(rotor);
  }
  // Rear saddle. A full-body rider sits here, so it runs forward under the tank.
  rbox(group, 0.36, 0.13, 0.66, 0.05, 0x141519, 0, 0.94, -0.38, 0.9);
  rbox(group, 0.28, 0.16, 0.34, 0.05, color, 0, 0.86, -0.76, 0.5);

  // Short wheelbase and the bars set back over the tank so a seated rider can
  // actually reach the grips.
  const fork = box(group, 0.07, 0.68, 0.07, 0x9aa0a6, 0, 0.64, 0.4, 0.4);
  fork.rotation.x = 0.3;
  box(group, 0.56, 0.05, 0.05, dark, 0, 1.02, 0.38);
  box(group, 0.05, 0.2, 0.05, dark, 0, 0.95, 0.37);
  rbox(group, 0.24, 0.16, 0.1, 0.04, 0xfdf8e8, 0, 0.92, 0.56, 0.9).material = glowMat(0xfdf8e8, 0xfff3c0, 1.3);
  emissive(group, 0.16, 0.1, 0.05, 0x8c1f1f, 0xff2a1a, 1.2, 0, 0.76, -0.9);

  const wheels = addWheels(
    group,
    wheelRadius,
    [
      [0, 0.62, true],
      [0, -0.62, false]
    ],
    0.12
  );

  // Foot pegs so a seated rider's boots have something to stand on.
  for (const side of [-1, 1]) {
    box(group, 0.05, 0.05, 0.2, dark, side * 0.17, 0.38, 0.04);
    box(group, 0.16, 0.04, 0.04, 0x6f747a, side * 0.25, 0.38, 0.04);
  }

  const rider = buildDriver(0x263e52);
  rider.position.set(0, 0.78, -0.34);
  rider.visible = true;
  group.add(rider);

  return finishVehicle({
    group,
    steerPivots: wheels.steerPivots,
    spinners: wheels.spinners,
    wheelRadius,
    length,
    width: 0.62,
    centerOfMassY: 0.6,
    driver: rider,
    maxSpeed: 27,
    access: {
      label: 'OKADA',
      entry: new THREE.Vector3(-0.95, 0, 0),
      seat: new THREE.Vector3(0, 0.3, -0.34),
      interactionRange: 2.3,
      cameraHeight: 1.35
    }
  });
}

/** Low, wide two-door coupe with a spoiler. */
export function createSportCar(color = 0xe03a2f): VehicleRig {
  const group = new THREE.Group();
  const dark = 0x141519;
  const glass = glassMat(0x2b4258);
  const wheelRadius = 0.37;
  const length = 4.35;

  rbox(group, 1.94, 0.38, length, 0.18, color, 0, 0.46, 0, 0.35);
  rbox(group, 1.78, 0.26, 2.1, 0.14, color, 0, 0.72, 0.35, 0.35);
  rbox(group, 1.68, 0.1, 1.5, 0.05, dark, 0, 0.86, -0.35, 0.9);
  // Open greenhouse: thin roof panel on pillars so the driver stays visible.
  rbox(group, 1.52, 0.07, 1.36, 0.03, color, 0, 1.27, -0.32, 0.28);
  for (const side of [-1, 1]) {
    box(group, 0.07, 0.45, 0.1, color, side * 0.74, 1.05, 0.36);
    box(group, 0.07, 0.45, 0.1, color, side * 0.74, 1.05, -0.98);
  }
  // Windscreen and side glass.
  const wind = rbox(group, 1.42, 0.48, 0.06, 0.02, 0x2b4258, 0, 1.05, 0.36, 0.2);
  wind.rotation.x = -0.55;
  wind.material = glass;
  rbox(group, 1.38, 0.42, 0.06, 0.02, 0x2b4258, 0, 1.04, -1.0, 0.2).material = glass;
  for (const side of [-1, 1]) {
    rbox(group, 0.05, 0.34, 1.2, 0.02, 0x2b4258, side * 0.76, 1.05, -0.32, 0.2).material = glass;
  }
  // Bonnet scoop and splitter.
  rbox(group, 0.7, 0.08, 0.5, 0.03, dark, 0, 0.66, 1.5, 0.8);
  rbox(group, 1.9, 0.1, 0.34, 0.04, dark, 0, 0.32, 2.02, 0.85);
  // Rear spoiler.
  box(group, 1.7, 0.07, 0.32, dark, 0, 1.16, -2.0);
  for (const side of [-1, 1]) {
    box(group, 0.08, 0.3, 0.1, dark, side * 0.68, 1.0, -1.98);
  }
  // Side skirts.
  for (const side of [-1, 1]) {
    box(group, 0.1, 0.16, 2.4, dark, side * 0.98, 0.36, 0);
  }

  const driver = buildDriver();
  driver.position.set(0.45, 0.56, 0.05);
  group.add(driver);

  emissive(group, 0.4, 0.12, 0.05, 0xfdf6d8, 0xfff2c0, 1.8, -0.62, 0.56, 2.17);
  emissive(group, 0.4, 0.12, 0.05, 0xfdf6d8, 0xfff2c0, 1.8, 0.62, 0.56, 2.17);
  emissive(group, 0.44, 0.11, 0.05, 0x8c1f1f, 0xff2a1a, 1.4, -0.62, 0.56, -2.17);
  emissive(group, 0.44, 0.11, 0.05, 0x8c1f1f, 0xff2a1a, 1.4, 0.62, 0.56, -2.17);

  const wheels = addWheels(
    group,
    wheelRadius,
    [
      [-0.9, 1.42, true],
      [0.9, 1.42, true],
      [-0.9, -1.4, false],
      [0.9, -1.4, false]
    ],
    0.3
  );

  return finishVehicle({
    group,
    steerPivots: wheels.steerPivots,
    spinners: wheels.spinners,
    wheelRadius,
    length,
    width: 1.94,
    centerOfMassY: 0.52,
    driver,
    maxSpeed: 30,
    access: {
      label: 'SPORT CAR',
      entry: new THREE.Vector3(1.38, 0, 0.1),
      seat: new THREE.Vector3(0.45, 0, 0.05),
      interactionRange: 2.7,
      cameraHeight: 1.4
    }
  });
}

export function createPoliceCar(): VehicleRig {
  return createSedan(0xe8e8e6, true);
}

export function createShamalJet(color = 0x224477): VehicleRig {
  const group = new THREE.Group();
  const white = 0xe8eaec;
  const glass = glassMat(0x2a445e);
  const wheelRadius = 0.38;
  const length = 14.5;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 11, 14),
    mat(white, 0.45)
  );
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 1.4, 0);
  group.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 2.8, 14),
    mat(white, 0.45)
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.4, 6.9);
  group.add(nose);

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 3.2, 14),
    mat(white, 0.45)
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 1.4, -7.1);
  group.add(tail);

  rbox(group, 12.0, 0.22, 2.8, 0.08, white, 0, 1.25, 0.2, 0.4);
  for (const side of [-1, 1]) {
    rbox(group, 0.22, 1.2, 0.8, 0.06, color, side * 5.95, 1.8, 0.2, 0.4);
  }
  rbox(group, 4.6, 0.18, 1.6, 0.06, white, 0, 1.5, -6.0, 0.4);
  const fin = rbox(group, 0.24, 2.8, 2.2, 0.08, color, 0, 2.9, -6.2, 0.4);
  fin.rotation.x = -0.18;

  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.62, 2.4, 12),
      mat(0x9aa0a6, 0.4, 0.3)
    );
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 1.55, 1.85, -2.2);
    group.add(engine);
    emissive(group, 0.9, 0.9, 0.08, 0xff7722, 0xffaa44, 2.0, side * 1.55, 1.85, -3.42);
  }

  for (const side of [-1, 1]) {
    box(group, 0.06, 0.28, 9.5, color, side * 1.08, 1.25, 0.6);
    box(group, 0.06, 0.38, 3.2, 0x1d2e3d, side * 1.08, 1.7, 4.2).material = glass;
  }
  box(group, 1.6, 0.38, 0.08, 0x1d2e3d, 0, 1.75, 5.7).material = glass;

  const driver = buildDriver();
  driver.position.set(-0.35, 1.35, 4.2);
  group.add(driver);

  const wheels = addWheels(
    group,
    wheelRadius,
    [
      [0, 5.2, true],
      [-1.4, -0.6, false],
      [1.4, -0.6, false]
    ],
    0.2
  );

  return finishVehicle({
    group,
    steerPivots: wheels.steerPivots,
    spinners: wheels.spinners,
    wheelRadius,
    length,
    width: 12.0,
    centerOfMassY: 1.4,
    maxSpeed: 42,
    driver,
    kind: 'plane',
    pitch: 0,
    roll: 0,
    yaw: 0,
    altitude: 0,
    verticalSpeed: 0,
    access: {
      label: 'JET',
      entry: new THREE.Vector3(-1.8, 0, 3.5),
      seat: new THREE.Vector3(-0.35, 0, 4.2),
      interactionRange: 4.8,
      cameraHeight: 3.2
    }
  });
}

export function createMaverickHelicopter(color = 0x2b4c3f): VehicleRig {
  const group = new THREE.Group();
  const dark = 0x1d2024;
  const glass = glassMat(0x3a5f7d);
  const wheelRadius = 0.28;
  const length = 10.5;

  const cabin = new THREE.Mesh(
    new RoundedBoxGeometry(2.1, 2.0, 3.8, 3, 0.4),
    mat(color, 0.5)
  );
  cabin.position.set(0, 1.5, 0.6);
  group.add(cabin);

  const windscreen = new THREE.Mesh(
    new RoundedBoxGeometry(1.95, 1.3, 1.6, 3, 0.3),
    glass
  );
  windscreen.position.set(0, 1.6, 1.6);
  group.add(windscreen);

  const boom = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 6.2, 10),
    mat(color, 0.5)
  );
  boom.rotation.x = -Math.PI / 2;
  boom.position.set(0, 1.7, -4.2);
  group.add(boom);

  rbox(group, 0.16, 1.6, 1.1, 0.05, 0xdd4433, 0, 2.2, -7.0, 0.4);

  for (const side of [-1, 1]) {
    box(group, 0.12, 0.12, 4.2, dark, side * 1.05, 0.22, 0.4);
    for (const z of [-0.8, 1.2]) {
      box(group, 0.08, 0.75, 0.08, dark, side * 1.05, 0.55, z);
    }
  }

  const mainRotorGroup = new THREE.Group();
  mainRotorGroup.position.set(0, 2.7, 0.4);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.6, 10),
    mat(0x889098, 0.3, 0.6)
  );
  mast.position.y = -0.3;
  mainRotorGroup.add(mast);

  rbox(mainRotorGroup, 9.6, 0.05, 0.36, 0.02, dark, 0, 0, 0, 0.3);
  const mainRotorHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12),
    mat(0xaaaaaa, 0.3, 0.7)
  );
  mainRotorGroup.add(mainRotorHub);
  group.add(mainRotorGroup);

  const tailRotorGroup = new THREE.Group();
  tailRotorGroup.position.set(0.22, 2.2, -7.1);
  rbox(tailRotorGroup, 0.04, 1.4, 0.18, 0.02, dark, 0, 0, 0, 0.3);
  group.add(tailRotorGroup);

  const driver = buildDriver();
  driver.position.set(-0.45, 1.1, 0.8);
  group.add(driver);

  const dummyWheels = addWheels(
    group,
    wheelRadius,
    [
      [-1.05, 1.2, false],
      [1.05, 1.2, false],
      [-1.05, -0.8, false],
      [1.05, -0.8, false]
    ],
    0.1
  );

  return finishVehicle({
    group,
    steerPivots: dummyWheels.steerPivots,
    spinners: [tailRotorGroup],
    rotors: [mainRotorGroup],
    rotorSpeed: 0,
    wheelRadius,
    length,
    width: 2.8,
    centerOfMassY: 1.4,
    maxSpeed: 32,
    driver,
    kind: 'helicopter',
    pitch: 0,
    roll: 0,
    yaw: 0,
    altitude: 0,
    verticalSpeed: 0,
    access: {
      label: 'HELICOPTER',
      entry: new THREE.Vector3(-1.4, 0, 0.6),
      seat: new THREE.Vector3(-0.45, 0, 0.8),
      interactionRange: 3.8,
      cameraHeight: 2.8
    }
  });
}

export function createStuntPlane(color = 0xd43825): VehicleRig {
  const group = new THREE.Group();
  const glass = glassMat(0x3a5f7d);
  const wheelRadius = 0.32;
  const length = 8.2;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.75, 6.4, 12),
    mat(color, 0.4)
  );
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 1.1, 0);
  group.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 1.6, 12),
    mat(0xffcc00, 0.4)
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.1, 4.0);
  group.add(nose);

  const propGroup = new THREE.Group();
  propGroup.position.set(0, 1.1, 4.85);
  const propHub = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.45, 10),
    mat(0x222222, 0.3, 0.8)
  );
  propHub.rotation.x = Math.PI / 2;
  propGroup.add(propHub);
  rbox(propGroup, 2.6, 0.04, 0.18, 0.02, 0x1a1a1a, 0, 0, 0, 0.3);
  group.add(propGroup);

  rbox(group, 8.8, 0.16, 1.8, 0.05, color, 0, 1.15, 0.8, 0.4);
  rbox(group, 8.7, 0.18, 0.4, 0.02, 0xffcc00, 0, 1.16, 0.8, 0.4);
  rbox(group, 3.2, 0.14, 1.2, 0.04, color, 0, 1.25, -2.8, 0.4);
  rbox(group, 0.16, 1.8, 1.4, 0.05, 0xffcc00, 0, 1.9, -2.9, 0.4);

  rbox(group, 0.9, 0.65, 1.8, 0.2, 0x1d2e3d, 0, 1.6, 0.4).material = glass;

  const driver = buildDriver();
  driver.position.set(0, 1.05, 0.3);
  group.add(driver);

  const wheels = addWheels(
    group,
    wheelRadius,
    [
      [-1.1, 0.9, false],
      [1.1, 0.9, false],
      [0, -2.9, true]
    ],
    0.16
  );

  return finishVehicle({
    group,
    steerPivots: wheels.steerPivots,
    spinners: wheels.spinners,
    propellers: [propGroup],
    wheelRadius,
    length,
    width: 8.8,
    centerOfMassY: 1.1,
    maxSpeed: 36,
    driver,
    kind: 'plane',
    pitch: 0,
    roll: 0,
    yaw: 0,
    altitude: 0,
    verticalSpeed: 0,
    access: {
      label: 'STUNT PLANE',
      entry: new THREE.Vector3(-1.4, 0, 0.4),
      seat: new THREE.Vector3(0, 0, 0.3),
      interactionRange: 3.8,
      cameraHeight: 2.6
    }
  });
}
