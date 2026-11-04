import * as THREE from 'three';
import { Input } from './Input';
import { Player } from './entities/Player';
import {
  SHIRT_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  TROUSER_COLORS,
  isPlayerAppearance,
  type PlayerAppearance
} from './entities/PlayerAppearance';
import {
  createBike,
  createDanfo,
  createKeke,
  createSedan,
  createSportCar,
  ensureVehicleHealth as ensureRigHealth,
  VehicleRig,
  vehicleOverlap
} from './entities/Vehicle';
import { Pedestrians } from './entities/Pedestrians';
import { StreetPeople } from './entities/StreetPeople';
import { Traffic } from './entities/Traffic';
import { Planes } from './entities/Planes';
import { TrainService } from './entities/Train';
import {
  City,
  CitySite,
  Collider,
  constrainPlayerToFootbridge,
  constrainVehicleToBridge,
  createCity,
  CAUSEWAY_HALF_W,
  CAUSEWAY_X,
  CROSS_HALF,
  EAST_ROAD_X,
  HIGH_BRIDGE_CROSSINGS,
  HIGH_BRIDGE_EAST_END_X,
  HIGH_BRIDGE_WEST_END_X,
  ROAD_HALF,
  roadHalfFor,
  RailStation,
  ServiceSpot,
  TransitStop,
  WEST_DISTRICT_MAX_X,
  WEST_DISTRICT_MIN_X,
  WEST_SHORE_X,
  fuelPumpApproach
} from './world/City';
import { InteriorInstance, InteriorPointDef, Interiors } from './world/Interiors';
import { ThugSpawn, Thugs } from './npcs/Thugs';
import { Police, PoliceContext } from './npcs/Police';
import { WEAPONS, WeaponInventory } from './combat/Weapons';
import type { WeaponInventorySnapshot, WeaponId } from './combat/Weapons';
import {
  MissionDef,
  MissionProgressSnapshot,
  MissionTransitMode,
  Missions
} from './missions/Missions';
import { CombatCallbacks, CombatHit } from './systems/CombatTypes';
import { createHealth, damageHealth, healHealth, Health, restoreHealth } from './systems/Health';
import { clamp, pushOutColliders, rayWallDistance } from './systems/Physics';
import { GameAudio } from './systems/GameAudio';
import { IS_ANDROID } from './platform';

type Mode = 'foot' | 'drive' | 'entering' | 'exiting';

export interface GameHud {
  speed: HTMLElement | null;
  hint: HTMLElement | null;
  diag: HTMLElement | null;
  minimap: HTMLCanvasElement | null;
}

interface Tracer {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

interface Impact {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface DialogueOption {
  label: string;
  action: () => void;
}

interface FootInteraction {
  kind: 'vehicle' | 'site' | 'giver' | 'person' | 'armour' | 'service' | 'warden' | 'fuel' | 'transit' | 'rail';
  label: string;
  vehicle?: VehicleRig;
  site?: CitySite;
  mission?: MissionDef;
  person?: { name: string; line: string };
  armour?: ArmourPickup;
  service?: ServiceSpot;
  transitStop?: TransitStop;
  railStation?: RailStation;
}

interface ArmourPickup {
  group: THREE.Group;
  x: number;
  z: number;
  taken: boolean;
  spin: number;
}

interface Explosion {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  radius: number;
}

interface SiteSequence {
  site: CitySite;
  entering: boolean;
  t: number;
  swapped: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

interface TransitSequence {
  timer: number;
  destination: THREE.Vector3;
  mode: MissionTransitMode;
  destinationId: string;
  swapped: boolean;
  arrivalLabel: string;
}

interface HudElements {
  healthFill: HTMLElement | null;
  healthText: HTMLElement | null;
  armourFill: HTMLElement | null;
  armourText: HTMLElement | null;
  carRow: HTMLElement | null;
  carFill: HTMLElement | null;
  carText: HTMLElement | null;
  fuelRow: HTMLElement | null;
  fuelFill: HTMLElement | null;
  fuelText: HTMLElement | null;
  money: HTMLElement | null;
  bankBalance: HTMLElement | null;
  wanted: HTMLElement | null;
  weapon: HTMLElement | null;
  ammo: HTMLElement | null;
  objectiveTitle: HTMLElement | null;
  objectiveBody: HTMLElement | null;
  prompt: HTMLElement | null;
  zone: HTMLElement | null;
  locationSub: HTMLElement | null;
  toast: HTMLElement | null;
  flash: HTMLElement | null;
  signal: HTMLElement | null;
  signalState: HTMLElement | null;
  signalCount: HTMLElement | null;
  fade: HTMLElement | null;
  dialog: HTMLElement | null;
  dialogTitle: HTMLElement | null;
  dialogBody: HTMLElement | null;
  dialogActions: HTMLElement | null;
  death: HTMLElement | null;
  deathText: HTMLElement | null;
  deathButton: HTMLElement | null;
}

interface ProgressSaveData {
  version: 1;
  money: number;
  loanBalance: number;
  missions: MissionProgressSnapshot;
  lootedIds: string[];
  vehicleFuel: Record<string, number>;
  weapons?: WeaponInventorySnapshot;
  appearance?: PlayerAppearance;
}

const CAR_ACCEL = 8.5;
const CAR_BRAKE = 12;
const CAR_MAX = 22;
const CAR_MAX_REVERSE = -7;
const SPAWN = new THREE.Vector3(-5.0, 0, 22.0);
const PLAYER_MAX_HP = 100;
const INTERIOR_GROUND = 0.02;
const INTERIOR_CEILING = 3.8;
const RESPAWN_DELAY = 4.5;
const DEATH_FEE = 75;
const LAPO_LOAN_AMOUNT = 500;
const LAPO_REPAYMENT_AMOUNT = 600;
const FUEL_PRICE_PER_UNIT = 4;
const FUEL_USE_PER_METER = 0.0045;
const DANFO_FARE = 100;
const BANK_BALANCE_KEY = '9ja-roam.bank-balance';
const PROGRESS_SAVE_KEY = '9ja-roam.progress.v1';
const STARTING_BANK_BALANCE = 2000;
const TRAIN_FARE = 250;

const THUG_SPAWNS: ThugSpawn[] = [
  { x: -13.5, z: -40, groupId: 'market', count: 3, armed: true, radius: 6 },
  { x: 64, z: 60, groupId: 'ikeja', count: 2, armed: false, radius: 5 },
  { x: -64, z: -84, groupId: 'yaba', count: 3, armed: true, radius: 6 },
  { x: 64, z: 128, groupId: 'vi', count: 2, armed: true, radius: 5 },
  { x: -13.5, z: 150, groupId: 'ojota', count: 2, armed: false, radius: 4 },
  { x: -64, z: 150, groupId: 'agege', count: 2, armed: false, radius: 4 }
];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private city: City;
  private player = new Player();
  private drivableVehicles: VehicleRig[] = [];
  private activeVehicle: VehicleRig | null = null;
  private traffic: Traffic;
  private trains: TrainService;
  private pedestrians: Pedestrians;
  private streetPeople: StreetPeople;
  private planes: Planes;
  private thugs: Thugs;
  private police: Police;
  private interiors: Interiors;
  private missions = new Missions();
  private weapons = new WeaponInventory();
  private audio = new GameAudio();
  private input: Input;

  private mode: Mode = 'foot';
  private inside = false;
  private activeInterior: InteriorInstance | null = null;
  private health: Health = createHealth(PLAYER_MAX_HP);
  private armour = 0;
  private armourPickups: ArmourPickup[] = [];
  private explosions: Explosion[] = [];
  private money = 150;
  private bankBalance = STARTING_BANK_BALANCE;
  private loanBalance = 0;
  private bankStorageAvailable = true;
  private progressStorageAvailable = true;
  private progressAutosaveTimer = 0;
  private fuelWarned = false;
  private wanted = 0;
  private wantedDelay = 0;
  private dead = false;
  private respawnTimer = 0;
  private dialogueOpen = false;
  private entryCooldown = 0;
  private autoEntryLock = false;
  private siteSeq: SiteSequence | null = null;
  private transitSeq: TransitSequence | null = null;
  private sinceDamage = 99;
  private damageFlash = 0;
  private camShake = 0;
  private crashCooldown = 0;
  private wasSeen = false;
  private escapeNotified = false;
  private looted = new Set<string>();
  private currentInteraction: FootInteraction | null = null;
  private currentInteriorPoint: InteriorPointDef | null = null;
  private toastTimer = 0;

  private camYaw = 0;
  private camPitch = 0.28;
  private camDist = 5.4;
  private camPos = new THREE.Vector3(0, 2.6, 8);
  private camDir = new THREE.Vector3();
  private sunDirection = new THREE.Vector3();
  private moonDirection = new THREE.Vector3();
  private cameraColliders: Collider[] = [];
  private snapCameraNext = false;
  private camTarget = new THREE.Vector3();

  private carSpeed = 0;
  private carYaw = Math.PI;
  private elapsed = 0;
  private fps = 60;
  private lastTime = 0;
  private running = false;
  private hintTimer = 8;

  private seqTimer = 0;
  private seqPath: THREE.Vector3[] = [];
  private seqWalkDistance = 0;
  private seqDoor = new THREE.Vector3();
  private seqSeat = new THREE.Vector3();
  private exitTarget = new THREE.Vector3();
  private reloadWasActive = false;
  private tracers: Tracer[] = [];
  private impacts: Impact[] = [];
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private worldMapCtx: CanvasRenderingContext2D | null = null;
  private worldMapElement: HTMLElement | null = null;
  private worldMapOpen = false;
  private worldMapZoom = 1;
  private worldMapPanX = 0;
  private worldMapPanY = 0;
  private mapPointers = new Map<number, { x: number; y: number }>();
  private mapDragStart: { pointerId: number; x: number; y: number; panX: number; panY: number } | null = null;
  private mapDragGesture = false;
  private mapPinchDistance = 0;
  private mapPinchGesture = false;
  private pinnedWaypoint: THREE.Vector3 | null = null;
  private dprCap = IS_ANDROID ? 1.5 : 2;
  private perfTimer = 0;
  private swimming = false;
  private waterWarned = false;
  private hemisphereLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private moonLight!: THREE.DirectionalLight;
  private sunOrb!: THREE.Mesh;
  private moonOrb!: THREE.Mesh;
  private lightingMinute = -1;

  private giverMarker: THREE.Group;
  private objectiveMarker: THREE.Group;
  private markerTime = 0;

  private hudSpeed: HTMLElement | null;
  private hudHint: HTMLElement | null;
  private hudDiag: HTMLElement | null;
  private ui: HudElements;

  constructor(canvas: HTMLCanvasElement, hud: GameHud) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = !IS_ANDROID;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 480);
    this.camPos.set(-5.0, 3.65, 27.2);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(-5.0, 1.6, 22);
    this.scene.add(this.camera);

    this.scene.background = new THREE.Color(0xa9cae8);
    this.scene.fog = new THREE.Fog(0xc4d9ea, 85, 340);

    this.hemisphereLight = new THREE.HemisphereLight(0xd9ecff, 0x7a6a52, 1.3);
    this.sunLight = new THREE.DirectionalLight(0xfff4dc, 2.7);
    this.sunLight.castShadow = !IS_ANDROID;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.left = -45;
    this.sunLight.shadow.camera.right = 45;
    this.sunLight.shadow.camera.top = 45;
    this.sunLight.shadow.camera.bottom = -45;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 190;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.03;
    this.moonLight = new THREE.DirectionalLight(0x9db8ec, 0.22);
    this.sunOrb = new THREE.Mesh(
      new THREE.SphereGeometry(10, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffe6a3,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      })
    );
    this.moonOrb = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xe6ecff,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      })
    );
    this.sunOrb.frustumCulled = false;
    this.moonOrb.frustumCulled = false;
    this.sunOrb.renderOrder = 1;
    this.moonOrb.renderOrder = 1;
    this.scene.add(
      this.hemisphereLight,
      this.sunLight,
      this.sunLight.target,
      this.moonLight,
      this.moonLight.target,
    );
    this.camera.add(this.sunOrb, this.moonOrb);
    this.updateTimeOfDay();

    this.city = createCity();
    this.scene.add(this.city.group);
    this.cameraColliders = this.city.colliders.filter(
      (c) => Math.max(c.maxX - c.minX, c.maxZ - c.minZ) >= 3.2
    );
    for (const site of this.city.sites) {
      this.cameraColliders.push({
        minX: site.x - site.width / 2,
        maxX: site.x + site.width / 2,
        minZ: site.z - site.depth / 2,
        maxZ: site.z + site.depth / 2
      });
    }

    this.player.group.position.copy(SPAWN);
    this.player.faceYaw(Math.PI);
    this.scene.add(this.player.group);
    this.player.setWeapon('pistol');

    const danfo = createDanfo();
    const keke = createKeke();
    const sedan = createSedan(0xb9b4a7);
    const bike = createBike(0xd43a2a);
    const sport = createSportCar(0xffb31a);
    const sport2 = createSportCar(0x2f6fd0);
    this.drivableVehicles.push(sedan, keke, bike, danfo, sport, sport2);
    for (const [index, vehicle] of this.drivableVehicles.entries()) {
      const parkingSpace = this.city.parkingSpaces[index];
      if (!parkingSpace) throw new Error(`Missing starter parking space for vehicle ${index}`);
      vehicle.group.position.set(
        parkingSpace.x,
        parkingSpace.surfaceY,
        parkingSpace.z
      );
      vehicle.group.rotation.y = parkingSpace.yaw;
      ensureRigHealth(vehicle);
      vehicle.maxFuel = 100;
      vehicle.fuel = 100;
      vehicle.group.userData.saveId = `starter-vehicle-${index}`;
      // Parked cars are occupied: an empty row of cars made the street look dead.
      if (vehicle.driver) vehicle.driver.visible = true;
      this.scene.add(vehicle.group);
    }

    this.interiors = new Interiors(this.scene, this.city);
    this.trains = new TrainService(this.scene, this.city);
    this.traffic = new Traffic(this.scene, this.city, IS_ANDROID ? 26 : undefined);
    this.traffic.onCrash = (position, speed) => this.onTrafficCrash(position, speed);
    this.traffic.onWreck = (position, yaw) => {
      this.pedestrians.ejectDriver(position, yaw);
      for (let i = 0; i < 2; i += 1) {
        this.spawnImpact(
          new THREE.Vector3(
            position.x + (Math.random() - 0.5) * 1.4,
            1.0 + Math.random() * 0.5,
            position.z + (Math.random() - 0.5) * 1.4
          ),
          i === 0 ? 0xfff2c0 : 0xffa040
        );
      }
      const distance = position.distanceTo(
        this.mode === 'drive' && this.activeVehicle
          ? this.activeVehicle.group.position
          : this.player.group.position
      );
      if (distance < 45) this.showToast('VEHICLE WRECKED \u00b7 DRIVER BAILED OUT');
    };
    this.pedestrians = new Pedestrians(this.scene, this.city, IS_ANDROID ? 48 : 90);
    this.streetPeople = new StreetPeople(this.scene, this.city);
    this.planes = new Planes(this.scene);
    const callbacks = this.makeCombatCallbacks();
    this.interiors.setKilledCallback((position) => callbacks.onCivilianKilled(position));
    this.pedestrians.setKilledCallback((position) => callbacks.onCivilianKilled(position));
    this.thugs = new Thugs(this.scene, this.city, THUG_SPAWNS, callbacks);
    this.police = new Police(this.scene, this.city, callbacks);

    this.input = new Input(document.getElementById('controls') as HTMLElement, canvas);

    this.hudSpeed = hud.speed;
    this.hudHint = hud.hint;
    this.hudDiag = hud.diag;
    if (hud.minimap) this.minimapCtx = hud.minimap.getContext('2d');

    const byId = (id: string): HTMLElement | null => document.getElementById(id);
    this.worldMapElement = byId('world-map');
    const worldMapCanvas = document.getElementById('world-map-canvas') as HTMLCanvasElement | null;
    if (worldMapCanvas) this.worldMapCtx = worldMapCanvas.getContext('2d');
    hud.minimap?.addEventListener('click', () => this.setWorldMapOpen(true));
    this.worldMapElement?.addEventListener('click', (event) => {
      if (event.target === this.worldMapElement) this.setWorldMapOpen(false);
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.worldMapOpen) this.setWorldMapOpen(false);
    });
    byId('map-close')?.addEventListener('click', () => this.setWorldMapOpen(false));
    byId('map-clear')?.addEventListener('click', () => {
      this.pinnedWaypoint = null;
      this.updateMapDestinationLabel();
      this.drawMinimap();
      this.drawWorldMap();
    });
    worldMapCanvas?.addEventListener('pointerdown', (event: PointerEvent) => {
      if (this.mapPointers.size === 0) {
        this.mapPinchGesture = false;
        this.mapDragGesture = false;
        this.mapDragStart = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          panX: this.worldMapPanX,
          panY: this.worldMapPanY
        };
      }
      this.mapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      worldMapCanvas.setPointerCapture(event.pointerId);
      if (this.mapPointers.size >= 2) {
        this.mapPinchGesture = true;
        this.mapDragStart = null;
        const [first, second] = [...this.mapPointers.values()];
        this.mapPinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
      }
      event.preventDefault();
    });
    worldMapCanvas?.addEventListener('pointermove', (event: PointerEvent) => {
      if (!this.mapPointers.has(event.pointerId)) return;
      this.mapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.mapPinchGesture && this.mapPointers.size >= 2) {
        const [first, second] = [...this.mapPointers.values()];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        if (this.mapPinchDistance > 0 && distance > 0) {
          this.worldMapZoom = clamp(this.worldMapZoom * (distance / this.mapPinchDistance), 1, 4);
          this.constrainWorldMapPan(worldMapCanvas.width, worldMapCanvas.height);
          this.drawWorldMap();
        }
        this.mapPinchDistance = distance;
        event.preventDefault();
      } else if (this.worldMapZoom > 1 && this.mapDragStart?.pointerId === event.pointerId) {
        const bounds = worldMapCanvas.getBoundingClientRect();
        const dx = (event.clientX - this.mapDragStart.x) * (worldMapCanvas.width / bounds.width);
        const dy = (event.clientY - this.mapDragStart.y) * (worldMapCanvas.height / bounds.height);
        if (Math.hypot(dx, dy) > 5) this.mapDragGesture = true;
        if (this.mapDragGesture) {
          this.worldMapPanX = this.mapDragStart.panX + dx;
          this.worldMapPanY = this.mapDragStart.panY + dy;
          this.constrainWorldMapPan(worldMapCanvas.width, worldMapCanvas.height);
          this.drawWorldMap();
          event.preventDefault();
        }
      }
    });
    worldMapCanvas?.addEventListener('pointerup', (event: PointerEvent) => {
      if (!this.mapPinchGesture && !this.mapDragGesture && this.worldMapCtx) {
        const bounds = worldMapCanvas.getBoundingClientRect();
        const borderX = (bounds.width - worldMapCanvas.clientWidth) / 2;
        const borderY = (bounds.height - worldMapCanvas.clientHeight) / 2;
        const clientX = clamp(event.clientX - bounds.left - borderX, 0, worldMapCanvas.clientWidth);
        const clientY = clamp(event.clientY - bounds.top - borderY, 0, worldMapCanvas.clientHeight);
        const px = (clientX / worldMapCanvas.clientWidth) * worldMapCanvas.width;
        const py = (clientY / worldMapCanvas.clientHeight) * worldMapCanvas.height;
        this.pinnedWaypoint = this.mapToWorld(px, py, worldMapCanvas.width, worldMapCanvas.height);
        this.updateMapDestinationLabel();
        this.drawMinimap();
      }
      this.mapPointers.delete(event.pointerId);
      if (this.mapPointers.size === 0) {
        this.mapPinchGesture = false;
        this.mapDragGesture = false;
        this.mapDragStart = null;
        this.mapPinchDistance = 0;
      }
      this.drawWorldMap();
    });
    worldMapCanvas?.addEventListener('pointercancel', (event: PointerEvent) => {
      this.mapPointers.delete(event.pointerId);
      if (this.mapPointers.size === 0) {
        this.mapPinchGesture = false;
        this.mapDragGesture = false;
        this.mapDragStart = null;
        this.mapPinchDistance = 0;
      }
    });
    worldMapCanvas?.addEventListener('wheel', (event: WheelEvent) => {
      this.worldMapZoom = clamp(this.worldMapZoom * Math.exp(-event.deltaY * 0.001), 1, 4);
      this.constrainWorldMapPan(worldMapCanvas.width, worldMapCanvas.height);
      this.drawWorldMap();
      event.preventDefault();
    }, { passive: false });
    this.updateMapDestinationLabel();
    this.ui = {
      healthFill: byId('health-fill'),
      healthText: byId('health-text'),
      armourFill: byId('armour-fill'),
      armourText: byId('armour-text'),
      carRow: byId('car-health-row'),
      carFill: byId('car-health-fill'),
      carText: byId('car-health-text'),
      fuelRow: byId('car-fuel-row'),
      fuelFill: byId('car-fuel-fill'),
      fuelText: byId('car-fuel-text'),
      money: byId('money'),
      bankBalance: byId('bank-balance'),
      wanted: byId('wanted'),
      weapon: byId('weapon-name'),
      ammo: byId('weapon-ammo'),
      objectiveTitle: byId('objective-title'),
      objectiveBody: byId('objective-body'),
      prompt: byId('prompt'),
      zone: byId('zone'),
      locationSub: byId('location-sub'),
      toast: byId('toast'),
      flash: byId('damage-flash'),
      signal: byId('signal'),
      signalState: byId('signal-state'),
      signalCount: byId('signal-count'),
      fade: byId('scene-fade'),
      dialog: byId('dialog'),
      dialogTitle: byId('dialog-title'),
      dialogBody: byId('dialog-body'),
      dialogActions: byId('dialog-actions'),
      death: byId('death'),
      deathText: byId('death-text'),
      deathButton: byId('death-button')
    };

    this.loadBankBalance();
    this.loadProgress();
    this.ui.deathButton?.addEventListener('click', () => this.respawn());
    this.ui.dialog?.addEventListener('click', (event) => {
      if (event.target === this.ui.dialog) this.closeDialogue();
    });
    byId('dialog-close')?.addEventListener('click', () => this.closeDialogue());

    this.giverMarker = this.createBeacon(0x5ad45a);
    this.objectiveMarker = this.createBeacon(0xffd24a);

    for (const kind of ['police', 'fuel', 'garage'] as const) {
      const site = this.city.sites.find((s) => s.kind === kind);
      if (site) this.armourPickups.push(this.createArmourPickup(site));
    }

    const unlock = (): void => this.audio.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('resize', () => this.onResize());

    this.setHint('Move stick \u00b7 B enter/use \u00b7 A fire \u00b7 E gun \u00b7 F next gun \u00b7 R reload');
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private makeCombatCallbacks(): CombatCallbacks {
    return {
      damagePlayer: (amount) => this.damagePlayer(amount),
      damageVehicle: (amount) => this.damageVehicle(amount),
      addWanted: (amount) => this.addWanted(amount),
      onCivilianKilled: () => {
        this.addWanted(2);
        this.showToast('CIVILIAN DOWN \u00b7 POLICE ALERTED');
        this.setHint('A civilian is down. Police response is coming.');
      },
      onThugKilled: (event) => {
        this.missions.notifyKill(event.groupId);
        this.money += 30;
        this.saveProgress();
        this.showToast('THUG DOWN \u00b7 +\u20a630');
        this.audio.hit();
      },
      onPoliceKilled: () => {
        this.addWanted(3);
        this.showToast('OFFICER DOWN \u00b7 WANTED LEVEL UP');
      },
      spawnTracer: (from, to, color) => this.spawnTracer(from, to, color),
      spawnImpact: (at, color) => this.spawnImpact(at, color)
    };
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  private loop(now: number): void {
    if (!this.running) return;
    const rawDt = Math.max(0, (now - this.lastTime) / 1000);
    const dt = Math.min(0.05, rawDt);
    this.lastTime = now;
    this.fps += (1 / Math.max(rawDt, 0.001) - this.fps) * 0.06;
    this.expandShadow();
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.adaptResolution(rawDt);
    requestAnimationFrame((t) => this.loop(t));
  }

  private adaptResolution(dt: number): void {
    this.perfTimer += dt;
    if (this.perfTimer < 3) return;
    this.perfTimer = 0;
    const dpr = this.renderer.getPixelRatio();
    const minDpr = 1;
    const maxDpr = Math.min(window.devicePixelRatio || 1, IS_ANDROID ? 1.5 : 2);
    const lowFps = IS_ANDROID ? 42 : 28;
    const highFps = IS_ANDROID ? 56 : 54;
    if (this.fps < lowFps && dpr > minDpr + 0.01) {
      this.dprCap = Math.max(minDpr, dpr - 0.15);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    } else if (this.fps > highFps && dpr < maxDpr - 0.01) {
      this.dprCap = Math.min(maxDpr, dpr + 0.15);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }

  private expandShadow(): void {
    const date = new Date();
    const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const solarAngle = ((hour - 6) / 12) * Math.PI;
    this.sunDirection.set(
      Math.cos(solarAngle) * 0.5,
      Math.sin(solarAngle) * 0.5,
      -0.72
    ).normalize();
    const lunarAngle = solarAngle + Math.PI;
    this.moonDirection.set(
      Math.cos(lunarAngle) * 0.5,
      Math.sin(lunarAngle) * 0.5,
      -0.72
    ).normalize();

    this.sunLight.position.copy(this.camTarget).addScaledVector(this.sunDirection, 60);
    this.sunLight.target.position.copy(this.camTarget);
    this.moonLight.position.copy(this.camTarget).addScaledVector(this.moonDirection, 60);
    this.moonLight.target.position.copy(this.camTarget);
    const sunElevation = Math.max(0, Math.sin(solarAngle));
    const moonElevation = Math.max(0, Math.sin(lunarAngle));
    this.sunOrb.position.set(-Math.cos(solarAngle) * 46, 20 + sunElevation * 35, -180);
    this.moonOrb.position.set(-Math.cos(lunarAngle) * 46, 20 + moonElevation * 35, -180);
    this.sunOrb.visible = this.sunDirection.y > 0.015;
    this.moonOrb.visible = this.moonDirection.y > 0.015;
  }

  private updateTimeOfDay(): void {
    const date = new Date();
    const minute = date.getHours() * 60 + date.getMinutes();
    if (minute === this.lightingMinute) return;
    this.lightingMinute = minute;
    const hour = minute / 60;
    const smoothstep = (edge0: number, edge1: number, value: number): number => {
      const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const daylight =
      smoothstep(5.5, 7, hour) * (1 - smoothstep(17.5, 19, hour));
    const twilight = Math.max(
      1 - Math.abs(hour - 6.2) / 1.7,
      1 - Math.abs(hour - 17.8) / 1.7
    );
    const daySky = new THREE.Color(0xa9cae8);
    const nightSky = new THREE.Color(0x142238);
    const dawnSky = new THREE.Color(0xf19a69);
    const sky = nightSky.lerp(daySky, daylight).lerp(dawnSky, clamp(twilight, 0, 1) * 0.72);
    const dayFog = new THREE.Color(0xc4d9ea);
    const nightFog = new THREE.Color(0x25364b);
    const fog = nightFog.lerp(dayFog, daylight).lerp(dawnSky, clamp(twilight, 0, 1) * 0.36);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(fog);
    this.hemisphereLight.intensity = 0.78 + daylight * 0.52;
    this.hemisphereLight.color.set(0xd9ecff).lerp(new THREE.Color(0x8fa6d0), 1 - daylight);
    this.hemisphereLight.groundColor.set(0x7a6a52).lerp(new THREE.Color(0x172338), 1 - daylight);
    this.sunLight.intensity = 0.04 + daylight * 2.66;
    this.sunLight.color.set(0xfff4dc).lerp(new THREE.Color(0xffa45c), clamp(twilight, 0, 1));
    this.moonLight.intensity = 0.7 + (1 - daylight) * 0.45;
    this.renderer.toneMappingExposure = 0.92 + daylight * 0.24;
  }

  private update(dt: number): void {
    this.updateTimeOfDay();
    this.elapsed += dt;
    this.progressAutosaveTimer += dt;
    if (this.progressAutosaveTimer >= 5) {
      this.saveProgress();
      this.progressAutosaveTimer = 0;
    }
    if (this.worldMapOpen) {
      this.input.reset();
      this.drawWorldMap();
      this.drawMinimap();
      return;
    }
    this.entryCooldown = Math.max(0, this.entryCooldown - dt);
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    this.camShake = Math.max(0, this.camShake - dt * 1.7);
    this.sinceDamage += dt;
    this.weapons.update(dt);
    this.updateMarkers(dt);
    this.updateExplosions(dt);
    this.updateVehicleFires(dt);
    for (const pickup of this.armourPickups) {
      if (!pickup.taken) pickup.group.rotation.y += dt * 1.3;
    }
    this.interiors.update(dt);

    if (this.reloadWasActive && !this.weapons.reloading) this.setHint('Reloaded');
    this.reloadWasActive = this.weapons.reloading;

    if (this.dead) {
      this.currentInteraction = null;
      this.currentInteriorPoint = null;
      this.updateDeath(dt);
      this.audio.siren(false);
      this.updateCamera(dt);
      this.updateHud(dt);
      this.drawMinimap();
      return;
    }

    if (this.dialogueOpen) {
      this.currentInteraction = null;
      this.currentInteriorPoint = null;
      this.input.reset();
      this.audio.siren(false);
      this.updateCamera(dt);
      this.updateHud(dt);
      this.drawMinimap();
      return;
    }

    if (this.siteSeq) {
      this.currentInteraction = null;
      this.currentInteriorPoint = null;
      this.updateSiteSequence(dt);
      this.updateCamera(dt);
      this.updateHud(dt);
      this.drawMinimap();
      this.updateButtonLabels();
      return;
    }

    if (this.transitSeq) {
      this.updateTransitSequence(dt);
      this.updateCamera(dt);
      this.updateHud(dt);
      this.drawMinimap();
      this.updateButtonLabels();
      return;
    }

    const look = this.input.consumeLook();
    const zoom = this.input.consumeZoom();
    // Drag the world around with your thumb: swipe right to look right, and
    // swipe down to lift the camera and look down (was inverted).
    this.camYaw -= look.x * 0.0045;
    this.camPitch = clamp(this.camPitch - look.y * 0.0035, -0.12, 0.95);
    this.camDist = clamp(this.camDist + zoom, 2.2, 14);

    const a = this.input.consumeA();
    const b = this.input.consumeB();
    const c = this.input.consumeC();
    const d = this.input.consumeD();
    const e = this.input.consumeE();
    const f = this.input.consumeF();
    const r = this.input.consumeR();

    if (this.mode === 'entering' || this.mode === 'exiting') {
      this.currentInteraction = null;
      this.currentInteriorPoint = null;
      this.updateSequence(dt);
    } else if (this.inside) {
      this.updateInside(dt, a, b, c, d, e, f, r);
    } else if (this.mode === 'foot') {
      this.updateFoot(dt, a, b, c, d, e, f, r);
    } else {
      this.currentInteraction = null;
      this.currentInteriorPoint = null;
      this.updateDrive(dt, a, b, e, f, r);
    }

    if (!this.inside && !this.siteSeq) this.updateGarageEntrance();

    if (!this.inside) {
      const playerPosition = this.player.group.position;
      const activeVehicle = this.mode === 'drive' ? this.activeVehicle : null;
      const vehiclePosition = activeVehicle?.group.position ?? null;
      this.traffic.update(
        dt,
        playerPosition,
        activeVehicle,
        activeVehicle ? this.carSpeed : 0,
        this.carYaw,
        this.drivableVehicles.filter((vehicle) => vehicle !== this.activeVehicle)
      );
      this.pedestrians.update(dt, this.city, playerPosition, vehiclePosition);
      this.streetPeople.update(dt);
      this.thugs.update(
        dt,
        playerPosition,
        !this.dead,
        this.mode === 'drive'
      );

      const policeContext: PoliceContext = {
        playerPosition,
        playerAlive: !this.dead,
        playerDriving: this.mode === 'drive',
        playerVehiclePosition: vehiclePosition,
        wanted: this.wanted
      };
      this.police.update(dt, policeContext);

      if (this.mode === 'foot') {
        this.resolveTrafficFoot();
        this.applyPlayerHeight(dt);
      } else if (this.mode === 'drive') {
        this.resolveTrafficCar();
      }

      const missionResult = this.missions.update({
        position: playerPosition,
        driving: this.mode === 'drive',
        wanted: this.wanted,
        dt
      });
      if (missionResult.completed) this.completeMission(missionResult.completed);
      this.updateWanted(dt);

      if (!this.dead && this.health.hp < this.health.maxHp && this.sinceDamage > 8) {
        this.health.hp = Math.min(this.health.maxHp, this.health.hp + 3.5 * dt);
      }

      this.audio.siren(this.wanted >= 2 || (this.wanted >= 1 && this.police.isSeen));
    } else {
      this.audio.siren(false);
      // While the player is hidden inside, police work the building entrance.
      // They cannot see or shoot through walls, so a long hideout lets the
      // trail go cold and the search breaks off.
      const site = this.activeInterior?.site;
      if (site) {
        this.police.update(dt, {
          playerPosition: this.policeRespondPoint(),
          playerAlive: false,
          playerDriving: false,
          playerVehiclePosition: null,
          wanted: this.wanted
        });
        this.updateWanted(dt);
      }
    }

    this.updateTracers(dt);
    this.updateImpacts(dt);
    this.planes.update(dt);
    this.city.update(dt);
    this.trains.update(dt);
    this.updateCamera(dt);
    this.updateHud(dt);
    this.drawMinimap();
    this.updateButtonLabels();
  }

  private updateFoot(dt: number, a: boolean, b: boolean, c: boolean, d: boolean, e: boolean, f: boolean, r: boolean): void {
    const state = this.input.state;
    const mag = Math.min(1, Math.hypot(state.moveX, state.moveY));
    const axis = roadAxisForYaw(this.player.yaw);
    const swim = this.swimming || this.city.waterAt(
      this.player.group.position.x,
      this.player.group.position.z,
      axis,
      this.player.group.position.y
    ) !== null;
    const sprint = !swim && !this.player.crouched && (state.sprintHeld || mag > 0.92);
    this.player.update(
      dt,
      { x: state.moveX * (swim ? 0.55 : 1), y: state.moveY * (swim ? 0.55 : 1), sprint },
      this.camYaw
    );
    this.resolveFootCollisions();
    this.pedestrians.pushOut(this.player.group.position, this.player.crouched ? 0.28 : 0.34);
    this.applyPlayerHeight(dt);

    if (d && !swim) {
      if (this.player.onGround) {
        this.player.toggleCrouch();
        this.setHint(this.player.crouched ? 'Crouched \u2014 D to stand' : 'Standing');
      } else {
        this.setHint('Land before crouching');
      }
    }

    if (c && !swim && this.player.jump()) this.setHint('Jump');

    if (e) {
      this.player.toggleArmed();
      if (this.player.armed) this.player.setWeapon(this.weapons.current);
      this.audio.ui();
      this.setHint(this.player.armed ? `${this.weapons.spec.name} ready` : 'Weapon holstered \u2014 fists');
    }

    if (f) {
      if (!this.player.armed) {
        this.player.setArmed(true);
        this.setHint('Weapon drawn');
      }
      const id = this.weapons.switchNext();
      this.player.setWeapon(id);
      this.audio.ui();
      this.setHint(`Equipped ${this.weapons.spec.name}`);
    }

    if (r) {
      if (!this.player.armed) {
        this.player.setArmed(true);
        this.player.setWeapon(this.weapons.current);
      }
      if (this.weapons.startReload()) {
        this.audio.ui();
        this.setHint('Reloading\u2026');
      } else {
        this.setHint(this.weapons.isMelee ? 'No reload needed' : 'Cannot reload now');
      }
    }

    const armed = this.player.armed;
    const aiming = armed && (a || state.aHeld);
    this.player.setAiming(aiming);
    if (aiming) this.faceAimDirection();

    if (a) {
      if (!armed) {
        this.player.punch();
        this.faceAimDirection();
      } else if (this.weapons.isMelee) {
        if (this.player.meleeSwing()) this.audio.shot('melee');
      } else {
        this.fireWeapon(false);
      }
    } else if (armed && state.aHeld && this.weapons.spec.auto) {
      this.fireWeapon(false);
    }

    if (this.player.consumePunchImpact()) this.resolveMeleeImpact();

    this.currentInteraction = this.findInteraction();
    if (b) this.useInteraction();

    if (!this.inside && this.mode === 'foot') {
      if (this.autoEntryLock) {
        const position = this.player.group.position;
        const stillNear = this.city.sites.some(
          (site) => Math.hypot(position.x - site.entranceX, position.z - site.entranceZ) < 2.2
        );
        if (!stillNear) this.autoEntryLock = false;
      }
      const interaction = this.currentInteraction;
      if (interaction) {
        const position = this.player.group.position;
        if (interaction.kind === 'site' && interaction.site && !this.autoEntryLock) {
          const distance = Math.hypot(
            position.x - interaction.site.entranceX,
            position.z - interaction.site.entranceZ
          );
          if (distance < 1.5) this.beginSiteEnter(interaction.site);
        } else if (interaction.kind === 'giver' && interaction.mission) {
          const distance = Math.hypot(
            position.x - interaction.mission.giverX,
            position.z - interaction.mission.giverZ
          );
          if (distance < 1.4) this.startMission(interaction.mission);
        }
      }
    }
  }

  private updateInside(dt: number, a: boolean, b: boolean, c: boolean, d: boolean, e: boolean, f: boolean, r: boolean): void {
    const state = this.input.state;
    const mag = Math.min(1, Math.hypot(state.moveX, state.moveY));
    const sprint = !this.player.crouched && (state.sprintHeld || mag > 0.92);
    this.player.update(dt, { x: state.moveX, y: state.moveY, sprint }, this.camYaw);
    const colliders = this.interiors.activeColliders;
    pushOutColliders(colliders, this.player.group.position, this.player.crouched ? 0.28 : 0.34);
    this.interiors.pushOutActors(this.player.group.position, this.player.crouched ? 0.28 : 0.34);
    this.player.group.position.y = INTERIOR_GROUND + this.player.jumpOffset;

    if (d) this.player.toggleCrouch();
    if (c) this.player.jump();

    if (e) {
      this.player.toggleArmed();
      this.audio.ui();
    }

    if (f) {
      if (!this.player.armed) this.player.setArmed(true);
      const id = this.weapons.switchNext();
      this.player.setWeapon(id);
      this.audio.ui();
      this.setHint(`Equipped ${this.weapons.spec.name}`);
    }

    if (r) {
      if (this.weapons.startReload()) {
        this.audio.ui();
        this.setHint('Reloading\u2026');
      }
    }

    const armed = this.player.armed;
    const aiming = armed && (a || state.aHeld);
    this.player.setAiming(aiming);
    if (aiming) this.faceAimDirection();

    if (a) {
      if (!armed) {
        this.player.punch();
        this.faceAimDirection();
      } else if (this.weapons.isMelee) {
        if (this.player.meleeSwing()) this.audio.shot('melee');
      } else {
        this.fireWeapon(false);
      }
    } else if (armed && state.aHeld && this.weapons.spec.auto) {
      this.fireWeapon(false);
    }
    if (this.player.consumePunchImpact()) this.resolveMeleeImpact();

    this.currentInteriorPoint = this.findInteriorPoint();
    if (b) this.useInteriorPoint(this.currentInteriorPoint);
  }

  private updateDrive(dt: number, a: boolean, b: boolean, e: boolean, f: boolean, r: boolean): void {
    const car = this.activeVehicle;
    if (!car) {
      this.recoverOnFoot();
      return;
    }

    const isBike = car.length < 2.5;
    if (car.access) {
      this.player.group.position.copy(this.vehicleLocalToWorld(car, car.access.seat));
      this.player.group.rotation.y = this.carYaw;
      this.player.group.visible = isBike;
      this.player.setRiding(isBike);
      if (isBike) this.player.ridePose(0);
    }

    const state = this.input.state;
    const fuel = car.fuel ?? car.maxFuel ?? 100;
    const gas = state.gasHeld && fuel > 0;
    if (state.gasHeld && fuel <= 0 && !this.fuelWarned) {
      this.fuelWarned = true;
      this.showToast('OUT OF FUEL');
      this.setHint('Engine stopped · walk to an NNPC station or find another ride');
    }
    const fuelStartPosition = car.group.position.clone();
    // Dedicated REVERSE button, plus pulling the stick back while on the gas.
    const reverse = state.reverseHeld || (gas && state.moveY > 0.35);
    const steer = Math.abs(state.moveX) > 0.12 ? state.moveX : 0;
    const handbrake = state.dHeld || state.sprintHeld;
    const accel = isBike ? 11.5 : car.maxSpeed && car.maxSpeed > CAR_MAX ? 12.5 : CAR_ACCEL;
    const maxSpeed = car.maxSpeed ?? (isBike ? 26 : CAR_MAX);

    if (reverse) this.carSpeed = Math.max(CAR_MAX_REVERSE, this.carSpeed - CAR_BRAKE * dt);
    else if (gas) this.carSpeed = Math.min(maxSpeed, this.carSpeed + accel * dt);
    else {
      const drag = (2.2 + Math.abs(this.carSpeed) * 0.06) * dt;
      this.carSpeed = Math.abs(this.carSpeed) <= drag ? 0 : this.carSpeed - Math.sign(this.carSpeed) * drag;
    }
    if (handbrake) {
      const brake = 16 * dt;
      this.carSpeed = Math.abs(this.carSpeed) <= brake ? 0 : this.carSpeed - Math.sign(this.carSpeed) * brake;
    }

    const speedFactor = clamp(Math.abs(this.carSpeed) / (isBike ? 4 : 7), 0.28, 1);
    const steerGain = handbrake ? 1.45 : 1;
    const dirSign = this.carSpeed >= 0 ? 1 : -1;
    this.carYaw -= steer * 2.1 * steerGain * speedFactor * dirSign * dt;

    if (Math.abs(steer) > 0.12) {
      const behind = this.carYaw + Math.PI;
      this.camYaw += wrapAngle(behind - this.camYaw) * (1 - Math.exp(-3.4 * dt));
    }

    const fwd = new THREE.Vector3(Math.sin(this.carYaw), 0, Math.cos(this.carYaw));
    car.group.position.addScaledVector(fwd, this.carSpeed * dt);
    car.group.rotation.y = this.carYaw;
    this.constrainCarToBridge(car);

    const axis = roadAxisForYaw(this.carYaw);
    const carWater = this.city.waterAt(
      car.group.position.x,
      car.group.position.z,
      axis,
      car.group.position.y
    );
    if (carWater !== null) {
      car.group.position.y = carWater - 0.22;
      this.carSpeed *= Math.max(0, 1 - dt * 2.8);
      if (!this.waterWarned) {
        this.waterWarned = true;
        this.showToast('VEHICLE IN THE RIVER');
        this.setHint('Get out before it sinks \u2014 swim for the bank.');
      }
    } else {
      car.group.position.y = this.city.deckHeightAt(
        car.group.position.x,
        car.group.position.z,
        axis,
        car.group.position.y
      );
      this.waterWarned = false;
    }

    const steeringAngle = -steer * 0.52;
    const steeringEase = 1 - Math.exp(-14 * dt);
    for (const pivot of car.steerPivots) {
      pivot.rotation.y += (steeringAngle - pivot.rotation.y) * steeringEase;
    }
    for (const spinner of car.spinners) spinner.rotation.x += (this.carSpeed / car.wheelRadius) * dt;

    if (car.steeringWheel) car.steeringWheel.rotation.z = -steer * 1.2;
    if (isBike && car.access) {
      // Show the player's own body seated on the okada, not the generic rider.
      this.player.group.position.copy(this.vehicleLocalToWorld(car, car.access.seat));
      this.player.group.rotation.y = this.carYaw;
      this.player.group.visible = true;
      this.player.ridePose(steer);
      if (car.driver) car.driver.visible = false;
    } else if (car.driver) {
      car.driver.visible = true;
    }

    this.resolveCarCollisions();
    if (gas || reverse) {
      const travelled = fuelStartPosition.distanceTo(car.group.position);
      car.fuel = Math.max(0, fuel - travelled * FUEL_USE_PER_METER);
      if (car.fuel <= 0 && !this.fuelWarned) {
        this.fuelWarned = true;
        this.showToast('OUT OF FUEL');
        this.setHint('Engine stopped · walk to an NNPC station or find another ride');
      }
    }

    if (e) {
      this.player.toggleArmed();
      if (this.player.armed) this.player.setWeapon(this.weapons.current);
      this.audio.ui();
      this.setHint(this.player.armed ? `${this.weapons.spec.name} ready` : 'Weapon holstered');
    }

    if (f) {
      if (!this.player.armed) this.player.setArmed(true);
      const id = this.weapons.switchNext();
      this.player.setWeapon(id);
      this.audio.ui();
      this.setHint(`Equipped ${this.weapons.spec.name}`);
    }

    if (r) {
      if (this.weapons.startReload()) {
        this.audio.ui();
        this.setHint('Reloading\u2026');
      }
    }

    const canShoot = this.player.armed && !this.weapons.isMelee;
    if (canShoot && (a || (state.aHeld && this.weapons.spec.auto))) {
      this.fireWeapon(true);
    } else if (a && !canShoot) {
      this.setHint('Switch to a firearm for drive-by shooting');
    }

    if (b) {
      if (this.garageBayContains(car)) {
        if (this.garageServiceReady(car)) this.serviceVehicle(car);
        else this.setHint('Stop fully inside the garage before requesting service');
      } else if (this.fuelStationNearby(car)) {
        if (Math.abs(this.carSpeed) <= 1.4) this.openFuelService();
        else this.setHint('Stop at the filling station before refuelling');
      } else {
        this.beginExit();
      }
    }
  }

  private garageBayContains(vehicle: VehicleRig | null): boolean {
    if (!vehicle) return false;
    const garage = this.city.sites.find((site) => site.kind === 'garage');
    if (!garage) return false;
    const inward = (vehicle.group.position.x - garage.entranceX) * garage.side;
    return inward >= 2.4 && inward <= 10.5 && Math.abs(vehicle.group.position.z - garage.z) <= 2.3;
  }

  private garageServiceReady(vehicle: VehicleRig | null): boolean {
    return this.garageBayContains(vehicle) && Math.abs(this.carSpeed) <= 1.4;
  }

  private fuelStationNearby(vehicle: VehicleRig | null): boolean {
    if (!vehicle) return false;
    return this.city.sites.some(
      (site) => {
        if (site.kind !== 'fuel') return false;
        const pump = fuelPumpApproach(site);
        return Math.hypot(
          vehicle.group.position.x - pump.x,
          vehicle.group.position.z - pump.z
        ) <= 5.5;
      }
    );
  }

  private fuelStationApproaching(vehicle: VehicleRig | null): boolean {
    if (!vehicle) return false;
    return this.city.sites.some(
      (site) => {
        if (site.kind !== 'fuel') return false;
        const pump = fuelPumpApproach(site);
        return Math.hypot(
          vehicle.group.position.x - pump.x,
          vehicle.group.position.z - pump.z
        ) <= 16;
      }
    );
  }

  private openFuelService(): void {
    const vehicle = this.activeVehicle;
    if (!vehicle) return;
    const capacity = vehicle.maxFuel ?? 100;
    const fuel = clamp(vehicle.fuel ?? capacity, 0, capacity);
    const missing = Math.ceil(capacity - fuel);
    if (missing <= 0) {
      this.setHint('Tank is already full');
      return;
    }
    const affordable = Math.min(missing, Math.floor(this.money / FUEL_PRICE_PER_UNIT));
    const options: DialogueOption[] = [];
    if (affordable > 0) {
      const price = affordable * FUEL_PRICE_PER_UNIT;
      options.push({
        label: affordable === missing
          ? `FILL TANK · ₦${price.toLocaleString('en-NG')}`
          : `BUY ${affordable} L · ₦${price.toLocaleString('en-NG')}`,
        action: () => this.purchaseFuel(vehicle, affordable)
      });
    }
    const topUp = Math.min(25, missing);
    if (topUp > 0 && topUp < affordable) {
      const price = topUp * FUEL_PRICE_PER_UNIT;
      options.push({
        label: `ADD ${topUp} L · ₦${price.toLocaleString('en-NG')}`,
        action: () => this.purchaseFuel(vehicle, topUp)
      });
    }
    if (options.length === 0) {
      this.setHint(`Fuel costs ₦${FUEL_PRICE_PER_UNIT} per litre · earn more cash to refuel`);
      return;
    }
    options.push({ label: 'LEAVE', action: () => this.closeDialogue() });
    this.showDialogue(
      'NNPC Filling Station',
      `Fuel: ${Math.floor(fuel)} / ${capacity} L\nPrice: ₦${FUEL_PRICE_PER_UNIT} per litre\nChoose a fill amount.`,
      options
    );
  }

  private purchaseFuel(vehicle: VehicleRig, requestedAmount: number): void {
    const capacity = vehicle.maxFuel ?? 100;
    const current = clamp(vehicle.fuel ?? capacity, 0, capacity);
    const affordable = Math.floor(this.money / FUEL_PRICE_PER_UNIT);
    const amount = Math.min(
      Math.max(0, requestedAmount),
      Math.ceil(capacity - current),
      affordable
    );
    if (amount <= 0) {
      this.setHint('Not enough cash to buy fuel');
      return;
    }
    const price = amount * FUEL_PRICE_PER_UNIT;
    if (!this.spend(price)) return;
    vehicle.fuel = Math.min(capacity, current + amount);
    this.fuelWarned = false;
    this.saveProgress();
    this.audio.pickup();
    this.showToast(`FUEL ADDED · ${amount} L`);
    this.closeDialogue();
  }

  private buyJerrycan(vehicle: VehicleRig): void {
    const capacity = vehicle.maxFuel ?? 100;
    const current = clamp(vehicle.fuel ?? capacity, 0, capacity);
    const amount = Math.min(20, capacity - current);
    if (amount <= 0) {
      this.setHint('That vehicle already has a full tank');
      return;
    }
    const price = amount * FUEL_PRICE_PER_UNIT;
    this.showDialogue(
      'NNPC Filling Station',
      `Jerrycan: ${amount} L\nPrice: \u20a6${price.toLocaleString('en-NG')}\n\nRefill the nearby vehicle?`,
      [
        {
          label: `BUY JERRYCAN \u00b7 \u20a6${price.toLocaleString('en-NG')}`,
          action: () => {
            if (!this.spend(price)) return;
            vehicle.fuel = current + amount;
            this.fuelWarned = false;
            this.saveProgress();
            this.audio.pickup();
            this.showToast(`JERRYCAN ADDED \u00b7 ${amount} L`);
            this.closeDialogue();
          }
        },
        { label: 'LEAVE', action: () => this.closeDialogue() }
      ]
    );
  }

  private garageEntranceNear(vehicle: VehicleRig | null): boolean {
    if (!vehicle) return false;
    const garage = this.city.sites.find((site) => site.kind === 'garage');
    return Boolean(
      garage &&
      Math.hypot(
        vehicle.group.position.x - garage.entranceX,
        vehicle.group.position.z - garage.entranceZ
      ) <= 16
    );
  }

  private updateGarageEntrance(): void {
    const garage = this.city.sites.find((site) => site.kind === 'garage');
    if (!garage) return;
    const position = this.mode === 'drive' && this.activeVehicle
      ? this.activeVehicle.group.position
      : this.player.group.position;
    const distance = Math.hypot(position.x - garage.entranceX, position.z - garage.entranceZ);
    const approachRange = this.mode === 'drive' ? 16 : 8;
    this.interiors.setEntranceOpen(garage.id, distance <= approachRange);
  }

  private serviceVehicle(vehicle: VehicleRig): void {
    this.ensureVehicleHealth(vehicle);
    const maxHealth = vehicle.maxHealth ?? this.vehicleHealthCap(vehicle);
    if ((vehicle.health ?? maxHealth) >= maxHealth && !vehicle.burning && !vehicle.wrecked) {
      this.setHint('Your vehicle is already in good condition');
      return;
    }
    if (!this.spend(150)) return;
    vehicle.health = maxHealth;
    vehicle.burning = 0;
    vehicle.wrecked = false;
    const fire = vehicle.group.userData.fire as THREE.Group | undefined;
    if (fire) fire.visible = false;
    const smoke = vehicle.group.userData.smoke as THREE.Object3D | undefined;
    if (smoke) smoke.visible = false;
    const wreckSmoke = vehicle.group.userData.wreckSmoke as THREE.Object3D | undefined;
    if (wreckSmoke) wreckSmoke.visible = false;
    this.audio.pickup();
    this.showToast('GARAGE SERVICE COMPLETE · VEHICLE REPAIRED');
    this.setHint('Vehicle repaired · ₦150 paid');
  }

  private beginEnter(vehicle: VehicleRig): void {
    const access = vehicle.access;
    if (!access) {
      this.setHint('This vehicle cannot be entered');
      return;
    }
    if (!this.player.onGround) {
      this.setHint('Land before entering');
      return;
    }
    if (this.vehicleDistance(vehicle) > access.interactionRange + 0.35) {
      this.setHint(`Move closer to the ${access.label.toLowerCase()} to enter`);
      return;
    }

    const hijack = this.traffic.contains(vehicle);
    vehicle.maxFuel ??= 100;
    vehicle.fuel ??= vehicle.maxFuel;
    this.fuelWarned = false;
    if (!this.drivableVehicles.includes(vehicle)) {
      if (hijack) {
        this.traffic.halt(vehicle);
        this.pedestrians.ejectDriver(vehicle.group.position, vehicle.group.rotation.y);
        this.showToast('DRIVER THROWN OUT \u00b7 CAR HIJACKED');
      }
      if (this.traffic.takeVehicle(vehicle)) {
        this.drivableVehicles.push(vehicle);
      } else {
        this.setHint('This vehicle is not available');
        return;
      }
    }
    this.ensureVehicleHealth(vehicle);
    if (vehicle.wrecked) {
      this.setHint('This vehicle is wrecked');
      return;
    }

    this.activeVehicle = vehicle;
    this.mode = 'entering';
    this.player.setRiding(false);
    this.currentInteraction = null;
    this.seqTimer = 0;
    this.seqPath = this.buildEntryPath(vehicle, access.entry);
    this.seqWalkDistance = 0;
    for (let i = 1; i < this.seqPath.length; i += 1) {
      this.seqWalkDistance += this.seqPath[i].distanceTo(this.seqPath[i - 1]);
    }
    this.seqDoor.copy(this.vehicleLocalToWorld(vehicle, access.entry));
    this.seqSeat.copy(this.vehicleLocalToWorld(vehicle, access.seat));
    this.player.resetActions();
    this.input.reset();
    this.resetActionTracking();
    this.carSpeed = 0;
    this.carYaw = vehicle.group.rotation.y;
    const isBike = vehicle.length < 2.5;
    this.camDist = isBike ? 2.2 : 5.4;
    this.camPitch = isBike ? 0.18 : 0.28;
    this.camYaw = this.carYaw + Math.PI;
    if (vehicle.driver) vehicle.driver.visible = true;
    vehicle.doorOpen = Boolean(vehicle.doorPivot);
    this.audio.door();
    this.setHint(
      `${hijack ? 'Hijacking' : 'Entering'} the ${access.label.toLowerCase()}\u2026`
    );
  }

  private beginExit(): void {
    const vehicle = this.activeVehicle;
    if (!vehicle) return;
    if (Math.abs(this.carSpeed) > 2.5) {
      this.setHint('Slow down before exiting');
      return;
    }
    const safe = this.findExitPosition(vehicle);
    if (!safe) {
      this.setHint('No safe space to get out here');
      return;
    }
    this.exitTarget.copy(safe);
    this.mode = 'exiting';
    this.player.setRiding(false);
    this.currentInteraction = null;
    this.seqTimer = 0;
    this.carSpeed = 0;
    this.player.resetActions();
    this.input.reset();
    this.resetActionTracking();
    vehicle.doorOpen = Boolean(vehicle.doorPivot);
    this.audio.door();
    this.setHint(`Getting out of the ${vehicle.access?.label.toLowerCase() ?? 'vehicle'}\u2026`);
  }

  private updateSequence(dt: number): void {
    const vehicle = this.activeVehicle;
    if (!vehicle) {
      this.recoverOnFoot();
      return;
    }

    this.seqTimer += dt;
    const door = vehicle.doorPivot;
    const t = this.seqTimer;

    if (this.mode === 'entering') {
      const doorT = clamp(t / 0.35, 0, 1);
      if (door) door.rotation.y = easeOut(doorT) * -1.15;

      const walkT = clamp((t - 0.12) / 0.55, 0, 1);
      const seatT = clamp((t - 0.67) / 0.19, 0, 1);
      if (t < 0.88) {
        if (walkT < 1) {
          this.player.group.position.copy(this.sampleEntryPath(easeInOut(walkT)));
        } else {
          this.player.group.position.lerpVectors(this.seqDoor, this.seqSeat, easeInOut(seatT));
          this.player.group.position.y = 0;
        }
        const dx = vehicle.group.position.x - this.player.group.position.x;
        const dz = vehicle.group.position.z - this.player.group.position.z;
        if (dx * dx + dz * dz > 0.0001) {
          this.player.yaw = Math.atan2(dx, dz);
          this.player.group.rotation.y = this.player.yaw;
        }
      } else {
        this.player.group.position.copy(this.seqSeat);
        this.player.group.visible = false;
        if (vehicle.driver) vehicle.driver.visible = true;
      }

      if (t > 1.15) {
        if (door) door.rotation.y = 0;
        vehicle.doorOpen = false;
        this.mode = 'drive';
        this.player.velocity.set(0, 0, 0);
        this.carYaw = vehicle.group.rotation.y;
        this.carSpeed = 0;
        this.resetActionTracking();
        this.setHint('Hold GAS \u00b7 steer with stick \u00b7 D brake \u00b7 A drive-by \u00b7 B exit');
      }
    } else {
      const doorT = clamp(t / 0.35, 0, 1);
      if (door) door.rotation.y = easeOut(doorT) * -1.15;

      if (t > 0.4 && vehicle.driver) vehicle.driver.visible = false;

      if (t > 0.55) {
        this.player.group.visible = true;
        this.player.group.position.copy(this.exitTarget);
        this.player.yaw = this.carYaw;
        this.player.group.rotation.y = this.carYaw;
        this.player.group.position.y = this.city.groundHeightAt(this.player.group.position.x, this.player.group.position.z);
        this.player.velocity.set(0, 0, 0);
      }

      if (t > 1.0) {
        if (door) door.rotation.y = 0;
        vehicle.doorOpen = false;
        this.mode = 'foot';
        this.activeVehicle = null;
        this.entryCooldown = 0.6;
        this.input.reset();
        this.resetActionTracking();
        this.setHint('Move stick \u00b7 B enter/use \u00b7 A fire \u00b7 E gun \u00b7 F next gun \u00b7 R reload');
      }
    }
  }

  private recoverOnFoot(): void {
    this.mode = 'foot';
    this.activeVehicle = null;
    this.player.group.visible = true;
    this.carSpeed = 0;
    this.input.reset();
    this.resetActionTracking();
  }

  private beginSiteEnter(site: CitySite): void {
    if (this.mode !== 'foot' || this.inside || this.siteSeq) return;
    if (this.entryCooldown > 0) return;
    const groundY = this.city.groundHeightAt(site.entranceX, site.entranceZ);
    this.siteSeq = {
      site,
      entering: true,
      t: 0,
      swapped: false,
      from: this.player.group.position.clone(),
      to: new THREE.Vector3(site.entranceX, groundY, site.entranceZ)
    };
    this.interiors.setOutdoorRoots(this.collectOutdoorRoots());
    this.interiors.setEntranceOpen(site.id, true);
    this.player.velocity.set(0, 0, 0);
    this.input.reset();
    this.resetActionTracking();
    this.audio.door();
    this.setHint(`Opening the door to ${site.label}\u2026`);
  }

  private applyEnterSite(site: CitySite): void {
    const interior = this.interiors.enter(site.id);
    if (!interior) return;
    this.inside = true;
    this.activeInterior = interior;
    this.mode = 'foot';
    this.activeVehicle = null;
    this.currentInteraction = null;
    this.currentInteriorPoint = null;
    this.player.group.position.copy(interior.spawn);
    this.player.group.position.y = INTERIOR_GROUND;
    this.player.faceYaw(interior.spawnYaw);
    this.player.velocity.set(0, 0, 0);
    this.player.resetActions();
    this.camYaw = interior.spawnYaw + Math.PI;
    this.camDist = 2.8;
    this.snapCameraNext = true;
    this.input.reset();
  }

  private beginSiteExit(): void {
    if (!this.inside || this.siteSeq || !this.activeInterior) return;
    const site = this.activeInterior.site;
    this.siteSeq = {
      site,
      entering: false,
      t: 0,
      swapped: false,
      from: this.player.group.position.clone(),
      to: this.player.group.position.clone()
    };
    this.interiors.setInteriorDoorOpen(site.id, true);
    this.player.velocity.set(0, 0, 0);
    this.input.reset();
    this.resetActionTracking();
    this.audio.door();
    this.setHint('Opening the door\u2026');
  }

  private updateSiteSequence(dt: number): void {
    const seq = this.siteSeq;
    if (!seq) return;
    seq.t += dt;

    if (seq.entering) {
      if (!seq.swapped) {
        const walk = clamp((seq.t - 0.08) / 0.42, 0, 1);
        this.player.group.position.lerpVectors(seq.from, seq.to, easeInOut(walk));
        const dx = seq.to.x - seq.from.x;
        const dz = seq.to.z - seq.from.z;
        if (dx * dx + dz * dz > 0.0001) this.player.faceYaw(Math.atan2(dx, dz));
      }

      if (seq.t >= 0.55 && !seq.swapped) {
        seq.swapped = true;
        this.setFade(1);
        this.applyEnterSite(seq.site);
        this.interiors.setEntranceOpen(seq.site.id, false);
        this.interiors.setInteriorDoorOpen(seq.site.id, false);
      }
      if (seq.t >= 0.82) this.setFade(0);
      if (seq.t >= 1.0) {
        this.siteSeq = null;
        this.mode = 'foot';
        this.setHint(`Inside ${seq.site.label} \u00b7 B near the counter, people or exit`);
      }
      return;
    }

    if (seq.t >= 0.42 && !seq.swapped) {
      seq.swapped = true;
      this.setFade(1);
      this.applyExitSite();
      this.interiors.setEntranceOpen(seq.site.id, true);
    }
    if (seq.t >= 0.85) this.setFade(0);
    if (seq.t >= 1.15) {
      this.siteSeq = null;
      this.interiors.setEntranceOpen(seq.site.id, false);
      this.entryCooldown = 1.2;
      this.autoEntryLock = true;
      this.setHint('Back outside \u00b7 B to enter again');
    }
  }

  private setFade(value: number): void {
    if (this.ui.fade) this.ui.fade.style.opacity = String(value);
  }

  private applyExitSite(): void {
    if (!this.inside) return;
    const result = this.interiors.exit();
    if (!result) return;
    this.inside = false;
    this.activeInterior = null;
    this.currentInteraction = null;
    this.currentInteriorPoint = null;
    this.player.group.position.copy(result.position);
    this.player.group.position.y = this.city.groundHeightAt(result.position.x, result.position.z);
    this.player.faceYaw(result.yaw);
    this.player.velocity.set(0, 0, 0);
    this.camYaw = result.yaw + Math.PI;
    this.camDist = 5.4;
    this.snapCameraNext = true;
    this.entryCooldown = 1;
    this.autoEntryLock = true;
    this.input.reset();
    this.audio.door();
  }

  private findInteraction(): FootInteraction | null {
    if (this.entryCooldown > 0) return null;

    const position = this.player.group.position;
    const nextMission = this.missions.nextMission();
    if (nextMission) {
      const distance = Math.hypot(position.x - nextMission.giverX, position.z - nextMission.giverZ);
      if (distance < 3.4) {
        return {
          kind: 'giver',
          label: `TALK TO ${nextMission.giverName.toUpperCase()}`,
          mission: nextMission
        };
      }
    }

    const nearFuelStation = this.city.sites.some(
      (site) =>
        site.kind === 'fuel' &&
        Math.hypot(position.x - site.entranceX, position.z - site.entranceZ) < 5
    );
    if (nearFuelStation) {
      const emptyVehicle = this.drivableVehicles
        .filter((vehicle) => !vehicle.wrecked && (vehicle.fuel ?? 100) < (vehicle.maxFuel ?? 100))
        .map((vehicle) => ({ vehicle, distance: this.vehicleDistance(vehicle) }))
        .filter(({ distance }) => distance < 10)
        .sort((a, b) => a.distance - b.distance)[0];
      if (emptyVehicle) {
        return {
          kind: 'fuel',
          label: `BUY JERRYCAN FOR ${emptyVehicle.vehicle.access?.label.toUpperCase() ?? 'VEHICLE'}`,
          vehicle: emptyVehicle.vehicle
        };
      }
    }

    for (const stop of this.city.transitStops) {
      if (Math.hypot(position.x - stop.x, position.z - (stop.z + 12)) <= 5) {
        return {
          kind: 'transit',
          label: `DANFO ROUTE · ${stop.label}`,
          transitStop: stop
        };
      }
    }
    for (const station of this.city.railStations) {
      if (Math.hypot(position.x - station.accessX, position.z - station.accessZ) <= 5) {
        return {
          kind: 'rail',
          label: `BOARD TRAIN · ${station.label}`,
          railStation: station
        };
      }
    }

    let nearestSite: CitySite | null = null;
    let nearestSiteDistance = 3.4;
    for (const site of this.city.sites) {
      const distance = Math.hypot(position.x - site.entranceX, position.z - site.entranceZ);
      if (distance < nearestSiteDistance) {
        nearestSiteDistance = distance;
        nearestSite = site;
      }
    }
    if (nearestSite) {
      return {
        kind: 'site',
        label: `ENTER ${nearestSite.label}`,
        site: nearestSite
      };
    }

    let nearestService: ServiceSpot | null = null;
    let nearestServiceDistance = 2.7;
    for (const spot of [...this.city.atms, ...this.city.posStands]) {
      const distance = Math.hypot(position.x - spot.x, position.z - spot.z);
      if (distance < nearestServiceDistance) {
        nearestServiceDistance = distance;
        nearestService = spot;
      }
    }
    if (nearestService) {
      return {
        kind: 'service',
        label: nearestService.kind === 'atm' ? `USE ${nearestService.label}` : 'POS AGENT · CASH OUT',
        service: nearestService
      };
    }

    const warden = this.streetPeople.wardenNear(position, 2.6);
    if (warden) {
      return {
        kind: 'warden',
        label: `TALK TO ${warden.name.toUpperCase()}`,
        person: warden
      };
    }

    const person = this.pedestrians.nearby(position, 2.3);
    if (person) {
      return {
        kind: 'person',
        label: `TALK TO ${person.name.toUpperCase()}`,
        person: { name: person.name, line: person.line }
      };
    }

    for (const pickup of this.armourPickups) {
      if (pickup.taken) continue;
      if (Math.hypot(position.x - pickup.x, position.z - pickup.z) < 2.4) {
        return { kind: 'armour', label: 'TAKE ARMOUR VEST', armour: pickup };
      }
    }

    const candidate = this.nearestVehicleCandidate();
    if (candidate && candidate.vehicle.access) {
      const access = candidate.vehicle.access;
      if (candidate.distance <= access.interactionRange) {
        const hijack = this.traffic.contains(candidate.vehicle);
        return {
          kind: 'vehicle',
          label: `${hijack ? 'HIJACK' : 'ENTER'} ${access.label}`,
          vehicle: candidate.vehicle
        };
      }
    }

    return null;
  }

  private useInteraction(): void {
    const interaction = this.currentInteraction;
    if (!interaction) {
      this.setHint('Nothing to interact with here');
      return;
    }
    if (interaction.kind === 'giver' && interaction.mission) {
      this.startMission(interaction.mission);
      return;
    }
    if (interaction.kind === 'person' && interaction.person) {
      this.showDialogue(interaction.person.name, interaction.person.line, [
        { label: 'LEAVE', action: () => this.closeDialogue() }
      ]);
      return;
    }
    if (interaction.kind === 'warden' && interaction.person) {
      this.showDialogue(interaction.person.name, interaction.person.line, [
        { label: 'LEAVE', action: () => this.closeDialogue() }
      ]);
      return;
    }
    if (interaction.kind === 'service' && interaction.service) {
      this.openCashWithdrawal(interaction.service);
      return;
    }
    if (interaction.kind === 'fuel' && interaction.vehicle) {
      this.buyJerrycan(interaction.vehicle);
      return;
    }
    if (interaction.kind === 'transit' && interaction.transitStop) {
      this.openDanfoRoute(interaction.transitStop);
      return;
    }
    if (interaction.kind === 'rail' && interaction.railStation) {
      this.openTrainRoute(interaction.railStation);
      return;
    }
    if (interaction.kind === 'site' && interaction.site) {
      this.beginSiteEnter(interaction.site);
      return;
    }
    if (interaction.kind === 'armour' && interaction.armour) {
      const pickup = interaction.armour;
      pickup.taken = true;
      pickup.group.visible = false;
      this.armour = Math.min(100, this.armour + 60);
      this.audio.pickup();
      this.showToast(`ARMOUR +60 \u00b7 ${Math.round(this.armour)}/100`);
      this.setHint('Vest strapped on \u00b7 it absorbs most bullet damage');
      return;
    }
    if (interaction.kind === 'vehicle' && interaction.vehicle) {
      this.beginEnter(interaction.vehicle);
    }
  }

  private findInteriorPoint(): InteriorPointDef | null {
    if (!this.inside) return null;
    const position = this.player.group.position;
    let best: InteriorPointDef | null = null;
    let bestDistance = Infinity;
    for (const point of this.interiors.points) {
      if (point.kind === 'loot' && this.looted.has(point.id)) continue;
      const distance = Math.hypot(position.x - point.position.x, position.z - point.position.z);
      const range = point.kind === 'exit' ? 2.0 : 2.5;
      if (distance <= range && distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    if (best) return best;

    const actor = this.interiors.actorNear(position, 1.9);
    if (actor) {
      return {
        id: `actor-${actor.id}`,
        label: `TALK TO ${actor.name.toUpperCase()}`,
        position: actor.group.position.clone(),
        kind: 'npc',
        npcName: actor.name,
        npcLine: actor.line
      };
    }
    return null;
  }

  private useInteriorPoint(point: InteriorPointDef | null): void {
    if (!point) {
      this.setHint('Walk to the counter or the door');
      return;
    }
    if (point.kind === 'exit') {
      this.beginSiteExit();
      return;
    }
    if (point.kind === 'loot') {
      this.looted.add(point.id);
      const reward = point.reward ?? 100;
      this.money += reward;
      this.saveProgress();
      this.audio.pickup();
      this.showToast(`CASH FOUND \u00b7 +\u20a6${reward}`);
      this.setHint('Found some naira under the mattress');
      return;
    }
    if (point.kind === 'npc') {
      this.showDialogue(point.npcName ?? 'Resident', point.npcLine ?? 'How you dey?', [
        { label: 'LEAVE', action: () => this.closeDialogue() }
      ]);
      return;
    }
    if (point.kind === 'service') this.openService(point);
  }

  private openService(point: InteriorPointDef): void {
    if (point.service === 'loan') {
      this.openLapoOffice(point);
      return;
    }

    const title = point.npcName ?? 'Service';
    const body = point.npcLine ?? 'Wetin you need?';
    const options: DialogueOption[] = [];

    if (point.service === 'shop') {
      if (this.activeInterior?.site.kind === 'shop') {
        options.push({
          label: 'CUSTOMIZE CHARACTER · FREE',
          action: () => this.openPlayerWardrobe()
        });
      }
      options.push({
        label: '30 PISTOL ROUNDS \u00b7 \u20a680',
        action: () => this.purchase(80, () => this.weapons.addAmmo('pistol', 30), 'Pistol ammo bought')
      });
      if (this.weapons.isUnlocked('revolver')) {
        options.push({
          label: '18 REVOLVER ROUNDS \u00b7 \u20a6110',
          action: () => this.purchase(110, () => this.weapons.addAmmo('revolver', 18), 'Revolver ammo bought')
        });
      }
      if (this.weapons.isUnlocked('smg')) {
        options.push({
          label: '40 SMG ROUNDS \u00b7 \u20a6140',
          action: () => this.purchase(140, () => this.weapons.addAmmo('smg', 40), 'SMG ammo bought')
        });
      }
      if (this.weapons.isUnlocked('carbine')) {
        options.push({
          label: '48 CARBINE ROUNDS \u00b7 \u20a6240',
          action: () => this.purchase(240, () => this.weapons.addAmmo('carbine', 48), 'Carbine ammo bought')
        });
      }
      if (!this.weapons.isUnlocked('revolver')) {
        options.push({
          label: 'BUY REVOLVER \u00b7 \u20a6650',
          action: () => this.purchaseWeapon('revolver', 650)
        });
      }
      if (!this.weapons.isUnlocked('carbine')) {
        options.push({
          label: 'BUY CARBINE \u00b7 \u20a61800',
          action: () => this.purchaseWeapon('carbine', 1800)
        });
      }
      options.push({
        label: 'MEDKIT +35 HP \u00b7 \u20a660',
        action: () => this.healFor(35, 60, 'Medkit used')
      });
      options.push({
        label: 'ARMOUR VEST +60 \u00b7 \u20a6220',
        action: () =>
          this.purchase(220, () => this.addArmour(60), 'Armour vest equipped')
      });
    } else if (point.service === 'food') {
      options.push({
        label: 'HOT MEAL +30 HP \u00b7 \u20a640',
        action: () => this.healFor(30, 40, 'Good food')
      });
    } else if (point.service === 'heal') {
      options.push({
        label: 'FULL TREATMENT \u00b7 \u20a6120',
        action: () => this.healFor(this.health.maxHp, 120, 'Fully treated')
      });
    } else if (point.service === 'garage') {
      options.push({
        label: 'PERSONAL RESTOCK \u00b7 \u20a6150',
        action: () =>
          this.purchase(
            150,
            () => {
              restoreHealth(this.health);
              this.weapons.refillAll();
              this.armour = 100;
            },
            'Health, armour and ammo restored'
          )
      });
    } else if (point.service === 'police') {
      options.push({
        label: 'ARMOUR VEST +60 \u00b7 \u20a6180',
        action: () =>
          this.purchase(180, () => this.addArmour(60), 'Armour vest equipped')
      });
      if (this.wanted > 0) {
        options.push({
          label: 'PAY FINE \u20a6200 \u00b7 CLEAR WANTED',
          action: () => {
            if (!this.spend(200)) return;
            this.wanted = 0;
            this.wantedDelay = 0;
            this.police.reset();
            this.audio.siren(false);
            this.showToast('WANTED CLEARED');
            this.closeDialogue();
          }
        });
      } else {
        options.push({
          label: 'REPORT A CRIME',
          action: () => {
            this.showToast('The sergeant takes your statement');
            this.closeDialogue();
          }
        });
      }
    }

    options.push({ label: 'LEAVE', action: () => this.closeDialogue() });
    this.showDialogue(title, body, options);
  }

  private openPlayerWardrobe(): void {
    const appearance = this.player.appearance;
    this.showDialogue('Yemi\'s Style Corner', 'Build your look. Changes are saved automatically.', [
      {
        label: `BODY TYPE · ${appearance.bodyType.toUpperCase()}`,
        action: () =>
          this.openAppearanceChoice('Body type', 'bodyType', [
            { label: 'Average', value: 'average' },
            { label: 'Athletic', value: 'athletic' },
            { label: 'Muscular', value: 'muscular' },
            { label: 'Heavier build', value: 'heavy' }
          ])
      },
      {
        label: `OUTFIT · ${appearance.outfit.toUpperCase().replace('-', ' ')}`,
        action: () =>
          this.openAppearanceChoice('Outfit', 'outfit', [
            { label: 'Graphic street tee', value: 'graphic-tee' },
            { label: 'Fitted Senator wear', value: 'senator' },
            { label: 'Short-sleeve kaftan', value: 'kaftan' },
            { label: 'Agbero reflective vest', value: 'agbero-vest' }
          ])
      },
      {
        label: 'SHIRT COLOUR',
        action: () => this.openAppearanceChoice('Shirt colour', 'shirtColor', SHIRT_COLORS)
      },
      {
        label: `TROUSERS · ${appearance.bottoms.toUpperCase()}`,
        action: () =>
          this.openAppearanceChoice('Trousers', 'bottoms', [
            { label: 'Long trousers', value: 'long' },
            { label: 'Shorts', value: 'shorts' }
          ])
      },
      {
        label: 'TROUSER COLOUR',
        action: () => this.openAppearanceChoice('Trouser colour', 'pantsColor', TROUSER_COLORS)
      },
      {
        label: `FOOTWEAR · ${appearance.footwear.toUpperCase()}`,
        action: () =>
          this.openAppearanceChoice('Footwear', 'footwear', [
            { label: 'Sneakers', value: 'sneakers' },
            { label: 'Slides', value: 'slides' }
          ])
      },
      {
        label: 'SHOE COLOUR',
        action: () => this.openAppearanceChoice('Shoe colour', 'shoesColor', SHOE_COLORS)
      },
      {
        label: 'SKIN TONE',
        action: () => this.openAppearanceChoice('Skin tone', 'skinTone', SKIN_TONES)
      },
      {
        label: `HEADWEAR · ${appearance.headwear.toUpperCase().replace('-', ' ')}`,
        action: () =>
          this.openAppearanceChoice('Headwear', 'headwear', [
            { label: 'No hat', value: 'none' },
            { label: 'Snapback', value: 'snapback' },
            { label: 'Northern embroidered cap', value: 'northern-cap' },
            { label: 'Headwrap', value: 'headwrap' }
          ])
      },
      {
        label: `HAIRSTYLE · ${appearance.hairStyle.toUpperCase()}`,
        action: () =>
          this.openAppearanceChoice('Hairstyle', 'hairStyle', [
            { label: 'Low fade', value: 'fade' },
            { label: 'Afro', value: 'afro' },
            { label: 'Braids', value: 'braids' },
            { label: 'Bald', value: 'bald' }
          ])
      },
      {
        label: `FACIAL HAIR · ${appearance.facialHair.toUpperCase()}`,
        action: () =>
          this.openAppearanceChoice('Facial hair', 'facialHair', [
            { label: 'Clean shaven', value: 'clean' },
            { label: 'Stubble', value: 'stubble' },
            { label: 'Trimmed beard', value: 'beard' }
          ])
      },
      {
        label: `EYEWEAR · ${appearance.glasses ? 'ON' : 'OFF'}`,
        action: () =>
          this.openAppearanceChoice('Eyewear', 'glasses', [
            { label: 'No glasses', value: false },
            { label: 'Glasses', value: true }
          ])
      },
      { label: 'DONE', action: () => this.closeDialogue() }
    ]);
  }

  private openAppearanceChoice<K extends keyof PlayerAppearance>(
    title: string,
    field: K,
    choices: ReadonlyArray<{ label: string; value: PlayerAppearance[K] }>
  ): void {
    const options: DialogueOption[] = choices.map((choice) => ({
      label: `${this.player.appearance[field] === choice.value ? '✓ ' : ''}${choice.label}`,
      action: () => {
        this.player.setAppearance({ ...this.player.appearance, [field]: choice.value });
        this.saveProgress();
        this.openPlayerWardrobe();
      }
    }));
    options.push({ label: 'BACK TO WARDROBE', action: () => this.openPlayerWardrobe() });
    this.showDialogue(title, 'Choose an option for your character.', options);
  }

  private openLapoOffice(point: InteriorPointDef): void {
    const loanAmount = LAPO_LOAN_AMOUNT.toLocaleString('en-NG');
    const repaymentAmount = LAPO_REPAYMENT_AMOUNT.toLocaleString('en-NG');
    const outstanding = this.loanBalance.toLocaleString('en-NG');
    const body = this.loanBalance > 0
      ? `${point.npcLine ?? 'Welcome.'}\n\nOutstanding game loan: \u20a6${outstanding}.`
      : `${point.npcLine ?? 'Welcome.'}\n\nGame terms: borrow \u20a6${loanAmount} now and repay \u20a6${repaymentAmount} once.`;
    const options: DialogueOption[] = this.loanBalance > 0
      ? [{
          label: `REPAY GAME LOAN \u00b7 \u20a6${outstanding}`,
          action: () => this.repayLapoLoan()
        }]
      : [{
          label: `BORROW \u00a6${loanAmount} \u00b7 REPAY \u00a6${repaymentAmount}`,
          action: () => this.takeLapoLoan()
        }];
    options.push({ label: 'LEAVE', action: () => this.closeDialogue() });
    this.showDialogue(point.npcName ?? 'LAPO Agent', body, options);
  }

  private takeLapoLoan(): void {
    if (this.loanBalance > 0) {
      this.setHint('Repay your current game loan before borrowing again');
      return;
    }
    this.money += LAPO_LOAN_AMOUNT;
    this.loanBalance = LAPO_REPAYMENT_AMOUNT;
    this.saveProgress();
    this.audio.pickup();
    this.showToast(`GAME LOAN RECEIVED \u00b7 +\u20a6${LAPO_LOAN_AMOUNT}`);
    this.closeDialogue();
  }

  private repayLapoLoan(): void {
    if (this.loanBalance <= 0) {
      this.setHint('There is no outstanding game loan');
      return;
    }
    if (this.money < this.loanBalance) {
      this.setHint(`You need \u20a6${this.loanBalance.toLocaleString('en-NG')} cash to repay`);
      return;
    }
    const repayment = this.loanBalance;
    this.money -= repayment;
    this.loanBalance = 0;
    this.saveProgress();
    this.audio.pickup();
    this.showToast(`GAME LOAN REPAID \u00b7 \u20a6${repayment.toLocaleString('en-NG')}`);
    this.closeDialogue();
  }

  private openDanfoRoute(currentStop: TransitStop): void {
    const destinations = this.city.transitStops.filter((stop) => stop.id !== currentStop.id);
    const options: DialogueOption[] = destinations.map((stop) => ({
      label: `${stop.label} \u00b7 \u20a6${DANFO_FARE}`,
      action: () => this.rideDanfo(stop)
    }));
    options.push({ label: 'LEAVE', action: () => this.closeDialogue() });
    this.showDialogue(
      'Danfo Park',
      `You are at ${currentStop.label}.\n\nChoose a destination. Fare: \u20a6${DANFO_FARE}.`,
      options
    );
  }

  private rideDanfo(stop: TransitStop): void {
    if (this.inside || this.mode !== 'foot' || this.wanted > 0) {
      this.setHint('Clear the police and travel on foot to use the Danfo park');
      return;
    }
    if (!this.spend(DANFO_FARE)) return;
    this.closeDialogue();
    this.player.velocity.set(0, 0, 0);
    this.input.reset();
    this.currentInteraction = null;
    this.transitSeq = {
      timer: 0.48,
      destination: new THREE.Vector3(
        stop.x,
        this.city.groundHeightAt(stop.x, stop.z + 12, 'z'),
        stop.z + 12
      ),
      mode: 'danfo',
      destinationId: stop.id,
      swapped: false,
      arrivalLabel: 'DANFO ARRIVED · FARE PAID'
    };
    if (this.ui.fade) this.ui.fade.style.opacity = '1';
  }

  private openTrainRoute(currentStation: RailStation): void {
    const destinations = this.city.railStations.filter((station) => station.id !== currentStation.id);
    const options: DialogueOption[] = destinations.map((station) => ({
      label: `${station.label} · ₦${TRAIN_FARE}`,
      action: () => this.rideTrain(station)
    }));
    options.push({ label: 'LEAVE', action: () => this.closeDialogue() });
    this.showDialogue(
      'Kano City Rail',
      `You are at ${currentStation.label}.\n\nChoose a station. Fare: ₦${TRAIN_FARE}.`,
      options
    );
  }

  private rideTrain(station: RailStation): void {
    if (this.inside || this.mode !== 'foot' || this.wanted > 0) {
      this.setHint('Clear the police and travel on foot to board the city train');
      return;
    }
    if (!this.spend(TRAIN_FARE)) return;
    this.closeDialogue();
    this.player.velocity.set(0, 0, 0);
    this.input.reset();
    this.currentInteraction = null;
    this.transitSeq = {
      timer: 1.6,
      destination: new THREE.Vector3(
        station.accessX,
        this.city.groundHeightAt(station.accessX, station.accessZ, 'z'),
        station.accessZ
      ),
      mode: 'train',
      destinationId: station.id,
      swapped: false,
      arrivalLabel: 'TRAIN ARRIVED · FARE PAID'
    };
    if (this.ui.fade) this.ui.fade.style.opacity = '1';
  }

  private updateTransitSequence(dt: number): void {
    const sequence = this.transitSeq;
    if (!sequence) return;
    sequence.timer -= dt;
    if (!sequence.swapped && sequence.timer <= 0.24) {
      this.player.group.position.copy(sequence.destination);
      this.player.faceYaw(Math.PI);
      this.player.velocity.set(0, 0, 0);
      this.camYaw = this.player.yaw + Math.PI;
      this.snapCameraNext = true;
      sequence.swapped = true;
    }
    if (sequence.timer <= 0) {
      this.transitSeq = null;
      if (this.ui.fade) this.ui.fade.style.opacity = '0';
      this.showToast(sequence.arrivalLabel);
      const completedMission = this.missions.completeTransit(
        sequence.mode,
        sequence.destinationId
      );
      if (completedMission) this.completeMission(completedMission);
    }
  }

  private purchase(cost: number, apply: () => void, message: string): void {
    if (!this.spend(cost)) return;
    apply();
    this.saveProgress();
    this.audio.pickup();
    this.showToast(message);
    this.closeDialogue();
  }

  private purchaseWeapon(id: WeaponId, cost: number): void {
    if (this.weapons.isUnlocked(id)) {
      this.setHint(`${WEAPONS[id].name} is already in your collection`);
      return;
    }
    this.purchase(cost, () => {
      this.weapons.unlock(id);
      this.weapons.select(id);
      this.player.setArmed(true);
      this.player.setWeapon(id);
    }, `${WEAPONS[id].name} added to your collection`);
  }

  private healFor(amount: number, cost: number, message: string): void {
    if (this.health.hp >= this.health.maxHp) {
      this.setHint('Health is already full');
      return;
    }
    this.purchase(cost, () => healHealth(this.health, amount), message);
  }

  private addArmour(amount: number): void {
    this.armour = Math.min(100, this.armour + amount);
  }

  private spend(cost: number): boolean {
    if (this.money < cost) {
      this.setHint(`Not enough naira \u2014 you need \u20a6${cost}`);
      return false;
    }
    this.money -= cost;
    this.saveProgress();
    this.audio.ui();
    return true;
  }

  private loadBankBalance(): void {
    try {
      const saved = window.localStorage.getItem(BANK_BALANCE_KEY);
      if (saved === null) return;
      const balance = Number(saved);
      if (!Number.isSafeInteger(balance) || balance < 0) {
        throw new Error('Stored bank balance is not a non-negative integer');
      }
      this.bankBalance = balance;
    } catch (error) {
      console.error('Unable to load the bank balance; cash withdrawals are disabled.', error);
      this.bankStorageAvailable = false;
      this.showToast('BANK ACCOUNT UNAVAILABLE · WITHDRAWALS DISABLED');
    }
  }

  private loadProgress(): void {
    try {
      const saved = window.localStorage.getItem(PROGRESS_SAVE_KEY);
      if (saved === null) return;
      const parsed: unknown = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Stored progress is not an object');
      }
      const data = parsed as Partial<ProgressSaveData>;
      if (data.version !== 1) throw new Error('Stored progress has an unsupported version');
      if (typeof data.money !== 'number' || !Number.isSafeInteger(data.money) || data.money < 0) {
        throw new Error('Stored cash balance is not a non-negative integer');
      }
      const loanBalance = data.loanBalance ?? 0;
      if (!Number.isSafeInteger(loanBalance) || loanBalance < 0) {
        throw new Error('Stored loan balance is not a non-negative integer');
      }
      if (data.appearance !== undefined && !isPlayerAppearance(data.appearance)) {
        throw new Error('Stored player appearance is invalid');
      }
      if (!Array.isArray(data.lootedIds)) throw new Error('Stored loot state is invalid');
      if (data.vehicleFuel !== undefined && (!data.vehicleFuel || typeof data.vehicleFuel !== 'object')) {
        throw new Error('Stored vehicle fuel state is invalid');
      }

      this.money = data.money;
      this.loanBalance = loanBalance;
      if (data.appearance) this.player.setAppearance(data.appearance);
      this.looted = new Set(data.lootedIds.filter((id): id is string => typeof id === 'string'));
      this.missions.restore(data.missions);
      if (data.weapons !== undefined) this.weapons.restore(data.weapons);
      for (const vehicle of this.drivableVehicles) {
        const id = vehicle.group.userData.saveId;
        const fuel = typeof id === 'string' ? data.vehicleFuel?.[id] : undefined;
        if (typeof fuel === 'number' && Number.isFinite(fuel)) {
          vehicle.fuel = clamp(fuel, 0, vehicle.maxFuel ?? 100);
        }
      }
    } catch (error) {
      console.error('Unable to load saved progress; saving is disabled for this session.', error);
      this.progressStorageAvailable = false;
      this.showToast('SAVE UNAVAILABLE \u00b7 PROGRESS NOT RESTORED');
    }
  }

  private saveProgress(): void {
    if (!this.progressStorageAvailable) return;
    const data: ProgressSaveData = {
      version: 1,
      money: this.money,
      loanBalance: this.loanBalance,
      missions: this.missions.snapshot(),
      lootedIds: [...this.looted],
      appearance: this.player.appearance,
      weapons: this.weapons.snapshot(),
      vehicleFuel: this.drivableVehicles.reduce<Record<string, number>>((saved, vehicle) => {
        const id = vehicle.group.userData.saveId;
        if (typeof id === 'string') saved[id] = vehicle.fuel ?? vehicle.maxFuel ?? 100;
        return saved;
      }, {})
    };
    try {
      window.localStorage.setItem(PROGRESS_SAVE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Unable to save player progress.', error);
      this.progressStorageAvailable = false;
      this.showToast('SAVE FAILED \u00b7 PROGRESS NOT SAVED');
    }
  }

  private openCashWithdrawal(spot: ServiceSpot): void {
    const amount = spot.withdrawalAmount;
    const enoughFunds = this.bankBalance >= amount;
    const body = this.bankStorageAvailable
      ? `Bank balance: \u20a6${this.bankBalance.toLocaleString('en-NG')}\nCash on hand: \u20a6${this.money.toLocaleString('en-NG')}\n\n${enoughFunds
        ? `Withdraw \u20a6${amount.toLocaleString('en-NG')} into cash?`
        : `You need \u20a6${amount.toLocaleString('en-NG')} in your account for this withdrawal.`}`
      : 'Your bank balance could not be loaded safely, so withdrawals are unavailable.';
    const options: DialogueOption[] = [];
    if (this.bankStorageAvailable && enoughFunds) {
      options.push({
        label: `WITHDRAW \u20a6${amount.toLocaleString('en-NG')}`,
        action: () => this.withdrawFromBank(spot)
      });
    }
    options.push({ label: 'CANCEL', action: () => this.closeDialogue() });
    this.showDialogue(spot.label, body, options);
  }

  private withdrawFromBank(spot: ServiceSpot): void {
    if (!this.bankStorageAvailable) {
      this.setHint('Bank withdrawals are unavailable because the account could not be saved');
      return;
    }
    const amount = spot.withdrawalAmount;
    if (this.bankBalance < amount) {
      this.setHint('Insufficient bank balance');
      this.closeDialogue();
      return;
    }

    const nextBalance = this.bankBalance - amount;
    try {
      window.localStorage.setItem(BANK_BALANCE_KEY, String(nextBalance));
    } catch (error) {
      console.error('Unable to save the bank balance; withdrawal was cancelled.', error);
      this.bankStorageAvailable = false;
      this.showToast('WITHDRAWAL FAILED · ACCOUNT NOT SAVED');
      this.closeDialogue();
      return;
    }

    this.bankBalance = nextBalance;
    this.money += amount;
    this.saveProgress();
    this.audio.pickup();
    this.showToast(`CASH WITHDRAWN · +\u20a6${amount.toLocaleString('en-NG')}`);
    this.setHint('Withdrawal complete · your bank balance has been updated');
    this.closeDialogue();
  }

  private startMission(def: MissionDef): void {
    const started = this.missions.start(def.id);
    if (!started) {
      this.setHint('That mission is not available now');
      return;
    }
    this.saveProgress();
    if (def.type === 'kill' && def.targetGroup) this.thugs.reviveGroup(def.targetGroup);
    if (def.id === 'heat') {
      this.addWanted(2);
      this.wantedDelay = 15;
    }
    this.audio.ui();
    this.showDialogue(def.title, `${def.giverLine}\n\nOBJECTIVE: ${def.objective}`, [
      { label: 'ACCEPT', action: () => this.closeDialogue() }
    ]);
  }

  private completeMission(def: MissionDef): void {
    this.money += def.rewardMoney;
    if (def.rewardWeapon) {
      const rewardAmmo = def.rewardAmmo ?? 30;
      this.weapons.unlock(def.rewardWeapon, undefined, 0);
      this.weapons.addAmmo(def.rewardWeapon, rewardAmmo);
      this.weapons.select(def.rewardWeapon);
      this.player.setArmed(true);
      this.player.setWeapon(def.rewardWeapon);
      this.weapons.addAmmo('pistol', 18);
    } else {
      this.weapons.addAmmo('pistol', def.rewardAmmo ?? 18);
    }
    this.saveProgress();
    this.audio.pickup();
    this.showToast(`MISSION COMPLETE \u00b7 ${def.title} \u00b7 +\u20a6${def.rewardMoney}`);
    this.setHint(`Mission complete: ${def.title}`);
  }

  private damagePlayer(amount: number): void {
    if (this.dead) return;
    let remaining = amount;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, remaining * 0.78);
      this.armour = Math.max(0, this.armour - absorbed);
      remaining -= absorbed;
      if (this.armour <= 0) this.showToast('ARMOUR DESTROYED');
    }
    this.sinceDamage = 0;
    this.damageFlash = Math.min(1, this.damageFlash + 0.35);
    this.audio.hurt();
    if (remaining <= 0.01) return;
    const killed = damageHealth(this.health, remaining, performance.now() / 1000);
    if (killed) this.die();
  }

  private vehicleHealthCap(car: VehicleRig): number {
    const label = car.access?.label ?? '';
    if (label === 'OKADA') return 180;
    if (label === 'SPORT CAR') return 300;
    if (label === 'LUXURY CAR') return 420;
    if (label === 'DANFO') return 480;
    if (label === 'KEKE') return 280;
    if (label === 'SEDAN') return 360;
    return 400;
  }

  private ensureVehicleHealth(car: VehicleRig): void {
    if (car.health === undefined || car.maxHealth === undefined) {
      car.maxHealth = this.vehicleHealthCap(car);
      car.health = car.maxHealth;
      car.burning = 0;
      car.wrecked = false;
    }
  }

  private damageVehicle(amount: number): void {
    const car = this.activeVehicle;
    if (!car || this.mode !== 'drive' || car.wrecked) return;
    this.ensureVehicleHealth(car);
    const maxHealth = car.maxHealth ?? this.vehicleHealthCap(car);
    car.health = Math.max(0, (car.health ?? 0) - amount);
    this.damageFlash = Math.min(0.55, this.damageFlash + 0.18);
    if (car.health <= 0 && !car.burning) {
      car.burning = 3.4;
      this.setHint('ENGINE FIRE \u00b7 GET OUT BEFORE IT BLOWS');
      this.showToast('VEHICLE CRITICAL \u00b7 ENGINE FIRE');
      this.audio.hurt();
    } else if (car.health < maxHealth * 0.35) {
      this.setHint('Car is badly damaged \u00b7 find a garage or get out');
    }
  }

  /** Crash damage for parked/owned cars that are not currently being driven. */
  private damageNpcVehicle(car: VehicleRig, amount: number): boolean {
    ensureRigHealth(car);
    if (car.wrecked) return false;
    car.health = Math.max(0, (car.health ?? 0) - amount);
    if (car.health > 0) return false;
    car.wrecked = true;
    if (car.driver) car.driver.visible = false;
    if (!car.group.userData.wreckSmoke) {
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 7, 6),
        new THREE.MeshBasicMaterial({
          color: 0x262a2e,
          transparent: true,
          opacity: 0.5,
          depthWrite: false
        })
      );
      smoke.position.set(0, 1.9, car.length / 2 - 0.55);
      smoke.scale.set(0.9, 1.5, 0.9);
      car.group.add(smoke);
      car.group.userData.wreckSmoke = smoke;
    }
    (car.group.userData.wreckSmoke as THREE.Object3D).visible = true;
    return true;
  }

  private updateVehicleFires(dt: number): void {
    for (const car of this.drivableVehicles) {
      if (!car.burning || car.burning <= 0) continue;
      car.burning -= dt;
      if (!car.wrecked) {
        // Visible flames licking out of the engine bay plus a smoke plume.
        if (!car.group.userData.fire) {
          const fire = new THREE.Group();
          for (let i = 0; i < 6; i += 1) {
            const flame = new THREE.Mesh(
              new THREE.ConeGeometry(0.24 + Math.random() * 0.18, 0.75 + Math.random() * 0.6, 7),
              new THREE.MeshBasicMaterial({
                color: i % 2 === 0 ? 0xff7a1a : 0xffc23a,
                transparent: true,
                opacity: 0.9,
                depthWrite: false
              })
            );
            flame.position.set(
              (Math.random() - 0.5) * 1.4,
              0.95 + Math.random() * 0.55,
              car.length / 2 - 0.35 + (Math.random() - 0.5) * 0.6
            );
            flame.rotation.z = (Math.random() - 0.5) * 0.4;
            fire.add(flame);
          }
          const smoke = new THREE.Mesh(
            new THREE.SphereGeometry(0.72, 8, 6),
            new THREE.MeshBasicMaterial({
              color: 0x24262a,
              transparent: true,
              opacity: 0.42,
              depthWrite: false
            })
          );
          smoke.position.set(0, 2.0, car.length / 2 - 0.5);
          smoke.scale.set(0.9, 1.5, 0.9);
          fire.add(smoke);
          car.group.add(fire);
          car.group.userData.fire = fire;
          car.group.userData.smoke = smoke;
        }
        const fire = car.group.userData.fire as THREE.Group;
        fire.visible = true;
        fire.scale.setScalar(0.88 + Math.sin(this.elapsed * 18) * 0.16);
        const smoke = car.group.userData.smoke as THREE.Mesh | undefined;
        if (smoke) {
          smoke.position.y = 1.9 + Math.sin(this.elapsed * 2.2) * 0.25;
          (smoke.material as THREE.MeshBasicMaterial).opacity =
            0.3 + Math.sin(this.elapsed * 3.1) * 0.1;
        }
      }
      if (car.burning <= 0) this.explodeVehicle(car);
    }
  }

  private explodeVehicle(car: VehicleRig): void {
    const position = car.group.position.clone();
    const fire = car.group.userData.fire as THREE.Group | undefined;
    if (fire) fire.visible = false;
    this.spawnExplosion(position);

    const wasActive = car === this.activeVehicle;
    this.drivableVehicles = this.drivableVehicles.filter((v) => v !== car);
    this.scene.remove(car.group);

    if (wasActive) {
      this.player.group.position.copy(position).add(new THREE.Vector3(1.8, 0, 0));
      const axis = Math.abs(Math.sin(car.group.rotation.y)) > 0.92 ? 'x' : 'z';
      this.player.group.position.y = this.city.groundHeightAt(
        this.player.group.position.x,
        this.player.group.position.z,
        axis,
        position.y
      );
      this.player.velocity.set(0, 0, 0);
      this.player.group.visible = true;
      this.activeVehicle = null;
      this.mode = 'foot';
      this.carSpeed = 0;
      this.damagePlayer(220);
    } else {
      const distance = this.player.group.position.distanceTo(position);
      if (distance < 11) this.damagePlayer(clamp(90 * (1 - distance / 11), 12, 90));
    }
    this.showToast('VEHICLE EXPLODED');
    this.audio.hit();
  }

  private addWanted(amount: number): void {
    if (this.dead || amount <= 0) return;
    this.wanted = clamp(this.wanted + amount, 0, 5);
    this.wantedDelay = 8;
    this.police.alert(this.policeRespondPoint());
    this.escapeNotified = false;
  }

  /** Where police should respond: the door, never the hidden interior coords. */
  private policeRespondPoint(): THREE.Vector3 {
    const site = this.activeInterior?.site;
    if (this.inside && site) {
      return new THREE.Vector3(
        site.entranceX,
        this.city.groundHeightAt(site.entranceX, site.entranceZ),
        site.entranceZ
      );
    }
    return this.player.group.position;
  }

  private updateWanted(dt: number): void {
    if (this.wanted <= 0) {
      this.wanted = 0;
      this.wasSeen = false;
      this.escapeNotified = false;
      return;
    }
    if (this.police.isSeen) {
      this.wantedDelay = Math.max(this.wantedDelay, 4);
      this.wasSeen = true;
      this.escapeNotified = false;
    } else if (this.wasSeen) {
      this.wasSeen = false;
      this.setHint('Line of sight broken \u2014 keep moving and lay low');
    }

    if (this.police.isLost && !this.escapeNotified) {
      this.escapeNotified = true;
      this.showToast('POLICE LOST YOUR TRAIL \u00b7 LAY LOW');
      this.setHint('They are searching the last place they saw you. Get further away.');
      this.audio.ui();
    }

    this.wantedDelay = Math.max(0, this.wantedDelay - dt);
    if (this.wantedDelay <= 0 && !this.police.isSeen && this.police.isCold) {
      const rate = this.police.isLost ? 0.2 : 0.075;
      this.wanted = Math.max(0, this.wanted - dt * rate);
    }
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.respawnTimer = RESPAWN_DELAY;
    this.damageFlash = 1;
    this.carSpeed = 0;
    if (this.mode === 'entering' || this.mode === 'exiting' || this.mode === 'drive') {
      if (this.activeVehicle) {
        if (this.activeVehicle.driver) this.activeVehicle.driver.visible = false;
        this.activeVehicle.doorOpen = false;
      }
      this.activeVehicle = null;
      this.mode = 'foot';
    }
    if (this.inside) {
      const result = this.interiors.exit();
      if (result) {
        this.player.group.position.copy(result.position);
        this.player.group.position.y = this.city.groundHeightAt(result.position.x, result.position.z);
      }
      this.inside = false;
      this.activeInterior = null;
    }
    this.missions.failActive();
    this.saveProgress();
    this.police.reset();
    this.wanted = 0;
    this.wantedDelay = 0;
    this.audio.siren(false);
    this.player.group.visible = true;
    this.player.velocity.set(0, 0, 0);
    this.player.setAiming(false);
    this.player.group.rotation.z = Math.PI / 2;
    this.player.group.position.y += 0.15;
    this.currentInteraction = null;
    this.currentInteriorPoint = null;
    this.input.reset();
    this.disableAllButtons();
    this.ui.death?.classList.add('open');
    if (this.ui.deathText) {
      this.ui.deathText.textContent = `Medical bill \u20a6${DEATH_FEE} \u00b7 Respawning in ${RESPAWN_DELAY.toFixed(1)}s`;
    }
  }

  private updateDeath(dt: number): void {
    this.respawnTimer -= dt;
    if (this.ui.deathText) {
      this.ui.deathText.textContent = `Medical bill \u20a6${DEATH_FEE} \u00b7 Respawning in ${Math.max(0, this.respawnTimer).toFixed(1)}s`;
    }
    if (this.respawnTimer <= 0) this.respawn();
  }

  private respawn(): void {
    if (!this.dead) return;
    this.dead = false;
    this.respawnTimer = 0;
    this.ui.death?.classList.remove('open');
    this.money = Math.max(0, this.money - DEATH_FEE);
    this.saveProgress();
    restoreHealth(this.health);
    this.player.group.rotation.z = 0;
    this.player.group.position.copy(SPAWN);
    this.player.group.position.y = this.city.groundHeightAt(SPAWN.x, SPAWN.z);
    this.player.faceYaw(Math.PI);
    this.player.velocity.set(0, 0, 0);
    this.player.resetActions();
    this.player.setArmed(true);
    this.player.setWeapon(this.weapons.current);
    this.mode = 'foot';
    this.inside = false;
    this.activeInterior = null;
    this.activeVehicle = null;
    this.carSpeed = 0;
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.camDist = 5.4;
    this.wanted = 0;
    this.wantedDelay = 0;
    this.sinceDamage = 99;
    this.armour = 0;
    this.damageFlash = 0;
    this.entryCooldown = 1;
    this.input.reset();
    this.police.reset();
    this.audio.siren(false);
    if (this.ui.flash) this.ui.flash.style.opacity = '0';
    this.setHint('Back on the street. Watch your back.');
  }

  private fireWeapon(fromVehicle: boolean): void {
    if (!this.player.armed || this.weapons.isMelee) return;
    if (!this.weapons.canFire()) {
      if (this.weapons.magazine <= 0) this.weapons.startReload();
      return;
    }
    const spec = this.weapons.spec;
    if (!this.weapons.consumeFire()) return;

    const car = fromVehicle ? this.activeVehicle : null;
    if (fromVehicle && !car) return;
    const origin = car
      ? car.group.position.clone().add(new THREE.Vector3(0, 1.35, 0))
      : this.player.getMuzzleWorldPosition();
    const forward = this.cameraForward();
    const aimPoint = this.findAimPoint(origin, forward, spec.range);
    const baseDir = aimPoint.clone().sub(origin);
    if (baseDir.lengthSq() < 0.000001) baseDir.copy(forward);
    baseDir.normalize();

    this.player.setAiming(true);
    if (!fromVehicle) this.player.shoot();
    this.audio.shot(spec.id === 'machete' ? 'melee' : spec.id);
    this.pedestrians.panic(origin, 34);

    const colliders = this.city.colliders;
    for (let i = 0; i < spec.pellets; i += 1) {
      const dir = baseDir.clone();
      if (spec.spread > 0) {
        dir.x += (Math.random() * 2 - 1) * spec.spread;
        dir.y += (Math.random() * 2 - 1) * spec.spread * 0.55;
        dir.z += (Math.random() * 2 - 1) * spec.spread;
        dir.normalize();
      }
      const wallDistance = rayWallDistance(colliders, origin, dir, spec.range);
      const reach = Math.min(spec.range, wallDistance);
      const hit = this.castAt(origin, dir, reach);
      let end: THREE.Vector3;
      if (hit) {
        hit.hit(spec.damage, dir, true);
        end = hit.point.clone();
        this.spawnImpact(end, 0xffd27a);
        this.audio.hit();
      } else {
        end = origin.clone().addScaledVector(dir, reach);
      }
      this.spawnTracer(origin, end, 0xffe9a0);
    }
  }

  private resolveMeleeImpact(): void {
    const melee = this.player.armed && this.weapons.isMelee;
    const damage = melee ? this.weapons.spec.damage : 20;
    const origin = this.player.group.position.clone();
    origin.y += 1.1;
    const dir = this.cameraForward();
    const hit = this.castAt(origin, dir, melee ? 2.4 : 1.8);
    if (hit) {
      hit.hit(damage, dir, true);
      this.spawnImpact(hit.point, 0xfff2d0);
      this.audio.hit();
      return;
    }

    const facing = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const targets: Array<{ point: THREE.Vector3; distance: number }> = [];
    const ped = this.pedestrians.punchNear(origin, facing, damage);
    if (ped) {
      targets.push({ point: ped.point, distance: ped.point.distanceTo(origin) });
    }
    const actor = this.interiors.punchNear(origin, facing, damage);
    if (actor) {
      targets.push({ point: actor.point, distance: actor.point.distanceTo(origin) });
    }
    targets.sort((a, b) => a.distance - b.distance);
    if (targets.length > 0) {
      this.spawnImpact(targets[0].point, 0xfff2d0);
      this.audio.hit();
    } else {
      this.audio.shot('melee');
    }
  }

  private castAt(origin: THREE.Vector3, dir: THREE.Vector3, range: number): CombatHit | null {
    const hits: CombatHit[] = [];
    const thugHit = this.thugs.raycast(origin, dir, range);
    if (thugHit) hits.push(thugHit);
    const policeHit = this.police.raycast(origin, dir, range);
    if (policeHit) hits.push(policeHit);
    const pedHit = this.pedestrians.raycast(origin, dir, range);
    if (pedHit) hits.push(pedHit);
    const interiorHit = this.interiors.raycast(origin, dir, range);
    if (interiorHit) hits.push(interiorHit);
    if (hits.length === 0) return null;
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0];
  }

  private findAimPoint(origin: THREE.Vector3, forward: THREE.Vector3, range: number): THREE.Vector3 {
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    const fx = forward.x;
    const fz = forward.z;

    const consider = (position: THREE.Vector3): void => {
      const dx = position.x - origin.x;
      const dz = position.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.6 || distance > range) return;
      const facing = (dx * fx + dz * fz) / distance;
      if (facing < 0.7) return;
      const score = distance * (2 - facing);
      if (score < bestScore) {
        bestScore = score;
        best = new THREE.Vector3(position.x, position.y + 1.05, position.z);
      }
    };

    for (const thug of this.thugs.list) {
      if (thug.state !== 'dead') consider(thug.position);
    }
    for (const officer of this.police.activeOfficers) {
      if (officer.state !== 'dead') consider(officer.position);
    }
    for (const ped of this.pedestrians.list) {
      if (!ped.dead) consider(ped.group.position);
    }
    for (const actor of this.interiors.activeActors) {
      if (!actor.dead) consider(actor.group.position);
    }

    if (best) return best;
    return origin.clone().addScaledVector(forward, Math.min(range, 34));
  }

  private faceAimDirection(): void {
    const origin = this.player.group.position;
    const forward = this.cameraForward();
    const from = origin.clone();
    from.y += 1.2;
    const point = this.findAimPoint(from, forward, 42);
    this.player.faceYaw(Math.atan2(point.x - origin.x, point.z - origin.z));
  }

  private cameraForward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe9a0): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09, maxLife: 0.09 });
  }

  private updateTracers(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      const material = tracer.line.material as THREE.LineBasicMaterial;
      material.opacity = Math.max(0, tracer.life / tracer.maxLife);
      if (tracer.life <= 0) {
        this.scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  private spawnImpact(at: THREE.Vector3, color = 0xfff2d0): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.impacts.push({ mesh, life: 0.28, maxLife: 0.28 });
  }

  private updateImpacts(dt: number): void {
    for (let i = this.impacts.length - 1; i >= 0; i -= 1) {
      const impact = this.impacts[i];
      impact.life -= dt;
      const material = impact.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, impact.life / impact.maxLife);
      impact.mesh.scale.setScalar(1 + (1 - impact.life / impact.maxLife) * 1.8);
      if (impact.life <= 0) {
        this.scene.remove(impact.mesh);
        impact.mesh.geometry.dispose();
        material.dispose();
        this.impacts.splice(i, 1);
      }
    }
  }

  private createBeacon(color: number): THREE.Group {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.25, 26),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.14, 7, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    beam.position.y = 3.5;
    group.add(beam);
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  private createArmourPickup(site: CitySite): ArmourPickup {
    const group = new THREE.Group();
    const x = site.entranceX - site.side * 2.4;
    const z = site.entranceZ + 3.4;
    const y = this.city.groundHeightAt(x, z);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 0.35, 10),
      new THREE.MeshStandardMaterial({ color: 0x30363c, roughness: 0.9 })
    );
    pedestal.position.y = 0.18;
    group.add(pedestal);

    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.72, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2a5ad4, roughness: 0.55, metalness: 0.2 })
    );
    vest.position.y = 0.82;
    group.add(vest);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.14, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.6 })
    );
    stripe.position.y = 0.86;
    group.add(stripe);
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.8, 20),
      new THREE.MeshBasicMaterial({
        color: 0x6a9bff,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    group.add(glow);

    group.position.set(x, y, z);
    this.scene.add(group);
    return { group, x, z, taken: false, spin: Math.random() * Math.PI * 2 };
  }

  private spawnExplosion(position: THREE.Vector3): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffa030,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    mesh.position.copy(position);
    mesh.position.y = 1.1;
    this.scene.add(mesh);
    this.explosions.push({ mesh, life: 0.75, maxLife: 0.75, radius: 7.5 });
    this.audio.hit();
    this.damageFlash = 1;
  }

  private updateExplosions(dt: number): void {
    for (let i = this.explosions.length - 1; i >= 0; i -= 1) {
      const burst = this.explosions[i];
      burst.life -= dt;
      const t = 1 - Math.max(0, burst.life) / burst.maxLife;
      const scale = 0.6 + t * burst.radius;
      burst.mesh.scale.setScalar(scale);
      const material = burst.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.9 * (1 - t));
      material.color.setHSL(0.09 - t * 0.06, 1, 0.55 - t * 0.25);
      if (burst.life <= 0) {
        this.scene.remove(burst.mesh);
        burst.mesh.geometry.dispose();
        material.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  private updateMarkers(dt: number): void {
    this.markerTime += dt;
    const active = this.missions.active;
    const next = this.missions.nextMission();

    if (active && active.type !== 'survive') {
      this.objectiveMarker.visible = true;
      this.giverMarker.visible = false;
      this.objectiveMarker.position.set(
        active.targetX,
        this.city.groundHeightAt(active.targetX, active.targetZ),
        active.targetZ
      );
    } else if (!active && next) {
      this.giverMarker.visible = true;
      this.objectiveMarker.visible = false;
      this.giverMarker.position.set(
        next.giverX,
        this.city.groundHeightAt(next.giverX, next.giverZ),
        next.giverZ
      );
    } else {
      this.objectiveMarker.visible = false;
      this.giverMarker.visible = false;
    }

    for (const marker of [this.objectiveMarker, this.giverMarker]) {
      if (!marker.visible) continue;
      marker.rotation.y += dt * 1.8;
      const beam = marker.children[1] as THREE.Mesh;
      const material = beam.material as THREE.MeshBasicMaterial;
      material.opacity = 0.2 + Math.sin(this.markerTime * 2.4) * 0.09;
    }
  }

  private resolveFootCollisions(): void {
    const position = this.player.group.position;
    const radius = this.player.crouched ? 0.28 : 0.34;
    const colliders = this.inside && this.activeInterior ? this.activeInterior.colliders : this.city.colliders;
    pushOutColliders(colliders, position, radius);
    if (!this.inside) {
      constrainPlayerToFootbridge(position, radius);
      this.resolveTrafficFoot();
      position.x = clamp(position.x, this.city.worldMinX + 1.2, this.city.worldMaxX - 1.2);
      position.z = clamp(position.z, this.city.worldMinZ + 4, this.city.worldMaxZ - 4);
    }
  }

  private applyPlayerHeight(dt = 0.016): void {
    const position = this.player.group.position;
    if (this.inside) {
      position.y = INTERIOR_GROUND + this.player.jumpOffset;
      this.swimming = false;
      return;
    }
    const axis = roadAxisForYaw(this.player.yaw);
    const groundReferenceY = position.y - this.player.jumpOffset;
    const water = this.city.waterAt(position.x, position.z, axis, groundReferenceY);
    if (water !== null) {
      if (!this.swimming) {
        this.swimming = true;
        this.player.jumpOffset = 0;
        this.showToast('SWIMMING \u00b7 KANO RIVER');
        this.setHint('You are in the river. Swim back to a jetty or the bank.');
      }
      // Chest-deep float with a gentle swell.
      position.y = water - 0.58 + Math.sin(this.elapsed * 1.7) * 0.05;
      return;
    }
    this.swimming = false;
    // Smooth the rise over steps and bridge ramps instead of snapping.
    const targetY =
      this.city.groundHeightAt(position.x, position.z, axis, groundReferenceY) + this.player.jumpOffset;
    const delta = targetY - position.y;
    if (Math.abs(delta) > 1.4) position.y = targetY;
    else position.y += delta * (1 - Math.exp(-18 * dt));
  }

  private resolveCarCollisions(): void {
    const car = this.activeVehicle;
    if (!car) return;
    const position = car.group.position;

    // People under the wheels. Fast impacts kill, slow nudges only bruise.
    const runSpeed = Math.abs(this.carSpeed);
    if (runSpeed > 3.2) {
      const result = this.pedestrians.runOver(
        position,
        car.group.rotation.y,
        car.width,
        car.length,
        runSpeed
      );
      if (result.hits > 0) {
        this.camShake = Math.min(0.95, this.camShake + 0.24 + result.hits * 0.08);
        this.audio.hit();
        for (const point of result.points) this.spawnImpact(point, 0xff5a3a);
        if (result.killed > 0) {
          this.addWanted(Math.min(4, 2 + (result.killed - 1) * 0.5));
          this.showToast(
            `${result.killed} ${result.killed === 1 ? 'PERSON' : 'PEOPLE'} RUN OVER \u00b7 POLICE ALERTED`
          );
          this.setHint('You ran somebody down. Lose the police before they box you in.');
          this.carSpeed *= 0.86;
        } else {
          this.showToast('PEDESTRIAN CLIPPED \u00b7 WATCH THE ROAD');
          this.setHint('You hit somebody. Slow down.');
        }
      }
    }

    // Officers go down exactly like civilians when a car ploughs into them.
    const officerHit = this.police.runOver(
      position,
      car.group.rotation.y,
      car.width,
      car.length,
      runSpeed
    );
    if (officerHit.hits > 0) {
      this.camShake = Math.min(0.95, this.camShake + 0.28 + officerHit.hits * 0.08);
      this.audio.hit();
      for (const point of officerHit.points) this.spawnImpact(point, 0xff5a3a);
      if (officerHit.killed > 0) {
        this.showToast(
          `${officerHit.killed} ${officerHit.killed === 1 ? 'OFFICER' : 'OFFICERS'} RUN OVER`
        );
        this.carSpeed *= 0.86;
      } else {
        this.showToast('OFFICER KNOCKED DOWN');
      }
    }

    let hitWorld = false;
    for (let pass = 0; pass < 3; pass += 1) {
      let resolvedCollision = false;
      for (const collider of this.city.colliders) {
        const obstacle = new THREE.Vector3(
          (collider.minX + collider.maxX) / 2,
          position.y,
          (collider.minZ + collider.maxZ) / 2
        );
        const overlap = vehicleOverlap(
          position,
          this.carYaw,
          car.width,
          car.length,
          obstacle,
          0,
          collider.maxX - collider.minX,
          collider.maxZ - collider.minZ
        );
        if (!overlap) continue;
        position.x += overlap.normalX * (overlap.depth + 0.02);
        position.z += overlap.normalZ * (overlap.depth + 0.02);
        resolvedCollision = true;
        hitWorld = true;
      }
      if (!resolvedCollision) break;
    }
    if (hitWorld) {
      const impactSpeed = Math.abs(this.carSpeed);
      this.carSpeed *= 0.35;
      this.registerCrash(
        impactSpeed,
        new THREE.Vector3(position.x, position.y + 0.8, position.z)
      );
    }
    position.x = clamp(position.x, this.city.worldMinX + 2, this.city.worldMaxX - 2);
    position.z = clamp(position.z, this.city.worldMinZ + 6, this.city.worldMaxZ - 6);
    this.constrainCarToBridge(car);
    const axis = roadAxisForYaw(this.carYaw);
    const water = this.city.waterAt(position.x, position.z, axis, position.y);
    if (water !== null) {
      position.y = water - 0.22;
    } else {
      position.y = this.city.deckHeightAt(position.x, position.z, axis, position.y);
    }

    this.resolveCruiserCollision();
  }

  private constrainCarToBridge(car: VehicleRig): void {
    const yaw = car.group.rotation.y;
    const halfWidthX =
      (car.width * Math.abs(Math.cos(yaw)) + car.length * Math.abs(Math.sin(yaw))) / 2;
    const halfWidthZ =
      (car.width * Math.abs(Math.sin(yaw)) + car.length * Math.abs(Math.cos(yaw))) / 2;
    constrainVehicleToBridge(car.group.position, halfWidthX, halfWidthZ);
  }

  private resolveCruiserCollision(): void {
    const car = this.activeVehicle;
    if (!car || !this.police.carAlive) return;
    const position = car.group.position;
    const cruiser = this.police.carGroup.position;
    if (Math.abs(position.y - cruiser.y) > 2.2) return;
    const dx = position.x - cruiser.x;
    const dz = position.z - cruiser.z;
    // Conservative axis-aligned test; both bodies are roughly 1.8 m x 4.4 m.
    const halfW = (car.width + 1.8) / 2 - 0.1;
    const halfL = (car.length + 4.4) / 2 - 0.2;
    if (Math.abs(dx) > halfW || Math.abs(dz) > halfL) return;

    const pvx = Math.sin(this.carYaw) * this.carSpeed;
    const pvz = Math.cos(this.carYaw) * this.carSpeed;
    const cvx = Math.sin(this.police.cruiserYaw) * this.police.cruiserSpeed;
    const cvz = Math.cos(this.police.cruiserYaw) * this.police.cruiserSpeed;
    const closing = Math.hypot(pvx - cvx, pvz - cvz);

    const px = halfW - Math.abs(dx);
    const pz = halfL - Math.abs(dz);
    if (px < pz) position.x += Math.sign(dx || 1) * px;
    else position.z += Math.sign(dz || 1) * pz;

    const at = new THREE.Vector3(
      (position.x + cruiser.x) / 2,
      0.8,
      (position.z + cruiser.z) / 2
    );
    const canDamage = this.crashCooldown <= 0;
    const damage = clamp((closing - 2.2) * 1.55, 1.5, 72);
    const destroyed = canDamage ? this.police.damageCar(damage) : false;
    this.registerCrash(closing, at);
    this.carSpeed *= closing > 10 ? 0.3 : 0.6;
    if (destroyed) {
      this.showToast('POLICE CRUISER DISABLED');
      this.setHint('You wrecked a cruiser. More units are on the way.');
    }
  }

  private resolveTrafficFoot(): void {
    const position = this.player.group.position;
    for (const vehicle of this.traffic.list) {
      const car = vehicle.rig.group.position;
      if (Math.abs(position.y - car.y) > 2.2) continue;
      if (Math.abs(position.y - car.y) > 2.2) continue;
      const dx = position.x - car.x;
      const dz = position.z - car.z;
      const halfW = vehicle.rig.width / 2 + 0.4;
      const halfL = vehicle.rig.length / 2 + 0.4;
      if (Math.abs(dx) > halfW || Math.abs(dz) > halfL) continue;
      const px = halfW - Math.abs(dx);
      const pz = halfL - Math.abs(dz);
      if (px < pz) position.x += Math.sign(dx || 1) * px;
      else position.z += Math.sign(dz || 1) * pz;
    }
    for (const vehicle of this.drivableVehicles) this.pushOutVehicle(position, vehicle);
    position.x = clamp(position.x, this.city.worldMinX + 1.2, this.city.worldMaxX - 1.2);
    position.z = clamp(position.z, this.city.worldMinZ + 4, this.city.worldMaxZ - 4);
  }

  private pushOutVehicle(position: THREE.Vector3, rig: VehicleRig): void {
    const car = rig.group.position;
    if (Math.abs(position.y - car.y) > 2.2) return;
    const dx = position.x - car.x;
    const dz = position.z - car.z;
    const cos = Math.cos(rig.group.rotation.y);
    const sin = Math.sin(rig.group.rotation.y);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const halfW = rig.width / 2 + 0.38;
    const halfL = rig.length / 2 + 0.38;
    if (Math.abs(lx) >= halfW || Math.abs(lz) >= halfL) return;
    const px = halfW - Math.abs(lx);
    const pz = halfL - Math.abs(lz);
    let nx = lx;
    let nz = lz;
    if (px < pz) nx += Math.sign(lx || 1) * px;
    else nz += Math.sign(lz || 1) * pz;
    position.x = car.x + nx * cos + nz * sin;
    position.z = car.z - nx * sin + nz * cos;
  }

  private resolveTrafficCar(): void {
    const car = this.activeVehicle;
    if (!car) return;
    const position = car.group.position;
    const playerVx = Math.sin(this.carYaw) * this.carSpeed;
    const playerVz = Math.cos(this.carYaw) * this.carSpeed;

    for (const vehicle of this.traffic.list) {
      const other = vehicle.rig.group.position;
      if (Math.abs(position.y - other.y) > 2.2) continue;
      const overlap = vehicleOverlap(
        position,
        this.carYaw,
        car.width,
        car.length,
        other,
        vehicle.rig.group.rotation.y,
        vehicle.rig.width,
        vehicle.rig.length
      );
      if (!overlap) continue;

      const otherVx = vehicle.axis === 'x' ? vehicle.dir * vehicle.speed : 0;
      const otherVz = vehicle.axis === 'z' ? vehicle.dir * vehicle.speed : 0;
      const closing = Math.hypot(playerVx - otherVx, playerVz - otherVz);

      position.x += overlap.normalX * (overlap.depth + 0.02);
      position.z += overlap.normalZ * (overlap.depth + 0.02);

      const canDamage = closing > 4.5 && this.crashCooldown <= 0;
      this.registerCrash(
        closing,
        new THREE.Vector3(
          (position.x + other.x) / 2,
          0.8,
          (position.z + other.z) / 2
        )
      );
      if (canDamage) {
        this.traffic.damage(vehicle.rig, clamp((closing - 5.5) * 0.24, 0.3, 10));
      }
      vehicle.stop = Math.max(vehicle.stop, 1.2);
      vehicle.speed *= 0.25;
      this.carSpeed *= closing > 10 ? 0.24 : 0.55;
    }

    for (const vehicle of this.drivableVehicles) {
      if (vehicle === car) continue;
      const other = vehicle.group.position;
      if (Math.abs(position.y - other.y) > 2.2) continue;
      const overlap = vehicleOverlap(
        position,
        this.carYaw,
        car.width,
        car.length,
        other,
        vehicle.group.rotation.y,
        vehicle.width,
        vehicle.length
      );
      if (!overlap) continue;
      position.x += overlap.normalX * (overlap.depth + 0.02);
      position.z += overlap.normalZ * (overlap.depth + 0.02);
      const closing = Math.hypot(playerVx, playerVz);
      const canDamage = closing > 4.5 && this.crashCooldown <= 0;
      this.registerCrash(
        closing,
        new THREE.Vector3((position.x + other.x) / 2, 0.8, (position.z + other.z) / 2)
      );
      if (canDamage && this.damageNpcVehicle(vehicle, clamp((closing - 4.5) * 0.45, 0.5, 20))) {
        this.showToast('VEHICLE WRECKED');
      }
      this.carSpeed *= 0.35;
    }
  }

  private onTrafficCrash(position: THREE.Vector3, speed: number): void {
    if (this.inside || speed < 2.4) return;
    const focus =
      this.mode === 'drive' && this.activeVehicle
        ? this.activeVehicle.group.position
        : this.player.group.position;
    const distance = Math.hypot(position.x - focus.x, position.z - focus.z);
    if (distance > 75) return;
    if (distance < 40) this.audio.hit();
    for (let i = 0; i < 2; i += 1) {
      this.spawnImpact(
        new THREE.Vector3(
          position.x + (Math.random() - 0.5) * 1.2,
          position.y + Math.random() * 0.4,
          position.z + (Math.random() - 0.5) * 1.2
        ),
        i === 0 ? 0xfff2c0 : 0xffa040
      );
    }
    if (distance < 24) {
      this.camShake = Math.min(1, this.camShake + 0.03 + speed * 0.004);
      if (speed > 9) this.pedestrians.panic(position, 14);
    }
  }

  private registerCrash(relativeSpeed: number, at: THREE.Vector3): void {
    if (this.crashCooldown > 0 || relativeSpeed < 4.5) return;
    const damage = clamp((relativeSpeed - 5.5) * 0.28, 0.35, 12);
    this.crashCooldown = 1.1;
    this.damageVehicle(damage);
    this.camShake = Math.min(1, this.camShake + 0.22 + relativeSpeed * 0.012);
    this.damageFlash = Math.min(0.6, this.damageFlash + 0.12);
    this.audio.hit();
    for (let i = 0; i < 3; i += 1) {
      this.spawnImpact(
        new THREE.Vector3(
          at.x + (Math.random() - 0.5) * 0.7,
          at.y + Math.random() * 0.45,
          at.z + (Math.random() - 0.5) * 0.7
        ),
        i === 0 ? 0xfff2c0 : 0xffa040
      );
    }
    if (relativeSpeed > 12) {
      this.setHint(`CRASH \u00b7 ${Math.round(damage)} damage \u00b7 get to a garage`);
    }
  }

  private nearestVehicleCandidate(): { vehicle: VehicleRig; distance: number } | null {
    let best: { vehicle: VehicleRig; distance: number } | null = null;
    for (const vehicle of this.drivableVehicles) {
      if (!vehicle.access) continue;
      const distance = this.vehicleDistance(vehicle);
      if (!best || distance < best.distance) best = { vehicle, distance };
    }
    const near = this.traffic.findNear(this.player.group.position, 4.2);
    if (near) {
      const distance = this.vehicleDistance(near);
      if (!best || distance < best.distance) best = { vehicle: near, distance };
    }
    return best;
  }

  private vehicleDistance(vehicle: VehicleRig): number {
    const position = this.player.group.position;
    const car = vehicle.group.position;
    const dx = position.x - car.x;
    const dz = position.z - car.z;
    const cos = Math.cos(vehicle.group.rotation.y);
    const sin = Math.sin(vehicle.group.rotation.y);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const qx = clamp(lx, -vehicle.width / 2, vehicle.width / 2);
    const qz = clamp(lz, -vehicle.length / 2, vehicle.length / 2);
    return Math.hypot(lx - qx, lz - qz);
  }

  private vehicleLocalToWorld(vehicle: VehicleRig, local: THREE.Vector3): THREE.Vector3 {
    const cos = Math.cos(vehicle.group.rotation.y);
    const sin = Math.sin(vehicle.group.rotation.y);
    return new THREE.Vector3(
      vehicle.group.position.x + local.x * cos + local.z * sin,
      vehicle.group.position.y + local.y,
      vehicle.group.position.z - local.x * sin + local.z * cos
    );
  }

  private vehicleWorldToLocal(vehicle: VehicleRig, world: THREE.Vector3): THREE.Vector3 {
    const dx = world.x - vehicle.group.position.x;
    const dz = world.z - vehicle.group.position.z;
    const cos = Math.cos(vehicle.group.rotation.y);
    const sin = Math.sin(vehicle.group.rotation.y);
    return new THREE.Vector3(dx * cos - dz * sin, 0, dx * sin + dz * cos);
  }

  private buildEntryPath(vehicle: VehicleRig, entry: THREE.Vector3): THREE.Vector3[] {
    const start = this.vehicleWorldToLocal(vehicle, this.player.group.position);
    const endZ = vehicle.length / 2 + 0.85;
    const sameSide = Math.sign(start.x || entry.x) === Math.sign(entry.x);
    const local: Array<[number, number]> = [[start.x, start.z]];

    if (sameSide) {
      if (Math.abs(start.z) > vehicle.length / 2) local.push([entry.x, start.z]);
    } else {
      const routeZ = start.z >= 0 ? endZ : -endZ;
      local.push([start.x, routeZ], [entry.x, routeZ]);
    }
    local.push([entry.x, entry.z]);

    const points: THREE.Vector3[] = [];
    for (const [x, z] of local) {
      const world = this.vehicleLocalToWorld(vehicle, new THREE.Vector3(x, 0, z));
      world.y = this.city.groundHeightAt(world.x, world.z);
      const previous = points[points.length - 1];
      if (!previous || previous.distanceToSquared(world) > 0.0001) points.push(world);
    }
    if (points.length === 0) {
      const fallback = this.vehicleLocalToWorld(vehicle, entry);
      fallback.y = this.city.groundHeightAt(fallback.x, fallback.z);
      points.push(fallback);
    }
    return points;
  }

  private sampleEntryPath(t: number): THREE.Vector3 {
    if (this.seqPath.length === 0) return this.seqDoor.clone();
    if (this.seqPath.length === 1 || this.seqWalkDistance <= 0) return this.seqPath[0].clone();

    let remaining = clamp(t, 0, 1) * this.seqWalkDistance;
    for (let i = 1; i < this.seqPath.length; i += 1) {
      const from = this.seqPath[i - 1];
      const to = this.seqPath[i];
      const length = from.distanceTo(to);
      if (remaining <= length) return from.clone().lerp(to, length > 0 ? remaining / length : 0);
      remaining -= length;
    }
    return this.seqPath[this.seqPath.length - 1].clone();
  }

  private findExitPosition(vehicle: VehicleRig): THREE.Vector3 | null {
    const car = vehicle.group.position;
    const cos = Math.cos(vehicle.group.rotation.y);
    const sin = Math.sin(vehicle.group.rotation.y);
    const side = vehicle.access && vehicle.access.entry.x < 0 ? -1 : 1;
    const doorZ = vehicle.access ? vehicle.access.entry.z : 0;

    for (const extra of [0, 0.7, 1.4]) {
      const sideW = vehicle.width / 2 + 0.95 + extra;
      const endL = vehicle.length / 2 + 0.95 + extra;
      const candidates: Array<[number, number]> = [
        [side * sideW, doorZ],
        [side * sideW, 0],
        [-side * sideW, doorZ],
        [-side * sideW, 0],
        [0, endL],
        [0, -endL]
      ];
      for (const [lx, lz] of candidates) {
        const offsetX = lx * cos + lz * sin;
        const offsetZ = -lx * sin + lz * cos;
        const x = car.x + offsetX;
        const z = car.z + offsetZ;
        const axis = Math.abs(offsetX) > Math.abs(offsetZ) ? 'x' : 'z';
        const y = this.city.groundHeightAt(x, z, axis, vehicle.group.position.y);
        if (this.isFootPositionFree(x, z, y)) {
          return new THREE.Vector3(x, y, z);
        }
      }
    }
    return null;
  }

  private isFootPositionFree(x: number, z: number, y: number): boolean {
    const radius = 0.34;
    if (x < this.city.worldMinX + 1.2 || x > this.city.worldMaxX - 1.2) return false;
    if (z < this.city.worldMinZ + 4 || z > this.city.worldMaxZ - 4) return false;
    for (const c of this.city.colliders) {
      if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) return false;
    }
    for (const vehicle of this.traffic.list) {
      if (this.vehicleBlocksPoint(x, z, vehicle.rig, radius, y)) return false;
    }
    for (const vehicle of this.drivableVehicles) {
      if (this.vehicleBlocksPoint(x, z, vehicle, radius, y)) return false;
    }
    return true;
  }

  private vehicleBlocksPoint(x: number, z: number, rig: VehicleRig, radius: number, y: number): boolean {
    const car = rig.group.position;
    if (Math.abs(y - car.y) > 2.2) return false;
    const dx = x - car.x;
    const dz = z - car.z;
    const cos = Math.cos(rig.group.rotation.y);
    const sin = Math.sin(rig.group.rotation.y);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    return Math.abs(lx) < rig.width / 2 + radius && Math.abs(lz) < rig.length / 2 + radius;
  }

  private collectOutdoorRoots(): THREE.Object3D[] {
    const roots: THREE.Object3D[] = [this.city.group];
    for (const vehicle of this.drivableVehicles) roots.push(vehicle.group);
    for (const vehicle of this.traffic.list) roots.push(vehicle.rig.group);
    roots.push(this.traffic.lightGroup);
    for (const pedestrian of this.pedestrians.list) roots.push(pedestrian.group);
    for (const thug of this.thugs.list) roots.push(thug.rig.group);
    for (const group of this.police.officerGroups) roots.push(group);
    roots.push(this.police.carGroup);
    for (const plane of this.planes.list) roots.push(plane.group);
    return roots;
  }

  private resetActionTracking(): void {
    this.player.setAiming(false);
  }

  private updateCamera(dt: number): void {
    const driving = this.mode === 'drive' || this.mode === 'entering' || this.mode === 'exiting';
    const vehicle = this.activeVehicle;
    const base = driving && vehicle ? vehicle.group.position : this.player.group.position;
    const baseY = base.y;
    const height = driving ? vehicle?.access?.cameraHeight ?? 1.75 : this.player.crouched ? 1.05 : 1.5;
    const bridgeBlend = driving && !this.inside
      ? clamp((baseY - 0.6) / 5.8, 0, 1)
      : 0;
    this.camTarget.set(base.x, baseY + height, base.z);

    const inside = this.inside;
    const isBike = driving && vehicle ? vehicle.length < 2.5 : false;
    const dist = driving
      ? clamp(
          this.camDist + bridgeBlend * 4.5 + (isBike ? 3.2 : 5),
          isBike ? 4.5 : 7,
          bridgeBlend > 0.95 ? 22 : 16
        )
      : inside
        ? clamp(this.camDist, 2.2, 3.0)
        : this.camDist;
    const pitch = clamp(this.camPitch + bridgeBlend * 0.3, -0.12, 0.82);
    const offX = Math.sin(this.camYaw) * Math.cos(pitch) * dist;
    const offY = Math.sin(pitch) * dist + (driving ? 0.25 : inside ? 0.35 : 0.65);
    const offZ = Math.cos(this.camYaw) * Math.cos(pitch) * dist;
    const desired = new THREE.Vector3(base.x + offX, Math.max(0.55, baseY + height + offY), base.z + offZ);

    if (inside && this.activeInterior) {
      const room = this.activeInterior;
      const margin = 0.55;
      desired.x = clamp(desired.x, room.center.x - room.roomW / 2 + margin, room.center.x + room.roomW / 2 - margin);
      desired.z = clamp(desired.z, room.center.z - room.roomD / 2 + margin, room.center.z + room.roomD / 2 - margin);
      desired.y = Math.min(desired.y, INTERIOR_CEILING - 0.45);
    } else {
      const ox = desired.x - base.x;
      const oz = desired.z - base.z;
      const length = Math.hypot(ox, oz);
      if (length > 0.01) {
        this.camDir.set(ox / length, 0, oz / length);
        const hit = rayWallDistance(this.cameraColliders, base, this.camDir, length);
        if (hit < length) {
          const k = Math.max(0.32, (hit - 0.3) / length);
          const lift = desired.y - (baseY + height + 0.65);
          desired.x = base.x + ox * k;
          desired.z = base.z + oz * k;
          desired.y = baseY + height + 0.65 + lift * k;
        }
      }
    }

    const damp = this.snapCameraNext ? 1 : 1 - Math.exp(-(driving ? 7 : 9) * dt);
    this.snapCameraNext = false;
    this.camPos.lerp(desired, damp);
    this.camera.position.copy(this.camPos);
    if (this.camShake > 0.001) {
      const amp = this.camShake * 0.32;
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp;
      this.camera.position.z += (Math.random() - 0.5) * amp;
    }
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + (driving ? 0.3 : 0.1), this.camTarget.z);
  }

  private setHint(text: string): void {
    if (this.hudHint) {
      this.hudHint.textContent = text;
      this.hudHint.style.opacity = '1';
      this.hintTimer = 7;
    }
  }

  private showToast(text: string): void {
    if (!this.ui.toast) return;
    this.ui.toast.textContent = text;
    this.ui.toast.classList.add('show');
    this.toastTimer = 3.2;
  }

  private showDialogue(title: string, body: string, options: DialogueOption[]): void {
    this.dialogueOpen = true;
    this.input.reset();
    this.disableAllButtons();
    if (this.ui.dialog) this.ui.dialog.classList.add('open');
    if (this.ui.dialogTitle) this.ui.dialogTitle.textContent = title;
    if (this.ui.dialogBody) this.ui.dialogBody.textContent = body;
    const actions = this.ui.dialogActions;
    if (actions) {
      actions.replaceChildren();
      for (const option of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dialog-btn';
        button.textContent = option.label;
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          option.action();
        });
        actions.append(button);
      }
    }
    this.audio.ui();
  }

  private closeDialogue(): void {
    if (!this.dialogueOpen) return;
    this.dialogueOpen = false;
    this.ui.dialog?.classList.remove('open');
    this.input.reset();
  }

  private disableAllButtons(): void {
    for (const id of ['btn-a', 'btn-b', 'btn-c', 'btn-d', 'btn-e', 'btn-f', 'btn-r', 'btn-gas', 'btn-rev']) {
      this.input.setButtonEnabled(id, false);
      this.input.setButtonActive(id, false);
    }
  }

  private updateButtonLabels(): void {
    if (this.dead || this.dialogueOpen) return;
    const input = this.input;

    if (this.siteSeq || this.mode === 'entering' || this.mode === 'exiting') {
      this.disableAllButtons();
      return;
    }

    if (this.mode === 'drive') {
      const canShoot = this.player.armed && !this.weapons.isMelee;
      input.setButtonLabel('btn-a', canShoot ? 'DRIVE-BY' : 'NO GUN');
      input.setButtonLabel(
        'btn-b',
        this.garageBayContains(this.activeVehicle)
          ? 'SERVICE'
          : this.fuelStationNearby(this.activeVehicle)
            ? 'REFUEL'
            : 'EXIT CAR'
      );
      input.setButtonLabel('btn-c', 'JUMP');
      input.setButtonLabel('btn-d', 'BRAKE');
      input.setButtonLabel('btn-e', this.player.armed ? 'PUT AWAY' : 'DRAW GUN');
      input.setButtonLabel('btn-f', 'NEXT GUN');
      input.setButtonLabel('btn-r', 'RELOAD');
      input.setButtonEnabled('btn-a', canShoot);
      input.setButtonEnabled('btn-b', true);
      input.setButtonEnabled('btn-c', false);
      input.setButtonEnabled('btn-d', true);
      input.setButtonEnabled('btn-e', true);
      input.setButtonEnabled('btn-f', true);
      input.setButtonEnabled('btn-r', true);
      input.setButtonLabel('btn-gas', 'GAS');
      input.setButtonLabel('btn-rev', 'REVERSE');
      input.setButtonEnabled('btn-gas', true);
      input.setButtonEnabled('btn-rev', true);
      input.setButtonActive('btn-a', canShoot && input.state.aHeld);
      input.setButtonActive('btn-d', input.state.dHeld || input.state.sprintHeld);
      input.setButtonActive('btn-e', this.player.armed);
      input.setButtonActive('btn-gas', input.state.gasHeld);
      input.setButtonActive('btn-rev', input.state.reverseHeld);
      return;
    }

    if (this.inside) {
      const label = this.currentInteriorPoint
        ? this.currentInteriorPoint.kind === 'exit'
          ? 'LEAVE'
          : 'INTERACT'
        : 'LOOK';
      input.setButtonLabel('btn-a', this.player.armed ? (this.weapons.isMelee ? 'SLASH' : 'FIRE') : 'PUNCH');
      input.setButtonLabel('btn-b', label);
      input.setButtonLabel('btn-c', 'JUMP');
      input.setButtonLabel('btn-d', this.player.crouched ? 'STAND' : 'CROUCH');
      input.setButtonLabel('btn-e', this.player.armed ? 'PUT AWAY' : 'DRAW GUN');
      input.setButtonLabel('btn-f', 'NEXT GUN');
      input.setButtonLabel('btn-r', 'RELOAD');
      input.setButtonEnabled('btn-a', true);
      input.setButtonEnabled('btn-b', true);
      input.setButtonEnabled('btn-c', true);
      input.setButtonEnabled('btn-d', true);
      input.setButtonEnabled('btn-e', true);
      input.setButtonEnabled('btn-f', true);
      input.setButtonEnabled('btn-r', true);
      input.setButtonActive('btn-a', this.player.aiming);
      input.setButtonActive('btn-d', this.player.crouched);
      input.setButtonActive('btn-e', this.player.armed);
      input.setButtonEnabled('btn-gas', false);
      input.setButtonActive('btn-gas', false);
      input.setButtonEnabled('btn-rev', false);
      input.setButtonActive('btn-rev', false);
      return;
    }

    const interaction = this.currentInteraction;
    const contextLabel = interaction
      ? interaction.kind === 'giver'
        ? 'TALK'
      : interaction.kind === 'fuel'
        ? 'JERRYCAN'
        : interaction.kind === 'transit'
          ? 'DANFO'
          : 'ENTER CAR'
      : 'USE';
    input.setButtonLabel('btn-a', this.player.armed ? (this.weapons.isMelee ? 'SLASH' : 'FIRE') : 'PUNCH');
    input.setButtonLabel('btn-b', contextLabel);
    input.setButtonLabel('btn-c', 'JUMP');
    input.setButtonLabel('btn-d', this.player.crouched ? 'STAND' : 'CROUCH');
    input.setButtonLabel('btn-e', this.player.armed ? 'PUT AWAY' : 'DRAW GUN');
    input.setButtonLabel('btn-f', 'NEXT GUN');
    input.setButtonLabel('btn-r', 'RELOAD');
    for (const id of ['btn-a', 'btn-b', 'btn-c', 'btn-d', 'btn-e', 'btn-f', 'btn-r']) {
      input.setButtonEnabled(id, true);
    }
    input.setButtonActive('btn-a', this.player.aiming);
    input.setButtonActive('btn-b', Boolean(interaction));
    input.setButtonActive('btn-d', this.player.crouched);
    input.setButtonActive('btn-e', this.player.armed);
    input.setButtonEnabled('btn-gas', false);
    input.setButtonActive('btn-gas', false);
    input.setButtonEnabled('btn-rev', false);
    input.setButtonActive('btn-rev', false);
  }

  private updateHud(dt: number): void {
    if (this.hudSpeed) {
      const kmh = this.mode === 'drive' ? Math.abs(this.carSpeed) * 3.6 : this.player.speed * 3.6;
      this.hudSpeed.textContent = `${Math.round(kmh)} km/h`;
    }
    if (this.hudDiag) {
      const position =
        this.mode === 'drive' && this.activeVehicle ? this.activeVehicle.group.position : this.player.group.position;
      this.hudDiag.textContent = `mode ${this.mode}${this.inside ? ' (interior)' : ''}\nfps ${Math.round(this.fps)}\npos ${position.x.toFixed(1)}, ${position.z.toFixed(1)}\nalive ${this.dead ? 'no' : 'yes'} \u00b7 hp ${Math.round(this.health.hp)} \u00b7 ap ${Math.round(this.armour)}\nwanted ${this.wanted.toFixed(1)} \u00b7 money \u20a6${this.money}\ntraffic ${this.traffic.list.length} \u00b7 peds ${this.pedestrians.aliveCount}\nthugs ${this.thugs.aliveCount} \u00b7 police ${this.police.officerCount}\nt ${this.elapsed.toFixed(1)}s`;
    }

    if (this.ui.healthFill) {
      const pct = clamp(this.health.hp / this.health.maxHp, 0, 1) * 100;
      this.ui.healthFill.style.width = `${pct}%`;
      this.ui.healthFill.classList.toggle('low', pct < 30);
    }
    if (this.ui.healthText) this.ui.healthText.textContent = `${Math.max(0, Math.ceil(this.health.hp))}`;
    if (this.ui.armourFill) {
      const pct = clamp(this.armour / 100, 0, 1) * 100;
      this.ui.armourFill.style.width = `${pct}%`;
    }
    if (this.ui.armourText) this.ui.armourText.textContent = `${Math.round(this.armour)}`;
    if (this.ui.carRow) {
      const car = this.mode === 'drive' ? this.activeVehicle : null;
      if (car) {
        this.ui.carRow.style.display = 'flex';
        const max = car.maxHealth ?? this.vehicleHealthCap(car);
        const hp = car.health ?? max;
        const pct = clamp(hp / max, 0, 1) * 100;
        if (this.ui.carFill) {
          this.ui.carFill.style.width = `${pct}%`;
          this.ui.carFill.classList.toggle('low', pct < 30);
        }
        if (this.ui.carText) this.ui.carText.textContent = `${Math.max(0, Math.ceil(hp))}`;
      } else {
        this.ui.carRow.style.display = 'none';
      }
    }
    if (this.ui.fuelRow) {
      const car = this.mode === 'drive' ? this.activeVehicle : null;
      if (car) {
        this.ui.fuelRow.style.display = 'flex';
        const capacity = car.maxFuel ?? 100;
        const fuel = clamp(car.fuel ?? capacity, 0, capacity);
        const pct = capacity > 0 ? (fuel / capacity) * 100 : 0;
        if (this.ui.fuelFill) {
          this.ui.fuelFill.style.width = `${pct}%`;
          this.ui.fuelFill.classList.toggle('low', pct < 20);
        }
        if (this.ui.fuelText) this.ui.fuelText.textContent = `${Math.floor(fuel)}`;
      } else {
        this.ui.fuelRow.style.display = 'none';
      }
    }
    if (this.ui.money) this.ui.money.textContent = `\u20a6${this.money.toLocaleString('en-NG')} CASH`;
    if (this.ui.bankBalance) {
      this.ui.bankBalance.textContent = `BANK \u20a6${this.bankBalance.toLocaleString('en-NG')}`;
    }
    if (this.ui.wanted) {
      const stars = Math.min(5, Math.floor(this.wanted));
      this.ui.wanted.textContent = '\u2605'.repeat(stars) + '\u2606'.repeat(5 - stars);
      this.ui.wanted.classList.toggle('active', stars > 0);
    }
    if (this.ui.weapon) {
      this.ui.weapon.textContent = this.player.armed ? this.weapons.spec.name.toUpperCase() : 'FISTS';
    }
    if (this.ui.ammo) {
      if (!this.player.armed) this.ui.ammo.textContent = '\u2014';
      else if (this.weapons.isMelee) this.ui.ammo.textContent = '\u221e';
      else if (this.weapons.reloading) this.ui.ammo.textContent = 'RELOADING';
      else this.ui.ammo.textContent = `${this.weapons.magazine} / ${this.weapons.reserve}`;
    }

    const active = this.missions.active;
    const next = this.missions.nextMission();
    if (this.ui.objectiveTitle && this.ui.objectiveBody) {
      if (active) {
        this.ui.objectiveTitle.textContent = active.title.toUpperCase();
        let body = active.objective;
        const progress = this.missions.progressText();
        if (progress) body += ` \u00b7 ${progress}`;
        if (this.inside) body += ' \u00b7 Leave the building';
        else if (active.type !== 'survive') {
          const distance = Math.hypot(
            this.player.group.position.x - active.targetX,
            this.player.group.position.z - active.targetZ
          );
          body += ` \u00b7 ${Math.round(distance)}m`;
        }
        this.ui.objectiveBody.textContent = body;
      } else if (next) {
        this.ui.objectiveTitle.textContent = `NEXT: ${next.title.toUpperCase()}`;
        this.ui.objectiveBody.textContent = `Talk to ${next.giverName} \u00b7 \u20a6${next.rewardMoney} reward`;
      } else {
        this.ui.objectiveTitle.textContent = 'ALL MISSIONS COMPLETE';
        this.ui.objectiveBody.textContent = 'The streets are yours.';
      }
    }

    let promptText = '';
    if (!this.dead && !this.dialogueOpen) {
      if (this.mode === 'drive' && this.garageBayContains(this.activeVehicle)) {
        promptText = this.garageServiceReady(this.activeVehicle)
          ? 'B  SERVICE VEHICLE · ₦150'
          : 'STOP INSIDE GARAGE · B SERVICE';
      } else if (this.mode === 'drive' && this.garageEntranceNear(this.activeVehicle)) {
        promptText = 'GARAGE AHEAD · DRIVE INSIDE TO SERVICE';
      } else if (this.mode === 'drive' && this.fuelStationNearby(this.activeVehicle)) {
        promptText = Math.abs(this.carSpeed) <= 1.4
          ? 'B  REFUEL AT NNPC STATION'
          : 'STOP AT THE PUMP · B REFUEL';
      } else if (this.mode === 'drive' && this.fuelStationApproaching(this.activeVehicle)) {
        promptText = 'NNPC STATION AHEAD · SLOW DOWN TO REFUEL';
      } else if (this.inside && this.currentInteriorPoint) {
        promptText = `B  ${this.currentInteriorPoint.label}`;
      } else if (!this.inside && this.currentInteraction) {
        const interaction = this.currentInteraction;
        if (interaction.kind === 'giver' && interaction.mission) {
          promptText = `B  TALK TO ${interaction.mission.giverName.toUpperCase()}`;
        } else if (interaction.kind === 'person' && interaction.person) {
          promptText = `B  TALK TO ${interaction.person.name.toUpperCase()}`;
        } else if (interaction.kind === 'site' && interaction.site) {
          promptText = `B  OPEN DOOR \u00b7 ${interaction.site.label}`;
        } else if (interaction.kind === 'fuel') {
          promptText = 'B  BUY JERRYCAN FOR NEARBY VEHICLE';
        } else if (interaction.kind === 'transit') {
          promptText = `B  DANFO ROUTE · ₦${DANFO_FARE}`;
        } else if (interaction.kind === 'rail') {
          promptText = `B  BOARD TRAIN · ₦${TRAIN_FARE}`;
        } else if (interaction.kind === 'armour') {
          promptText = 'B  TAKE ARMOUR VEST';
        } else if (interaction.kind === 'vehicle' && interaction.vehicle?.access) {
          const hijack = this.traffic.contains(interaction.vehicle);
          promptText = `B  ${hijack ? 'HIJACK' : 'ENTER'} THE ${interaction.vehicle.access.label}`;
        }
      }
    }
    if (this.ui.prompt) {
      this.ui.prompt.textContent = promptText;
      this.ui.prompt.classList.toggle('visible', Boolean(promptText));
    }

    if (this.ui.zone) {
      this.ui.zone.textContent = this.inside && this.activeInterior
        ? this.activeInterior.site.label
        : this.city.districtAt(this.player.group.position.x, this.player.group.position.z);
    }
    if (this.ui.locationSub) {
      this.ui.locationSub.textContent = this.inside ? 'INTERIOR' : 'KANO';
    }

    if (this.ui.signal) {
      const info = this.inside ? null : this.traffic.nearestSignal(this.player.group.position);
      if (info && info.distance < 60) {
        this.ui.signal.classList.add('visible');
        this.ui.signal.dataset.state = info.state;
        if (this.ui.signalState) this.ui.signalState.textContent = info.state.toUpperCase();
        if (this.ui.signalCount) this.ui.signalCount.textContent = `${Math.max(0, Math.ceil(info.remaining))}`;
      } else {
        this.ui.signal.classList.remove('visible');
      }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.ui.toast?.classList.remove('show');
    }

    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6);
      if (this.ui.flash) this.ui.flash.style.opacity = String(this.damageFlash * 0.7);
    }

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0 && this.hudHint) this.hudHint.style.opacity = '0';
    }
  }

  private setWorldMapOpen(open: boolean): void {
    this.worldMapOpen = open;
    this.worldMapElement?.classList.toggle('open', open);
    this.worldMapElement?.setAttribute('aria-hidden', String(!open));
    if (open) {
      this.input.reset();
      this.drawWorldMap();
    }
  }

  private updateMapDestinationLabel(): void {
    const label = document.getElementById('map-destination');
    if (!label) return;
    label.textContent = this.pinnedWaypoint
      ? `PINNED · ${this.city.districtAt(this.pinnedWaypoint.x, this.pinnedWaypoint.z)}`
      : 'Tap anywhere to pin a destination';
  }

  private mapToWorld(px: number, py: number, width: number, height: number): THREE.Vector3 {
    const { left, top, scale } = this.worldMapTransform(width, height);
    return new THREE.Vector3(
      THREE.MathUtils.clamp(this.city.worldMinX + (px - left) / scale, this.city.worldMinX, this.city.worldMaxX),
      0,
      THREE.MathUtils.clamp(this.city.worldMaxZ - (py - top) / scale, this.city.worldMinZ, this.city.worldMaxZ)
    );
  }

  private worldMapTransform(
    width: number,
    height: number
  ): { left: number; top: number; scale: number; mapWidth: number; mapHeight: number } {
    const padding = 34;
    const scale =
      Math.min(
        (width - padding * 2) / (this.city.worldMaxX - this.city.worldMinX),
        (height - padding * 2) / (this.city.worldMaxZ - this.city.worldMinZ)
      ) * this.worldMapZoom;
    const mapWidth = (this.city.worldMaxX - this.city.worldMinX) * scale;
    const mapHeight = (this.city.worldMaxZ - this.city.worldMinZ) * scale;
    return {
      left: (width - mapWidth) / 2 + this.worldMapPanX,
      top: (height - mapHeight) / 2 + this.worldMapPanY,
      scale,
      mapWidth,
      mapHeight
    };
  }

  private constrainWorldMapPan(width: number, height: number): void {
    const padding = 34;
    const scale =
      Math.min(
        (width - padding * 2) / (this.city.worldMaxX - this.city.worldMinX),
        (height - padding * 2) / (this.city.worldMaxZ - this.city.worldMinZ)
      ) * this.worldMapZoom;
    const mapWidth = (this.city.worldMaxX - this.city.worldMinX) * scale;
    const mapHeight = (this.city.worldMaxZ - this.city.worldMinZ) * scale;
    const maxPanX = Math.max(0, (mapWidth - width) / 2 + padding);
    const maxPanY = Math.max(0, (mapHeight - height) / 2 + padding);
    this.worldMapPanX = clamp(this.worldMapPanX, -maxPanX, maxPanX);
    this.worldMapPanY = clamp(this.worldMapPanY, -maxPanY, maxPanY);
  }

  private drawWorldMap(): void {
    const ctx = this.worldMapCtx;
    if (!ctx) return;
    const { width, height } = ctx.canvas;
    const { left, top, scale, mapWidth, mapHeight } = this.worldMapTransform(width, height);
    const point = (x: number, z: number): [number, number] => [
      left + (x - this.city.worldMinX) * scale,
      top + (this.city.worldMaxZ - z) * scale
    ];
    const rect = (x0: number, x1: number, z0: number, z1: number, color: string): void => {
      const [x, y] = point(x0, z1);
      const [right, bottom] = point(x1, z0);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, right - x, bottom - y);
    };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#102b3a';
    ctx.fillRect(0, 0, width, height);
    rect(this.city.worldMinX, WEST_DISTRICT_MIN_X, this.city.worldMinZ, this.city.worldMaxZ, '#173b4d');
    rect(WEST_DISTRICT_MIN_X, WEST_DISTRICT_MAX_X, this.city.worldMinZ, this.city.worldMaxZ, '#65705c');
    rect(WEST_DISTRICT_MAX_X, WEST_SHORE_X, this.city.worldMinZ, this.city.worldMaxZ, '#173b4d');
    rect(WEST_SHORE_X, this.city.river.minX, this.city.worldMinZ, this.city.worldMaxZ, '#777665');
    rect(this.city.river.minX, this.city.river.maxX, this.city.worldMinZ, this.city.worldMaxZ, '#327481');
    rect(this.city.river.maxX, this.city.worldMaxX, this.city.worldMinZ, this.city.worldMaxZ, '#777665');

    for (const building of this.city.buildings) {
      rect(building.minX, building.maxX, building.minZ, building.maxZ, '#39443f');
    }

    ctx.lineCap = 'round';
    for (const roadX of [-ROAD_HALF, ROAD_HALF, ...this.city.sideRoads, CAUSEWAY_X]) {
      const half = roadX === CAUSEWAY_X ? CAUSEWAY_HALF_W : roadX === 0 || Math.abs(roadX) === ROAD_HALF
        ? ROAD_HALF
        : roadHalfFor(roadX);
      rect(roadX - half, roadX + half, this.city.worldMinZ, this.city.worldMaxZ, '#555d62');
    }
    for (const crossZ of this.city.crossZs) {
      rect(this.city.worldMinX, this.city.worldMaxX, crossZ - CROSS_HALF, crossZ + CROSS_HALF, '#555d62');
    }
    const [railStartX, railStartY] = point(EAST_ROAD_X, this.city.worldMinZ);
    const [railEndX, railEndY] = point(EAST_ROAD_X, this.city.worldMaxZ);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#79c7a2';
    ctx.lineWidth = Math.max(2, scale * 1.4);
    ctx.beginPath();
    ctx.moveTo(railStartX, railStartY);
    ctx.lineTo(railEndX, railEndY);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 210, 74, 0.45)';
    ctx.lineWidth = Math.max(1, scale * 0.5);
    for (const crossing of HIGH_BRIDGE_CROSSINGS) {
      const [x1, y] = point(HIGH_BRIDGE_WEST_END_X, crossing);
      const [x2] = point(HIGH_BRIDGE_EAST_END_X, crossing);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }

    const districtLabelPositions: Array<[number, number]> = [];
    for (const district of this.city.districts) {
      if (district.radius < 88) continue;
      const [x, y] = point(district.x, district.z);
      if (districtLabelPositions.some(([px, py]) => Math.hypot(x - px, y - py) < 70)) continue;
      districtLabelPositions.push([x, y]);
      ctx.font = '700 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      const labelWidth = ctx.measureText(district.name.toUpperCase()).width + 10;
      ctx.fillStyle = 'rgba(17, 26, 29, 0.76)';
      ctx.fillRect(x - labelWidth / 2, y - 9, labelWidth, 14);
      ctx.fillStyle = 'rgba(235, 231, 211, 0.82)';
      ctx.fillText(district.name.toUpperCase(), x, y);
    }

    for (const site of this.city.sites) {
      const [x, y] = point(site.x, site.z);
      drawEnterableSiteMapIcon(ctx, site, x, y, 16, this.worldMapZoom >= 2);
    }
    for (const stop of this.city.transitStops) {
      const [x, y] = point(stop.x, stop.z + 12);
      drawTransitMapIcon(ctx, stop, x, y, 15, this.worldMapZoom >= 2);
    }
    for (const station of this.city.railStations) {
      const [x, y] = point(station.x, station.z);
      drawRailMapIcon(ctx, station, x, y, 15, this.worldMapZoom >= 2);
    }

    const player = this.mode === 'drive' && this.activeVehicle
      ? this.activeVehicle.group.position
      : this.player.group.position;
    const [playerX, playerY] = point(player.x, player.z);
    if (this.pinnedWaypoint) {
      const [pinX, pinY] = point(this.pinnedWaypoint.x, this.pinnedWaypoint.z);
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(255, 107, 91, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(playerX, playerY);
      ctx.lineTo(pinX, pinY);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ff6b5b';
      ctx.beginPath();
      ctx.arc(pinX, pinY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff4e9';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff4e9';
      ctx.font = '700 11px Segoe UI, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('DESTINATION', pinX + 12, pinY + 4);
    }

    const heading = this.mode === 'drive' ? this.carYaw : this.player.yaw;
    ctx.save();
    ctx.translate(playerX, playerY);
    ctx.rotate(heading);
    ctx.fillStyle = '#55e18c';
    ctx.strokeStyle = '#0a1712';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-7, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(7, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(225, 233, 223, 0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, mapWidth, mapHeight);
    ctx.textAlign = 'center';
    ctx.font = '700 11px Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(244, 240, 229, 0.8)';
    ctx.fillText('N', width - 28, top + 16);
    ctx.strokeStyle = 'rgba(244, 240, 229, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width - 28, top + 20);
    ctx.lineTo(width - 28, top + 34);
    ctx.stroke();
    const scaleLength = 100 * scale;
    ctx.strokeStyle = 'rgba(244, 240, 229, 0.72)';
    ctx.beginPath();
    ctx.moveTo(left + 12, top + mapHeight - 14);
    ctx.lineTo(left + 12 + scaleLength, top + mapHeight - 14);
    ctx.moveTo(left + 12, top + mapHeight - 18);
    ctx.lineTo(left + 12, top + mapHeight - 10);
    ctx.moveTo(left + 12 + scaleLength, top + mapHeight - 18);
    ctx.lineTo(left + 12 + scaleLength, top + mapHeight - 10);
    ctx.stroke();
    ctx.font = '600 9px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244, 240, 229, 0.72)';
    ctx.fillText('100 m', left + 18 + scaleLength, top + mapHeight - 11);
  }

  private drawMinimap(): void {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const size = 180;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(10, 16, 22, 0.94)';
    ctx.fillRect(0, 0, size, size);

    const interior = this.interiors.activeInterior;
    if (this.inside && interior) {
      ctx.fillStyle = 'rgba(90, 120, 110, 0.22)';
      ctx.fillRect(24, 34, 132, 112);
      ctx.strokeStyle = 'rgba(255, 210, 74, 0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 34, 132, 112);
      const centerX = 90;
      const centerY = 90;
      ctx.fillStyle = '#5ad45a';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
      ctx.fill();
      const exitPoint = interior.points.find((p) => p.kind === 'exit');
      if (exitPoint) {
        const ex = centerX + (exitPoint.position.x - interior.center.x) * 7;
        const ey = centerY - (exitPoint.position.z - interior.center.z) * 7;
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(ex - 3, ey - 3, 6, 6);
      }
      ctx.strokeStyle = 'rgba(255, 210, 74, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size - 2, size - 2);
      return;
    }

    const worldX = this.mode === 'drive' && this.activeVehicle
      ? this.activeVehicle.group.position.x
      : this.player.group.position.x;
    const worldZ = this.mode === 'drive' && this.activeVehicle
      ? this.activeVehicle.group.position.z
      : this.player.group.position.z;
    const scale = 0.52;
    const map = (x: number, z: number): [number, number] => {
      const dx = x - worldX;
      const dz = z - worldZ;
      return [size / 2 + dx * scale, size / 2 - dz * scale];
    };

    const poly = (x0: number, x1: number, z0: number, z1: number, color: string): void => {
      const corners = [map(x0, z0), map(x1, z0), map(x1, z1), map(x0, z1)];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath();
      ctx.fill();
    };

    const far = (x: number, z: number, range: number): boolean =>
      Math.hypot(x - worldX, z - worldZ) > range;

    // Sea and the developed west-bank district beyond the causeway.
    poly(this.city.worldMinX, WEST_DISTRICT_MIN_X, this.city.worldMinZ, this.city.worldMaxZ, '#173b4d');
    poly(WEST_DISTRICT_MIN_X, WEST_DISTRICT_MAX_X, this.city.worldMinZ, this.city.worldMaxZ, '#58614f');
    poly(WEST_DISTRICT_MAX_X, WEST_SHORE_X, this.city.worldMinZ, this.city.worldMaxZ, '#173b4d');

    // The river cuts the map in two; bridges read as road over blue.
    poly(
      this.city.river.minX,
      this.city.river.maxX,
      this.city.river.minZ,
      this.city.river.maxZ,
      '#2f6d78'
    );

    // Buildings give the map its real shape.
    for (const b of this.city.buildings) {
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      if (far(cx, cz, 180)) continue;
      poly(b.minX, b.maxX, b.minZ, b.maxZ, '#243230');
    }

    // Roads: boulevard, avenues, ring roads and cross streets.
    poly(-ROAD_HALF, ROAD_HALF, this.city.worldMinZ, this.city.worldMaxZ, '#5b6168');
    for (const sx of this.city.sideRoads) {
      const half = roadHalfFor(sx);
      poly(sx - half, sx + half, this.city.worldMinZ, this.city.worldMaxZ, '#4d535a');
    }
    poly(
      CAUSEWAY_X - CAUSEWAY_HALF_W,
      CAUSEWAY_X + CAUSEWAY_HALF_W,
      this.city.worldMinZ,
      this.city.worldMaxZ,
      '#4d535a'
    );
    for (const cz of this.city.crossZs) {
      poly(this.city.worldMinX, this.city.worldMaxX, cz - CROSS_HALF, cz + CROSS_HALF, '#4d535a');
    }
    poly(EAST_ROAD_X - 0.65, EAST_ROAD_X + 0.65, this.city.worldMinZ, this.city.worldMaxZ, '#4d8da8');

    // Centre lines.
    poly(-0.25, 0.25, this.city.worldMinZ, this.city.worldMaxZ, '#c9b35c');
    for (const cz of this.city.crossZs) {
      poly(this.city.worldMinX, this.city.worldMaxX, cz - 0.2, cz + 0.2, '#9a8b4c');
    }

    for (const site of this.city.sites) {
      if (far(site.x, site.z, 170)) continue;
      const [siteX, siteY] = map(site.x, site.z);
      drawEnterableSiteMapIcon(ctx, site, siteX, siteY, 10, false);
    }
    for (const stop of this.city.transitStops) {
      if (far(stop.x, stop.z + 12, 170)) continue;
      const [stopX, stopY] = map(stop.x, stop.z + 12);
      drawTransitMapIcon(ctx, stop, stopX, stopY, 9, false);
    }
    for (const station of this.city.railStations) {
      if (far(station.x, station.z, 170)) continue;
      const [stationX, stationY] = map(station.x, station.z);
      drawRailMapIcon(ctx, station, stationX, stationY, 10, false);
    }

    for (const pickup of this.armourPickups) {
      if (pickup.taken || far(pickup.x, pickup.z, 170)) continue;
      const [ax, ay] = map(pickup.x, pickup.z);
      ctx.fillStyle = '#6a9bff';
      ctx.fillRect(ax - 2, ay - 2, 4, 4);
    }

    for (const vehicle of this.traffic.list) {
      if (far(vehicle.rig.group.position.x, vehicle.rig.group.position.z, 140)) continue;
      const [vx, vy] = map(vehicle.rig.group.position.x, vehicle.rig.group.position.z);
      ctx.fillStyle = '#d8d4c8';
      ctx.beginPath();
      ctx.arc(vx, vy, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const vehicle of this.drivableVehicles) {
      if (far(vehicle.group.position.x, vehicle.group.position.z, 140)) continue;
      const [vx, vy] = map(vehicle.group.position.x, vehicle.group.position.z);
      ctx.fillStyle = vehicle === this.activeVehicle ? '#ffd24a' : '#d08a25';
      ctx.fillRect(vx - 2, vy - 2, 4, 4);
    }

    const objective = this.missions.objectivePosition();
    if (this.missions.active && objective) {
      let [ox, oy] = map(objective.x, objective.z);
      const d = Math.hypot(ox - size / 2, oy - size / 2);
      if (d > 78) {
        ox = size / 2 + ((ox - size / 2) / d) * 78;
        oy = size / 2 + ((oy - size / 2) / d) * 78;
      }
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, 5 + Math.sin(this.markerTime * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    const next = this.missions.nextMission();
    if (!this.missions.active && next) {
      let [gx, gy] = map(next.giverX, next.giverZ);
      const d = Math.hypot(gx - size / 2, gy - size / 2);
      if (d > 78) {
        gx = size / 2 + ((gx - size / 2) / d) * 78;
        gy = size / 2 + ((gy - size / 2) / d) * 78;
      }
      ctx.fillStyle = '#5ad45a';
      ctx.beginPath();
      ctx.arc(gx, gy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.pinnedWaypoint) {
      const [pinX, pinY] = map(this.pinnedWaypoint.x, this.pinnedWaypoint.z);
      const edgeX = clamp(pinX, 8, size - 8);
      const edgeY = clamp(pinY, 8, size - 8);
      ctx.save();
      ctx.beginPath();
      ctx.rect(2, 2, size - 4, size - 4);
      ctx.clip();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(255, 107, 91, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2);
      ctx.lineTo(edgeX, edgeY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff6b5b';
      ctx.beginPath();
      ctx.arc(edgeX, edgeY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff4e9';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Keep north fixed and rotate the player marker to show the true heading.
    const heading = this.mode === 'drive' ? this.carYaw : this.player.yaw;
    ctx.fillStyle = '#5ad45a';
    ctx.strokeStyle = 'rgba(8, 14, 10, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5.5, 5.5);
    ctx.lineTo(5.5, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = this.wanted >= 1 ? 'rgba(255, 80, 60, 0.75)' : 'rgba(255, 210, 74, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function roadAxisForYaw(yaw: number): 'x' | 'z' {
  return Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)) ? 'x' : 'z';
}

function drawGarageMapIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#172126';
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = Math.max(1, size * 0.075);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#fff0bd';
  ctx.lineWidth = Math.max(1.4, size * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-size * 0.08, size * 0.35);
  ctx.lineTo(-size * 0.08, -size * 0.05);
  ctx.moveTo(-size * 0.3, -size * 0.28);
  ctx.quadraticCurveTo(-size * 0.08, -size * 0.08, size * 0.14, -size * 0.28);
  ctx.lineTo(size * 0.27, -size * 0.42);
  ctx.stroke();

  ctx.fillStyle = '#f0d878';
  ctx.fillRect(size * 0.12, -size * 0.03, size * 0.25, size * 0.42);
  ctx.fillRect(size * 0.18, -size * 0.19, size * 0.16, size * 0.12);
  ctx.fillStyle = '#d7e8e4';
  ctx.fillRect(size * 0.2, size * 0.06, size * 0.09, size * 0.12);
  ctx.restore();
}

const SITE_MAP_COLORS: Record<CitySite['kind'], string> = {
  hotel: '#d9a85d',
  club: '#c879ee',
  police: '#74a7ff',
  market: '#e6b64f',
  school: '#77d4c3',
  hospital: '#ff7770',
  garage: '#ffd24a',
  restaurant: '#f08c62',
  shop: '#f5d274',
  house: '#b7c58a',
  fuel: '#ffb15c'
};

const SITE_MAP_GLYPHS: Record<CitySite['kind'], string> = {
  hotel: 'H',
  club: 'C',
  police: 'P',
  market: 'M',
  school: 'S',
  hospital: '+',
  garage: 'G',
  restaurant: 'R',
  shop: '$',
  house: 'R',
  fuel: 'F'
};

function drawEnterableSiteMapIcon(
  ctx: CanvasRenderingContext2D,
  site: CitySite,
  x: number,
  y: number,
  size: number,
  showLabel: boolean
): void {
  if (site.kind === 'garage') {
    drawGarageMapIcon(ctx, x, y, size);
  } else {
    const color = site.id === 'lapo-office' ? '#38bc83' : SITE_MAP_COLORS[site.kind];
    const glyph = site.id === 'lapo-office' ? 'L' : SITE_MAP_GLYPHS[site.kind];
    ctx.save();
    ctx.fillStyle = '#172126';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.09);
    ctx.beginPath();
    ctx.arc(x, y, size * 0.56, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.max(7, size * 0.78)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y + 0.5);
    ctx.restore();
  }

  if (!showLabel) return;
  ctx.save();
  ctx.font = '700 9px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelWidth = ctx.measureText(site.label).width + 8;
  const labelY = y + size * 0.72 + 7;
  ctx.fillStyle = 'rgba(17, 26, 29, 0.9)';
  ctx.fillRect(x - labelWidth / 2, labelY - 6, labelWidth, 12);
  ctx.fillStyle = '#f4f0e5';
  ctx.fillText(site.label, x, labelY);
  ctx.restore();
}

function drawTransitMapIcon(
  ctx: CanvasRenderingContext2D,
  stop: TransitStop,
  x: number,
  y: number,
  size: number,
  showLabel: boolean
): void {
  ctx.save();
  ctx.fillStyle = '#17364b';
  ctx.strokeStyle = '#78c6ef';
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.beginPath();
  ctx.arc(x, y, size * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#d6f1ff';
  ctx.font = `700 ${Math.max(7, size * 0.78)}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('D', x, y + 0.5);
  ctx.restore();

  if (!showLabel) return;
  ctx.save();
  ctx.font = '700 9px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelWidth = ctx.measureText(stop.label).width + 8;
  const labelY = y + size * 0.72 + 7;
  ctx.fillStyle = 'rgba(17, 26, 29, 0.9)';
  ctx.fillRect(x - labelWidth / 2, labelY - 6, labelWidth, 12);
  ctx.fillStyle = '#d6f1ff';
  ctx.fillText(stop.label, x, labelY);
  ctx.restore();
}

function drawRailMapIcon(
  ctx: CanvasRenderingContext2D,
  station: RailStation,
  x: number,
  y: number,
  size: number,
  showLabel: boolean
): void {
  ctx.save();
  ctx.fillStyle = '#174437';
  ctx.strokeStyle = '#85d9b0';
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.beginPath();
  ctx.roundRect(x - size * 0.62, y - size * 0.48, size * 1.24, size * 0.96, size * 0.24);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e4fff0';
  ctx.font = `700 ${Math.max(7, size * 0.72)}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', x, y + 0.5);
  ctx.restore();

  if (!showLabel) return;
  ctx.save();
  ctx.font = '700 9px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelWidth = ctx.measureText(station.label).width + 8;
  const labelY = y + size * 0.72 + 7;
  ctx.fillStyle = 'rgba(17, 26, 29, 0.9)';
  ctx.fillRect(x - labelWidth / 2, labelY - 6, labelWidth, 12);
  ctx.fillStyle = '#e4fff0';
  ctx.fillText(station.label, x, labelY);
  ctx.restore();
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
