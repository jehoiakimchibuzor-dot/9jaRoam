import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CharacterRig, HumanoidAnimator, createCharacter } from './CharacterModel';
import type { WeaponId } from '../combat/Weapons';

export interface PlayerMoveInput {
  x: number;
  y: number;
  sprint: boolean;
}

export class Player {
  readonly rig: CharacterRig;
  readonly group: THREE.Group;
  readonly velocity = new THREE.Vector3();
  yaw = Math.PI;
  speed = 0;
  jumpOffset = 0;
  onGround = true;
  armed = true;
  crouched = false;
  aiming = false;

  private animator = new HumanoidAnimator(0);
  private crouchBlend = 0;
  private punchTimer = 0;
  private punchImpacted = false;
  private punchImpactPending = false;
  private aimTimer = 0;
  private flashTimer = 0;
  private verticalVelocity = 0;
  private gun = new THREE.Group();
  private machete = new THREE.Group();
  private currentWeapon: WeaponId = 'pistol';
  private muzzleFlash = new THREE.Mesh();
  private muzzleAnchor = new THREE.Object3D();
  private muzzleWorld = new THREE.Vector3();
  private riding = false;

  constructor() {
    this.rig = createCharacter(
      {
        skin: 0x8a5a3a,
        shirt: 0xe9e5d9,
        pants: 0x2f4a78,
        shoes: 0xeceae2,
        accent: 0xf2f0e6,
        hair: 0x14100d,
        chain: 0xd9b44a
      },
      1.82,
      {
        build: 1.03,
        sleeves: 'tank',
        bottoms: 'long',
        hairStyle: 'fade',
        beard: true
      }
    );
    this.group = this.rig.group;
    this.group.rotation.y = this.yaw;
    this.buildGun();
    this.buildMachete();
    this.setWeapon('pistol');
  }

  private buildGun(): void {
    const dark = 0x1c1d20;
    const metal = 0x3c3f45;
    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.042, 0.1, 0.055, 2, 0.012), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.75 }));
    grip.position.set(0, 0.02, -0.015);
    grip.rotation.x = 0.32;
    this.gun.add(grip);
    const slide = new THREE.Mesh(new RoundedBoxGeometry(0.038, 0.17, 0.042, 2, 0.01), new THREE.MeshStandardMaterial({ color: metal, roughness: 0.45, metalness: 0.55 }));
    slide.position.set(0, -0.06, 0.01);
    this.gun.add(slide);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4, metalness: 0.6 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.06, 0.04);
    this.gun.add(barrel);

    this.muzzleAnchor.position.set(0, -0.06, 0.075);
    this.gun.add(this.muzzleAnchor);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 })
    );
    this.muzzleFlash.visible = false;
    this.muzzleAnchor.add(this.muzzleFlash);

    this.gun.position.set(0, -0.26, 0.11);
    this.gun.rotation.x = -0.15;
    this.gun.visible = this.armed;
    this.rig.rightElbow.add(this.gun);
  }

  private buildMachete(): void {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.62, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.75 })
    );
    blade.position.set(0, -0.36, 0.02);
    this.machete.add(blade);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.052, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.7 })
    );
    tip.position.set(0, -0.72, 0.02);
    tip.rotation.y = Math.PI / 4;
    this.machete.add(tip);
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.2, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.9 })
    );
    handle.position.set(0, 0.0, 0.02);
    this.machete.add(handle);
    this.machete.position.set(0, -0.25, 0.06);
    this.machete.rotation.x = -0.2;
    this.machete.visible = false;
    this.rig.rightElbow.add(this.machete);
  }

  setWeapon(id: WeaponId): void {
    this.currentWeapon = id;
    const melee = id === 'machete';
    this.gun.visible = this.armed && !melee && !this.riding;
    this.machete.visible = this.armed && melee && !this.riding;
    this.gun.scale.set(1, 1, 1);
    this.gun.position.set(0, -0.26, 0.11);
    this.muzzleAnchor.position.set(0, -0.06, 0.075);
    if (id === 'smg') {
      this.gun.scale.set(1.04, 1.05, 1.4);
      this.gun.position.set(0, -0.27, 0.14);
      this.muzzleAnchor.position.set(0, -0.06, 0.08);
    } else if (id === 'shotgun') {
      this.gun.scale.set(1.16, 1.12, 1.75);
      this.gun.position.set(0, -0.27, 0.2);
      this.muzzleAnchor.position.set(0, -0.06, 0.09);
    } else if (id === 'rifle') {
      this.gun.scale.set(1.0, 1.12, 2.1);
      this.gun.position.set(0, -0.27, 0.26);
      this.muzzleAnchor.position.set(0, -0.06, 0.1);
    }
  }

  get weaponId(): WeaponId {
    return this.currentWeapon;
  }

  setCrouched(active: boolean): void {
    if (this.crouched === active) return;
    this.crouched = active;
    if (active) this.aimTimer = 0;
  }

  toggleCrouch(): void {
    this.setCrouched(!this.crouched);
  }

  setArmed(active: boolean): void {
    if (this.armed === active) return;
    this.armed = active;
    const melee = this.currentWeapon === 'machete';
    this.gun.visible = active && !melee && !this.riding;
    this.machete.visible = active && melee && !this.riding;
    if (active) {
      this.punchTimer = 0;
      this.punchImpacted = false;
      this.punchImpactPending = false;
      this.aimTimer = 0.3;
    } else {
      this.aiming = false;
      this.aimTimer = 0;
      this.flashTimer = 0;
      this.muzzleFlash.visible = false;
    }
  }

  setAiming(active: boolean): void {
    if (this.aiming === active) return;
    this.aiming = active;
    if (active) this.aimTimer = Math.max(this.aimTimer, 0.1);
  }

  faceYaw(yaw: number): void {
    this.yaw = yaw;
    this.group.rotation.y = yaw;
  }

  toggleArmed(): void {
    this.setArmed(!this.armed);
  }

  /** Hides carried weapons while the player is sitting on a bike. */
  setRiding(active: boolean): void {
    if (this.riding === active) return;
    this.riding = active;
    const melee = this.currentWeapon === 'machete';
    this.gun.visible = !active && this.armed && !melee;
    this.machete.visible = !active && this.armed && melee;
    if (active) {
      this.aiming = false;
      this.aimTimer = 0;
      this.flashTimer = 0;
      this.muzzleFlash.visible = false;
    }
  }

  /**
   * Seated riding pose: knees up and splayed around the tank, hands out to
   * the bars. Called every frame while driving an okada (no walk animator).
   */
  ridePose(steer: number): void {
    const rig = this.rig;
    rig.torso.position.y = 0.9;
    rig.torso.rotation.set(0.5, steer * 0.1, 0);
    rig.leftLeg.rotation.set(-0.62, 0, -0.2);
    rig.rightLeg.rotation.set(-0.62, 0, 0.2);
    rig.leftKnee.rotation.x = 1.18;
    rig.rightKnee.rotation.x = 1.18;
    rig.leftArm.rotation.set(-1.02, 0, -0.14);
    rig.rightArm.rotation.set(-1.02, 0, 0.14);
    rig.leftElbow.rotation.x = -0.34;
    rig.rightElbow.rotation.x = -0.34;
    rig.head.rotation.set(-0.16, 0, 0);
  }

  punch(): void {
    if (this.punchTimer > 0.18 || !this.onGround || this.armed) return;
    this.setCrouched(false);
    this.punchTimer = 0.45;
    this.punchImpacted = false;
    this.punchImpactPending = false;
    this.aiming = false;
    this.aimTimer = 0;
  }

  meleeSwing(): boolean {
    if (!this.armed || this.currentWeapon !== 'machete') return false;
    if (this.punchTimer > 0.18 || !this.onGround) return false;
    this.setCrouched(false);
    this.punchTimer = 0.4;
    this.punchImpacted = false;
    this.punchImpactPending = false;
    this.aiming = false;
    this.aimTimer = 0;
    return true;
  }

  consumePunchImpact(): boolean {
    const hit = this.punchImpactPending;
    this.punchImpactPending = false;
    return hit;
  }

  forceAimPose(): void {
    this.punchTimer = 0;
    this.aimTimer = 10;
    this.animate(0.001);
  }

  shoot(): boolean {
    if (!this.armed || this.currentWeapon === 'machete' || this.punchTimer > 0.12) return false;
    this.aimTimer = 0.4;
    this.flashTimer = 0.06;
    this.muzzleFlash.visible = true;
    return true;
  }

  jump(): boolean {
    if (!this.onGround) return false;
    this.setCrouched(false);
    this.onGround = false;
    this.verticalVelocity = 7.4;
    return true;
  }

  resetActions(): void {
    this.crouched = false;
    this.crouchBlend = 0;
    this.punchTimer = 0;
    this.punchImpacted = false;
    this.punchImpactPending = false;
    this.aiming = false;
    this.aimTimer = 0;
    this.flashTimer = 0;
    this.muzzleFlash.visible = false;
    this.jumpOffset = 0;
    this.verticalVelocity = 0;
    this.onGround = true;
    this.animator.update(this.rig, 0.016, 0, 6.4);
  }

  getMuzzleWorldPosition(): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.muzzleAnchor.getWorldPosition(this.muzzleWorld);
  }

  update(dt: number, move: PlayerMoveInput, camYaw: number): void {
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dir = new THREE.Vector3()
      .addScaledVector(fwd, -move.y)
      .addScaledVector(right, move.x);
    const input = Math.min(1, dir.length());
    if (input > 0.001) dir.normalize();

    const runSpeed = this.crouched ? 1.55 : move.sprint ? 6.4 : 3.2;
    const targetSpeed = input * runSpeed;
    const targetVel = dir.multiplyScalar(targetSpeed);
    const lerp = 1 - Math.exp(-12 * dt);
    this.velocity.lerp(targetVel, lerp);
    this.speed = this.velocity.length();
    this.group.position.addScaledVector(this.velocity, dt);

    if (!this.onGround) {
      this.verticalVelocity -= 22 * dt;
      this.jumpOffset += this.verticalVelocity * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.verticalVelocity = 0;
        this.onGround = true;
      }
    }

    if (this.speed > 0.25) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.yaw = lerpAngle(this.yaw, targetYaw, 1 - Math.exp(-14 * dt));
      this.group.rotation.y = this.yaw;
    }

    this.animate(dt);
  }

  private animate(dt: number): void {
    const rig = this.rig;
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.aimTimer = Math.max(0, this.aimTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (this.flashTimer <= 0) this.muzzleFlash.visible = false;

    const speedFactor = this.onGround ? this.speed : 1;
    this.animator.update(rig, dt, speedFactor, 6.4);

    const crouchTarget = this.crouched && this.onGround ? 1 : 0;
    this.crouchBlend += (crouchTarget - this.crouchBlend) * (1 - Math.exp(-11 * dt));
    if (this.crouchBlend > 0.001) {
      const crouch = this.crouchBlend;
      rig.torso.position.y -= 0.29 * crouch;
      rig.torso.rotation.x += 0.17 * crouch;
      rig.leftLeg.rotation.x -= 0.5 * crouch;
      rig.rightLeg.rotation.x -= 0.5 * crouch;
      rig.leftKnee.rotation.x += 0.95 * crouch;
      rig.rightKnee.rotation.x += 0.95 * crouch;
      rig.leftArm.rotation.x += 0.12 * crouch;
      rig.rightArm.rotation.x += 0.12 * crouch;
    }

    if (!this.onGround) {
      rig.leftKnee.rotation.x = 0.55;
      rig.rightKnee.rotation.x = 0.35;
      rig.leftLeg.rotation.x = -0.35;
      rig.rightLeg.rotation.x = 0.2;
      rig.leftArm.rotation.x = -0.5;
      rig.rightArm.rotation.x = -0.3;
    }

    if (this.punchTimer > 0) {
      const elapsed = 0.45 - this.punchTimer;
      if (!this.punchImpacted && elapsed >= 0.15) {
        this.punchImpacted = true;
        this.punchImpactPending = true;
      }
      const t = elapsed / 0.45;
      const curve = Math.sin(Math.min(1, t * 1.55) * Math.PI);
      rig.rightArm.rotation.x = -1.9 * curve;
      rig.rightArm.rotation.z = -0.3 * curve;
      rig.rightElbow.rotation.x = -0.1 + curve * 0.1;
      rig.torso.rotation.y = -0.4 * curve;
    } else if (this.aiming || this.aimTimer > 0) {
      rig.rightArm.rotation.x = -1.42;
      rig.rightArm.rotation.z = -0.1;
      rig.rightElbow.rotation.x = -0.05;
      rig.leftArm.rotation.x = -0.55;
      rig.leftElbow.rotation.x = -1.0;
      rig.torso.rotation.y = -0.12;
    }
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
