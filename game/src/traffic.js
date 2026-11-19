// Traffic: civilian cars that live on the avenue grid. Each follows a lane,
// brakes for whatever is ahead of it, and sometimes turns at a crossing,
// following a curved arc onto the next avenue. Cars that fall too far behind
// the player quietly reappear on a street near them, so the city never empties.
import { AVENUES, CAR_COLORS, LANE_OFFSET, TRAFFIC_KINDS } from './config.js';
import { Vehicle } from './vehicles.js';
import { clamp, turnToward } from './random.js';

const TURN_LENGTH = 8.5;

/** The world position of a point on a lane: axis, avenue coordinate, scalar along it, direction. */
function lanePoint(axis, avenue, scalar, dir) {
  if (axis === 'x') {
    return { x: scalar, z: avenue + (dir > 0 ? LANE_OFFSET : -LANE_OFFSET) };
  }
  return { x: avenue + (dir > 0 ? -LANE_OFFSET : LANE_OFFSET), z: scalar };
}

/** The heading a car holds while driving this lane. */
function laneHeading(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export class TrafficCar {
  constructor(scene, rng) {
    this.rng = rng;
    this.vehicle = new Vehicle(rng.pick(TRAFFIC_KINDS), rng.pick(CAR_COLORS), 0, 0, 0);
    scene.add(this.vehicle.group);
    this.cruiseSpeed = rng.range(9, 13);
    this.turn = null;
    this.placeRandom(rng, null);
  }

  /** Put the car on a random avenue, optionally near a target point. */
  placeRandom(rng, near) {
    this.axis = rng.chance(0.5) ? 'x' : 'z';
    this.avenueIndex = rng.int(0, AVENUES.length - 1);
    this.dir = rng.chance(0.5) ? 1 : -1;
    const avenue = AVENUES[this.avenueIndex];
    if (near) {
      const along = this.axis === 'x' ? near.x : near.z;
      this.scalar = clamp(along + rng.range(60, 170) * (rng.chance(0.5) ? 1 : -1), -138, 138);
    } else {
      this.scalar = rng.range(-138, 138);
    }
    this.turn = null;
    this.decidedCrossing = null;
    this.willTurn = false;
    const p = lanePoint(this.axis, avenue, this.scalar, this.dir);
    this.vehicle.group.position.set(p.x, 0, p.z);
    this.vehicle.heading = laneHeading(this.axis, this.dir);
    this.vehicle.speed = this.cruiseSpeed;
  }

  /** The scalar (position along the current avenue) of the next crossing ahead, or null. */
  nextCrossing() {
    let best = null;
    for (const c of AVENUES) {
      const d = (c - this.scalar) * this.dir;
      if (d > 0.5 && (best === null || d < best.d)) best = { at: c, d };
    }
    return best;
  }

  /** Begin a turn at the crossing ahead onto the avenue that crosses there. */
  beginTurn(crossingAt) {
    const fromAvenue = AVENUES[this.avenueIndex];
    const toAxis = this.axis === 'x' ? 'z' : 'x';
    const toDir = this.rng.chance(0.5) ? 1 : -1;
    const entry = { x: this.vehicle.x, z: this.vehicle.z };
    const exitPoint = lanePoint(toAxis, crossingAt, fromAvenue + toDir * (TURN_LENGTH / 2), toDir);
    // The corner is where the entry lane line meets the exit lane line.
    const corner = {
      x: toAxis === 'z' ? exitPoint.x : entry.x,
      z: toAxis === 'x' ? exitPoint.z : entry.z,
    };
    this.turn = {
      p0: entry,
      p1: corner,
      p2: exitPoint,
      progress: 0,
      toAxis,
      toAvenueValue: crossingAt,
      toDir,
    };
  }

  /**
   * Advance one step. obstacles: array of {x, z, speed} for things to not hit;
   * playerPos keeps the traffic flowing around the player.
   */
  update(dt, obstacles, playerPos) {
    const v = this.vehicle;
    // Slow for anything in the lane ahead.
    let targetSpeed = this.cruiseSpeed;
    const f = v.forward();
    for (const o of obstacles) {
      if (o === v) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const ahead = dx * f.x + dz * f.z;
      const lateral = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 11 && lateral < 2.3) {
        targetSpeed = Math.min(targetSpeed, ahead < 5.5 ? 0 : this.cruiseSpeed * 0.4);
      }
    }
    v.speed += clamp(targetSpeed - v.speed, -22 * dt, 6 * dt);

    if (this.turn) {
      const turn = this.turn;
      turn.progress += (v.speed * dt) / TURN_LENGTH;
      const t = Math.min(1, turn.progress);
      const s = t * t * (3 - 2 * t);
      const x = (1 - s) * (1 - s) * turn.p0.x + 2 * (1 - s) * s * turn.p1.x + s * s * turn.p2.x;
      const z = (1 - s) * (1 - s) * turn.p0.z + 2 * (1 - s) * s * turn.p1.z + s * s * turn.p2.z;
      const dx = 2 * (1 - s) * (turn.p1.x - turn.p0.x) + 2 * s * (turn.p2.x - turn.p0.x);
      const dz = 2 * (1 - s) * (turn.p1.z - turn.p0.z) + 2 * s * (turn.p2.z - turn.p0.z);
      v.group.position.set(x, 0, z);
      v.heading = turnToward(v.heading, Math.atan2(dx, dz), dt * 6);
      if (t >= 1) {
        this.axis = turn.toAxis;
        this.avenueIndex = AVENUES.indexOf(turn.toAvenueValue);
        this.dir = turn.toDir;
        this.scalar = this.axis === 'x' ? turn.p2.x : turn.p2.z;
        this.turn = null;
      }
    } else {
      this.scalar += v.speed * this.dir * dt;
      if (this.scalar > 142 || this.scalar < -142) {
        this.placeRandom(this.rng, playerPos);
        return;
      }
      const crossing = this.nextCrossing();
      if (crossing && crossing.at !== this.decidedCrossing) {
        this.decidedCrossing = crossing.at;
        this.willTurn = this.rng.chance(0.3);
      }
      if (crossing && this.willTurn && crossing.d <= TURN_LENGTH / 2 + 0.05) {
        this.willTurn = false;
        this.beginTurn(crossing.at);
      }
      const p = lanePoint(this.axis, AVENUES[this.avenueIndex], this.scalar, this.dir);
      v.group.position.set(p.x, 0, p.z);
      v.heading = turnToward(v.heading, laneHeading(this.axis, this.dir), dt * 5);
    }
    v.group.rotation.y = v.heading;
    // Wheel spin without the player physics.
    const spin = (v.speed * dt) / 0.34;
    for (const wheel of v.wheels) {
      wheel.children[0].rotation.x += spin;
      wheel.children[1].rotation.x += spin;
    }
    v.tailMat.emissiveIntensity = targetSpeed < v.speed - 0.5 ? 2.2 : 0.7;

    // Keep the streets around the player populated.
    const distToPlayer = Math.hypot(v.x - playerPos.x, v.z - playerPos.z);
    if (distToPlayer > 250) this.placeRandom(this.rng, playerPos);
  }
}

/** A small fleet of traffic cars with one update for all of them. */
export class TrafficFleet {
  constructor(scene, rng, count) {
    this.cars = [];
    for (let i = 0; i < count; i += 1) this.cars.push(new TrafficCar(scene, rng));
  }

  update(dt, obstacles, playerPos) {
    for (const car of this.cars) car.update(dt, obstacles, playerPos);
  }
}
