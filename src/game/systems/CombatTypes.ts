import * as THREE from 'three';

export type NpcKind = 'pedestrian' | 'thug' | 'police';

export interface CombatHit {
  point: THREE.Vector3;
  distance: number;
  kind: NpcKind;
  label: string;
  hit: (damage: number, direction: THREE.Vector3, byPlayer: boolean) => boolean;
}

export interface ThugKillEvent {
  groupId: string;
  position: THREE.Vector3;
}

export interface CombatCallbacks {
  damagePlayer: (amount: number) => void;
  damageVehicle: (amount: number) => void;
  addWanted: (amount: number) => void;
  onCivilianKilled: (position: THREE.Vector3) => void;
  onThugKilled: (event: ThugKillEvent) => void;
  onPoliceKilled: (position: THREE.Vector3) => void;
  spawnTracer: (from: THREE.Vector3, to: THREE.Vector3, color?: number) => void;
  spawnImpact: (at: THREE.Vector3, color?: number) => void;
}
