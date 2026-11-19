// Pedestrians: low-poly people who stroll the sidewalks block by block, cross
// at corners, and run screaming from gunfire, crashes and fast cars. One who is
// hit goes down; whether he gets up again depends on how hard he was hit.
import * as THREE from 'three';
import { BLOCK_CENTERS, BLOCK_SIZE } from './config.js';
import { clamp } from './random.js';
import { collideCircle } from './city.js';

const SKIN_TONES = [0xf2c79b, 0xc98d5f, 0x8a5a33, 0x6e4226];
const SHIRTS = [0xe8e3d8, 0x3f7fbf, 0xbf3f5e, 0x3fbf7a, 0xe0a52e, 0x7a4fbf, 0x2e2e38, 0xe67e22];
const PANTS = [0x2c3550, 0x4a3b2c, 0x22242a, 0x5c6650, 0x743c2c];

/** A jointed little person; limbs are returned so the walk cycle can swing them. */
export function buildPersonMesh(rng, palette) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: rng.pick(palette.skin), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: rng.pick(palette.shirt), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: rng.pick(palette.pants), roughness: 0.9 });
  const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.19);
  legGeo.translate(0, -0.39, 0);
  const armGeo = new THREE.BoxGeometry(0.13, 0.68, 0.15);
  armGeo.translate(0, -0.3, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.8, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.8, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.24), shirt);
  torso.position.y = 1.11;
  torso.castShadow = true;
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.31, 1.38, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.31, 1.38, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
  head.position.y = 1.58;
  head.castShadow = true;
  group.add(legL, legR, torso, armL, armR, head);
  return { group, legL, legR, armL, armR, head, torso };
}

const PALETTE = { skin: SKIN_TONES, shirt: SHIRTS, pants: PANTS };

export class Pedestrian {
  constructor(scene, rng) {
    this.rng = rng;
    const parts = buildPersonMesh(rng, PALETTE);
    this.group = parts.group;
    this.parts = parts;
    scene.add(this.group);
    this.health = 100;
    this.state = 'walk';
    this.walkPhase = rng.range(0, 6);
    this.fleeTimer = 0;
    this.downTimer = 0;
    this.threat = { x: 0, z: 0 };
    this.blockX = rng.pick(BLOCK_CENTERS);
    this.blockZ = rng.pick(BLOCK_CENTERS);
    this.corner = rng.int(0, 3);
    const p = this.cornerPoint(this.blockX, this.blockZ, this.corner);
    this.group.position.set(p.x, 0.36, p.z);
    this.target = this.cornerPoint(this.blockX, this.blockZ, (this.corner + 1) % 4);
    this.heading = 0;
  }

  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }

  /** The four sidewalk corners of a block, just outside its slab. */
  cornerPoint(bx, bz, corner) {
    const o = BLOCK_SIZE / 2 + 1.6;
    const offsets = [[-o, -o], [o, -o], [o, o], [-o, o]];
    const [ox, oz] = offsets[corner];
    return { x: bx + ox, z: bz + oz };
  }

  /** Run away from a frightening point (a gunshot, a crash, a car on the sidewalk). */
  fleeFrom(x, z) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeTimer = this.rng.range(2.5, 4);
    this.threat.x = x;
    this.threat.z = z;
  }

  /** Knocked down by a car or shot: falls, and may not get up. Returns true if killed. */
  knockDown(damage) {
    this.health -= damage;
    this.state = 'down';
    this.downTimer = this.health > 0 ? this.rng.range(4, 7) : 9999;
    return this.health <= 0;
  }

  /** Heal back up over time while walking around. */
  recover(dt) {
    if (this.state === 'walk' && this.health < 100) this.health = Math.min(100, this.health + dt * 2);
  }

  update(dt, colliders, playerPos) {
    const pos = this.group.position;
    // Too far from the action: quietly reappear on a sidewalk nearer the player.
    if (Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z) > 230 && this.state !== 'down') {
      this.blockX = BLOCK_CENTERS.reduce((a, b) => (Math.abs(b - playerPos.x) < Math.abs(a - playerPos.x) ? b : a));
      this.blockZ = BLOCK_CENTERS.reduce((a, b) => (Math.abs(b - playerPos.z) < Math.abs(a - playerPos.z) ? b : a));
      const p = this.cornerPoint(this.blockX, this.blockZ, this.rng.int(0, 3));
      pos.set(p.x, 0.36, p.z);
      this.target = this.cornerPoint(this.blockX, this.blockZ, this.rng.int(0, 3));
      this.state = 'walk';
    }

    let speed = 0;
    if (this.state === 'down') {
      this.group.rotation.x = Math.max(-Math.PI / 2, this.group.rotation.x - dt * 5);
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.state = 'walk';
        this.group.rotation.x = 0;
        this.health = Math.max(this.health, 35);
      }
    } else if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.state = 'walk';
      const away = Math.atan2(pos.x - this.threat.x, pos.z - this.threat.z);
      this.heading = away;
      speed = 4.4;
    } else {
      const dx = this.target.x - pos.x;
      const dz = this.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) {
        this.chooseNextTarget();
      } else {
        this.heading = Math.atan2(dx, dz);
        speed = 1.45;
      }
    }

    if (speed > 0) {
      pos.x += Math.sin(this.heading) * speed * dt;
      pos.z += Math.cos(this.heading) * speed * dt;
      const resolved = collideCircle(pos.x, pos.z, 0.4, colliders);
      pos.x = resolved.x;
      pos.z = resolved.z;
      this.walkPhase += dt * speed * 3.4;
    }
    this.group.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * (speed > 2 ? 0.75 : 0.5);
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.8;
    this.recover(dt);
  }

  /** At a corner: walk on around the block, or cross the avenue to the next one. */
  chooseNextTarget() {
    const rng = this.rng;
    if (rng.chance(0.22)) {
      // Cross: aim at the facing corner of the block across the street.
      const across = this.cornerPoint(this.blockX, this.blockZ, this.corner);
      const stepX = Math.sign(across.x) * 0; // crossing handled by corner geometry below
      void stepX;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dz] = rng.pick(dirs);
      const nx = this.blockX + dx * 58;
      const nz = this.blockZ + dz * 58;
      if (BLOCK_CENTERS.includes(nx) && BLOCK_CENTERS.includes(nz)) {
        this.blockX = nx;
        this.blockZ = nz;
        this.corner = rng.int(0, 3);
        this.target = this.cornerPoint(nx, nz, this.corner);
        return;
      }
    }
    this.corner = (this.corner + 1) % 4;
    this.target = this.cornerPoint(this.blockX, this.blockZ, this.corner);
  }
}

/** The crowd: a fixed pool of pedestrians updated together. */
export class PedestrianCrowd {
  constructor(scene, rng, count) {
    this.peds = [];
    for (let i = 0; i < count; i += 1) this.peds.push(new Pedestrian(scene, rng));
  }

  update(dt, colliders, playerPos) {
    for (const ped of this.peds) ped.update(dt, colliders, playerPos);
  }

  /** Everyone within radius of the point panics away from it. */
  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (Math.hypot(ped.x - x, ped.z - z) < radius) ped.fleeFrom(x, z);
    }
  }
}
