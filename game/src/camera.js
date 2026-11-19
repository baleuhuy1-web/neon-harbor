// The camera rig: an over-the-shoulder orbit on foot, a chase camera behind
// the car that widens with speed, a slow harbour orbit behind the title
// screen, and a posed mode the screenshot scenes drive directly.
// Convention: a yaw angle a means looking along (sin a, cos a).
import * as THREE from 'three';
import { clamp, lerp } from './random.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.smoothed = new THREE.Vector3(0, 30, 180);
    this.lookTarget = new THREE.Vector3();
    this.baseFov = 62;
    camera.position.copy(this.smoothed);
  }

  /** Mouse look: right turns the view right, down raises the camera. */
  applyMouse(dx, dy) {
    this.yaw -= dx * 0.0026;
    this.pitch = clamp(this.pitch + dy * 0.0021, -0.1, 1.05);
  }

  /** Place the camera instantly (shot scenes, respawns). */
  snapTo(position, lookAt) {
    this.smoothed.copy(position);
    this.camera.position.copy(position);
    this.lookTarget.copy(lookAt);
    this.camera.lookAt(lookAt);
  }

  /** On foot: hover behind Marco at the yaw the mouse has chosen. */
  updateFoot(dt, playerPos) {
    const dist = 6.4;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const desired = new THREE.Vector3(
      playerPos.x - fx * dist * Math.cos(this.pitch),
      playerPos.y + 1.7 + Math.sin(this.pitch) * dist,
      playerPos.z - fz * dist * Math.cos(this.pitch),
    );
    this.follow(dt, desired, new THREE.Vector3(playerPos.x + fx * 2, playerPos.y + 1.55, playerPos.z + fz * 2), 14);
    this.setFov(62);
  }

  /** Driving: sit behind the car, a little wider and wilder as speed builds. */
  updateCar(dt, car) {
    const speedRatio = clamp(Math.abs(car.speed) / car.spec.topSpeed, 0, 1);
    const back = 8.6 + speedRatio * 2.6;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const desired = new THREE.Vector3(
      car.x - fx * back,
      3.1 + speedRatio * 0.5,
      car.z - fz * back,
    );
    // Keep the chase camera off the ground and out of the sea haze.
    desired.y = Math.max(desired.y, 1.4);
    this.follow(dt, desired, new THREE.Vector3(car.x + fx * 7, 1.2, car.z + fz * 7), 7);
    this.setFov(62 + speedRatio * 11);
    this.yaw = car.heading;
  }

  /** Behind the title screen: a slow circle over the harbour. */
  updateOrbit(dt, center, time) {
    const angle = time * 0.05;
    const desired = new THREE.Vector3(
      center.x + Math.sin(angle) * 105,
      40 + Math.sin(time * 0.13) * 5,
      center.z + Math.cos(angle) * 105,
    );
    this.follow(dt, desired, new THREE.Vector3(center.x, 6, center.z), 3);
    this.setFov(58);
  }

  /** Exponential smoothing toward the desired position and look target. */
  follow(dt, desired, lookAt, rate) {
    const k = 1 - Math.exp(-rate * dt);
    this.smoothed.lerp(desired, k);
    this.lookTarget.lerp(lookAt, k);
    this.camera.position.copy(this.smoothed);
    this.camera.lookAt(this.lookTarget);
  }

  setFov(fov) {
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, fov, 0.2);
      this.camera.updateProjectionMatrix();
    }
  }
}
