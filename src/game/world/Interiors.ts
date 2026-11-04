import * as THREE from 'three';
import { City, CitySite, SiteKind } from './City';
import { CharacterColors, CharacterRig, HumanoidAnimator, createCharacter } from '../entities/CharacterModel';
import { mergeDirectMeshes } from '../entities/MeshMerge';
import { CombatHit } from '../systems/CombatTypes';
import { createHealth, damageHealth, Health } from '../systems/Health';
import { IS_ANDROID } from '../platform';

export type InteriorService = 'shop' | 'food' | 'heal' | 'garage' | 'police' | 'loan' | 'none';

export interface InteriorActor {
  id: string;
  group: THREE.Group;
  rig: CharacterRig;
  animator: HumanoidAnimator;
  name: string;
  line: string;
  speed: number;
  waypoints: THREE.Vector3[];
  waypoint: number;
  pause: number;
  health: Health;
  dead: boolean;
  deadTimer: number;
}

interface InteriorDoor {
  pivot: THREE.Group;
  target: number;
  axis: number;
  lift?: boolean;
}

export interface InteriorPointDef {
  id: string;
  label: string;
  position: THREE.Vector3;
  kind: 'exit' | 'service' | 'npc' | 'loot';
  service?: InteriorService;
  npcName?: string;
  npcLine?: string;
  price?: number;
  reward?: number;
}

export interface InteriorInstance {
  site: CitySite;
  group: THREE.Group;
  colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  spawn: THREE.Vector3;
  spawnYaw: number;
  points: InteriorPointDef[];
  center: THREE.Vector3;
  roomW: number;
  roomD: number;
  actors: InteriorActor[];
}

const BASE_X = 700;
const ROOM_GAP = 80;
const WALL_H = 3.8;
const ROOM_SCALE_W = 1.75;
const ROOM_SCALE_D = 1.7;
const ACTOR_RADIUS = 0.42;

const materialCache = new Map<number, THREE.MeshStandardMaterial>();

function mat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  let material = materialCache.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
    materialCache.set(color, material);
  }
  return material;
}

function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  color: number,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addLabel(
  parent: THREE.Object3D,
  text: string,
  x: number,
  y: number,
  z: number,
  w = 4,
  rotationY = 0
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 502, 118);
    ctx.fillStyle = '#ffd24a';
    let size = 60;
    ctx.font = `bold ${size}px Arial, sans-serif`;
    while (size > 22 && ctx.measureText(text).width > 468) {
      size -= 3;
      ctx.font = `bold ${size}px Arial, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w / 4),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
}

interface SiteConfig {
  height: number;
  roomW: number;
  roomD: number;
  wallColor: number;
  floorColor: number;
  accent: number;
  service: InteriorService;
  npcName: string;
  npcLine: string;
  signBg: string;
  signFg: string;
}

const SITE_CONFIG: Record<SiteKind, SiteConfig> = {
  hotel: {
    height: 14,
    roomW: 15,
    roomD: 11,
    wallColor: 0xc9b997,
    floorColor: 0x8a6b45,
    accent: 0xf0d878,
    service: 'heal',
    npcName: 'Hotel Clerk',
    npcLine: 'Welcome to Hotel Kano. A room will fix you right up.',
    signBg: '#1a2744',
    signFg: '#f0d878'
  },
  club: {
    height: 8,
    roomW: 15,
    roomD: 11,
    wallColor: 0x3a2a4a,
    floorColor: 0x241a2e,
    accent: 0xff6ad5,
    service: 'none',
    npcName: 'DJ Ayo',
    npcLine: 'Ayo dey play tonight. Keep the party peaceful, abeg.',
    signBg: '#2a1040',
    signFg: '#ff6ad5'
  },
  police: {
    height: 7,
    roomW: 14,
    roomD: 10,
    wallColor: 0xa8b4c0,
    floorColor: 0x6a7682,
    accent: 0x4a7fff,
    service: 'police',
    npcName: 'Desk Sergeant',
    npcLine: 'If you have a report, make it quick. We are watching this area.',
    signBg: '#1a3060',
    signFg: '#e8e8e6'
  },
  market: {
    height: 5,
    roomW: 18,
    roomD: 12,
    wallColor: 0xc9a86a,
    floorColor: 0x8b6b45,
    accent: 0xd4a12f,
    service: 'shop',
    npcName: 'Mama Nkechi',
    npcLine: 'Fresh provisions and ammo for the road. Wetin you need?',
    signBg: '#3a2510',
    signFg: '#ffd24a'
  },
  school: {
    height: 6,
    roomW: 16,
    roomD: 11,
    wallColor: 0xd8d2c2,
    floorColor: 0xb0a48c,
    accent: 0x2f7f5b,
    service: 'none',
    npcName: 'Teacher Bola',
    npcLine: 'The children are in class. Please keep the noise down.',
    signBg: '#173a2b',
    signFg: '#d9f0e2'
  },
  hospital: {
    height: 7,
    roomW: 14,
    roomD: 10,
    wallColor: 0xe0e6e2,
    floorColor: 0xc8d0cc,
    accent: 0x2f9f7a,
    service: 'heal',
    npcName: 'Nurse Ada',
    npcLine: 'You look rough. We can treat you now.',
    signBg: '#123a2e',
    signFg: '#d9f5ea'
  },
  garage: {
    height: 6.6,
    roomW: 23,
    roomD: 16,
    wallColor: 0x8f969c,
    floorColor: 0x4c5258,
    accent: 0xd4a12f,
    service: 'garage',
    npcName: 'Mechanic Emeka',
    npcLine: 'Bring your ride around. I go fix am sharp sharp.',
    signBg: '#26292e',
    signFg: '#ffd24a'
  },
  restaurant: {
    height: 4.5,
    roomW: 13,
    roomD: 10,
    wallColor: 0xd8ba8a,
    floorColor: 0x9a6b3f,
    accent: 0xc94b33,
    service: 'food',
    npcName: 'Mama Put',
    npcLine: 'Rice, beans, ewa agoyin. Eat well before you hit the road.',
    signBg: '#3a1810',
    signFg: '#ffd9a0'
  },
  shop: {
    height: 4.2,
    roomW: 12,
    roomD: 9,
    wallColor: 0xbfa58a,
    floorColor: 0x8a7052,
    accent: 0x2f6fa8,
    service: 'shop',
    npcName: 'Shopkeeper Yemi',
    npcLine: 'We get ammo, medicine, and streetwear too. Need a fresh look?',
    signBg: '#10263a',
    signFg: '#cfe8ff'
  },
  house: {
    height: 4.6,
    roomW: 12,
    roomD: 9,
    wallColor: 0xcdbb9e,
    floorColor: 0x7a5a38,
    accent: 0xd4a12f,
    service: 'none',
    npcName: 'Hauwa',
    npcLine: 'Thank you for bringing the generator fuel. We can finish dinner before the light comes back.',
    signBg: '#2c2010',
    signFg: '#ffd9a0'
  },
  fuel: {
    height: 4.5,
    roomW: 12,
    roomD: 9,
    wallColor: 0xd8d8d0,
    floorColor: 0x7a8086,
    accent: 0xd43a2a,
    service: 'shop',
    npcName: 'Fuel Attendant',
    npcLine: 'Snacks, drinks, and supplies. No fuel for walking shoes.',
    signBg: '#3a1210',
    signFg: '#ffd9a0'
  }
};

const LAPO_CONFIG: SiteConfig = {
  height: 5.2,
  roomW: 13,
  roomD: 10,
  wallColor: 0xc6d8c2,
  floorColor: 0x7d8f78,
  accent: 0x218451,
  service: 'loan',
  npcName: 'LAPO Agent',
  npcLine: 'Need a small bridge till payday? This is a game loan with clear repayment terms.',
  signBg: '#154b35',
  signFg: '#e5f5df'
};

const GARAGE_LOBBY_CONFIG: SiteConfig = {
  height: 5.2,
  roomW: 14,
  roomD: 10,
  wallColor: 0xc3b69e,
  floorColor: 0x777269,
  accent: 0xd4a12f,
  service: 'none',
  npcName: 'Garage Receptionist',
  npcLine: 'Welcome to Okada Garage. The workshop entrance is next door.',
  signBg: '#303c3f',
  signFg: '#ffd24a'
};

function siteConfig(site: CitySite): SiteConfig {
  if (site.id === 'lapo-office') return LAPO_CONFIG;
  if (site.id === 'garage-lobby') return GARAGE_LOBBY_CONFIG;
  return SITE_CONFIG[site.kind];
}

export class Interiors {
  readonly instances: InteriorInstance[] = [];
  private byId = new Map<string, InteriorInstance>();
  private active: InteriorInstance | null = null;
  private markers: THREE.Group = new THREE.Group();
  private markerTime = 0;
  private outdoor: THREE.Object3D[] = [];
  private extraOutdoor: THREE.Object3D[] = [];
  private doors = new Map<string, InteriorDoor>();
  private onKilled: ((position: THREE.Vector3) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private city: City
  ) {
    this.outdoor = [city.group];
    this.scene.add(this.markers);
    let index = 0;
    for (const site of city.sites) {
      const interior = this.buildInterior(site, index);
      this.instances.push(interior);
      this.byId.set(site.id, interior);
      // Keep every room hidden until entered: invisible groups are skipped by the
      // renderer, so their lights and geometry cost nothing outdoors.
      interior.group.visible = false;
      this.scene.add(interior.group);
      index += 1;
      if (site.buildShell) this.buildExterior(site);
      this.buildEntranceDoor(site);
      this.buildEntranceMarker(site);
    }
  }

  get isInside(): boolean {
    return this.active !== null;
  }

  get activeInterior(): InteriorInstance | null {
    return this.active;
  }

  get activeColliders(): InteriorInstance['colliders'] {
    return this.active?.colliders ?? [];
  }

  get points(): InteriorPointDef[] {
    return this.active?.points ?? [];
  }

  setOutdoorRoots(roots: THREE.Object3D[]): void {
    this.outdoor = [...roots, ...this.extraOutdoor];
  }

  setEntranceOpen(siteId: string, open: boolean): void {
    const door = this.doors.get(`out:${siteId}`);
    if (door) door.target = open ? (door.lift ? 3.35 : 1.55 * door.axis) : 0;
  }

  setInteriorDoorOpen(siteId: string, open: boolean): void {
    const door = this.doors.get(`in:${siteId}`);
    if (door) door.target = open ? 1.5 : 0;
  }

  get activeActors(): InteriorActor[] {
    return this.active?.actors ?? [];
  }

  actorNear(position: THREE.Vector3, range: number): InteriorActor | null {
    const actors = this.active?.actors;
    if (!actors) return null;
    let best: InteriorActor | null = null;
    let bestDistance = range;
    for (const actor of actors) {
      if (actor.dead) continue;
      const distance = Math.hypot(
        actor.group.position.x - position.x,
        actor.group.position.z - position.z
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = actor;
      }
    }
    return best;
  }

  pushOutActors(position: THREE.Vector3, radius: number): void {
    const actors = this.active?.actors;
    if (!actors) return;
    for (const actor of actors) {
      if (actor.dead) continue;
      const dx = position.x - actor.group.position.x;
      const dz = position.z - actor.group.position.z;
      const distance = Math.hypot(dx, dz);
      const min = radius + ACTOR_RADIUS;
      if (distance >= min || distance < 0.0001) continue;
      const push = (min - distance) / distance;
      position.x += dx * push;
      position.z += dz * push;
    }
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, range: number): CombatHit | null {
    const actors = this.active?.actors;
    if (!actors) return null;
    let target: InteriorActor | null = null;
    let best = Infinity;
    let bestPoint: THREE.Vector3 | null = null;

    for (const actor of actors) {
      if (actor.dead) continue;
      const center = actor.group.position.clone().setY(1.0);
      const to = center.clone().sub(origin);
      const along = to.dot(dir);
      if (along < 0.4 || along > range || along >= best) continue;
      const closest = origin.clone().addScaledVector(dir, along);
      if (closest.distanceTo(center) > 0.62) continue;
      best = along;
      target = actor;
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
      label: victim.name,
      hit: (damage) => {
        if (victim.dead) return false;
        return this.hitActor(victim, damage, from);
      }
    };
  }

  punchNear(
    at: THREE.Vector3,
    forward: THREE.Vector3,
    damage: number
  ): { killed: boolean; point: THREE.Vector3 } | null {
    const actors = this.active?.actors;
    if (!actors) return null;
    let target: InteriorActor | null = null;
    let best = Infinity;
    for (const actor of actors) {
      if (actor.dead) continue;
      const dx = actor.group.position.x - at.x;
      const dz = actor.group.position.z - at.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 2.1 || distance < 0.001) continue;
      const facing = (dx * forward.x + dz * forward.z) / distance;
      if (facing < 0.25) continue;
      if (distance < best) {
        best = distance;
        target = actor;
      }
    }
    if (!target) return null;
    const point = target.group.position.clone().setY(1.05);
    return { killed: this.hitActor(target, damage, at), point };
  }

  setKilledCallback(callback: (position: THREE.Vector3) => void): void {
    this.onKilled = callback;
  }

  private hitActor(actor: InteriorActor, damage: number, at: THREE.Vector3): boolean {
    const killed = damageHealth(actor.health, damage, performance.now() / 1000);
    this.panicActors(at, 6);
    if (!killed) return false;
    actor.dead = true;
    actor.speed = 0;
    actor.group.rotation.z = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 - 0.08);
    actor.group.position.y += 0.1;
    this.onKilled?.(actor.group.position.clone());
    return true;
  }

  private panicActors(at: THREE.Vector3, radius: number): void {
    for (const actor of this.active?.actors ?? []) {
      if (actor.dead) continue;
      const distance = Math.hypot(actor.group.position.x - at.x, actor.group.position.z - at.z);
      if (distance < radius) {
        actor.speed = 2.4;
        actor.pause = 0;
      }
    }
  }

  enter(siteId: string): InteriorInstance | null {
    const interior = this.byId.get(siteId);
    if (!interior) return null;
    for (const root of this.outdoor) root.visible = false;
    for (const instance of this.instances) instance.group.visible = false;
    interior.group.visible = true;
    this.active = interior;
    return interior;
  }

  exit(): { position: THREE.Vector3; yaw: number } | null {
    const active = this.active;
    if (!active) return null;
    active.group.visible = false;
    this.active = null;
    for (const root of this.outdoor) root.visible = true;
    const site = active.site;
    const yaw = site.facing + Math.PI;
    const x = site.entranceX + Math.sin(yaw) * 1.6;
    const z = site.entranceZ + Math.cos(yaw) * 1.6;
    return {
      position: new THREE.Vector3(x, this.city.groundHeightAt(x, z), z),
      yaw
    };
  }

  update(dt: number): void {
    this.markerTime += dt;
    for (const marker of this.markers.children) {
      marker.rotation.y += dt * 1.6;
      marker.position.y = marker.userData.baseY + Math.sin(this.markerTime * 2 + marker.userData.phase) * 0.18;
    }

    for (const door of this.doors.values()) {
      const current = door.lift ? door.pivot.position.y : door.pivot.rotation.y;
      const delta = door.target - current;
      if (Math.abs(delta) > 0.002) {
        const next = current + delta * (1 - Math.exp(-11 * dt));
        if (door.lift) door.pivot.position.y = next;
        else door.pivot.rotation.y = next;
      }
    }

    const actors = this.active?.actors;
    if (!actors) return;
    for (const actor of actors) {
      if (actor.dead) {
        actor.deadTimer += dt;
        continue;
      }
      if (actor.pause > 0) {
        actor.pause -= dt;
        actor.animator.update(actor.rig, dt, 0, 1.8);
        continue;
      }
      const target = actor.waypoints[actor.waypoint];
      if (!target) continue;
      const dx = target.x - actor.group.position.x;
      const dz = target.z - actor.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.24) {
        actor.waypoint = (actor.waypoint + 1) % actor.waypoints.length;
        actor.pause = 0.4 + Math.random() * 2.4;
        continue;
      }
      const step = Math.min(actor.speed * dt, distance);
      actor.group.position.x += (dx / distance) * step;
      actor.group.position.z += (dz / distance) * step;
      actor.group.rotation.y = Math.atan2(dx, dz);
      actor.animator.update(actor.rig, dt, actor.speed, 1.8);
    }
  }

  private buildExterior(site: CitySite): void {
    const cfg = siteConfig(site);
    const group = new THREE.Group();
    const h = cfg.height;
    const x = site.x;
    const z = site.z;
    const w = site.width;
    const d = site.depth;
    const t = 0.45;
    const doorW = site.kind === 'garage' ? 5.2 : 1.7;
    const doorH = site.kind === 'garage' ? 3.2 : 2.5;
    const frontX = site.entranceX + site.side * 1.9;
    const frontWallX = frontX + site.side * (t / 2);
    const backWallX = x + site.side * (w / 2 - t / 2);
    const sideSeg = Math.max(0.1, (d - doorW) / 2);

    // Side walls (along the depth edges) and the back wall.
    addBox(group, w, h, t, cfg.wallColor, x, h / 2, z - d / 2 + t / 2);
    addBox(group, w, h, t, cfg.wallColor, x, h / 2, z + d / 2 - t / 2);
    addBox(group, t, h, d, cfg.wallColor, backWallX, h / 2, z);

    // Front wall split around a real doorway.
    addBox(group, t, h, sideSeg, cfg.wallColor, frontWallX, h / 2, z - d / 2 + sideSeg / 2);
    addBox(group, t, h, sideSeg, cfg.wallColor, frontWallX, h / 2, z + d / 2 - sideSeg / 2);
    addBox(group, t, h - doorH, doorW, cfg.wallColor, frontWallX, doorH + (h - doorH) / 2, z);

    addBox(group, w + 0.3, 0.4, d + 0.3, cfg.accent, x, h + 0.2, z);
    addBox(group, w + 0.2, 0.5, d + 0.2, 0x8a8272, x, 0.25, z);
    addBox(group, w - t * 2, 0.1, d - t * 2, cfg.floorColor, x, 0.06, z);

    // Door frame and a warm light so the opening reads as an entrance.
    addBox(group, 0.16, doorH + 0.18, 0.14, cfg.accent, frontX - site.side * 0.04, (doorH + 0.18) / 2, z - doorW / 2 - 0.07);
    addBox(group, 0.16, doorH + 0.18, 0.14, cfg.accent, frontX - site.side * 0.04, (doorH + 0.18) / 2, z + doorW / 2 + 0.07);
    addBox(group, 0.16, 0.18, doorW + 0.28, cfg.accent, frontX - site.side * 0.04, doorH + 0.09, z);
    const threshold = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.06, doorW),
      new THREE.MeshStandardMaterial({ color: 0x1d211f, roughness: 0.9 })
    );
    threshold.position.set(frontX + site.side * 0.55, 0.11, z);
    group.add(threshold);

    const sign = new THREE.Group();
    addLabel(sign, site.label, 0, 0, 0, Math.min(6, site.width * 0.8));
    sign.position.set(frontX - site.side * 0.16, h - 1.1, z);
    sign.rotation.y = site.side * (Math.PI / 2);
    group.add(sign);

    const lightColor = cfg.accent;
    const doorGlow = new THREE.PointLight(lightColor, 7, 9, 1.8);
    doorGlow.position.set(frontX - site.side * 0.9, 2.4, z);
    if (!IS_ANDROID) group.add(doorGlow);

    this.scene.add(group);
    this.extraOutdoor.push(group);

    // Batch the static shell boxes into one vertex-colored mesh; the sign group stays separate.
    mergeDirectMeshes(group, 'vertexColor');

    const addCollider = (x0: number, x1: number, z0: number, z1: number): void => {
      this.city.colliders.push({
        minX: Math.min(x0, x1),
        maxX: Math.max(x0, x1),
        minZ: Math.min(z0, z1),
        maxZ: Math.max(z0, z1)
      });
    };

    addCollider(x - w / 2, x + w / 2, z - d / 2, z - d / 2 + t);
    addCollider(x - w / 2, x + w / 2, z + d / 2 - t, z + d / 2);
    addCollider(backWallX - t / 2, backWallX + t / 2, z - d / 2, z + d / 2);
    addCollider(frontWallX - t / 2, frontWallX + t / 2, z - d / 2, z - d / 2 + sideSeg);
    addCollider(frontWallX - t / 2, frontWallX + t / 2, z + d / 2 - sideSeg, z + d / 2);

  }

  private buildEntranceDoor(site: CitySite): void {
    const cfg = siteConfig(site);
    const frontX = site.buildShell
      ? site.entranceX + site.side * 1.9
      : site.x - site.side * (site.width / 2);
    const doorW = site.kind === 'garage' ? 5.2 : site.buildShell ? 1.7 : 2.4;
    const doorH = site.kind === 'garage' ? 3.2 : 2.42;
    const group = new THREE.Group();

    if (site.kind === 'garage') {
      const panel = new THREE.Group();
      panel.position.set(frontX, 0, site.z);
      group.add(panel);
      const slatCount = 18;
      const slatHeight = doorH / slatCount;
      for (let i = 0; i < slatCount; i += 1) {
        addBox(
          panel,
          0.14,
          slatHeight * 0.76,
          doorW - 0.12,
          i % 3 === 0 ? 0x7d8789 : 0x566164,
          0,
          slatHeight * (i + 0.5),
          0
        );
      }
      for (const side of [-1, 1]) {
        addBox(group, 0.28, doorH + 0.25, 0.2, 0x424a4c, frontX, doorH / 2, site.z + side * (doorW / 2 + 0.13));
      }
      addBox(group, 0.34, 0.42, doorW + 0.55, 0x353d40, frontX, doorH + 0.22, site.z);
      addLabel(group, 'OKADA GARAGE · AUTO SERVICE', frontX - site.side * 0.42, doorH + 0.55, site.z, 7.1, -site.side * (Math.PI / 2));
      this.scene.add(group);
      this.extraOutdoor.push(group);
      this.doors.set(`out:${site.id}`, { pivot: panel, target: 0, axis: site.side, lift: true });
      return;
    }

    const hingeX = frontX - site.side * 0.06;
    const hingeZ = site.z - doorW / 2;
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, hingeZ);
    group.add(pivot);

    addBox(pivot, 0.11, doorH, doorW - 0.05, 0x6a4a2e, 0, doorH / 2, doorW / 2);
    addBox(pivot, 0.14, 0.95, doorW - 0.62, 0x2e4448, 0, 1.72, doorW / 2);
    addBox(pivot, 0.14, 0.1, doorW - 0.5, cfg.accent, 0, 1.23, doorW / 2);
    addBox(pivot, 0.15, 0.06, 0.24, 0xd8c070, 0.01, 1.06, doorW - 0.28);
    addBox(pivot, 0.12, 0.24, 0.12, 0x3a2c1e, 0, 0.14, 0.28);

    pivot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    mergeDirectMeshes(pivot, 'vertexColor');

    addLabel(group, 'OPEN', frontX - site.side * 0.16, doorH + 0.32, site.z, 1.5, -site.side * (Math.PI / 2));

    this.scene.add(group);
    this.extraOutdoor.push(group);
    this.doors.set(`out:${site.id}`, { pivot, target: 0, axis: site.side });
  }

  private buildActors(
    site: CitySite,
    cfg: SiteConfig,
    group: THREE.Group,
    baseX: number,
    roomW: number,
    roomD: number
  ): InteriorActor[] {
    const actors: InteriorActor[] = [];
    const wx = roomW / 2 - 3.6;
    const wz = roomD / 2 - 3.2;
    const workshopEndX = baseX + roomW / 2 - 10;
    const ring: Array<[number, number]> = site.kind === 'garage'
      ? [
          [baseX - roomW / 2 + 4, wz],
          [workshopEndX - 3, wz],
          [workshopEndX - 3, -wz * 0.35],
          [baseX - roomW / 2 + 4, -wz * 0.35]
        ]
      : [
      [baseX - wx * 0.55, wz],
      [baseX + wx * 0.55, wz],
      [baseX + wx * 0.55, -wz * 0.35],
      [baseX - wx * 0.55, -wz * 0.35]
        ];

    const specs: Array<{
      name: string;
      line: string;
      shirt: number;
      pants: number;
      cap?: boolean;
      headwrap?: boolean;
      glasses?: boolean;
      vest?: boolean;
      hairStyle?: 'fade' | 'afro' | 'bald';
      speed: number;
      start: [number, number];
      path: Array<[number, number]>;
    }> = [];

    if (site.kind === 'hospital') {
      const front = roomD / 2 - 4.0;
      const mid = roomD / 2 - 7.2;
      specs.push(
        {
          name: 'Nurse Ada',
          line: 'Hold still, I go treat you. The doctor dey come.',
          shirt: 0xf4f8f5,
          pants: 0xd2e4dc,
          cap: true,
          speed: 1.0,
          start: [baseX - 3.5, front],
          path: [
            [baseX - 3.5, front],
            [baseX + 6.5, front],
            [baseX + 6.5, mid],
            [baseX - 3.5, mid]
          ]
        },
        {
          name: 'Nurse Chika',
          line: 'Ward round now. No loud noise, patients dey rest.',
          shirt: 0xe8f2ee,
          pants: 0xc6d8d0,
          cap: true,
          speed: 1.15,
          start: [baseX + 4.0, -roomD / 2 + 3.4],
          path: [
            [baseX + 4.0, -roomD / 2 + 3.4],
            [baseX + 4.0, mid],
            [baseX - 4.0, mid],
            [baseX - 4.0, -roomD / 2 + 3.4]
          ]
        },
        {
          name: 'Patient Emeka',
          line: 'My chest dey pain me small. Abeg, help me call nurse.',
          shirt: 0xbcd2dc,
          pants: 0xa8bcc6,
          speed: 0.55,
          start: [baseX - 1.8, front - 0.8],
          path: [
            [baseX - 1.8, front - 0.8],
            [baseX + 1.8, front - 0.8],
            [baseX + 1.8, mid - 0.6],
            [baseX - 1.8, mid - 0.6]
          ]
        },
        {
          name: 'Patient Bisi',
          line: 'I wan go home. This bed no comfortable at all.',
          shirt: 0xc8d4e0,
          pants: 0xb4c2cc,
          speed: 0.5,
          start: [baseX + 2.4, mid - 1.2],
          path: [
            [baseX + 2.4, mid - 1.2],
            [baseX + 6.0, mid - 1.2],
            [baseX + 6.0, front - 1.6],
            [baseX + 2.4, front - 1.6]
          ]
        },
        {
          name: 'Patient Tunde',
          line: 'Nurse say I go fit go home tomorrow. Thank God.',
          shirt: 0xd4dce2,
          pants: 0xbcc8ce,
          speed: 0.6,
          start: [baseX - 5.0, mid],
          path: [
            [baseX - 5.0, mid],
            [baseX - 5.0, front - 1.2],
            [baseX - 1.0, front - 1.2]
          ]
        }
      );
    } else if (site.kind === 'police') {
      specs.push(
        {
          name: 'Officer Musa',
          line: 'Keep your hands where I can see them. Wetin you want?',
          shirt: 0x243c6e,
          pants: 0x1c2a48,
          cap: true,
          speed: 0.8,
          start: [baseX + 3.5, wz * 0.5],
          path: ring
        },
        {
          name: 'Officer Ngozi',
          line: 'If you see any trouble, report am. We dey patrol.',
          shirt: 0x2c4a80,
          pants: 0x1c2a48,
          cap: true,
          speed: 0.9,
          start: [baseX - 3.0, -wz * 0.3],
          path: ring
        }
      );
    } else if (site.kind === 'club') {
      for (let i = 0; i < 4; i += 1) {
        specs.push({
          name: ['DJ Ayo', 'Dancer Tola', 'Dancer Kele', 'Barman Sunny'][i],
          line: ['Make we groove!', 'The beat dey sweet!', 'Buy me a drink, now now.', 'Cold beer dey here, oga.'][i],
          shirt: [0xff6ad5, 0x4a7fff, 0xd4a12f, 0x2f7f5b][i],
          pants: [0x2a2035, 0x22252e, 0x3a2a40, 0x1a1a22][i],
          speed: 1.1,
          start: [baseX - 4 + i * 3.5, wz * 0.4],
          path: ring
        });
      }
    } else if (site.kind === 'restaurant' || site.kind === 'market' || site.kind === 'shop' || site.kind === 'fuel') {
      for (let i = 0; i < 3; i += 1) {
        specs.push({
          name: ['Customer Dayo', 'Customer Halima', 'Customer Nkechi'][i],
          line: ['Abeg, give me one plate.', 'How much be this one?', 'Add small pepper for me.'][i],
          shirt: [0xc94b33, 0x2f7f5b, 0x63398c][i],
          pants: [0x2c2c30, 0x3f4a5c, 0x6b5b43][i],
          headwrap: i === 2,
          speed: 0.75,
          start: [baseX + 2.0 + i * 2.0, wz * 0.3],
          path: ring
        });
      }
    } else if (site.kind === 'school') {
      for (let i = 0; i < 3; i += 1) {
        specs.push({
          name: ['Student Femi', 'Student Ada', 'Teacher Grace'][i],
          line: ['We dey learn computer today.', 'Teacher say no running inside class.', 'Sit down and open your book.'][i],
          shirt: [0x2f6fa8, 0x2f6fa8, 0xd4a12f][i],
          pants: [0x22304a, 0x22304a, 0x3a3a3a][i],
          glasses: i === 2,
          speed: 0.9,
          start: [baseX - 2.5 + i * 3.5, wz * 0.4],
          path: ring
        });
      }
    } else if (site.kind === 'hotel') {
      specs.push(
        {
          name: 'Bellhop Sunday',
          line: 'Welcome, oga. Your room dey ready upstairs.',
          shirt: 0xf0d878,
          pants: 0x1a2744,
          cap: true,
          speed: 0.8,
          start: [baseX + 4.0, wz * 0.4],
          path: ring
        },
        {
          name: 'Cleaner Ify',
          line: 'Sorry, I dey clean this side. Mind your shoes.',
          shirt: 0x7fb8a0,
          pants: 0x2f4a3a,
          headwrap: true,
          speed: 0.7,
          start: [baseX - 4.0, -wz * 0.2],
          path: ring
        }
      );
    } else if (site.kind === 'garage') {
      specs.push(
        {
          name: 'Apprentice Ife',
          line: 'Bring the motor, I go check the engine.',
          shirt: 0xb03028,
          pants: 0x2f343a,
          speed: 0.8,
          start: [baseX + 2.0, wz * 0.4],
          path: ring
        },
        {
          name: 'Mechanic Sule',
          line: 'This engine don suffer. You get money?',
          shirt: 0x3a3d4a,
          pants: 0x2c2c30,
          cap: true,
          speed: 0.75,
          start: [baseX + 4.0, -wz * 0.25],
          path: ring
        }
      );
    } else if (site.kind === 'house') {
      specs.push(
        {
          name: 'Neighbour Yemi',
          line: 'Ah, you enter my parlour? Abeg, no touch anything.',
          shirt: 0xd9d2c2,
          pants: 0x6b5b43,
          speed: 0.6,
          start: [baseX + 3.0, wz * 0.3],
          path: ring
        },
        {
          name: 'Aunty Bola',
          line: 'You don eat? Sit down, food dey warm.',
          shirt: 0x8f2f5c,
          pants: 0x63398c,
          headwrap: true,
          speed: 0.55,
          start: [baseX - 2.0, -wz * 0.3],
          path: ring
        }
      );
    }

    for (const spec of specs) {
      const colors: CharacterColors = {
        skin: pickValue([0x7a4a28, 0x8a5a36, 0x6b3f22, 0x9a6a45, 0x5c3218]),
        shirt: spec.shirt,
        pants: spec.pants,
        shoes: 0x18191c,
        accent: 0xf0f0ea,
        hair: 0x14100d
      };
      const rig = createCharacter(colors, 1.7 + Math.random() * 0.1, {
        build: 0.95 + Math.random() * 0.1,
        hairStyle: spec.hairStyle ?? (Math.random() < 0.3 ? 'afro' : 'fade'),
        cap: spec.cap ?? false,
        capColor: 0xe8e4dc,
        headwrap: spec.headwrap ?? false,
        headwrapColor: pickValue([0xd4a12f, 0xc94b33, 0x2f7f5b, 0x63398c]),
        glasses: spec.glasses ?? false,
        vest: spec.vest ?? false,
        vestColor: pickValue([0x1f2a44, 0x2a2f38, 0x3a3a3a]),
        sleeves: 'short',
        bottoms: 'long',
        beard: Math.random() < 0.25
      });
      rig.group.position.set(spec.start[0], 0.02, spec.start[1]);
      group.add(rig.group);

      const waypoints = spec.path.map(([x, z]) => new THREE.Vector3(x, 0.02, z));
      actors.push({
        id: `${site.id}-actor-${actors.length}`,
        group: rig.group,
        rig,
        animator: new HumanoidAnimator(Math.random() * Math.PI * 2),
        name: spec.name,
        line: spec.line,
        speed: spec.speed,
        waypoints,
        waypoint: 0,
        pause: Math.random() * 1.2,
        health: createHealth(40),
        dead: false,
        deadTimer: 0
      });
    }

    void cfg;
    return actors;
  }

  private buildEntranceMarker(site: CitySite): void {
    const marker = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.7, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85 })
    );
    cone.rotation.x = Math.PI;
    marker.add(cone);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.3, 26),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.45;
    marker.add(ring);
    const y = this.city.groundHeightAt(site.entranceX, site.entranceZ) + 1.6;
    marker.position.set(site.entranceX, y, site.entranceZ);
    marker.userData.baseY = y;
    marker.userData.phase = Math.random() * Math.PI * 2;
    this.markers.add(marker);
  }

  private buildInterior(site: CitySite, index: number): InteriorInstance {
    const cfg = siteConfig(site);
    const group = new THREE.Group();
    const baseX = BASE_X + index * ROOM_GAP;
    const roomW = Math.round(cfg.roomW * ROOM_SCALE_W);
    const roomD = Math.round(cfg.roomD * ROOM_SCALE_D);
    const floorY = 0.02;
    const colliders: InteriorInstance['colliders'] = [];

    addBox(group, roomW, 0.2, roomD, cfg.floorColor, baseX, floorY - 0.1, 0);

    const wall = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
      addBox(group, w, h, d, cfg.wallColor, x, y, z);
      colliders.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2
      });
    };

    const exitWidth = 2.0;
    const exitSeg = (roomD - exitWidth) / 2;
    const exitX = baseX - roomW / 2;

    wall(roomW, WALL_H, 0.3, baseX, WALL_H / 2, -roomD / 2);
    wall(roomW, WALL_H, 0.3, baseX, WALL_H / 2, roomD / 2);
    wall(0.3, WALL_H, roomD, baseX + roomW / 2, WALL_H / 2, 0);
    // Left wall is split around a real exit doorway.
    wall(0.3, WALL_H, exitSeg, exitX, WALL_H / 2, -roomD / 2 + exitSeg / 2);
    wall(0.3, WALL_H, exitSeg, exitX, WALL_H / 2, roomD / 2 - exitSeg / 2);
    wall(0.3, WALL_H - 2.35, exitWidth, exitX, 2.35 + (WALL_H - 2.35) / 2, 0);
    // Invisible collider keeps the player from walking through the open door.
    colliders.push({
      minX: exitX - 0.15,
      maxX: exitX + 0.15,
      minZ: -exitWidth / 2,
      maxZ: exitWidth / 2
    });

    addBox(group, 0.3, 0.06, 2.2, cfg.accent, baseX - roomW / 2 + 0.18, 0.08, 0);
    addLabel(group, site.label, baseX, WALL_H - 0.62, roomD / 2 - 0.18, 4.2, Math.PI);

    this.buildInteriorDoor(group, site, exitX, exitWidth);

    addBox(group, 0.18, 0.12, 0.18, 0x8a9096, exitX + 0.28, 1.05, exitWidth / 2 - 0.18);
    addBox(group, 0.18, 0.12, 0.18, 0x8a9096, exitX + 0.28, 1.05, -exitWidth / 2 + 0.18);

    const doorLight = new THREE.PointLight(cfg.accent, 7, 12, 1.8);
    doorLight.position.set(baseX - roomW / 2 + 1.3, 2.4, 0);
    group.add(doorLight);
    const roomLight = new THREE.PointLight(0xfff2d0, 9, 20, 1.6);
    roomLight.position.set(baseX + roomW * 0.15, 3.1, 0);
    group.add(roomLight);

    const points: InteriorPointDef[] = [];

    const exitPos = new THREE.Vector3(baseX - roomW / 2 + 1.3, 0, 0);
    points.push({
      id: `${site.id}-exit`,
      label: 'LEAVE',
      position: exitPos.clone(),
      kind: 'exit'
    });

    const servicePos = new THREE.Vector3(baseX + 1.2, 0, -roomD / 2 + 1.25);
    if (cfg.service !== 'none') {
      addBox(group, 4.2, 0.95, 1.2, cfg.accent, servicePos.x, 0.52, -roomD / 2 + 1.25);
      addBox(group, 4.4, 0.08, 1.35, 0xe8e2d4, servicePos.x, 1.03, -roomD / 2 + 1.25);
      addBox(group, 4.4, 1.5, 0.16, 0x2a2f33, servicePos.x, 2.2, -roomD / 2 + 0.25);
      this.addNpc(group, cfg, baseX + 1.2, -roomD / 2 + 0.55);
      points.push({
        id: `${site.id}-service`,
        label: `USE ${cfg.service.toUpperCase()} COUNTER`,
        position: servicePos.clone(),
        kind: 'service',
        service: cfg.service,
        npcName: cfg.npcName,
        npcLine: cfg.npcLine
      });
    } else {
      this.addNpc(group, cfg, baseX + 0.8, -roomD / 2 + 0.8);
      points.push({
        id: `${site.id}-npc`,
        label: `TALK TO ${cfg.npcName.toUpperCase()}`,
        position: new THREE.Vector3(baseX + 0.8, 0, -roomD / 2 + 1.6),
        kind: 'npc',
        npcName: cfg.npcName,
        npcLine: cfg.npcLine
      });
    }

    this.addProps(group, site.kind, cfg, baseX, roomW, roomD, colliders);
    const actors = this.buildActors(site, cfg, group, baseX, roomW, roomD);

    if (site.kind === 'house') {
      addBox(group, 0.6, 0.4, 0.4, 0x2b2b2b, baseX + roomW / 2 - 1.4, 0.2, roomD / 2 - 1.2);
      points.push({
        id: `${site.id}-loot`,
        label: 'TAKE CASH',
        position: new THREE.Vector3(baseX + roomW / 2 - 1.4, 0, roomD / 2 - 1.8),
        kind: 'loot',
        reward: 120 + Math.floor(Math.random() * 80)
      });
    }

    const spawn = new THREE.Vector3(baseX - roomW / 2 + 3.6, 0, 0);
    const center = new THREE.Vector3(baseX, 0, 0);

    // Solid ceiling so the outdoor sky never shows above the interior walls.
    addBox(group, roomW, 0.25, roomD, cfg.wallColor, baseX, WALL_H + 0.125, 0);

    // Batch the static room geometry; doors and walking actors remain separate groups.
    mergeDirectMeshes(group, 'material');

    return {
      site,
      group,
      colliders,
      spawn,
      spawnYaw: Math.PI / 2,
      points,
      center,
      roomW,
      roomD,
      actors
    };
  }

  private buildInteriorDoor(group: THREE.Group, site: CitySite, exitX: number, width: number): void {
    const pivot = new THREE.Group();
    pivot.position.set(exitX + 0.02, 0, -width / 2);
    group.add(pivot);

    const panel = addBox(pivot, 0.09, 2.3, width - 0.04, 0x5c4530, 0.04, 1.15, width / 2);
    panel.material = mat(0x5c4530);
    addBox(pivot, 0.12, 0.85, width - 0.5, 0x2a3b3f, 0.11, 1.72, width / 2);
    addBox(pivot, 0.16, 0.07, 0.24, 0xd9c06a, 0.14, 1.06, width - 0.28);
    addBox(pivot, 0.12, 2.32, 0.12, 0x3a2c1e, 0.02, 1.16, 0.06);

    pivot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.doors.set(`in:${site.id}`, {
      pivot,
      target: 0,
      axis: exitX + 0.02
    });
  }

  private addNpc(group: THREE.Group, cfg: SiteConfig, x: number, z: number): void {
    const colors: CharacterColors = {
      skin: 0x7a4a28,
      shirt: cfg.accent,
      pants: 0x2c2c30,
      shoes: 0x18191c,
      accent: 0xf0f0ea,
      hair: 0x14100d
    };
    const rig = createCharacter(colors, 1.78, {
      build: 1,
      hairStyle: 'fade',
      cap: false,
      sleeves: 'short',
      bottoms: 'long',
      beard: true
    });
    rig.group.position.set(x, 0.02, z);
    rig.group.rotation.y = 0;
    group.add(rig.group);
  }

  private addProps(
    group: THREE.Group,
    kind: SiteKind,
    cfg: SiteConfig,
    baseX: number,
    roomW: number,
    roomD: number,
    colliders: InteriorInstance['colliders']
  ): void {
    const prop = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): void => {
      addBox(group, w, h, d, color, baseX + x, y, z);
      colliders.push({
        minX: baseX + x - w / 2,
        maxX: baseX + x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2
      });
    };

    if (cfg.npcName === 'Garage Receptionist') {
      prop(5.2, 1.05, 1.1, 0x624a32, 4.2, 0.52, -roomD / 2 + 2.4);
      addBox(group, 5.3, 0.12, 1.18, 0xc6a76d, baseX + 4.2, 1.08, -roomD / 2 + 2.4);
      for (let i = 0; i < 4; i += 1) {
        const x = -4.8 + i * 2.7;
        prop(1.7, 0.45, 0.72, 0x3c545b, x, 0.25, 2.2);
        addBox(group, 1.7, 0.62, 0.14, 0x30464d, baseX + x, 0.72, 2.52);
      }
      addBox(group, 0.12, 1.5, 6.2, 0x40525a, baseX + roomW / 2 - 0.4, 1.7, 0);
      addBox(group, 0.12, 0.1, 6.2, 0xd4a12f, baseX + roomW / 2 - 0.32, 2.5, 0);
    } else if (kind === 'house') {
      // Sofa and coffee table on the right of the entry lane.
      prop(1.05, 0.42, 3.2, 0x4a3a2a, -roomW / 2 + 2.2, 0.21, -2.6);
      addBox(group, 0.95, 0.16, 3.0, 0xb8b0a0, baseX - roomW / 2 + 2.2, 0.5, -2.6);
      addBox(group, 0.3, 0.9, 3.2, 0x4a3a2a, baseX - roomW / 2 + 1.8, 0.65, -2.6);
      addBox(group, 0.95, 0.6, 0.24, 0x4a3a2a, baseX - roomW / 2 + 2.2, 0.52, -4.1);
      addBox(group, 0.95, 0.6, 0.24, 0x4a3a2a, baseX - roomW / 2 + 2.2, 0.52, -1.1);
      prop(1.4, 0.42, 0.9, 0x6a4a2f, -roomW / 2 + 5.2, 0.28, -2.6);
      addBox(group, 1.45, 0.08, 0.95, 0x8a6b45, baseX - roomW / 2 + 5.2, 0.53, -2.6);
      // Wall TV opposite the sofa.
      prop(0.16, 1.15, 1.95, 0x1c1c1c, roomW / 2 - 0.2, 1.72, -2.6);
      prop(0.5, 0.6, 1.7, 0x3a2c1e, roomW / 2 - 0.4, 0.3, -2.6);
      // Bed in the far corner and a dining table near the middle.
      prop(1.5, 0.32, 2.1, 0x5a4630, roomW / 2 - 3.2, 0.16, roomD / 2 - 2.6);
      addBox(group, 1.4, 0.2, 2.0, 0xd8d0c0, baseX + roomW / 2 - 3.2, 0.42, roomD / 2 - 2.6);
      addBox(group, 0.9, 0.14, 0.45, 0xf2eee4, baseX + roomW / 2 - 3.2, 0.58, roomD / 2 - 3.3);
      addCylinder(group, 0.65, 0.08, 0x3a2a1a, baseX - 2.0, 0.75, 3.2);
      addCylinder(group, 0.08, 0.7, 0x4a4a4a, baseX - 2.0, 0.38, 3.2);
      for (const dz of [-0.9, 0.9]) {
        prop(0.5, 0.1, 0.5, 0x4a3a2a, -2.0, 0.45, 3.2 + dz);
        addBox(group, 0.5, 0.5, 0.08, 0x4a3a2a, baseX - 2.0, 0.7, 3.2 + dz + (dz > 0 ? 0.21 : -0.21));
      }
    } else if (kind === 'shop' || kind === 'fuel' || kind === 'market') {
      const shelfZ = roomD / 2 - 1.8;
      for (let i = 0; i < 3; i += 1) {
        const sx = -roomW / 2 + 4.2 + i * 2.5;
        prop(1.6, 1.35, 0.7, 0x8a7052, sx, 0.68, shelfZ);
        for (let j = 0; j < 3; j += 1) {
          addBox(group, 1.4, 0.14, 0.6, [0xc94b33, 0x2f7f5b, 0xd4a12f][j % 3], baseX + sx, 0.46 + j * 0.36, shelfZ + 0.02);
        }
      }
      // Produce crates and a display table in the open floor.
      prop(1.7, 0.68, 1.15, 0x5a7a52, roomW / 2 - 3.4, 0.34, 1.6);
      addBox(group, 1.55, 0.2, 1.0, 0x9fbf6a, baseX + roomW / 2 - 3.4, 0.74, 1.6);
      prop(2.0, 0.55, 1.0, 0x6b5232, -roomW / 2 + 3.0, 0.28, 4.6);
      addBox(group, 2.1, 0.1, 1.1, 0x8a6b45, baseX - roomW / 2 + 3.0, 0.6, 4.6);
      if (kind === 'market') {
        const canopyColors = [0xc94b33, 0x2f7f5b, 0xd4a12f, 0x2f6fa8];
        for (let i = 0; i < 4; i += 1) {
          const sx = i % 2 === 0 ? -4.0 : 2.0;
          const sz = i < 2 ? -5.0 : 5.0;
          const color = canopyColors[i];
          prop(2.4, 0.8, 1.2, 0x8a7052, sx, 0.4, sz);
          addBox(group, 2.5, 0.1, 1.3, color, baseX + sx, 0.85, sz);
          for (const [ox, oz] of [[-1.12, -0.5], [1.12, -0.5], [-1.12, 0.5], [1.12, 0.5]]) {
            addBox(group, 0.07, 2.0, 0.07, 0x6a5a44, baseX + sx + ox, 1.0, sz + oz);
          }
          addBox(group, 2.7, 0.14, 1.6, color, baseX + sx, 2.05, sz);
          addBox(group, 0.5, 0.2, 0.4, 0xe0c060, baseX + sx - 0.7, 0.96, sz);
          addBox(group, 0.5, 0.2, 0.4, 0x7fb060, baseX + sx + 0.2, 0.96, sz);
          addBox(group, 0.5, 0.2, 0.4, 0xc94b33, baseX + sx + 0.85, 0.96, sz);
        }
      }
    } else if (kind === 'restaurant') {
      for (let i = 0; i < 3; i += 1) {
        prop(1.1, 0.1, 1.1, 0x8a6b45, -1.6 + i * 2.1, 0.75, 1.2);
        addCylinder(group, 0.09, 0.7, 0x4a4a4a, baseX - 1.6 + i * 2.1, 0.38, 1.2);
        for (const dz of [-0.8, 0.8]) {
          addBox(group, 0.45, 0.5, 0.45, 0xc94b33, baseX - 1.6 + i * 2.1, 0.25, 1.2 + dz);
        }
      }
    } else if (kind === 'school') {
      for (let i = 0; i < 4; i += 1) {
        prop(1.1, 0.1, 0.6, 0x9a7a4a, -1.8 + (i % 2) * 2.6, 0.75, 0.6 + Math.floor(i / 2) * 2.2);
        addBox(group, 0.45, 0.5, 0.45, 0x2f6fa8, baseX - 1.8 + (i % 2) * 2.6, 0.25, 1.2 + Math.floor(i / 2) * 2.2);
      }
      addBox(group, roomW * 0.55, 1.8, 0.08, 0x1f3a2f, baseX, 1.7, roomD / 2 - 0.22);
    } else if (kind === 'hospital') {
      const bedZ = roomD / 2 - 1.6;
      for (let i = 0; i < 4; i += 1) {
        const bx = -roomW / 2 + 3.4 + i * 2.6;
        // Frame, mattress, pillow, blanket and headboard.
        prop(1.05, 0.42, 2.15, 0xdde4e0, bx, 0.23, bedZ);
        addBox(group, 1.0, 0.18, 2.05, 0xf6f8f6, baseX + bx, 0.53, bedZ);
        addBox(group, 0.74, 0.14, 0.5, 0xffffff, baseX + bx, 0.68, bedZ - 0.7);
        addBox(group, 1.0, 0.12, 1.05, 0x8fc4b0, baseX + bx, 0.67, bedZ + 0.45);
        addBox(group, 1.05, 1.05, 0.1, 0xd2dcd6, baseX + bx, 0.52, bedZ - 1.12);
        // IV stand beside each bed.
        addBox(group, 0.05, 1.65, 0.05, 0x8e989c, baseX + bx + 0.66, 0.82, bedZ - 0.5);
        addBox(group, 0.2, 0.26, 0.14, 0xdfe8e4, baseX + bx + 0.66, 1.62, bedZ - 0.5);
        if (i < 3) {
          prop(0.8, 0.4, 0.55, 0x5a6a70, bx + 1.85, 0.2, bedZ + 0.4);
        }
      }
      // Wheelchair and a supply trolley in the open ward.
      prop(0.7, 0.9, 0.7, 0x3b5a66, -roomW / 2 + 2.0, 0.45, -1.6);
      prop(1.4, 0.8, 0.7, 0x8aa49a, roomW / 2 - 3.4, 0.4, -roomD / 2 + 2.2);
      addBox(group, 1.45, 0.1, 0.75, 0xd8e2dc, baseX + roomW / 2 - 3.4, 0.85, -roomD / 2 + 2.2);
      // Waiting chairs along the front wall.
      for (let i = 0; i < 6; i += 1) {
        const cx = -roomW / 2 + 3.0 + i * 1.25;
        const cz = -roomD / 2 + 1.35;
        prop(0.52, 0.1, 0.5, 0x4c7480, cx, 0.46, cz);
        addBox(group, 0.5, 0.55, 0.1, 0x3b5a66, baseX + cx, 0.72, cz - 0.2);
      }
      // Far-wall windows with frames.
      for (let i = 0; i < 3; i += 1) {
        const wz = -4.2 + i * 4.2;
        const wx = baseX + roomW / 2 - 0.09;
        addBox(group, 0.06, 1.5, 2.5, 0x6e93a0, wx, 2.15, wz);
        addBox(group, 0.1, 0.08, 2.7, 0xeef2ee, wx - 0.05, 2.9, wz);
        addBox(group, 0.1, 0.08, 2.7, 0xeef2ee, wx - 0.05, 1.4, wz);
        addBox(group, 0.1, 1.58, 0.08, 0xeef2ee, wx - 0.05, 2.15, wz - 1.31);
        addBox(group, 0.1, 1.58, 0.08, 0xeef2ee, wx - 0.05, 2.15, wz + 1.31);
      }
      // Wall clock and green cross.
      const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16), mat(0xf4f7f4));
      clock.rotation.x = Math.PI / 2;
      clock.position.set(baseX - 4.5, 2.9, -roomD / 2 + 0.18);
      group.add(clock);
      addBox(group, 0.5, 0.16, 0.06, 0x2f9f7a, baseX - 7.5, 2.85, -roomD / 2 + 0.18);
      addBox(group, 0.16, 0.5, 0.06, 0x2f9f7a, baseX - 7.5, 2.85, -roomD / 2 + 0.18);
      // Ceiling light panels.
      const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff6de });
      const panelGeo = new THREE.BoxGeometry(2.4, 0.06, 1.2);
      for (let i = 0; i < 4; i += 1) {
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(baseX - 7.5 + (i % 2) * 15, WALL_H - 0.05, i < 2 ? -3.5 : 3.5);
        group.add(panel);
      }
    } else if (kind === 'garage') {
      const liftX = -3.2;
      prop(3.4, 0.16, 5.2, 0x2f343a, liftX, 0.12, 0.8);
      for (const z of [-1.4, 3.0]) {
        addBox(group, 0.12, 2.7, 0.12, 0x6a7278, baseX + liftX - 1.6, 1.35, z);
        addBox(group, 0.12, 2.7, 0.12, 0x6a7278, baseX + liftX + 1.6, 1.35, z);
        addBox(group, 3.4, 0.12, 0.14, 0xd4a12f, baseX + liftX, 1.1, z);
      }
      prop(1.4, 1.3, 0.9, 0xb03028, -roomW / 2 + 2.2, 0.65, -roomD / 2 + 2.2);
      prop(1.2, 0.9, 0.8, 0x3b4148, 2.6, 0.45, roomD / 2 - 2.0);
      prop(0.55, 0.9, 0.55, 0x262a2e, 4.2, 0.45, roomD / 2 - 2.0);

    } else if (kind === 'police') {
      for (let i = 0; i < 3; i += 1) {
        prop(1.8, 0.75, 0.8, 0x3a4a5c, -1.8 + i * 2.1, 0.38, 1.2);
      }
      addBox(group, roomW * 0.4, 1.2, 0.1, 0x1a3060, baseX + roomW * 0.18, 2.1, roomD / 2 - 0.2);
    } else if (kind === 'club') {
      for (let i = 0; i < 4; i += 1) {
        prop(0.9, 0.8, 0.9, 0x2a2035, -1.8 + i * 1.4, 0.4, 1.6);
      }
      addBox(group, 0.5, 1.6, 0.5, 0x1a1420, baseX - roomW / 2 + 1.4, 0.8, -roomD / 2 + 1.4);
      addBox(group, 0.5, 1.6, 0.5, 0x1a1420, baseX + roomW / 2 - 1.4, 0.8, -roomD / 2 + 1.4);
    } else if (kind === 'hotel') {
      prop(2.2, 0.5, 2.4, 0x6a4a2f, roomW / 2 - 2.2, 0.3, 1.4);
      prop(2.0, 0.35, 2.0, 0xd8d0c0, roomW / 2 - 2.2, 0.62, 1.4);
      prop(1.6, 0.55, 1.6, 0x4a3a2a, -roomW / 2 + 2.4, 0.3, 1.8);
    }

    void cfg;
    void roomD;
  }
}

function pickValue<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
