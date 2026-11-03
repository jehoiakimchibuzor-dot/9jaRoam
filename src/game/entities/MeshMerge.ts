import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Shared material used by meshes whose vertex colors carry the real colors. */
export const VERTEX_COLOR_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.86,
  metalness: 0.03
});

/**
 * Drivers sit in a dark cabin, so they get a small emissive lift to stay
 * readable through tinted glass instead of turning into a silhouette.
 */
export const DRIVER_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.8,
  metalness: 0.02,
  emissive: 0x2a231b,
  emissiveIntensity: 0.55
});

function materialColor(mesh: THREE.Mesh): THREE.Color {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material && 'color' in material && material.color instanceof THREE.Color) {
    return material.color;
  }
  return new THREE.Color(0xffffff);
}

function normalizeGeometry(geometry: THREE.BufferGeometry): void {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') {
      geometry.deleteAttribute(name);
    }
  }
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  if (!geometry.getAttribute('uv')) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
}

function applyVertexColor(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const count = geometry.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    data[i * 3] = color.r;
    data[i * 3 + 1] = color.g;
    data[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
}

/** Unlit material for vehicle lamps merged into a single draw call. */
export const VERTEX_GLOW_MATERIAL = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false
});

function materialOf(mesh: THREE.Mesh): THREE.Material {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

function emissiveColor(mesh: THREE.Mesh): THREE.Color {
  const material = materialOf(mesh) as THREE.MeshStandardMaterial;
  if (material.emissive instanceof THREE.Color && material.emissive.getHex() !== 0) {
    return material.emissive;
  }
  return materialColor(mesh);
}

function mergeGroup(
  parent: THREE.Object3D,
  list: THREE.Mesh[],
  material: THREE.Material,
  colorOf?: (mesh: THREE.Mesh) => THREE.Color
): void {
  if (list.length < 2) return;

  const geometries: THREE.BufferGeometry[] = [];
  for (const mesh of list) {
    mesh.updateMatrix();
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    normalizeGeometry(geometry);
    if (colorOf) applyVertexColor(geometry, colorOf(mesh));
    geometries.push(geometry);
  }

  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) return;

  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  for (const old of list) parent.remove(old);
  parent.add(mesh);
}

type MergeMode = 'material' | 'vertexColor';

/**
 * Merge the direct Mesh children of `parent` into as few draw calls as possible.
 * Groups (limbs, wheels, doors, drivers) are left intact so they keep animating.
 */
export function mergeDirectMeshes(
  parent: THREE.Object3D,
  mode: MergeMode,
  exclude?: Set<THREE.Object3D>
): void {
  const meshes = parent.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh && !(exclude && exclude.has(child))
  );
  if (meshes.length < 2) return;

  if (mode === 'vertexColor') {
    mergeGroup(parent, meshes, VERTEX_COLOR_MATERIAL, materialColor);
    return;
  }

  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const mesh of meshes) {
    const material = materialOf(mesh);
    const list = buckets.get(material);
    if (list) list.push(mesh);
    else buckets.set(material, [mesh]);
  }
  for (const [material, list] of buckets) mergeGroup(parent, list, material);
}

/**
 * Collapse a vehicle shell into three draw calls: one vertex-colored opaque mesh,
 * one unlit lamp mesh, and one mesh per glass material. Transparent parts must stay
 * separate so depth sorting still works.
 */
export function mergeVehicleShell(parent: THREE.Object3D, exclude?: Set<THREE.Object3D>): void {
  const meshes = parent.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh && !(exclude && exclude.has(child))
  );
  if (!meshes.length) return;

  const opaque: THREE.Mesh[] = [];
  const lamps: THREE.Mesh[] = [];
  const glass = new Map<THREE.Material, THREE.Mesh[]>();

  for (const mesh of meshes) {
    const material = materialOf(mesh) as THREE.MeshStandardMaterial;
    if (material.transparent) {
      const list = glass.get(material);
      if (list) list.push(mesh);
      else glass.set(material, [mesh]);
    } else if (material.emissive instanceof THREE.Color && material.emissive.getHex() !== 0) {
      lamps.push(mesh);
    } else {
      opaque.push(mesh);
    }
  }

  mergeGroup(parent, opaque, VERTEX_COLOR_MATERIAL, materialColor);
  mergeGroup(parent, lamps, VERTEX_GLOW_MATERIAL, emissiveColor);
  for (const [material, list] of glass) mergeGroup(parent, list, material);
}

/** Merge a driver/rider group into one mesh, keeping the group visible-toggle intact. */
export function mergeDriverGroup(driver: THREE.Group): void {
  const meshes = driver.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh
  );
  if (meshes.length < 2) return;
  mergeGroup(driver, meshes, DRIVER_MATERIAL, materialColor);
}
