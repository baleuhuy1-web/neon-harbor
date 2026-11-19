// Cars: a small box-built mesh factory (sedans, a hatch, an SUV, a sports car and
// the police interceptor) and an arcade Vehicle with throttle, steering, damage
// and smoke. Anything that moves on wheels in Puerto Solano is one of these.
import * as THREE from 'three';
import { CAR_KINDS } from './config.js';
import { clamp } from './random.js';

/** One shared soft disc texture for damage smoke. */
let smokeTexture = null;
function getSmokeTexture() {
  if (smokeTexture) return smokeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(40,40,40,0.55)');
  grad.addColorStop(1, 'rgba(40,40,40,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  smokeTexture = new THREE.CanvasTexture(canvas);
  return smokeTexture;
}

const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.25, metalness: 0.6 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb9c1c9, roughness: 0.35, metalness: 0.8 });

/**
 * Build the mesh for one car kind. Returns the group plus the moving parts the
 * Vehicle animates: wheels, brake light material and the police light bar.
 */
export function buildCarMesh(kind, color) {
  const spec = CAR_KINDS[kind];
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const lower = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.length), paintMat);
  lower.position.y = 0.32 + spec.height / 2;
  lower.castShadow = true;
  body.add(lower);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width * 0.82, spec.cabinHeight, spec.length * (spec.sport ? 0.42 : 0.5)),
    kind === 'police' ? paintMat : glassMat,
  );
  cabin.position.set(0, 0.32 + spec.height + spec.cabinHeight / 2, spec.sport ? -spec.length * 0.06 : 0);
  cabin.castShadow = true;
  body.add(cabin);
  if (kind === 'police') {
    const glassBand = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.84, spec.cabinHeight * 0.55, spec.length * 0.5), glassMat);
    glassBand.position.copy(cabin.position);
    body.add(glassBand);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.02, 0.22, spec.length * 0.96), new THREE.MeshStandardMaterial({ color: 0x14202e, roughness: 0.5 }));
    stripe.position.y = 0.62;
    body.add(stripe);
  }
  if (spec.sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.92, 0.07, 0.4), paintMat);
    spoiler.position.set(0, 1.02, -spec.length / 2 + 0.25);
    body.add(spoiler);
  }

  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe9a8, emissiveIntensity: 1.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.7 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    head.position.set(side * spec.width * 0.32, 0.62, spec.length / 2 + 0.01);
    body.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.06), tailMat);
    tail.position.set(side * spec.width * 0.32, 0.68, -spec.length / 2 - 0.01);
    body.add(tail);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wheelX = spec.width / 2 - 0.05;
  const wheelZ = spec.length / 2 - 0.85;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hub = new THREE.Group();
    hub.position.set(sx * wheelX, 0.34, sz * wheelZ);
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 8).rotateZ(Math.PI / 2), chromeMat);
    hub.add(tire, cap);
    group.add(hub);
    wheels.push(hub);
  }

  let lightBar = null;
  if (kind === 'police') {
    lightBar = new THREE.Group();
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 0.34), tireMat);
    barBase.position.y = 0.05;
    lightBar.add(barBase);
    const redMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.2 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2266ff, emissiveIntensity: 2.4 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.3), redMat);
    red.position.set(-0.3, 0.16, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.3), blueMat);
    blue.position.set(0.3, 0.16, 0);
    lightBar.add(red, blue);
    lightBar.position.set(0, 0.32 + spec.height + spec.cabinHeight + 0.02, 0);
    group.add(lightBar);
    lightBar.userData = { redMat, blueMat };
  }

  const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSmokeTexture(), transparent: true, opacity: 0 }));
  smoke.scale.set(1.6, 1.2, 1);
  smoke.position.set(0, 1.15, spec.length * 0.28);
  group.add(smoke);

  return { group, body, wheels, tailMat, lightBar, smoke };
}

/** An arcade car: position and heading on the ground plane, speed along it. */
export class Vehicle {
  constructor(kind, color, x, z, heading) {
    this.kind = kind;
    this.spec = CAR_KINDS[kind];
    const parts = buildCarMesh(kind, color);
    this.group = parts.group;
    this.bodyGroup = parts.body;
    this.wheels = parts.wheels;
    this.tailMat = parts.tailMat;
    this.lightBar = parts.lightBar;
    this.smoke = parts.smoke;
    this.group.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.damage = 0;
    this.radius = Math.max(this.spec.length, this.spec.width) / 2;
    this.braking = false;
    this.flashPhase = Math.random() * Math.PI * 2;
  }

  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }
  get health() { return 100 - this.damage; }

  /** The unit forward vector for the current heading. */
  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /** Add damage (0..100 scale) from a crash or gunfire. */
  hurt(amount) {
    this.damage = clamp(this.damage + amount, 0, 100);
  }

  /**
   * One physics step. control: { throttle: -1..1, steer: -1..1, brake, handbrake }.
   * Returns the distance travelled this step.
   */
  update(dt, control) {
    const spec = this.spec;
    const throttle = control.throttle || 0;
    if (control.brake && this.speed > 0.5) {
      this.speed -= 26 * dt;
    } else if (throttle !== 0) {
      const power = throttle > 0 ? spec.accel : spec.accel * 0.55;
      this.speed += throttle * power * dt * (1 - Math.abs(this.speed) / (spec.topSpeed * 1.25));
    }
    const drag = control.handbrake ? 2.6 : 0.35;
    this.speed -= this.speed * drag * dt;
    if (!control.brake && throttle === 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.6 * dt);
    const maxReverse = -9;
    this.speed = clamp(this.speed, maxReverse, spec.topSpeed * (this.damage > 80 ? 0.45 : 1));
    this.braking = Boolean(control.brake) || throttle < 0;

    this.steer = clamp(control.steer || 0, -1, 1);
    if (Math.abs(this.speed) > 0.05) {
      const authority = this.steer * spec.grip * (Math.abs(this.speed) / (Math.abs(this.speed) + 7));
      this.heading += authority * dt * Math.sign(this.speed) * (control.handbrake ? 1.35 : 1);
    }
    const f = this.forward();
    this.group.position.x += f.x * this.speed * dt;
    this.group.position.z += f.z * this.speed * dt;
    this.group.rotation.y = this.heading;

    // Wheels spin and steer; the body leans a little into corners and throttle.
    const spin = (this.speed * dt) / 0.34;
    for (let i = 0; i < 4; i += 1) {
      const wheel = this.wheels[i];
      wheel.children[0].rotation.x += spin;
      wheel.children[1].rotation.x += spin;
      if (i < 2) wheel.rotation.y = this.steer * 0.42;
    }
    this.bodyGroup.rotation.z = -this.steer * clamp(Math.abs(this.speed) / 30, 0, 1) * 0.05;
    this.bodyGroup.rotation.x = clamp(-throttle * 0.012 + (this.braking ? 0.02 : 0), -0.03, 0.035);
    this.tailMat.emissiveIntensity = this.braking ? 2.4 : 0.7;

    // Damage smoke thickens as the car falls apart.
    const target = this.damage > 45 ? clamp((this.damage - 45) / 60, 0.12, 0.8) : 0;
    const mat = this.smoke.material;
    mat.opacity += (target - mat.opacity) * Math.min(1, dt * 3);
    if (mat.opacity > 0.02) {
      const s = 1.4 + Math.sin(performance.now() * 0.004 + this.flashPhase) * 0.25 + this.damage / 90;
      this.smoke.scale.set(s, s * 0.8, 1);
    }

    // Police light bar strobes.
    if (this.lightBar) {
      const phase = Math.floor(performance.now() / 280 + this.flashPhase) % 2 === 0;
      this.lightBar.userData.redMat.emissiveIntensity = phase ? 2.6 : 0.15;
      this.lightBar.userData.blueMat.emissiveIntensity = phase ? 0.15 : 2.6;
    }
    return Math.abs(this.speed * dt);
  }

  /** Keep the car inside the world and off the deep water. */
  clampToWorld(edge) {
    this.group.position.x = clamp(this.group.position.x, -edge, edge);
    this.group.position.z = clamp(this.group.position.z, -edge, edge + 34);
  }
}
