import * as THREE from 'three';
import { CharacterRig, createCharacter } from './CharacterModel';
import { City, ServiceSpot } from '../world/City';

interface Warden {
  rig: CharacterRig;
  x: number;
  z: number;
  phase: number;
  name: string;
  line: string;
}

interface Operator {
  rig: CharacterRig;
  spot: ServiceSpot;
  phase: number;
  side: number;
}

const WARDEN_LINES = [
  'Oga, slow down. Na human being dey road.',
  'Yellow box! No block the junction.',
  'Hold am there. Make the other side pass.',
  'No overtake for junction, abeg.',
  'Keke, park well. You dey block traffic.'
];

/** Traffic wardens on the junctions and POS agents working the kerb. */
export class StreetPeople {
  private wardens: Warden[] = [];
  private operators: Operator[] = [];
  private time = 0;

  constructor(scene: THREE.Scene, city: City) {
    const junctionZs = [city.crossZs[3], city.crossZs[4], city.crossZs[5], city.crossZs[1]];
    for (let i = 0; i < junctionZs.length; i += 1) {
      const z = junctionZs[i];
      const rig = createCharacter(
        { skin: 0x7a4a28, shirt: 0xf1f0e8, pants: 0x1b1d22, shoes: 0x121316, accent: 0xe8e24a },
        1.84,
        {
          build: 1.05,
          cap: true,
          capColor: 0x15171b,
          vest: true,
          vestColor: 0xd9e24a,
          sleeves: 'short',
          bottoms: 'long',
          beard: true
        }
      );
      const x = -(city.roadHalfWidth + 2.7);
      const zz = z - 11.6;
      rig.group.position.set(x, city.sidewalkTop, zz);
      rig.group.rotation.y = 0.86;
      scene.add(rig.group);
      this.wardens.push({
        rig,
        x,
        z: zz,
        phase: i * 1.7,
        name: ['Warden Sani', 'Warden Bello', 'Warden Musa', 'Warden Audu'][i % 4],
        line: WARDEN_LINES[i % WARDEN_LINES.length]
      });
    }

    for (let i = 0; i < city.posStands.length; i += 1) {
      const spot = city.posStands[i];
      const side = Math.sign(spot.x) || 1;
      const rig = createCharacter(
        {
          skin: [0x8a5a36, 0x6b3f22, 0x9a6a45][i % 3],
          shirt: [0x2f6fa8, 0x2f7f5b, 0xc94b33][i % 3],
          pants: [0x2c2c30, 0x3a3a3a, 0x22304a][i % 3],
          shoes: 0x18191c,
          accent: 0xf0ece0
        },
        1.76 + (i % 3) * 0.03,
        {
          build: 0.95 + (i % 2) * 0.08,
          sleeves: 'short',
          bottoms: 'long',
          beard: i % 2 === 0
        }
      );
      const x = side * (city.roadHalfWidth + 4.25);
      rig.group.position.set(x, city.sidewalkTop, spot.z + 0.35);
      rig.group.rotation.y = -side * (Math.PI / 2);
      scene.add(rig.group);
      this.operators.push({ rig, spot, phase: i * 1.3, side });
    }

    this.animate(0);
  }

  update(dt: number): void {
    this.time += dt;
    this.animate(this.time);
  }

  private animate(time: number): void {
    for (const warden of this.wardens) {
      const t = time * 2.1 + warden.phase;
      const rig = warden.rig;
      // Right arm out over the road, sweeping traffic through.
      rig.rightArm.rotation.z = 1.18 + Math.sin(t) * 0.24;
      rig.rightArm.rotation.x = -0.35 + Math.sin(t * 0.7) * 0.22;
      rig.rightElbow.rotation.x = -0.55 - Math.sin(t) * 0.22;
      rig.leftArm.rotation.x = -0.12 + Math.sin(t * 0.9) * 0.08;
      rig.leftArm.rotation.z = -0.1;
      rig.leftElbow.rotation.x = -0.18;
      rig.head.rotation.y = Math.sin(t * 0.45) * 0.45;
      rig.torso.rotation.y = Math.sin(t * 0.45) * 0.12;
    }

    for (const operator of this.operators) {
      const t = time * 1.4 + operator.phase;
      const rig = operator.rig;
      // Leaning over the table, tapping the terminal now and then.
      rig.torso.rotation.x = 0.1 + Math.sin(t * 0.8) * 0.02;
      rig.leftArm.rotation.x = -0.62 + Math.sin(t) * 0.06;
      rig.leftArm.rotation.z = 0.18;
      rig.leftElbow.rotation.x = -0.42;
      rig.rightArm.rotation.x = -0.32 + Math.sin(t * 1.2 + 1) * 0.12;
      rig.rightArm.rotation.z = -0.2;
      rig.rightElbow.rotation.x = -0.55;
      rig.head.rotation.y = Math.sin(t * 0.5) * 0.28;
      rig.head.rotation.x = 0.12;
    }
  }

  wardenNear(point: THREE.Vector3, range: number): { name: string; line: string } | null {
    let best: Warden | null = null;
    let bestDistance = range;
    for (const warden of this.wardens) {
      const distance = Math.hypot(point.x - warden.x, point.z - warden.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = warden;
      }
    }
    return best ? { name: best.name, line: best.line } : null;
  }
}
