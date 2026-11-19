// The Puerto Solano PD: interceptors that spawn on the avenues around the
// player, chase, ram, and pin him until the bust meter fills. More stars,
// more cars, driven harder. When the heat dies they peel off and despawn.
import { AVENUES } from './config.js';
import { Vehicle } from './vehicles.js';
import { collideCircle } from './city.js';
import { clamp } from './random.js';

/** How many interceptors each wanted level sends. */
const UNITS_BY_STARS = [0, 2, 3, 4, 5, 6];

export class PoliceManager {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.units = [];
  }

  /** Spawn an interceptor on a road 70-100 m from the player. */
  spawnUnit(playerPos) {
    const rng = this.rng;
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const avenue = rng.pick(AVENUES);
    const along = clamp((axis === 'x' ? playerPos.x : playerPos.z) + rng.range(70, 100) * (rng.chance(0.5) ? 1 : -1), -135, 135);
    const x = axis === 'x' ? along : avenue;
    const z = axis === 'x' ? avenue : along;
    const vehicle = new Vehicle('police', 0xe8ecf0, x, z, rng.range(0, Math.PI * 2));
    this.scene.add(vehicle.group);
    this.units.push({ vehicle, stuckTime: 0 });
    return vehicle;
  }

  /** Remove a unit from the world entirely. */
  removeUnit(unit) {
    this.scene.remove(unit.vehicle.group);
    this.units.splice(this.units.indexOf(unit), 1);
  }

  /** Distance to the closest interceptor, for sirens and bust logic. */
  nearestDistance(playerPos) {
    let best = Infinity;
    for (const unit of this.units) {
      best = Math.min(best, Math.hypot(unit.vehicle.x - playerPos.x, unit.vehicle.z - playerPos.z));
    }
    return best;
  }

  /** Can any officer see the player right now? (Close enough counts as seen.) */
  playerSeen(playerPos) {
    return this.nearestDistance(playerPos) < 62;
  }

  /**
   * Per-frame police work. context: { playerPos, playerSpeed, stars, colliders,
   * onRam(intensity) } — onRam fires when an interceptor hits the player's car.
   */
  update(dt, context) {
    const { playerPos, stars, colliders } = context;
    const desired = UNITS_BY_STARS[stars] || 0;
    if (stars > 0 && this.units.length < desired) {
      this.spawnUnit(playerPos);
    }
    const aggression = 0.75 + stars * 0.09;

    for (let i = this.units.length - 1; i >= 0; i -= 1) {
      const unit = this.units[i];
      const v = unit.vehicle;
      const dist = Math.hypot(v.x - playerPos.x, v.z - playerPos.z);

      // Heat off and far away: the officer gives up and leaves the world.
      if (stars === 0 && dist > 130) {
        this.removeUnit(unit);
        continue;
      }
      // Too far to matter: quietly reposition onto a road nearer the player.
      if (stars > 0 && dist > 250) {
        const fresh = this.spawnUnit(playerPos);
        fresh.heading = v.heading;
        this.removeUnit(unit);
        continue;
      }

      // Steering: aim at the player (or a point ahead of his car), turn hard.
      const lead = clamp(dist / 30, 0, 1) * 4;
      const targetX = playerPos.x + (context.playerVelX || 0) * lead * 0.2;
      const targetZ = playerPos.z + (context.playerVelZ || 0) * lead * 0.2;
      const desiredHeading = Math.atan2(targetX - v.x, targetZ - v.z);
      let delta = desiredHeading - v.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const steer = clamp(delta * 2.4, -1, 1);
      let throttle = 1;
      if (Math.abs(delta) > 2.2) throttle = -0.7; // Turn around instead of orbiting.
      if (dist < 7 && Math.abs(context.playerSpeed) < 3) throttle = 0.25; // Stay on him while he is pinned.
      const control = { throttle: throttle * aggression > 1 ? 1 : throttle, steer, brake: false, handbrake: Math.abs(delta) > 1.2 && v.speed > 12 };
      const speedBefore = v.speed;
      v.update(dt, control);

      // Buildings stop police cars too, and it hurts.
      const resolved = collideCircle(v.x, v.z, 1.7, colliders);
      if (resolved.hit > 0.3) {
        if (Math.abs(speedBefore) > 9) {
          v.hurt(5);
          if (context.onCrash) context.onCrash(clamp(Math.abs(speedBefore) / 30, 0.2, 1));
        }
        v.speed *= 0.35;
      }
      v.group.position.x = resolved.x;
      v.group.position.z = resolved.z;
      v.clampToWorld(150);

      // Stuck against a wall: back up briefly to free the car.
      if (stars > 0 && Math.abs(v.speed) < 0.6 && dist > 12) {
        unit.stuckTime += dt;
        if (unit.stuckTime > 1.1) {
          v.speed = -7;
          unit.stuckTime = 0;
        }
      } else {
        unit.stuckTime = 0;
      }
    }

    // Keep interceptors from stacking into one another.
    for (let i = 0; i < this.units.length; i += 1) {
      for (let j = i + 1; j < this.units.length; j += 1) {
        const a = this.units[i].vehicle;
        const b = this.units[j].vehicle;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 3.4) {
          const push = (3.4 - d) / 2;
          a.group.position.x -= (dx / d) * push;
          a.group.position.z -= (dz / d) * push;
          b.group.position.x += (dx / d) * push;
          b.group.position.z += (dz / d) * push;
        }
      }
    }
  }
}
