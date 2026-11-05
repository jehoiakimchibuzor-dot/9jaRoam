import * as THREE from 'three';
import { IS_ANDROID } from '../platform';

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type SiteKind =
  | 'hotel'
  | 'club'
  | 'police'
  | 'market'
  | 'school'
  | 'hospital'
  | 'garage'
  | 'restaurant'
  | 'shop'
  | 'house'
  | 'fuel';

export interface LandmarkZone {
  name: SiteKind;
  /** Unique id for sites that share a kind (nightclubs, shops). */
  id?: string;
  /** Optional sign text override. */
  label?: string;
  side: number;
  z: number;
  width: number;
  depth: number;
}

export interface CitySite {
  id: string;
  kind: SiteKind;
  label: string;
  x: number;
  z: number;
  side: number;
  width: number;
  depth: number;
  entranceX: number;
  entranceZ: number;
  facing: number;
  buildShell: boolean;
}

export function fuelPumpApproach(site: CitySite): { x: number; z: number } {
  return {
    x: site.entranceX - site.side * 3.5,
    z: site.entranceZ
  };
}

export interface District {
  name: string;
  x: number;
  z: number;
  radius: number;
}

/** Roadside service point the player can walk up to (ATM or POS stand). */
export interface ServiceSpot {
  id: string;
  kind: 'atm' | 'pos';
  label: string;
  x: number;
  z: number;
  facing: number;
  withdrawalAmount: number;
}

export interface TransitStop {
  id: string;
  label: string;
  x: number;
  z: number;
}

export interface RailStation {
  id: string;
  label: string;
  x: number;
  z: number;
  accessX: number;
  accessZ: number;
}

export interface ParkingSpace {
  x: number;
  z: number;
  yaw: number;
  surfaceY: number;
}

export interface City {
  group: THREE.Group;
  colliders: Collider[];
  buildings: Collider[];
  roadHalfWidth: number;
  sidewalkTop: number;
  minZ: number;
  maxZ: number;
  worldMinX: number;
  worldMaxX: number;
  worldMinZ: number;
  worldMaxZ: number;
  landmarks: LandmarkZone[];
  sites: CitySite[];
  districts: District[];
  atms: ServiceSpot[];
  posStands: ServiceSpot[];
  transitStops: TransitStop[];
  railStations: RailStation[];
  parkingSpaces: ParkingSpace[];
  crossZs: number[];
  sideRoads: number[];
  /** The Kano river cutting the east side of the map. Null-safe bounds set. */
  river: { minX: number; maxX: number; minZ: number; maxZ: number; surfaceY: number };
  /** Water surface height at a point, or null when on dry land. */
  waterAt(x: number, z: number, axis?: 'x' | 'z', referenceY?: number): number | null;
  /** Animates water, boats and river traffic. */
  update(dt: number): void;
  /** Turns the city's window lights and rooftop beacons on at night. */
  setNightMode(enabled: boolean): void;
  isRoad(x: number, z: number): boolean;
  groundHeightAt(x: number, z: number, axis?: 'x' | 'z', referenceY?: number): number;
  /** Height of an elevated road at a point, optionally for its travel axis. */
  deckHeightAt(x: number, z: number, axis?: 'x' | 'z', referenceY?: number): number;
  districtAt(x: number, z: number): string;
}

export function constrainVehicleToBridge(
  position: THREE.Vector3,
  halfWidthX: number,
  halfWidthZ: number
): void {
  const highBridgeRailZ = CROSS_HALF + 3;
  for (const crossing of HIGH_BRIDGE_CROSSINGS) {
    const deckY = highBridgeDeckY(position.x, crossing);
    if (
      deckY <= 0 ||
      Math.abs(position.y - deckY) > 1.25 ||
      Math.abs(position.z - crossing) > highBridgeRailZ + halfWidthZ
    ) continue;
    const maxOffset = highBridgeRailZ - 0.1 - halfWidthZ;
    position.z = crossing + Math.sign(position.z - crossing || 1) *
      Math.min(Math.abs(position.z - crossing), maxOffset);
    return;
  }

  if (
    position.x >= WEST_DISTRICT_MAX_X &&
    position.x <= WEST_SHORE_X &&
    Math.abs(position.y) <= 1.25
  ) {
    for (const crossing of CROSS_ZS) {
      if (HIGH_BRIDGE_CROSSINGS.includes(crossing)) continue;
      const railZ = CROSS_HALF + 3.1;
      if (Math.abs(position.z - crossing) > railZ + halfWidthZ) continue;
      const maxOffset = railZ - 0.1 - halfWidthZ;
      position.z = crossing + Math.sign(position.z - crossing || 1) *
        Math.min(Math.abs(position.z - crossing), maxOffset);
    }
  }

  if (
    position.x >= RIVER_MIN_X - 5 &&
    position.x <= RIVER_MAX_X + 5 &&
    Math.abs(position.y) <= 1.25
  ) {
    for (const crossing of CROSS_ZS) {
      const railZ = CROSS_HALF + 2.1;
      if (Math.abs(position.z - crossing) > railZ + halfWidthZ) continue;
      const maxOffset = railZ - 0.32 - halfWidthZ;
      position.z = crossing + Math.sign(position.z - crossing || 1) *
        Math.min(Math.abs(position.z - crossing), maxOffset);
    }
  }

  const mainCausewayY = causewayDeckY(CAUSEWAY_X, position.z);
  if (
    mainCausewayY > 0 &&
    Math.abs(position.y - mainCausewayY) <= 1.25 &&
    Math.abs(position.x - CAUSEWAY_X) <= CAUSEWAY_HALF_W + halfWidthX
  ) {
    const maxOffset = CAUSEWAY_HALF_W - 0.5 - halfWidthX;
    position.x = CAUSEWAY_X + Math.sign(position.x - CAUSEWAY_X || 1) *
      Math.min(Math.abs(position.x - CAUSEWAY_X), maxOffset);
  }

  for (const approachZ of CAUSEWAY_APPROACH_ZS) {
    const approachY = causewayDeckY(position.x, approachZ);
    if (
      approachY <= 0 ||
      Math.abs(position.y - approachY) > 1.25 ||
      Math.abs(position.z - approachZ) > CAUSEWAY_HALF_W + halfWidthZ
    ) continue;
    const maxOffset = CAUSEWAY_HALF_W - 0.5 - halfWidthZ;
    position.z = approachZ + Math.sign(position.z - approachZ || 1) *
      Math.min(Math.abs(position.z - approachZ), maxOffset);
  }
}

export function constrainPlayerToFootbridge(position: THREE.Vector3, radius: number): void {
  if (
    Math.abs(position.y - FOOTBRIDGE_DECK_Y) > 0.85 ||
    Math.abs(position.z - FOOTBRIDGE_Z) > FOOTBRIDGE_DECK_HALF_Z + radius
  ) return;

  position.x = THREE.MathUtils.clamp(
    position.x,
    -FOOTBRIDGE_DECK_HALF_X + radius,
    FOOTBRIDGE_DECK_HALF_X - radius
  );
  const onStairLane = [-1, 1].some(
    (side) =>
      Math.abs(position.x - side * FOOTBRIDGE_STAIR_X) <=
      FOOTBRIDGE_STAIR_HALF_W - radius
  );
  if (!onStairLane) {
    position.z = THREE.MathUtils.clamp(
      position.z,
      FOOTBRIDGE_Z - FOOTBRIDGE_DECK_HALF_Z + radius,
      FOOTBRIDGE_Z + FOOTBRIDGE_DECK_HALF_Z - radius
    );
  }
}

// Wide six-lane boulevard with a proper city grid around it.
export const ROAD_HALF = 11;
export const ROAD_LENGTH = 1040;
export const WORLD_HALF_X = 520;
export const DESERT_HIGHWAY_START_X = WORLD_HALF_X;
export const DESERT_HIGHWAY_END_X = 1240;
export const DESERT_HIGHWAY_Z = 412;
export const DESERT_HIGHWAY_HALF_WIDTH = 9;
// A quieter frontage road runs parallel to the highway with a pair of
// connectors, so the drylands feel like a real road network instead of a
// single ribbon of tarmac.
export const DESERT_FRONTAGE_START_X = 592;
export const DESERT_FRONTAGE_END_X = 1226;
export const DESERT_FRONTAGE_Z = 360;
export const DESERT_FRONTAGE_HALF_WIDTH = 7;
export const DESERT_CONNECTOR_XS = [700, 1000];
export const DESERT_CONNECTOR_HALF_WIDTH = 6;
export const SIDE_ROAD_X = 64;
export const SIDE_HALF = 9;
export const OUTER_ROAD_X = 136;
export const OUTER_HALF = 8;
export const FAR_ROAD_X = 208;
export const FAR_HALF = 8;
// East-bank avenues, reached by crossing the river bridges.
export const EAST_ROAD_X = 372;
export const EAST_FAR_X = 468;
export const RIVER_MIN_X = 250;
export const RIVER_MAX_X = 310;
export const RIVER_SURFACE_Y = -1.15;
export const CROSS_HALF = 9;
export const CROSS_ZS = [-488, -336, -180, -12, 128, 264, 412];
// The international airport sits on the far east coast, past the last row of
// east-bank buildings. Nothing else may be generated inside this circle.
export const AIRPORT_X = 560;
export const AIRPORT_Z = -200;
export const AIRPORT_R = 100;
// Ocean beyond the city edges.
export const OCEAN_EDGE = 860;
export const OCEAN_SURFACE_Y = -0.35;
export const SHORE_BLEND = 40;
// The western third of the map is open ocean: the city ground stops at this
// shoreline and everything west of it is deep water.
export const WEST_SHORE_X = -240;
// A second compact district sits beyond the bay causeway.
export const WEST_DISTRICT_MIN_X = -640;
// A long causeway carries traffic north-south across that water, well clear of
// every building, with its approaches tying into the cross streets on the bank.
export const CAUSEWAY_X = -344;
export const CAUSEWAY_HALF_W = 9;
const CAUSEWAY_APPROACH_START_X = CAUSEWAY_X + CAUSEWAY_HALF_W;
export const WEST_DISTRICT_MAX_X = CAUSEWAY_X - CAUSEWAY_HALF_W - 4;
export const CAUSEWAY_DECK_Y = 4.4;
export const CAUSEWAY_APPROACH_ZS = [CROSS_ZS[0], CROSS_ZS[CROSS_ZS.length - 1]];
export const HIGH_BRIDGE_CROSSINGS = [CROSS_ZS[2], CROSS_ZS[4]];
export const HIGH_BRIDGE_APPROACH_LENGTH = 80;
export const HIGH_BRIDGE_DECK_Y = 9.2;
export const HIGH_BRIDGE_WEST_END_X = WEST_DISTRICT_MAX_X - HIGH_BRIDGE_APPROACH_LENGTH;
export const HIGH_BRIDGE_EAST_END_X = WEST_SHORE_X + HIGH_BRIDGE_APPROACH_LENGTH;
export const SUBWAY_RAIL_HEIGHT = -4.6;
export const SUBWAY_PLATFORM_HEIGHT = SUBWAY_RAIL_HEIGHT - 0.71;
const SUBWAY_STAIR_BOTTOM_Z_OFFSET = -1;
const SUBWAY_STAIR_HALF_WIDTH = 1.25;
const SUBWAY_ENTRANCE_HALF_WIDTH = 1.6;
const RAIL_STATIONS: RailStation[] = [
  { id: 'kano-central', label: 'KANO CENTRAL', x: EAST_ROAD_X, z: -336, accessX: EAST_ROAD_X + 12, accessZ: -318 },
  { id: 'kofar-wambai-rail', label: 'KOFAR WAMBAI', x: EAST_ROAD_X, z: -12, accessX: EAST_ROAD_X + 12, accessZ: 6 },
  { id: 'sabon-gari-rail', label: 'SABON GARI', x: EAST_ROAD_X, z: 264, accessX: EAST_ROAD_X + 12, accessZ: 282 }
];
export const SIDE_ROADS = [
  -624,
  -552,
  -480,
  -408,
  -FAR_ROAD_X,
  -OUTER_ROAD_X,
  -SIDE_ROAD_X,
  SIDE_ROAD_X,
  OUTER_ROAD_X,
  FAR_ROAD_X,
  EAST_ROAD_X,
  EAST_FAR_X
];
/** True when the point is out on the river (bridges stay dry because they are roads). */
export function isRiverAt(x: number, z: number, halfZ = ROAD_LENGTH / 2): boolean {
  return x > RIVER_MIN_X && x < RIVER_MAX_X && Math.abs(z) < halfZ;
}
/** Timber piers that reach out over the water from both banks. */
export const JETTY_ZS = [42, -262];
const JETTY_DECK_IN = 3.0;
const JETTY_DECK_OUT = 6.0;
export function onJettyDeck(x: number, z: number): boolean {
  if (!JETTY_ZS.some((jz) => Math.abs(z - jz) < 3.2)) return false;
  const west = x > RIVER_MIN_X - JETTY_DECK_IN && x < RIVER_MIN_X + JETTY_DECK_OUT;
  const east = x < RIVER_MAX_X + JETTY_DECK_IN && x > RIVER_MAX_X - JETTY_DECK_OUT;
  return west || east;
}

/** True when the point sits on the causeway deck or one of its bank approaches. */
export function onCauseway(x: number, z: number): boolean {
  if (
    Math.abs(x - CAUSEWAY_X) <= CAUSEWAY_HALF_W &&
    z > -ROAD_LENGTH / 2 &&
    z < ROAD_LENGTH / 2
  ) {
    return true;
  }
  for (const az of CAUSEWAY_APPROACH_ZS) {
    if (
      Math.abs(z - az) < CAUSEWAY_HALF_W &&
      x >= CAUSEWAY_APPROACH_START_X &&
      x < WEST_SHORE_X
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the height of an elevated road deck, or 0 away from one.
 */
export function causewayDeckY(x: number, z: number): number {
  if (
    Math.abs(x - CAUSEWAY_X) <= CAUSEWAY_HALF_W &&
    z > -ROAD_LENGTH / 2 &&
    z < ROAD_LENGTH / 2
  ) {
    return CAUSEWAY_DECK_Y + 0.08;
  }
  for (const az of CAUSEWAY_APPROACH_ZS) {
    if (
      Math.abs(z - az) < CAUSEWAY_HALF_W &&
      x >= CAUSEWAY_APPROACH_START_X &&
      x < WEST_SHORE_X
    ) {
      const t = (WEST_SHORE_X - x) / (WEST_SHORE_X - CAUSEWAY_APPROACH_START_X);
      return 0.08 + CAUSEWAY_DECK_Y * Math.min(1, Math.max(0, t));
    }
  }
  return 0;
}

/** Height of either high bridge over the western bay and its land approaches. */
export function highBridgeDeckY(x: number, z: number): number {
  for (const crossing of HIGH_BRIDGE_CROSSINGS) {
    if (Math.abs(z - crossing) > CROSS_HALF + 3.2) continue;
    if (x <= HIGH_BRIDGE_WEST_END_X || x >= HIGH_BRIDGE_EAST_END_X) return 0;
    if (x < WEST_DISTRICT_MAX_X) {
      return HIGH_BRIDGE_DECK_Y *
        (x - HIGH_BRIDGE_WEST_END_X) / HIGH_BRIDGE_APPROACH_LENGTH;
    }
    if (x > WEST_SHORE_X) {
      return HIGH_BRIDGE_DECK_Y *
        (HIGH_BRIDGE_EAST_END_X - x) / HIGH_BRIDGE_APPROACH_LENGTH;
    }
    return HIGH_BRIDGE_DECK_Y;
  }
  return 0;
}

function bridgeDeckYAt(
  x: number,
  z: number,
  axis?: 'x' | 'z',
  referenceY?: number
): number {
  const causewayY = causewayDeckY(x, z);
  const onMainCauseway =
    Math.abs(x - CAUSEWAY_X) <= CAUSEWAY_HALF_W &&
    z > -ROAD_LENGTH / 2 &&
    z < ROAD_LENGTH / 2;
  const onCausewayApproach = CAUSEWAY_APPROACH_ZS.some(
    (approachZ) =>
      Math.abs(z - approachZ) < CAUSEWAY_HALF_W &&
      x >= CAUSEWAY_X - CAUSEWAY_HALF_W &&
      x < WEST_SHORE_X
  );
  const followsCauseway = referenceY !== undefined
    ? Math.abs(causewayY - referenceY) <= 0.75
    : (onMainCauseway && axis === 'z') || (onCausewayApproach && axis === 'x');
  const selectedCausewayY = causewayY > 0 && followsCauseway ? causewayY : 0;

  const candidateHighBridgeY = highBridgeDeckY(x, z);
  const followsHighBridge = referenceY !== undefined
    ? Math.abs(candidateHighBridgeY - referenceY) <= 0.75
    : axis === 'x' && (x < WEST_DISTRICT_MAX_X || x > WEST_SHORE_X);
  const highBridgeY =
    candidateHighBridgeY > 0 && followsHighBridge ? candidateHighBridgeY : 0;

  return Math.max(selectedCausewayY, highBridgeY);
}
/** Width of the avenue/ring road nearest to an x coordinate. */
export function roadHalfFor(x: number): number {
  const ax = Math.abs(x);
  if (ax >= FAR_ROAD_X - 1) return FAR_HALF;
  if (ax >= OUTER_ROAD_X - 1) return OUTER_HALF;
  return SIDE_HALF;
}
/** Distance from the boulevard centre to the front of the sidewalk buildings. */
export const BUILD_LINE = ROAD_HALF + 6.15;
const SIDEWALK_TOP = 0.18;

// ---------------------------------------------------------------- footbridge
// Pedestrian bridge over the boulevard at z = 60. Both ends get a real flight
// of stairs on each side of the deck, so you can climb up and come down again.
export const FOOTBRIDGE_Z = 60;
export const FOOTBRIDGE_DECK_Y = 6.3;
export const FOOTBRIDGE_DECK_HALF_X = 14;
export const FOOTBRIDGE_DECK_HALF_Z = 1.8;
/** Centre line of each stair flight, measured from the boulevard centre. */
export const FOOTBRIDGE_STAIR_X = 12.6;
export const FOOTBRIDGE_STAIR_HALF_W = 1.35;
export const FOOTBRIDGE_STEP_RISE = 0.18;
export const FOOTBRIDGE_STEP_RUN = 0.34;
export const FOOTBRIDGE_STEP_COUNT = 34;
export const FOOTBRIDGE_STAIR_RUN = FOOTBRIDGE_STEP_COUNT * FOOTBRIDGE_STEP_RUN;
/** Height of the walking surface of the footbridge, 0 when off it. */
export function footbridgeHeightAt(x: number, z: number): number {
  if (
    Math.abs(x) <= FOOTBRIDGE_DECK_HALF_X &&
    Math.abs(z - FOOTBRIDGE_Z) <= FOOTBRIDGE_DECK_HALF_Z
  ) {
    return FOOTBRIDGE_DECK_Y;
  }
  const stairInner = FOOTBRIDGE_STAIR_X - FOOTBRIDGE_STAIR_HALF_W;
  const stairOuter = FOOTBRIDGE_STAIR_X + FOOTBRIDGE_STAIR_HALF_W;
  const ax = Math.abs(x);
  if (ax < stairInner || ax > stairOuter) return 0;
  const edge = FOOTBRIDGE_DECK_HALF_Z;
  // Distance travelled away from the deck on whichever side of z we are on.
  const run = Math.abs(z - FOOTBRIDGE_Z) - edge;
  if (run < 0 || run > FOOTBRIDGE_STAIR_RUN) return 0;
  const step = Math.min(FOOTBRIDGE_STEP_COUNT - 1, Math.floor(run / FOOTBRIDGE_STEP_RUN));
  return FOOTBRIDGE_DECK_Y - step * FOOTBRIDGE_STEP_RISE;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const tankGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10);
const palmTrunkGeometry = new THREE.CylinderGeometry(0.14, 0.2, 4.4, 7);
const poleGeometry = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 8);
const binGeometry = new THREE.CylinderGeometry(0.28, 0.24, 0.8, 10);
const lampGeometry = new THREE.SphereGeometry(0.14, 8, 6);

interface InstanceBatch {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: THREE.Matrix4[];
  colors: number[] | null;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
}

const batches = new Map<string, InstanceBatch>();
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const glowCache = new Map<string, THREE.MeshStandardMaterial>();
const batchMaterialCache = new Map<number, THREE.MeshStandardMaterial>();
// Lit windows and rooftop beacons are collected while the city is built, then
// flushed into one instanced mesh each and toggled as a unit at night.
const windowLightMatrices: THREE.Matrix4[] = [];
const windowLightColors: number[] = [];
const beaconMatrices: THREE.Matrix4[] = [];

/** White base material so per-instance colors can carry the real tint. */
function batchMat(roughness: number): THREE.MeshStandardMaterial {
  let material = batchMaterialCache.get(roughness);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness,
      metalness: 0,
      flatShading: true
    });
    batchMaterialCache.set(roughness, material);
  }
  return material;
}

function mat(color: number, roughness = 0.95): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });
    materialCache.set(key, material);
  }
  return material;
}

function glowMat(lampColor: number): THREE.MeshStandardMaterial {
  const key = `${lampColor}`;
  let material = glowCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: 0xf5f0e0,
      emissive: lampColor,
      emissiveIntensity: 1.3
    });
    glowCache.set(key, material);
  }
  return material;
}

const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchEuler = new THREE.Euler();
const scratchQuaternion = new THREE.Quaternion();
const scratchColor = new THREE.Color();

function transform(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rx: number,
  ry: number,
  rz: number
): THREE.Matrix4 {
  scratchPosition.set(x, y, z);
  scratchScale.set(sx, sy, sz);
  scratchQuaternion.setFromEuler(scratchEuler.set(rx, ry, rz));
  return new THREE.Matrix4().compose(scratchPosition, scratchQuaternion, scratchScale);
}

function pushBatch(
  key: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrix: THREE.Matrix4,
  castShadow: boolean,
  receiveShadow: boolean,
  renderOrder = 0,
  color?: number
): void {
  const id = `${key}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}|${renderOrder}|${color === undefined ? 'n' : 'c'}`;
  let batch = batches.get(id);
  if (!batch) {
    batch = {
      geometry,
      material,
      matrices: [],
      colors: color === undefined ? null : [],
      castShadow,
      receiveShadow,
      renderOrder
    };
    batches.set(id, batch);
  }
  batch.matrices.push(matrix);
  if (color !== undefined && batch.colors) batch.colors.push(color);
}

interface ShapeOptions {
  cast?: boolean;
  receive?: boolean;
  rx?: number;
  ry?: number;
  rz?: number;
}

function box(
  color: number,
  roughness: number,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  options: ShapeOptions = {}
): void {
  const { cast = true, receive = true, rx = 0, ry = 0, rz = 0 } = options;
  pushBatch(
    `box:${roughness}`,
    unitBox,
    batchMat(roughness),
    transform(x, y, z, w, h, d, rx, ry, rz),
    cast,
    receive,
    0,
    color
  );
}

function cylinder(
  key: string,
  geometry: THREE.BufferGeometry,
  color: number,
  roughness: number,
  x: number,
  y: number,
  z: number,
  options: ShapeOptions = {}
): void {
  const { cast = true, receive = true, rx = 0, ry = 0, rz = 0 } = options;
  pushBatch(
    `cyl:${key}:${roughness}`,
    geometry,
    batchMat(roughness),
    transform(x, y, z, 1, 1, 1, rx, ry, rz),
    cast,
    receive,
    0,
    color
  );
}

function flushBatches(parent: THREE.Group): void {
  for (const batch of batches.values()) {
    if (batch.matrices.length === 0) continue;
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    for (let i = 0; i < batch.matrices.length; i += 1) mesh.setMatrixAt(i, batch.matrices[i]);
    if (batch.colors) {
      for (let i = 0; i < batch.colors.length; i += 1) {
        mesh.setColorAt(i, scratchColor.setHex(batch.colors[i]));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = batch.castShadow;
    mesh.receiveShadow = batch.receiveShadow;
    mesh.renderOrder = batch.renderOrder;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }
  batches.clear();
}

/** One instanced mesh of lit windows plus one of rooftop beacons. */
function buildCityNightLights(parent: THREE.Group): THREE.Group {
  const group = new THREE.Group();
  group.name = 'city-night-lights';

  if (windowLightMatrices.length > 0) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const windows = new THREE.InstancedMesh(
      unitPlane,
      material,
      windowLightMatrices.length
    );
    for (let i = 0; i < windowLightMatrices.length; i += 1) {
      windows.setMatrixAt(i, windowLightMatrices[i]);
      windows.setColorAt(i, scratchColor.setHex(windowLightColors[i]));
    }
    windows.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    windows.castShadow = false;
    windows.receiveShadow = false;
    windows.computeBoundingSphere();
    group.add(windows);
  }

  if (beaconMatrices.length > 0) {
    const beacons = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.34, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff3a22, toneMapped: false }),
      beaconMatrices.length
    );
    for (let i = 0; i < beaconMatrices.length; i += 1) {
      beacons.setMatrixAt(i, beaconMatrices[i]);
    }
    beacons.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    beacons.castShadow = false;
    beacons.receiveShadow = false;
    beacons.computeBoundingSphere();
    group.add(beacons);
  }

  group.visible = false;
  parent.add(group);
  return group;
}

let blobMaterial: THREE.MeshBasicMaterial | null = null;

function getBlobTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.16)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

function getBlobMaterial(): THREE.MeshBasicMaterial {
  if (!blobMaterial) {
    blobMaterial = new THREE.MeshBasicMaterial({
      map: getBlobTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.8
    });
  }
  return blobMaterial;
}

let junctionMaterial: THREE.MeshBasicMaterial | null = null;

/**
 * Painted yellow box junction, the kind found all over Nigerian cities.
 * Border only: the old dense diagonal lattice read as railway tracks from
 * inside a vehicle, and a filled panel glowed like a slab at night.
 */
function getJunctionMaterial(): THREE.MeshBasicMaterial {
  if (junctionMaterial) return junctionMaterial;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(238, 194, 44, 0.5)';
    ctx.lineWidth = 7;
    ctx.strokeRect(4, 4, size - 8, size - 8);
    ctx.strokeStyle = 'rgba(238, 194, 44, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(13, 13, size - 26, size - 26);
  }
  const tex = new THREE.CanvasTexture(canvas);
  junctionMaterial = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.85
  });
  return junctionMaterial;
}

function contactShadow(
  w: number,
  d: number,
  x: number,
  z: number,
  y = SIDEWALK_TOP + 0.005
): void {
  pushBatch(
    'contact-shadow',
    unitPlane,
    getBlobMaterial(),
    transform(x, y, z, w, d, 1, -Math.PI / 2, 0, 0),
    false,
    false,
    1
  );
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const signTextureCache = new Map<string, THREE.CanvasTexture>();

function makeSignTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const cacheKey = `${text}|${bg}|${fg}`;
  const cached = signTextureCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = fg;
    let fontSize = 72;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    while (ctx.measureText(text).width > 462 && fontSize > 22) {
      fontSize -= 3;
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  signTextureCache.set(cacheKey, tex);
  return tex;
}

function addSign(
  parent: THREE.Object3D,
  text: string,
  bg: string,
  fg: string,
  x: number,
  y: number,
  z: number,
  facing: number,
  width = 4.4
): void {
  const tex = makeSignTexture(text, bg, fg);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = facing;
  parent.add(mesh);
}

interface BuildingOptions {
  width: number;
  depth: number;
  height: number;
  color: number;
  trim: number;
  /** -1/1 = facade faces the boulevard; 0 = facade faces a cross street. */
  side: number;
  style?: number;
}

const WINDOW_LIGHT_COLORS = [
  0xffd28f, 0xffe2ac, 0xfff0cf, 0xf7c27a, 0xd6e6ff, 0xffe9c9
];

/**
 * Tall blocks get a grid of lit windows and, on the tallest, a red rooftop
 * beacon. They are only one instanced mesh, toggled with the night cycle.
 */
function addWindowLights(
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  side: number,
  rnd: () => number
): void {
  if (height < 12) return;
  const bands = Math.max(1, Math.min(5, Math.floor((height - 2.5) / 3.0)));
  const windowOn = (px: number, py: number, pz: number, ry: number): void => {
    if (rnd() > 0.66) return;
    const color = WINDOW_LIGHT_COLORS[Math.floor(rnd() * WINDOW_LIGHT_COLORS.length)];
    windowLightMatrices.push(transform(px, py, pz, 0.78, 1.08, 1, 0, ry, 0));
    windowLightColors.push(color);
  };

  if (side !== 0) {
    const columns = Math.max(1, Math.floor((depth - 1.4) / 1.8));
    const spacing = (depth - 1.4) / columns;
    for (const fx of [x - side * (width / 2 + 0.055), x + side * (width / 2 + 0.055)]) {
      for (let row = 0; row < bands; row += 1) {
        const y = 2.5 + row * 3.0;
        for (let col = 0; col < columns; col += 1) {
          windowOn(fx, y, z - depth / 2 + 0.7 + spacing * (col + 0.5), Math.PI / 2);
        }
      }
    }
    // Side elevations, so the blocks are not blank when seen from a cross street.
    const sideColumns = Math.max(1, Math.floor((width - 1.4) / 1.8));
    const sideSpacing = (width - 1.4) / sideColumns;
    for (const fz of [z - depth / 2 - 0.055, z + depth / 2 + 0.055]) {
      for (let row = 0; row < bands; row += 1) {
        const y = 2.5 + row * 3.0;
        for (let col = 0; col < sideColumns; col += 1) {
          windowOn(x - width / 2 + 0.7 + sideSpacing * (col + 0.5), y, fz, 0);
        }
      }
    }
  } else {
    const columns = Math.max(1, Math.floor((width - 1.4) / 1.8));
    const spacing = (width - 1.4) / columns;
    for (const fz of [z - depth / 2 - 0.055, z + depth / 2 + 0.055]) {
      for (let row = 0; row < bands; row += 1) {
        const y = 2.5 + row * 3.0;
        for (let col = 0; col < columns; col += 1) {
          windowOn(x - width / 2 + 0.7 + spacing * (col + 0.5), y, fz, 0);
        }
      }
    }
    const sideColumns = Math.max(1, Math.floor((depth - 1.4) / 1.8));
    const sideSpacing = (depth - 1.4) / sideColumns;
    for (const fx of [x - width / 2 - 0.055, x + width / 2 + 0.055]) {
      for (let row = 0; row < bands; row += 1) {
        const y = 2.5 + row * 3.0;
        for (let col = 0; col < sideColumns; col += 1) {
          windowOn(fx, y, z - depth / 2 + 0.7 + sideSpacing * (col + 0.5), Math.PI / 2);
        }
      }
    }
  }

  if (height >= 16) {
    beaconMatrices.push(transform(x, height + 0.9, z, 0.3, 0.3, 0.3, 0, 0, 0));
  }
}

function addBuilding(
  colliders: Collider[],
  buildings: Collider[],
  x: number,
  z: number,
  options: BuildingOptions,
  rnd: () => number
): void {
  const { width, depth, height, color, trim, side } = options;
  const style = options.style ?? Math.floor(rnd() * 6);

  const footprint: Collider = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2
  };
  colliders.push(footprint);
  buildings.push({ ...footprint });

  box(color, 0.95, width, height, depth, x, height / 2, z);
  box(0x8a8272, 0.95, width + 0.12, 0.55, depth + 0.12, x, 0.28, z);
  box(trim, 0.95, width + 0.2, 0.34, depth + 0.2, x, height + 0.2, z);
  contactShadow(width + 3.2, depth + 3.2, x, z, 0.02);

  // Facade direction: x-facing for rows, z-facing for cross-street blocks.
  let facadeX = 0;
  let facadeZ = 0;
  let along = depth;
  if (side !== 0) {
    facadeX = x - side * (width / 2 + 0.035);
    along = depth;
  } else {
    let nearest = CROSS_ZS[0];
    for (const cz of CROSS_ZS) {
      if (Math.abs(z - cz) < Math.abs(z - nearest)) nearest = cz;
    }
    const dir = z > nearest ? -1 : 1;
    facadeZ = z + dir * (depth / 2 + 0.035);
    along = width;
  }

  const addFacade = (offset: number, y: number, bandColor: number, thickness: number): void => {
    if (side !== 0) {
      box(bandColor, 0.6, thickness, 0.55, along * 0.7, facadeX - side * offset, y, z);
    } else {
      box(bandColor, 0.6, along * 0.7, 0.55, thickness, x, y, facadeZ + Math.sign(facadeZ - z) * offset);
    }
  };

  const bands = Math.max(1, Math.min(5, Math.floor((height - 2.5) / 3.2)));
  const windowColor = style === 1 ? 0x33495c : 0x5b6a74;
  for (let i = 0; i < bands; i += 1) {
    addFacade(0, 2.4 + i * 3.0, windowColor, 0.1);
    addFacade(0, 2.75 + i * 3.0, 0xd9d2be, 0.12);
  }

  if (style === 0) {
    // Apartment block: balconies and AC units.
    for (let i = 0; i < Math.min(3, bands); i += 1) {
      const by = 2.2 + i * 3.0;
      if (side !== 0) {
        box(trim, 0.9, 0.22, 0.9, Math.min(3.4, depth * 0.45), facadeX - side * 0.5, by, z);
        box(0x3b4146, 0.7, 0.5, 0.32, 0.4, facadeX - side * 0.62, by + 1.0, z + depth * 0.2);
      } else {
        box(trim, 0.9, Math.min(3.4, width * 0.45), 0.9, 0.22, x, by, facadeZ + Math.sign(facadeZ - z) * 0.5);
        box(0x3b4146, 0.7, 0.5, 0.32, 0.4, x + width * 0.2, by + 1.0, facadeZ + Math.sign(facadeZ - z) * 0.62);
      }
    }
  } else if (style === 1) {
    // Office tower: vertical glazing and a rooftop antenna.
    for (let i = 0; i < Math.min(4, Math.floor(width / 3)); i += 1) {
      const ox = -width / 2 + 1.5 + i * 3;
      if (side !== 0) {
        box(0x2a3b4a, 0.35, 0.1, height - 1.4, 1.1, facadeX - side * 0.06, height / 2, z + ox);
      } else {
        box(0x2a3b4a, 0.35, 1.1, height - 1.4, 0.1, x + ox, height / 2, facadeZ + Math.sign(facadeZ - z) * 0.06);
      }
    }
    cylinder('antenna', tankGeometry, 0x9aa0a6, 0.4, x, height + 2.2, z, { receive: false });
  } else if (style === 2) {
    // Shop row: bright awning and a painted sign band.
    const awning = [0xc94b33, 0x2f7f5b, 0x2d6fa8, 0xd4a12f, 0xa2557e][Math.floor(rnd() * 5)];
    if (side !== 0) {
      box(awning, 0.8, 0.8, 0.16, Math.min(4.6, depth * 0.6), facadeX - side * 0.42, 3.1, z);
      box(0xf0e6cf, 0.9, 0.1, 0.7, Math.min(3.8, depth * 0.5), facadeX - side * 0.05, 3.9, z);
    } else {
      box(awning, 0.8, Math.min(4.6, width * 0.6), 0.16, 0.8, x, 3.1, facadeZ + Math.sign(facadeZ - z) * 0.42);
      box(0xf0e6cf, 0.9, Math.min(3.8, width * 0.5), 0.7, 0.1, x, 3.9, facadeZ + Math.sign(facadeZ - z) * 0.05);
    }
  } else if (style === 3) {
    // Duplex with a pitched roof.
    const roof = trim;
    if (side !== 0) {
      box(roof, 0.9, width * 0.56, 0.24, depth + 0.5, x - width * 0.24, height + 0.9, z, { rz: 0.42 });
      box(roof, 0.9, width * 0.56, 0.24, depth + 0.5, x + width * 0.24, height + 0.9, z, { rz: -0.42 });
    } else {
      box(roof, 0.9, width + 0.5, 0.24, depth * 0.56, x, height + 0.9, z - depth * 0.24, { rx: -0.42 });
      box(roof, 0.9, width + 0.5, 0.24, depth * 0.56, x, height + 0.9, z + depth * 0.24, { rx: 0.42 });
    }
  } else if (style === 4) {
    // Warehouse: ribbed walls and a roller shutter.
    for (let i = 0; i < Math.min(6, Math.floor(along / 2)); i += 1) {
      const o = -along / 2 + 1.2 + i * 2;
      if (side !== 0) {
        box(0xb8b2a4, 0.9, 0.09, height * 0.8, 0.28, facadeX - side * 0.05, height * 0.45, z + o);
      } else {
        box(0xb8b2a4, 0.9, 0.28, height * 0.8, 0.09, x + o, height * 0.45, facadeZ + Math.sign(facadeZ - z) * 0.05);
      }
    }
    if (side !== 0) {
      box(0x6d7075, 0.7, 0.1, 3.2, 3.4, facadeX - side * 0.06, 1.6, z);
    } else {
      box(0x6d7075, 0.7, 3.4, 3.2, 0.1, x, 1.6, facadeZ + Math.sign(facadeZ - z) * 0.06);
    }
  } else {
    // Bungalow compound with a low fence and gate.
    if (side !== 0) {
      box(0x9c9486, 0.9, 0.25, 1.3, depth + 4, facadeX - side * 1.4, 0.65, z);
      box(0x9c9486, 0.9, 0.25, 1.3, 1.6, facadeX - side * 1.4, 0.65, z - depth / 2 - 2.2);
    } else {
      box(0x9c9486, 0.9, width + 4, 1.3, 0.25, x, 0.65, facadeZ + Math.sign(facadeZ - z) * 1.4);
    }
  }

  addWindowLights(x, z, width, depth, height, side, rnd);

  const tanks = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < tanks; i += 1) {
    cylinder(
      'tank',
      tankGeometry,
      0x3b4146,
      0.6,
      x + (rnd() - 0.5) * Math.max(1, width - 2.4),
      height + 0.95,
      z + (rnd() - 0.5) * Math.max(1, depth - 2.4),
      { receive: false }
    );
  }
  if (style !== 1) {
    box(0x5d6167, 0.7, 1.1, 0.9, 1.1, x + width * 0.25, height + 0.65, z - depth * 0.2);
  }
}

function addEnterableLandmark(
  parent: THREE.Object3D,
  colliders: Collider[],
  zone: LandmarkZone,
  opts: {
    wallColor: number;
    trimColor: number;
    signBg: string;
    signFg: string;
    signText: string;
    height: number;
    interiorColor: number;
    counterColor: number;
    lightColor: number;
  }
): void {
  const { side, z, width, depth } = zone;
  const x = side * (BUILD_LINE + width / 2);
  const h = opts.height;
  const doorW = 2.4;
  const doorH = 2.5;
  const wallT = 0.5;
  const frontX = x - side * (width / 2);
  const frontWallX = frontX + side * (wallT / 2);
  const backWallX = x + side * (width / 2 - wallT / 2);
  const sideSeg = Math.max(0.1, (depth - doorW) / 2);

  box(opts.wallColor, 0.95, width, h, wallT, x, h / 2, z - depth / 2 + wallT / 2);
  box(opts.wallColor, 0.95, width, h, wallT, x, h / 2, z + depth / 2 - wallT / 2);
  box(opts.wallColor, 0.95, wallT, h, depth, backWallX, h / 2, z);
  box(opts.wallColor, 0.95, wallT, h, sideSeg, frontWallX, h / 2, z - depth / 2 + sideSeg / 2);
  box(opts.wallColor, 0.95, wallT, h, sideSeg, frontWallX, h / 2, z + depth / 2 - sideSeg / 2);
  box(opts.wallColor, 0.95, wallT, h - doorH, doorW, frontWallX, doorH + (h - doorH) / 2, z);
  box(0x8a8272, 0.95, width + 0.14, 0.6, depth + 0.14, x, 0.3, z);
  box(opts.trimColor, 0.95, width + 0.24, 0.4, depth + 0.24, x, h + 0.22, z);
  contactShadow(width + 4, depth + 4, x, z, 0.02);

  box(opts.trimColor, 0.95, 0.08, 2.5, 0.12, frontX - side * 0.04, 1.43, z - doorW / 2 - 0.06);
  box(opts.trimColor, 0.95, 0.08, 2.5, 0.12, frontX - side * 0.04, 1.43, z + doorW / 2 + 0.06);
  box(opts.trimColor, 0.95, 0.08, 0.3, doorW + 0.24, frontX - side * 0.04, 2.78, z);

  if (zone.name === 'club') {
    // Neon tubes: a glowing fascia and two vertical strips frame the entrance.
    const neon = glowMat(opts.lightColor);
    const key = `neon:${opts.lightColor}`;
    const fx = frontX - side * 0.09;
    const neonX = frontX - side * 0.13;
    pushBatch(key, unitBox, neon, transform(fx, h - 0.42, z, 0.07, 0.1, depth - 0.9, 0, 0, 0), false, false);
    pushBatch(key, unitBox, neon, transform(fx, 2.98, z - depth / 2 + 0.7, 0.07, 0.07, 1.1, 0, 0, 0), false, false);
    pushBatch(key, unitBox, neon, transform(fx, 2.98, z + depth / 2 - 0.7, 0.07, 0.07, 1.1, 0, 0, 0), false, false);

    // Sign board: a dark backing panel with a lit edge keeps the lettering legible.
    const signWidth = Math.min(5.5, width * 0.7);
    const signBottom = h - 1.55 - signWidth / 8 - 0.16;
    const accent = parseInt(opts.signFg.replace('#', ''), 16);
    box(parseInt(opts.signBg.replace('#', ''), 16), 0.6, 0.1, signWidth / 4 + 0.5, signWidth + 0.5, frontX - side * 0.03, h - 1.55, z);
    pushBatch(key, unitBox, neon, transform(neonX, signBottom, z, 0.05, 0.06, signWidth, 0, 0, 0), false, false);

    // Vertical tubes run from the canopy to the sign, not across the lettering.
    const tubeBottom = 3.1;
    const tubeH = Math.max(0.2, signBottom - tubeBottom);
    pushBatch(key, unitBox, neon, transform(fx, tubeBottom + tubeH / 2, z - doorW / 2 - 0.22, 0.07, tubeH, 0.07, 0, 0, 0), false, false);
    pushBatch(key, unitBox, neon, transform(fx, tubeBottom + tubeH / 2, z + doorW / 2 + 0.22, 0.07, tubeH, 0.07, 0, 0, 0), false, false);

    // Marquee canopy over the pavement, lit from below.
    const canopyColor = new THREE.Color(opts.trimColor).multiplyScalar(0.55).getHex();
    box(canopyColor, 0.72, 1.7, 0.24, doorW + 1.3, frontX - side * 0.85, 3.72, z);
    pushBatch(key, unitBox, neon, transform(frontX - side * 1.68, 3.57, z, 0.09, 0.07, doorW + 1.1, 0, 0, 0), false, false);
    for (const dz of [-0.75, 0, 0.75]) {
      pushBatch(key, unitBox, neon, transform(frontX - side * 1.15, 3.56, z + dz, 0.16, 0.05, 0.16, 0, 0, 0), false, false);
    }

    // Ground-floor windows with glowing sills, flanking the entrance.
    const glass = new THREE.MeshStandardMaterial({
      color: 0x1c2431,
      roughness: 0.22,
      metalness: 0.15,
      emissive: opts.lightColor,
      emissiveIntensity: 0.16
    });
    const glassKey = `clubglass:${opts.lightColor}`;
    for (const wz of [-depth * 0.36, -depth * 0.21, depth * 0.21, depth * 0.36]) {
      box(opts.trimColor, 0.7, 0.05, 1.85, 1.32, frontX - side * 0.035, 2.85, z + wz);
      pushBatch(glassKey, unitBox, glass, transform(fx, 2.85, z + wz, 0.07, 1.5, 1.02, 0, 0, 0), false, false);
      box(opts.trimColor, 0.7, 0.045, 1.5, 0.05, fx, 2.85, z + wz);
      pushBatch(key, unitBox, neon, transform(neonX, 3.64, z + wz, 0.05, 0.06, 1.0, 0, 0, 0), false, false);
    }

    // Upper clerestory row so the tall frontage is not a flat slab.
    box(opts.trimColor, 0.8, 0.05, 0.14, depth - 0.8, frontX - side * 0.035, 4.32, z);
    for (const wz of [-depth * 0.3, 0, depth * 0.3]) {
      box(opts.trimColor, 0.7, 0.05, 1.15, 1.7, frontX - side * 0.035, 4.9, z + wz);
      pushBatch(glassKey, unitBox, glass, transform(fx, 4.9, z + wz, 0.07, 0.95, 1.5, 0, 0, 0), false, false);
      pushBatch(key, unitBox, neon, transform(neonX, 5.42, z + wz, 0.05, 0.06, 1.6, 0, 0, 0), false, false);
    }

    // Gig posters either side of the door.
    for (const pz of [-1.62, 1.62]) {
      box(0x0c0a10, 0.6, 0.06, 1.15, 0.62, frontX - side * 0.05, 1.75, z + pz);
      box(accent, 0.5, 0.04, 0.82, 0.4, frontX - side * 0.095, 1.75, z + pz);
    }
  }
  // Landmark shells get the same lit-window treatment as tall street blocks.
  let windowSeed = Math.abs(Math.floor(x * 31 + z * 17 + h * 7)) % 2147483647 || 1;
  addWindowLights(x, z, width, depth, h, side, () => {
    windowSeed = (windowSeed * 48271) % 2147483647;
    return windowSeed / 2147483647;
  });

  addSign(
    parent,
    opts.signText,
    opts.signBg,
    opts.signFg,
    frontX - side * 0.12,
    h - 1.55,
    z,
    -side * (Math.PI / 2),
    Math.min(5.5, width * 0.7)
  );

  const floorY = 0.06;
  box(opts.interiorColor, 0.95, width - 0.5, 0.1, depth - 0.5, x, floorY, z);
  box(opts.interiorColor, 0.95, 0.14, h - 0.4, depth - 0.5, x + side * (width / 2 - 0.32), (h - 0.4) / 2 + 0.1, z);
  box(opts.interiorColor, 0.95, width - 0.5, h - 0.4, 0.14, x, (h - 0.4) / 2 + 0.1, z + depth / 2 - 0.32);
  box(opts.interiorColor, 0.95, width - 0.5, h - 0.4, 0.14, x, (h - 0.4) / 2 + 0.1, z - depth / 2 + 0.32);

  box(opts.counterColor, 0.95, 2.8, 0.95, 0.7, x + side * (width / 4), 0.55, z);
  box(0xd9d2be, 0.95, 2.9, 0.08, 0.8, x + side * (width / 4), 1.06, z);

  box(opts.counterColor, 0.95, 0.3, 2.0, depth * 0.5, x + side * (width / 2 - 0.6), 1.1, z + depth * 0.18);

  const lampColor = opts.lightColor;
  for (const dz of [-depth * 0.25, depth * 0.25]) {
    pushBatch(
      `lamp:${lampColor}`,
      lampGeometry,
      glowMat(lampColor),
      transform(x, h - 0.7, z + dz, 1, 1, 1, 0, 0, 0),
      false,
      false
    );
    const light = new THREE.PointLight(lampColor, 6, 9, 1.8);
    light.position.set(x, h - 1.2, z + dz);
    if (!IS_ANDROID) parent.add(light);
  }

  colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z - depth / 2 + wallT });
  colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z + depth / 2 - wallT, maxZ: z + depth / 2 });
  colliders.push({ minX: backWallX - wallT / 2, maxX: backWallX + wallT / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
  colliders.push({
    minX: frontWallX - wallT / 2,
    maxX: frontWallX + wallT / 2,
    minZ: z - depth / 2,
    maxZ: z - depth / 2 + sideSeg
  });
  colliders.push({
    minX: frontWallX - wallT / 2,
    maxX: frontWallX + wallT / 2,
    minZ: z + depth / 2 - sideSeg,
    maxZ: z + depth / 2
  });
}

function addPalm(
  colliders: Collider[],
  x: number,
  z: number,
  rnd: () => number,
  baseY = SIDEWALK_TOP
): void {
  cylinder('palm-trunk', palmTrunkGeometry, 0x7a6039, 0.95, x, 2.2 + baseY, z, {
    rx: 0,
    ry: 0,
    rz: (rnd() - 0.5) * 0.12,
    receive: false
  });

  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 + rnd() * 0.4;
    box(
      0x3c7d3f,
      0.9,
      0.34,
      0.06,
      2.1,
      x + Math.cos(angle) * 0.8,
      4.35 + baseY,
      z + Math.sin(angle) * 0.8,
      {
        rx: 0.22,
        ry: -angle,
        rz: -0.35 + rnd() * 0.3,
        receive: false
      }
    );
  }

  contactShadow(4.2, 4.2, x, z, baseY + 0.005);
  colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35 });
}

function addStreetLight(colliders: Collider[], x: number, z: number, flip: boolean): void {
  const dir = flip ? 1 : -1;
  const y0 = SIDEWALK_TOP;
  cylinder('street-pole', poleGeometry, 0x3c4146, 0.7, x, 3.2 + y0, z, { receive: false });
  box(0x3c4146, 0.7, 1.6, 0.09, 0.09, x + dir * 0.8, 6.35 + y0, z, {
    cast: false,
    receive: false
  });
  box(0xe8e2cd, 0.4, 0.7, 0.14, 0.24, x + dir * 1.5, 6.28 + y0, z, { receive: false });
  colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
}

function addKiosk(
  colliders: Collider[],
  x: number,
  z: number,
  color: number,
  rnd: () => number
): void {
  const y0 = SIDEWALK_TOP;
  box(0xb59d7b, 0.95, 1.9, 1.0, 2.3, x, y0 + 0.5, z);
  box(0x8d7352, 0.95, 1.5, 0.55, 1.8, x, y0 + 1.25, z);
  for (const dx of [-0.82, 0.82]) {
    for (const dz of [-1.0, 1.0]) {
      box(0x6b6255, 0.95, 0.07, 2.15, 0.07, x + dx, y0 + 1.07, z + dz);
    }
  }
  box(color, 0.85, 2.35, 0.09, 2.7, x, y0 + 2.2, z);
  box(0xdcd6c4, 0.95, 2.15, 0.04, 0.5, x, y0 + 1.02, z + 1.25);
  box(0x3f6f4a, 0.95, 0.45, 0.3, 0.4, x + 0.55, y0 + 1.63, z + 0.5);
  box(0xc74c2e, 0.95, 0.35, 0.28, 0.35, x - 0.55, y0 + 1.62, z + 0.35);
  contactShadow(3.4, 3.8, x, z);
  colliders.push({ minX: x - 1.2, maxX: x + 1.2, minZ: z - 1.4, maxZ: z + 1.4 });
  if (rnd() > 0.5) {
    box(0x8b6b45, 0.95, 0.6, 0.5, 0.6, x - 1.0, y0 + 0.25, z + 1.6);
  }
}

function addBin(colliders: Collider[], x: number, z: number): void {
  const y0 = SIDEWALK_TOP;
  cylinder('bin', binGeometry, 0x2e6b44, 0.8, x, y0 + 0.4, z, { receive: true });
  contactShadow(1.1, 1.1, x, z);
  colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
}

interface BankSpec {
  id: string;
  label: string;
  side: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  wall: number;
  trim: number;
  signBg: string;
  signFg: string;
  amount: number;
}

const BANKS: BankSpec[] = [
  {
    id: 'gtbank',
    label: 'GTBank',
    side: 1,
    z: -300,
    width: 20,
    depth: 13,
    height: 11,
    wall: 0xdcd5c6,
    trim: 0xf36f21,
    signBg: '#101013',
    signFg: '#f36f21',
    amount: 500
  },
  {
    id: 'firstbank',
    label: 'First Bank',
    side: -1,
    z: 200,
    width: 19,
    depth: 13,
    height: 12,
    wall: 0xe2dbc9,
    trim: 0x0033a0,
    signBg: '#002a7a',
    signFg: '#f2c94c',
    amount: 500
  },
  {
    id: 'accessbank',
    label: 'Access Bank',
    side: 1,
    z: 330,
    width: 19,
    depth: 12,
    height: 10,
    wall: 0xe6dfd0,
    trim: 0xf36f21,
    signBg: '#0d1b2a',
    signFg: '#f36f21',
    amount: 500
  }
];

function buildAtmBooth(
  parent: THREE.Group,
  colliders: Collider[],
  x: number,
  z: number,
  side: number,
  bank: string
): void {
  const y0 = SIDEWALK_TOP;
  const depth = 1.5; // across the sidewalk, towards the road
  const width = 2.9; // along the road
  box(0xe8e2d2, 0.9, depth, 2.7, width, x, y0 + 1.35, z);
  box(0x2f3944, 0.85, depth + 0.35, 0.18, width + 0.35, x, y0 + 2.8, z);
  box(0x1a222b, 0.4, 0.08, 1.05, 1.15, x - side * (depth / 2 + 0.04), y0 + 1.72, z);
  box(0x39c97a, 0.35, 0.03, 0.78, 0.88, x - side * (depth / 2 + 0.09), y0 + 1.68, z);
  box(0x262d34, 0.5, 0.22, 0.32, 0.52, x - side * (depth / 2 + 0.12), y0 + 1.13, z);
  box(0xd7d0bf, 0.85, 0.9, 0.1, width + 0.2, x - side * 0.3, y0 + 2.62, z);
  addSign(parent, `ATM · ${bank}`, '#10202c', '#7ef0b0', x - side * (depth / 2 + 0.16), y0 + 3.45, z, -side * (Math.PI / 2), 2.6);
  contactShadow(width + 1.2, depth + 1.4, x, z);
  colliders.push({
    minX: Math.min(x - depth / 2, x + depth / 2),
    maxX: Math.max(x - depth / 2, x + depth / 2),
    minZ: z - width / 2,
    maxZ: z + width / 2
  });
}

function addBank(
  parent: THREE.Group,
  colliders: Collider[],
  buildings: Collider[],
  spec: BankSpec,
  atms: ServiceSpot[]
): void {
  const x = spec.side * (BUILD_LINE + spec.width / 2);
  const z = spec.z;
  const frontX = x - spec.side * (spec.width / 2);
  addBuilding(
    colliders,
    buildings,
    x,
    z,
    {
      width: spec.width,
      depth: spec.depth,
      height: spec.height,
      color: spec.wall,
      trim: spec.trim,
      side: spec.side,
      style: 1
    },
    () => 0.5
  );

  addSign(
    parent,
    spec.label,
    spec.signBg,
    spec.signFg,
    frontX - spec.side * 0.5,
    spec.height - 1.6,
    z,
    -spec.side * (Math.PI / 2),
    Math.min(9.2, spec.width * 0.62)
  );

  // Entrance canopy, columns and glass doors.
  box(spec.trim, 0.8, 1.25, 0.24, 5.4, frontX - spec.side * 1.0, 3.3, z);
  for (const dz of [-2.3, 2.3]) {
    box(0xd0c8b6, 0.85, 0.16, 3.1, 0.16, frontX - spec.side * 1.55, 1.55, z + dz);
  }
  box(0x2b3d4a, 0.35, 0.1, 2.4, 2.8, frontX - spec.side * 0.07, 1.2, z);
  box(0xd9d2be, 0.7, 0.06, 0.1, 0.1, frontX - spec.side * 0.15, 1.25, z);
  box(0xf0ead8, 0.9, 0.12, 0.22, spec.width * 0.72, frontX - spec.side * 0.05, 0.55, z);

  // ATM booth at the kerb, beside the entrance.
  const boothZ = z + spec.depth / 2 - 1.6;
  buildAtmBooth(parent, colliders, spec.side * (ROAD_HALF + 3.1), boothZ, spec.side, spec.label);
  atms.push({
    id: `atm-${spec.id}`,
    kind: 'atm',
    label: `${spec.label.toUpperCase()} ATM`,
    x: spec.side * (ROAD_HALF + 1.75),
    z: boothZ,
    facing: -spec.side * (Math.PI / 2),
    withdrawalAmount: spec.amount
  });
}

const POS_ACCENTS = [0xc94b33, 0x2f7f5b, 0x2f6fa8, 0xd4a12f, 0x8f2f5c];

function addPosStand(
  parent: THREE.Group,
  colliders: Collider[],
  side: number,
  z: number,
  accent: number
): ServiceSpot {
  const y0 = SIDEWALK_TOP;
  const x = side * (ROAD_HALF + 3.05);
  // Table.
  box(0x8a6b45, 0.95, 1.95, 0.76, 0.98, x, y0 + 0.38, z);
  box(0xb08a5a, 0.9, 2.05, 0.08, 1.08, x, y0 + 0.8, z);
  // POS terminal, cash box and a phone.
  box(0x22262b, 0.5, 0.3, 0.17, 0.44, x, y0 + 0.93, z);
  box(0x39c97a, 0.35, 0.03, 0.1, 0.31, x - side * 0.06, y0 + 0.92, z);
  box(0x2f6b4a, 0.8, 0.52, 0.3, 0.4, x + 0.62, y0 + 0.95, z);
  box(0xe8e2d2, 0.6, 0.16, 0.02, 0.34, x - 0.58, y0 + 0.85, z + 0.12);
  // Umbrella.
  box(0x8a8f96, 0.7, 0.08, 2.5, 0.08, x - side * 0.5, y0 + 1.25, z);
  for (let i = 0; i < 4; i += 1) {
    box(i % 2 === 0 ? 0xf0ece0 : accent, 0.9, 2.7, 0.09, 0.68, x - side * 0.5, y0 + 2.46, z - 1.02 + i * 0.68);
  }
  // Painted board so the stand reads from the road.
  addSign(parent, 'POS · TRANSFER', '#0b1c2c', '#ffd23f', x - side * 1.12, y0 + 1.55, z, -side * (Math.PI / 2), 2.1);
  contactShadow(2.8, 2.0, x, z);
  colliders.push({
    minX: Math.min(x - 1.05, x + 1.05),
    maxX: Math.max(x - 1.05, x + 1.05),
    minZ: z - 0.65,
    maxZ: z + 0.65
  });
  return {
    id: `pos-${side}-${z}`,
    kind: 'pos',
    label: 'POS AGENT',
    x: side * (ROAD_HALF + 1.8),
    z,
    facing: -side * (Math.PI / 2),
    withdrawalAmount: 250
  };
}

function inLandmarkZone(z: number, side: number, zones: LandmarkZone[], margin = 4): boolean {
  return zones.some(
    (lz) => lz.side === side && z > lz.z - lz.depth / 2 - margin && z < lz.z + lz.depth / 2 + margin
  );
}

function nearCross(z: number, margin: number): boolean {
  return CROSS_ZS.some((cz) => Math.abs(z - cz) < CROSS_HALF + margin);
}

/** Split a range into the stretches between cross streets. */
function buildSegments(from: number, to: number): Array<[number, number]> {
  const segments: Array<[number, number]> = [];
  let start = from;
  for (const cz of CROSS_ZS) {
    if (cz + CROSS_HALF + 1.5 <= start) continue;
    if (cz - CROSS_HALF - 1.5 >= to) break;
    const end = Math.max(start, cz - CROSS_HALF - 1.5);
    if (end - start > 1) segments.push([start, end]);
    start = Math.max(start, cz + CROSS_HALF + 1.5);
  }
  if (to - start > 1) segments.push([start, to]);
  return segments;
}

function isDesertRoadAt(x: number, z: number): boolean {
  if (
    x >= DESERT_HIGHWAY_START_X &&
    x <= DESERT_HIGHWAY_END_X &&
    Math.abs(z - DESERT_HIGHWAY_Z) <= DESERT_HIGHWAY_HALF_WIDTH
  ) return true;
  if (
    x >= DESERT_FRONTAGE_START_X &&
    x <= DESERT_FRONTAGE_END_X &&
    Math.abs(z - DESERT_FRONTAGE_Z) <= DESERT_FRONTAGE_HALF_WIDTH
  ) return true;
  for (const connectorX of DESERT_CONNECTOR_XS) {
    if (
      Math.abs(x - connectorX) <= DESERT_CONNECTOR_HALF_WIDTH &&
      z >= DESERT_FRONTAGE_Z - DESERT_FRONTAGE_HALF_WIDTH &&
      z <= DESERT_HIGHWAY_Z + DESERT_HIGHWAY_HALF_WIDTH
    ) return true;
  }
  return false;
}

function isRoadAt(x: number, z: number, includeCauseway = true): boolean {
  if (isDesertRoadAt(x, z)) return true;
  if (Math.abs(x) <= ROAD_HALF) return true;
  for (const sx of SIDE_ROADS) {
    if (Math.abs(x - sx) <= roadHalfFor(sx)) return true;
  }
  if (
    x >= WEST_DISTRICT_MIN_X &&
    Math.abs(x) <= WORLD_HALF_X &&
    CROSS_ZS.some((cz) => Math.abs(z - cz) <= CROSS_HALF)
  ) {
    return true;
  }
  return includeCauseway && onCauseway(x, z);
}

/** True inside the airport perimeter, where no city blocks may be generated. */
function inAirportGrounds(x: number, z: number): boolean {
  const dx = x - AIRPORT_X;
  const dz = z - AIRPORT_Z;
  return dx * dx + dz * dz <= AIRPORT_R * AIRPORT_R;
}

/**
 * East end of a cross street. Cross streets run to the world edge, except the
 * one the airport was built across: that arm stops at the perimeter fence so
 * no tarmac, paint or traffic ever reaches the apron.
 */
function crossStreetEndX(cz: number): number {
  const corridor = Math.abs(cz - AIRPORT_Z);
  // The road band must actually reach into the airport circle.
  if (corridor >= AIRPORT_R) return WORLD_HALF_X;
  const reach = Math.sqrt(AIRPORT_R * AIRPORT_R - corridor * corridor);
  return Math.min(WORLD_HALF_X, AIRPORT_X - reach);
}

function onCrossBayBridge(x: number, z: number): boolean {
  if (x < WEST_DISTRICT_MAX_X || x > WEST_SHORE_X) return false;
  return CROSS_ZS.some((cz) => Math.abs(z - cz) <= CROSS_HALF + 4.5);
}

function onRiverBridgeDeck(x: number, z: number): boolean {
  return (
    x > RIVER_MIN_X &&
    x < RIVER_MAX_X &&
    CROSS_ZS.some((cz) => Math.abs(z - cz) <= CROSS_HALF + 2.1)
  );
}

export function createCity(): City {
  batches.clear();
  windowLightMatrices.length = 0;
  windowLightColors.length = 0;
  beaconMatrices.length = 0;
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const buildings: Collider[] = [];
  const rnd = seededRandom(20261022);
  const half = ROAD_LENGTH / 2;

  const landmarks: LandmarkZone[] = [
    { name: 'hotel', side: -1, z: 42, width: 15, depth: 13 },
    { name: 'club', side: 1, z: -28, width: 13, depth: 11 },
    { name: 'police', side: 1, z: 86, width: 12, depth: 10 },
    { name: 'market', side: -1, z: -58, width: 15, depth: 12 },
    { name: 'school', side: 1, z: -112, width: 14, depth: 12 },
    { name: 'hospital', side: 1, z: 20, width: 13, depth: 11 },
    // Kept clear of the cross street at z=-12 so the lobby never sits on the road.
    { name: 'shop', id: 'garage-lobby', label: 'GARAGE LOBBY', side: -1, z: 31, width: 12, depth: 7 },
    { name: 'garage', side: -1, z: 6, width: 12, depth: 10 },
    { name: 'restaurant', side: -1, z: 76, width: 11, depth: 9 },
    { name: 'shop', side: 1, z: 148, width: 10, depth: 9 },
    { name: 'house', label: "HAUWA'S HOME", side: -1, z: 150, width: 11, depth: 9 },
    { name: 'fuel', side: 1, z: -148, width: 10, depth: 8 },
    { name: 'club', id: 'club-onyx', label: 'CLUB ONYX', side: 1, z: -215, width: 14, depth: 11 },
    { name: 'shop', id: 'lapo-office', label: 'LAPO MICROFINANCE', side: -1, z: -365, width: 11, depth: 9 },
    { name: 'club', id: 'club-shrine', label: 'THE SHRINE', side: -1, z: 230, width: 13, depth: 11 },
    { name: 'club', id: 'club-velvet', label: 'VELVET ROOM', side: 1, z: 374, width: 14, depth: 11 }
  ];

  // Bank branches occupy real blocks, so keep the procedural rows clear of them.
  const bankZones: LandmarkZone[] = BANKS.map((bank) => ({
    name: 'shop',
    side: bank.side,
    z: bank.z,
    width: bank.width,
    depth: bank.depth
  }));
  const occupancyZones = [...landmarks, ...bankZones];

  const siteMeta: Record<SiteKind, { label: string; buildShell: boolean }> = {
    hotel: { label: 'HOTEL KANO', buildShell: false },
    club: { label: 'CLUB AYO', buildShell: false },
    police: { label: 'POLICE STATION', buildShell: false },
    market: { label: 'KURMI MARKET', buildShell: true },
    school: { label: 'COMMUNITY SCHOOL', buildShell: true },
    hospital: { label: 'GENERAL HOSPITAL', buildShell: true },
    garage: { label: 'OKADA GARAGE', buildShell: true },
    restaurant: { label: 'MAMA PUT', buildShell: true },
    shop: { label: 'CORNER SHOP', buildShell: true },
    house: { label: 'RESIDENCE', buildShell: true },
    fuel: { label: 'NNPC FILLING STATION', buildShell: true }
  };

  const sites: CitySite[] = landmarks.map((zone) => {
    const x = zone.side * (BUILD_LINE + zone.width / 2);
    const frontX = x - zone.side * (zone.width / 2);
    const meta = siteMeta[zone.name];
    return {
      id: zone.id ?? zone.name,
      kind: zone.name,
      label: zone.label ?? meta.label,
      x,
      z: zone.z,
      side: zone.side,
      width: zone.width,
      depth: zone.depth,
      entranceX: frontX - zone.side * 1.9,
      entranceZ: zone.z,
      facing: zone.side * (Math.PI / 2),
      buildShell: meta.buildShell
    };
  });
  const garageSite = sites.find((site) => site.kind === 'garage');
  if (!garageSite) throw new Error('Garage site is required to build its forecourt');
  const garageFrontX = garageSite.entranceX + garageSite.side * 1.9;
  const garageSidewalkWidth = 2.1;
  const garageForecourtRoadEdgeX = garageSite.side * (
    ROAD_HALF + 0.3 + garageSidewalkWidth
  );
  const forecourtWidth = Math.abs(garageFrontX - garageForecourtRoadEdgeX);
  const forecourtX = (garageFrontX + garageForecourtRoadEdgeX) / 2;
  // Keep the forecourt inside its own block: it used to run south across the
  // cross street at z=-12, putting the lot (and its parked cars) on the road.
  const parkingStartZ = garageSite.z - 6;
  const parkingEndZ = garageSite.z + 48;
  const drivewayStartZ = garageSite.z - 3.1;
  const drivewayEndZ = garageSite.z + 3.1;
  const forecourtCenterY = 0.22;
  const forecourtHeight = 0.12;
  const forecourtSurfaceY = forecourtCenterY + forecourtHeight / 2;

  // Ground is split at the river so the water is not hidden under a plane, and
  // it stops at the west shoreline so the open ocean is left uncovered.
  const GROUND_EXTRA = 140;
  const westGroundWidth = RIVER_MIN_X - WEST_SHORE_X;
  const westGround = new THREE.Mesh(
    new THREE.PlaneGeometry(westGroundWidth, ROAD_LENGTH + GROUND_EXTRA * 2),
    mat(0x8b806a, 1)
  );
  westGround.rotation.x = -Math.PI / 2;
  westGround.position.set((RIVER_MIN_X + WEST_SHORE_X) / 2, -0.04, 0);
  westGround.receiveShadow = true;
  group.add(westGround);
  const westDistrictWidth = WEST_DISTRICT_MAX_X - WEST_DISTRICT_MIN_X;
  const westDistrictGround = new THREE.Mesh(
    new THREE.PlaneGeometry(westDistrictWidth, ROAD_LENGTH + GROUND_EXTRA * 2),
    mat(0x8b806a, 1)
  );
  westDistrictGround.rotation.x = -Math.PI / 2;
  westDistrictGround.position.set(
    (WEST_DISTRICT_MIN_X + WEST_DISTRICT_MAX_X) / 2,
    -0.04,
    0
  );
  westDistrictGround.receiveShadow = true;
  group.add(westDistrictGround);
  const eastGroundMinX = RIVER_MAX_X;
  // Past the nominal world edge so the airport apron (out to x=660) still
  // stands on solid ground instead of thin air over the ocean.
  const eastGroundMaxX = Math.max(WORLD_HALF_X + GROUND_EXTRA, AIRPORT_X + AIRPORT_R + 6);
  const eastGroundMinZ = -half - GROUND_EXTRA;
  const eastGroundMaxZ = half + GROUND_EXTRA;
  const subwayOpenings = RAIL_STATIONS.map((station) => ({
    minX: station.accessX - SUBWAY_ENTRANCE_HALF_WIDTH,
    maxX: station.accessX + SUBWAY_ENTRANCE_HALF_WIDTH,
    minZ: station.z + SUBWAY_STAIR_BOTTOM_Z_OFFSET,
    maxZ: station.accessZ
  }));
  const groundCutsX = [
    eastGroundMinX,
    eastGroundMaxX,
    ...subwayOpenings.flatMap((opening) => [opening.minX, opening.maxX])
  ].sort((a, b) => a - b);
  const groundCutsZ = [
    eastGroundMinZ,
    eastGroundMaxZ,
    ...subwayOpenings.flatMap((opening) => [opening.minZ, opening.maxZ])
  ].sort((a, b) => a - b);
  const eastGroundMaterial = mat(0x8b806a, 1);
  for (let xIndex = 0; xIndex < groundCutsX.length - 1; xIndex += 1) {
    const minX = groundCutsX[xIndex];
    const maxX = groundCutsX[xIndex + 1];
    if (maxX <= eastGroundMinX || minX >= eastGroundMaxX || maxX - minX < 0.01) continue;
    for (let zIndex = 0; zIndex < groundCutsZ.length - 1; zIndex += 1) {
      const minZ = groundCutsZ[zIndex];
      const maxZ = groundCutsZ[zIndex + 1];
      if (maxZ <= eastGroundMinZ || minZ >= eastGroundMaxZ || maxZ - minZ < 0.01) continue;
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;
      if (subwayOpenings.some((opening) =>
        centerX > opening.minX && centerX < opening.maxX &&
        centerZ > opening.minZ && centerZ < opening.maxZ
      )) continue;
      const groundTile = new THREE.Mesh(
        new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
        eastGroundMaterial
      );
      groundTile.rotation.x = -Math.PI / 2;
      groundTile.position.set(centerX, -0.04, centerZ);
      groundTile.receiveShadow = true;
      group.add(groundTile);
    }
  }

  // ------------------------------------------------------------------ ocean
  // Deep ocean beyond the city edges and across the whole western strip. The
  // city ground plane stops at WEST_SHORE_X; the sea fills everything beyond it.
  const oceanSize = OCEAN_EDGE * 2;

  // Hand-painted swell so the sea reads as open water instead of flat paint.
  // Uses Math.random, not the seeded city RNG, so the layout is unchanged.
  const oceanCanvas = document.createElement('canvas');
  oceanCanvas.width = 256;
  oceanCanvas.height = 256;
  const octx = oceanCanvas.getContext('2d') as CanvasRenderingContext2D;
  const oceanGrad = octx.createLinearGradient(0, 0, 0, 256);
  oceanGrad.addColorStop(0, '#0a2f49');
  oceanGrad.addColorStop(0.5, '#0f4762');
  oceanGrad.addColorStop(1, '#0a2f49');
  octx.fillStyle = oceanGrad;
  octx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 110; i += 1) {
    const y = Math.random() * 256;
    const w = 14 + Math.random() * 52;
    const x = Math.random() * 256;
    octx.strokeStyle = `rgba(150, 220, 238, ${(0.03 + Math.random() * 0.10).toFixed(3)})`;
    octx.lineWidth = 0.6 + Math.random() * 1.7;
    octx.beginPath();
    octx.moveTo(x, y);
    octx.quadraticCurveTo(x + w * 0.5, y - 3.2, x + w, y);
    octx.stroke();
  }
  for (let i = 0; i < 300; i += 1) {
    octx.fillStyle = `rgba(214, 246, 255, ${(0.03 + Math.random() * 0.10).toFixed(3)})`;
    octx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 0.8);
  }
  const oceanTexture = new THREE.CanvasTexture(oceanCanvas);
  oceanTexture.wrapS = THREE.RepeatWrapping;
  oceanTexture.wrapT = THREE.RepeatWrapping;
  oceanTexture.repeat.set(30, 30);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(oceanSize, oceanSize),
    new THREE.MeshStandardMaterial({
      map: oceanTexture,
      color: 0xc9e8f2,
      roughness: 0.38,
      metalness: 0.18
    })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, OCEAN_SURFACE_Y, 0);
  ocean.receiveShadow = true;
  group.add(ocean);

  // Foam where the bank meets the open sea, so the ground edge is not a hard
  // cut floating above the water.
  const shoreFoam = new THREE.Mesh(
    new THREE.PlaneGeometry(9, ROAD_LENGTH + GROUND_EXTRA * 2),
    new THREE.MeshBasicMaterial({
      color: 0xd6f2f0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    })
  );
  shoreFoam.rotation.x = -Math.PI / 2;
  shoreFoam.position.set(WEST_SHORE_X + 2.4, OCEAN_SURFACE_Y + 0.02, 0);
  group.add(shoreFoam);

  // Shoreline foam ring where the city ground meets the deep water.
  const shoreRing = new THREE.Mesh(
    new THREE.RingGeometry(OCEAN_EDGE - SHORE_BLEND, OCEAN_EDGE, 64),
    new THREE.MeshBasicMaterial({
      color: 0x7fcfc8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    })
  );
  shoreRing.rotation.x = -Math.PI / 2;
  shoreRing.position.set(0, OCEAN_SURFACE_Y + 0.01, 0);
  shoreRing.receiveShadow = true;
  group.add(shoreRing);

  const desertLandStartX = WORLD_HALF_X + GROUND_EXTRA;
  const desertLandEndX = DESERT_HIGHWAY_END_X + 60;
  const desertMaterial = new THREE.MeshStandardMaterial({ color: 0xb18a54, roughness: 1 });
  const desertGround = new THREE.Mesh(
    new THREE.PlaneGeometry(
      desertLandEndX - desertLandStartX,
      ROAD_LENGTH + GROUND_EXTRA * 2
    ),
    desertMaterial
  );
  desertGround.rotation.x = -Math.PI / 2;
  desertGround.position.set(
    (desertLandStartX + desertLandEndX) / 2,
    -0.04,
    0
  );
  desertGround.receiveShadow = true;
  group.add(desertGround);

  const desertShoulderMaterial = new THREE.MeshStandardMaterial({ color: 0x72604a, roughness: 1 });
  const desertRoadMaterial = new THREE.MeshStandardMaterial({ color: 0x34383b, roughness: 0.96 });
  const desertRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(DESERT_HIGHWAY_END_X - DESERT_HIGHWAY_START_X, CROSS_HALF * 2),
    desertRoadMaterial
  );
  desertRoad.rotation.x = -Math.PI / 2;
  desertRoad.position.set(
    (DESERT_HIGHWAY_START_X + DESERT_HIGHWAY_END_X) / 2,
    0,
    DESERT_HIGHWAY_Z
  );
  desertRoad.receiveShadow = true;
  group.add(desertRoad);

  // Frontage road running below the highway, plus two connectors tying it back
  // into the main route.
  const frontageRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(
      DESERT_FRONTAGE_END_X - DESERT_FRONTAGE_START_X,
      DESERT_FRONTAGE_HALF_WIDTH * 2
    ),
    desertRoadMaterial
  );
  frontageRoad.rotation.x = -Math.PI / 2;
  frontageRoad.position.set(
    (DESERT_FRONTAGE_START_X + DESERT_FRONTAGE_END_X) / 2,
    0,
    DESERT_FRONTAGE_Z
  );
  frontageRoad.receiveShadow = true;
  group.add(frontageRoad);

  const connectorMinZ = DESERT_FRONTAGE_Z - DESERT_FRONTAGE_HALF_WIDTH;
  const connectorMaxZ = DESERT_HIGHWAY_Z + DESERT_HIGHWAY_HALF_WIDTH;
  for (const connectorX of DESERT_CONNECTOR_XS) {
    const connector = new THREE.Mesh(
      new THREE.PlaneGeometry(
        DESERT_CONNECTOR_HALF_WIDTH * 2,
        connectorMaxZ - connectorMinZ
      ),
      desertRoadMaterial
    );
    connector.rotation.x = -Math.PI / 2;
    connector.position.set(
      connectorX,
      0.002,
      (connectorMinZ + connectorMaxZ) / 2
    );
    connector.receiveShadow = true;
    group.add(connector);

    const connectorShoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, connectorMaxZ - connectorMinZ),
      desertShoulderMaterial
    );
    connectorShoulder.rotation.x = -Math.PI / 2;
    connectorShoulder.position.set(
      connectorX + DESERT_CONNECTOR_HALF_WIDTH + 0.8,
      0.001,
      (connectorMinZ + connectorMaxZ) / 2
    );
    connectorShoulder.receiveShadow = true;
    group.add(connectorShoulder);
  }

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(DESERT_HIGHWAY_END_X - DESERT_HIGHWAY_START_X, 3.2),
      desertShoulderMaterial
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(
      (DESERT_HIGHWAY_START_X + DESERT_HIGHWAY_END_X) / 2,
      0.001,
      DESERT_HIGHWAY_Z + side * (CROSS_HALF + 1.5)
    );
    shoulder.receiveShadow = true;
    group.add(shoulder);
  }

  const desertMarkingMaterial = new THREE.MeshBasicMaterial({
    color: 0xe7d59b,
    toneMapped: false
  });
  const addDesertMarking = (x: number, z: number, length: number, width: number): void => {
    const marking = new THREE.Mesh(new THREE.PlaneGeometry(length, width), desertMarkingMaterial);
    marking.rotation.x = -Math.PI / 2;
    marking.position.set(x, 0.006, z);
    group.add(marking);
  };
  for (const side of [-1, 1]) {
    addDesertMarking(
      (DESERT_HIGHWAY_START_X + DESERT_HIGHWAY_END_X) / 2,
      DESERT_HIGHWAY_Z + side * (DESERT_HIGHWAY_HALF_WIDTH - 0.7),
      DESERT_HIGHWAY_END_X - DESERT_HIGHWAY_START_X,
      0.16
    );
    for (let x = DESERT_HIGHWAY_START_X + 18; x < DESERT_HIGHWAY_END_X - 4; x += 30) {
      addDesertMarking(x, DESERT_HIGHWAY_Z + side * 4.5, 14, 0.11);
    }
  }
  for (const offset of [-0.24, 0.24]) {
    addDesertMarking(
      (DESERT_HIGHWAY_START_X + DESERT_HIGHWAY_END_X) / 2,
      DESERT_HIGHWAY_Z + offset,
      DESERT_HIGHWAY_END_X - DESERT_HIGHWAY_START_X,
      0.12
    );
  }
  for (let x = DESERT_FRONTAGE_START_X + 16; x < DESERT_FRONTAGE_END_X - 8; x += 22) {
    addDesertMarking(x, DESERT_FRONTAGE_Z, 11, 0.1);
  }
  for (const connectorX of DESERT_CONNECTOR_XS) {
    for (let z = connectorMinZ + 8; z < connectorMaxZ - 6; z += 16) {
      addDesertMarking(connectorX, z, 0.1, 9);
    }
  }

  const mountainColors = [0x776044, 0x806848, 0x8c704a, 0x6e5a43];
  const mountainSites: Array<{ x: number; z: number; radius: number; height: number }> = [
    { x: 700, z: -360, radius: 48, height: 45 },
    { x: 720, z: -170, radius: 66, height: 61 },
    { x: 850, z: -410, radius: 74, height: 72 },
    { x: 955, z: -220, radius: 43, height: 40 },
    { x: 1110, z: -405, radius: 82, height: 78 },
    { x: 1200, z: -180, radius: 58, height: 53 },
    { x: 710, z: 35, radius: 55, height: 47 },
    { x: 795, z: 180, radius: 77, height: 70 },
    { x: 935, z: 75, radius: 60, height: 56 },
    { x: 1080, z: 210, radius: 88, height: 84 },
    { x: 1200, z: 35, radius: 65, height: 60 },
    { x: 730, z: 510, radius: 52, height: 43 },
    { x: 855, z: 505, radius: 78, height: 72 },
    { x: 1035, z: 510, radius: 60, height: 58 },
    { x: 1190, z: 545, radius: 82, height: 79 }
  ];
  for (const [index, site] of mountainSites.entries()) {
    const geometry = new THREE.ConeGeometry(1, 1, 7, 2);
    const vertices = geometry.getAttribute('position');
    for (let vertex = 0; vertex < vertices.count; vertex += 1) {
      const y = vertices.getY(vertex);
      if (y < 0.49) {
        const variation = 0.82 + rnd() * 0.36;
        vertices.setX(vertex, vertices.getX(vertex) * variation);
        vertices.setZ(vertex, vertices.getZ(vertex) * (0.82 + rnd() * 0.36));
        vertices.setY(vertex, y * (0.9 + rnd() * 0.2));
      }
    }
    vertices.needsUpdate = true;
    geometry.computeVertexNormals();
    const mountain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: mountainColors[index % mountainColors.length],
        roughness: 1,
        flatShading: true
      })
    );
    mountain.position.set(site.x, site.height / 2 - 0.04, site.z);
    mountain.scale.set(site.radius, site.height, site.radius * (0.82 + rnd() * 0.3));
    mountain.receiveShadow = true;
    group.add(mountain);
    colliders.push({
      minX: site.x - site.radius * 0.72,
      maxX: site.x + site.radius * 0.72,
      minZ: site.z - site.radius * 0.72,
      maxZ: site.z + site.radius * 0.72
    });
  }

  const duneColors = [0xc1a06b, 0xa98754, 0x97764d];
  for (let i = 0; i < 18; i += 1) {
    const x = WORLD_HALF_X + GROUND_EXTRA + 35 + rnd() *
      (DESERT_HIGHWAY_END_X - WORLD_HALF_X - GROUND_EXTRA - 70);
    const z = -half - GROUND_EXTRA + 40 + rnd() * (DESERT_HIGHWAY_Z + half + GROUND_EXTRA - 110);
    const dune = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 5),
      new THREE.MeshStandardMaterial({
        color: duneColors[i % duneColors.length],
        roughness: 1,
        flatShading: true
      })
    );
    dune.position.set(x, 0.35, z);
    dune.scale.set(30 + rnd() * 55, 1.1 + rnd() * 1.8, 14 + rnd() * 24);
    dune.receiveShadow = true;
    group.add(dune);
  }

  // Solid edge lines break at every junction so paint never runs through the
  // crossing, the way real kerb lines stop at a corner.
  const edgeZSegments: Array<[number, number]> = [];
  {
    let start = -half;
    for (const cz of CROSS_ZS) {
      const end = Math.max(start, cz - CROSS_HALF - 6.5);
      if (end - start > 1) edgeZSegments.push([start, end]);
      start = Math.max(start, cz + CROSS_HALF + 6.5);
    }
    if (half - start > 1) edgeZSegments.push([start, half]);
  }
  const edgeXSegments: Array<[number, number]> = [];
  {
    let start = WEST_SHORE_X;
    const cuts = [
      { at: 0, half: ROAD_HALF },
      ...SIDE_ROADS.map((sx) => ({ at: sx, half: roadHalfFor(sx) }))
    ].sort((a, b) => a.at - b.at);
    for (const cut of cuts) {
      const end = Math.max(start, cut.at - cut.half - 7);
      if (end - start > 1) edgeXSegments.push([start, end]);
      start = Math.max(start, cut.at + cut.half + 7);
    }
    if (WORLD_HALF_X - start > 1) edgeXSegments.push([start, WORLD_HALF_X]);
  }

  // --- Road markings. Nigerian arterial roads: solid white edge lines, long
  // dashed lane dividers, double-yellow centre lines, zebra crossings and
  // yellow box junctions at the busy boulevard crossings.
  box(0x3f4246, 1, ROAD_HALF * 2, 0.2, ROAD_LENGTH, 0, -0.1, 0);
  for (const edgeX of [-(ROAD_HALF - 0.5), ROAD_HALF - 0.5]) {
    for (const [z0, z1] of edgeZSegments) {
      box(0xe8e2cf, 0.95, 0.16, 0.012, z1 - z0, edgeX, 0.013, (z0 + z1) / 2);
    }
  }
  for (const cx of [-0.22, 0.22]) {
    box(0xe6c445, 0.95, 0.12, 0.012, ROAD_LENGTH, cx, 0.013, 0);
  }
  for (const laneX of [-7.33, -3.67, 3.67, 7.33]) {
    for (let z = -half + 3; z < half - 8; z += 12) {
      if (nearCross(z + 2, 9)) continue;
      box(0xe8e2cf, 0.95, 0.14, 0.012, 4.0, laneX, 0.013, z + 2);
    }
  }

  // --- Parallel avenues.
  for (const sx of SIDE_ROADS) {
    const halfWidth = roadHalfFor(sx);
    box(0x3f4246, 1, halfWidth * 2, 0.2, ROAD_LENGTH, sx, -0.1, 0);
    for (const cx of [sx - 0.22, sx + 0.22]) {
      box(0xe6c445, 0.95, 0.12, 0.012, ROAD_LENGTH, cx, 0.013, 0);
    }
    for (const laneOffset of [-halfWidth * 0.52, halfWidth * 0.52]) {
      for (let z = -half + 3; z < half - 8; z += 12) {
        if (nearCross(z + 2, 9)) continue;
        box(0xe8e2cf, 0.95, 0.14, 0.012, 4.0, sx + laneOffset, 0.013, z + 2);
      }
    }
    for (const edgeX of [sx - halfWidth + 0.5, sx + halfWidth - 0.5]) {
      for (const [z0, z1] of edgeZSegments) {
        box(0xe8e2cf, 0.95, 0.16, 0.012, z1 - z0, edgeX, 0.013, (z0 + z1) / 2);
      }
    }
  }

  // --- Cross streets. They stop at the west shoreline; the causeway takes over
  // the crossing from there. The arm the airport sits across stops at the
  // perimeter fence instead of running out over the apron.
  const westCrossSpanX = WEST_DISTRICT_MAX_X - WEST_DISTRICT_MIN_X;
  const westCrossMidX = (WEST_DISTRICT_MIN_X + WEST_DISTRICT_MAX_X) / 2;
  const westSidewalkSegments: Array<[number, number]> = [];
  {
    let start = WEST_DISTRICT_MIN_X;
    for (const sx of SIDE_ROADS) {
      if (sx <= WEST_DISTRICT_MIN_X || sx >= WEST_DISTRICT_MAX_X) continue;
      const halfWidth = roadHalfFor(sx);
      const end = sx - halfWidth - 1.5;
      if (end - start > 1) westSidewalkSegments.push([start, end]);
      start = sx + halfWidth + 1.5;
    }
    if (WEST_DISTRICT_MAX_X - start > 1) westSidewalkSegments.push([start, WEST_DISTRICT_MAX_X]);
  }
  for (const cz of CROSS_ZS) {
    const roadEndX = crossStreetEndX(cz);
    const armSpanX = roadEndX - WEST_SHORE_X;
    const armMidX = (WEST_SHORE_X + roadEndX) / 2;
    box(0x3f4246, 1, armSpanX, 0.2, CROSS_HALF * 2, armMidX, -0.1, cz);
    for (const dz of [-0.22, 0.22]) {
      box(0xe6c445, 0.95, armSpanX, 0.012, 0.12, armMidX, 0.013, cz + dz);
    }
    for (const laneOffset of [-CROSS_HALF * 0.52, CROSS_HALF * 0.52]) {
      for (let x = WEST_SHORE_X + 4; x < WORLD_HALF_X - 8; x += 12) {
        if (x + 6 > roadEndX) continue;
        if (Math.abs(x + 2) < ROAD_HALF + 10) continue;
        if (SIDE_ROADS.some((sx) => Math.abs(x + 2 - sx) < roadHalfFor(sx) + 10)) continue;
        box(0xe8e2cf, 0.95, 4.0, 0.012, 0.14, x + 2, 0.013, cz + laneOffset);
      }
    }
    for (const edgeZ of [cz - CROSS_HALF + 0.5, cz + CROSS_HALF - 0.5]) {
      for (const [rawStart, rawEnd] of edgeXSegments) {
        const x0 = rawStart;
        const x1 = Math.min(rawEnd, roadEndX);
        if (x1 - x0 <= 1) continue;
        box(0xe8e2cf, 0.95, x1 - x0, 0.012, 0.16, (x0 + x1) / 2, 0.013, edgeZ);
      }
    }

    box(0x3f4246, 1, westCrossSpanX, 0.2, CROSS_HALF * 2, westCrossMidX, -0.1, cz);
    for (const dz of [-0.22, 0.22]) {
      box(0xe6c445, 0.95, westCrossSpanX, 0.012, 0.12, westCrossMidX, 0.013, cz + dz);
    }
    for (const dz of [-(CROSS_HALF + 1.5), CROSS_HALF + 1.5]) {
      for (const [x0, x1] of westSidewalkSegments) {
        const segmentLength = x1 - x0;
        if (segmentLength <= 1) continue;
        box(0xaba494, 0.95, segmentLength, 0.18, 2.8, (x0 + x1) / 2, 0.09, cz + dz);
      }
    }
    for (let x = WEST_DISTRICT_MIN_X + 10; x < WEST_DISTRICT_MAX_X - 8; x += 12) {
      if (SIDE_ROADS.some((sx) => Math.abs(x + 2 - sx) < roadHalfFor(sx) + 10)) continue;
      box(0xe8e2cf, 0.95, 4, 0.012, 0.14, x + 2, 0.013, cz + CROSS_HALF * 0.5);
      box(0xe8e2cf, 0.95, 4, 0.012, 0.14, x + 2, 0.013, cz - CROSS_HALF * 0.5);
    }

    if (!HIGH_BRIDGE_CROSSINGS.includes(cz)) {
      const bayBridgeLength = WEST_SHORE_X - WEST_DISTRICT_MAX_X;
      const bayBridgeCenter = (WEST_SHORE_X + WEST_DISTRICT_MAX_X) / 2;
      box(0x4f5a66, 0.92, bayBridgeLength, 0.5, CROSS_HALF * 2, bayBridgeCenter, -0.25, cz);
      box(0x3f4246, 1, bayBridgeLength, 0.08, CROSS_HALF * 2 - 1.4, bayBridgeCenter, 0.04, cz);
      for (const dz of [-0.22, 0.22]) {
        box(0xe6c445, 0.95, bayBridgeLength - 4, 0.012, 0.12, bayBridgeCenter, 0.09, cz + dz);
      }
      for (const dz of [-(CROSS_HALF + 1.5), CROSS_HALF + 1.5]) {
        box(0xaba494, 0.95, bayBridgeLength, 0.18, 2.8, bayBridgeCenter, 0.09, cz + dz);
      }
      for (const dz of [-(CROSS_HALF + 3.1), CROSS_HALF + 3.1]) {
        box(0x5f6a70, 0.7, bayBridgeLength, 0.12, 0.12, bayBridgeCenter, 0.8, cz + dz);
        for (let x = WEST_DISTRICT_MAX_X + 2; x < WEST_SHORE_X; x += 3.2) {
          box(0x5f6a70, 0.7, 0.1, 0.8, 0.1, x, 0.4, cz + dz, { cast: false });
        }
      }
      for (let x = WEST_DISTRICT_MAX_X + 14; x < WEST_SHORE_X - 8; x += 22) {
        box(0x8f8879, 0.9, 1.5, 1.3, 1.5, x, -1.05, cz, { cast: false });
      }
    }
  }

  const addHighBridgeRoad = (
    startX: number,
    endX: number,
    startY: number,
    endY: number,
    cz: number
  ): void => {
    const length = endX - startX;
    const centerX = (startX + endX) / 2;
    const centerY = (startY + endY) / 2;
    const angle = Math.atan2(endY - startY, length);
    box(0x3f4246, 1, length + 0.8, 0.42, 18, centerX, centerY - 0.21, cz, { rz: angle });
    for (const side of [-1, 1]) {
      box(0xaba494, 0.95, length + 0.8, 0.2, 2.4, centerX, centerY - 0.1, cz + side * 10.2, {
        rz: angle
      });
      box(0x5f6a70, 0.7, length + 0.8, 0.95, 0.14, centerX, centerY + 0.45, cz + side * 12, {
        rz: angle
      });
      for (let x = startX + 2; x < endX; x += 3.5) {
        const progress = (x - startX) / length;
        const y = startY + (endY - startY) * progress;
        box(0x5f6a70, 0.7, 0.1, 0.8, 0.1, x, y + 0.4, cz + side * 12, {
          cast: false
        });
      }
    }
    for (const offset of [-0.22, 0.22]) {
      box(0xe6c445, 0.95, length - 2, 0.025, 0.12, centerX, centerY + 0.02, cz + offset, {
        rz: angle
      });
    }
  };

  // The high routes now span the western bay, with long approaches that meet
  // the existing streets on both banks instead of ending above the city grid.
  for (const cz of HIGH_BRIDGE_CROSSINGS) {
    addHighBridgeRoad(HIGH_BRIDGE_WEST_END_X, WEST_DISTRICT_MAX_X, 0, HIGH_BRIDGE_DECK_Y, cz);
    addHighBridgeRoad(WEST_DISTRICT_MAX_X, WEST_SHORE_X, HIGH_BRIDGE_DECK_Y, HIGH_BRIDGE_DECK_Y, cz);
    addHighBridgeRoad(WEST_SHORE_X, HIGH_BRIDGE_EAST_END_X, HIGH_BRIDGE_DECK_Y, 0, cz);

    for (const x of [WEST_DISTRICT_MAX_X + 34, WEST_DISTRICT_MAX_X + 76]) {
      const pierHeight = HIGH_BRIDGE_DECK_Y - 0.42 + 1.6;
      box(0x8f8879, 0.9, 1.8, pierHeight, 1.8, x, (HIGH_BRIDGE_DECK_Y - 0.42 - 1.6) / 2, cz, {
        cast: false
      });
    }
  }

  // --- Junction furniture: stop lines, zebra crossings on all four arms and
  // a yellow box junction at every boulevard crossing.
  const junctionGeometry = new THREE.PlaneGeometry(ROAD_HALF * 2 - 0.6, CROSS_HALF * 2 - 0.6);
  for (const cz of CROSS_ZS) {
    for (const dir of [-1, 1]) {
      // Boulevard stop line, on the approaching half of the carriageway.
      box(
        0xe8e2cf,
        0.95,
        ROAD_HALF - 1.4,
        0.014,
        0.34,
        dir * (ROAD_HALF / 2 + 0.35),
        0.014,
        cz + dir * (CROSS_HALF + 5.6)
      );
      // Zebra: bars run with the traffic, repeated across the road.
      for (let i = 0; i < 18; i += 1) {
        box(
          0xece7d8,
          0.95,
          0.56,
          0.015,
          3.8,
          -9.8 + i * 1.12,
          0.015,
          cz + dir * (CROSS_HALF - 1.8)
        );
      }
      // Cross-street stop line and zebra on the arm beside the boulevard.
      box(
        0xe8e2cf,
        0.95,
        0.34,
        0.014,
        CROSS_HALF - 1.4,
        dir * (ROAD_HALF + 5.6),
        0.014,
        cz - dir * (CROSS_HALF / 2 + 0.3)
      );
    }

    const boxMesh = new THREE.Mesh(junctionGeometry, getJunctionMaterial());
    boxMesh.rotation.x = -Math.PI / 2;
    boxMesh.position.set(0, 0.017, cz);
    boxMesh.renderOrder = 1;
    group.add(boxMesh);
  }

  // --- Curbs and sidewalks.
  for (const side of [-1, 1]) {
    const curbX = side * (ROAD_HALF + 0.17);
    if (side !== garageSite.side) {
      box(0x928b7c, 0.95, 0.34, 0.18, ROAD_LENGTH, curbX, 0.09, 0);
      continue;
    }
    for (const [start, end] of [
      [-half, drivewayStartZ],
      [drivewayEndZ, half]
    ]) {
      if (end <= start) continue;
      box(0x928b7c, 0.95, 0.34, 0.18, end - start, curbX, 0.09, (start + end) / 2);
    }
  }

  for (let z = -half; z < half; z += 12) {
    const slabZ = z + 6;
    const slabEnd = z + 12;
    const shade = Math.abs(z / 12) % 2 === 0 ? 0xaba494 : 0xb2ab9b;
    if (!nearCross(slabZ, 5)) {
      for (const side of [-1, 1]) {
        const fullWidth = 6.0;
        const fullCenterX = side * (ROAD_HALF + 3.3);
        const sections = side === garageSite.side
          ? [
              { start: z, end: Math.min(slabEnd, parkingStartZ), width: fullWidth, centerX: fullCenterX },
              {
                start: Math.max(z, parkingStartZ),
                end: Math.min(slabEnd, drivewayStartZ),
                width: garageSidewalkWidth,
                centerX: side * (ROAD_HALF + 0.3 + garageSidewalkWidth / 2)
              },
              {
                start: Math.max(z, drivewayEndZ),
                end: Math.min(slabEnd, parkingEndZ),
                width: garageSidewalkWidth,
                centerX: side * (ROAD_HALF + 0.3 + garageSidewalkWidth / 2)
              },
              { start: Math.max(z, parkingEndZ), end: slabEnd, width: fullWidth, centerX: fullCenterX }
            ]
          : [{ start: z, end: slabEnd, width: fullWidth, centerX: fullCenterX }];
        for (const section of sections) {
          if (section.end - section.start <= 0.01) continue;
          box(
            shade,
            0.95,
            section.width,
            0.18,
            section.end - section.start,
            section.centerX,
            0.09,
            (section.start + section.end) / 2
          );
        }
      }
      box(0x8f8879, 0.95, 0.4, 0.02, 12, -ROAD_HALF - 0.6, 0.185, slabZ);
      box(0x8f8879, 0.95, 0.4, 0.02, 12, ROAD_HALF + 0.6, 0.185, slabZ);
    }
  }

  const zSegments = buildSegments(-half, half);
  for (const sx of SIDE_ROADS) {
    const halfWidth = roadHalfFor(sx);
    for (const [z0, z1] of zSegments) {
      const len = z1 - z0;
      if (len <= 1) continue;
      const cz = (z0 + z1) / 2;
      for (const dx of [-(halfWidth + 1.5), halfWidth + 1.5]) {
        const shade = Math.abs(Math.round(cz / 12)) % 2 === 0 ? 0xaba494 : 0xb2ab9b;
        const centreX = sx + dx;
        if (sx === EAST_ROAD_X && dx > 0) {
          const minX = centreX - 1.5;
          const maxX = centreX + 1.5;
          const cutsX = [
            minX,
            maxX,
            ...subwayOpenings.flatMap((opening) =>
              [opening.minX, opening.maxX].filter((edge) => edge > minX && edge < maxX)
            )
          ].sort((a, b) => a - b);
          const cutsZ = [
            z0,
            z1,
            ...subwayOpenings.flatMap((opening) =>
              [opening.minZ, opening.maxZ].filter((edge) => edge > z0 && edge < z1)
            )
          ].sort((a, b) => a - b);
          for (let xIndex = 0; xIndex < cutsX.length - 1; xIndex += 1) {
            for (let zIndex = 0; zIndex < cutsZ.length - 1; zIndex += 1) {
              const tileX = (cutsX[xIndex] + cutsX[xIndex + 1]) / 2;
              const tileZ = (cutsZ[zIndex] + cutsZ[zIndex + 1]) / 2;
              if (subwayOpenings.some((opening) =>
                tileX > opening.minX && tileX < opening.maxX &&
                tileZ > opening.minZ && tileZ < opening.maxZ
              )) continue;
              box(
                shade,
                0.95,
                cutsX[xIndex + 1] - cutsX[xIndex],
                0.18,
                cutsZ[zIndex + 1] - cutsZ[zIndex],
                tileX,
                0.09,
                tileZ
              );
            }
          }
        } else {
          box(shade, 0.95, 3.0, 0.18, len, centreX, 0.09, cz);
        }
      }
      box(0x8f8879, 0.95, 0.4, 0.02, len, sx - halfWidth - 0.55, 0.185, cz);
      box(0x8f8879, 0.95, 0.4, 0.02, len, sx + halfWidth + 0.55, 0.185, cz);
    }
  }

  // Split the cross-street sidewalks at the boulevard, avenues and ring roads,
  // not at the cross streets themselves. Without the boulevard cut, every cross
  // street laid a raised sidewalk band straight across the main carriageway.
  const crossSidewalkCuts = [
    { at: 0, half: ROAD_HALF + 0.34 },
    ...SIDE_ROADS.map((sx) => ({ at: sx, half: roadHalfFor(sx) + 1.5 }))
  ].sort((a, b) => a.at - b.at);
  const xSegments: Array<[number, number]> = [];
  {
    let start = WEST_SHORE_X;
    for (const cut of crossSidewalkCuts) {
      const end = Math.max(start, cut.at - cut.half);
      if (end - start > 1) xSegments.push([start, end]);
      start = Math.max(start, cut.at + cut.half);
    }
    if (WORLD_HALF_X - start > 1) xSegments.push([start, WORLD_HALF_X]);
  }
  for (const cz of CROSS_ZS) {
    const roadEndX = crossStreetEndX(cz);
    for (const [segStart, segEnd] of xSegments) {
      const x0 = segStart;
      const x1 = Math.min(segEnd, roadEndX);
      const len = x1 - x0;
      if (len <= 1) continue;
      const cx = (x0 + x1) / 2;
      const bridgeStart = RIVER_MIN_X - 5;
      const bridgeEnd = RIVER_MAX_X + 5;
      const sidewalkSegments: Array<[number, number]> = [];
      if (x0 < bridgeStart) sidewalkSegments.push([x0, Math.min(x1, bridgeStart)]);
      if (x1 > bridgeEnd) sidewalkSegments.push([Math.max(x0, bridgeEnd), x1]);
      for (const [sidewalkStart, rawSidewalkEnd] of sidewalkSegments) {
        const sidewalkEnd = Math.min(rawSidewalkEnd, roadEndX);
        const sidewalkLen = sidewalkEnd - sidewalkStart;
        if (sidewalkLen <= 1) continue;
        const sidewalkCx = (sidewalkStart + sidewalkEnd) / 2;
        for (const dz of [-(CROSS_HALF + 1.5), CROSS_HALF + 1.5]) {
          box(0xaba494, 0.95, sidewalkLen, 0.18, 3.0, sidewalkCx, 0.09, cz + dz);
        }
      }
      box(0x8f8879, 0.95, len, 0.02, 0.4, cx, 0.185, cz - CROSS_HALF - 0.55);
      box(0x8f8879, 0.95, len, 0.02, 0.4, cx, 0.185, cz + CROSS_HALF + 0.55);
    }
    for (const side of [-1, 1]) {
      box(
        0xaba494,
        0.95,
        RIVER_MAX_X - RIVER_MIN_X + 10,
        0.18,
        2.1,
        (RIVER_MIN_X + RIVER_MAX_X) / 2,
        0.09,
        cz + side * (CROSS_HALF + 1.05)
      );
    }
  }

  // ------------------------------------------------------------------ river
  // A broad river splits the old city from the new east-bank district. Quay
  // walls drop ~1.3 m to the water, every cross street becomes a bridge, and
  // two of those bridges get signature towers.
  const riverWidth = RIVER_MAX_X - RIVER_MIN_X;
  const riverCx = (RIVER_MIN_X + RIVER_MAX_X) / 2;

  // Riverbed (keeps the light ground plane from showing through the water).
  box(0x203432, 1, riverWidth + 6, 0.25, ROAD_LENGTH, riverCx, -3.5, 0, { cast: false });
  // Muddy shallows either side.
  box(0x4a4a33, 1, 5, 0.2, ROAD_LENGTH, RIVER_MIN_X + 3, -1.7, 0, { cast: false });
  box(0x4a4a33, 1, 5, 0.2, ROAD_LENGTH, RIVER_MAX_X - 3, -1.7, 0, { cast: false });

  // Quay walls on both banks.
  for (const [x, dir] of [[RIVER_MIN_X - 0.55, -1], [RIVER_MAX_X + 0.55, 1]] as Array<[number, number]>) {
    box(0x9a917f, 0.95, 1.1, 1.75, ROAD_LENGTH, x, -0.72, 0);
    box(0x7f7767, 0.95, 0.25, 0.22, ROAD_LENGTH, x + dir * 0.62, 0.18, 0);
    box(0x6d6557, 0.95, 1.3, 0.14, ROAD_LENGTH, x, -1.55, 0, { cast: false });
  }

  // Water surface with a hand-painted ripple texture that slowly drifts.
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = 128;
  waterCanvas.height = 128;
  const wctx = waterCanvas.getContext('2d') as CanvasRenderingContext2D;
  wctx.fillStyle = '#2d666f';
  wctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 34; i += 1) {
    const wy = rnd() * 128;
    const amp = 1 + rnd() * 2.4;
    wctx.strokeStyle = `rgba(196, 232, 232, ${0.05 + rnd() * 0.1})`;
    wctx.lineWidth = 0.8 + rnd() * 1.8;
    wctx.beginPath();
    for (let x = 0; x <= 128; x += 8) {
      const yy = wy + Math.sin(x * 0.13 + i) * amp;
      if (x === 0) wctx.moveTo(x, yy);
      else wctx.lineTo(x, yy);
    }
    wctx.stroke();
  }
  const waterTexture = new THREE.CanvasTexture(waterCanvas);
  waterTexture.wrapS = THREE.RepeatWrapping;
  waterTexture.wrapT = THREE.RepeatWrapping;
  waterTexture.repeat.set(4, 26);
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x4c8b92,
    map: waterTexture,
    roughness: 0.22,
    metalness: 0.28,
    transparent: true,
    opacity: 0.9
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(riverWidth, ROAD_LENGTH), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(riverCx, RIVER_SURFACE_Y, 0);
  water.receiveShadow = true;
  group.add(water);

  // Foam lines hugging each quay.
  for (const fx of [RIVER_MIN_X + 0.9, RIVER_MAX_X - 0.9]) {
    box(0xb7cfcb, 0.8, 0.9, 0.03, ROAD_LENGTH, fx, RIVER_SURFACE_Y + 0.02, 0, {
      cast: false,
      receive: false
    });
  }

  // Promenade paving and railings along both banks, broken at the bridges,
  // the jetties and the market steps.
  const jettyZs = JETTY_ZS;
  const promenadeSegments: Array<[number, number]> = [];
  {
    let start = -half;
    for (const cz of CROSS_ZS) {
      const end = Math.max(start, cz - CROSS_HALF - 2.2);
      if (end - start > 1) promenadeSegments.push([start, end]);
      start = Math.max(start, cz + CROSS_HALF + 2.2);
    }
    if (half - start > 1) promenadeSegments.push([start, half]);
  }
  const nearJetty = (z: number): boolean => jettyZs.some((jz) => Math.abs(z - jz) < 6.5);
  const railRanges = (z0: number, z1: number): Array<[number, number]> => {
    const ranges: Array<[number, number]> = [];
    let start = z0;
    for (const jz of jettyZs) {
      const g0 = jz - 5.5;
      const g1 = jz + 5.5;
      if (g1 <= start || g0 >= z1) continue;
      if (g0 > start) ranges.push([start, Math.min(g0, z1)]);
      start = Math.max(start, g1);
    }
    if (start < z1) ranges.push([start, z1]);
    return ranges;
  };

  for (const [x, dir] of [[RIVER_MIN_X - 3.2, 1], [RIVER_MAX_X + 3.2, -1]] as Array<[number, number]>) {
    for (const [z0, z1] of promenadeSegments) {
      const len = z1 - z0;
      if (len <= 1) continue;
      const cz = (z0 + z1) / 2;
      // Paved promenade.
      box(0xbab2a0, 0.95, 5.6, 0.18, len, x, 0.09, cz);
      box(0x8f8879, 0.95, 0.4, 0.02, len, x - dir * 2.6, 0.185, cz, { cast: false });
      // Railing rides the water edge, with a gap at each jetty.
      const segs = railRanges(z0, z1);
      for (const [a, b] of segs) {
        const l = b - a;
        if (l < 0.5) continue;
        box(0x3d444a, 0.7, 0.07, 0.07, l, x + dir * 1.9, 0.55, (a + b) / 2, { cast: false });
        box(0x3d444a, 0.7, 0.09, 0.09, l, x + dir * 1.9, 1.02, (a + b) / 2, { cast: false });
        colliders.push({
          minX: x + dir * 1.9 - 0.2,
          maxX: x + dir * 1.9 + 0.2,
          minZ: a,
          maxZ: b
        });
      }
      for (let z = z0 + 1.2; z < z1 - 0.7; z += 2.4) {
        if (!segs.some(([a, b]) => z > a && z < b)) continue;
        box(0x3d444a, 0.7, 0.09, 1.02, 0.09, x + dir * 1.9, 0.62, z, { cast: false });
      }
    }
    // Promenade palms every so often.
    for (let z = -half + 18; z < half - 18; z += 52) {
      if (nearCross(z, 12) || nearJetty(z)) continue;
      addPalm(colliders, x - dir * 1.4, z, rnd);
    }
  }

  // Jetties: timber piers reaching over the water on both banks, with an open
  // end so the player can jump in and swim.
  for (const jz of jettyZs) {
    for (const [edgeX, dir] of [[RIVER_MIN_X, 1], [RIVER_MAX_X, -1]] as Array<[number, number]>) {
      const deckCx = edgeX + dir * ((JETTY_DECK_OUT - JETTY_DECK_IN) / 2);
      const deckW = JETTY_DECK_IN + JETTY_DECK_OUT;
      // Deck planking, flush with the promenade.
      box(0x8a6b45, 0.95, deckW, 0.22, 6.2, deckCx, 0.05, jz);
      for (let i = 0; i < 7; i += 1) {
        box(0x7a5c3a, 0.95, 0.2, 0.25, 6.2, edgeX + dir * (-JETTY_DECK_IN + 0.5 + i * 1.15), 0.16, jz, {
          cast: false
        });
      }
      // Piles holding the pier above the water.
      for (const dx of [-2.6, 0.6, 3.8]) {
        for (const dz of [-2.6, 2.6]) {
          box(0x5a4a34, 0.9, 0.22, 2.2, 0.22, edgeX + dir * dx, -1.05, jz + dz);
        }
      }
      // Kerb rail down both sides, left open at the pier head.
      for (const dz of [-3.05, 3.05]) {
        box(0x3d444a, 0.7, 6.6, 0.06, 0.06, edgeX + dir * 1.6, 0.55, jz + dz, { cast: false });
        box(0x3d444a, 0.7, 6.8, 0.08, 0.08, edgeX + dir * 1.6, 1.0, jz + dz, { cast: false });
        for (let i = 0; i < 4; i += 1) {
          box(0x3d444a, 0.7, 0.08, 1.0, 0.08, edgeX + dir * (-2.6 + i * 1.75), 0.6, jz + dz, {
            cast: false
          });
        }
      }
      // Bollards for the boatmen.
      for (const dz of [-2.2, 2.2]) {
        cylinder('bin', binGeometry, 0x2b2d30, 0.85, edgeX + dir * 4.9, 0.35, jz + dz);
      }
      // Tyre fenders on the quay face.
      for (const dz of [-2.4, 0, 2.4]) {
        cylinder('bin', binGeometry, 0x1c1e20, 0.95, edgeX + dir * 0.1, -0.55, jz + dz, {
          rx: Math.PI / 2,
          rz: Math.PI / 2
        });
      }
    }
  }

  // Every cross street gets a bridge deck, piers and guard rails.
  for (const cz of CROSS_ZS) {
    const deckDepth = CROSS_HALF * 2 + 4.4;
    box(0x8f8879, 0.95, riverWidth + 10, 0.55, deckDepth, riverCx, -0.32, cz);
    for (const dz of [-(CROSS_HALF + 2.1), CROSS_HALF + 2.1]) {
      box(0x7d7668, 0.95, riverWidth + 10, 0.85, 0.55, riverCx, -0.3, cz + dz);
      // Handrail and posts.
      box(0x5f6a70, 0.7, riverWidth + 8, 0.09, 0.09, riverCx, 1.05, cz + dz, { cast: false });
      for (let x = RIVER_MIN_X - 2; x <= RIVER_MAX_X + 2; x += 3.2) {
        box(0x5f6a70, 0.7, 0.09, 1.0, 0.09, x, 0.58, cz + dz, { cast: false });
      }
    }
    // Piers in the water.
    for (const px of [RIVER_MIN_X + 9, riverCx, RIVER_MAX_X - 9]) {
      box(0x8f8879, 0.95, 2.2, 3.2, 2.6, px, -1.85, cz);
      box(0x6d6557, 0.95, 2.8, 0.25, 3.2, px, -0.1, cz, { cast: false });
    }
    // Bridge lamps at both landfalls.
    for (const lx of [RIVER_MIN_X - 5, RIVER_MAX_X + 5]) {
      for (const dz of [-(CROSS_HALF + 2.1), CROSS_HALF + 2.1]) {
        box(0x3c4146, 0.7, 0.14, 4.2, 0.14, lx, 2.1, cz + dz);
        box(0xfff1c4, 0.4, 0.55, 0.16, 0.55, lx, 4.2, cz + dz, { cast: false });
      }
    }
  }

  // Signature crossing 1: cable-stayed pylons on the Dala bridge.
  for (const px of [RIVER_MIN_X + 7, RIVER_MAX_X - 7]) {
    for (const dz of [-(CROSS_HALF + 2.1), CROSS_HALF + 2.1]) {
      box(0xd8d2c0, 0.75, 1.0, 16, 1.0, px, 7.4, -180 + dz);
    }
    box(0xd8d2c0, 0.75, 1.0, 0.9, CROSS_HALF * 2 + 5.2, px, 15.2, -180);
    // Stay cables fanning along x, in the plane of each bridge edge.
    for (const dz of [-(CROSS_HALF + 2.1), CROSS_HALF + 2.1]) {
      for (let i = 1; i <= 5; i += 1) {
        const targetX = RIVER_MIN_X + 7 + (i - 1) * 7.5;
        if (targetX > RIVER_MAX_X - 7) break;
        for (const side of [-1, 1]) {
          const x1 = px + side * 0.6;
          const x2 = targetX;
          const dx = x2 - x1;
          const dy = 0.55 - 15.0;
          const len = Math.hypot(dx, dy);
          box(0xe7e3d5, 0.5, len, 0.07, 0.07, (x1 + x2) / 2, 7.6, -180 + dz, {
            rz: Math.atan2(dy, dx),
            cast: false
          });
        }
      }
    }
  }

  // Signature crossing 2: a shallow concrete arch on the Sabon Gari bridge.
  for (const dz of [-(CROSS_HALF + 2.4), CROSS_HALF + 2.4]) {
    const steps = 12;
    for (let i = 0; i < steps; i += 1) {
      const x0 = RIVER_MIN_X - 4 + (riverWidth + 8) * (i / steps);
      const x1 = RIVER_MIN_X - 4 + (riverWidth + 8) * ((i + 1) / steps);
      const arch = (t: number): number => Math.sin(Math.PI * t) * 7.2;
      const y0 = arch(i / steps);
      const y1 = arch((i + 1) / steps);
      const dx = x1 - x0;
      const dy = y1 - y0;
      box(0xcfc8b6, 0.85, Math.hypot(dx, dy) + 0.2, 0.6, 0.8, (x0 + x1) / 2, 0.9 + (y0 + y1) / 2, 128 + dz);
    }
    for (const px of [RIVER_MIN_X + 4, RIVER_MAX_X - 4]) {
      box(0xcfc8b6, 0.9, 1.4, 6.4, 1.2, px, 3.0, 128 + dz);
    }
  }

  // A footbridge over the boulevard so pedestrians cross without dodging
  // danfos. The deck is carried on kerbside columns and each end has a real
  // flight of stairs on both sides, built up from the pavement as solid blocks
  // so every step is supported rather than hanging in mid air.
  {
    const fz = FOOTBRIDGE_Z;
    const deckTop = FOOTBRIDGE_DECK_Y;
    const deckHalfX = FOOTBRIDGE_DECK_HALF_X;
    const deckHalfZ = FOOTBRIDGE_DECK_HALF_Z;
    const deckThick = 0.4;
    const deckMidY = deckTop - deckThick / 2;
    const stairX = FOOTBRIDGE_STAIR_X;
    const stairW = FOOTBRIDGE_STAIR_HALF_W * 2;
    const stepRise = FOOTBRIDGE_STEP_RISE;
    const stepRun = FOOTBRIDGE_STEP_RUN;
    const stepCount = FOOTBRIDGE_STEP_COUNT;
    const stairRun = FOOTBRIDGE_STAIR_RUN;

    // Main deck slab plus the soffit beam that makes it read as structure.
    box(0x8a94a0, 0.8, deckHalfX * 2, deckThick, deckHalfZ * 2, 0, deckMidY, fz);
    box(0x6f7883, 0.85, deckHalfX * 2 - 1.6, 0.45, deckHalfZ * 2 - 0.9, 0, deckMidY - 0.4, fz, {
      cast: false
    });
    // Paved walking surface with a painted centre stripe.
    box(0xb3ac9c, 0.95, deckHalfX * 2 - 0.5, 0.06, deckHalfZ * 2 - 0.5, 0, deckTop + 0.03, fz);
    box(0xe8e2cf, 0.95, deckHalfX * 2 - 2, 0.02, 0.16, 0, deckTop + 0.07, fz, { cast: false });

    // Kerbside columns, clear of the carriageway, holding the deck up.
    for (const dx of [-12.8, 12.8]) {
      box(0x6f7883, 0.85, 1.3, deckTop - deckThick, 1.5, dx, (deckTop - deckThick) / 2, fz);
      box(0x5f6a70, 0.85, 1.9, 0.35, 2.1, dx, 0.18, fz);
      // Cross head under the deck.
      box(0x7c8590, 0.85, 2.2, 0.4, deckHalfZ * 2 + 0.4, dx, deckTop - deckThick - 0.2, fz, {
        cast: false
      });
    }

    // Handrails along the deck.
    for (const dz of [-deckHalfZ + 0.12, deckHalfZ - 0.12]) {
      box(0x5f6a70, 0.7, deckHalfX * 2 - 0.6, 0.1, 0.1, 0, deckTop + 1.05, fz + dz, { cast: false });
      for (let x = -deckHalfX + 0.8; x <= deckHalfX - 0.8; x += 1.5) {
        box(0x5f6a70, 0.7, 0.09, 1.0, 0.09, x, deckTop + 0.56, fz + dz, { cast: false });
      }
    }

    // Four stair flights: one at each end of the deck, on both faces.
    const flightAngle = Math.atan2(deckTop - SIDEWALK_TOP, stairRun);
    const flightLen = Math.hypot(stairRun, deckTop - SIDEWALK_TOP);
    for (const sx of [-stairX, stairX]) {
      for (const dir of [-1, 1]) {
        const zEdge = fz + dir * deckHalfZ;
        for (let i = 0; i < stepCount; i += 1) {
          const top = deckTop - i * stepRise;
          const cz = zEdge + dir * (i + 0.5) * stepRun;
          // Solid riser block sitting on the pavement: nothing floats.
          box(0xa9a08c, 0.95, stairW, top, stepRun, sx, top / 2, cz);
          // Nosing highlight so the treads read as separate steps.
          box(0xd8d2c0, 0.9, stairW - 0.16, 0.04, 0.09, sx, top + 0.02, cz - dir * stepRun * 0.42, {
            cast: false
          });
        }
        // Sloped stringer rails down both sides of the flight.
        for (const dz of [-stairW / 2 + 0.08, stairW / 2 - 0.08]) {
          const railMidZ = zEdge + dir * stairRun / 2;
          const railMidY = (deckTop + SIDEWALK_TOP) / 2 + 0.95;
          const rx = dir > 0 ? flightAngle : -flightAngle;
          box(0x5f6a70, 0.7, 0.1, 0.1, flightLen, sx + dz, railMidY, railMidZ, {
            rx,
            cast: false
          });
          box(0x5f6a70, 0.7, 0.08, 0.08, flightLen, sx + dz, railMidY - 0.46, railMidZ, {
            rx,
            cast: false
          });
          // Posts every third step, planted on the steps themselves.
          for (let i = 0; i < stepCount; i += 3) {
            const top = deckTop - i * stepRise;
            const cz = zEdge + dir * (i + 0.5) * stepRun;
            box(0x5f6a70, 0.7, 0.07, 0.95, 0.07, sx + dz, top + 0.48, cz, { cast: false });
          }
        }
      }
    }

    // Deck nameplate hanging on the south rail, facing oncoming traffic.
    addSign(group, 'KOFAR WAMBAI \u00b7 FOOTBRIDGE', '#1b2a33', '#ffd24a', 0, deckTop + 0.55, fz - deckHalfZ - 0.06, Math.PI, 6);
  }

  // ----------------------------------------------------------- ocean causeway
  // A long bridge carries north-south traffic across the open water west of the
  // city, well clear of every building, with its approaches climbing off the
  // cross streets on the bank. Boats pass underneath the deck.
  {
    const deckLen = ROAD_LENGTH;
    const deckTop = CAUSEWAY_DECK_Y;
    const deckThick = 0.7;
    const deckMidY = deckTop - deckThick / 2;
    const deckW = CAUSEWAY_HALF_W * 2;

    // Main carriageway deck.
    box(0x4f5a66, 0.92, deckW, deckThick, deckLen, CAUSEWAY_X, deckMidY, 0);
    // Wearing course plus painted lanes.
    box(0x3f4246, 1, deckW - 1.6, 0.08, deckLen, CAUSEWAY_X, deckTop + 0.04, 0);
    for (let z = -deckLen / 2 + 4; z < deckLen / 2 - 4; z += 12) {
      box(0xe6c445, 0.95, 0.14, 0.02, 4.4, CAUSEWAY_X, deckTop + 0.09, z);
    }
    for (const dx of [-CAUSEWAY_HALF_W + 1.1, CAUSEWAY_HALF_W - 1.1]) {
      box(0xe8e2cf, 0.95, 0.16, 0.02, deckLen - 2, CAUSEWAY_X + dx, deckTop + 0.09, 0);
    }

    // Parapets down both edges.
    for (const dx of [-CAUSEWAY_HALF_W + 0.22, CAUSEWAY_HALF_W - 0.22]) {
      box(0x9aa4ad, 0.85, 0.44, 0.95, deckLen, CAUSEWAY_X + dx, deckTop + 0.48, 0);
      box(0x7c8590, 0.85, 0.52, 0.28, deckLen, CAUSEWAY_X + dx, deckTop + 0.14, 0);
    }

    // Piers marching out across the water.
    for (let z = -deckLen / 2 + 22; z <= deckLen / 2 - 22; z += 46) {
      for (const dx of [-CAUSEWAY_HALF_W + 2.6, CAUSEWAY_HALF_W - 2.6]) {
        const pierX = CAUSEWAY_X + dx;
        const topY = deckTop - deckThick;
        const pierH = topY - OCEAN_SURFACE_Y;
        box(0x8f8879, 0.9, 1.7, pierH, 1.7, pierX, (topY + OCEAN_SURFACE_Y) / 2, z, {
          cast: false
        });
        box(0x6d6557, 0.9, 2.3, 0.6, 2.3, pierX, topY - 0.3, z);
        box(0x5f6a70, 0.9, 2.1, 0.5, 2.1, pierX, OCEAN_SURFACE_Y + 0.22, z, {
          cast: false
        });
      }
      // Cross beam tying the two piers together.
      box(0x7c8590, 0.9, deckW - 3.2, 0.5, 1.1, CAUSEWAY_X, deckTop - deckThick - 0.55, z, {
        cast: false
      });
    }

    // Bank approaches: the cross streets climb onto the causeway at both ends.
    const approachRun = WEST_SHORE_X - CAUSEWAY_APPROACH_START_X;
    const approachMidX = (WEST_SHORE_X + CAUSEWAY_APPROACH_START_X) / 2;
    const approachLen = Math.hypot(approachRun, CAUSEWAY_DECK_Y);
    const approachAngle = -Math.atan2(CAUSEWAY_DECK_Y, approachRun);
    for (const az of CAUSEWAY_APPROACH_ZS) {
      box(
        0x4f5a66,
        0.92,
        approachLen,
        deckThick,
        deckW,
        approachMidX,
        deckTop / 2 - deckThick / 2,
        az,
        {
          rz: approachAngle
        }
      );
      box(0x3f4246, 1, approachLen - 1.4, 0.08, deckW - 1.6, approachMidX, deckTop / 2 + 0.04, az, {
        rz: approachAngle
      });
      for (const dz of [-CAUSEWAY_HALF_W + 0.22, CAUSEWAY_HALF_W - 0.22]) {
        box(0x9aa4ad, 0.85, approachLen - 1, 0.8, 0.44, approachMidX, deckTop / 2 + 0.5, az + dz, {
          rz: approachAngle
        });
      }
      // Piers under the sloped ramp.
      for (let t = 0.18; t < 0.95; t += 0.22) {
        const px = WEST_SHORE_X - t * approachRun;
        const py = CAUSEWAY_DECK_Y * t;
        if (py < 0.9) continue;
        for (const dz of [-CAUSEWAY_HALF_W + 2.6, CAUSEWAY_HALF_W - 2.6]) {
          box(0x8f8879, 0.9, 1.3, py, 1.3, px, py / 2, az + dz, { cast: false });
        }
      }
    }

    addSign(
      group,
      'BARCA DA TEKU \u00b7 OCEAN CAUSEWAY',
      '#12303f',
      '#e8f6ff',
      CAUSEWAY_X,
      deckTop + 2.6,
      -CROSS_HALF - 14,
      0,
      7
    );
  }

  // ------------------------------------------------------------------ boats
  const boats: Array<{ group: THREE.Group; speed: number; baseZ: number; baseY: number }> = [];
  const makeBoat = (color: number, canopy: number, light = false): THREE.Group => {
    const g = new THREE.Group();
    const hullShape = new THREE.Shape();
    hullShape.moveTo(0, -3.8);
    hullShape.lineTo(0.82, -3.05);
    hullShape.lineTo(1.18, -1.9);
    hullShape.lineTo(1.2, 2.45);
    hullShape.lineTo(0.82, 3.35);
    hullShape.lineTo(-0.82, 3.35);
    hullShape.lineTo(-1.2, 2.45);
    hullShape.lineTo(-1.18, -1.9);
    hullShape.lineTo(-0.82, -3.05);
    hullShape.closePath();
    const hull = new THREE.Mesh(
      new THREE.ExtrudeGeometry(hullShape, {
        depth: 0.52,
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: 0.07,
        bevelThickness: 0.08
      }),
      mat(color, 0.45)
    );
    hull.rotation.x = -Math.PI / 2;
    hull.position.y = -0.42;
    g.add(hull);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 5.25), mat(0x8a6b45, 0.8));
    floor.position.y = -0.02;
    g.add(floor);
    for (const side of [-1, 1]) {
      box(0xe6dfcc, 0.65, 0.12, 0.12, 5.2, side * 1.05, 0.23, -0.05, { cast: false });
      for (const z of [-2.2, -0.8, 0.7, 2.05]) {
        box(0x8a6b45, 0.85, 1.75, 0.1, 0.34, 0, 0.24, z);
      }
    }
    if (canopy !== 0) {
      for (const [px, pz] of [[-0.9, -2.2], [0.9, -2.2], [-0.9, 2.2], [0.9, 2.2]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.9, 7), mat(0x3b3a34, 0.8));
        pole.position.set(px, 0.52, pz);
        g.add(pole);
        const window = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.46, 1.5),
          new THREE.MeshStandardMaterial({
            color: 0x7ab5c2,
            roughness: 0.18,
            metalness: 0.15,
            transparent: true,
            opacity: 0.32,
            depthWrite: false
          })
        );
        window.position.set(px * 0.92, 0.58, (pz < 0 ? -1 : 1) * 2.0);
        g.add(window);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 5.2), mat(canopy, 0.68));
      roof.position.set(0, 1.03, -0.15);
      g.add(roof);
      for (const side of [-1, 1]) {
        box(0xf0d889, 0.4, 1.1, 0.12, 0.04, side * 0.54, 1.14, 2.25, { cast: false });
      }
    }
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.4), mat(0x24262a, 0.6));
    motor.position.set(0, 0.1, -3.35);
    g.add(motor);
    if (light) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), glowMat(0x3a6bff));
      beacon.position.set(0, 0.55, -2.6);
      g.add(beacon);
    }
    // Wake drags behind the stern and sells the motion from the bank.
    const wakeMat = new THREE.MeshBasicMaterial({
      color: 0xd8efea,
      transparent: true,
      opacity: 0.32,
      depthWrite: false
    });
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 6.5), wakeMat);
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(0, -0.12, -5.4);
    g.add(wake);
    g.position.y = RIVER_SURFACE_Y + 0.15;
    group.add(g);
    return g;
  };

  const boatColors = [0xb04a2f, 0x2f6fa8, 0xd4a12f, 0x2f7f5b, 0x8f2f5c];
  const boatLanes = [RIVER_MIN_X + 13, RIVER_MAX_X - 13, RIVER_MIN_X + 13, RIVER_MAX_X - 13];
  const boatDirs = [1, -1, -1, 1];
  for (let i = 0; i < 4; i += 1) {
    const canopy = i % 2 === 0 ? boatColors[(i + 2) % boatColors.length] : 0;
    const b = makeBoat(boatColors[i % boatColors.length], canopy, i === 3);
    b.position.x = boatLanes[i];
    const baseZ = -half + 60 + i * 240;
    b.position.z = baseZ;
    b.rotation.y = boatDirs[i] > 0 ? 0 : Math.PI;
    boats.push({
      group: b,
      speed: 2.6 + i * 0.5,
      baseZ,
      baseY: RIVER_SURFACE_Y + 0.15
    });
  }

  // Ocean traffic: boats crossing the bay so they slide underneath the causeway.
  const oceanBoats: Array<{
    group: THREE.Group;
    speed: number;
    dir: number;
    baseZ: number;
    minX: number;
    maxX: number;
  }> = [];
  const oceanBoatZs = [-330, -120, 60, 246];
  const oceanBoatRanges: Array<[number, number]> = [
    [-690, WEST_DISTRICT_MIN_X - 8],
    [CAUSEWAY_X + CAUSEWAY_HALF_W + 3, WEST_SHORE_X - 8]
  ];
  for (let i = 0; i < oceanBoatZs.length; i += 1) {
    const canopy = i % 2 === 0 ? boatColors[(i + 1) % boatColors.length] : 0;
    const b = makeBoat(boatColors[(i + 3) % boatColors.length], canopy, i === 2);
    const [minX, maxX] = oceanBoatRanges[i % oceanBoatRanges.length];
    b.position.set(minX + 8 + (i % 2) * 28, OCEAN_SURFACE_Y + 0.15, oceanBoatZs[i]);
    b.rotation.y = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    oceanBoats.push({
      group: b,
      speed: 3.4 + i * 0.45,
      dir: i % 2 === 0 ? 1 : -1,
      baseZ: oceanBoatZs[i],
      minX,
      maxX
    });
  }

  // Moored cargo ships / barges, kept clear of the bridges.
  const makeShip = (x: number, z: number, yaw: number, hullColor: number): void => {
    const hullLen = 44;
    box(0x2f3b42, 0.9, 11.5, 1.5, hullLen + 2, x, RIVER_SURFACE_Y - 0.75, z, { ry: yaw, cast: false });
    box(hullColor, 0.85, 10.6, 2.4, hullLen, x, RIVER_SURFACE_Y + 0.55, z, { ry: yaw });
    box(0x8f2f2f, 0.9, 10.8, 0.5, hullLen - 1, x, RIVER_SURFACE_Y + 1.55, z, { ry: yaw, cast: false });
    // Deck cargo: stacked containers.
    const cargoColors = [0xb04a2f, 0x2f6fa8, 0xd4a12f, 0x2f7f5b, 0x8a8f96, 0x8f2f5c];
    for (let row = 0; row < 6; row += 1) {
      for (let stack = 0; stack < 2; stack += 1) {
        const ch = 2.4;
        box(
          cargoColors[(row + stack) % cargoColors.length],
          0.85,
          2.2,
          ch,
          2.4,
          x + (stack === 0 ? -1.3 : 1.3),
          RIVER_SURFACE_Y + 2.0 + ch / 2 + stack * 0.0,
          z - 16 + row * 5.2,
          { ry: yaw }
        );
      }
    }
    // Bridge house and funnel at the stern.
    box(0xe4dcc9, 0.85, 7.2, 3.4, 7, x, RIVER_SURFACE_Y + 3.8, z + 16, { ry: yaw });
    for (let i = 0; i < 3; i += 1) {
      box(0x2b4258, 0.25, 1.0, 0.5, 5.8, x + 3.62, RIVER_SURFACE_Y + 4.7 + i * 0.1, z + 16, {
        ry: yaw,
        cast: false
      });
    }
    box(0x1f2226, 0.8, 1.2, 2.8, 1.2, x + 2.2, RIVER_SURFACE_Y + 6.2, z + 18, { ry: yaw });
    box(0x11151a, 0.9, 1.5, 0.25, 1.5, x + 2.2, RIVER_SURFACE_Y + 7.7, z + 18, { ry: yaw, cast: false });
    // Mast and navigation light.
    box(0xd8d2c0, 0.7, 0.12, 6.0, 0.12, x - 3.6, RIVER_SURFACE_Y + 5.2, z + 17, { cast: false });
    box(0xff3a2a, 0.3, 0.3, 0.3, 0.3, x - 3.6, RIVER_SURFACE_Y + 8.3, z + 17, { cast: false });
    // Mooring ropes and bollards on the quay.
    for (const dz of [-14, 14]) {
      cylinder('bin', binGeometry, 0x2b2d30, 0.8, x - 8.4, 0.3, z + dz, { rx: Math.PI / 2, rz: 0 });
    }
    // Bridge/forecastle details.
    box(0x8f8879, 0.9, 7.8, 0.4, 2.2, x, RIVER_SURFACE_Y + 2.2, z - 18, { ry: yaw, cast: false });
    addSign(group, 'KANO RIVER BARGE', '#11242c', '#ffe08a', x + 5.7, RIVER_SURFACE_Y + 2.6, z + 12, Math.PI / 2, 5.4);
  };
  makeShip(RIVER_MIN_X + 11, -428, 0, 0x3f4a52);
  makeShip(RIVER_MAX_X - 11, 470, Math.PI, 0x4a3f38);
  makeShip(RIVER_MIN_X + 12, 330, 0, 0x35424a);

  const palette = [
    0xcdbb9e, 0xbfa58a, 0xa7b79f, 0x98a6b6, 0xd4c6ab, 0xb29b84, 0xa9b9b3,
    0xc9a07a, 0x9db0a0, 0xc7b9d6, 0xe0cfa8, 0x8fa3b8, 0xb5836a, 0x7f9a8c
  ];
  const trims = [0xe4dcc9, 0xd9d0bd, 0xcbc2ae, 0xb8a88c, 0x8d7f6a];
  const pickStyle = (): number => Math.floor(rnd() * 6);
  const westEstates = [
    { x: -444, z: -410 },
    { x: -584, z: -100 },
    { x: -584, z: 300 }
  ];
  const busStations = [
    { id: 'west-terminal', label: 'WEST BUS TERMINAL', x: -384, z: -258 },
    { id: 'kofar-wambai-stop', label: 'KOFAR WAMBAI STOP', x: -584, z: -60 },
    { id: 'estate-terminal', label: 'ESTATE TERMINAL', x: -444, z: 220 },
    { id: 'bompai-terminal', label: 'BOMPAI CITY STOP', x: -220, z: -192 },
    { id: 'dala-terminal', label: 'DALA BUS PARK', x: -198, z: -358 },
    { id: 'kano-central-stop', label: 'KANO CENTRAL STOP', x: 224, z: -22 },
    { id: 'kofar-wambai-east', label: 'KOFAR WAMBAI EAST', x: 334, z: 18 },
    { id: 'tarauni-terminal', label: 'TARAUNI BUS TERMINAL', x: 454, z: 30 }
  ];
  const westEstate = westEstates[0];
  const railStations = RAIL_STATIONS;
  for (const station of railStations) {
    colliders.push(
      {
        minX: station.accessX - SUBWAY_ENTRANCE_HALF_WIDTH - 0.25,
        maxX: station.accessX - SUBWAY_STAIR_HALF_WIDTH,
        minZ: station.z + SUBWAY_STAIR_BOTTOM_Z_OFFSET,
        maxZ: station.accessZ
      },
      {
        minX: station.accessX + SUBWAY_STAIR_HALF_WIDTH,
        maxX: station.accessX + SUBWAY_ENTRANCE_HALF_WIDTH + 0.25,
        minZ: station.z + SUBWAY_STAIR_BOTTOM_Z_OFFSET,
        maxZ: station.accessZ
      }
    );
  }
  const row = (
    side: number,
    baseX: number,
    minDepth: number,
    maxDepth: number,
    minHeight: number,
    maxHeight: number,
    gap: number,
    maxWidth = 14
  ): void => {
    // Walk each stretch between cross streets so every block gets built up.
    for (const [from, to] of zSegments) {
      let z = from + 0.8;
      while (z < to - minDepth - 0.8) {
        const depth = minDepth + rnd() * (maxDepth - minDepth);
        if (z + depth > to - 0.8) break;
        if (baseX < 35 && inLandmarkZone(z + depth / 2, side, occupancyZones, depth / 2 + 2)) {
          z += depth + gap;
          continue;
        }
        const width = 7 + rnd() * Math.max(0, maxWidth - 7);
        const height = minHeight + rnd() * (maxHeight - minHeight);
        const x = side * (baseX + width / 2 + rnd() * 1.4);
        const centreZ = z + depth / 2;
        // Keep the airport apron and its fence line clear of street blocks.
        if (
          inAirportGrounds(x, centreZ) ||
          inAirportGrounds(x - width / 2, centreZ) ||
          inAirportGrounds(x + width / 2, centreZ)
        ) {
          z += depth + gap;
          continue;
        }
        if (RAIL_STATIONS.some(
          (station) =>
            Math.abs(x - station.accessX) < width / 2 + 2 &&
            centreZ > station.z - 3 &&
            centreZ < station.accessZ + 3
        )) {
          z += depth + gap;
          continue;
        }
        if (
          side === -1 &&
          baseX > 350 &&
          (westEstates.some(
            (estate) => Math.abs(x - estate.x) < 26 && Math.abs(centreZ - estate.z) < 22
          ) ||
            busStations.some(
              (station) => Math.abs(x - station.x) < 16 && Math.abs(centreZ - station.z) < 22
            ))
        ) {
          z += depth + gap;
          continue;
        }
        addBuilding(
          colliders,
          buildings,
          x,
          centreZ,
          {
            width,
            depth,
            height,
            color: palette[Math.floor(rnd() * palette.length)],
            trim: trims[Math.floor(rnd() * trims.length)],
            side,
            style: pickStyle()
          },
          rnd
        );
        z += depth + gap + rnd() * 2.5;
      }
    }
  };

  // Six parallel rows per side fill each block from the boulevard to the far ring.
  for (const side of [-1, 1]) {
    row(side, BUILD_LINE + 0.9, 9, 15, 6, 20, 1.6, 14);
    row(side, 37, 8, 12, 5, 14, 2, 16);
    row(side, SIDE_ROAD_X + SIDE_HALF + 4, 8, 13, 5, 16, 2, 10);
    row(side, OUTER_ROAD_X + OUTER_HALF + 3, 8, 12, 5, 14, 2, 11);
    row(side, (OUTER_ROAD_X + FAR_ROAD_X) / 2 - 8, 8, 13, 5, 16, 2, 11);
    row(side, FAR_ROAD_X + FAR_HALF + 4, 8, 12, 5, 15, 2, 12);
  }

  // Develop the new west-bank district beyond the bay causeway.
  row(-1, 370, 9, 15, 5, 13, 2.2, 14);
  row(-1, 430, 10, 17, 7, 16, 2.4, 17);
  row(-1, 490, 9, 15, 5, 13, 2.2, 14);
  row(-1, 560, 9, 15, 6, 14, 2.2, 13);
  row(-1, 600, 9, 14, 5, 13, 2, 12);
  for (const cz of CROSS_ZS) {
    for (const [x0, x1] of westSidewalkSegments) {
      let x = x0 + 2;
      while (x < x1 - 2) {
        const width = Math.min(7 + rnd() * 5, x1 - x - 2);
        const depth = 7 + rnd() * 3;
        const height = 4 + rnd() * 10;
        for (const side of [-1, 1]) {
          const centreX = x + width / 2;
          const centreZ = cz + side * (CROSS_HALF + 4 + depth / 2);
          const reserved = westEstates.some(
            (estate) => Math.abs(centreX - estate.x) < 27 && Math.abs(centreZ - estate.z) < 22
          ) || busStations.some(
            (station) => Math.abs(centreX - station.x) < 16 && Math.abs(centreZ - station.z) < 22
          );
          if (reserved) continue;
          addBuilding(
            colliders,
            buildings,
            centreX,
            centreZ,
            {
              width,
              depth,
              height,
              color: palette[Math.floor(rnd() * palette.length)],
              trim: trims[Math.floor(rnd() * trims.length)],
              side: 0,
              style: pickStyle()
            },
            rnd
          );
        }
        x += width + 2 + rnd() * 2;
      }
    }
  }

  // Gated estate with a large modern mansion, landscaped court and swimming pool.
  addBuilding(colliders, buildings, westEstate.x, westEstate.z, {
    width: 26,
    depth: 18,
    height: 9.5,
    color: 0xd5c8ae,
    trim: 0x544e43,
    side: -1,
    style: 2
  }, rnd);
  box(0x302d28, 0.85, 29, 0.55, 21, westEstate.x, 9.8, westEstate.z);
  box(0x544e43, 0.85, 12, 0.22, 23, westEstate.x, 10.15, westEstate.z);
  box(0xefe2c4, 0.65, 0.4, 3.6, 0.4, westEstate.x - 8, 2.15, westEstate.z + 9.3);
  box(0xefe2c4, 0.65, 0.4, 3.6, 0.4, westEstate.x + 8, 2.15, westEstate.z + 9.3);
  box(0x8b806a, 0.95, 4.8, 0.18, 7.5, westEstate.x + 16, 0.09, westEstate.z - 1);
  box(0x3f82a0, 0.28, 7.5, 0.05, 3.2, westEstate.x + 16, 0.04, westEstate.z - 9);
  box(0x9b8c70, 0.9, 0.35, 1.45, 28, westEstate.x - 22, 0.72, westEstate.z);
  box(0x9b8c70, 0.9, 44, 1.45, 0.35, westEstate.x, 0.72, westEstate.z - 14);
  box(0x9b8c70, 0.9, 44, 1.45, 0.35, westEstate.x, 0.72, westEstate.z + 14);
  for (const zSign of [-1, 1]) {
    const wallCenterZ = westEstate.z + zSign * 9.5;
    box(0x9b8c70, 0.9, 0.35, 1.45, 9, westEstate.x + 22, 0.72, wallCenterZ);
    colliders.push({
      minX: westEstate.x + 21.82,
      maxX: westEstate.x + 22.18,
      minZ: wallCenterZ - 4.5,
      maxZ: wallCenterZ + 4.5
    });
  }
  colliders.push(
    {
      minX: westEstate.x - 22.18,
      maxX: westEstate.x - 21.82,
      minZ: westEstate.z - 14,
      maxZ: westEstate.z + 14
    },
    {
      minX: westEstate.x - 22,
      maxX: westEstate.x + 22,
      minZ: westEstate.z - 14.18,
      maxZ: westEstate.z - 13.82
    },
    {
      minX: westEstate.x - 22,
      maxX: westEstate.x + 22,
      minZ: westEstate.z + 13.82,
      maxZ: westEstate.z + 14.18
    }
  );
  for (const x of [westEstate.x - 17, westEstate.x - 5, westEstate.x + 7, westEstate.x + 19]) {
    addPalm(colliders, x, westEstate.z - 10, rnd, 0);
    addPalm(colliders, x, westEstate.z + 10, rnd, 0);
  }

  for (const estate of westEstates.slice(1)) {
    addBuilding(colliders, buildings, estate.x, estate.z, {
      width: 23,
      depth: 17,
      height: 8.5,
      color: 0xe0d5bf,
      trim: 0x55514a,
      side: -1,
      style: 2
    }, rnd);
    box(0x302d28, 0.85, 26, 0.5, 20, estate.x, 8.9, estate.z);
    box(0x3f82a0, 0.28, 8, 0.05, 3.2, estate.x + 15, 0.04, estate.z - 8);
    box(0x9b8c70, 0.9, 0.35, 1.35, 27, estate.x - 21, 0.68, estate.z);
    box(0x9b8c70, 0.9, 42, 1.35, 0.35, estate.x, 0.68, estate.z - 13.5);
    box(0x9b8c70, 0.9, 42, 1.35, 0.35, estate.x, 0.68, estate.z + 13.5);
    for (const zSign of [-1, 1]) {
      const wallCenterZ = estate.z + zSign * 9;
      box(0x9b8c70, 0.9, 0.35, 1.35, 9, estate.x + 21, 0.68, wallCenterZ);
      colliders.push({
        minX: estate.x + 20.82,
        maxX: estate.x + 21.18,
        minZ: wallCenterZ - 4.5,
        maxZ: wallCenterZ + 4.5
      });
    }
    colliders.push(
      { minX: estate.x - 21.18, maxX: estate.x - 20.82, minZ: estate.z - 13.5, maxZ: estate.z + 13.5 },
      { minX: estate.x - 21, maxX: estate.x + 21, minZ: estate.z - 13.68, maxZ: estate.z - 13.32 },
      { minX: estate.x - 21, maxX: estate.x + 21, minZ: estate.z + 13.32, maxZ: estate.z + 13.68 }
    );
    for (const x of [estate.x - 16, estate.x - 4, estate.x + 8, estate.x + 18]) {
      addPalm(colliders, x, estate.z - 9.5, rnd, 0);
      addPalm(colliders, x, estate.z + 9.5, rnd, 0);
    }
  }

  for (const station of busStations) {
    box(0x494b4b, 0.9, 12, 0.22, 13, station.x, 3.45, station.z);
    box(0x273b4a, 0.7, 12.4, 0.24, 0.8, station.x, 3.45, station.z + 6.5);
    for (const dx of [-5.2, 5.2]) {
      for (const dz of [-5.6, 5.6]) {
        box(0x5b5e5e, 0.7, 0.18, 3.3, 0.18, station.x + dx, 1.65, station.z + dz);
        colliders.push({
          minX: station.x + dx - 0.22,
          maxX: station.x + dx + 0.22,
          minZ: station.z + dz - 0.22,
          maxZ: station.z + dz + 0.22
        });
      }
    }
    box(0x8a6b45, 0.9, 6.2, 0.25, 0.9, station.x, 0.78, station.z - 3.3);
    colliders.push({
      minX: station.x - 3.2,
      maxX: station.x + 3.2,
      minZ: station.z - 3.9,
      maxZ: station.z - 2.7
    });
    box(0x2f6fa8, 0.6, 3.8, 1.8, 0.14, station.x, 2.45, station.z + 6.5);
    box(0xe8e2cf, 0.95, 10, 0.06, 1.8, station.x, 0.04, station.z + 9.5);
    box(0xe6c445, 0.95, 0.18, 0.03, 1.1, station.x - 4.2, 0.03, station.z + 9.5);
    addSign(group, station.label, '#17364b', '#ffe08a', station.x, 4.2, station.z + 7, 0, 6);
  }

  // The east bank: a newer, taller grid reached over the river bridges.
  row(1, RIVER_MAX_X + 10, 9, 15, 6, 23, 1.8, 15);
  row(1, EAST_ROAD_X + 12, 8, 13, 5, 19, 2, 12);
  row(1, (EAST_ROAD_X + EAST_FAR_X) / 2 - 8, 8, 13, 5, 18, 2, 12);
  row(1, EAST_FAR_X + 12, 8, 13, 5, 16, 2, 12);

  // Buildings facing the cross streets fill the blocks between every avenue.
  for (const cz of CROSS_ZS) {
    for (const side of [-1, 1]) {
      for (const sign of [-1, 1]) {
        let x = SIDE_ROAD_X + 24;
        while (x < FAR_ROAD_X - FAR_HALF - 14) {
          const width = 7 + rnd() * 6;
          if (x + width > FAR_ROAD_X - FAR_HALF - 8) break;
          const centre = sign * (x + width / 2);
          const blocked = SIDE_ROADS.some(
            (sx) =>
              Math.abs(sx) > SIDE_ROAD_X &&
              Math.abs(Math.abs(centre) - Math.abs(sx)) < roadHalfFor(sx) + width / 2 + 3
          );
          if (blocked) {
            x += 5;
            continue;
          }
          const depth = 7 + rnd() * 4;
          const height = 4 + rnd() * 11;
          addBuilding(
            colliders,
            buildings,
            sign * (x + width / 2),
            cz + side * (CROSS_HALF + 4 + depth / 2),
            {
              width,
              depth,
              height,
              color: palette[Math.floor(rnd() * palette.length)],
              trim: trims[Math.floor(rnd() * trims.length)],
              side: 0,
              style: pickStyle()
            },
            rnd
          );
          x += width + 2 + rnd() * 2;
        }
      }
    }
  }

  // Corner buildings along the east-bank cross streets.
  for (const cz of CROSS_ZS) {
    for (const side of [-1, 1]) {
      let x = RIVER_MAX_X + 14;
      while (x < WORLD_HALF_X - 12) {
        const width = 7 + rnd() * 6;
        if (x + width > WORLD_HALF_X - 10) break;
        const centre = x + width / 2;
        const blocked = SIDE_ROADS.some(
          (sx) => sx > RIVER_MAX_X && Math.abs(centre - sx) < roadHalfFor(sx) + width / 2 + 3
        );
        if (blocked) {
          x += 5;
          continue;
        }
        const depth = 7 + rnd() * 4;
        const height = 5 + rnd() * 14;
        const centreZ = cz + side * (CROSS_HALF + 4 + depth / 2);
        // Blocks that would land on the airport apron are simply not built.
        if (!inAirportGrounds(centre, centreZ)) {
          addBuilding(
            colliders,
            buildings,
            centre,
            centreZ,
            {
              width,
              depth,
              height,
              color: palette[Math.floor(rnd() * palette.length)],
              trim: trims[Math.floor(rnd() * trims.length)],
              side: 0,
              style: pickStyle()
            },
            rnd
          );
        }
        x += width + 2 + rnd() * 2;
      }
    }
  }

  // Courtyard greenery so the deep blocks don't read as empty lots.
  const nearBuilding = (x: number, z: number, margin: number): boolean =>
    buildings.some(
      (b) =>
        x > b.minX - margin &&
        x < b.maxX + margin &&
        z > b.minZ - margin &&
        z < b.maxZ + margin
    );
  const inLandmarkFootprint = (x: number, z: number): boolean =>
    occupancyZones.some((l) => {
      const x0 = l.side * BUILD_LINE;
      const x1 = l.side * (BUILD_LINE + l.width);
      return (
        x > Math.min(x0, x1) - 3 &&
        x < Math.max(x0, x1) + 3 &&
        Math.abs(z - l.z) < l.depth / 2 + 3
      );
    });
  const inWestSite = (x: number, z: number): boolean =>
    westEstates.some(
      (estate) => Math.abs(x - estate.x) < 26 && Math.abs(z - estate.z) < 22
    ) ||
    busStations.some(
      (station) => Math.abs(x - station.x) < 12 && Math.abs(z - station.z) < 22
    );
  const onStreet = (x: number, z: number): boolean =>
    Math.abs(x) < ROAD_HALF + 6 ||
    SIDE_ROADS.some((sx) => Math.abs(x - sx) < roadHalfFor(sx) + 6) ||
    CROSS_ZS.some((cz) => Math.abs(z - cz) < CROSS_HALF + 6);

  for (let i = 0; i < 340; i += 1) {
    const x = -WORLD_HALF_X + 10 + rnd() * (WORLD_HALF_X * 2 - 20);
    const z = -half + 10 + rnd() * (half * 2 - 20);
    const onWestLand = x >= WEST_DISTRICT_MIN_X + 8 && x <= WEST_DISTRICT_MAX_X - 8;
    if (x < WEST_SHORE_X + 8 && !onWestLand) continue;
    if (
      onStreet(x, z) ||
      isRiverAt(x, z) ||
      nearBuilding(x, z, 2.5) ||
      inLandmarkFootprint(x, z) ||
      inWestSite(x, z) ||
      inAirportGrounds(x, z)
    ) continue;
    addPalm(colliders, x, z, rnd, 0);
  }
  for (let i = 0; i < 260; i += 1) {
    const x = WEST_DISTRICT_MIN_X + 10 + rnd() * (WEST_DISTRICT_MAX_X - WEST_DISTRICT_MIN_X - 20);
    const z = -half + 10 + rnd() * (half * 2 - 20);
    if (onStreet(x, z) || nearBuilding(x, z, 3) || inLandmarkFootprint(x, z) || inWestSite(x, z)) continue;
    addPalm(colliders, x, z, rnd, 0);
  }

  const landmarkByName = (name: SiteKind): LandmarkZone => landmarks.find((l) => l.name === name)!;

  addEnterableLandmark(group, colliders, landmarkByName('hotel'), {
    wallColor: 0xd8c9a8,
    trimColor: 0x8a6f3d,
    signBg: '#1a2744',
    signFg: '#f0d878',
    signText: 'HOTEL KANO',
    height: 14,
    interiorColor: 0xc4b89a,
    counterColor: 0x6b5232,
    lightColor: 0xffe8b0
  });
  addEnterableLandmark(group, colliders, landmarkByName('club'), {
    wallColor: 0x5f4c76,
    trimColor: 0xd4a12f,
    signBg: '#2a1040',
    signFg: '#ff6ad5',
    signText: 'CLUB AYO',
    height: 8,
    interiorColor: 0x4a3a55,
    counterColor: 0x2a2035,
    lightColor: 0xd06aff
  });
  addEnterableLandmark(group, colliders, landmarkByName('police'), {
    wallColor: 0xb8c4d0,
    trimColor: 0x26418c,
    signBg: '#1a3060',
    signFg: '#e8e8e6',
    signText: 'POLICE',
    height: 7,
    interiorColor: 0xa8b4c0,
    counterColor: 0x3a4a5c,
    lightColor: 0xcfe0ff
  });

  // Extra nightclubs spread along the boulevard so the nightlife is not all
  // crammed into one block. Each has its own sign, shell and interior.
  const clubZones: Array<{
    id: string;
    opts: Parameters<typeof addEnterableLandmark>[3];
  }> = [
    {
      id: 'club-onyx',
      opts: {
        wallColor: 0x5c566e,
        trimColor: 0x8a5cff,
        signBg: '#120818',
        signFg: '#a97bff',
        signText: 'CLUB ONYX',
        height: 9,
        interiorColor: 0x2a2035,
        counterColor: 0x141018,
        lightColor: 0x8a5cff
      }
    },
    {
      id: 'club-shrine',
      opts: {
        wallColor: 0x6b5348,
        trimColor: 0xd4a12f,
        signBg: '#200a06',
        signFg: '#ff8a3a',
        signText: 'THE SHRINE',
        height: 8,
        interiorColor: 0x3a2420,
        counterColor: 0x1a0f0c,
        lightColor: 0xff5a2a
      }
    },
    {
      id: 'club-velvet',
      opts: {
        wallColor: 0x66465c,
        trimColor: 0xff4f8a,
        signBg: '#1a0410',
        signFg: '#ff7aa8',
        signText: 'VELVET ROOM',
        height: 10,
        interiorColor: 0x3a1a2c,
        counterColor: 0x180810,
        lightColor: 0xff4f8a
      }
    }
  ];
  for (const club of clubZones) {
    const zone = landmarks.find((l) => l.id === club.id);
    if (zone) addEnterableLandmark(group, colliders, zone, club.opts);
  }

  // Banks with branded facades and ATM booths at the kerb.
  const atms: ServiceSpot[] = [];
  const posStands: ServiceSpot[] = [];
  for (const bank of BANKS) addBank(group, colliders, buildings, bank, atms);

  // POS agents working the kerb, umbrella and all.
  const posPlaces = [
    { side: -1, z: 22 },
    { side: 1, z: -96 },
    { side: -1, z: -246 },
    { side: 1, z: 92 },
    { side: -1, z: 330 },
    { side: 1, z: 464 }
  ];
  const reserved: Array<{ x: number; z: number }> = [];
  for (const atm of atms) reserved.push({ x: atm.x, z: atm.z });
  for (let i = 0; i < posPlaces.length; i += 1) {
    const place = posPlaces[i];
    const stand = addPosStand(
      group,
      colliders,
      place.side,
      place.z,
      POS_ACCENTS[i % POS_ACCENTS.length]
    );
    posStands.push(stand);
    reserved.push({ x: stand.x, z: stand.z });
  }
  const reservedNear = (x: number, z: number, margin: number): boolean =>
    reserved.some((p) => Math.abs(p.x - x) < margin && Math.abs(p.z - z) < margin);

  // Palms only every 34 m, alternating sides so the avenue feels open.
  for (const side of [-1, 1]) {
    for (let z = -half + 20; z <= half - 20; z += 34) {
      if (
        inLandmarkZone(z, side, occupancyZones, 8) ||
        nearCross(z, 8) ||
        reservedNear(side * (ROAD_HALF + 4.6), z, 4)
      ) {
        continue;
      }
      addPalm(colliders, side * (ROAD_HALF + 4.6), z + (rnd() - 0.5) * 3, rnd);
    }
  }

  // Street lights: one every ~170 m on the boulevard, alternating sides, and
  // one every ~260 m on each avenue. Long, dark stretches between them.
  for (let i = 0; i * 170 < ROAD_LENGTH; i += 1) {
    const z = -half + 40 + i * 170;
    if (z > half - 20) break;
    const side = i % 2 === 0 ? -1 : 1;
    if (nearCross(z, 14)) continue;
    addStreetLight(colliders, side * (ROAD_HALF + 0.95), z, side === -1);
  }

  for (const sx of SIDE_ROADS) {
    const halfWidth = roadHalfFor(sx);
    for (let z = -half + 70; z <= half - 70; z += 260) {
      if (nearCross(z, 14)) continue;
      addStreetLight(colliders, sx + Math.sign(sx) * (halfWidth + 0.95), z, sx < 0);
    }
  }

  const kioskColors = [0xc74c37, 0x2f7f5b, 0x2f6fa8, 0xd4a12f, 0xa2557e];
  for (const side of [-1, 1]) {
    for (let z = -half + 30; z <= half - 30; z += 58) {
      if (
        inLandmarkZone(z, side, occupancyZones, 6) ||
        nearCross(z, 9) ||
        reservedNear(side * (ROAD_HALF + 2.6), z, 8)
      ) {
        continue;
      }
      addKiosk(
        colliders,
        side * (ROAD_HALF + 2.6),
        z + (rnd() - 0.5) * 10,
        kioskColors[Math.floor(rnd() * kioskColors.length)],
        rnd
      );
    }
    for (let z = -half + 18; z <= half - 18; z += 46) {
      if (
        inLandmarkZone(z, side, occupancyZones, 6) ||
        nearCross(z, 9) ||
        Math.abs(z - FOOTBRIDGE_Z) < 20 ||
        reservedNear(side * (ROAD_HALF + 1.5), z, 6)
      ) {
        continue;
      }
      addBin(colliders, side * (ROAD_HALF + 1.5), z + (rnd() - 0.5) * 8);
    }
  }

  const market = landmarkByName('market');
  const marketFrontX = market.side * BUILD_LINE;
  for (let i = 0; i < 4; i += 1) {
    const stallZ = market.z + (i < 2 ? -6.4 + i * 3.2 : 3.2 + (i - 2) * 3.2);
    box(kioskColors[i % kioskColors.length], 0.85, 2.2, 0.12, 2.4, marketFrontX - market.side * 2.4, 2.35, stallZ);
    box(0x8b6b45, 0.95, 0.12, 2.2, 0.12, marketFrontX - market.side * 3.4, 1.1, stallZ - 1);
    box(0x8b6b45, 0.95, 0.12, 2.2, 0.12, marketFrontX - market.side * 3.4, 1.1, stallZ + 1);
    colliders.push({
      minX: Math.min(marketFrontX - market.side * 3.4, marketFrontX - market.side * 1.4) - 0.1,
      maxX: Math.max(marketFrontX - market.side * 3.4, marketFrontX - market.side * 1.4) + 0.1,
      minZ: stallZ - 1.2,
      maxZ: stallZ + 1.2
    });
  }

  for (const cz of CROSS_ZS) {
    for (const sx of [-SIDE_ROAD_X, SIDE_ROAD_X]) {
      for (const dx of [-1.4, 1.4]) {
        for (const dz of [-1.4, 1.4]) {
          box(0x2b2d30, 0.9, 0.18, 0.02, 0.18, sx + dx, 0.014, cz + dz);
        }
      }
    }
  }

  box(
    0x55595a,
    0.95,
    forecourtWidth,
    forecourtHeight,
    parkingEndZ - parkingStartZ,
    forecourtX,
    forecourtCenterY,
    (parkingStartZ + parkingEndZ) / 2
  );
  // All bays sit north of the cross street; the gap between offsets 20 and 32
  // keeps the garage-lobby doorway at z=31 clear.
  const parkingSpaces: ParkingSpace[] = [8, 14, 20, 32, 38, 44].map((offset) => ({
    x: forecourtX,
    z: garageSite.z + offset,
    yaw: 0,
    surfaceY: forecourtSurfaceY
  }));
  const parkingLineOffsets = [5, 11, 17, 23, 29, 35, 41, 47];
  for (const offset of parkingLineOffsets) {
    box(
      0xe8e2cf,
      0.95,
      forecourtWidth - 0.4,
      0.018,
      0.09,
      forecourtX,
      0.29,
      garageSite.z + offset
    );
  }
  const drivewayZ = garageSite.z;
  box(
    0x55595a,
    0.95,
    garageSidewalkWidth,
    forecourtHeight,
    drivewayEndZ - drivewayStartZ,
    garageSite.side * (ROAD_HALF + 0.3 + garageSidewalkWidth / 2),
    forecourtCenterY,
    drivewayZ
  );
  for (const zOffset of [-3.1, 3.1]) {
    box(
      0xe6c445,
      0.95,
      forecourtWidth - 0.3,
      0.018,
      0.12,
      forecourtX,
      0.3,
      drivewayZ + zOffset
    );
  }
  addSign(group, 'GARAGE DRIVE-IN · PARKING', '#303c3f', '#ffd24a', garageFrontX, 2.1, drivewayZ, -Math.PI / 2, 4.4);

  const fuelSite = sites.find((site) => site.kind === 'fuel');
  if (!fuelSite) throw new Error('Fuel station site is required to build its forecourt');
  const fuelApproach = fuelPumpApproach(fuelSite);
  const fuelCanopyX = fuelApproach.x - fuelSite.side * 2;
  const fuelForecourtRoadEdgeX = fuelSite.side * (ROAD_HALF + 0.3);
  const fuelForecourtWidth = Math.abs(fuelSite.entranceX - fuelForecourtRoadEdgeX);
  const fuelForecourtX = (fuelSite.entranceX + fuelForecourtRoadEdgeX) / 2;
  box(0x5b5e5e, 0.95, fuelForecourtWidth, 0.12, 27, fuelForecourtX, 0.07, fuelSite.z);

  for (const xOffset of [-5.2, 5.2]) {
    for (const zOffset of [-9, 9]) {
      box(0xe4e1d8, 0.9, 0.38, 4.8, 0.38, fuelCanopyX + xOffset, 2.4, fuelSite.z + zOffset);
    }
  }
  box(0xf1eee4, 0.8, 12, 0.42, 21, fuelCanopyX, 5.05, fuelSite.z);
  box(0x167d45, 0.8, 12.35, 0.22, 21.35, fuelCanopyX, 5.37, fuelSite.z);
  box(0xffffff, 0.75, 12.5, 0.12, 21.5, fuelCanopyX, 5.54, fuelSite.z);
  addSign(
    group,
    'NNPC',
    '#167d45',
    '#ffffff',
    fuelCanopyX - fuelSite.side * 6.3,
    5.15,
    fuelSite.z,
    -fuelSite.side * Math.PI / 2,
    4.8
  );

  for (const zOffset of [-4.5, 0, 4.5]) {
    const pumpZ = fuelSite.z + zOffset;
    const pumpX = fuelCanopyX - fuelSite.side * 1.1;
    box(0xaba494, 0.9, 2.8, 0.2, 1.4, pumpX, 0.2, pumpZ);
    box(0xf2f0e8, 0.8, 1.05, 1.65, 0.9, pumpX, 1.12, pumpZ);
    box(
      0x167d45,
      0.75,
      0.08,
      0.38,
      0.54,
      pumpX - fuelSite.side * 0.57,
      1.55,
      pumpZ
    );
    box(0x292d2f, 0.8, 0.08, 0.12, 0.22, pumpX - fuelSite.side * 0.62, 1.15, pumpZ - 0.23);
    colliders.push({
      minX: pumpX - 1.4,
      maxX: pumpX + 1.4,
      minZ: pumpZ - 0.7,
      maxZ: pumpZ + 0.7
    });
    for (const direction of [-1, 1]) {
      box(0xe6c445, 0.8, 0.22, 0.8, 0.22, pumpX + direction * 1.55, 0.48, pumpZ);
    }
  }
  addSign(
    group,
    'FUEL · DIESEL',
    '#26343d',
    '#ffd24a',
    fuelCanopyX - fuelSite.side * 6.2,
    4.05,
    fuelSite.z,
    -fuelSite.side * Math.PI / 2,
    4.2
  );

  // --- Dead-end barriers -------------------------------------------------
  // Every piece of tarmac that stops for good gets a red warning sign and a
  // solid barrier, so nobody drives through empty air or into an invisible
  // wall at the edge of the map.
  const addRoadEnd = (
    x: number,
    z: number,
    across: 'x' | 'z',
    faceYaw: number,
    halfWidth: number,
    baseY = 0,
    /** Extra metres past the kerb so the barrier also closes the pavements. */
    shoulder = 3.2
  ): void => {
    const red = 0xc9342b;
    const white = 0xf0e9db;
    const railHalf = halfWidth + shoulder;
    const spanX = across === 'x' ? railHalf * 2 + 0.9 : 0.7;
    const spanZ = across === 'x' ? 0.7 : railHalf * 2 + 0.9;
    // Concrete kerb under the barrier.
    box(0x6b6f73, 0.95, spanX, 0.28, spanZ, x, baseY + 0.14, z);
    // Chequered red-and-white rail.
    const segments = Math.max(8, Math.round(railHalf / 1.2));
    for (let i = 0; i < segments; i += 1) {
      const t0 = -railHalf + (i / segments) * railHalf * 2;
      const t1 = -railHalf + ((i + 1) / segments) * railHalf * 2;
      const colour = i % 2 === 0 ? red : white;
      const cx = across === 'x' ? x + (t0 + t1) / 2 : x;
      const cz = across === 'x' ? z : z + (t0 + t1) / 2;
      const w = across === 'x' ? Math.abs(t1 - t0) : 0.46;
      const d = across === 'x' ? 0.46 : Math.abs(t1 - t0);
      box(colour, 0.8, w, 0.6, d, cx, baseY + 0.78, cz);
    }
    // End posts.
    for (const side of [-1, 1]) {
      const px = across === 'x' ? x + side * (railHalf + 0.35) : x;
      const pz = across === 'x' ? z : z + side * (railHalf + 0.35);
      box(0x3c4045, 0.85, 0.38, 1.55, 0.38, px, baseY + 0.78, pz);
      box(0xd7c23d, 0.7, 0.46, 0.16, 0.46, px, baseY + 1.6, pz);
    }
    // Big red board facing the traffic that is about to run out of road.
    addSign(
      group,
      'NO ROAD AHEAD',
      '#8a1414',
      '#ffe9e9',
      x + Math.sin(faceYaw) * 0.55,
      baseY + 2.55,
      z + Math.cos(faceYaw) * 0.55,
      faceYaw,
      Math.min(6.6, halfWidth * 1.5)
    );
    colliders.push({
      minX: across === 'x' ? x - railHalf - 0.5 : x - 0.7,
      maxX: across === 'x' ? x + railHalf + 0.5 : x + 0.7,
      minZ: across === 'x' ? z - 0.7 : z - railHalf - 0.5,
      maxZ: across === 'x' ? z + 0.7 : z + railHalf + 0.5
    });
  };

  // Boulevards and avenues run out at the north and south ends of the map.
  for (const roadX of [0, ...SIDE_ROADS]) {
    const halfW = roadX === 0 ? ROAD_HALF : roadHalfFor(roadX);
    const shoulder = roadX === 0 ? 5.2 : 3.6;
    addRoadEnd(roadX, half - 4, 'x', Math.PI, halfW, 0, shoulder);
    addRoadEnd(roadX, -half + 4, 'x', 0, halfW, 0, shoulder);
  }

  // Cross streets stop at the desert on the east and at the west shoreline.
  // The arm that ends at the airport fence gets its barrier there instead.
  for (const cz of CROSS_ZS) {
    if (Math.abs(cz - DESERT_HIGHWAY_Z) > 0.5) {
      addRoadEnd(crossStreetEndX(cz) - 4, cz, 'z', -Math.PI / 2, CROSS_HALF);
    }
    addRoadEnd(WEST_DISTRICT_MIN_X + 4, cz, 'z', Math.PI / 2, CROSS_HALF);
  }

  // Desert highway and frontage road ends.
  addRoadEnd(
    DESERT_HIGHWAY_END_X - 4,
    DESERT_HIGHWAY_Z,
    'z',
    -Math.PI / 2,
    DESERT_HIGHWAY_HALF_WIDTH,
    0,
    1.4
  );
  addRoadEnd(
    DESERT_FRONTAGE_END_X - 4,
    DESERT_FRONTAGE_Z,
    'z',
    -Math.PI / 2,
    DESERT_FRONTAGE_HALF_WIDTH,
    0,
    1.4
  );
  addRoadEnd(
    DESERT_FRONTAGE_START_X + 4,
    DESERT_FRONTAGE_Z,
    'z',
    Math.PI / 2,
    DESERT_FRONTAGE_HALF_WIDTH,
    0,
    1.4
  );

  // The causeway is raised, so its end barriers sit on the deck.
  addRoadEnd(CAUSEWAY_X, half - 4, 'x', Math.PI, CAUSEWAY_HALF_W, CAUSEWAY_DECK_Y, 0.9);
  addRoadEnd(CAUSEWAY_X, -half + 4, 'x', 0, CAUSEWAY_HALF_W, CAUSEWAY_DECK_Y, 0.9);

  // ------------------------------------------------------------------ airport
  // A really big international airport on the east coast, enclosed by a
  // round perimeter fence. Runway, terminal, control tower and hangars.
  {
    const apx = 560;
    const apz = -200;
    const apr = 100;
    const fenceY = 2.6;
    const fenceSegs = 72;

    box(0x9aa0a6, 0.9, apr * 2, 0.15, apr * 2, apx, -0.02, apz, { cast: false });
    contactShadow(apr * 2 + 4, apr * 2 + 4, apx, apz, 0.02);

    for (let i = 0; i < fenceSegs; i += 1) {
      const a0 = (i / fenceSegs) * Math.PI * 2;
      const a1 = ((i + 1) / fenceSegs) * Math.PI * 2;
      const x0 = apx + Math.cos(a0) * apr;
      const z0 = apz + Math.sin(a0) * apr;
      const x1 = apx + Math.cos(a1) * apr;
      const z1 = apz + Math.sin(a1) * apr;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(z1 - z0, x1 - x0);
      box(0x3d444a, 0.9, len, fenceY, 0.14, cx, fenceY / 2, cz, { ry: yaw });
      box(0x2b2d30, 0.9, len, 0.16, 0.14, cx, fenceY + 0.16, cz, { ry: yaw });
      colliders.push({
        minX: Math.min(x0, x1) - 1,
        maxX: Math.max(x0, x1) + 1,
        minZ: Math.min(z0, z1) - 1,
        maxZ: Math.max(z0, z1) + 1
      });
    }

    const gateAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
    for (const ga of gateAngles) {
      const gx = apx + Math.cos(ga) * (apr - 3);
      const gz = apz + Math.sin(ga) * (apr - 3);
      box(0x4a525a, 0.9, 6, fenceY, 0.3, gx, fenceY / 2, gz, { ry: ga });
      box(0x4a525a, 0.9, 6, 0.16, 0.3, gx, fenceY + 0.16, gz, { ry: ga });
    }

    const rwLen = 220;
    const rwW = 42;
    box(0x6d6557, 0.9, rwW, 0.2, rwLen, apx, 0.1, apz, { cast: false });
    box(0x4a525a, 0.9, rwW + 4, 0.12, rwLen + 4, apx, 0.08, apz, { cast: false });
    for (let i = -rwLen / 2 + 12; i < rwLen / 2; i += 16) {
      box(0xf0e6cf, 0.9, 2.6, 0.08, 8, apx, 0.16, apz + i, { cast: false });
    }
    for (let i = -rwLen / 2 + 12; i < rwLen / 2; i += 14) {
      for (const side of [-1, 1]) {
        box(0xfff1c4, 0.4, 0.2, 0.2, 0.2, apx + side * (rwW / 2 + 1.4), 0.38, apz + i, {
          cast: false
        });
      }
    }
    colliders.push({
      minX: apx - rwW / 2 - 2,
      maxX: apx + rwW / 2 + 2,
      minZ: apz - rwLen / 2 - 2,
      maxZ: apz + rwLen / 2 + 2
    });

    box(0x6d6557, 0.9, 20, 0.18, 110, apx - 55, 0.12, apz - 30, { cast: false });
    box(0x6d6557, 0.9, 20, 0.18, 110, apx + 55, 0.12, apz + 30, { cast: false });

    {
      const tw = 48, td = 30, th = 13;
      const tx = apx - 30;
      const tz = apz + 10;
      addBuilding(colliders, buildings, tx, tz, {
        width: tw, depth: td, height: th,
        color: 0xd8c9a8, trim: 0x8a6f3d, side: 0, style: 1
      }, () => 0.5);
      addSign(group, 'INTERNATIONAL TERMINAL', '#1a2744', '#f0d878', tx, th - 1.8, tz, 0, 11);
      for (let i = 0; i < 3; i += 1) {
        const jz = tz - 10 + i * 10;
        box(0x5a6b78, 0.9, 3.6, 3.2, 24, tx - tw / 2 - 12, 4.6, jz, { ry: -Math.PI / 2 });
        box(0x3d444a, 0.9, 4, 0.18, 26, tx - tw / 2 - 13.2, 4.5, jz, { ry: -Math.PI / 2, cast: false });
      }
    }

    {
      const tw = 10, th = 22;
      box(0xb8c4d0, 0.9, tw, th, tw, apx + 22, th / 2, apz - 42);
      box(0x6d6557, 0.9, tw + 2, 0.4, tw + 2, apx + 22, th + 0.2, apz - 42);
      box(0xa8b4c0, 0.6, tw + 3, 2.6, tw + 3, apx + 22, th + 1.4, apz - 42);
      colliders.push({
        minX: apx + 22 - tw / 2 - 1, maxX: apx + 22 + tw / 2 + 1,
        minZ: apz - 42 - tw / 2 - 1, maxZ: apz - 42 + tw / 2 + 1
      });
    }

    {
      const hw = 26, hd = 18, hh = 9;
      for (const hx of [apx + 40, apx + 76]) {
        box(0x9a917f, 0.9, hw, hh, hd, hx, hh / 2, apz + 62, { rx: 0 });
        box(0x7f7767, 0.9, hw, 0.3, hd, hx, hh - 0.15, apz + 62);
        box(0x2b2d30, 0.8, 0.12, 6, 13, hx + hw / 2 - 0.06, hh / 2, apz + 62);
        colliders.push({
          minX: hx - hw / 2, maxX: hx + hw / 2,
          minZ: apz + 62 - hd / 2, maxZ: apz + 62 + hd / 2
        });
      }
    }

    for (let i = 0; i < 4; i += 1) {
      const gx = apx - 18 + i * 9;
      const gz = apz + 42;
      box(0xd4a12f, 0.9, 2.8, 1.8, 4.6, gx, 1, gz);
      box(0x3b4146, 0.9, 2.4, 0.7, 4.2, gx, 1.35, gz);
      colliders.push({ minX: gx - 1.5, maxX: gx + 1.5, minZ: gz - 2.4, maxZ: gz + 2.4 });
    }

    addSign(group, '9JA INTERNATIONAL AIRPORT', '#1b2a33', '#ffd24a', apx - 130, fenceY + 1.4, apz - 130, 0, 13);
  }

  flushBatches(group);
  const nightLights = buildCityNightLights(group);

  const districts: District[] = [
    { name: 'Kano Municipal', x: 0, z: 26, radius: 52 },
    { name: 'Kurmi Market', x: -14, z: -58, radius: 34 },
    { name: 'Sabon Gari', x: 0, z: -118, radius: 44 },
    { name: 'Nassarawa GRA', x: 58, z: 40, radius: 62 },
    { name: 'Fagge', x: -58, z: 30, radius: 58 },
    { name: 'Giginyu', x: 58, z: 128, radius: 54 },
    { name: 'Hotoro', x: 0, z: 150, radius: 36 },
    { name: 'Kurna', x: -52, z: 150, radius: 40 },
    { name: 'Dala', x: 0, z: -152, radius: 32 },
    { name: 'Tarauni', x: 150, z: 300, radius: 110 },
    { name: 'Ungogo', x: -150, z: 320, radius: 120 },
    { name: 'Zaria Road', x: -160, z: -300, radius: 120 },
    { name: 'Gwammaja', x: 150, z: -220, radius: 105 },
    { name: 'Bompai', x: -160, z: -140, radius: 95 },
    { name: 'Sharada', x: 150, z: 120, radius: 100 },
    { name: 'Kofar Wambai', x: 280, z: 0, radius: 90 },
    { name: 'Sabon Gari East', x: 392, z: 60, radius: 120 },
    { name: 'Hotoro East', x: 430, z: 300, radius: 110 },
    { name: 'Rijiyar Lemo', x: 420, z: -300, radius: 120 },
    { name: 'Kurna Asabe', x: 470, z: 140, radius: 100 },
    { name: 'Airport City', x: 560, z: -200, radius: 120 },
    { name: 'Kofar Wambai West', x: -510, z: 0, radius: 125 },
    { name: 'Sahara Highway', x: 900, z: DESERT_HIGHWAY_Z, radius: 360 }
  ];

  const city: City = {
    group,
    colliders,
    buildings,
    roadHalfWidth: ROAD_HALF,
    sidewalkTop: SIDEWALK_TOP,
    minZ: -half,
    maxZ: half,
    worldMinX: WEST_DISTRICT_MIN_X - 140,
    worldMaxX: DESERT_HIGHWAY_END_X + 60,
    worldMinZ: -half - 140,
    worldMaxZ: half + 140,
    landmarks,
    sites,
    districts,
    atms,
    posStands,
    transitStops: busStations,
    railStations,
    parkingSpaces,
    crossZs: CROSS_ZS,
    sideRoads: SIDE_ROADS,
    river: {
      minX: RIVER_MIN_X,
      maxX: RIVER_MAX_X,
      minZ: -half,
      maxZ: half,
      surfaceY: RIVER_SURFACE_Y
    },
    waterAt: (x: number, z: number, axis?: 'x' | 'z', referenceY?: number) => {
      if (
        x >= DESERT_HIGHWAY_START_X &&
        x <= DESERT_HIGHWAY_END_X + 60 &&
        Math.abs(z) <= half + GROUND_EXTRA
      ) return null;
      if (
        isRiverAt(x, z) &&
        !isRoadAt(x, z) &&
        !onRiverBridgeDeck(x, z) &&
        !onJettyDeck(x, z)
      ) {
        return RIVER_SURFACE_Y;
      }
      // Elevated bridge decks stay dry while the water remains below them.
      if (
        x < WEST_SHORE_X &&
        bridgeDeckYAt(x, z, axis ?? 'z', referenceY) === 0 &&
        !isRoadAt(x, z, false) &&
        !onCrossBayBridge(x, z) &&
        !(x >= WEST_DISTRICT_MIN_X && x <= WEST_DISTRICT_MAX_X)
      ) {
        return OCEAN_SURFACE_Y;
      }
      // Ocean beyond the city ground edge, but never across the airport.
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (
        d > WORLD_HALF_X + 140 &&
        d < OCEAN_EDGE &&
        !inAirportGrounds(x, z)
      ) return OCEAN_SURFACE_Y;
      return null;
    },
    update: (dt: number) => {
      waterTexture.offset.y -= dt * 0.014;
      waterTexture.offset.x += dt * 0.0025;
      oceanTexture.offset.y -= dt * 0.006;
      oceanTexture.offset.x += dt * 0.0022;
      for (const boat of oceanBoats) {
        let x = boat.group.position.x + boat.speed * dt * boat.dir;
        if (x > boat.maxX) x = boat.minX;
        else if (x < boat.minX) x = boat.maxX;
        boat.group.position.x = x;
        boat.group.position.y =
          OCEAN_SURFACE_Y + 0.15 + Math.sin((x + boat.baseZ) * 0.12) * 0.06;
        boat.group.rotation.z = Math.sin((x + boat.baseZ) * 0.1) * 0.02;
      }
      for (const boat of boats) {
        const dir = Math.cos(boat.group.rotation.y) >= 0 ? 1 : -1;
        const speed = boat.speed;
        let z = boat.group.position.z + speed * dt * dir;
        if (z > half + 26) z = -half - 26;
        else if (z < -half - 26) z = half + 26;
        boat.group.position.z = z;
        boat.group.position.y = boat.baseY + Math.sin((z + boat.baseZ) * 0.2) * 0.045;
        boat.group.rotation.z = Math.sin((z + boat.baseZ) * 0.16) * 0.015;
      }
    },
    setNightMode: (enabled: boolean) => {
      nightLights.visible = enabled;
    },
    isRoad: isRoadAt,
    groundHeightAt: (x: number, z: number, axis?: 'x' | 'z', referenceY?: number) => {
      for (const station of railStations) {
        if (
          Math.abs(x - station.accessX) <= SUBWAY_STAIR_HALF_WIDTH &&
          z >= station.z + SUBWAY_STAIR_BOTTOM_Z_OFFSET &&
          z <= station.accessZ
        ) {
          const progress = (station.accessZ - z) / (station.accessZ - station.z - SUBWAY_STAIR_BOTTOM_Z_OFFSET);
          return progress * SUBWAY_PLATFORM_HEIGHT;
        }
        if (
          referenceY !== undefined &&
          referenceY < -3.5 &&
          x >= station.x - 10 &&
          x <= station.accessX + SUBWAY_STAIR_HALF_WIDTH &&
          Math.abs(z - station.z) <= 13
        ) return SUBWAY_PLATFORM_HEIGHT;
      }
      const travelAxis = axis ?? 'z';
      const bridge = footbridgeHeightAt(x, z);
      if (
        bridge > 0 &&
        referenceY !== undefined &&
        Math.abs(bridge - referenceY) <= 0.75
      ) return bridge;
      const deck = bridgeDeckYAt(x, z, travelAxis, referenceY);
      if (deck > 0) return deck;
      if (onCrossBayBridge(x, z)) return 0.08;
      if (isRoadAt(x, z)) return 0;
      if (
        x >= DESERT_HIGHWAY_START_X &&
        x <= DESERT_HIGHWAY_END_X + 60 &&
        Math.abs(z) <= half + GROUND_EXTRA
      ) return 0;
      if (onJettyDeck(x, z)) return 0.16;
      if (x < WEST_SHORE_X) {
        return x >= WEST_DISTRICT_MIN_X && x <= WEST_DISTRICT_MAX_X
          ? SIDEWALK_TOP
          : OCEAN_SURFACE_Y;
      }
      // Ocean: water surface for swimming beyond the ground edge. The airport
      // apron is dry land even though it sits past the nominal world edge.
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (
        d > WORLD_HALF_X + 140 &&
        d < OCEAN_EDGE &&
        !inAirportGrounds(x, z)
      ) return OCEAN_SURFACE_Y;
      return SIDEWALK_TOP;
    },
    deckHeightAt: bridgeDeckYAt,
    districtAt: (x: number, z: number) => {
      let best = districts[0];
      let bestDistance = Infinity;
      for (const d of districts) {
        const distance = Math.hypot(x - d.x, z - d.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = d;
        }
      }
      return best.name;
    }
  };

  return city;
}
