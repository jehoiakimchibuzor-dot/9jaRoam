import * as THREE from 'three';
import {
  City,
  CAUSEWAY_X,
  CROSS_HALF,
  CROSS_ZS,
  FAR_HALF,
  FAR_ROAD_X,
  OUTER_HALF,
  OUTER_ROAD_X,
  ROAD_HALF,
  ROAD_LENGTH,
  roadHalfFor,
  DESERT_FRONTAGE_END_X,
  DESERT_FRONTAGE_START_X,
  DESERT_FRONTAGE_Z,
  DESERT_HIGHWAY_END_X,
  DESERT_HIGHWAY_START_X,
  DESERT_HIGHWAY_Z,
  SIDE_HALF,
  SIDE_ROAD_X,
  SIDE_ROADS,
  WEST_DISTRICT_MIN_X,
  WORLD_HALF_X
} from '../world/City';
import {
  VehicleRig,
  createBike,
  createDanfo,
  createKeke,
  createLuxuryCar,
  createSedan,
  createSportCar,
  ensureVehicleHealth,
  setVehicleNightLighting,
  vehicleOverlap
} from './Vehicle';
import { IS_ANDROID } from '../platform';

type TrafficKind = 'danfo' | 'sedan' | 'keke' | 'bike' | 'sport' | 'luxury';
export type Axis = 'z' | 'x';
export type Signal = 'green' | 'yellow' | 'red';

export interface SignalInfo {
  state: Signal;
  axis: Axis;
  remaining: number;
  distance: number;
  x: number;
  z: number;
}

interface TrafficVehicle {
  id: number;
  kind: TrafficKind;
  rig: VehicleRig;
  axis: Axis;
  fixed: number;
  dir: 1 | -1;
  cruise: number;
  speed: number;
  along: number;
  min: number;
  max: number;
  stop: number;
  visible: boolean;
  wreckedAt: number;
  frontier?: boolean;
}

interface SpawnSpec {
  kind: TrafficKind;
  color?: number;
  axis: Axis;
  fixed: number;
  dir: 1 | -1;
  along: number;
  cruise: number;
  min?: number;
  max?: number;
  frontier?: boolean;
}

// --- Road geometry -------------------------------------------------------
const Z_LIMIT = ROAD_LENGTH / 2 - 12;
const X_LIMIT = WORLD_HALF_X - 8;
// Cross-street traffic turns back at the west shoreline, where the land ends.
const X_MIN = WEST_DISTRICT_MIN_X + CROSS_HALF;
const MAIN_OUTER = ROAD_HALF * 0.75; // 8.25 on a 22 m boulevard
const MAIN_INNER = ROAD_HALF * 0.25; // 2.75
const SIDE_LANE = SIDE_HALF * 0.5; // 4.5 on an 18 m avenue
const OUTER_LANE = OUTER_HALF * 0.5; // 4 on a 16 m ring road
const FAR_LANE = FAR_HALF * 0.5; // the outermost ring
const CROSS_LANE = CROSS_HALF * 0.5; // 4.5

const VIEW_DISTANCE = IS_ANDROID ? 100 : 140;
// Only the boulevard crossings carry signal heads. Avenue junctions are
// priority junctions: cross-street traffic gives way to avenue traffic.
const SIGNAL_XS = [0];

const SEDAN_COLORS = [0xe6e2d8, 0x2f5d9e, 0xa83a32, 0x4a6f5a, 0x9aa0a6, 0xd9d4c8, 0x8b5a2b];
const SPORT_COLORS = [0xe03a2f, 0xffb31a, 0x1f9e6e, 0x2f6fd0, 0xf2f0e6, 0x8a2be2];
const LUXURY_COLORS = [0x11151c, 0xf1eee6, 0x263e52, 0x472d2d];

const SPAWNS: SpawnSpec[] = [
  // Boulevard, northbound (negative x side).
  { kind: 'danfo', axis: 'z', fixed: -MAIN_OUTER, dir: 1, along: -210, cruise: 9.4 },
  { kind: 'sport', color: SPORT_COLORS[0], axis: 'z', fixed: -MAIN_INNER, dir: 1, along: -150, cruise: 18.5 },
  { kind: 'sedan', color: SEDAN_COLORS[3], axis: 'z', fixed: -MAIN_OUTER, dir: 1, along: -40, cruise: 12.4 },
  { kind: 'bike', color: 0xc23b2e, axis: 'z', fixed: -MAIN_INNER, dir: 1, along: 60, cruise: 15.5 },
  { kind: 'keke', axis: 'z', fixed: -MAIN_OUTER, dir: 1, along: 160, cruise: 9.2 },
  { kind: 'sport', color: SPORT_COLORS[1], axis: 'z', fixed: -MAIN_INNER, dir: 1, along: 270, cruise: 19.5 },
  // Boulevard, southbound (positive x side).
  { kind: 'sedan', color: SEDAN_COLORS[2], axis: 'z', fixed: MAIN_INNER, dir: -1, along: -260, cruise: 12.8 },
  { kind: 'danfo', axis: 'z', fixed: MAIN_OUTER, dir: -1, along: -130, cruise: 9 },
  { kind: 'sport', color: SPORT_COLORS[2], axis: 'z', fixed: MAIN_INNER, dir: -1, along: -20, cruise: 18 },
  { kind: 'bike', color: 0x2f6fa8, axis: 'z', fixed: MAIN_OUTER, dir: -1, along: 90, cruise: 15.2 },
  { kind: 'sedan', color: SEDAN_COLORS[0], axis: 'z', fixed: MAIN_INNER, dir: -1, along: 200, cruise: 12.2 },
  { kind: 'keke', axis: 'z', fixed: MAIN_OUTER, dir: -1, along: 310, cruise: 8.8 },
  { kind: 'luxury', color: LUXURY_COLORS[0], axis: 'z', fixed: -MAIN_INNER, dir: 1, along: -90, cruise: 15.8 },
  { kind: 'luxury', color: LUXURY_COLORS[1], axis: 'z', fixed: MAIN_INNER, dir: -1, along: 360, cruise: 16.4 },

  // Western avenue at x = -64.
  { kind: 'sedan', color: SEDAN_COLORS[4], axis: 'z', fixed: -SIDE_ROAD_X - SIDE_LANE, dir: 1, along: -300, cruise: 12 },
  { kind: 'keke', axis: 'z', fixed: -SIDE_ROAD_X + SIDE_LANE, dir: -1, along: -190, cruise: 8.7 },
  { kind: 'bike', color: 0xd4a12f, axis: 'z', fixed: -SIDE_ROAD_X - SIDE_LANE, dir: 1, along: -20, cruise: 14.8 },
  { kind: 'danfo', axis: 'z', fixed: -SIDE_ROAD_X + SIDE_LANE, dir: -1, along: 130, cruise: 9.1 },

  // Eastern avenue at x = 64.
  { kind: 'sport', color: SPORT_COLORS[3], axis: 'z', fixed: SIDE_ROAD_X - SIDE_LANE, dir: 1, along: -330, cruise: 19 },
  { kind: 'luxury', color: LUXURY_COLORS[2], axis: 'z', fixed: SIDE_ROAD_X - SIDE_LANE, dir: 1, along: 30, cruise: 16.2 },
  { kind: 'sedan', color: SEDAN_COLORS[6], axis: 'z', fixed: SIDE_ROAD_X + SIDE_LANE, dir: -1, along: -210, cruise: 12.5 },
  { kind: 'keke', axis: 'z', fixed: SIDE_ROAD_X - SIDE_LANE, dir: 1, along: -70, cruise: 8.9 },
  { kind: 'sedan', color: SEDAN_COLORS[1], axis: 'z', fixed: SIDE_ROAD_X + SIDE_LANE, dir: -1, along: 110, cruise: 12.1 },
  { kind: 'bike', color: 0x2f7f5b, axis: 'z', fixed: SIDE_ROAD_X - SIDE_LANE, dir: 1, along: 250, cruise: 15 },

  // Outer ring roads.
  { kind: 'sedan', color: SEDAN_COLORS[5], axis: 'z', fixed: -OUTER_ROAD_X - OUTER_LANE, dir: 1, along: -280, cruise: 13 },
  { kind: 'keke', axis: 'z', fixed: -OUTER_ROAD_X + OUTER_LANE, dir: -1, along: -60, cruise: 9 },
  { kind: 'danfo', axis: 'z', fixed: OUTER_ROAD_X + OUTER_LANE, dir: -1, along: 40, cruise: 9.3 },
  { kind: 'sport', color: SPORT_COLORS[4], axis: 'z', fixed: OUTER_ROAD_X - OUTER_LANE, dir: 1, along: 220, cruise: 18.8 },

  // Cross streets.
  { kind: 'sedan', color: SEDAN_COLORS[2], axis: 'x', fixed: CROSS_ZS[1] + CROSS_LANE, dir: 1, along: -110, cruise: 12.6 },
  { kind: 'keke', axis: 'x', fixed: CROSS_ZS[1] - CROSS_LANE, dir: -1, along: 90, cruise: 8.6 },
  { kind: 'sport', color: SPORT_COLORS[5], axis: 'x', fixed: CROSS_ZS[4] + CROSS_LANE, dir: 1, along: 40, cruise: 18.2 },
  { kind: 'danfo', axis: 'x', fixed: CROSS_ZS[4] - CROSS_LANE, dir: -1, along: -70, cruise: 9.1 },
  { kind: 'bike', color: 0xc23b2e, axis: 'x', fixed: CROSS_ZS[6] + CROSS_LANE, dir: 1, along: -130, cruise: 14.6 },
  { kind: 'sedan', color: SEDAN_COLORS[0], axis: 'x', fixed: CROSS_ZS[6] - CROSS_LANE, dir: -1, along: 120, cruise: 12.3 },
  { kind: 'danfo', axis: 'z', fixed: -484, dir: 1, along: -100, cruise: 9.1 },
  { kind: 'sedan', color: SEDAN_COLORS[5], axis: 'z', fixed: -476, dir: -1, along: 240, cruise: 12.5 },
  { kind: 'luxury', color: LUXURY_COLORS[3], axis: 'z', fixed: -412, dir: 1, along: 30, cruise: 16.8 },
  { kind: 'keke', axis: 'z', fixed: -404, dir: -1, along: -250, cruise: 8.6 },
  { kind: 'sedan', color: SEDAN_COLORS[1], axis: 'x', fixed: CROSS_ZS[3] + CROSS_LANE, dir: 1, along: -440, cruise: 12.2 },
  { kind: 'luxury', color: LUXURY_COLORS[1], axis: 'z', fixed: -624 - SIDE_LANE, dir: 1, along: -200, cruise: 16.1 },
  { kind: 'sport', color: SPORT_COLORS[2], axis: 'z', fixed: -624 + SIDE_LANE, dir: -1, along: 180, cruise: 18.2 },
  { kind: 'danfo', axis: 'z', fixed: -552 - SIDE_LANE, dir: 1, along: 320, cruise: 9.2 },
  { kind: 'sedan', color: SEDAN_COLORS[4], axis: 'z', fixed: -552 + SIDE_LANE, dir: -1, along: -320, cruise: 12.4 },
  { kind: 'sedan', color: SEDAN_COLORS[0], axis: 'x', fixed: CROSS_ZS[2] + CROSS_LANE, dir: 1, along: -500, cruise: 12.5 },
  { kind: 'keke', axis: 'x', fixed: CROSS_ZS[4] - CROSS_LANE, dir: -1, along: -560, cruise: 8.8 },

  // Extra boulevard traffic for the longer city.
  { kind: 'danfo', axis: 'z', fixed: -MAIN_INNER, dir: 1, along: -360, cruise: 8.9 },
  { kind: 'sedan', color: SEDAN_COLORS[1], axis: 'z', fixed: -MAIN_OUTER, dir: 1, along: 420, cruise: 12.7 },
  { kind: 'bike', color: 0x2f7f5b, axis: 'z', fixed: -MAIN_INNER, dir: 1, along: 350, cruise: 15.4 },
  { kind: 'keke', axis: 'z', fixed: MAIN_INNER, dir: -1, along: -400, cruise: 8.6 },
  { kind: 'sport', color: SPORT_COLORS[1], axis: 'z', fixed: MAIN_OUTER, dir: -1, along: 450, cruise: 19.2 },
  { kind: 'sedan', color: SEDAN_COLORS[3], axis: 'z', fixed: MAIN_INNER, dir: -1, along: 300, cruise: 12.6 },

  // More avenue traffic.
  { kind: 'sport', color: SPORT_COLORS[0], axis: 'z', fixed: -SIDE_ROAD_X - SIDE_LANE, dir: 1, along: 320, cruise: 18.4 },
  { kind: 'sedan', color: SEDAN_COLORS[5], axis: 'z', fixed: -SIDE_ROAD_X + SIDE_LANE, dir: -1, along: -360, cruise: 12.2 },
  { kind: 'danfo', axis: 'z', fixed: SIDE_ROAD_X - SIDE_LANE, dir: 1, along: 400, cruise: 9.2 },
  { kind: 'keke', axis: 'z', fixed: SIDE_ROAD_X + SIDE_LANE, dir: -1, along: -420, cruise: 8.7 },

  // Outer and far ring roads.
  { kind: 'bike', color: 0xd4a12f, axis: 'z', fixed: -OUTER_ROAD_X - OUTER_LANE, dir: 1, along: 200, cruise: 15.3 },
  { kind: 'sedan', color: SEDAN_COLORS[4], axis: 'z', fixed: OUTER_ROAD_X + OUTER_LANE, dir: -1, along: -220, cruise: 12.8 },
  { kind: 'sedan', color: SEDAN_COLORS[6], axis: 'z', fixed: -FAR_ROAD_X - FAR_LANE, dir: 1, along: -240, cruise: 12.9 },
  { kind: 'keke', axis: 'z', fixed: -FAR_ROAD_X + FAR_LANE, dir: -1, along: 160, cruise: 8.8 },
  { kind: 'danfo', axis: 'z', fixed: FAR_ROAD_X + FAR_LANE, dir: -1, along: -320, cruise: 9.3 },
  { kind: 'sport', color: SPORT_COLORS[2], axis: 'z', fixed: FAR_ROAD_X - FAR_LANE, dir: 1, along: 340, cruise: 18.6 },

  // More cross-town traffic.
  { kind: 'sedan', color: SEDAN_COLORS[2], axis: 'x', fixed: CROSS_ZS[2] + CROSS_LANE, dir: 1, along: 150, cruise: 12.4 },
  { kind: 'bike', color: 0x2f6fa8, axis: 'x', fixed: CROSS_ZS[5] - CROSS_LANE, dir: -1, along: -160, cruise: 15.1 },
  { kind: 'danfo', axis: 'x', fixed: CROSS_ZS[3] + CROSS_LANE, dir: 1, along: -20, cruise: 9 },
  { kind: 'sedan', color: SEDAN_COLORS[0], axis: 'x', fixed: CROSS_ZS[6] - CROSS_LANE, dir: -1, along: 180, cruise: 12.2 },

  // West-bay causeway: traffic climbs the approaches and runs the length of
  // the bridge over open water.
  { kind: 'danfo', axis: 'z', fixed: CAUSEWAY_X - 3.4, dir: 1, along: -260, cruise: 9.6 },
  { kind: 'sedan', color: SEDAN_COLORS[3], axis: 'z', fixed: CAUSEWAY_X + 3.4, dir: -1, along: 140, cruise: 12.8 },
  { kind: 'keke', axis: 'z', fixed: CAUSEWAY_X - 3.4, dir: 1, along: 300, cruise: 8.8 },
  { kind: 'bike', color: 0xd4a12f, axis: 'z', fixed: CAUSEWAY_X + 3.4, dir: -1, along: -80, cruise: 14.6 },

  // The desert highway is deliberately quiet: a handful of vehicles drive
  // its remote route instead of the busy city streets.
  { kind: 'sedan', color: SEDAN_COLORS[5], axis: 'x', fixed: DESERT_HIGHWAY_Z - 4.5, dir: 1, along: 650, cruise: 19, min: DESERT_HIGHWAY_START_X + 18, max: DESERT_HIGHWAY_END_X - 18, frontier: true },
  { kind: 'sport', color: SPORT_COLORS[1], axis: 'x', fixed: DESERT_HIGHWAY_Z + 4.5, dir: -1, along: 880, cruise: 22, min: DESERT_HIGHWAY_START_X + 18, max: DESERT_HIGHWAY_END_X - 18, frontier: true },
  { kind: 'danfo', axis: 'x', fixed: DESERT_HIGHWAY_Z - 4.5, dir: 1, along: 1100, cruise: 15, min: DESERT_HIGHWAY_START_X + 18, max: DESERT_HIGHWAY_END_X - 18, frontier: true },
  { kind: 'keke', axis: 'x', fixed: DESERT_FRONTAGE_Z - 3.4, dir: 1, along: 760, cruise: 9.4, min: DESERT_FRONTAGE_START_X + 16, max: DESERT_FRONTAGE_END_X - 16, frontier: true },
  { kind: 'sedan', color: SEDAN_COLORS[2], axis: 'x', fixed: DESERT_FRONTAGE_Z + 3.4, dir: -1, along: 1050, cruise: 13.2, min: DESERT_FRONTAGE_START_X + 16, max: DESERT_FRONTAGE_END_X - 16, frontier: true }
];

interface LaneSpec {
  axis: Axis;
  fixed: number;
  dir: 1 | -1;
}

const LANES: LaneSpec[] = [];
{
  // Boulevard: left half northbound, right half southbound.
  for (const fixed of [-MAIN_OUTER, -MAIN_INNER]) LANES.push({ axis: 'z', fixed, dir: 1 });
  for (const fixed of [MAIN_INNER, MAIN_OUTER]) LANES.push({ axis: 'z', fixed, dir: -1 });
  // Every avenue and ring road, both carriageways.
  for (const road of SIDE_ROADS) {
    const lane = roadHalfFor(road) * 0.5;
    LANES.push({ axis: 'z', fixed: road - lane, dir: 1 });
    LANES.push({ axis: 'z', fixed: road + lane, dir: -1 });
  }
  // Cross streets: both directions in both lanes.
  for (const crossZ of CROSS_ZS) {
    LANES.push({ axis: 'x', fixed: crossZ + CROSS_LANE, dir: 1 });
    LANES.push({ axis: 'x', fixed: crossZ - CROSS_LANE, dir: -1 });
  }
}

const INTERSECTIONS: Array<{ x: number; z: number }> = [];
for (const cz of CROSS_ZS) {
  for (const ix of SIGNAL_XS) INTERSECTIONS.push({ x: ix, z: cz });
}

const CYCLE = 24;
const LIGHT_ON = {
  red: new THREE.Color(0xff3322),
  yellow: new THREE.Color(0xffc020),
  green: new THREE.Color(0x2ce06a)
};
const LIGHT_OFF = {
  red: new THREE.Color(0x3a100c),
  yellow: new THREE.Color(0x3a2c08),
  green: new THREE.Color(0x0b3a17)
};

export class Traffic {
  readonly list: TrafficVehicle[] = [];
  readonly lightGroup = new THREE.Group();
  onCrash: ((position: THREE.Vector3, speed: number) => void) | null = null;
  onWreck: ((position: THREE.Vector3, yaw: number) => void) | null = null;
  private elapsed = 0;
  private nextId = 1;
  private lightsBuilt = false;
  private lastLightKey = '';
  private lightZ: Signal = 'green';
  private lightX: Signal = 'red';
  private lensMesh: THREE.InstancedMesh | null = null;
  private headPositions: Array<{ x: number; y: number; z: number }> = [];
  private streetLampPositions: THREE.Vector3[] = [];
  private streetLampLights: THREE.PointLight[] = [];
  private streetLampBulbs: THREE.InstancedMesh | null = null;
  private streetLampPools: THREE.InstancedMesh | null = null;
  private streetLightTimer = 0;
  private nightMode = false;
  private crashCooldown = 0;
  private readonly recycleDistance = IS_ANDROID ? 235 : 300;

  constructor(scene: THREE.Scene, private city: City, limit = SPAWNS.length) {
    // Keep the full mix on every platform: an even stride covers boulevard,
    // avenues, ring roads and cross streets instead of only the first few.
    const chosen =
      limit >= SPAWNS.length
        ? SPAWNS
        : Array.from(
            { length: limit },
            (_, i) => SPAWNS[Math.floor((i * SPAWNS.length) / limit)]
          );
    const mainBridgeLane = SPAWNS.find(
      (spec) => spec.axis === 'x' && spec.fixed === CROSS_ZS[2] + CROSS_LANE
    );
    if (chosen.length > 0 && mainBridgeLane && !chosen.includes(mainBridgeLane)) {
      chosen[chosen.length - 1] = mainBridgeLane;
    }
    for (const spec of SPAWNS) {
      if (spec.frontier && !chosen.includes(spec)) chosen.push(spec);
    }
    for (const spec of chosen) {
      let rig: VehicleRig;
      if (spec.kind === 'danfo') rig = createDanfo();
      else if (spec.kind === 'keke') rig = createKeke();
      else if (spec.kind === 'bike') rig = createBike(spec.color);
      else if (spec.kind === 'sport') rig = createSportCar(spec.color);
      else if (spec.kind === 'luxury') rig = createLuxuryCar(spec.color);
      else rig = createSedan(spec.color);

      if (rig.driver) rig.driver.visible = true;
      ensureVehicleHealth(rig);

      const axisLength = spec.axis === 'z' ? Z_LIMIT : X_LIMIT;
      if (spec.axis === 'z') {
        rig.group.position.set(spec.fixed, this.city.deckHeightAt(spec.fixed, spec.along, 'z'), spec.along);
        rig.group.rotation.y = spec.dir === 1 ? 0 : Math.PI;
      } else {
        rig.group.position.set(spec.along, this.city.deckHeightAt(spec.along, spec.fixed, 'x'), spec.fixed);
        rig.group.rotation.y = spec.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      }
      scene.add(rig.group);

      this.list.push({
        id: this.nextId,
        kind: spec.kind,
        rig,
        axis: spec.axis,
        fixed: spec.fixed,
        dir: spec.dir,
        cruise: spec.cruise,
        speed: spec.cruise,
        along: spec.along,
        min: spec.min ?? (spec.axis === 'z' ? -axisLength : X_MIN),
        max: spec.max ?? axisLength,
        stop: 0,
        visible: true,
        wreckedAt: -1,
        frontier: spec.frontier
      });
      this.nextId += 1;
    }

    this.buildTrafficLights(scene);
    this.buildStreetLights(scene);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3 | null,
    playerCar: VehicleRig | null,
    playerCarSpeed: number,
    playerCarYaw: number,
    parkedVehicles: readonly VehicleRig[] = [],
    nightMode = false
  ): void {
    this.elapsed += dt;
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    this.updateLightState();
    if (nightMode !== this.nightMode) this.setNightMode(nightMode);
    this.streetLightTimer -= dt;
    if (this.streetLightTimer <= 0) {
      this.streetLightTimer = 0.4;
      this.updateStreetLights(playerPos);
    }

    for (const v of this.list) {
      if (playerPos) {
        const distance = Math.hypot(
          v.rig.group.position.x - playerPos.x,
          v.rig.group.position.z - playerPos.z
        );
        if (distance > this.recycleDistance && !v.frontier) {
          this.recycle(v, playerPos);
        }
      }

      if (v.rig.wrecked) {
        v.speed = 0;
        v.stop = 0;
        this.updateWreck(v);
        const distance = playerPos
          ? Math.hypot(v.rig.group.position.x - playerPos.x, v.rig.group.position.z - playerPos.z)
          : 0;
        v.visible = distance < VIEW_DISTANCE;
        v.rig.group.visible = v.visible;
        continue;
      }

      let target = v.cruise;

      // Keep distance from the car directly ahead in the same lane.
      for (const other of this.list) {
        if (other === v || other.axis !== v.axis || other.dir !== v.dir) continue;
        if (Math.abs(other.fixed - v.fixed) > 2.1) continue;
        const gap = (other.along - v.along) * v.dir;
        if (gap > 0 && gap < 18) {
          target = Math.min(target, v.cruise * clamp01((gap - 6.4) / 14));
        }
      }

      const obstacle = playerCar?.group.position ?? playerPos;
      if (obstacle) {
        const obstacleAlong = v.axis === 'z' ? obstacle.z : obstacle.x;
        const obstacleFixed = v.axis === 'z' ? obstacle.x : obstacle.z;
        const playerFixedRadius = playerCar
          ? v.axis === 'z'
            ? (
                playerCar.width * Math.abs(Math.cos(playerCarYaw)) +
                playerCar.length * Math.abs(Math.sin(playerCarYaw))
              ) / 2
            : (
                playerCar.width * Math.abs(Math.sin(playerCarYaw)) +
                playerCar.length * Math.abs(Math.cos(playerCarYaw))
              ) / 2
          : 0.7;
        const playerOnSameLevel =
          !playerCar ||
          Math.abs(v.rig.group.position.y - playerCar.group.position.y) <= 2.2;
        if (
          playerOnSameLevel &&
          Math.abs(obstacleFixed - v.fixed) < v.rig.width / 2 + playerFixedRadius + 0.45
        ) {
          const gap = (obstacleAlong - v.along) * v.dir;
          const playerAlongRadius = playerCar
            ? v.axis === 'z'
              ? (
                  playerCar.width * Math.abs(Math.sin(playerCarYaw)) +
                  playerCar.length * Math.abs(Math.cos(playerCarYaw))
                ) / 2
              : (
                  playerCar.width * Math.abs(Math.cos(playerCarYaw)) +
                  playerCar.length * Math.abs(Math.sin(playerCarYaw))
                ) / 2
            : 2.2;
          const stopGap = v.rig.length / 2 + playerAlongRadius + 1.2;
          if (gap > 0 && gap < stopGap + 10) {
            target = Math.min(target, v.cruise * clamp01((gap - stopGap) / 10));
          }
        }
        for (const parked of parkedVehicles) {
          if (parked.wrecked) continue;
          const fixed = v.axis === 'z' ? parked.group.position.x : parked.group.position.z;
          if (Math.abs(fixed - v.fixed) > (v.rig.width + parked.width) / 2 + 0.6) continue;
          const along = v.axis === 'z' ? parked.group.position.z : parked.group.position.x;
          const parkedLengthAxis = Math.abs(Math.sin(parked.group.rotation.y)) > 0.7
            ? parked.width
            : parked.length;
          const gap = (along - v.along) * v.dir - (v.rig.length + parkedLengthAxis) / 2 - 1;
          if (gap > 0 && gap < 22) {
            target = Math.min(target, v.cruise * clamp01(gap / 16));
          }
        }
      }

      let hardCap = Infinity;
      const elevatedCrossing =
        v.axis === 'x' && this.city.deckHeightAt(0, v.fixed, 'x') > 2.2;
      const junction = elevatedCrossing ? null : this.junctionAhead(v);
      if (junction !== null && this.obeysSignals(v)) {
        const halfLength = v.rig.length / 2;
        const stopCentre = junction - v.dir * (CROSS_HALF + 1.9 + halfLength);
        const gap = (stopCentre - v.along) * v.dir;
        const signal = this.signalFor(v.axis);

        if (gap > -0.6 && (signal === 'red' || signal === 'yellow')) {
          // Yellow: only stop when there is room to brake smoothly.
          const shouldStop = signal === 'red' || gap > 3.5;
          if (shouldStop) {
            // Kinematic cap so a car never overshoots the stop line.
            hardCap = Math.sqrt(2 * 6.5 * Math.max(0, gap));
            target = Math.min(target, Math.max(0, gap * 1.35));
          }
        }

        if (signal === 'green' && gap > -CROSS_HALF && gap < 22) {
          const busy = this.list.some(
            (other) =>
              other !== v &&
              other.axis !== v.axis &&
              Math.abs(other.along - junction) < CROSS_HALF + 4 &&
              other.speed > 1.2
          );
          if (busy && gap > 3) {
            target = Math.min(target, v.cruise * clamp01((gap - 2.5) / 12));
          }
        }
      } else if (junction !== null && v.axis === 'x') {
        // Priority junction: cross-street traffic gives way to the avenue.
        const halfWidth = junction === 0 ? ROAD_HALF : roadHalfFor(junction);
        const setback = junction === 0 ? 6.1 : 2.4;
        const stopCentre = junction - v.dir * (halfWidth + setback + v.rig.length / 2);
        const gap = (stopCentre - v.along) * v.dir;
        if (gap > -0.6 && gap < 30 && this.avenueTrafficNear(junction, v)) {
          hardCap = Math.sqrt(2 * 6.5 * Math.max(0, gap));
          target = Math.min(target, Math.max(0, gap * 1.2));
        }
      }

      if (v.stop > 0) {
        v.stop -= dt;
        target = 0;
      }

      const rate = target < v.speed ? 4.6 : 1.8;
      v.speed += (target - v.speed) * (1 - Math.exp(-rate * dt));
      v.speed = Math.max(0, Math.min(v.speed, hardCap));

      v.along += v.dir * v.speed * dt;
      if (v.along > v.max) v.along = v.min + 2;
      else if (v.along < v.min) v.along = v.max - 2;

      if (v.axis === 'z') {
        v.rig.group.position.set(
          v.fixed,
          this.city.deckHeightAt(v.fixed, v.along, 'z', v.rig.group.position.y),
          v.along
        );
        v.rig.group.rotation.y = v.dir === 1 ? 0 : Math.PI;
      } else {
        v.rig.group.position.set(
          v.along,
          this.city.deckHeightAt(v.along, v.fixed, 'x', v.rig.group.position.y),
          v.fixed
        );
        v.rig.group.rotation.y = v.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      }

      const distance = playerPos
        ? Math.hypot(v.rig.group.position.x - playerPos.x, v.rig.group.position.z - playerPos.z)
        : 0;
      v.visible = distance < VIEW_DISTANCE;
      v.rig.group.visible = v.visible;

      if (v.visible) {
        for (const spinner of v.rig.spinners) {
          spinner.rotation.x += (v.dir * v.speed) / v.rig.wheelRadius * dt;
        }
      }
    }

    this.resolveCollisions();
    this.resolveParkedCollisions(parkedVehicles);
    this.resolvePlayerCollision(playerCar, playerCarSpeed, playerCarYaw);
  }

  private resolvePlayerCollision(
    playerCar: VehicleRig | null,
    playerCarSpeed: number,
    playerCarYaw: number
  ): void {
    if (!playerCar) return;
    const player = playerCar.group.position;
    const playerVx = Math.sin(playerCarYaw) * playerCarSpeed;
    const playerVz = Math.cos(playerCarYaw) * playerCarSpeed;
    for (const traffic of this.list) {
      if (traffic.rig.wrecked) continue;
      const car = traffic.rig.group.position;
      if (Math.abs(car.y - player.y) > 2.2) continue;
      const overlap = vehicleOverlap(
        car,
        traffic.rig.group.rotation.y,
        traffic.rig.width,
        traffic.rig.length,
        player,
        playerCarYaw,
        playerCar.width,
        playerCar.length
      );
      if (!overlap) continue;

      const trafficVx = traffic.axis === 'x' ? traffic.dir * traffic.speed : 0;
      const trafficVz = traffic.axis === 'z' ? traffic.dir * traffic.speed : 0;
      const closing = Math.hypot(playerVx - trafficVx, playerVz - trafficVz);
      const alongDelta = traffic.axis === 'x' ? car.x - player.x : car.z - player.z;
      const trafficAlongRadius = traffic.rig.length / 2;
      const playerAlongRadius = traffic.axis === 'x'
        ? (
            playerCar.width * Math.abs(Math.cos(playerCarYaw)) +
            playerCar.length * Math.abs(Math.sin(playerCarYaw))
          ) / 2
        : (
            playerCar.width * Math.abs(Math.sin(playerCarYaw)) +
            playerCar.length * Math.abs(Math.cos(playerCarYaw))
          ) / 2;
      const separation = trafficAlongRadius + playerAlongRadius - Math.abs(alongDelta) + 0.04;
      const sign = alongDelta === 0 ? -traffic.dir : Math.sign(alongDelta);
      traffic.along += sign * Math.max(separation, overlap.depth * 0.35);
      traffic.speed = 0;
      traffic.stop = Math.max(traffic.stop, 0.8);
      this.place(traffic);

      if (closing > 3 && this.crashCooldown <= 0) {
        this.crashCooldown = 0.3;
        this.damage(traffic.rig, Math.min(12, Math.max(0.35, (closing - 5.5) * 0.24)));
        this.onCrash?.(
          new THREE.Vector3(
            (car.x + player.x) / 2,
            Math.max(car.y, player.y) + 0.8,
            (car.z + player.z) / 2
          ),
          closing
        );
      }
    }
  }

  private resolveParkedCollisions(parkedVehicles: readonly VehicleRig[]): void {
    for (const traffic of this.list) {
      if (traffic.rig.wrecked) continue;
      for (const parked of parkedVehicles) {
        if (Math.abs(traffic.rig.group.position.y - parked.group.position.y) > 2.2) continue;
        const overlap = vehicleOverlap(
          traffic.rig.group.position,
          traffic.rig.group.rotation.y,
          traffic.rig.width,
          traffic.rig.length,
          parked.group.position,
          parked.group.rotation.y,
          parked.width,
          parked.length
        );
        if (!overlap) continue;

        traffic.rig.group.position.x += overlap.normalX * (overlap.depth + 0.03);
        traffic.rig.group.position.z += overlap.normalZ * (overlap.depth + 0.03);
        this.place(traffic);
        const impactSpeed = traffic.speed;
        traffic.speed = Math.min(traffic.speed, 0.5);
        traffic.stop = Math.max(traffic.stop, 0.8);
        if (impactSpeed > 3 && this.crashCooldown <= 0) {
          this.crashCooldown = 0.35;
          const damage = Math.min(14, Math.max(0.35, (impactSpeed - 3.5) * 0.32));
          this.damage(traffic.rig, damage);
          this.damage(parked, damage);
          this.onCrash?.(
            new THREE.Vector3(
              (traffic.rig.group.position.x + parked.group.position.x) / 2,
              Math.max(traffic.rig.group.position.y, parked.group.position.y) + 0.8,
              (traffic.rig.group.position.z + parked.group.position.z) / 2
            ),
            impactSpeed
          );
        }
      }
    }
  }

  /**
   * Applies crash damage to any traffic rig. Returns true when this hit
   * wrecked the vehicle so the caller can play audio/particles once.
   */
  damage(rig: VehicleRig, amount: number): boolean {
    ensureVehicleHealth(rig);
    if (rig.wrecked) return false;
    rig.health = Math.max(0, (rig.health ?? 0) - amount);
    if (rig.health > 0) return false;
    rig.wrecked = true;
    if (rig.driver) rig.driver.visible = false;
    const entry = this.list.find((v) => v.rig === rig);
    if (entry) {
      entry.wreckedAt = this.elapsed;
      entry.speed = 0;
      entry.stop = 0;
      this.ensureWreckSmoke(entry);
    }
    this.onWreck?.(rig.group.position.clone(), rig.group.rotation.y);
    return true;
  }

  private ensureWreckSmoke(v: TrafficVehicle): void {
    let smoke = v.rig.group.userData.wreckSmoke as THREE.Mesh | undefined;
    if (!smoke) {
      smoke = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 7, 6),
        new THREE.MeshBasicMaterial({
          color: 0x262a2e,
          transparent: true,
          opacity: 0.55,
          depthWrite: false
        })
      );
      smoke.position.set(0, 1.9, v.rig.length / 2 - 0.55);
      smoke.scale.set(0.9, 1.5, 0.9);
      v.rig.group.add(smoke);
      v.rig.group.userData.wreckSmoke = smoke;
    }
    smoke.visible = true;
  }

  private updateWreck(v: TrafficVehicle): void {
    if (v.rig.driver && v.rig.driver.visible) v.rig.driver.visible = false;
    const smoke = v.rig.group.userData.wreckSmoke as THREE.Mesh | undefined;
    if (!smoke) return;
    smoke.visible = v.visible;
    smoke.position.y = 1.75 + Math.sin(this.elapsed * 2.1) * 0.22;
    smoke.scale.setScalar(0.9 + Math.sin(this.elapsed * 3.2) * 0.12);
    (smoke.material as THREE.MeshBasicMaterial).opacity =
      0.42 + Math.sin(this.elapsed * 2.7) * 0.12;
  }

  /** Rebuilds a wrecked car when it is recycled out of sight. */
  private repairRig(rig: VehicleRig): void {
    const smoke = rig.group.userData.wreckSmoke as THREE.Mesh | undefined;
    if (smoke) smoke.visible = false;
    if (!rig.wrecked) return;
    rig.wrecked = false;
    rig.health = rig.maxHealth ?? rig.health;
    rig.burning = 0;
    if (rig.driver) rig.driver.visible = true;
  }

  private place(v: TrafficVehicle): void {
    if (v.axis === 'z') {
      v.rig.group.position.set(v.fixed, this.city.deckHeightAt(v.fixed, v.along, 'z'), v.along);
      v.rig.group.rotation.y = v.dir === 1 ? 0 : Math.PI;
    } else {
      v.rig.group.position.set(v.along, this.city.deckHeightAt(v.along, v.fixed, 'x'), v.fixed);
      v.rig.group.rotation.y = v.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  /** Keeps traffic within a couple of blocks of the player so roads stay busy. */
  private recycle(v: TrafficVehicle, player: THREE.Vector3): void {
    this.repairRig(v.rig);
    v.wreckedAt = -1;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const lane = LANES[Math.floor(Math.random() * LANES.length)];
      const limit = lane.axis === 'z' ? Z_LIMIT : X_LIMIT;
      const centre = lane.axis === 'z' ? player.z : player.x;
      const along = this.nearbyCoordinate(
        centre,
        limit,
        VIEW_DISTANCE + 28,
        VIEW_DISTANCE + 125
      );
      if (this.laneBlocked(lane.axis, lane.fixed, along, v)) continue;
      v.axis = lane.axis;
      v.fixed = lane.fixed;
      v.dir = lane.dir;
      v.along = lane.axis === 'x' ? Math.max(X_MIN, along) : along;
      v.min = lane.axis === 'z' ? -limit : X_MIN;
      v.max = limit;
      v.speed = v.cruise;
      v.stop = 0;
      this.place(v);
      if (this.nightMode) setVehicleNightLighting(v.rig, true);
      return;
    }
  }

  private nearbyCoordinate(centre: number, limit: number, minGap: number, maxGap: number): number {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const gap = minGap + Math.random() * (maxGap - minGap);
    let candidate = centre + dir * gap;
    if (candidate > limit || candidate < -limit) candidate = centre - dir * gap;
    return Math.max(-limit, Math.min(limit, candidate));
  }

  private laneBlocked(axis: Axis, fixed: number, along: number, self: TrafficVehicle): boolean {
    for (const other of this.list) {
      if (other === self) continue;
      if (other.axis !== axis) continue;
      if (Math.abs(other.fixed - fixed) > 3.2) continue;
      if (Math.abs(other.along - along) < 17) return true;
    }
    return false;
  }

  /**
   * Traffic-vs-traffic crashes: separate overlapping footprints and bring both
   * cars to a stop instead of letting them drive through one another.
   */
  private resolveCollisions(): void {
    const list = this.list;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      const ax = a.axis === 'z' ? a.rig.width / 2 : a.rig.length / 2;
      const az = a.axis === 'z' ? a.rig.length / 2 : a.rig.width / 2;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (Math.abs(a.rig.group.position.y - b.rig.group.position.y) > 2.2) continue;
        const bx = b.axis === 'z' ? b.rig.width / 2 : b.rig.length / 2;
        const bz = b.axis === 'z' ? b.rig.length / 2 : b.rig.width / 2;
        const dx = b.rig.group.position.x - a.rig.group.position.x;
        const dz = b.rig.group.position.z - a.rig.group.position.z;
        const px = ax + bx - Math.abs(dx);
        if (px <= 0.02) continue;
        const pz = az + bz - Math.abs(dz);
        if (pz <= 0.02) continue;

        if (a.axis === b.axis) {
          const pen = (a.axis === 'z' ? pz : px) / 2 + 0.03;
          const sign = b.along >= a.along ? 1 : -1;
          a.along -= sign * pen;
          b.along += sign * pen;
        } else if (px <= pz) {
          const sign = dx >= 0 ? 1 : -1;
          if (a.axis === 'x') a.along -= sign * px;
          else b.along += sign * px;
        } else {
          const sign = dz >= 0 ? 1 : -1;
          if (a.axis === 'z') a.along -= sign * pz;
          else b.along += sign * pz;
        }

        const avx = a.axis === 'x' ? a.dir * a.speed : 0;
        const avz = a.axis === 'z' ? a.dir * a.speed : 0;
        const bvx = b.axis === 'x' ? b.dir * b.speed : 0;
        const bvz = b.axis === 'z' ? b.dir * b.speed : 0;
        const closing = Math.hypot(avx - bvx, avz - bvz);

        a.stop = Math.max(a.stop, 0.9);
        b.stop = Math.max(b.stop, 0.9);
        a.speed = Math.min(a.speed, 0.8);
        b.speed = Math.min(b.speed, 0.8);

        if (closing > 2.2 && this.crashCooldown <= 0) {
          this.crashCooldown = 0.3;
          const at = new THREE.Vector3(
            (a.rig.group.position.x + b.rig.group.position.x) / 2,
            0.75,
            (a.rig.group.position.z + b.rig.group.position.z) / 2
          );
          this.onCrash?.(at, closing);
          const damage = Math.min(18, Math.max(0.35, (closing - 3.5) * 0.38));
          this.damage(a.rig, damage);
          this.damage(b.rig, damage);
        }

        this.place(a);
        this.place(b);
      }
    }
  }

  private buildTrafficLights(scene: THREE.Scene): void {
    // One signal mast per boulevard junction instead of a cluster of poles on
    // every corner: a post on the east sidewalk with a head over the road.
    const poles: Array<{ x: number; z: number }> = [];
    const heads: Array<{ x: number; y: number; z: number }> = [];
    for (const center of INTERSECTIONS) {
      const poleX = center.x + ROAD_HALF + 1.7;
      const poleZ = center.z - CROSS_HALF - 1.7;
      poles.push({ x: poleX, z: poleZ });
      heads.push({ x: poleX - 0.02, y: 3.55, z: poleZ });
      heads.push({ x: poleX - 4.7, y: 5.0, z: poleZ });
    }
    this.headPositions = heads;

    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 6.2, 7);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3336, roughness: 0.85 });
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, poles.length);
    poleMesh.frustumCulled = false;

    const armGeo = new THREE.BoxGeometry(4.8, 0.12, 0.12);
    const armMesh = new THREE.InstancedMesh(armGeo, poleMat, poles.length);
    armMesh.frustumCulled = false;

    const housingGeo = new THREE.BoxGeometry(0.34, 1.0, 0.32);
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x1a1e20, roughness: 0.9 });
    const housingMesh = new THREE.InstancedMesh(housingGeo, housingMat, heads.length);
    housingMesh.frustumCulled = false;

    const lensGeo = new THREE.SphereGeometry(0.1, 7, 6);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const lensMesh = new THREE.InstancedMesh(lensGeo, lensMat, heads.length * 3);
    lensMesh.frustumCulled = false;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scaleOne = new THREE.Vector3(1, 1, 1);
    const quat = new THREE.Quaternion();

    poles.forEach((pole, index) => {
      position.set(pole.x, 3.1, pole.z);
      matrix.compose(position, quat, scaleOne);
      poleMesh.setMatrixAt(index, matrix);

      position.set(pole.x - 2.4, 5.35, pole.z);
      matrix.compose(position, quat, scaleOne);
      armMesh.setMatrixAt(index, matrix);
    });

    heads.forEach((head, index) => {
      position.set(head.x, head.y, head.z);
      matrix.compose(position, quat, scaleOne);
      housingMesh.setMatrixAt(index, matrix);

      for (let lens = 0; lens < 3; lens += 1) {
        position.set(head.x, head.y + 0.34 - lens * 0.34, head.z + 0.19);
        matrix.compose(position, quat, scaleOne);
        lensMesh.setMatrixAt(index * 3 + lens, matrix);
      }
    });

    poleMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
    housingMesh.instanceMatrix.needsUpdate = true;
    lensMesh.instanceMatrix.needsUpdate = true;

    this.lensMesh = lensMesh;
    this.lightGroup.add(poleMesh, armMesh, housingMesh, lensMesh);
    scene.add(this.lightGroup);
    this.lightsBuilt = true;
    this.applyLensColors(true);
  }

  private buildStreetLights(scene: THREE.Scene): void {
    const roads = [
      { x: 0, halfWidth: ROAD_HALF },
      ...SIDE_ROADS.map((x) => ({ x, halfWidth: roadHalfFor(x) }))
    ];
    const lamps: Array<{ x: number; z: number; side: number; alongX?: boolean }> = [];
    for (const [roadIndex, road] of roads.entries()) {
      let step = 0;
      for (let z = -470; z <= 470; z += 78) {
        if (CROSS_ZS.some((crossing) => Math.abs(z - crossing) < CROSS_HALF + 12)) continue;
        const side = (roadIndex + step) % 2 === 0 ? -1 : 1;
        lamps.push({
          x: road.x + side * (road.halfWidth + 4.5),
          z,
          side
        });
        step += 1;
      }
    }
    // A sparse run of lamps keeps the desert highway readable after dark.
    for (let x = DESERT_HIGHWAY_START_X + 46; x <= DESERT_HIGHWAY_END_X - 26; x += 96) {
      lamps.push({ x, z: DESERT_HIGHWAY_Z + 13.5, side: 1, alongX: true });
    }

    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x343b3c, roughness: 0.88 });
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.09, 0.16, 5.8, 7),
      poleMaterial,
      lamps.length
    );
    const arms = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.4, 0.12, 0.12),
      poleMaterial,
      lamps.length
    );
    const shades = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.62, 0.12, 0.38),
      poleMaterial,
      lamps.length
    );
    const bulbMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c513d,
      emissive: 0xffd18a,
      emissiveIntensity: 0.02,
      roughness: 0.4,
      toneMapped: false
    });
    const bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      bulbMaterial,
      lamps.length
    );
    // Soft warm pool painted on the road under each lamp so the light spill
    // reads clearly at night even on low-end GPUs.
    const poolMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc978,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const pools = new THREE.InstancedMesh(
      new THREE.CircleGeometry(7.5, 16),
      poolMaterial,
      lamps.length
    );
    pools.visible = false;
    for (const mesh of [poles, arms, shades, bulbs, pools]) mesh.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const quarterTurn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const flatRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const scale = new THREE.Vector3(1, 1, 1);
    lamps.forEach((lamp, index) => {
      position.set(lamp.x, 2.9, lamp.z);
      matrix.compose(position, rotation, scale);
      poles.setMatrixAt(index, matrix);

      let fixtureX = lamp.x - lamp.side * 2.1;
      let fixtureZ = lamp.z;
      if (lamp.alongX) {
        fixtureX = lamp.x;
        fixtureZ = lamp.z - 2.1;
        position.set(lamp.x, 5.65, lamp.z - 1.0);
        matrix.compose(position, quarterTurn, scale);
      } else {
        position.set(lamp.x - lamp.side * 1.0, 5.65, lamp.z);
        matrix.compose(position, rotation, scale);
      }
      arms.setMatrixAt(index, matrix);

      position.set(fixtureX, 5.54, fixtureZ);
      matrix.compose(position, rotation, scale);
      shades.setMatrixAt(index, matrix);
      position.y = 5.39;
      matrix.compose(position, rotation, scale);
      bulbs.setMatrixAt(index, matrix);

      position.set(fixtureX, 0.014, fixtureZ);
      matrix.compose(position, flatRotation, scale);
      pools.setMatrixAt(index, matrix);
      this.streetLampPositions.push(new THREE.Vector3(fixtureX, 5.35, fixtureZ));
    });
    for (const mesh of [poles, arms, shades, bulbs, pools]) mesh.instanceMatrix.needsUpdate = true;
    this.streetLampBulbs = bulbs;
    this.streetLampPools = pools;
    this.lightGroup.add(poles, arms, shades, bulbs, pools);

    for (let i = 0; i < 10; i += 1) {
      const light = new THREE.PointLight(0xffd49a, 96, 44, 2);
      light.visible = false;
      this.streetLampLights.push(light);
      scene.add(light);
    }
  }

  private setNightMode(enabled: boolean): void {
    this.nightMode = enabled;
    if (this.streetLampPools) this.streetLampPools.visible = enabled;
    const bulbMaterial = this.streetLampBulbs?.material;
    if (bulbMaterial instanceof THREE.MeshStandardMaterial) {
      bulbMaterial.color.set(enabled ? 0xffe6b2 : 0x5c513d);
      bulbMaterial.emissiveIntensity = enabled ? 4 : 0.02;
    }
    for (const vehicle of this.list) {
      setVehicleNightLighting(vehicle.rig, enabled);
    }
    if (!enabled) {
      for (const light of this.streetLampLights) light.visible = false;
    }
  }

  private updateStreetLights(playerPos: THREE.Vector3 | null): void {
    if (!this.nightMode || !playerPos) {
      for (const light of this.streetLampLights) light.visible = false;
      return;
    }
    const nearest = this.streetLampPositions
      .map((position) => ({
        position,
        distance: position.distanceToSquared(playerPos)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.streetLampLights.length);
    for (let i = 0; i < this.streetLampLights.length; i += 1) {
      const light = this.streetLampLights[i];
      const lamp = nearest[i];
      if (!lamp || lamp.distance > 110 * 110) {
        light.visible = false;
        continue;
      }
      light.position.copy(lamp.position);
      light.visible = true;
    }
  }

  private updateLightState(): void {
    const t = this.elapsed % CYCLE;
    if (t < 9) {
      this.lightZ = 'green';
      this.lightX = 'red';
    } else if (t < 11.2) {
      this.lightZ = 'yellow';
      this.lightX = 'red';
    } else if (t < 12) {
      this.lightZ = 'red';
      this.lightX = 'red';
    } else if (t < 21) {
      this.lightZ = 'red';
      this.lightX = 'green';
    } else if (t < 23.2) {
      this.lightZ = 'red';
      this.lightX = 'yellow';
    } else {
      this.lightZ = 'red';
      this.lightX = 'red';
    }
    this.applyLensColors(false);
  }

  private applyLensColors(force: boolean): void {
    if (!this.lightsBuilt || !this.lensMesh) return;
    const key = `${this.lightZ}:${this.lightX}`;
    if (!force && key === this.lastLightKey) return;
    this.lastLightKey = key;
    const mesh = this.lensMesh;
    for (let index = 0; index < this.headPositions.length; index += 1) {
      for (let lens = 0; lens < 3; lens += 1) {
        const signal = this.lightZ;
        const isOn = lens === 0 ? signal === 'red' : lens === 1 ? signal === 'yellow' : signal === 'green';
        const color = isOn ? LIGHT_ON[signal] : LIGHT_OFF[signal];
        mesh.setColorAt(index * 3 + lens, color);
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private signalFor(axis: Axis): Signal {
    return axis === 'z' ? this.lightZ : this.lightX;
  }

  /** True when avenue/boulevard traffic is inside or closing on a junction. */
  private avenueTrafficNear(x: number, v: TrafficVehicle): boolean {
    const half = x === 0 ? ROAD_HALF : roadHalfFor(x);
    let crossZ = CROSS_ZS[0];
    for (const cz of CROSS_ZS) {
      if (Math.abs(cz - v.fixed) < Math.abs(crossZ - v.fixed)) crossZ = cz;
    }
    for (const other of this.list) {
      if (other === v || other.axis !== 'z') continue;
      if (Math.abs(other.fixed - x) > half + 2.4) continue;
      const gap = (crossZ - other.along) * other.dir;
      // Cars already in the junction block it; cars queued at a red light do not.
      if (gap > -CROSS_HALF - 3 && gap < CROSS_HALF + 3) return true;
      if (other.speed > 1.5 && gap >= CROSS_HALF + 3 && gap < 18 + other.speed) return true;
    }
    return false;
  }

  /** Only boulevard lanes have signal heads; avenue and ring traffic keeps moving. */
  private obeysSignals(v: TrafficVehicle): boolean {
    return v.axis === 'z' && Math.abs(v.fixed) < 20;
  }

  /** Next junction on this vehicle's path (signals on the boulevard, priority elsewhere). */
  private junctionAhead(v: TrafficVehicle): number | null {
    const points = v.axis === 'z' ? CROSS_ZS : [0, ...SIDE_ROADS];
    let best: number | null = null;
    let bestGap = Infinity;
    for (const point of points) {
      const gap = (point - v.along) * v.dir;
      if (gap > -CROSS_HALF - 4 && gap < 60 && gap < bestGap) {
        best = point;
        bestGap = gap;
      }
    }
    return best;
  }

  contains(rig: VehicleRig): boolean {
    return this.list.some((v) => v.rig === rig);
  }

  findNear(point: THREE.Vector3, range: number): VehicleRig | null {
    let best: VehicleRig | null = null;
    let bestDistance = range;
    for (const v of this.list) {
      if (v.rig.wrecked) continue;
      const distance = Math.hypot(
        v.rig.group.position.x - point.x,
        v.rig.group.position.z - point.z
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = v.rig;
      }
    }
    return best;
  }

  nearestSignal(point: THREE.Vector3): SignalInfo | null {
    let best: { x: number; z: number } | null = null;
    let bestDistance = 80;
    for (const center of INTERSECTIONS) {
      const distance = Math.hypot(point.x - center.x, point.z - center.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = center;
      }
    }
    if (!best) return null;

    const dx = Math.abs(point.x - best.x);
    const dz = Math.abs(point.z - best.z);
    const axis: Axis = dz >= dx ? 'z' : 'x';
    const timing = this.signalTiming(axis, this.elapsed % CYCLE);
    return {
      state: timing.state,
      axis,
      remaining: timing.remaining,
      distance: bestDistance,
      x: best.x,
      z: best.z
    };
  }

  private signalTiming(axis: Axis, t: number): { state: Signal; remaining: number } {
    if (axis === 'z') {
      if (t < 9) return { state: 'green', remaining: 9 - t };
      if (t < 11.2) return { state: 'yellow', remaining: 11.2 - t };
      return { state: 'red', remaining: Math.max(0.1, 24 - t) };
    }
    if (t < 12) return { state: 'red', remaining: 12 - t };
    if (t < 21) return { state: 'green', remaining: 21 - t };
    if (t < 23.2) return { state: 'yellow', remaining: 23.2 - t };
    return { state: 'red', remaining: Math.max(0.1, 24 - t) };
  }

  findStoppedNear(point: THREE.Vector3, range: number): VehicleRig | null {
    let best: VehicleRig | null = null;
    let bestDistance = range;
    for (const v of this.list) {
      if (v.speed > 0.8 || v.rig.wrecked) continue;
      const distance = Math.hypot(
        v.rig.group.position.x - point.x,
        v.rig.group.position.z - point.z
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = v.rig;
      }
    }
    return best;
  }

  halt(rig: VehicleRig): void {
    const entry = this.list.find((v) => v.rig === rig);
    if (!entry) return;
    entry.speed = 0;
    entry.stop = 0;
  }

  takeVehicle(rig: VehicleRig): boolean {
    const index = this.list.findIndex((v) => v.rig === rig);
    if (index < 0) return false;
    this.list.splice(index, 1);
    return true;
  }

  stopNear(point: THREE.Vector3, range: number): void {
    for (const v of this.list) {
      const distance = Math.hypot(
        v.rig.group.position.x - point.x,
        v.rig.group.position.z - point.z
      );
      if (distance < range) v.stop = 2.5;
    }
  }

  get count(): number {
    return this.list.length;
  }

  get rigs(): VehicleRig[] {
    return this.list.map((v) => v.rig);
  }

  get cityRef(): City {
    return this.city;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
