import * as THREE from 'three';

export type MissionTransitMode = 'danfo' | 'train';
export type MissionType = 'goto' | 'kill' | 'drive' | 'survive' | 'transit';

export interface MissionDef {
  id: string;
  title: string;
  giverName: string;
  giverLine: string;
  giverX: number;
  giverZ: number;
  objective: string;
  type: MissionType;
  targetX: number;
  targetZ: number;
  targetRadius: number;
  targetLabel: string;
  targetGroup?: string;
  targetCount?: number;
  surviveSeconds?: number;
  transitMode?: MissionTransitMode;
  transitTargetId?: string;
  rewardMoney: number;
  rewardWeapon?: 'smg' | 'shotgun' | 'rifle' | 'revolver' | 'carbine';
  rewardAmmo?: number;
}

export type MissionStatus = 'available' | 'active' | 'complete' | 'failed';

interface MissionState {
  status: MissionStatus;
  kills: number;
  survived: number;
  startedAt: number;
}

export interface MissionProgressSnapshot {
  completedIds: string[];
  activeId: string | null;
  activeKills: number;
  activeSurvived: number;
}

const DEFS: MissionDef[] = [
  {
    id: 'market-run',
    title: 'Market Run',
    giverName: 'Alhaji Sani',
    giverLine: 'My sister dey wait for this package at Kurmi Market. Carry am, no delay.',
    giverX: -13.5,
    giverZ: 50,
    objective: 'Deliver the package to Kurmi Market',
    type: 'goto',
    targetX: -13.5,
    targetZ: -58,
    targetRadius: 3.2,
    targetLabel: 'KURMI MARKET',
    rewardMoney: 200,
    rewardAmmo: 24
  },
  {
    id: 'keke-boys',
    title: 'Keke Boys',
    giverName: 'Mama Nkechi',
    giverLine: 'Those boys dey harass my customers near the market. Show them say market no be their place.',
    giverX: -13.5,
    giverZ: -52,
    objective: 'Defeat the thugs harassing the market',
    type: 'kill',
    targetX: -13.5,
    targetZ: -40,
    targetRadius: 12,
    targetLabel: 'MARKET THUGS',
    targetGroup: 'market',
    targetCount: 3,
    rewardMoney: 350,
    rewardWeapon: 'smg',
    rewardAmmo: 60
  },
  {
    id: 'school-delivery',
    title: 'School Delivery',
    giverName: 'Malam Bala',
    giverLine: 'The exam papers never reach the school. Take them to Community School before the children scatter.',
    giverX: 13.5,
    giverZ: 34,
    objective: 'Drive or walk the papers to Community School',
    type: 'goto',
    targetX: 13.5,
    targetZ: -112,
    targetRadius: 3.4,
    targetLabel: 'COMMUNITY SCHOOL',
    rewardMoney: 250,
    rewardAmmo: 30
  },
  {
    id: 'nepa-generator-run',
    title: 'NEPA No Light',
    giverName: 'Mallam Musa',
    giverLine: 'NEPA take light again, and Hauwa generator don run dry. Abeg carry this jerrycan to her house before night.',
    giverX: 12.05,
    giverZ: -148,
    objective: 'Deliver generator fuel to Hauwa\u2019s home',
    type: 'goto',
    targetX: -12.05,
    targetZ: 150,
    targetRadius: 3.2,
    targetLabel: 'HAUWA\u2019S HOME',
    rewardMoney: 300,
    rewardAmmo: 18
  },
  {
    id: 'garage-job',
    title: 'Garage Job',
    giverName: 'Mechanic Emeka',
    giverLine: 'My spare parts dey for the garage. Bring the car around so I can fix am.',
    giverX: -13.5,
    giverZ: 6,
    objective: 'Drive a vehicle to Okada Garage',
    type: 'drive',
    targetX: -13.5,
    targetZ: 6,
    targetRadius: 4.2,
    targetLabel: 'OKADA GARAGE',
    rewardMoney: 300,
    rewardWeapon: 'shotgun',
    rewardAmmo: 24
  },
  {
    id: 'heat',
    title: 'Heat',
    giverName: 'Area Boy',
    giverLine: 'You think say you hard? Make police chase you for twenty seconds, then come talk.',
    giverX: -13.5,
    giverZ: 30,
    objective: 'Survive a police pursuit for 20 seconds',
    type: 'survive',
    targetX: -13.5,
    targetZ: 30,
    targetRadius: 3,
    targetLabel: 'POLICE PURSUIT',
    surviveSeconds: 20,
    rewardMoney: 500,
    rewardWeapon: 'rifle',
    rewardAmmo: 40
  },
  {
    id: 'danfo-connection',
    title: 'Danfo Connection',
    giverName: 'Hajiya Rabi',
    giverLine: 'My parcel no fit wait. Board danfo for the west terminal and drop am for Bompai stop.',
    giverX: -384,
    giverZ: -274,
    objective: 'Take a Danfo to Bompai City Stop',
    type: 'transit',
    targetX: -220,
    targetZ: -180,
    targetRadius: 8,
    targetLabel: 'BOMPAI CITY STOP',
    transitMode: 'danfo',
    transitTargetId: 'bompai-terminal',
    rewardMoney: 300,
    rewardAmmo: 24
  },
  {
    id: 'hospital-courier',
    title: 'Hospital Courier',
    giverName: 'Nurse Amina',
    giverLine: 'The clinic needs these supplies before the next shift. Take them straight to General Hospital.',
    giverX: -180,
    giverZ: -204,
    objective: 'Deliver the medical supplies to General Hospital',
    type: 'goto',
    targetX: 15.25,
    targetZ: 20,
    targetRadius: 4.5,
    targetLabel: 'GENERAL HOSPITAL',
    rewardMoney: 350,
    rewardAmmo: 30
  },
  {
    id: 'agege-trouble',
    title: 'Agege Trouble',
    giverName: 'Aunty Bisi',
    giverLine: 'Those boys dey disturb people near the avenue. Chase them away before this matter grow.',
    giverX: 80,
    giverZ: 184,
    objective: 'Defeat the gang near the western avenue',
    type: 'kill',
    targetX: -64,
    targetZ: 150,
    targetRadius: 12,
    targetLabel: 'AGEGE GANG',
    targetGroup: 'agege',
    targetCount: 2,
    rewardMoney: 400,
    rewardWeapon: 'revolver',
    rewardAmmo: 36
  },
  {
    id: 'rail-connection',
    title: 'Rail Connection',
    giverName: 'Bello the Porter',
    giverLine: 'My luggage dey wait for me at Sabon Gari. Help me catch the city train before the platform close.',
    giverX: 316,
    giverZ: 70,
    objective: 'Take the city train to Sabon Gari station',
    type: 'transit',
    targetX: 384,
    targetZ: 282,
    targetRadius: 8,
    targetLabel: 'SABON GARI RAIL STATION',
    transitMode: 'train',
    transitTargetId: 'sabon-gari-rail',
    rewardMoney: 450,
    rewardWeapon: 'carbine',
    rewardAmmo: 36
  },
  {
    id: 'garage-night-shift',
    title: 'Night Shift',
    giverName: 'Mechanic Emeka',
    giverLine: 'This motor no go reach the garage by itself. Bring am back before my boys lock up.',
    giverX: 80,
    giverZ: -108,
    objective: 'Drive a vehicle to Okada Garage',
    type: 'drive',
    targetX: -15.25,
    targetZ: 6,
    targetRadius: 4.2,
    targetLabel: 'OKADA GARAGE',
    rewardMoney: 450,
    rewardAmmo: 36
  },
  {
    id: 'fagge-last-run',
    title: 'Fagge Last Run',
    giverName: 'Mallam Sadiq',
    giverLine: 'One more delivery before night. Take this medicine to the Kofar Wambai stop and meet the receiver.',
    giverX: 454,
    giverZ: 160,
    objective: 'Deliver the medicine to Kofar Wambai Stop',
    type: 'goto',
    targetX: -584,
    targetZ: -48,
    targetRadius: 5,
    targetLabel: 'KOFAR WAMBAI BUS STOP',
    rewardMoney: 500,
    rewardAmmo: 42
  }
];

export interface MissionUpdateContext {
  position: THREE.Vector3;
  driving: boolean;
  wanted: number;
  dt: number;
}

export interface MissionUpdateResult {
  completed: MissionDef | null;
  failed: MissionDef | null;
}

export class Missions {
  readonly defs = DEFS;
  private states = new Map<string, MissionState>();
  private activeId: string | null = null;

  constructor() {
    for (const def of DEFS) {
      this.states.set(def.id, { status: 'available', kills: 0, survived: 0, startedAt: 0 });
    }
  }

  get active(): MissionDef | null {
    if (!this.activeId) return null;
    const def = this.defs.find((d) => d.id === this.activeId);
    return def ?? null;
  }

  get activeState(): MissionState | null {
    if (!this.activeId) return null;
    return this.states.get(this.activeId) ?? null;
  }

  get completedCount(): number {
    return this.defs.filter((d) => this.states.get(d.id)?.status === 'complete').length;
  }

  snapshot(): MissionProgressSnapshot {
    const activeState = this.activeState;
    return {
      completedIds: this.defs
        .filter((def) => this.states.get(def.id)?.status === 'complete')
        .map((def) => def.id),
      activeId: this.activeId,
      activeKills: activeState?.kills ?? 0,
      activeSurvived: activeState?.survived ?? 0
    };
  }

  restore(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object') return;
    const value = snapshot as Partial<MissionProgressSnapshot>;
    for (const state of this.states.values()) {
      state.status = 'available';
      state.kills = 0;
      state.survived = 0;
      state.startedAt = 0;
    }
    this.activeId = null;
    if (Array.isArray(value.completedIds)) {
      for (const id of value.completedIds) {
        if (typeof id !== 'string' || !this.states.has(id)) continue;
        this.states.get(id)!.status = 'complete';
      }
    }

    if (typeof value.activeId !== 'string') return;
    const activeDef = this.defs.find((def) => def.id === value.activeId);
    if (!activeDef || this.states.get(activeDef.id)?.status === 'complete') return;
    if (this.nextMission()?.id !== activeDef.id) return;

    const state = this.states.get(activeDef.id)!;
    state.status = 'active';
    state.kills = Number.isFinite(value.activeKills)
      ? Math.max(0, Math.min(activeDef.targetCount ?? 0, Math.floor(value.activeKills!)))
      : 0;
    state.survived = Number.isFinite(value.activeSurvived)
      ? Math.max(0, Math.min(activeDef.surviveSeconds ?? 0, value.activeSurvived!))
      : 0;
    state.startedAt = performance.now() / 1000;
    this.activeId = activeDef.id;
  }

  nextMission(): MissionDef | null {
    for (const def of this.defs) {
      const state = this.states.get(def.id);
      if (state?.status === 'complete') continue;
      const index = this.defs.indexOf(def);
      const previousComplete = index === 0 || this.states.get(this.defs[index - 1].id)?.status === 'complete';
      if (!previousComplete) return null;
      if (state?.status === 'active') return null;
      return def;
    }
    return null;
  }

  giverPosition(def: MissionDef): THREE.Vector3 {
    return new THREE.Vector3(def.giverX, 0, def.giverZ);
  }

  start(id: string): MissionDef | null {
    const def = this.defs.find((d) => d.id === id);
    if (!def) return null;
    const next = this.nextMission();
    if (!next || next.id !== id) return null;
    const state = this.states.get(id)!;
    state.status = 'active';
    state.kills = 0;
    state.survived = 0;
    state.startedAt = performance.now() / 1000;
    this.activeId = id;
    return def;
  }

  notifyKill(groupId: string): void {
    const def = this.active;
    const state = this.activeState;
    if (!def || !state) return;
    if (def.type !== 'kill' || def.targetGroup !== groupId) return;
    state.kills += 1;
  }

  completeTransit(mode: MissionTransitMode, stopId: string): MissionDef | null {
    const def = this.active;
    if (
      !def ||
      def.type !== 'transit' ||
      def.transitMode !== mode ||
      def.transitTargetId !== stopId
    ) {
      return null;
    }

    const state = this.states.get(def.id);
    if (!state) return null;
    state.status = 'complete';
    this.activeId = null;
    return def;
  }

  update(ctx: MissionUpdateContext): MissionUpdateResult {
    const def = this.active;
    const state = this.activeState;
    const result: MissionUpdateResult = { completed: null, failed: null };
    if (!def || !state) return result;

    const dx = ctx.position.x - def.targetX;
    const dz = ctx.position.z - def.targetZ;
    const distance = Math.hypot(dx, dz);

    if (def.type === 'goto' && distance <= def.targetRadius) {
      state.status = 'complete';
      this.activeId = null;
      result.completed = def;
      return result;
    }

    if (def.type === 'drive' && distance <= def.targetRadius && ctx.driving) {
      state.status = 'complete';
      this.activeId = null;
      result.completed = def;
      return result;
    }

    if (def.type === 'kill' && state.kills >= (def.targetCount ?? 1)) {
      state.status = 'complete';
      this.activeId = null;
      result.completed = def;
      return result;
    }

    if (def.type === 'survive') {
      if (ctx.wanted >= 2) {
        state.survived += ctx.dt;
      } else if (state.survived > 0) {
        state.survived = Math.max(0, state.survived - ctx.dt * 0.5);
      }
      if (state.survived >= (def.surviveSeconds ?? 20)) {
        state.status = 'complete';
        this.activeId = null;
        result.completed = def;
      }
    }

    return result;
  }

  failActive(): MissionDef | null {
    const def = this.active;
    if (!def) return null;
    const state = this.states.get(def.id);
    if (state) {
      state.status = 'available';
      state.kills = 0;
      state.survived = 0;
    }
    this.activeId = null;
    return def;
  }

  objectivePosition(): THREE.Vector3 | null {
    const def = this.active;
    if (!def) return null;
    return new THREE.Vector3(def.targetX, 0, def.targetZ);
  }

  progressText(): string {
    const def = this.active;
    const state = this.activeState;
    if (!def || !state) return '';
    if (def.type === 'kill') return `${state.kills}/${def.targetCount ?? 1}`;
    if (def.type === 'survive') return `${Math.max(0, Math.ceil((def.surviveSeconds ?? 20) - state.survived))}s`;
    if (def.type === 'transit') return def.transitMode === 'train' ? 'TRAIN TRIP' : 'DANFO TRIP';
    return '';
  }

  reset(): void {
    for (const def of this.defs) {
      const state = this.states.get(def.id);
      if (!state) continue;
      if (state.status === 'active' || state.status === 'failed') state.status = 'available';
      state.kills = 0;
      state.survived = 0;
    }
    this.activeId = null;
  }
}
