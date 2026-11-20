import * as THREE from 'three';
import {
  HumanoidAnimator,
  type CharacterRig
} from '../entities/CharacterModel';
import {
  createPlayerCharacter
} from '../entities/Player';
import {
  appearanceFromProfile,
  copyPlayerAppearance,
  DEFAULT_PLAYER_APPEARANCE,
  type PlayerAppearance
} from '../entities/PlayerAppearance';

/**
 * Small turntable used only on the persona screen. It reuses the exact same
 * character builder as gameplay, so what you pick here is what you wear in Kano.
 * The renderer is stopped and disposed as soon as the player enters the game.
 */
export class CharacterPreview {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
  private rig: CharacterRig | null = null;
  private animator = new HumanoidAnimator(0);
  private frame = 0;
  private lastTime = 0;
  private running = false;
  private pending: PlayerAppearance | null = null;
  private resizeHandler = (): void => this.resize();

  constructor(private canvas: HTMLCanvasElement) {}

  start(): void {
    if (this.renderer) return;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
      });
    } catch (error) {
      console.warn('Live character preview unavailable.', error);
      this.renderer = null;
      return;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;

    this.camera.position.set(0, 1.12, 3.45);
    this.camera.lookAt(0, 0.94, 0);

    this.scene.add(
      new THREE.HemisphereLight(0xe9f3ff, 0x4b3b2f, 2.0)
    );
    const key = new THREE.DirectionalLight(0xfff0d0, 2.7);
    key.position.set(2.4, 3.6, 3.2);
    const rim = new THREE.DirectionalLight(0x8fb8ff, 1.15);
    rim.position.set(-3, 2.2, -2.4);
    this.scene.add(key, rim);

    window.addEventListener('resize', this.resizeHandler);
    this.resize();
    this.rebuild();
    this.running = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  setProfile(avatar: string, gender: 'male' | 'female', occupation: string): void {
    this.setAppearance(appearanceFromProfile(avatar, gender, occupation));
  }

  setAppearance(appearance: PlayerAppearance): void {
    this.pending = copyPlayerAppearance(appearance);
    if (this.renderer) this.rebuild();
  }

  stop(): void {
    if (!this.renderer) return;
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resizeHandler);
    this.disposeRig();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer = null;
  }

  private rebuild(): void {
    this.disposeRig();
    this.rig = createPlayerCharacter(this.pending ?? DEFAULT_PLAYER_APPEARANCE);
    this.rig.group.rotation.y = -0.42;
    this.scene.add(this.rig.group);
    this.animator.update(this.rig, 0, 0, 6.4);
  }

  private disposeRig(): void {
    if (!this.rig) return;
    this.scene.remove(this.rig.group);
    this.rig.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.rig = null;
  }

  private resize(): void {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || 240));
    const height = Math.max(1, Math.round(rect.height || 260));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private tick = (time: number): void => {
    if (!this.running || !this.renderer) return;
    const dt = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    if (this.rig) {
      this.rig.group.rotation.y += dt * 0.42;
      this.animator.update(this.rig, dt, 0, 6.4);
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
}
