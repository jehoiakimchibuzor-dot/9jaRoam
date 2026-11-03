export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'machete';

export type WeaponKind = 'ranged' | 'melee';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  short: string;
  kind: WeaponKind;
  damage: number;
  range: number;
  rate: number;
  magazine: number;
  reserveMax: number;
  pellets: number;
  spread: number;
  auto: boolean;
  reloadTime: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    short: 'PST',
    kind: 'ranged',
    damage: 26,
    range: 55,
    rate: 3.4,
    magazine: 12,
    reserveMax: 120,
    pellets: 1,
    spread: 0.014,
    auto: false,
    reloadTime: 1.35
  },
  smg: {
    id: 'smg',
    name: 'SMG',
    short: 'SMG',
    kind: 'ranged',
    damage: 15,
    range: 42,
    rate: 11,
    magazine: 30,
    reserveMax: 240,
    pellets: 1,
    spread: 0.032,
    auto: true,
    reloadTime: 1.8
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    short: 'SHG',
    kind: 'ranged',
    damage: 13,
    range: 24,
    rate: 1.2,
    magazine: 6,
    reserveMax: 60,
    pellets: 7,
    spread: 0.095,
    auto: false,
    reloadTime: 2.3
  },
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    short: 'RIF',
    kind: 'ranged',
    damage: 42,
    range: 95,
    rate: 2.1,
    magazine: 10,
    reserveMax: 90,
    pellets: 1,
    spread: 0.006,
    auto: false,
    reloadTime: 2
  },
  machete: {
    id: 'machete',
    name: 'Machete',
    short: 'MAC',
    kind: 'melee',
    damage: 48,
    range: 2.3,
    rate: 1.6,
    magazine: 0,
    reserveMax: 0,
    pellets: 1,
    spread: 0,
    auto: false,
    reloadTime: 0
  }
};

const WEAPON_ORDER: WeaponId[] = ['pistol', 'machete', 'smg', 'shotgun', 'rifle'];

export class WeaponInventory {
  readonly order: WeaponId[] = WEAPON_ORDER.slice();
  current: WeaponId = 'pistol';
  cooldown = 0;
  reloadTimer = 0;
  reloading = false;

  private unlocked = new Set<WeaponId>(['pistol', 'machete']);
  private mags: Record<WeaponId, number> = {
    pistol: 12,
    smg: 0,
    shotgun: 0,
    rifle: 0,
    machete: 0
  };
  private reserves: Record<WeaponId, number> = {
    pistol: 60,
    smg: 0,
    shotgun: 0,
    rifle: 0,
    machete: 0
  };

  get spec(): WeaponSpec {
    return WEAPONS[this.current];
  }

  get magazine(): number {
    return this.spec.kind === 'melee' ? Infinity : this.mags[this.current];
  }

  get reserve(): number {
    return this.spec.kind === 'melee' ? Infinity : this.reserves[this.current];
  }

  get isMelee(): boolean {
    return this.spec.kind === 'melee';
  }

  get reloadProgress(): number {
    if (!this.reloading) return 0;
    return 1 - this.reloadTimer / Math.max(0.01, this.spec.reloadTime);
  }

  isUnlocked(id: WeaponId): boolean {
    return this.unlocked.has(id);
  }

  unlock(id: WeaponId, magazine?: number, reserve?: number): boolean {
    if (this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    const spec = WEAPONS[id];
    this.mags[id] = magazine ?? spec.magazine;
    this.reserves[id] = reserve ?? Math.round(spec.reserveMax * 0.4);
    return true;
  }

  addAmmo(id: WeaponId, rounds: number): void {
    if (!this.isUnlocked(id) || WEAPONS[id].kind === 'melee') return;
    this.reserves[id] = Math.min(WEAPONS[id].reserveMax, this.reserves[id] + rounds);
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.reloading || !this.isMelee) {
      if (this.reloading) {
        this.reloadTimer = Math.max(0, this.reloadTimer - dt);
        if (this.reloadTimer <= 0) this.finishReload();
      }
    }
  }

  canFire(): boolean {
    if (this.cooldown > 0 || this.reloading) return false;
    return this.isMelee || this.mags[this.current] > 0;
  }

  consumeFire(): boolean {
    if (!this.canFire()) {
      if (!this.isMelee && this.mags[this.current] <= 0) this.startReload();
      return false;
    }
    this.cooldown = 1 / Math.max(0.1, this.spec.rate);
    if (!this.isMelee) this.mags[this.current] = Math.max(0, this.mags[this.current] - 1);
    if (!this.isMelee && this.mags[this.current] <= 0 && this.reserves[this.current] > 0) {
      this.startReload();
    }
    return true;
  }

  startReload(): boolean {
    if (this.isMelee || this.reloading) return false;
    if (this.mags[this.current] >= this.spec.magazine || this.reserves[this.current] <= 0) return false;
    this.reloading = true;
    this.reloadTimer = this.spec.reloadTime;
    return true;
  }

  private finishReload(): void {
    const need = this.spec.magazine - this.mags[this.current];
    const take = Math.min(need, this.reserves[this.current]);
    this.mags[this.current] += take;
    this.reserves[this.current] -= take;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  switchNext(): WeaponId {
    const available = this.order.filter((id) => this.unlocked.has(id));
    if (available.length === 0) return this.current;
    const index = available.indexOf(this.current);
    this.current = available[(index + 1) % available.length];
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = Math.min(this.cooldown, 0.25);
    return this.current;
  }

  select(id: WeaponId): boolean {
    if (!this.unlocked.has(id)) return false;
    this.current = id;
    this.reloading = false;
    this.reloadTimer = 0;
    return true;
  }

  refillAll(): void {
    for (const id of this.unlocked) {
      const spec = WEAPONS[id];
      if (spec.kind === 'melee') continue;
      this.mags[id] = spec.magazine;
      this.reserves[id] = Math.round(spec.reserveMax * 0.5);
    }
    this.reloading = false;
    this.reloadTimer = 0;
  }
}
