// Marco Reyes, the player character: a jointed figure who walks and sprints
// through Puerto Solano, climbs into any car left unlocked, and carries the
// little pistol Sal gave him. Driving itself lives in vehicles.js.
import * as THREE from 'three';
import { buildPersonMesh } from './pedestrians.js';
import { collideCircle } from './city.js';
import { clamp, turnToward } from './random.js';

const MARCO = {
  skin: [0xc98d5f],
  shirt: [0x0f7a6d],
  pants: [0x23262e],
};

export class Player {
  constructor(scene, rng, x, z, heading) {
    const parts = buildPersonMesh(rng, MARCO);
    this.group = parts.group;
    this.parts = parts;
    // A baseball cap and the pistol in his right hand mark Marco out of a crowd.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.18, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: 0xd64541, roughness: 0.8 }),
    );
    cap.position.y = 1.7;
    this.group.add(cap);
    this.gun = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5, metalness: 0.6 }));
    grip.position.y = -0.06;
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.35, metalness: 0.7 }));
    slide.position.set(0, 0.03, 0.06);
    this.gun.add(grip, slide);
    this.gun.position.set(0.31, 0.78, 0.1);
    this.gun.visible = false;
    this.group.add(this.gun);

    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.heading = heading;
    this.health = 100;
    this.walkPhase = 0;
    this.speedNow = 0;
    this.car = null;
    this.aiming = false;
  }

  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }
  get inCar() { return this.car !== null; }

  /** Where the world should consider Marco to be (his car, when he drives). */
  focusPos() {
    if (this.car) return { x: this.car.x, z: this.car.z };
    return { x: this.x, z: this.z };
  }

  hurt(amount) {
    this.health = clamp(this.health - amount, 0, 100);
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, 100);
  }

  /** Step into a car: Marco vanishes into the driver's seat. */
  enterCar(vehicle) {
    this.car = vehicle;
    this.group.visible = false;
  }

  /** Step out beside the driver's door and become visible again. */
  exitCar() {
    if (!this.car) return;
    const side = { x: Math.cos(this.car.heading), z: -Math.sin(this.car.heading) };
    this.group.position.set(this.car.x + side.x * 1.8, 0, this.car.z + side.z * 1.8);
    this.heading = this.car.heading;
    this.car = null;
    this.group.visible = true;
  }

  /**
   * On-foot movement: WASD relative to the camera, Shift to sprint.
   * moveInput: { x: strafe -1..1, z: forward -1..1, sprint }.
   */
  updateOnFoot(dt, moveInput, cameraYaw, colliders) {
    const moving = moveInput.x !== 0 || moveInput.z !== 0;
    const sprint = moveInput.sprint && moveInput.z > 0;
    const speed = sprint ? 8.4 : 4.9;
    if (moving) {
      const len = Math.hypot(moveInput.x, moveInput.z) || 1;
      const lx = moveInput.x / len;
      const lz = moveInput.z / len;
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      // Camera right is (-cos, sin); camera forward is (sin, cos).
      const wx = -lx * cos + lz * sin;
      const wz = lx * sin + lz * cos;
      const pos = this.group.position;
      pos.x += wx * speed * dt;
      pos.z += wz * speed * dt;
      const resolved = collideCircle(pos.x, pos.z, 0.5, colliders);
      pos.x = resolved.x;
      pos.z = resolved.z;
      pos.x = clamp(pos.x, -150, 150);
      pos.z = clamp(pos.z, -150, 178);
      if (!this.aiming) {
        this.heading = turnToward(this.heading, Math.atan2(wx, wz), dt * 11);
      }
      this.speedNow = speed;
      this.walkPhase += dt * speed * 2.1;
    } else {
      this.speedNow = 0;
    }
    if (this.aiming) {
      this.heading = turnToward(this.heading, cameraYaw, dt * 14);
    }
    this.group.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * (this.speedNow > 6 ? 0.8 : 0.55) * (moving ? 1 : 0);
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.7;
    // The right arm holds the pistol up while aiming, and swings otherwise.
    this.parts.armR.rotation.x = this.aiming ? -1.35 : swing * 0.7;
    this.gun.visible = this.aiming;
    if (this.aiming) {
      this.gun.rotation.x = 0;
      this.gun.position.z = 0.16;
    }
  }
}
