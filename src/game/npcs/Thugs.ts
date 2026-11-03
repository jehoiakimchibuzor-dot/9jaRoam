import * as THREE from 'three';
import { CharacterColors, CharacterRig, HumanoidAnimator, createCharacter } from '../entities/CharacterModel';
import { City } from '../world/City';
import { CombatCallbacks, CombatHit } from '../systems/CombatTypes';
import { clamp, hasLineOfSight, pushOutColliders } from '../systems/Physics';
import { createHealth, damageHealth, Health } from '../systems/Health';
import { IS_ANDROID } from '../platform';

export interface ThugSpawn {
  x: number;
  z: number;
  groupId: string;
  count: number;
  armed?: boolean;
  radius?: number;
}

type ThugState = 'idle' | 'chase' | 'attack' | 'dead';

const VIEW_DISTANCE = IS_ANDROID ? 55 : 85;

interface Thug {
  id: number;
  groupId: string;
  rig: CharacterRig;
  animator: HumanoidAnimator;
  home: THREE.Vector3;
  position: THREE.Vector3;
  health: Health;
  state: ThugState;
  yaw: number;
  speed: number;
  armed: boolean;
  attackCooldown: number;
  hurtTimer: number;
  deadTimer: number;
  patrolAngle: number;
  radius: number;
  visible: boolean;
}

const SHIRTS = [0x1f1f24, 0x2a1517, 0x232329, 0x3a1c18, 0x141418];
const PANTS = [0x17181b, 0x22242a, 0x2e2a25, 0x1a1c22];
const ACCENTS = [0xb03028, 0xd4a12f, 0x8f2f5c, 0x2f7f5b];
const SKINS = [0x8a5a36, 0x7a4a28, 0x6b3f22, 0x9a6a45, 0x5c3218];

export class Thugs {
  readonly list: Thug[] = [];
  private nextId = 1;
  private groupKills = new Map<string, number>();

  constructor(
    scene: THREE.Scene,
    private city: City,
    spawns: readonly ThugSpawn[],
    private callbacks: CombatCallbacks
  ) {
    for (const spawn of spawns) {
      for (let i = 0; i < spawn.count; i += 1) {
        const angle = (i / Math.max(1, spawn.count)) * Math.PI * 2;
        const offset = i === 0 ? 0 : 1.1 + Math.random() * 1.3;
        const x = spawn.x + Math.cos(angle) * offset;
        const z = spawn.z + Math.sin(angle) * offset;
        const gun = Boolean(spawn.armed) && i % 2 === 0;
        const colors: CharacterColors = {
          skin: pick(SKINS),
          shirt: pick(SHIRTS),
          pants: pick(PANTS),
          shoes: 0x141416,
          accent: pick(ACCENTS),
          hair: 0x100c09,
          chain: Math.random() < 0.3 ? 0xd8d2c2 : undefined
        };
        const rig = createCharacter(colors, 1.78 + Math.random() * 0.12, {
          build: 1.02 + Math.random() * 0.16,
          hairStyle: Math.random() < 0.35 ? 'bald' : 'fade',
          cap: i % 3 === 1,
          capColor: 0x16171b,
          sleeves: 'tank',
          bottoms: 'long',
          beard: Math.random() < 0.4
        });
        rig.group.position.set(x, this.city.groundHeightAt(x, z), z);
        scene.add(rig.group);
        this.list.push({
          id: this.nextId,
          groupId: spawn.groupId,
          rig,
          animator: new HumanoidAnimator(Math.random() * Math.PI * 2),
          home: new THREE.Vector3(spawn.x, 0, spawn.z),
          position: rig.group.position,
          health: createHealth(gun ? 90 : 110),
          state: 'idle',
          yaw: Math.random() * Math.PI * 2,
          speed: 0,
          armed: gun,
          attackCooldown: Math.random(),
          hurtTimer: 0,
          deadTimer: 0,
          patrolAngle: Math.random() * Math.PI * 2,
          radius: spawn.radius ?? 5,
          visible: true
        });
        this.nextId += 1;
      }
    }
  }

  get aliveCount(): number {
    return this.list.filter((t) => t.state !== 'dead').length;
  }

  killsFor(groupId: string): number {
    return this.groupKills.get(groupId) ?? 0;
  }

  reviveGroup(groupId: string): void {
    for (const thug of this.list) {
      if (thug.groupId !== groupId) continue;
      thug.state = 'idle';
      thug.health = createHealth(thug.armed ? 90 : 110);
      thug.deadTimer = 0;
      thug.hurtTimer = 0;
      thug.attackCooldown = 1;
      thug.speed = 0;
      thug.patrolAngle = Math.random() * Math.PI * 2;
      thug.position.set(thug.home.x, this.city.groundHeightAt(thug.home.x, thug.home.z), thug.home.z);
      thug.rig.group.rotation.set(0, thug.yaw, 0);
      thug.rig.group.visible = true;
    }
  }

  aggro(at: THREE.Vector3, radius: number): void {
    for (const thug of this.list) {
      if (thug.state === 'dead') continue;
      if (thug.position.distanceTo(at) <= radius) {
        thug.state = 'chase';
      }
    }
  }

  update(
    dt: number,
    playerPosition: THREE.Vector3,
    playerAlive: boolean,
    playerDriving: boolean
  ): void {
    for (const thug of this.list) {
      if (thug.state === 'dead') {
        thug.deadTimer += dt;
        thug.animator.update(thug.rig, dt, 0, 1.6);
        continue;
      }

      thug.hurtTimer = Math.max(0, thug.hurtTimer - dt);
      thug.attackCooldown = Math.max(0, thug.attackCooldown - dt);

      const dx = playerPosition.x - thug.position.x;
      const dz = playerPosition.z - thug.position.z;
      const distance = Math.hypot(dx, dz);

      thug.visible = distance < VIEW_DISTANCE;
      thug.rig.group.visible = thug.visible;
      if (!thug.visible) continue;

      const canSee = playerAlive && distance < 24 && hasLineOfSight(this.city.colliders, thug.position, playerPosition);
      if (canSee) thug.state = 'chase';
      else if (thug.state === 'chase' && distance > 34) thug.state = 'idle';

      let moveX = 0;
      let moveZ = 0;
      if (thug.state === 'chase' && playerAlive) {
        if (distance > 1.65) {
          moveX = dx / Math.max(0.001, distance);
          moveZ = dz / Math.max(0.001, distance);
          thug.speed = playerDriving ? 2.2 : 3.2;
        } else {
          thug.speed = 0;
          thug.state = 'attack';
        }

        if (thug.armed && distance > 5 && distance < 24 && canSee && thug.attackCooldown <= 0) {
          thug.attackCooldown = 1.55 + Math.random() * 0.7;
          const from = thug.position.clone().setY(1.35);
          const to = playerPosition.clone().setY(1.05);
          this.callbacks.spawnTracer(from, to, 0xffb066);
          this.callbacks.damagePlayer(3 + Math.random() * 2.2);
          // Thugs shooting the player is not the player's crime: no wanted gain.
        }

        if (distance <= 1.9 && thug.attackCooldown <= 0) {
          thug.attackCooldown = 1.2;
          this.callbacks.damagePlayer(5 + Math.random() * 2.5);
        }
      } else if (thug.state === 'attack' && playerAlive) {
        if (distance > 2.4) thug.state = 'chase';
        else if (thug.attackCooldown <= 0) {
          thug.attackCooldown = 1.2;
          this.callbacks.damagePlayer(5 + Math.random() * 2.5);
        }
        thug.speed = 0;
      } else {
        thug.speed = 1;
        thug.patrolAngle += dt * 0.35;
        const targetX = thug.home.x + Math.cos(thug.patrolAngle) * Math.min(2.5, thug.radius);
        const targetZ = thug.home.z + Math.sin(thug.patrolAngle) * Math.min(2.5, thug.radius);
        const pdx = targetX - thug.position.x;
        const pdz = targetZ - thug.position.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd > 0.6) {
          moveX = pdx / pd;
          moveZ = pdz / pd;
        }
      }

      if (moveX !== 0 || moveZ !== 0) {
        thug.position.x += moveX * thug.speed * dt;
        thug.position.z += moveZ * thug.speed * dt;
        pushOutColliders(this.city.colliders, thug.position, 0.42);
        thug.position.x = clamp(thug.position.x, this.city.worldMinX + 2, this.city.worldMaxX - 2);
        thug.position.z = clamp(thug.position.z, this.city.worldMinZ + 6, this.city.worldMaxZ - 6);
        thug.yaw = Math.atan2(moveX, moveZ);
      } else if (playerAlive && distance < 30) {
        thug.yaw = Math.atan2(dx, dz);
      }
      thug.rig.group.rotation.y = thug.yaw;
      thug.position.y = this.city.groundHeightAt(thug.position.x, thug.position.z);

      if (thug.hurtTimer > 0) {
        thug.rig.torso.rotation.x -= 0.35 * (thug.hurtTimer / 0.32);
        thug.rig.head.rotation.y += 0.2 * (thug.hurtTimer / 0.32);
      }

      thug.animator.update(thug.rig, dt, thug.speed, 4.2);
    }
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, range: number): CombatHit | null {
    let best: Thug | null = null;
    let bestDistance = Infinity;
    let bestPoint: THREE.Vector3 | null = null;

    for (const thug of this.list) {
      if (thug.state === 'dead') continue;
      if (!thug.visible && thug.position.distanceTo(origin) > 70) continue;
      const center = thug.position.clone().setY(1.05);
      const to = center.clone().sub(origin);
      const along = to.dot(dir);
      if (along < 0.4 || along > range || along >= bestDistance) continue;
      const closest = origin.clone().addScaledVector(dir, along);
      if (closest.distanceTo(center) > 0.52) continue;
      best = thug;
      bestDistance = along;
      bestPoint = closest;
    }

    if (!best || !bestPoint) return null;
    const target = best;
    const point = bestPoint.clone();
    const distance = bestDistance;
    return {
      point,
      distance,
      kind: 'thug',
      label: 'Thug',
      hit: (damage, direction, byPlayer) => this.hitThug(target, damage, direction, byPlayer)
    };
  }

  private hitThug(thug: Thug, damage: number, direction: THREE.Vector3, byPlayer: boolean): boolean {
    if (thug.state === 'dead') return false;
    thug.hurtTimer = 0.32;
    thug.state = 'chase';
    thug.position.x += direction.x * 0.12;
    thug.position.z += direction.z * 0.12;
    for (const other of this.list) {
      if (other === thug || other.state === 'dead') continue;
      if (other.position.distanceTo(thug.position) < 8) other.state = 'chase';
    }
    const killed = damageHealth(thug.health, damage, performance.now() / 1000);
    if (!killed) {
      this.callbacks.addWanted(byPlayer ? 0.4 : 0);
      return false;
    }
    thug.state = 'dead';
    thug.speed = 0;
    thug.rig.group.rotation.z = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 - 0.08);
    thug.rig.group.position.y = this.city.groundHeightAt(thug.position.x, thug.position.z) + 0.16;
    const previous = this.groupKills.get(thug.groupId) ?? 0;
    this.groupKills.set(thug.groupId, previous + 1);
    this.callbacks.onThugKilled({ groupId: thug.groupId, position: thug.position.clone() });
    if (byPlayer) this.callbacks.addWanted(1.2);
    return true;
  }
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
