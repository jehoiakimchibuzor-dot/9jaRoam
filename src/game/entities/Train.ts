import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { City, EAST_ROAD_X, ROAD_LENGTH } from '../world/City';

const RAIL_HEIGHT = 6.6;
const RAIL_START = -ROAD_LENGTH / 2 + 24;
const RAIL_END = ROAD_LENGTH / 2 - 24;
const RAIL_SPACING = 2.4;
const TRAIN_END_MARGIN = 18;

const shellMaterial = new THREE.MeshStandardMaterial({
  color: 0xe7e5d8,
  roughness: 0.48,
  metalness: 0.22
});
const blueMaterial = new THREE.MeshStandardMaterial({
  color: 0x155279,
  roughness: 0.42,
  metalness: 0.25
});
const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x162c3c,
  roughness: 0.16,
  metalness: 0.35
});
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x25292d, roughness: 0.88 });
const railMaterial = new THREE.MeshStandardMaterial({
  color: 0x89949b,
  roughness: 0.42,
  metalness: 0.7
});

interface MovingTrain {
  group: THREE.Group;
  direction: number;
  z: number;
  speed: number;
}

export class TrainService {
  private readonly trains: MovingTrain[] = [];

  constructor(private scene: THREE.Scene, private city: City) {
    this.buildTrack();
    this.buildStations();
    this.trains.push(
      { group: this.makeTrain(), direction: 1, z: RAIL_START + 44, speed: 13 },
      { group: this.makeTrain(), direction: -1, z: RAIL_END - 84, speed: 13 }
    );
    for (const train of this.trains) scene.add(train.group);
  }

  update(dt: number): void {
    for (const train of this.trains) {
      train.z += train.direction * train.speed * dt;
      if (train.z >= RAIL_END - TRAIN_END_MARGIN) {
        train.z = RAIL_END - TRAIN_END_MARGIN;
        train.direction = -1;
      } else if (train.z <= RAIL_START + TRAIN_END_MARGIN) {
        train.z = RAIL_START + TRAIN_END_MARGIN;
        train.direction = 1;
      }
      train.group.position.set(EAST_ROAD_X, RAIL_HEIGHT, train.z);
      train.group.rotation.y = train.direction > 0 ? 0 : Math.PI;
    }
  }

  private buildTrack(): void {
    const track = new THREE.Group();
    const length = RAIL_END - RAIL_START;
    const railGeo = new THREE.BoxGeometry(0.16, 0.18, length);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMaterial);
      rail.position.set(side * RAIL_SPACING / 2, RAIL_HEIGHT - 0.1, (RAIL_START + RAIL_END) / 2);
      rail.castShadow = true;
      rail.receiveShadow = true;
      track.add(rail);
    }

    const sleeperGeo = new THREE.BoxGeometry(3.8, 0.2, 0.52);
    const sleeperMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5144, roughness: 0.92 });
    const sleeperCount = Math.floor(length / 2.6);
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMaterial, sleeperCount);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < sleeperCount; i += 1) {
      position.set(EAST_ROAD_X, RAIL_HEIGHT - 0.24, RAIL_START + i * 2.6);
      matrix.compose(position, quaternion, scale);
      sleepers.setMatrixAt(i, matrix);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    track.add(sleepers);

    const pillarGeo = new THREE.BoxGeometry(0.9, RAIL_HEIGHT - 0.6, 0.9);
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x777d7d, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const count = Math.floor(length / 42);
      const pillars = new THREE.InstancedMesh(pillarGeo, pillarMaterial, count);
      for (let i = 0; i < count; i += 1) {
        position.set(EAST_ROAD_X + side * 11.4, (RAIL_HEIGHT - 0.6) / 2, RAIL_START + i * 42);
        matrix.compose(position, quaternion, scale);
        pillars.setMatrixAt(i, matrix);
      }
      pillars.instanceMatrix.needsUpdate = true;
      track.add(pillars);
    }
    this.scene.add(track);
  }

  private buildStations(): void {
    for (const station of this.city.railStations) {
      const group = new THREE.Group();
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(19, 0.48, 25),
        new THREE.MeshStandardMaterial({ color: 0x71777a, roughness: 0.87 })
      );
      platform.position.set(station.x, RAIL_HEIGHT - 0.95, station.z);
      platform.receiveShadow = true;
      group.add(platform);

      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(17, 0.24, 18),
        new THREE.MeshStandardMaterial({ color: 0x244b59, roughness: 0.62, metalness: 0.16 })
      );
      canopy.position.set(station.x, RAIL_HEIGHT + 2.7, station.z);
      group.add(canopy);

      for (const side of [-1, 1]) {
        const support = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 3.0, 0.34),
          railMaterial
        );
        support.position.set(station.x + side * 7.7, RAIL_HEIGHT + 0.9, station.z);
        group.add(support);

        if (side === 1) {
          for (let step = 0; step < 17; step += 1) {
            const progress = step / 16;
            const stair = new THREE.Mesh(
              new THREE.BoxGeometry(0.54, 0.18, 1.5),
              new THREE.MeshStandardMaterial({ color: 0x9ca1a1, roughness: 0.8 })
            );
            stair.position.set(
              station.accessX + (station.x + side * 7.7 - station.accessX) * progress,
              0.18 + step * 0.34,
              station.accessZ - progress * 8
            );
            group.add(stair);
          }
        }
      }

      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 1.05, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x173b4c, roughness: 0.7 })
      );
      sign.position.set(station.accessX, 2.3, station.accessZ);
      group.add(sign);
      const label = this.makeLabel(station.label);
      label.position.set(station.accessX, 2.3, station.accessZ + 0.12);
      group.add(label);
      this.scene.add(group);
    }
  }

  private makeTrain(): THREE.Group {
    const train = new THREE.Group();
    for (const offset of [-6.1, 6.1]) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(
        new RoundedBoxGeometry(3.0, 2.25, 11.5, 3, 0.22),
        shellMaterial
      );
      body.position.y = 1.0;
      body.castShadow = true;
      body.receiveShadow = true;
      car.add(body);

      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(2.94, 0.48, 10.9),
        blueMaterial
      );
      lower.position.set(0, 0.38, 0);
      car.add(lower);

      for (let side of [-1, 1]) {
        for (let window = 0; window < 5; window += 1) {
          const pane = new THREE.Mesh(
            new THREE.BoxGeometry(0.045, 0.92, 1.28),
            glassMaterial
          );
          pane.position.set(side * 1.51, 1.2, -4.25 + window * 1.72);
          car.add(pane);
        }
      }

      for (const z of [-3.6, 3.6]) {
        const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 1.1), darkMaterial);
        bogie.position.set(0, -0.15, z);
        car.add(bogie);
        for (const side of [-1, 1]) {
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.38, 0.16, 12),
            darkMaterial
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(side * 1.38, -0.22, z);
          car.add(wheel);
        }
      }
      const headlight = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.22, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xffe6a3 })
      );
      headlight.position.set(0, 0.72, 5.77);
      car.add(headlight);
      const tailLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.2, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xe94335 })
      );
      tailLight.position.set(0, 0.72, -5.77);
      car.add(tailLight);
      car.position.z = offset;
      train.add(car);
    }
    return train;
  }

  private makeLabel(text: string): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create rail station sign canvas');
    context.fillStyle = '#173b4c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f2e7c7';
    context.font = 'bold 42px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 0.82), material);
    return sign;
  }
}
