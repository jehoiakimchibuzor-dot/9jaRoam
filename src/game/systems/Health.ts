export interface Health {
  hp: number;
  maxHp: number;
  dead: boolean;
  lastHit: number;
}

export function createHealth(maxHp: number, hp = maxHp): Health {
  return { hp, maxHp, dead: false, lastHit: 0 };
}

export function damageHealth(health: Health, amount: number, now: number): boolean {
  if (health.dead || amount <= 0) return false;
  health.hp = Math.max(0, health.hp - amount);
  health.lastHit = now;
  if (health.hp <= 0) {
    health.dead = true;
    return true;
  }
  return false;
}

export function healHealth(health: Health, amount: number): number {
  if (health.dead || amount <= 0) return 0;
  const before = health.hp;
  health.hp = Math.min(health.maxHp, health.hp + amount);
  return health.hp - before;
}

export function restoreHealth(health: Health): void {
  health.hp = health.maxHp;
  health.dead = false;
}
