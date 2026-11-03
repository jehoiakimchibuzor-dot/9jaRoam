import * as THREE from 'three';
import { CharacterRig, HumanoidAnimator, createCharacter } from '../entities/CharacterModel';
import { createPoliceCar, VehicleRig } from '../entities/Vehicle';
import { City } from '../world/City';
import { CombatCallbacks, CombatHit } from '../systems/CombatTypes';
import { clamp, hasLineOfSight, pushOutColliders } from '../systems/Physics';
import { createHealth, damageHealth, Health } from '../systems/Health';

type OfficerState = 'idle' | 'chase' | 'engage' | 'down' | 'dead';

interface Officer {
  id: number;
  rig: CharacterRig;
  animator: HumanoidAnimator;
  position: THREE.Vector3;
  health: Health;
  state: OfficerState;
  yaw: number;
  speed: number;
  attackCooldown: number;
  hurtTimer: number;
  deadTimer: number;
  downTimer: number;
  spawnAge: number;
  visible: boolean;
}

export interface PoliceContext {
  playerPosition: THREE.Vector3;
  playerAlive: boolean;
  playerDriving: boolean;
  playerVehiclePosition: THREE.Vector3 | null;
  wanted: number;
}

const SKINS = [0x7a4a28, 0x8a5a36, 0x6b3f22, 0x9a6a45];

export class Police {
  private officers: Officer[] = [];
  private nextId = 1;
  private car: VehicleRig;
  private carActive = false;
  private carVisible = false;
  private carPosition = new THREE.Vector3();
  private carYaw = 0;
  private carSpeed = 0;
  private spawnTimer = 0;
  private carSpawnTimer = 0;
  private lostTimer = 0;
  private responseTimer = 0;
  private contactMade = false;
  private lastKnown = new THREE.Vector3();
  private hasLastKnown = false;
  private seen = false;
  private carHealth = 165;
  private carWrecked = false;
  private carWreckTimer = 0;

  constructor(
    private scene: THREE.Scene,
    private city: City,
    private callbacks: CombatCallbacks
  ) {
    this.car = createPoliceCar();
    this.car.group.visible = false;
    this.scene.add(this.car.group);
    this.car.group.position.set(0, 0, 200);
  }

  get officerCount(): number {
    return this.officers.filter((o) => o.state !== 'dead').length;
  }

  get activeOfficers(): readonly Officer[] {
    return this.officers;
  }

  get isSeen(): boolean {
    return this.seen;
  }

  /** True once the player has stayed out of sight long enough to shake the chase. */
  get isLost(): boolean {
    return this.lostTimer > 5;
  }

  /** False during the initial response window so heat cannot cool instantly. */
  get isCold(): boolean {
    return this.contactMade || this.responseTimer > 10;
  }

  get lastKnownPosition(): THREE.Vector3 {
    return this.lastKnown;
  }

  /** Called when a fresh crime happens: police get a new lead. */
  alert(at: THREE.Vector3): void {
    this.lastKnown.copy(at);
    this.hasLastKnown = true;
    this.lostTimer = 0;
    this.responseTimer = 0;
    // Dispatch delay: nobody teleports to the crime scene instantly.
    this.spawnTimer = -1.5;
    this.carSpawnTimer = -1.5;
    this.contactMade = false;
  }

  get carEngaged(): boolean {
    return this.carActive;
  }

  get carGroup(): THREE.Group {
    return this.car.group;
  }

  get officerGroups(): THREE.Group[] {
    return this.officers.map((o) => o.rig.group);
  }

  update(dt: number, ctx: PoliceContext): void {
    // Any heat above zero keeps at least one officer on the case; only a fully
    // cleared meter (0.00) stands the response down.
    const wanted = ctx.wanted <= 0 ? 0 : Math.max(1, Math.floor(ctx.wanted));
    this.seen = false;
    this.spawnTimer += dt;
    this.carSpawnTimer += dt;
    this.responseTimer += dt;

    // Response is deliberately gradual: one or two officers first, then more
    // only if the player is still in contact. Running away now actually works.
    const targetOfficers = [0, 1, 2, 3, 4, 5][Math.min(5, wanted)];
    const spawnInterval = [0, 4.8, 3.9, 3.1, 2.5, 1.9][Math.min(5, wanted)];
    const responseWindow = 8 + wanted * 2;
    const mayReinforce =
      wanted > 0 && (this.responseTimer < responseWindow || this.lostTimer < 4.5);
    if (
      mayReinforce &&
      this.officers.filter((o) => o.state !== 'dead').length < targetOfficers &&
      this.spawnTimer > spawnInterval
    ) {
      this.spawnTimer = 0;
      const lead = this.hasLastKnown ? this.lastKnown : ctx.playerPosition;
      this.spawnOfficer(lead, wanted);
    }

    for (const officer of this.officers) {
      if (officer.state === 'dead') {
        officer.deadTimer += dt;
        continue;
      }

      officer.spawnAge += dt;
      officer.hurtTimer = Math.max(0, officer.hurtTimer - dt);
      officer.attackCooldown = Math.max(0, officer.attackCooldown - dt);

      const dx = ctx.playerPosition.x - officer.position.x;
      const dz = ctx.playerPosition.z - officer.position.z;
      const distance = Math.hypot(dx, dz);
      officer.visible = distance < 120;
      officer.rig.group.visible = officer.visible;
      if (!officer.visible) continue;

      if (officer.state === 'down') {
        officer.downTimer -= dt;
        officer.speed = 0;
        officer.animator.update(officer.rig, dt, 0, 4.4);
        if (officer.downTimer <= 0) {
          officer.state = 'chase';
          officer.rig.group.rotation.z = 0;
          officer.hurtTimer = 0.2;
        }
        continue;
      }

      const canSee =
        ctx.playerAlive && distance < 34 && hasLineOfSight(this.city.colliders, officer.position, ctx.playerPosition);
      if (canSee) {
        this.seen = true;
        this.contactMade = true;
        this.lastKnown.copy(ctx.playerPosition);
        this.hasLastKnown = true;
      }

      // When sight is lost, officers converge on the last place they saw the
      // player instead of magically tracking them across the whole city.
      const target = canSee || distance < 14 ? ctx.playerPosition : this.hasLastKnown ? this.lastKnown : ctx.playerPosition;
      const tdx = target.x - officer.position.x;
      const tdz = target.z - officer.position.z;
      const targetDistance = Math.hypot(tdx, tdz);

      if (wanted === 0) {
        officer.state = 'idle';
        officer.speed = Math.max(0, officer.speed - dt * 4);
      } else if (canSee || distance < 18) {
        officer.state = distance < 15 ? 'engage' : 'chase';
      } else {
        officer.state = 'chase';
      }

      let moveX = 0;
      let moveZ = 0;
      if (officer.state === 'chase' || officer.state === 'engage') {
        const stopDistance = officer.state === 'engage' ? 7.5 : 2.2;
        if (targetDistance > stopDistance) {
          moveX = tdx / Math.max(0.001, targetDistance);
          moveZ = tdz / Math.max(0.001, targetDistance);
          officer.speed = 3.1;
        } else {
          officer.speed = 0;
        }

        if (canSee && distance < 26 && officer.attackCooldown <= 0) {
          officer.attackCooldown = 1.55 + Math.random() * 0.85;
          const from = officer.position.clone().setY(1.4);
          const inCar = ctx.playerDriving && ctx.playerVehiclePosition;
          const to = (inCar ? ctx.playerVehiclePosition! : ctx.playerPosition).clone();
          to.y = inCar ? 0.85 : 1.1;
          this.callbacks.spawnTracer(from, to, inCar ? 0xffb060 : 0x9ecbff);
          if (inCar) {
            this.callbacks.damageVehicle(9 + Math.random() * 5);
          } else {
            this.callbacks.damagePlayer(2.6 + Math.random() * 2.2);
          }
        }
      } else if (wanted === 0 && distance < 62) {
        // Heat is gone: drift away from the player instead of loitering.
        moveX = -dx / Math.max(0.001, distance);
        moveZ = -dz / Math.max(0.001, distance);
        officer.speed = 2.2;
      }

      if (moveX !== 0 || moveZ !== 0) {
        officer.position.x += moveX * officer.speed * dt;
        officer.position.z += moveZ * officer.speed * dt;
        pushOutColliders(this.city.colliders, officer.position, 0.4);
        officer.position.x = clamp(officer.position.x, this.city.worldMinX + 2, this.city.worldMaxX - 2);
        officer.position.z = clamp(officer.position.z, this.city.worldMinZ + 6, this.city.worldMaxZ - 6);
        officer.yaw = Math.atan2(moveX, moveZ);
      } else if (distance < 30) {
        officer.yaw = Math.atan2(dx, dz);
      }
      officer.rig.group.rotation.y = officer.yaw;
      officer.position.y = this.city.groundHeightAt(officer.position.x, officer.position.z);
      if (officer.hurtTimer > 0) {
        officer.rig.torso.rotation.x -= 0.3 * (officer.hurtTimer / 0.3);
      }
      officer.animator.update(officer.rig, dt, officer.speed, 4.4);
    }

    this.officers = this.officers.filter((o) => {
      if (o.state !== 'dead' && wanted === 0 && o.spawnAge > 12) {
        const d = o.position.distanceTo(ctx.playerPosition);
        if (d > 58 || (o.spawnAge > 26 && d > 30)) {
          this.removeOfficer(o);
          return false;
        }
      }
      // Once the trail goes cold, distant searchers give up and go home.
      if (o.state !== 'dead' && wanted > 0 && this.lostTimer > 10 && o.position.distanceTo(ctx.playerPosition) > 55) {
        this.removeOfficer(o);
        return false;
      }
      return true;
    });

    this.updateCar(dt, ctx, wanted);

    if (this.seen) {
      this.lostTimer = 0;
    } else if (wanted > 0) {
      if (this.contactMade || this.responseTimer > 10) this.lostTimer += dt;
    } else {
      this.lostTimer = 0;
    }
  }

  private spawnOfficer(playerPosition: THREE.Vector3, wanted: number): void {
    let x = 0;
    let z = 0;
    let found = false;
    for (let i = 0; i < 16; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 44 + Math.random() * 24;
      x = playerPosition.x + Math.cos(angle) * distance;
      z = playerPosition.z + Math.sin(angle) * distance;
      if (x < this.city.worldMinX + 4 || x > this.city.worldMaxX - 4) continue;
      if (z < this.city.worldMinZ + 8 || z > this.city.worldMaxZ - 8) continue;
      if (!this.city.isRoad(x, z)) continue;
      // Only spawn where the officer can walk straight at the player without
      // a building in the way, otherwise they get stuck behind a wall.
      if (!hasLineOfSight(this.city.colliders, new THREE.Vector3(x, 0, z), playerPosition)) continue;
      found = true;
      break;
    }
    if (!found) {
      x = playerPosition.x;
      z = playerPosition.z + (Math.random() < 0.5 ? -1 : 1) * 46;
      z = clamp(z, this.city.worldMinZ + 8, this.city.worldMaxZ - 8);
    }

    const colors = {
      skin: pick(SKINS),
      shirt: 0x1d2f52,
      pants: 0x151c2a,
      shoes: 0x0f1013,
      accent: 0xe8e8e6,
      hair: 0x100c09
    };
    const rig = createCharacter(colors, 1.8, {
      build: 1.04,
      hairStyle: 'fade',
      cap: true,
      capColor: 0x101826,
      sleeves: 'short',
      bottoms: 'long',
      beard: Math.random() < 0.3
    });
    const y = this.city.groundHeightAt(x, z);
    rig.group.position.set(x, y, z);
    this.scene.add(rig.group);
    this.officers.push({
      id: this.nextId,
      rig,
      animator: new HumanoidAnimator(Math.random() * Math.PI * 2),
      position: rig.group.position,
      health: createHealth(100 + wanted * 10),
      state: 'chase',
      yaw: 0,
      speed: 0,
      attackCooldown: 0.5 + Math.random(),
      hurtTimer: 0,
      deadTimer: 0,
      downTimer: 0,
      spawnAge: 0,
      visible: true
    });
    this.nextId += 1;
  }

  private removeOfficer(officer: Officer): void {
    officer.rig.group.removeFromParent();
  }

  private updateCar(dt: number, ctx: PoliceContext, wanted: number): void {
    if (wanted >= 2) {
      if (!this.carActive) {
        const delay = wanted >= 4 ? 1.8 : 3.8;
        if ((this.lostTimer < 4 || this.responseTimer < 10) && this.carSpawnTimer > delay) {
          this.spawnCar(this.hasLastKnown ? this.lastKnown : ctx.playerPosition, ctx.playerDriving);
          this.carSpawnTimer = 0;
          this.carActive = true;
        }
      }
    } else if (this.carActive) {
      this.retireCar(dt);
      return;
    }

    if (!this.carActive) return;

    if (this.carWrecked) {
      this.carWreckTimer += dt;
      this.car.group.visible = true;
      const smoke = this.car.group.userData.wreckSmoke as THREE.Mesh | undefined;
      if (smoke) {
        smoke.position.y = 1.65 + Math.sin(this.carWreckTimer * 2.2) * 0.2;
        (smoke.material as THREE.MeshBasicMaterial).opacity =
          0.4 + Math.sin(this.carWreckTimer * 3) * 0.12;
      }
      if (this.carWreckTimer > 14) {
        this.carActive = false;
        this.carVisible = false;
        this.car.group.visible = false;
        this.carWrecked = false;
      }
      return;
    }

    // A cruiser with no lead eventually breaks off the search.
    if (this.lostTimer > 13) {
      this.retireCar(dt);
      return;
    }

    const car = this.car;
    const dx = ctx.playerPosition.x - this.carPosition.x;
    const dz = ctx.playerPosition.z - this.carPosition.z;
    const distance = Math.hypot(dx, dz);

    const canSeePlayer =
      ctx.playerAlive && distance < 32 && hasLineOfSight(this.city.colliders, this.carPosition, ctx.playerPosition);
    if (canSeePlayer) {
      this.seen = true;
      this.contactMade = true;
      this.lastKnown.copy(ctx.playerPosition);
      this.hasLastKnown = true;
    }

    const searching = !canSeePlayer && this.lostTimer > 2.5 && this.hasLastKnown;
    const target = searching ? this.lastKnown : ctx.playerPosition;
    const tdx = target.x - this.carPosition.x;
    const tdz = target.z - this.carPosition.z;
    const targetDistance = Math.hypot(tdx, tdz);

    car.group.visible = distance < 170;
    this.carVisible = car.group.visible;
    if (this.carVisible) {
      if (targetDistance > 3.2) {
        const desiredYaw = Math.atan2(tdx, tdz);
        this.carYaw = lerpAngle(this.carYaw, desiredYaw, 1 - Math.exp(-3.4 * dt));
        const targetSpeed = wanted >= 3 ? 16 : 13;
        this.carSpeed += (targetSpeed - this.carSpeed) * (1 - Math.exp(-2.6 * dt));
      } else {
        this.carSpeed = Math.max(0, this.carSpeed - dt * 8);
      }
      this.car.group.position.x += Math.sin(this.carYaw) * this.carSpeed * dt;
      this.car.group.position.z += Math.cos(this.carYaw) * this.carSpeed * dt;
      pushOutColliders(this.city.colliders, this.car.group.position, 1.1);
      this.car.group.position.x = clamp(this.car.group.position.x, this.city.worldMinX + 2, this.city.worldMaxX - 2);
      this.car.group.position.z = clamp(this.car.group.position.z, this.city.worldMinZ + 8, this.city.worldMaxZ - 8);
      this.car.group.position.y = 0;
      this.car.group.rotation.y = this.carYaw;
      for (const spinner of this.car.spinners) spinner.rotation.x += (this.carSpeed / this.car.wheelRadius) * dt;
      this.carPosition.copy(this.car.group.position);
    }
  }

  private retireCar(dt: number): void {
    this.carSpeed = Math.max(0, this.carSpeed - dt * 6);
    if (this.carSpeed < 0.2) {
      this.carActive = false;
      this.carVisible = false;
      this.car.group.visible = false;
    }
  }

  private spawnCar(playerPosition: THREE.Vector3, playerDriving: boolean): void {
    const direction = playerDriving ? -1 : 1;
    const offset = 64 + Math.random() * 30;
    let x = playerPosition.x;
    let z = playerPosition.z + direction * offset;
    for (let i = 0; i < 12; i += 1) {
      if (this.city.isRoad(x, z)) break;
      x += (Math.random() - 0.5) * 16;
      z += direction * 8;
    }
    x = clamp(x, this.city.worldMinX + 4, this.city.worldMaxX - 4);
    z = clamp(z, this.city.worldMinZ + 10, this.city.worldMaxZ - 10);
    this.carPosition.set(x, 0, z);
    this.car.group.position.copy(this.carPosition);
    this.carYaw = Math.atan2(playerPosition.x - x, playerPosition.z - z);
    this.car.group.rotation.y = this.carYaw;
    this.carSpeed = 0;
    this.car.group.visible = true;
    this.carVisible = true;
    this.carHealth = 165;
    this.carWrecked = false;
    this.carWreckTimer = 0;
    const smoke = this.car.group.userData.wreckSmoke as THREE.Object3D | undefined;
    if (smoke) smoke.visible = false;
    const flash = this.car.group.userData.wreckFlash as THREE.Object3D | undefined;
    if (flash) flash.visible = false;
    if (this.car.driver) this.car.driver.visible = true;
  }

  /** Officer body check against a moving car, matching pedestrian run-overs. */
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
    // Twice the civilian figure: officers wear armour and shrug off nudges,
    // but any solid hit at driving speed ends them instead of letting them
    // roll off the bonnet and keep shooting.
    const damage = Math.max(0, speed - 3) * 17;
    const direction = new THREE.Vector3(fwdX, 0, fwdZ);

    for (const officer of this.officers) {
      if (officer.state === 'dead') continue;
      if (Math.abs(officer.position.y - carPosition.y) > 2.2) continue;
      const dx = officer.position.x - carPosition.x;
      const dz = officer.position.z - carPosition.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) > halfW || Math.abs(lz) > halfL) continue;

      hits += 1;
      const point = officer.position.clone().setY(1.0);
      const didKill = damage > 0 && this.hitOfficer(officer, damage, direction, true);
      if (didKill) {
        killed += 1;
        officer.position.x += fwdX * (1.1 + speed * 0.05);
        officer.position.z += fwdZ * (1.1 + speed * 0.05);
        officer.position.y = this.city.groundHeightAt(officer.position.x, officer.position.z) + 0.12;
        officer.rig.group.position.copy(officer.position);
      } else {
        // Survived: knocked flat for a moment before scrambling back up.
        officer.state = 'down';
        officer.downTimer = 1.7;
        officer.speed = 0;
        officer.rig.group.rotation.z = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 - 0.1);
        officer.position.x += fwdX * 0.45;
        officer.position.z += fwdZ * 0.45;
        officer.rig.group.position.x = officer.position.x;
        officer.rig.group.position.z = officer.position.z;
      }
      points.push(point);
    }

    return { hits, killed, points };
  }

  /** True while the cruiser is active, visible and still driveable. */
  get carAlive(): boolean {
    return this.carActive && !this.carWrecked;
  }

  /** Crash damage against the cruiser. Returns true when it is newly wrecked. */
  damageCar(amount: number): boolean {
    if (!this.carActive || this.carWrecked) return false;
    this.carHealth = Math.max(0, this.carHealth - amount);
    if (this.carHealth > 0) return false;
    this.carWrecked = true;
    this.carSpeed = 0;
    this.carWreckTimer = 0;
    this.attachCarWreck();
    this.callbacks.addWanted(2);
    return true;
  }

  private attachCarWreck(): void {
    if (this.car.group.userData.wreckSmoke) {
      (this.car.group.userData.wreckSmoke as THREE.Object3D).visible = true;
      return;
    }
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 7, 6),
      new THREE.MeshBasicMaterial({
        color: 0x24262a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
      })
    );
    smoke.position.set(0, 1.8, this.car.length / 2 - 0.6);
    smoke.scale.set(0.9, 1.5, 0.9);
    this.car.group.add(smoke);
    this.car.group.userData.wreckSmoke = smoke;
    if (this.car.driver) this.car.driver.visible = false;
    const flash = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85 })
    );
    flash.position.set(0.16, 1.46, -0.2);
    this.car.group.add(flash);
    this.car.group.userData.wreckFlash = flash;
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, range: number): CombatHit | null {
    let best: Officer | null = null;
    let bestDistance = Infinity;
    let bestPoint: THREE.Vector3 | null = null;

    for (const officer of this.officers) {
      if (officer.state === 'dead') continue;
      const center = officer.position.clone().setY(1.05);
      const to = center.clone().sub(origin);
      const along = to.dot(dir);
      if (along < 0.4 || along > range || along >= bestDistance) continue;
      const closest = origin.clone().addScaledVector(dir, along);
      if (closest.distanceTo(center) > 0.52) continue;
      best = officer;
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
      kind: 'police',
      label: 'Police',
      hit: (damage, direction, byPlayer) => this.hitOfficer(target, damage, direction, byPlayer)
    };
  }

  private hitOfficer(officer: Officer, damage: number, direction: THREE.Vector3, byPlayer: boolean): boolean {
    if (officer.state === 'dead') return false;
    officer.hurtTimer = 0.3;
    officer.state = 'engage';
    officer.downTimer = 0;
    officer.rig.group.rotation.z = 0;
    officer.position.x += direction.x * 0.1;
    officer.position.z += direction.z * 0.1;
    const killed = damageHealth(officer.health, damage, performance.now() / 1000);
    if (!killed) {
      if (byPlayer) this.callbacks.addWanted(3);
      return false;
    }
    officer.state = 'dead';
    officer.speed = 0;
    officer.rig.group.rotation.z = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 - 0.08);
    officer.rig.group.position.y = this.city.groundHeightAt(officer.position.x, officer.position.z) + 0.16;
    this.callbacks.onPoliceKilled(officer.position.clone());
    return true;
  }

  get carPositionRef(): THREE.Vector3 {
    return this.carPosition;
  }

  get cruiserSpeed(): number {
    return this.carSpeed;
  }

  get cruiserYaw(): number {
    return this.carYaw;
  }

  reset(): void {
    for (const officer of this.officers) officer.rig.group.removeFromParent();
    this.officers = [];
    this.carActive = false;
    this.carVisible = false;
    this.car.group.visible = false;
    this.carSpeed = 0;
    this.carHealth = 165;
    this.carWrecked = false;
    this.carWreckTimer = 0;
    const smoke = this.car.group.userData.wreckSmoke as THREE.Object3D | undefined;
    if (smoke) smoke.visible = false;
    if (this.car.driver) this.car.driver.visible = true;
    this.seen = false;
    this.spawnTimer = 0;
    this.carSpawnTimer = 0;
    this.lostTimer = 0;
    this.responseTimer = 0;
    this.contactMade = false;
    this.hasLastKnown = false;
  }
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
