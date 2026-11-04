import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeDirectMeshes } from './MeshMerge';

export interface CharacterRig {
  group: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  height: number;
}

export interface CharacterColors {
  skin: number;
  shirt: number;
  pants: number;
  shoes: number;
  accent?: number;
  hair?: number;
  chain?: number;
}

export interface CharacterStyle {
  build?: number;
  bodyType?: 'average' | 'athletic' | 'muscular' | 'heavy';
  outfit?: 'button-up' | 'graphic-tee' | 'senator' | 'kaftan' | 'agbero-vest';
  footwear?: 'sneakers' | 'slides';
  hairStyle?: 'fade' | 'afro' | 'bald' | 'braids';
  cap?: boolean;
  capColor?: number;
  capStyle?: 'snapback' | 'northern';
  capBackwards?: boolean;
  headwrap?: boolean;
  headwrapColor?: number;
  glasses?: boolean;
  vest?: boolean;
  vestColor?: number;
  reflectiveVest?: boolean;
  sleeves?: 'short' | 'long' | 'tank';
  bottoms?: 'long' | 'shorts';
  beard?: boolean;
  stubble?: boolean;
  earring?: boolean;
  /** Flat chest print, the kind of graphic tee you see all over the street. */
  print?: number;
}

const BASE_HEIGHT = 1.82;
const HIP_HEIGHT = 0.9;

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function std(color: number, roughness = 0.88): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materialCache.set(key, material);
  }
  return material;
}

function tint(color: number, factor: number): number {
  const c = new THREE.Color(color);
  c.multiplyScalar(factor);
  return c.getHex();
}

function mix(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  ca.lerp(cb, t);
  return ca.getHex();
}

function add(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | number,
  x = 0,
  y = 0,
  z = 0,
  roughness = 0.88
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geometry,
    typeof material === 'number' ? std(material, roughness) : material
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function sphere(
  parent: THREE.Object3D,
  radius: number,
  color: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  segments = 12
): THREE.Mesh {
  const mesh = add(
    parent,
    new THREE.SphereGeometry(radius, segments, Math.max(6, Math.round(segments * 0.7))),
    color,
    x,
    y,
    z
  );
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

function block(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  radius: number,
  color: number,
  x: number,
  y: number,
  z: number,
  segments = 2
): THREE.Mesh {
  const safe = Math.max(0.001, Math.min(radius, Math.min(w, h, d) / 2 - 0.0005));
  return add(parent, new RoundedBoxGeometry(w, h, d, segments, safe), color, x, y, z);
}

function capsule(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  color: number,
  x: number,
  y: number,
  z: number,
  radial = 10
): THREE.Mesh {
  return add(parent, new THREE.CapsuleGeometry(radius, length, 3, radial), color, x, y, z);
}

function ring(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: number,
  x: number,
  y: number,
  z: number,
  radial = 12,
  sx = 1,
  sz = 1
): THREE.Mesh {
  const mesh = add(
    parent,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial),
    color,
    x,
    y,
    z
  );
  mesh.scale.set(sx, 1, sz);
  return mesh;
}

/** Lathe a body/garment profile. Points are [radius, y] from bottom to top. */
function lathe(
  parent: THREE.Object3D,
  profile: Array<[number, number]>,
  color: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sz = 1,
  segments = 14
): THREE.Mesh {
  const points = profile.map(([r, py]) => new THREE.Vector2(r, py));
  const mesh = add(parent, new THREE.LatheGeometry(points, segments), color, x, y, z);
  mesh.scale.set(sx, 1, sz);
  return mesh;
}

function compactCharacter(rig: CharacterRig): CharacterRig {
  for (const group of [
    rig.torso,
    rig.head,
    rig.leftArm,
    rig.rightArm,
    rig.leftElbow,
    rig.rightElbow,
    rig.leftLeg,
    rig.rightLeg,
    rig.leftKnee,
    rig.rightKnee
  ]) {
    mergeDirectMeshes(group, 'vertexColor');
  }
  return rig;
}

/**
 * Low-poly character built the San Andreas way: big readable silhouette,
 * layered clothing, proper shoulders and chunky sneakers, then a face and
 * hair on top. Everything is merged per limb so a whole character costs about
 * ten draw calls and well under a tenth of the old triangle count.
 */
export function createCharacter(
  colors: CharacterColors,
  height = BASE_HEIGHT,
  style: CharacterStyle = {}
): CharacterRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const skin = colors.skin;
  const shirt = colors.shirt;
  const pants = colors.pants;
  const accent = colors.accent ?? 0xeeeeea;
  const hair = colors.hair ?? 0x15110d;
  const shoe = colors.shoes;
  const build = style.build ?? 1;
  const bodyType = style.bodyType ?? 'athletic';
  const outfit = style.outfit ?? 'button-up';
  const tank = style.sleeves === 'tank';
  const longSleeves = style.sleeves === 'long' || outfit === 'senator';
  const shorts = style.bottoms === 'shorts';
  const waistScale = bodyType === 'heavy' ? 1.18 : bodyType === 'muscular' ? 0.96 : 1;
  const armScale =
    bodyType === 'muscular' ? 1.34 : bodyType === 'heavy' ? 1.17 : bodyType === 'athletic' ? 1.1 : 1.03;
  const legScale =
    bodyType === 'muscular' ? 1.18 : bodyType === 'heavy' ? 1.16 : bodyType === 'athletic' ? 1.08 : 1.03;
  const torsoWidth =
    bodyType === 'muscular' ? 1.28 : bodyType === 'heavy' ? 1.14 : bodyType === 'athletic' ? 1.12 : 1.06;
  const torsoDepth =
    bodyType === 'muscular' ? 0.78 : bodyType === 'heavy' ? 0.76 : bodyType === 'athletic' ? 0.73 : 0.7;
  const shoulderSpan = bodyType === 'muscular' ? 1.2 : bodyType === 'heavy' ? 1.1 : 1;
  const longTunic = outfit === 'senator' || outfit === 'kaftan';
  const tee = outfit === 'graphic-tee' || outfit === 'agbero-vest';

  const shirtShade = tint(shirt, 0.84);
  const shirtLight = tint(shirt, 1.12);
  const jeansShade = tint(pants, 0.72);
  const skinShade = tint(skin, 0.9);

  const torso = new THREE.Group();
  torso.position.y = HIP_HEIGHT;
  body.add(torso);

  // ---------------------------------------------------------------- pelvis
  // Baggy jeans: seat, hips, waistband, fly, belt and back pockets.
  lathe(
    torso,
    [
      [0.150, -0.145],
      [0.168, -0.11],
      [0.178, -0.05],
      [0.176, 0.015],
      [0.166, 0.065]
    ],
    pants,
    0,
    0,
    0,
    1.08 * build * waistScale,
    0.72 * build * waistScale,
    12
  );

  ring(
    torso,
    0.166,
    0.166,
    0.042,
    jeansShade,
    0,
    0.05,
    0,
    14,
    1.08 * build * waistScale,
    0.72 * build * waistScale
  );
  // Belt with buckle and loops.
  ring(torso, 0.171, 0.169, 0.028, 0x2a2219, 0, 0.06, 0, 14, 1.07 * build, 0.72 * build);
  block(torso, 0.062, 0.034, 0.018, 0.006, 0xc9a227, 0, 0.06, 0.126 * build, 1);
  block(torso, 0.03, 0.024, 0.01, 0.004, 0x3a2c18, 0, 0.062, 0.135 * build, 1);
  for (const lx of [-0.115, -0.045, 0.045, 0.115]) {
    block(torso, 0.016, 0.05, 0.014, 0.004, jeansShade, lx * build, 0.06, 0.122 * build, 1);
  }
  block(torso, 0.014, 0.09, 0.01, 0.004, jeansShade, 0, 0.0, 0.128 * build, 1);
  // Back pockets with stitch lines.
  for (const px of [-0.078, 0.078]) {
    block(torso, 0.076, 0.08, 0.014, 0.008, jeansShade, px * build, -0.035, -0.126 * build, 1);
    block(torso, 0.066, 0.008, 0.01, 0.003, tint(pants, 1.35), px * build, 0.004, -0.133 * build, 1);
  }

  // ------------------------------------------------------------------ shirt
  const upperProfile: Array<[number, number]> = longTunic
    ? [
        [0.168, -0.19],
        [0.176, -0.16],
        [0.174, -0.08],
        [0.162, 0.02],
        [0.158, 0.11],
        [0.151, 0.17],
        [0.156, 0.23],
        [0.171, 0.3],
        [0.184, 0.36],
        [0.192, 0.41],
        [0.19, 0.45],
        [0.174, 0.48],
        [0.14, 0.51],
        [0.096, 0.53],
        [0.062, 0.545]
      ]
    : [
        [0.152, 0.075],
        [0.158, 0.11],
        [0.151, 0.17],
        [0.156, 0.23],
        [0.171, 0.3],
        [0.184, 0.36],
        [0.192, 0.41],
        [0.19, 0.45],
        [0.174, 0.48],
        [0.14, 0.51],
        [0.096, 0.53],
        [0.062, 0.545]
      ];

  if (bodyType === 'heavy') {
    for (let i = 0; i < upperProfile.length; i += 1) {
      const [radius, y] = upperProfile[i];
      if (y >= 0.08 && y <= 0.36) upperProfile[i] = [radius * 1.12, y];
    }
  } else if (bodyType === 'muscular') {
    for (let i = 0; i < upperProfile.length; i += 1) {
      const [radius, y] = upperProfile[i];
      if (y >= 0.08 && y <= 0.2) upperProfile[i] = [radius * 0.9, y];
      else if (y >= 0.23 && y <= 0.48) upperProfile[i] = [radius * 1.12, y];
    }
  }

  if (tank || tee || longTunic) {
    // Crew-neck tees and native tunics share the same fitted torso base.
    lathe(torso, upperProfile, shirt, 0, 0, 0, torsoWidth * build, torsoDepth * build, 18);
    ring(torso, 0.073, 0.075, 0.022, shirtShade, 0, 0.541, 0, 14, 1.05, 0.84);
    ring(
      torso,
      0.154,
      0.152,
      0.018,
      shirtShade,
      0,
      longTunic ? -0.175 : 0.081,
      0,
      14,
      torsoWidth * build,
      torsoDepth * build
    );
    if (outfit === 'senator' || outfit === 'kaftan') {
      ring(torso, 0.075, 0.077, 0.035, shirtLight, 0, 0.535, 0, 14, 1.05, 0.9);
      block(torso, 0.018, 0.2, 0.012, 0.004, shirtLight, 0, 0.39, 0.128, 1);
      for (let i = 0; i < 3; i += 1) {
        block(torso, 0.05, 0.014, 0.009, 0.003, accent, 0, 0.45 - i * 0.045, 0.137, 1);
      }
      if (outfit === 'senator') {
        for (const side of [-1, 1]) {
          block(torso, 0.035, 0.12, 0.009, 0.003, shirtLight, side * 0.065, 0.39, 0.119, 1);
          for (let i = 0; i < 3; i += 1) {
            block(torso, 0.016, 0.012, 0.008, 0.002, accent, side * 0.065, 0.425 - i * 0.026, 0.125, 1);
          }
        }
      }
    } else if (style.print !== undefined && tee) {
      block(torso, 0.14, 0.13, 0.008, 0.01, style.print, 0, 0.33, 0.131, 1);
      block(torso, 0.075, 0.012, 0.006, 0.003, accent, 0, 0.365, 0.137, 1);
      block(torso, 0.012, 0.055, 0.006, 0.003, accent, -0.03, 0.33, 0.137, 1);
      block(torso, 0.012, 0.055, 0.006, 0.003, accent, 0.03, 0.33, 0.137, 1);
    }
  } else {
    lathe(torso, upperProfile, shirt, 0, 0, 0, torsoWidth * build, torsoDepth * build, 18);
    // Ribbed crew neck.
    ring(torso, 0.073, 0.075, 0.022, shirtShade, 0, 0.541, 0, 14, 1.05, 0.84);
    // Collared everyday shirt.
    for (const side of [-1, 1]) {
      const collar = block(torso, 0.1, 0.026, 0.06, 0.008, shirtLight, side * 0.052, 0.515, 0.094, 1);
      collar.rotation.z = side * -0.42;
      collar.rotation.y = side * 0.2;
    }
    block(torso, 0.014, 0.27, 0.01, 0.003, shirtShade, 0, 0.34, 0.126, 1);
    for (let i = 0; i < 4; i += 1) {
      sphere(torso, 0.009, accent, 0, 0.43 - i * 0.07, 0.132, 0.75, 1, 0.5, 6);
    }
    block(torso, 0.082, 0.08, 0.016, 0.006, shirtLight, -0.075, 0.375, 0.122, 1);
    block(torso, 0.086, 0.012, 0.018, 0.003, shirtShade, -0.075, 0.412, 0.124, 1);
    ring(torso, 0.154, 0.152, 0.018, shirtShade, 0, 0.081, 0, 14, 1.15 * build, 0.7 * build);
  }

  // Shoulders are carried by the arm caps, not by balls stuck on the torso.
  // Only the short-sleeve seam belongs on the body.
  if (!tank) {
    for (const side of [-1, 1]) {
      const seam = block(
        torso,
        0.05,
        0.016,
        0.16,
        0.005,
        shirtShade,
        side * 0.176 * build * shoulderSpan,
        0.482,
        0.0,
        1
      );
      seam.rotation.z = side * 0.32;
    }
  }

  // Chain and pendant: beads laid along the actual chest surface so the links
  // sit on the shirt instead of floating or sinking into it.
  if (colors.chain !== undefined) {
    const radiusAt = (y: number): number => {
      if (y <= upperProfile[0][1]) return upperProfile[0][0];
      for (let i = 1; i < upperProfile.length; i += 1) {
        const [r0, y0] = upperProfile[i - 1];
        const [r1, y1] = upperProfile[i];
        if (y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
      }
      return upperProfile[upperProfile.length - 1][0];
    };
    const chestZ = (x: number, y: number): number => {
      const r = radiusAt(y);
      const halfX = r * torsoWidth * build;
      const halfZ = r * torsoDepth * build;
      const t = Math.max(0, 1 - (x * x) / (halfX * halfX));
      return halfZ * Math.sqrt(t);
    };
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 8; i += 1) {
        const t = i / 8;
        const x = side * 0.07 * (1 - t);
        const y = 0.505 - 0.075 * t;
        sphere(torso, 0.0075, colors.chain, x, y, chestZ(x, y) + 0.003, 1, 1, 0.6, 6);
      }
    }
    const pendantZ = chestZ(0, 0.43) + 0.006;
    block(torso, 0.02, 0.03, 0.007, 0.003, colors.chain, 0, 0.428, pendantZ, 1);
    block(torso, 0.03, 0.007, 0.007, 0.002, colors.chain, 0, 0.435, pendantZ, 1);
  }

  if (style.vest) {
    const vestColor = style.reflectiveVest ? 0xd7d33c : style.vestColor ?? 0x2a2f38;
    for (const side of [-1, 1]) {
      block(torso, 0.078, 0.4, 0.26, 0.02, vestColor, side * 0.142 * build, 0.29, 0, 1);
      block(torso, 0.05, 0.09, 0.28, 0.016, vestColor, side * 0.098 * build, 0.46, 0, 1);
    }
    block(torso, 0.29, 0.4, 0.026, 0.018, vestColor, 0, 0.29, -0.105, 1);
    block(torso, 0.29, 0.4, 0.026, 0.018, vestColor, 0, 0.29, 0.105, 1);
    if (style.reflectiveVest) {
      for (const y of [0.22, 0.38]) {
        block(torso, 0.27, 0.024, 0.012, 0.005, 0xf0f0d7, 0, y, 0.125, 1);
        block(torso, 0.27, 0.024, 0.012, 0.005, 0xf0f0d7, 0, y, -0.125, 1);
      }
    }
  }

  // ------------------------------------------------------------- neck / head
  // Short, thick neck that meets the trapezius instead of a floating stalk.
  ring(torso, 0.064, 0.071, 0.122, skin, 0, 0.573, 0, 12, 1, 0.92);

  const head = new THREE.Group();
  head.position.set(0, 0.62, 0);
  torso.add(head);

  // Clean skull and jaw volumes. Detail comes from features rather than from
  // extra lumps that read as tumours in profile.
  sphere(head, 0.108, skin, 0, 0.138, 0.006, 1.0, 1.06, 1.0, 16);
  sphere(head, 0.086, skin, 0, 0.078, 0.008, 0.98, 0.75, 0.9, 14);
  sphere(head, 0.032, skin, 0, 0.05, 0.052, 1.2, 0.7, 0.9, 10);
  for (const side of [-1, 1]) {
    // Ears sit behind the cheek line and are mostly flat.
    sphere(head, 0.03, skin, side * 0.106, 0.132, -0.008, 0.45, 1, 0.82, 8);
    sphere(head, 0.015, skinShade, side * 0.109, 0.131, -0.002, 0.4, 0.95, 0.62, 6);
  }

  // Brows sit on a shallow ridge, thin enough not to look painted on.
  for (const side of [-1, 1]) {
    const brow = block(head, 0.05, 0.012, 0.016, 0.004, hair, side * 0.044, 0.177, 0.099, 1);
    brow.rotation.z = side * 0.13;
    brow.rotation.y = side * -0.1;
  }

  // Eyes: sclera, iris, pupil, catchlight, lids. They sit proud of the face so
  // the whites actually catch the light instead of sinking into the skull.
  const eyeY = 0.149;
  for (const side of [-1, 1]) {
    const ex = side * 0.043;
    sphere(head, 0.016, 0xece4d6, ex, eyeY, 0.1, 1.1, 0.78, 0.55, 8);
    sphere(head, 0.0092, 0x3a2418, ex, eyeY, 0.106, 1, 1, 0.5, 6);
    sphere(head, 0.0044, 0x100c08, ex, eyeY, 0.1095, 1, 1, 0.55, 6);
    sphere(head, 0.0022, 0xf8f4e8, ex + side * 0.0035, eyeY + 0.0045, 0.1108, 1, 1, 0.6, 4);
    const lid = block(head, 0.05, 0.014, 0.016, 0.004, skin, ex, eyeY + 0.01, 0.105, 1);
    lid.rotation.z = side * 0.09;
    block(head, 0.042, 0.009, 0.013, 0.003, skinShade, ex, eyeY - 0.011, 0.105, 1);
  }

  if (style.glasses) {
    for (const side of [-1, 1]) {
      block(head, 0.054, 0.034, 0.012, 0.006, 0x14161a, side * 0.041, 0.149, 0.115, 1);
      block(head, 0.006, 0.085, 0.008, 0.002, 0x14161a, side * 0.09, 0.15, 0.09, 1);
    }
    block(head, 0.024, 0.008, 0.01, 0.002, 0x14161a, 0, 0.153, 0.115, 1);
  }

  // Nose: one tapered volume plus the ball of the tip.
  sphere(head, 0.022, skin, 0, 0.112, 0.101, 0.55, 1.55, 0.85, 10);
  sphere(head, 0.0165, skin, 0, 0.093, 0.108, 1.2, 0.9, 0.95, 8);
  for (const side of [-1, 1]) {
    sphere(head, 0.005, 0x4a2c1c, side * 0.011, 0.09, 0.111, 1, 0.8, 0.5, 4);
  }

  // Lips and mouth line.
  const lip = mix(skin, 0x7a3a34, 0.55);
  const upperLip = block(head, 0.048, 0.012, 0.016, 0.004, lip, 0, 0.073, 0.092, 1);
  upperLip.rotation.x = -0.1;
  block(head, 0.044, 0.013, 0.015, 0.004, lip, 0, 0.061, 0.092, 1);
  block(head, 0.042, 0.004, 0.008, 0.002, 0x351c13, 0, 0.0675, 0.099, 1);

  if (style.beard) {
    // Trimmed sideburns, moustache and a shaped goatee, kept close to the skin.
    const beardColor = mix(hair, skin, 0.14);
    for (const side of [-1, 1]) {
      block(head, 0.012, 0.05, 0.024, 0.004, beardColor, side * 0.094, 0.127, 0.014, 1);
    }
    const moustache = block(head, 0.042, 0.009, 0.013, 0.003, beardColor, 0, 0.08, 0.094, 1);
    moustache.rotation.z = 0.03;
    block(head, 0.026, 0.013, 0.015, 0.004, beardColor, 0, 0.045, 0.086, 1);
    sphere(head, 0.019, beardColor, 0, 0.037, 0.083, 1.2, 0.6, 0.6, 8);
    block(head, 0.007, 0.019, 0.009, 0.002, beardColor, 0, 0.059, 0.094, 1);
  } else if (style.stubble) {
    sphere(head, 0.086, tint(hair, 0.9), 0, 0.06, 0.014, 0.96, 0.72, 0.92, 10);
  }

  if (style.earring || colors.chain !== undefined) {
    sphere(head, 0.007, colors.chain ?? 0xd9b44a, 0.11, 0.105, -0.004, 1, 1, 0.7, 6);
  }

  // -------------------------------------------------------------------- hair
  if (style.headwrap) {
    const wrapColor = style.headwrapColor ?? 0xd4a12f;
    sphere(head, 0.116, wrapColor, 0, 0.203, -0.006, 1.04, 0.78, 1.03, 14);
    add(head, new THREE.CylinderGeometry(0.117, 0.104, 0.032, 14), wrapColor, 0, 0.132, -0.012).scale.set(1.05, 1, 1.02);
    sphere(head, 0.052, wrapColor, 0, 0.17, -0.118, 1.1, 0.92, 1, 10);
    const knot = block(head, 0.07, 0.05, 0.04, 0.012, tint(wrapColor, 0.9), 0.09, 0.16, -0.1, 1);
    knot.rotation.z = 0.4;
  } else if (style.cap && style.capStyle === 'northern') {
    const capColor = style.capColor ?? 0xd7d3c7;
    lathe(
      head,
      [[0.065, 0.16], [0.078, 0.17], [0.082, 0.2], [0.068, 0.23], [0.042, 0.25]],
      capColor,
      0,
      0,
      -0.005,
      1.05,
      1,
      16
    );
    for (let i = -2; i <= 2; i += 1) {
      block(head, 0.008, 0.048, 0.006, 0.002, tint(capColor, 0.72), i * 0.024, 0.204, 0.071, 1);
    }
  } else if (style.cap) {
    const capColor = style.capColor ?? 0x17181c;
    sphere(head, 0.112, capColor, 0, 0.196, -0.008, 1.03, 0.72, 1.04, 14);
    const backwards = style.capBackwards === true;
    const brimZ = backwards ? -0.118 : 0.118;
    const brim = block(head, 0.19, 0.022, 0.125, 0.01, capColor, 0, 0.19, brimZ, 1);
    brim.rotation.x = backwards ? 0.12 : -0.1;
    add(head, new THREE.CylinderGeometry(0.014, 0.014, 0.012, 8), tint(capColor, 1.25), 0, 0.264, -0.008);
    block(head, 0.034, 0.016, 0.006, 0.003, 0xecece6, 0, 0.2, backwards ? -0.176 : 0.176, 1);
  } else if (style.hairStyle !== 'bald') {
    if (style.hairStyle === 'afro') {
      sphere(head, 0.142, hair, 0, 0.2, -0.012, 1.02, 1.0, 1.03, 14);
      for (const side of [-1, 1]) {
        sphere(head, 0.062, hair, side * 0.108, 0.15, -0.012, 0.8, 1.08, 0.92, 8);
      }
      block(head, 0.15, 0.03, 0.03, 0.01, hair, 0, 0.15, 0.086, 1);
    } else if (style.hairStyle === 'braids') {
      sphere(head, 0.111, hair, 0, 0.196, -0.01, 1.01, 0.7, 1.02, 14);
      // Cornrows running front to back over the crown.
      for (let i = -2; i <= 2; i += 1) {
        const row = capsule(head, 0.014, 0.14, hair, i * 0.043, 0.213 - Math.abs(i) * 0.008, -0.012, 6);
        row.rotation.x = Math.PI / 2 - 0.18;
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i += 1) {
          block(head, 0.02, 0.07, 0.014, 0.005, hair, side * 0.075, 0.19 - i * 0.022, -0.045 - i * 0.01, 1);
        }
      }
      // Hanging braids at the back.
      for (let i = -1; i <= 1; i += 1) {
        const braid = capsule(head, 0.013, 0.16, hair, i * 0.045, 0.06, -0.1, 6);
        braid.rotation.x = 0.18;
      }
    } else {
      // Low fade: crisp crown, rounded back, tapered sides, sharp line-up.
      sphere(head, 0.11, hair, 0, 0.194, -0.008, 1.01, 0.6, 1.03, 14);
      sphere(head, 0.086, hair, 0, 0.163, -0.05, 1.12, 0.9, 0.66, 12);
      for (const side of [-1, 1]) {
        sphere(head, 0.054, hair, side * 0.086, 0.178, -0.022, 0.72, 0.9, 0.95, 8);
      }
      const line = block(head, 0.135, 0.01, 0.014, 0.003, hair, 0, 0.197, 0.092, 1);
      line.rotation.x = -0.5;
    }
  }

  // -------------------------------------------------------------------- arms
  const makeArm = (side: -1 | 1): { arm: THREE.Group; elbow: THREE.Group } => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.195 * build * shoulderSpan, 0.446, 0);
    torso.add(arm);

    if (!tank) {
      // Short sleeve: a single lathe from the hem up over the deltoid, so the
      // shoulder rounds off instead of wearing a ball on top.
      lathe(
        arm,
        [
          [0.055, longSleeves ? -0.3 : -0.16],
          [0.06, longSleeves ? -0.255 : -0.125],
          [0.064, longSleeves ? -0.18 : -0.07],
          [0.066, -0.02],
          [0.065, 0.02],
          [0.06, 0.055],
          [0.045, 0.08],
          [0.024, 0.095]
        ],
        shirt,
        0,
        0,
        0,
        armScale,
        0.94 * armScale,
        12
      );
      ring(
        arm,
        0.058,
        0.058,
        0.014,
        shirtShade,
        0,
        longSleeves ? -0.295 : -0.157,
        0,
        10,
        1.02 * armScale,
        0.94 * armScale
      );
    }

    // Upper arm and deltoid in one profile; the shoulder dome carries the
    // bare-shoulder look when the character is in a tank top.
    lathe(
      arm,
      [
        [0.044, -0.29],
        [0.052, -0.25],
        [0.064, -0.19],
        [0.067, -0.11],
        [0.068, -0.03],
        [0.073, 0.015],
        [0.071, 0.05],
        [0.05, 0.082],
        [0.022, 0.1]
      ],
      skin,
      0,
      0,
      0,
      armScale,
      0.94 * armScale,
      10
    );
    sphere(arm, 0.048, skin, 0, -0.285, 0, armScale, 0.95 * armScale, 0.95 * armScale, 10);
    if (bodyType === 'muscular') {
      sphere(arm, 0.047, skin, 0, -0.19, 0.018, 0.94, 1.3, 0.92, 12);
      sphere(arm, 0.044, skin, 0, -0.19, -0.018, 0.92, 1.26, 0.9, 12);
    }

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.29, 0);
    elbow.rotation.x = -0.06;
    arm.add(elbow);

    if (longSleeves) {
      lathe(
        elbow,
        [
          [0.034, -0.24],
          [0.044, -0.2],
          [0.048, -0.12],
          [0.049, -0.04],
          [0.048, 0.005]
        ],
        shirt,
        0,
        0,
        0,
        armScale,
        armScale,
        10
      );
      ring(elbow, 0.035, 0.036, 0.018, shirtShade, 0, -0.232, 0, 8, armScale, armScale);
    }

    // Forearm with a brachioradialis swell, wrist, hand and fingers.
    lathe(
      elbow,
      [
        [0.031, -0.252],
        [0.036, -0.2],
        [0.043, -0.12],
        [0.047, -0.04],
        [0.047, 0.005]
      ],
      skin,
      0,
      0,
      0,
      armScale,
      0.92 * armScale,
      10
    );
    ring(elbow, 0.033, 0.035, 0.026, skinShade, 0, -0.25, 0, 8, 1, 0.92);

    const palm = block(elbow, 0.068, 0.086, 0.056, 0.02, skin, 0, -0.292, 0.012, 1);
    palm.rotation.x = -0.06;
    for (let f = 0; f < 4; f += 1) {
      const fx = (f - 1.5) * 0.0155;
      const finger = block(elbow, 0.0132, 0.055, 0.02, 0.005, skin, fx, -0.345, 0.015, 1);
      finger.rotation.x = -0.1 - f * 0.02;
    }
    const thumb = block(elbow, 0.018, 0.05, 0.022, 0.006, skin, side * 0.038, -0.3, 0.028, 1);
    thumb.rotation.z = side * 0.7;
    thumb.rotation.x = -0.25;

    // Watch on the left wrist, gold bracelet on the right.
    if (side === -1) {
      ring(elbow, 0.039, 0.04, 0.022, 0x24201c, 0, -0.256, 0, 8);
      block(elbow, 0.026, 0.022, 0.01, 0.004, 0xc9a227, 0, -0.256, 0.037, 1);
    } else if (colors.chain !== undefined) {
      ring(elbow, 0.038, 0.039, 0.014, 0xc9a227, 0, -0.257, 0, 8);
    }

    return { arm, elbow };
  };

  const right = makeArm(1);
  const left = makeArm(-1);

  // -------------------------------------------------------------------- legs
  const makeLeg = (side: -1 | 1): { leg: THREE.Group; knee: THREE.Group } => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.098 * build * legScale, HIP_HEIGHT, 0);
    body.add(leg);

    if (shorts) {
      // Wide cargo shorts with a rolled hem, bare thigh underneath.
      lathe(
        leg,
        [
          [0.086, -0.255],
          [0.093, -0.22],
          [0.099, -0.12],
          [0.1, -0.03],
          [0.095, 0.03]
        ],
        pants,
        0,
        0,
        0,
        legScale,
        0.94 * legScale,
        12
      );
      ring(leg, 0.087, 0.087, 0.024, jeansShade, 0, -0.26, 0, 10, 1.02, 0.96);
      lathe(
        leg,
        [
          [0.058, -0.42],
          [0.063, -0.37],
          [0.07, -0.31]
        ],
        skin,
        0,
        0,
        0,
        legScale,
        0.94 * legScale,
        10
      );
      // Cargo pocket.
      block(leg, 0.018, 0.09, 0.07, 0.006, jeansShade, side * 0.094, -0.12, 0.035, 1);
    } else {
      // Baggy jeans: seat to knee with a pocket and a knee seam.
      lathe(
        leg,
        [
          [0.076, -0.405],
          [0.082, -0.36],
          [0.09, -0.26],
          [0.098, -0.14],
          [0.099, -0.04],
          [0.093, 0.03]
        ],
        pants,
        0,
        0,
        0,
        legScale,
        0.94 * legScale,
        12
      );
      block(leg, 0.02, 0.1, 0.085, 0.008, jeansShade, side * 0.092, -0.14, 0.02, 1);
      block(leg, 0.07, 0.012, 0.07, 0.004, tint(pants, 1.3), side * 0.03, -0.2, 0.072, 1);
    }

    const knee = new THREE.Group();
    knee.position.set(0, -0.405, 0);
    knee.rotation.x = 0.03;
    leg.add(knee);

    if (shorts) {
      // Bare calf and a short white sock.
      sphere(knee, 0.057, skin, 0, 0, 0, 1, 0.92, 0.93, 10);
      lathe(
        knee,
        [
          [0.041, -0.3],
          [0.048, -0.26],
          [0.058, -0.2],
          [0.061, -0.12],
          [0.057, -0.03]
        ],
        skin,
        0,
        0,
        0,
        legScale,
        0.92 * legScale,
        10
      );
      ring(knee, 0.046, 0.049, 0.065, 0xe9e7de, 0, -0.315, 0, 10, 1, 0.94);
    } else {
      // Jean leg ending in a cuff, then the shoe collar.
      sphere(knee, 0.064, pants, 0, 0, 0, 1, 0.9, 0.93, 10);
      lathe(
        knee,
        [
          [0.056, -0.305],
          [0.062, -0.27],
          [0.068, -0.2],
          [0.07, -0.11],
          [0.064, -0.02]
        ],
        pants,
        0,
        0,
        0,
        legScale,
        0.92 * legScale,
        12
      );
      ring(knee, 0.056, 0.058, 0.026, jeansShade, 0, -0.308, 0, 10, 1, 0.94);
      ring(knee, 0.051, 0.051, 0.045, 0xe9e7de, 0, -0.33, 0, 8, 1, 0.94);
    }

    if (style.footwear === 'slides') {
      block(knee, 0.14, 0.028, 0.29, 0.014, tint(shoe, 0.55), 0, -0.434, 0.05, 2);
      block(knee, 0.115, 0.055, 0.22, 0.022, skin, 0, -0.396, 0.058, 2);
      block(knee, 0.13, 0.035, 0.065, 0.014, shoe, 0, -0.365, 0.085, 2);
      block(knee, 0.018, 0.012, 0.045, 0.005, accent, 0, -0.365, 0.084, 1);
    } else {
      // Chunky sneaker: sole, upper, toe box, heel tab, tongue, laces, stripe.
      block(knee, 0.145, 0.042, 0.305, 0.018, 0xf2efe6, 0, -0.437, 0.055, 2);
      block(knee, 0.136, 0.088, 0.27, 0.03, shoe, 0, -0.396, 0.048, 2);
      block(knee, 0.128, 0.062, 0.1, 0.024, shoe, 0, -0.407, 0.166, 1);
      block(knee, 0.104, 0.055, 0.055, 0.014, shoe, 0, -0.382, -0.062, 1);
      block(knee, 0.06, 0.024, 0.062, 0.008, 0xd8d4c8, 0, -0.355, 0.116, 1);
      for (let lace = 0; lace < 3; lace += 1) {
        const laceMesh = block(knee, 0.072, 0.006, 0.008, 0.002, accent, 0, -0.363 + lace * 0.012, 0.116 + lace * 0.016, 1);
        laceMesh.rotation.x = -0.18;
      }
      block(knee, 0.008, 0.024, 0.155, 0.003, accent, side * 0.069, -0.4, 0.04, 1);
      block(knee, 0.132, 0.014, 0.026, 0.005, 0x201d1a, 0, -0.43, 0.196, 1);
    }

    return { leg, knee };
  };

  const rightLeg = makeLeg(1);
  const leftLeg = makeLeg(-1);

  body.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const bbox = new THREE.Box3().setFromObject(body);
  const measured = bbox.max.y - bbox.min.y;
  const scale = measured > 0.01 ? height / measured : 1;
  body.scale.setScalar(scale);
  body.position.y = -bbox.min.y * scale;

  return compactCharacter({
    group,
    torso,
    head,
    leftArm: left.arm,
    rightArm: right.arm,
    leftElbow: left.elbow,
    rightElbow: right.elbow,
    leftLeg: leftLeg.leg,
    rightLeg: rightLeg.leg,
    leftKnee: leftLeg.knee,
    rightKnee: rightLeg.knee,
    height
  });
}

export class HumanoidAnimator {
  phase = 0;
  private idleTime = Math.random() * 10;

  constructor(offset = Math.random() * Math.PI * 2) {
    this.phase = offset;
  }

  update(rig: CharacterRig, dt: number, speed: number, maxSpeed: number): void {
    const norm = Math.min(1, speed / maxSpeed);
    const gait = Math.min(1, speed / 1.1);
    this.idleTime += dt;
    if (speed > 0.08) this.phase += dt * (3.4 + 8.4 * norm);

    const stride = 0.55 * gait + 0.25 * norm;
    const swing = Math.sin(this.phase) * stride;
    const breath = Math.sin(this.idleTime * 1.6) * 0.005 * (1 - gait);

    // Legs with a heel-lift knee bend.
    rig.leftLeg.rotation.x = swing;
    rig.rightLeg.rotation.x = -swing;
    rig.leftKnee.rotation.x = 0.05 + Math.max(0, swing) * 1.15 * gait + 0.1 * gait;
    rig.rightKnee.rotation.x = 0.05 + Math.max(0, -swing) * 1.15 * gait + 0.1 * gait;
    rig.leftLeg.rotation.z = 0.02;
    rig.rightLeg.rotation.z = -0.02;

    // Arms counter-swing, elbows bend on the forward stroke.
    const armSwing = swing * 0.82;
    rig.leftArm.rotation.x = -armSwing + breath * 0.5;
    rig.rightArm.rotation.x = armSwing - breath * 0.5;
    rig.leftArm.rotation.z = 0.075 + breath * 0.35 + gait * 0.02;
    rig.rightArm.rotation.z = -0.075 - breath * 0.35 - gait * 0.02;
    rig.leftElbow.rotation.x = -0.14 - Math.max(0, armSwing) * 0.5;
    rig.rightElbow.rotation.x = -0.14 - Math.max(0, -armSwing) * 0.5;

    // Hips and chest counter-rotate, with a slight forward lean at speed.
    rig.torso.position.y = HIP_HEIGHT + breath + Math.abs(Math.sin(this.phase * 2)) * 0.028 * gait;
    rig.torso.rotation.x = 0.03 * gait + norm * 0.09;
    rig.torso.rotation.z = Math.sin(this.phase) * 0.035 * gait + Math.sin(this.idleTime * 0.7) * 0.012 * (1 - gait);
    rig.torso.rotation.y = Math.sin(this.phase) * 0.075 * gait;

    // Head stays level and looks around when idle.
    rig.head.rotation.x = -0.03 * gait - norm * 0.06;
    rig.head.rotation.y =
      Math.sin(this.idleTime * 0.6) * 0.16 * (1 - gait) - Math.sin(this.phase) * 0.03 * gait;
    rig.head.rotation.z = -rig.torso.rotation.z * 0.4;
  }
}
