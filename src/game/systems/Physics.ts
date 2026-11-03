import * as THREE from 'three';
import type { Collider } from '../world/City';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function colliderBlocksPoint(collider: Collider, x: number, z: number, radius: number): boolean {
  return (
    x > collider.minX - radius &&
    x < collider.maxX + radius &&
    z > collider.minZ - radius &&
    z < collider.maxZ + radius
  );
}

export function pushOutColliders(colliders: readonly Collider[], point: THREE.Vector3, radius: number): void {
  for (const c of colliders) {
    if (!colliderBlocksPoint(c, point.x, point.z, radius)) continue;
    const dl = point.x - (c.minX - radius);
    const dr = c.maxX + radius - point.x;
    const db = point.z - (c.minZ - radius);
    const df = c.maxZ + radius - point.z;
    const min = Math.min(dl, dr, db, df);
    if (min === dl) point.x = c.minX - radius;
    else if (min === dr) point.x = c.maxX + radius;
    else if (min === db) point.z = c.minZ - radius;
    else point.z = c.maxZ + radius;
  }
}

export function segmentBlocked(
  colliders: readonly Collider[],
  ax: number,
  az: number,
  bx: number,
  bz: number
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  for (const c of colliders) {
    let tMin = 0;
    let tMax = 1;
    if (Math.abs(dx) < 0.000001) {
      if (ax < c.minX || ax > c.maxX) continue;
    } else {
      const t1 = (c.minX - ax) / dx;
      const t2 = (c.maxX - ax) / dx;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
    }
    if (Math.abs(dz) < 0.000001) {
      if (az < c.minZ || az > c.maxZ) continue;
    } else {
      const t1 = (c.minZ - az) / dz;
      const t2 = (c.maxZ - az) / dz;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
    }
    if (tMax >= tMin && tMax >= 0 && tMin <= 1) return true;
  }
  return false;
}

export function hasLineOfSight(
  colliders: readonly Collider[],
  from: THREE.Vector3,
  to: THREE.Vector3
): boolean {
  return !segmentBlocked(colliders, from.x, from.z, to.x, to.z);
}

export function rayWallDistance(
  colliders: readonly Collider[],
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxRange: number
): number {
  let nearest = maxRange;
  for (const c of colliders) {
    let tMin = -Infinity;
    let tMax = Infinity;

    if (Math.abs(dir.x) < 0.000001) {
      if (origin.x < c.minX || origin.x > c.maxX) continue;
    } else {
      const tx1 = (c.minX - origin.x) / dir.x;
      const tx2 = (c.maxX - origin.x) / dir.x;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }

    if (Math.abs(dir.z) < 0.000001) {
      if (origin.z < c.minZ || origin.z > c.maxZ) continue;
    } else {
      const tz1 = (c.minZ - origin.z) / dir.z;
      const tz2 = (c.maxZ - origin.z) / dir.z;
      tMin = Math.max(tMin, Math.min(tz1, tz2));
      tMax = Math.min(tMax, Math.max(tz1, tz2));
    }

    if (tMax < 0 || tMin > tMax) continue;
    const t = Math.max(0, tMin);
    if (t < nearest) nearest = t;
  }
  return nearest;
}
