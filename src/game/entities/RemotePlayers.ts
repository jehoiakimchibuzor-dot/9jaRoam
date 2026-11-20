import * as THREE from 'three';
import type { RemotePlayerState } from '../systems/MultiplayerService';

interface AvatarEntry {
  group: THREE.Group;
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTexture: THREE.CanvasTexture;
  labelText: string;
  target: THREE.Vector3;
  targetYaw: number;
}

const AVATAR_COLORS = [0xffd24a, 0x4ade80, 0x60a5fa, 0xf472b6, 0xc084fc, 0xfb923c];

function colorFor(avatar: string): number {
  let hash = 0;
  for (let i = 0; i < avatar.length; i++) hash = (hash * 31 + avatar.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function modeIcon(mode: string): string {
  if (mode === 'drive') return '🚗';
  if (mode === 'falling') return '🪂';
  if (mode === 'entering' || mode === 'exiting') return '🚶';
  return '';
}

function makeLabel(): { sprite: THREE.Sprite; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 0.8, 1);
  sprite.position.y = 2.45;
  sprite.renderOrder = 999;
  return { sprite, canvas, texture };
}

function drawLabel(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, name: string, sub: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(8, 12, 16, 0.82)';
  ctx.strokeStyle = 'rgba(255, 210, 74, 0.75)';
  ctx.lineWidth = 3;
  const x = 6;
  const y = 12;
  const w = canvas.width - 12;
  const h = canvas.height - 24;
  const r = 22;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f2efe9';
  ctx.font = '700 40px Arial, sans-serif';
  ctx.fillText(name.slice(0, 22), canvas.width / 2, 48);
  ctx.fillStyle = '#ffd24a';
  ctx.font = '600 24px Arial, sans-serif';
  ctx.fillText(sub.slice(0, 30), canvas.width / 2, 88);
  texture.needsUpdate = true;
}

export class RemotePlayers {
  private group = new THREE.Group();
  private entries = new Map<string, AvatarEntry>();

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  update(players: RemotePlayerState[], selfUid: string | null): void {
    const seen = new Set<string>();

    players.forEach((player) => {
      if (player.uid === selfUid) return;
      seen.add(player.uid);

      let entry = this.entries.get(player.uid);
      if (!entry) {
        entry = this.createEntry(player);
        this.entries.set(player.uid, entry);
      }

      entry.target.set(player.x, player.y, player.z);
      entry.targetYaw = player.yaw;

      const icon = modeIcon(player.mode);
      const labelText = `${player.username}\n${player.occupation}${icon ? ` · ${icon}` : ''}`;
      if (labelText !== entry.labelText) {
        entry.labelText = labelText;
        drawLabel(entry.labelCanvas, entry.labelTexture, player.username, `${player.occupation}${icon ? ` ${icon}` : ''}`);
      }
    });

    this.entries.forEach((entry, uid) => {
      if (!seen.has(uid)) {
        this.disposeEntry(entry);
        this.entries.delete(uid);
      }
    });
  }

  updateFrame(dt: number): void {
    const t = 1 - Math.exp(-12 * dt);
    this.entries.forEach((entry) => {
      entry.group.position.lerp(entry.target, t);
      let diff = entry.targetYaw - entry.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      entry.group.rotation.y += diff * t;
    });
  }

  private createEntry(player: RemotePlayerState): AvatarEntry {
    const group = new THREE.Group();
    group.position.set(player.x, player.y, player.z);
    group.rotation.y = player.yaw;

    const color = colorFor(player.avatar);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xc98d63, flatShading: true });
    const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x1d2530, flatShading: true });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.26), darkMaterial);
    legs.position.y = 0.34;
    group.add(legs);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.85, 8), bodyMaterial);
    body.position.y = 1.08;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skinMaterial);
    head.position.y = 1.72;
    group.add(head);

    const { sprite, canvas, texture } = makeLabel();
    group.add(sprite);
    this.group.add(group);

    const entry: AvatarEntry = {
      group,
      label: sprite,
      labelCanvas: canvas,
      labelTexture: texture,
      labelText: '',
      target: new THREE.Vector3(player.x, player.y, player.z),
      targetYaw: player.yaw
    };
    drawLabel(canvas, texture, player.username, player.occupation);
    return entry;
  }

  private disposeEntry(entry: AvatarEntry): void {
    this.group.remove(entry.group);
    entry.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }

  dispose(): void {
    this.entries.forEach((entry) => this.disposeEntry(entry));
    this.entries.clear();
    this.scene.remove(this.group);
  }
}
