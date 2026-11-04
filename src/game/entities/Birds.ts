import * as THREE from 'three';
import { IS_ANDROID } from '../platform';

interface BirdState {
  angle: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
}

function createBirdTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = '#232a33';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  // A simple gull silhouette: two wings swept up from a small body.
  ctx.moveTo(5, 40);
  ctx.quadraticCurveTo(17, 18, 32, 33);
  ctx.quadraticCurveTo(47, 18, 59, 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, 33);
  ctx.lineTo(32, 42);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class Birds {
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly birds: BirdState[] = [];
  private readonly center = new THREE.Vector3();

  constructor(scene: THREE.Scene, count = IS_ANDROID ? 12 : 20) {
    this.positions = new Float32Array(count * 3);
    this.positions.fill(-9999);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const material = new THREE.PointsMaterial({
      map: createBirdTexture(),
      color: 0x2b3038,
      size: 6.5,
      sizeAttenuation: true,
      transparent: true,
      alphaTest: 0.18,
      depthWrite: false,
      fog: true,
      toneMapped: false
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'birds';
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);

    for (let i = 0; i < count; i += 1) {
      this.birds.push({
        angle: Math.random() * Math.PI * 2,
        radius: 110 + Math.random() * 90,
        height: 28 + Math.random() * 18,
        speed: (0.05 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1),
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  update(dt: number, playerPosition: THREE.Vector3, visible: boolean): void {
    this.points.visible = visible;
    if (!visible) return;

    const jump = this.center.distanceToSquared(playerPosition);
    if (jump > 400 * 400) this.center.copy(playerPosition);
    else this.center.lerp(playerPosition, Math.min(1, dt * 0.8));

    for (let i = 0; i < this.birds.length; i += 1) {
      const bird = this.birds[i];
      bird.angle += bird.speed * dt;
      const x = this.center.x + Math.cos(bird.angle) * bird.radius;
      const z = this.center.z + Math.sin(bird.angle) * bird.radius;
      const y = bird.height + Math.sin(bird.angle * 2.3 + bird.phase) * 1.4;
      const offset = i * 3;
      this.positions[offset] = x;
      this.positions[offset + 1] = y;
      this.positions[offset + 2] = z;
    }
    const attribute = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.needsUpdate = true;
  }
}
