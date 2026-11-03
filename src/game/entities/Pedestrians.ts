import * as THREE from 'three';
import {
  CharacterColors,
  CharacterRig,
  CharacterStyle,
  HumanoidAnimator,
  createCharacter
} from './CharacterModel';
import {
  City,
  CROSS_HALF,
  CROSS_ZS,
  ROAD_HALF,
  roadHalfFor,
  SIDE_ROADS,
  WEST_DISTRICT_MIN_X,
  WORLD_HALF_X
} from '../world/City';
import { CombatHit } from '../systems/CombatTypes';
import { createHealth, damageHealth, Health } from '../systems/Health';
import { IS_ANDROID } from '../platform';

type PedAxis = 'z' | 'x';
type PropKind = 'tray' | 'bag' | 'backpack' | 'stick' | 'phone';

const VIEW_DISTANCE = IS_ANDROID ? 58 : 95;
const RECYCLE_DISTANCE = IS_ANDROID ? 155 : 230;

export interface Pedestrian {
  group: THREE.Group;
  rig: CharacterRig;
  animator: HumanoidAnimator;
  name: string;
  line: string;
  baseSpeed: number;
  speed: number;
  axis: PedAxis;
  fixed: number;
  along: number;
  dir: 1 | -1;
  min: number;
  max: number;
  pause: number;
  flee: number;
  hitTimer: number;
  health: Health;
  dead: boolean;
  deadTimer: number;
  visible: boolean;
  drift: number;
}

interface Archetype {
  shirts: number[];
  pants: number[];
  height: [number, number];
  build: [number, number];
  speed: [number, number];
  headwrap?: number;
  cap?: number;
  glasses?: number;
  vest?: number;
  vestColors?: number[];
  prop?: PropKind;
  propChance?: number;
  sleeves?: Array<'short' | 'tank'>;
  bottoms?: Array<'long' | 'shorts'>;
  beard?: number;
  hair?: Array<'fade' | 'afro' | 'bald' | 'braids'>;
}

const NAMES = [
  'Chinedu', 'Amaka', 'Tunde', 'Bisi', 'Emeka', 'Ngozi', 'Yemi', 'Halima',
  'Segun', 'Funke', 'Musa', 'Ada', 'Kelechi', 'Tola', 'Ifeanyi', 'Zainab',
  'Dayo', 'Chika', 'Bola', 'Femi', 'Aisha', 'Obi', 'Uche', 'Sade',
  'Kunle', 'Rita', 'Bayo', 'Nneka', 'Sule', 'Titi', 'Jide', 'Efe',
  'Hauwa', 'Obinna', 'Lara', 'Wale', 'Esther', 'Ikeme', 'Mariam', 'Dele'
];
const LINES = [
  'How far? You dey find road?',
  'Kano no dey sleep, my brother.',
  'Abeg, no block my way.',
  'You see that okada? Him no dey hear word.',
  'This heat go kill person today.',
  'Make money, no make trouble.',
  'I dey go market. You need anything?',
  'Ah, see as everywhere dry. NEPA don strike again.',
  'If police stop you, just keep cool.',
  'Na God dey protect us for this city.',
  'Oga, you no go buy something?',
  'Traffic hold me for two hours, I tire.',
  'My phone battery don die again.',
  'That danfo driver nearly knock me down.',
  'See fine motor. Na sport car be that?',
  'Abeg, which way go Sabon Gari?',
  'I just land from Abuja this morning.',
  'Food don ready. Come chop.',
  'No worry, everything go dey alright.',
  'Police dey everywhere today. Wetin happen?',
  'Make we hurry before rain fall.',
  'Kurmi Market don full today, no space at all.',
  'Sabon Gari dey sweet tonight. You wan come?',
  'My brother, Kano dry heat no be play.',
  'Na only God know when this road go dry.'
];

const SKIN_TONES = [0x8a5a36, 0x7a4a28, 0x6b3f22, 0x9a6a45, 0x5c3218, 0x83512e, 0xa87a52];
const SHOES = [0x18191c, 0xe8e4dc, 0x5a4630, 0xd8d2c2, 0x2a2b2e, 0x8a2f2f];
const ACCENTS = [0xf0f0ea, 0xd7d2c4, 0x232527, 0xc9a227];
const HAIR = [0x14100d, 0x241a12, 0x0f0c09];
const CAPS = [0x17181c, 0xb03028, 0x2f6fa8, 0x2f7f5b, 0x33343a, 0xd4a12f, 0x6b3fa0];
const HEADWRAPS = [0xd4a12f, 0xc94b33, 0x2f7f5b, 0x63398c, 0xe07a2f, 0x2f6fa8, 0x8f2f5c];
const VESTS = [0x2a2f38, 0x3a3f2a, 0x4a2f2f, 0x1f2a44, 0xd4a12f, 0x2f4a3a];

const ARCHETYPES: Archetype[] = [
  {
    // Market woman carrying goods on her head.
    shirts: [0xe07a2f, 0xc94b33, 0xd4a12f, 0x2f7f5b, 0x8f2f5c],
    pants: [0x63398c, 0x8f2f5c, 0x2f6fa8, 0x6b5b43],
    height: [1.55, 1.7],
    build: [0.84, 0.96],
    speed: [0.5, 0.9],
    headwrap: 0.9,
    prop: 'tray',
    propChance: 0.75,
    bottoms: ['long'],
    beard: 0,
    hair: ['afro', 'bald', 'braids']
  },
  {
    // Office worker in a waistcoat with a briefcase.
    shirts: [0xe8e4dc, 0x9fc0dc, 0xf0c3a0, 0xd9d9d2, 0x3f8fb0],
    pants: [0x22304a, 0x2c2c30, 0x3a3a3a],
    height: [1.7, 1.9],
    build: [0.98, 1.12],
    speed: [0.9, 1.45],
    cap: 0.08,
    glasses: 0.5,
    vest: 0.65,
    vestColors: [0x1f2a44, 0x2a2f38, 0x3a3a3a, 0x4a3a2a],
    prop: 'bag',
    propChance: 0.6,
    sleeves: ['short'],
    bottoms: ['long'],
    beard: 0.3,
    hair: ['fade', 'bald']
  },
  {
    // Student with a backpack.
    shirts: [0x2f6fa8, 0xb8c94b, 0xe05a6a, 0xe8e4dc, 0xd4a12f],
    pants: [0x22304a, 0x2c2c30, 0x3f4a5c],
    height: [1.55, 1.75],
    build: [0.86, 0.99],
    speed: [0.85, 1.4],
    cap: 0.45,
    prop: 'backpack',
    propChance: 0.72,
    sleeves: ['short', 'tank'],
    bottoms: ['shorts', 'long'],
    beard: 0.1,
    hair: ['fade', 'afro', 'braids']
  },
  {
    // Elder with a walking stick.
    shirts: [0xd9d2c2, 0x7a6a4a, 0x8a8272, 0x2f7f5b, 0xe8e4dc],
    pants: [0x6b5b43, 0x2c2c30, 0x3a3a3a],
    height: [1.55, 1.72],
    build: [0.88, 1.0],
    speed: [0.38, 0.66],
    cap: 0.25,
    glasses: 0.35,
    prop: 'stick',
    propChance: 0.85,
    sleeves: ['short', 'tank'],
    bottoms: ['long'],
    beard: 0.55,
    hair: ['bald', 'fade']
  },
  {
    // Security guard in a dark vest.
    shirts: [0x1f2a44, 0x2a2f38, 0x3a3f2a],
    pants: [0x151c2a, 0x2c2c30],
    height: [1.72, 1.9],
    build: [1.0, 1.14],
    speed: [0.75, 1.1],
    cap: 0.85,
    glasses: 0.15,
    vest: 0.9,
    vestColors: [0x14161a, 0x1f2a44, 0x2a2f38],
    prop: 'phone',
    propChance: 0.3,
    sleeves: ['short'],
    bottoms: ['long'],
    beard: 0.35,
    hair: ['fade', 'bald']
  },
  {
    // Street trader with a tray or a vest.
    shirts: [0xc94b33, 0xe07a2f, 0xd4a12f, 0x2f7f5b, 0x5a3a8a],
    pants: [0x2c2c30, 0x3f4a5c, 0x6b5b43],
    height: [1.6, 1.8],
    build: [0.9, 1.05],
    speed: [0.6, 1.05],
    headwrap: 0.4,
    vest: 0.3,
    prop: 'tray',
    propChance: 0.5,
    sleeves: ['short', 'tank'],
    bottoms: ['long', 'shorts'],
    beard: 0.25,
    hair: ['fade', 'afro', 'bald']
  },
  {
    // Commuter heading home.
    shirts: [0x2f6fa8, 0x63398c, 0x8f2f5c, 0xe8e4dc, 0x3a3d4a, 0x1f8a7a],
    pants: [0x22304a, 0x2c2c30, 0x3f4a5c, 0x6b5b43],
    height: [1.62, 1.86],
    build: [0.92, 1.08],
    speed: [0.9, 1.45],
    cap: 0.3,
    glasses: 0.25,
    prop: 'bag',
    propChance: 0.62,
    sleeves: ['short', 'tank'],
    bottoms: ['long', 'shorts'],
    beard: 0.2,
    hair: ['fade', 'afro']
  },
  {
    // Youth hanging around with a phone.
    shirts: [0xb8c94b, 0xe05a6a, 0x2f6fa8, 0xd4a12f, 0xe8e4dc],
    pants: [0x2c2c30, 0x22304a, 0x3f4a5c],
    height: [1.6, 1.8],
    build: [0.86, 1.0],
    speed: [1.0, 1.55],
    cap: 0.6,
    glasses: 0.2,
    prop: 'phone',
    propChance: 0.55,
    sleeves: ['tank', 'short'],
    bottoms: ['shorts'],
    beard: 0.08,
    hair: ['fade', 'afro', 'bald']
  },
  {
    // Grandmother in a wrapper.
    shirts: [0x63398c, 0x2f7f5b, 0xd4a12f, 0xc94b33, 0xe8e4dc],
    pants: [0x4a3a5c, 0x6b5b43, 0x2f6fa8],
    height: [1.5, 1.66],
    build: [0.84, 0.95],
    speed: [0.38, 0.68],
    headwrap: 0.82,
    glasses: 0.4,
    prop: 'stick',
    propChance: 0.55,
    sleeves: ['short'],
    bottoms: ['long'],
    beard: 0,
    hair: ['afro', 'bald']
  },
  {
    // Musician in a bright tank top.
    shirts: [0xe05a6a, 0x1f8a7a, 0xd4a12f, 0x5a3a8a, 0xe07a2f],
    pants: [0x2c2c30, 0x3a3a3a, 0x22304a],
    height: [1.65, 1.85],
    build: [0.92, 1.05],
    speed: [0.8, 1.25],
    cap: 0.2,
    glasses: 0.45,
    prop: 'bag',
    propChance: 0.3,
    sleeves: ['tank'],
    bottoms: ['long', 'shorts'],
    beard: 0.35,
    hair: ['afro', 'fade']
  },
  {
    // Driver resting between trips.
    shirts: [0x3a3d4a, 0x2f6fa8, 0x7a6a4a, 0xd9d9d2, 0x2f7f5b],
    pants: [0x22304a, 0x2c2c30, 0x3f4a5c],
    height: [1.68, 1.86],
    build: [0.95, 1.1],
    speed: [0.8, 1.15],
    cap: 0.7,
    glasses: 0.2,
    prop: 'phone',
    propChance: 0.35,
    sleeves: ['short'],
    bottoms: ['long'],
    beard: 0.3,
    hair: ['fade', 'bald']
  }
];

export class Pedestrians {
  readonly list: Pedestrian[] = [];
  private onKilled: ((position: THREE.Vector3) => void) | null = null;

  constructor(private scene: THREE.Scene, private city: City, count = 18) {
    const zLimit = city.maxZ - 14;
    for (let i = 0; i < count; i += 1) {
      const style = i % 7;
      let axis: PedAxis = 'z';
      let fixed = 0;
      let along = 0;
      let min = -zLimit;
      let max = zLimit;

      if (style <= 2) {
        const side = i % 2 === 0 ? -1 : 1;
        fixed = side * (ROAD_HALF + 2.5 + Math.random() * 1.3);
        along = i < 14 ? 30 + (Math.random() - 0.5) * 150 : -zLimit + Math.random() * zLimit * 2;
      } else if (style === 3) {
        const road = SIDE_ROADS[Math.floor(Math.random() * SIDE_ROADS.length)];
        const side = Math.random() < 0.5 ? -1 : 1;
        fixed = road + side * (roadHalfFor(road) + 2.2 + Math.random());
        along = -zLimit + Math.random() * zLimit * 2;
      } else if (style === 4) {
        axis = 'x';
        const crossZ = CROSS_ZS[Math.floor(Math.random() * CROSS_ZS.length)];
        fixed = crossZ + (Math.random() < 0.5 ? -1 : 1) * (CROSS_HALF + 1 + Math.random() * 0.8);
        min = WEST_DISTRICT_MIN_X + 2;
        max = WORLD_HALF_X - 12;
        along = min + Math.random() * (max - min);
      } else if (style === 5) {
        const road = SIDE_ROADS[Math.floor(Math.random() * SIDE_ROADS.length)];
        const side = Math.random() < 0.5 ? -1 : 1;
        fixed = road + side * (roadHalfFor(road) + 2.2 + Math.random());
        along = -zLimit + Math.random() * zLimit * 2;
      } else {
        axis = 'x';
        const crossZ = CROSS_ZS[Math.floor(Math.random() * CROSS_ZS.length)];
        fixed = crossZ + (Math.random() < 0.5 ? -1 : 1) * (CROSS_HALF + 1 + Math.random() * 0.8);
        min = WEST_DISTRICT_MIN_X + 2;
        max = WORLD_HALF_X - 12;
        along = min + Math.random() * (max - min);
      }

      const look = this.makeLook();
      const rig = createCharacter(look.colors, look.height, look.style);
      attachProp(rig, look.prop);

      const startX = axis === 'z' ? fixed : along;
      const startZ = axis === 'z' ? along : fixed;
      rig.group.position.set(startX, city.groundHeightAt(startX, startZ, axis), startZ);
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      rig.group.rotation.y = axis === 'z' ? (dir === 1 ? 0 : Math.PI) : dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(rig.group);

      const baseSpeed = look.speed;
      this.list.push({
        group: rig.group,
        rig,
        animator: new HumanoidAnimator(Math.random() * Math.PI * 2),
        name: pick(NAMES),
        line: pick(LINES),
        speed: baseSpeed,
        baseSpeed,
        axis,
        fixed,
        along,
        dir,
        min,
        max,
        pause: Math.random() < 0.3 ? 1 + Math.random() * 3 : 0,
        flee: 0,
        hitTimer: 0,
        health: createHealth(24),
        dead: false,
        deadTimer: 0,
        visible: true,
        drift: Math.random() * Math.PI * 2
      });
    }
  }

  get count(): number {
    return this.list.length;
  }

  get aliveCount(): number {
    return this.list.filter((p) => !p.dead).length;
  }

  nearby(position: THREE.Vector3, range: number): Pedestrian | null {
    let best: Pedestrian | null = null;
    let bestDistance = range;
    for (const p of this.list) {
      if (p.dead) continue;
      const distance = Math.hypot(
        p.group.position.x - position.x,
        p.group.position.z - position.z
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p;
      }
    }
    return best;
  }

  pushOut(position: THREE.Vector3, radius: number): void {
    for (const p of this.list) {
      if (p.dead) continue;
      const dx = position.x - p.group.position.x;
      const dz = position.z - p.group.position.z;
      const distance = Math.hypot(dx, dz);
      const min = radius + 0.36;
      if (distance >= min || distance < 0.0001) continue;
      const push = (min - distance) / distance;
      position.x += dx * push;
      position.z += dz * push;
    }
  }

  setKilledCallback(callback: (position: THREE.Vector3) => void): void {
    this.onKilled = callback;
  }

  /** Throws a driver out of a hijacked car; he lands beside it and runs. */
  ejectDriver(carPosition: THREE.Vector3, carYaw: number): void {
    const leftX = Math.cos(carYaw);
    const leftZ = -Math.sin(carYaw);
    const x = carPosition.x + leftX * 1.9;
    const z = carPosition.z + leftZ * 1.9;

    const look = this.makeLook();
    const rig = createCharacter(look.colors, look.height, look.style);
    attachProp(rig, look.prop);

    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    rig.group.position.set(x, this.city.groundHeightAt(x, z), z);
    rig.group.rotation.y = dir === 1 ? 0 : Math.PI;
    this.scene.add(rig.group);

    const baseSpeed = 3.1 + Math.random() * 0.6;
    this.list.push({
      group: rig.group,
      rig,
      animator: new HumanoidAnimator(Math.random() * Math.PI * 2),
      name: pick(NAMES),
      line: 'Oga, you dey craze!',
      speed: baseSpeed,
      baseSpeed,
      axis: 'z',
      fixed: x,
      along: z,
      dir,
      min: z - 70,
      max: z + 70,
      pause: 0,
      flee: 6,
      hitTimer: 0.35,
      health: createHealth(24),
      dead: false,
      deadTimer: 0,
      visible: true,
      drift: Math.random() * Math.PI * 2
    });
  }

  /**
   * Checks the car footprint for people and knocks them down.
   * Returns how many were hit, how many died, and impact points for sparks.
   */
  runOver(
    carPosition: THREE.Vector3,
    carYaw: number,
    carWidth: number,
    carLength: number,
    speed: number
  ): { hits: number; killed: number; points: THREE.Vector3[] } {
    const points: THREE.Vector3[] = [];
    let hits = 0;
    let killed = 0;
    if (speed < 3.2) return { hits, killed, points };

    const cos = Math.cos(carYaw);
    const sin = Math.sin(carYaw);
    const halfW = carWidth / 2 + 0.34;
    const halfL = carLength / 2 + 0.55;
    const fwdX = Math.sin(carYaw);
    const fwdZ = Math.cos(carYaw);
    const damage = Math.max(0, speed - 9) * 3.2;

    for (const p of this.list) {
      if (p.dead || p.hitTimer > 0) continue;
      if (Math.abs(p.group.position.y - carPosition.y) > 2.2) continue;
      const dx = p.group.position.x - carPosition.x;
      const dz = p.group.position.z - carPosition.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) > halfW || Math.abs(lz) > halfL) continue;

      hits += 1;
      const point = p.group.position.clone().setY(0.85);
      const didKill = damage > 0 && this.hitTarget(p, damage, carPosition, true);
      if (didKill) {
        killed += 1;
        // Fling the body a little in the direction the car was moving.
        p.group.position.x += fwdX * (1.1 + speed * 0.05);
        p.group.position.z += fwdZ * (1.1 + speed * 0.05);
        p.group.position.y =
          this.city.groundHeightAt(p.group.position.x, p.group.position.z, p.axis) + 0.12;
        p.group.rotation.x = (Math.random() - 0.5) * 0.5;
      } else {
        p.flee = 5;
        p.speed = 3.4;
        p.pause = 0;
      }
      points.push(point);
    }

    if (hits > 0) this.panic(carPosition, 16);
    return { hits, killed, points };
  }

  panic(at: THREE.Vector3, radius: number): void {
    for (const p of this.list) {
      if (p.dead) continue;
      const dx = p.group.position.x - at.x;
      const dz = p.group.position.z - at.z;
      if (Math.hypot(dx, dz) > radius) continue;
      p.flee = 4.5;
      p.speed = 2.8;
      p.pause = 0;
      const axisDelta = p.axis === 'z' ? dz : dx;
      p.dir = axisDelta >= 0 ? 1 : -1;
      p.group.rotation.y = this.yawFor(p);
    }
  }

  punchNear(
    at: THREE.Vector3,
    forward: THREE.Vector3,
    damage: number
  ): { killed: boolean; point: THREE.Vector3 } | null {
    const fx = forward.x;
    const fz = forward.z;
    let target: Pedestrian | null = null;
    let best = Infinity;

    for (const p of this.list) {
      if (p.dead) continue;
      const dx = p.group.position.x - at.x;
      const dz = p.group.position.z - at.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.0 || dist < 0.001) continue;
      const facing = (dx * fx + dz * fz) / dist;
      if (facing < 0.35) continue;
      if (dist < best) {
        best = dist;
        target = p;
      }
    }

    if (!target) return null;

    this.panic(at, 5.5);
    const point = target.group.position.clone().setY(1.05);
    const killed = this.hitTarget(target, damage, at);
    return { killed, point };
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, range: number): CombatHit | null {
    let target: Pedestrian | null = null;
    let best = Infinity;
    let bestPoint: THREE.Vector3 | null = null;

    for (const p of this.list) {
      if (p.dead) continue;
      const center = p.group.position.clone().setY(1.0);
      const to = center.clone().sub(origin);
      const along = to.dot(dir);
      if (along < 0.5 || along > range || along >= best) continue;
      const closest = origin.clone().addScaledVector(dir, along);
      if (closest.distanceTo(center) > 0.55) continue;
      best = along;
      target = p;
      bestPoint = closest;
    }

    if (!target || !bestPoint) return null;

    const victim = target;
    const point = bestPoint.clone();
    const from = origin.clone();
    return {
      point,
      distance: best,
      kind: 'pedestrian',
      label: 'Civilian',
      hit: (damage) => {
        if (victim.dead) return false;
        this.panic(from, 6);
        return this.hitTarget(victim, damage, from);
      }
    };
  }

  private hitTarget(target: Pedestrian, damage: number, at: THREE.Vector3, quiet = false): boolean {
    target.hitTimer = 0.55;
    target.flee = 5;
    target.speed = 3.2;
    target.pause = 0;
    const axisDelta = target.axis === 'z' ? target.group.position.z - at.z : target.group.position.x - at.x;
    target.dir = axisDelta >= 0 ? 1 : -1;
    target.group.rotation.y = this.yawFor(target);
    const killed = damageHealth(target.health, damage, performance.now() / 1000);
    if (!killed) return false;
    target.dead = true;
    target.speed = 0;
    target.group.rotation.z = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 - 0.1);
    target.group.position.y += 0.12;
    if (!quiet) this.onKilled?.(target.group.position.clone());
    return true;
  }

  update(dt: number, city: City, playerPosition: THREE.Vector3 | null, vehiclePosition: THREE.Vector3 | null): void {
    for (const p of this.list) {
      if (p.dead) {
        p.deadTimer += dt;
        continue;
      }

      p.hitTimer = Math.max(0, p.hitTimer - dt);

      if (playerPosition) {
        const distance = Math.hypot(
          p.group.position.x - playerPosition.x,
          p.group.position.z - playerPosition.z
        );
        if (distance > RECYCLE_DISTANCE && p.flee <= 0 && p.hitTimer <= 0) {
          this.recycle(p, playerPosition, city);
          p.visible = false;
          p.group.visible = false;
          continue;
        }
        p.visible = distance < VIEW_DISTANCE;
        p.group.visible = p.visible;
        if (!p.visible) continue;

        if (!vehiclePosition && distance < 0.95) p.pause = Math.max(p.pause, 0.45);

        if (vehiclePosition) {
          const vehicleDistance = Math.hypot(
            p.group.position.x - vehiclePosition.x,
            p.group.position.z - vehiclePosition.z
          );
          if (vehicleDistance < 4.5 && p.flee <= 0) this.fleeFrom(p, vehiclePosition, 3);
        }
      }

      if (p.flee > 0) {
        p.flee -= dt;
        this.advance(p, city, p.dir * p.speed * dt);
        p.animator.update(p.rig, dt, p.speed, 1.8);
        this.applyHitRecoil(p);
        if (p.flee <= 0) {
          p.speed = p.baseSpeed;
          p.pause = 0.5 + Math.random();
        }
        continue;
      }

      if (p.pause > 0) {
        p.pause -= dt;
        p.animator.update(p.rig, dt, 0, 1.8);
        this.applyHitRecoil(p);
        if (p.pause <= 0 && Math.random() < 0.55) {
          p.dir = p.dir === 1 ? -1 : 1;
          p.group.rotation.y = this.yawFor(p);
        }
        continue;
      }

      this.advance(p, city, p.dir * p.speed * dt);
      p.animator.update(p.rig, dt, p.speed, 1.8);
      this.applyHitRecoil(p);

      if (Math.random() < dt * 0.035) p.pause = 1.2 + Math.random() * 3.4;
    }
  }

  private fleeFrom(p: Pedestrian, from: THREE.Vector3, seconds: number): void {
    p.flee = seconds;
    p.speed = 2.7;
    p.pause = 0;
    const axisDelta = p.axis === 'z' ? p.group.position.z - from.z : p.group.position.x - from.x;
    p.dir = axisDelta >= 0 ? 1 : -1;
    p.group.rotation.y = this.yawFor(p);
  }

  /** Move a far-away pedestrian to a road just outside the view distance. */
  private recycle(p: Pedestrian, player: THREE.Vector3, city: City): void {
    const zLimit = city.maxZ - 16;
    const xLimit = WORLD_HALF_X - 12;
    const roll = Math.random();

    if (roll < 0.58) {
      p.axis = 'z';
      if (roll < 0.34) {
        const side = Math.random() < 0.5 ? -1 : 1;
        p.fixed = side * (ROAD_HALF + 2.5 + Math.random() * 1.2);
      } else {
        const road = SIDE_ROADS[Math.floor(Math.random() * SIDE_ROADS.length)];
        const side = Math.random() < 0.5 ? -1 : 1;
        p.fixed = road + side * (roadHalfFor(road) + 2.2 + Math.random());
      }
      p.min = -zLimit;
      p.max = zLimit;
      p.along = this.nearbyCoordinate(player.z, zLimit, 70, 125);
    } else {
      p.axis = 'x';
      let nearest = CROSS_ZS[0];
      for (const cz of CROSS_ZS) {
        if (Math.abs(cz - player.z) < Math.abs(nearest - player.z)) nearest = cz;
      }
      const side = Math.random() < 0.5 ? -1 : 1;
      p.fixed = nearest + side * (CROSS_HALF + 1 + Math.random() * 0.8);
      p.min = WEST_DISTRICT_MIN_X + 2;
      p.max = xLimit;
      p.along = Math.max(p.min, this.nearbyCoordinate(player.x, xLimit, 70, 125));
    }

    p.dir = Math.random() < 0.5 ? 1 : -1;
    p.hitTimer = 0;
    p.flee = 0;
    p.speed = p.baseSpeed;
    p.pause = Math.random() < 0.4 ? 0.5 + Math.random() * 3 : 0;
    const x = p.axis === 'z' ? p.fixed : p.along;
    const z = p.axis === 'z' ? p.along : p.fixed;
    p.group.position.set(x, city.groundHeightAt(x, z, p.axis), z);
    p.group.rotation.y = this.yawFor(p);
    p.group.rotation.z = 0;
    p.animator.phase = Math.random() * Math.PI * 2;
  }

  private nearbyCoordinate(centre: number, limit: number, minGap: number, maxGap: number): number {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const gap = minGap + Math.random() * (maxGap - minGap);
    let candidate = centre + dir * gap;
    if (candidate > limit || candidate < -limit) candidate = centre - dir * gap;
    return Math.max(-limit, Math.min(limit, candidate));
  }

  private advance(p: Pedestrian, city: City, delta: number): void {
    p.along += delta;
    if (p.along > p.max) {
      p.dir = -1;
      p.along = p.max;
      p.group.rotation.y = this.yawFor(p);
    } else if (p.along < p.min) {
      p.dir = 1;
      p.along = p.min;
      p.group.rotation.y = this.yawFor(p);
    }

    const drift = Math.sin(p.along * 0.08 + p.drift) * 0.22;
    const x = p.axis === 'z' ? p.fixed + drift : p.along;
    const z = p.axis === 'z' ? p.along : p.fixed + drift;
    p.group.position.x = x;
    p.group.position.z = z;
    p.group.position.y = city.groundHeightAt(x, z, p.axis);
  }

  private yawFor(p: Pedestrian): number {
    if (p.axis === 'z') return p.dir === 1 ? 0 : Math.PI;
    return p.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
  }

  private applyHitRecoil(p: Pedestrian): void {
    if (p.hitTimer <= 0) return;
    const k = p.hitTimer / 0.55;
    p.rig.torso.rotation.x -= 0.42 * k;
    p.rig.head.rotation.x -= 0.18 * k;
    p.rig.torso.rotation.z += (p.dir === 1 ? 1 : -1) * 0.12 * k;
  }

  private makeLook(archetype?: Archetype): {
    colors: CharacterColors;
    height: number;
    style: CharacterStyle;
    prop: PropKind | null;
    speed: number;
  } {
    const a = archetype ?? pick(ARCHETYPES);
    const headwrap = Math.random() < (a.headwrap ?? 0);
    const style: CharacterStyle = {
      build: rand(a.build),
      hairStyle: pick(a.hair ?? ['fade', 'afro', 'bald']),
      cap: !headwrap && Math.random() < (a.cap ?? 0.2),
      capColor: pick(CAPS),
      headwrap,
      headwrapColor: pick(HEADWRAPS),
      glasses: Math.random() < (a.glasses ?? 0.12),
      vest: Math.random() < (a.vest ?? 0),
      vestColor: pick(a.vestColors ?? VESTS),
      sleeves: pick(a.sleeves ?? ['short', 'short', 'tank']),
      bottoms: pick(a.bottoms ?? ['long', 'long', 'shorts']),
      beard: Math.random() < (a.beard ?? 0.22)
    };
    const prop = Math.random() < (a.propChance ?? 0) ? (a.prop ?? null) : null;
    return {
      colors: {
        skin: pick(SKIN_TONES),
        shirt: pick(a.shirts),
        pants: pick(a.pants),
        shoes: pick(SHOES),
        accent: pick(ACCENTS),
        hair: pick(HAIR)
      },
      height: rand(a.height),
      style,
      prop,
      speed: rand(a.speed)
    };
  }
}

function attachProp(rig: CharacterRig, prop: PropKind | null): void {
  if (!prop) return;
  if (prop === 'tray') {
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 });
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.34), trayMat);
    tray.position.set(0, 0.29, 0.01);
    rig.head.add(tray);
    const colours = [0xd94b32, 0xf0b23a, 0x4a8f3c];
    for (let i = 0; i < 3; i += 1) {
      const item = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 8, 6),
        new THREE.MeshStandardMaterial({ color: colours[i], roughness: 0.8 })
      );
      item.position.set((i - 1) * 0.12, 0.32, 0.02);
      rig.head.add(item);
    }
    return;
  }
  if (prop === 'bag') {
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.2, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1f, roughness: 0.85 })
    );
    bag.position.set(0.01, -0.34, 0.02);
    rig.leftElbow.add(bag);
    return;
  }
  if (prop === 'backpack') {
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.38, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x2f4a6a, roughness: 0.9 })
    );
    pack.position.set(0, 0.27, -0.17);
    rig.torso.add(pack);
    return;
  }
  if (prop === 'stick') {
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.02, 1.0, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3a1f, roughness: 0.9 })
    );
    stick.position.set(0.03, -0.62, 0.03);
    rig.rightElbow.add(stick);
    return;
  }
  const phone = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.1, 0.014),
    new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.4 })
  );
  phone.position.set(0, -0.3, 0.07);
  rig.rightElbow.add(phone);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function rand(range: [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}
