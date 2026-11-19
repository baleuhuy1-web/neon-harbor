// Sal Moreno's jobs: a four-mission story chain (fetch the Vireo, deliver the
// Meridian, beat the Harbor Run clock, run the Hot Package) and, once the
// story is done, endless courier work. The manager owns the gold beacon the
// player follows and the objective text the HUD shows.
import * as THREE from 'three';
import { GARAGE_POS } from './config.js';

/** Story cars the game world must park and register with bindStoryCar. */
export const STORY_CARS = [
  { mission: 0, kind: 'vireo', color: 0xf2b035, x: 20, z: 122.5, heading: Math.PI / 2 },
  { mission: 1, kind: 'meridian', color: 0x2e6fd8, x: -40, z: -122.5, heading: -Math.PI / 2 },
];

const PIER_GATE = { x: 0, z: 140 };
const PIER_PARKING = { x: 14, z: 133 };

const MISSIONS = [
  {
    title: 'First Wheels',
    reward: 500,
    intro: 'Sal: "My gold Vireo is parked on Harbor Avenue. Take it to the pier — a buyer wants to look it over."',
    steps: [
      { type: 'reachCar', text: "Get into Sal's gold Vireo on Harbor Avenue" },
      { type: 'driveTo', pos: PIER_PARKING, radius: 8, requiresCar: true, text: 'Drive the Vireo to the pier parking' },
    ],
  },
  {
    title: 'Special Delivery',
    reward: 900,
    intro: 'Sal: "A client left a blue Meridian on the north avenue. Bring it to my garage by the east side — paint intact, Marco."',
    steps: [
      { type: 'reachCar', text: 'Pick up the blue Meridian on the north avenue' },
      { type: 'deliverTo', pos: GARAGE_POS, radius: 9, minHealth: 50, text: "Deliver the Meridian to Sal's garage — keep it above 50% condition" },
    ],
  },
  {
    title: 'Harbor Run',
    reward: 1200,
    intro: 'Sal: "Prove you can drive. Six checkpoints around the bay, one clock. Any wheels you like."',
    steps: [
      {
        type: 'checkpoints',
        points: [
          { x: 58, z: 116 }, { x: 116, z: 58 }, { x: 116, z: -58 },
          { x: 58, z: -116 }, { x: -58, z: -116 }, { x: -116, z: 0 },
        ],
        timeLimit: 95,
        text: 'Hit every checkpoint before the clock runs out',
      },
    ],
  },
  {
    title: 'Hot Package',
    reward: 1800,
    intro: 'Sal: "A package waits at the pier gate with your name on it. The harbor police will want a word. Lose them, then bring it home."',
    steps: [
      { type: 'driveTo', pos: PIER_GATE, radius: 7, text: 'Pick up the package at the pier gate', pickupHeat: 3 },
      { type: 'escape', text: 'Lose the police' },
      { type: 'driveTo', pos: GARAGE_POS, radius: 9, text: "Bring the package to Sal's garage" },
    ],
  },
];

export class MissionManager {
  /**
   * events: { onToast(title, sub), onCash(amount, label), onForceStars(n),
   * onProgress(missionIndex), onPickup(), onFail(text) }.
   */
  constructor(scene, events, startIndex = 0) {
    this.events = events;
    this.missionIndex = startIndex;
    this.stepIndex = 0;
    this.storyCars = new Map();
    this.stepTimer = 0;
    this.checkpointIndex = 0;
    this.courier = null;
    this.lastPlayerPos = { x: 0, z: 0 };
    this.announced = false;

    // The beacon: a pillar of gold light with a ring and a bobbing diamond.
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    pillar.position.y = 17;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.1, 28),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    this.diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85),
      new THREE.MeshBasicMaterial({ color: 0xffd76a }),
    );
    this.diamond.position.y = 4.4;
    this.beacon.add(pillar, ring, this.diamond);
    scene.add(this.beacon);
  }

  /** Register the parked story car for a mission index. */
  bindStoryCar(missionIndex, vehicle) {
    this.storyCars.set(missionIndex, vehicle);
  }

  /** The car the current step revolves around, if any. */
  markedCar() {
    return this.storyCars.get(this.missionIndex) || null;
  }

  get chainDone() {
    return this.missionIndex >= MISSIONS.length;
  }

  get mission() {
    return this.chainDone ? this.courier : MISSIONS[this.missionIndex];
  }

  get step() {
    const m = this.mission;
    return m ? m.steps[this.stepIndex] : null;
  }

  /** Announce the current mission once (intro toast + sting handled by events). */
  announceIfNeeded() {
    if (this.announced) return;
    this.announced = true;
    const m = this.mission;
    if (m) this.events.onToast(m.title, m.intro);
  }

  /** The world position the beacon and minimap should point at, or null. */
  currentMarker() {
    const step = this.step;
    if (!step) return null;
    if (step.type === 'reachCar') {
      const car = this.markedCar();
      return car ? { x: car.x, z: car.z } : null;
    }
    if (step.type === 'checkpoints') return step.points[this.checkpointIndex] || null;
    if (step.type === 'escape') return null;
    return step.pos || null;
  }

  /** HUD objective line: title, instruction, and distance or clock if any. */
  objective(playerPos) {
    const m = this.mission;
    if (!m) return { title: 'Free Roam', text: 'Puerto Solano is yours. Sal has no work right now.', extra: '' };
    const step = this.step;
    let extra = '';
    const marker = this.currentMarker();
    if (marker) {
      const d = Math.hypot(marker.x - playerPos.x, marker.z - playerPos.z);
      extra = `${Math.round(d)} m`;
    }
    if (step && step.type === 'checkpoints') {
      extra = `Checkpoint ${this.checkpointIndex + 1}/${step.points.length} — ${Math.max(0, Math.ceil(step.timeRemaining))}s`;
    }
    return { title: m.title, text: step ? step.text : '', extra };
  }

  /** Start the current step's clocks and counters. */
  beginStep() {
    const step = this.step;
    this.stepTimer = 0;
    this.checkpointIndex = 0;
    if (step && step.type === 'checkpoints') step.timeRemaining = step.timeLimit;
  }

  /** Advance to the next step, or finish the mission. */
  advance() {
    const m = this.mission;
    this.stepIndex += 1;
    if (this.stepIndex >= m.steps.length) {
      this.completeMission();
    } else {
      this.beginStep();
    }
  }

  /** Pay out, save progress, and roll into the next job. */
  completeMission() {
    const m = this.mission;
    this.events.onCash(m.reward, m.title);
    if (this.chainDone) {
      this.events.onToast('Courier run done', `+$${m.reward}. Sal finds you more work.`);
      this.makeCourier();
    } else {
      this.events.onToast('Job done — ' + m.title, `+$${m.reward}. Sal is pleased.`);
      this.missionIndex += 1;
      this.events.onProgress(this.missionIndex);
      if (this.chainDone) this.makeCourier();
    }
    this.stepIndex = 0;
    this.announced = false;
    this.beginStep();
    this.announceIfNeeded();
  }

  /** Generate a repeatable courier job once the story chain is finished. */
  makeCourier() {
    const spots = [
      { x: 116, z: 116 }, { x: -116, z: -116 }, { x: 116, z: -116 }, { x: -116, z: 116 },
      { x: 0, z: -116 }, { x: -116, z: 0 }, { x: 116, z: 0 }, { x: 0, z: 133 },
    ];
    const pos = spots[Math.floor(Math.random() * spots.length)];
    const dist = Math.hypot(pos.x - this.lastPlayerPos.x, pos.z - this.lastPlayerPos.z);
    this.courier = {
      title: 'Courier Run',
      reward: Math.round(140 + dist * 1.6),
      intro: 'Sal: "Another parcel, another address. Drive it over, no questions."',
      steps: [{ type: 'driveTo', pos, radius: 9, text: 'Deliver the parcel to the marker' }],
    };
  }

  /**
   * Per-frame mission logic. ctx: { playerPos, playerCar, stars }.
   * The caller guarantees ctx.playerCar is the Vehicle the player drives or null.
   */
  update(dt, ctx) {
    this.lastPlayerPos = ctx.playerPos;
    if (!this.announced) {
      if (this.chainDone && !this.courier) this.makeCourier();
      this.beginStep();
      this.announceIfNeeded();
    }
    const step = this.step;
    if (!step) return;
    const marker = this.currentMarker();
    if (marker) {
      this.beacon.visible = true;
      this.beacon.position.set(marker.x, 0, marker.z);
      this.diamond.rotation.y += dt * 2.4;
      this.diamond.position.y = 4.4 + Math.sin(performance.now() * 0.003) * 0.5;
    } else {
      this.beacon.visible = false;
    }

    const distTo = (p) => Math.hypot(p.x - ctx.playerPos.x, p.z - ctx.playerPos.z);
    if (step.type === 'reachCar') {
      const car = this.markedCar();
      if (car && ctx.playerCar === car) this.advance();
    } else if (step.type === 'driveTo') {
      if (distTo(step.pos) < step.radius && (!step.requiresCar || ctx.playerCar === this.markedCar())) {
        if (step.pickupHeat) {
          this.events.onPickup();
          this.events.onForceStars(step.pickupHeat);
        }
        this.advance();
      }
    } else if (step.type === 'deliverTo') {
      const car = this.markedCar();
      if (car && ctx.playerCar === car && distTo(step.pos) < step.radius) {
        if (car.health >= step.minHealth) {
          this.advance();
        } else {
          car.damage = 0;
          this.stepIndex = 0;
          this.beginStep();
          this.announced = true;
          this.events.onFail(`Too damaged — Sal had the ${car.spec.name} repaired. Fetch it and try again, gently.`);
        }
      }
    } else if (step.type === 'checkpoints') {
      step.timeRemaining -= dt;
      if (step.timeRemaining <= 0) {
        this.beginStep();
        this.events.onFail('Out of time — the Harbor Run resets. Floor it this time.');
        return;
      }
      const point = step.points[this.checkpointIndex];
      if (point && ctx.playerCar && distTo(point) < 10) {
        this.checkpointIndex += 1;
        this.events.onPickup();
        if (this.checkpointIndex >= step.points.length) this.advance();
      }
    } else if (step.type === 'escape') {
      if (ctx.stars === 0) this.advance();
    }
  }
}
