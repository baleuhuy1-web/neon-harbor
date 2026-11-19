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

/** cover: Marco beside Sal's gold Vireo on Harbor Avenue, skyline behind him. */
function stageCover(game) {
  const car = game.storyCars.get(0);
  car.group.position.set(24, 0, 120.2);
  car.heading = Math.PI / 2;
  car.group.rotation.y = car.heading;
  game.player.group.position.set(21.4, 0, 117.2);
  game.player.heading = -2.35;
  dressCrowd(game, [
    { x: 13, z: 124.5 }, { x: 33, z: 124.5 }, { x: 40, z: 110 }, { x: 8, z: 109 },
  ]);
  poseCamera(game, new THREE.Vector3(15.2, 2.2, 109.8), new THREE.Vector3(24.5, 1.1, 119.6));
}

/** chase: flat out down Harbor Avenue, three interceptors on his tail, four stars. */
function stageChase(game) {
  const car = game.spawnVehicle('vireo', 0xd64541, -64, 119.4, Math.PI / 2);
  car.stolenOnce = true;
  car.speed = 26;
  game.player.enterCar(car);
  game.rig.yaw = Math.PI / 2;
  game.wanted.forceStars(4);
  const lanes = [
    { x: -75, z: 119.4, speed: 28 }, { x: -83, z: 112.6, speed: 29 }, { x: -92, z: 119.4, speed: 27 },
  ];
  for (const lane of lanes) {
    const unit = game.police.spawnUnit({ x: lane.x, z: lane.z });
    unit.group.position.set(lane.x, 0, lane.z);
    unit.heading = Math.PI / 2;
    unit.speed = lane.speed;
  }
  // Clear the avenue ahead so the chase runs clean through the frame.
  for (const trafficCar of game.traffic.cars) {
    if (trafficCar.vehicle.z > 104 && trafficCar.vehicle.x > -120) {
      trafficCar.placeRandom(game.rng, { x: -116, z: -116 });
    }
  }
  game.shotObjective = { title: 'Hot Package', text: 'Lose the police', extra: '' };
  game.shotControl = (dt, driven) => {
    const desired = Math.PI / 2 + clamp((119.4 - driven.z) * 0.04, -0.35, 0.35);
    return {
      throttle: 0.92,
      steer: clamp(angleDelta(driven.heading, desired) * 2.4, -1, 1),
      brake: false,
      handbrake: false,
    };
  };
}

/** foot: Marco mid-street, the gold Vireo and its beacon ahead, the city moving. */
function stageFoot(game) {
  game.player.group.position.set(27, 0, 111);
  game.player.heading = -0.55;
  dressCrowd(game, [
    { x: 23, z: 114 }, { x: 31.5, z: 117 }, { x: 18, z: 108.5 }, { x: 35, z: 124 },
  ]);
  poseCamera(game, new THREE.Vector3(30.6, 2.5, 105.2), new THREE.Vector3(23.5, 1.2, 116.5));
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
  const stage = STAGES[name] || stageCover;
  stage(game);
}
