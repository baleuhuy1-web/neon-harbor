// The screenshot scenes behind ?shot=cover|chase|foot|menu&seed=1. Each one
// poses the real game — Marco, the story cars, traffic, pedestrians and the
// police exactly as the systems place them — and lets the simulation run, so
// the frame a screenshot takes is a frame the game itself produced.
import * as THREE from 'three';
import { clamp, angleDelta } from './random.js';

/** Move a few pedestrians onto the sidewalks around a point for a livelier frame. */
function dressCrowd(game, spots) {
  const peds = game.crowd.peds;
  for (let i = 0; i < spots.length && i < peds.length; i += 1) {
    const ped = peds[i];
    ped.group.position.set(spots[i].x, 0.36, spots[i].z);
    ped.target = { x: spots[i].x + 14, z: spots[i].z };
    ped.state = 'walk';
  }
}

/** Lock the camera at a viewpoint with a barely-there drift, so the frame breathes. */
function poseCamera(game, position, look) {
  game.shotCameraLocked = true;
  game.rig.snapTo(position, look);
  game.rig.yaw = Math.atan2(look.x - position.x, look.z - position.z);
  const base = position.clone();
  game.onShotFrame = (t) => {
    const drift = new THREE.Vector3(
      base.x + Math.sin(t * 0.11) * 0.5,
      base.y + Math.sin(t * 0.07) * 0.18,
      base.z + Math.cos(t * 0.09) * 0.5,
    );
    game.rig.snapTo(drift, look);
  };
}

/** cover: Marco beside Sal's gold Vireo, the skyline of Puerto Solano behind him. */
function stageCover(game) {
  const car = game.storyCars.get(0);
  car.group.position.set(24, 0, 120.2);
  car.heading = Math.PI / 2;
  car.group.rotation.y = car.heading;
  game.player.group.position.set(23.2, 0, 123.2);
  game.player.heading = -0.87;
  dressCrowd(game, [
    { x: 12, z: 124.5 }, { x: 34, z: 124.5 }, { x: 38, z: 113 }, { x: 6, z: 112 },
  ]);
  poseCamera(game, new THREE.Vector3(17.5, 2.0, 128.5), new THREE.Vector3(23.8, 1.1, 120.5));
}

/**
 * chase: flat out down Harbor Avenue with three interceptors in formation on
 * his tail and four stars lit. The police cars are real interceptors driven
 * by a formation script (the manager's AI is suppressed for the pose) and
 * the camera rides behind the action, so the framing holds at any moment.
 */
function stageChase(game) {
  const car = game.spawnVehicle('vireo', 0xd64541, -80, 119.4, Math.PI / 2);
  car.stolenOnce = true;
  car.speed = 21.5;
  game.player.enterCar(car);
  game.rig.yaw = Math.PI / 2;
  game.wanted.forceStars(4);
  game.suppressPoliceAI = true;
  game.shotCameraLocked = true;

  const formation = [
    { back: 5.5, lane: 112.6 }, { back: 8.0, lane: 119.4 }, { back: 11.0, lane: 112.6 },
  ];
  game.shotPolice = formation.map((slot) => {
    const unit = game.spawnVehicle('police', 0xe8ecf0, car.x - slot.back, 0, Math.PI / 2);
    unit.group.position.z = slot.lane;
    unit.speed = 21.5;
    return { vehicle: unit, back: slot.back, lane: slot.lane };
  });
  // Clear Harbor Avenue so the chase runs clean through the frame.
  for (const trafficCar of game.traffic.cars) {
    if (Math.abs(trafficCar.vehicle.z - 116) < 9) {
      trafficCar.placeRandom(game.rng, { x: -116, z: -116 });
    }
  }
  game.shotObjective = { title: 'Hot Package', text: 'Lose the police', extra: '' };
  game.shotControl = (dt, driven) => {
    // Heading PI/2 is east; drifting south of the lane (z too big) needs a
    // larger heading (toward north), drifting north needs a smaller one.
    const desired = Math.PI / 2 + clamp((driven.z - 119.4) * 0.05, -0.6, 0.6);
    return {
      throttle: 0.9,
      steer: clamp(angleDelta(driven.heading, desired) * 2.6, -1, 1),
      brake: false,
      handbrake: false,
    };
  };
  game.onShotFrame = (t) => {
    const driven = game.player.car;
    if (!driven) return;
    const fx = Math.sin(driven.heading);
    const fz = Math.cos(driven.heading);
    const rx = -fz;
    const rz = fx;
    for (const slot of game.shotPolice) {
      const v = slot.vehicle;
      const sway = Math.sin(t * 1.3 + slot.back) * 0.3;
      const laneDelta = slot.lane - 119.4 + sway;
      v.group.position.set(
        driven.x - fx * slot.back + rx * laneDelta,
        0,
        driven.z - fz * slot.back + rz * laneDelta,
      );
      v.heading = driven.heading;
      v.group.rotation.y = v.heading;
      v.speed = driven.speed;
      v.update(0.0001, { throttle: 0, steer: 0 });
    }
    const camPos = new THREE.Vector3(driven.x - fx * 13.5, 5.0, driven.z - fz * 13.5);
    const look = new THREE.Vector3(driven.x + fx * 10, 0.9, driven.z + fz * 10);
    game.rig.snapTo(camPos, look);
    game.rig.yaw = driven.heading;
  };
}

/** foot: Marco mid-street, the gold Vireo and its beacon ahead, the city moving. */
function stageFoot(game) {
  game.player.group.position.set(27, 0, 111);
  game.player.heading = -0.55;
  dressCrowd(game, [
    { x: 23, z: 114 }, { x: 31.5, z: 117 }, { x: 18, z: 108.5 }, { x: 35, z: 124 },
  ]);
  poseCamera(game, new THREE.Vector3(31.5, 3.0, 103.5), new THREE.Vector3(23, 1.2, 116.5));
}

/** menu: the title screen over the orbiting harbour camera (the frame loop does the rest). */
function stageMenu(game) {
  game.state = 'menu';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('btn-continue').style.display = 'none';
  game.hud.showScreen('title');
}

const STAGES = { cover: stageCover, chase: stageChase, foot: stageFoot, menu: stageMenu };

/** Stage the named scene on a freshly built game. Unknown names get the cover. */
export function stageShot(game, name) {
  // No intro toast in a posed frame: the objective banner tells the story.
  game.missions.announced = true;
  const stage = STAGES[name] || stageCover;
  stage(game);
}
