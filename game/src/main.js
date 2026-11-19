// NEON HARBOR — the game itself. This file wires every system together:
// the city, Marco, traffic, pedestrians, police, gunplay, Sal's missions,
// the HUD and the saves, and runs the state machine between the title
// screen, play, pause and the BUSTED / WASTED screens. The ?shot= scenes
// staged by shots.js run through the same update so a screenshot is the
// real game, never a mock-up.
import * as THREE from 'three';
import {
  PLAYER_START, HOSPITAL_POS, POLICE_STATION_POS, CAR_COLORS, TRAFFIC_KINDS,
  BUST_FINE, WASTED_BILL,
} from './config.js';
import { Rng, clamp } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, collideCircle } from './city.js';
import { Vehicle } from './vehicles.js';
import { TrafficFleet } from './traffic.js';
import { PedestrianCrowd } from './pedestrians.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { WantedSystem } from './wanted.js';
import { PoliceManager } from './police.js';
import { Combat } from './combat.js';
import { MissionManager, STORY_CARS } from './missions.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { loadSave, storeSave, freshSave, clearSave } from './savegame.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SHOT_NAME = params.get('shot');
const SEED = Number(params.get('seed') || (SHOT_NAME ? 1 : 20261119));

class Game {
  constructor() {
    this.rng = new Rng(SEED);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.domElement.classList.add('webgl');
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);
    this.camera.position.set(0, 34, 190);

    this.city = buildCity(this.scene, this.rng);
    this.colliders = this.city.colliders;
    this.hud = new Hud();
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.audio = new AudioEngine();
    this.wanted = new WantedSystem();
    this.rig = new CameraRig(this.camera);
    this.rig.yaw = PLAYER_START.heading;

    // Vehicles: parked cars first (some are story cars), then live traffic.
    this.parkedCars = [];
    this.storyCars = new Map();
    for (const spot of this.city.parkedSpots) {
      if (!this.rng.chance(0.72)) continue;
      const vehicle = this.spawnVehicle(this.rng.pick(TRAFFIC_KINDS), this.rng.pick(CAR_COLORS), spot.x, spot.z, spot.heading);
      this.parkedCars.push(vehicle);
    }
    for (const spec of STORY_CARS) {
      const vehicle = this.spawnVehicle(spec.kind, spec.color, spec.x, spec.z, spec.heading);
      this.storyCars.set(spec.mission, vehicle);
      this.parkedCars.push(vehicle);
    }
    this.traffic = new TrafficFleet(this.scene, this.rng, 14);
    this.crowd = new PedestrianCrowd(this.scene, this.rng, 22);
    this.player = new Player(this.scene, this.rng, PLAYER_START.x, PLAYER_START.z, PLAYER_START.heading);
    this.police = new PoliceManager(this.scene, this.rng);
    this.combat = new Combat(this.scene, this.audio);

    // Raycast targets for gunfire: every person and every car, by group.
    // The list is rebuilt each frame so police cars that spawn later count.
    for (const ped of this.crowd.peds) ped.group.userData.ped = ped;
    this.shootables = [];

    this.save = loadSave() || freshSave();
    this.missions = this.buildMissions(this.save.missionIndex);
    this.state = SHOT_NAME ? 'shot' : 'menu';
    this.time = 0;
    this.bustProgress = 0;
    this.lastHurtAt = -20;
    this.lastRamReport = -10;
    this.lastShotAt = 0;
    this.shotControl = null;
    this.shotObjective = null;
    this.onShotFrame = null;
    this.shotPolice = null;
    this.suppressPoliceAI = false;

    Input.init(this.renderer.domElement);
    this.bindUi();
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('pointerlockchange', () => {
      if (!Input.locked && this.state === 'playing') this.pauseGame();
    });

    if (SHOT_NAME) {
      document.getElementById('hud').style.display = 'block';
      stageShot(this, SHOT_NAME);
    } else {
      document.getElementById('hud').style.display = 'none';
      this.hud.showScreen('title');
      document.getElementById('btn-continue').style.display = this.save.started ? '' : 'none';
    }

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Create a vehicle, add it to the scene, and remember it for gunfire. */
  spawnVehicle(kind, color, x, z, heading) {
    const vehicle = new Vehicle(kind, color, x, z, heading);
    this.scene.add(vehicle.group);
    return vehicle;
  }

  /** Every vehicle currently in the world. */
  allVehicles() {
    const list = [...this.parkedCars];
    for (const car of this.traffic.cars) list.push(car.vehicle);
    for (const unit of this.police.units) list.push(unit.vehicle);
    if (this.player.car && !list.includes(this.player.car)) list.push(this.player.car);
    return list;
  }

  /** A mission manager wired to the game's economy, police and HUD. */
  buildMissions(startIndex) {
    if (this.missions) this.scene.remove(this.missions.beacon);
    const manager = new MissionManager(this.scene, {
      onToast: (title, sub) => {
        this.hud.toast(title, sub, 5.2);
        this.audio.missionSting();
      },
      onCash: (amount) => {
        this.save.cash += amount;
        storeSave(this.save);
        this.audio.cashChime();
      },
      onProgress: (index) => {
        this.save.missionIndex = index;
        this.save.jobsDone += 1;
        storeSave(this.save);
      },
      onForceStars: (stars) => this.wanted.forceStars(stars),
      onPickup: () => this.audio.pickup(),
      onFail: (text) => {
        this.hud.toast('Job failed', text, 5.5);
        this.audio.failTone();
      },
    }, startIndex);
    for (const [mission, vehicle] of this.storyCars) manager.bindStoryCar(mission, vehicle);
    return manager;
  }

  bindUi() {
    const start = (continued) => {
      this.audio.ensure();
      this.audio.click();
      this.startRun(continued);
      this.renderer.domElement.requestPointerLock();
    };
    document.getElementById('btn-play').addEventListener('click', () => start(false));
    document.getElementById('btn-continue').addEventListener('click', () => start(true));
    document.getElementById('btn-resume').addEventListener('click', () => {
      this.audio.click();
      this.hud.showScreen(null);
      this.state = 'playing';
      this.renderer.domElement.requestPointerLock();
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.audio.click();
      clearSave();
      this.resetRun(freshSave());
      this.hud.showScreen(null);
      this.state = 'playing';
      this.renderer.domElement.requestPointerLock();
    });
    document.getElementById('btn-respawn').addEventListener('click', () => {
      this.audio.click();
      this.respawn();
    });
  }

  /** Begin (or continue) a run: apply the save, put Marco on Harbor Avenue. */
  startRun(continued) {
    if (!continued) {
      clearSave();
      this.resetRun(freshSave());
    } else {
      this.save = loadSave() || freshSave();
      this.missions = this.buildMissions(this.save.missionIndex);
    }
    this.save.started = true;
    storeSave(this.save);
    document.getElementById('hud').style.display = 'block';
    this.hud.showScreen(null);
    this.state = 'playing';
    this.hud.toast('Neon Harbor', this.save.missionIndex > 0 ? 'Welcome back, Marco. Sal still has work for you.' : 'Find Sal\'s gold Vireo on Harbor Avenue. Press E to get in.', 5);
  }

  /** Reset cash, story and the story cars to a brand-new game. */
  resetRun(save) {
    this.save = save;
    if (this.player.car) this.player.exitCar();
    this.player.group.position.set(PLAYER_START.x, 0, PLAYER_START.z);
    this.player.heading = PLAYER_START.heading;
    this.player.health = 100;
    this.wanted.clear();
    this.bustProgress = 0;
    for (const unit of [...this.police.units]) this.police.removeUnit(unit);
    for (const spec of STORY_CARS) {
      const vehicle = this.storyCars.get(spec.mission);
      if (vehicle) {
        vehicle.group.position.set(spec.x, 0, spec.z);
        vehicle.heading = spec.heading;
        vehicle.speed = 0;
        vehicle.damage = 0;
      }
    }
    this.missions = this.buildMissions(0);
    this.rig.yaw = PLAYER_START.heading;
    storeSave(this.save);
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.showScreen('pause');
    Input.unlock();
  }

  /** After BUSTED or WASTED: wake up somewhere safe, lighter in the wallet. */
  respawn() {
    const wasBusted = this.overKind === 'busted';
    const spot = wasBusted ? POLICE_STATION_POS : HOSPITAL_POS;
    if (this.player.car) {
      const car = this.player.car;
      this.player.exitCar();
      car.speed = 0;
    }
    this.player.group.position.set(spot.x, 0, spot.z);
    this.player.health = 100;
    this.wanted.clear();
    this.bustProgress = 0;
    for (const unit of [...this.police.units]) this.police.removeUnit(unit);
    this.hud.showScreen(null);
    this.state = 'playing';
    this.renderer.domElement.requestPointerLock();
  }

  /** The police held Marco still long enough: pay the fine, lose the heat. */
  busted() {
    this.state = 'over';
    this.overKind = 'busted';
    const fine = Math.min(this.save.cash, BUST_FINE);
    this.save.cash -= fine;
    this.save.timesBusted += 1;
    storeSave(this.save);
    this.audio.failTone();
    Input.unlock();
    this.hud.setGameOver('busted', `The harbor police walk Marco to the station. Fine paid: $${fine}. Sal is not impressed.`);
    this.hud.showScreen('over');
  }

  /** Marco's health ran out: the hospital patches him up, for a price. */
  wasted() {
    this.state = 'over';
    this.overKind = 'wasted';
    const bill = Math.min(this.save.cash, WASTED_BILL);
    this.save.cash -= bill;
    this.save.timesWasted += 1;
    storeSave(this.save);
    this.audio.failTone();
    Input.unlock();
    this.hud.setGameOver('wasted', `Marco wakes up at Puerto Solano General. Hospital bill: $${bill}. The sunset is still there.`);
    this.hud.showScreen('over');
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing' || this.state === 'shot') {
      this.time += dt;
      this.update(dt);
    } else if (this.state === 'menu') {
      this.time += dt;
      this.updateAmbient(dt);
      this.rig.updateOrbit(dt, { x: 0, z: 40 }, this.time);
    }
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
    Input.endFrame();
  }

  /** The living backdrop behind the title screen: traffic, crowds, water. */
  updateAmbient(dt) {
    const focus = { x: 0, z: 60 };
    this.traffic.update(dt, this.obstacleList(), focus);
    this.crowd.update(dt, this.colliders, focus);
    this.city.update(dt);
  }

  /** Obstacles traffic should brake for: every vehicle, plus Marco on foot. */
  obstacleList() {
    const list = this.allVehicles();
    if (!this.player.inCar) list.push({ x: this.player.x, z: this.player.z, speed: 0 });
    return list;
  }

  update(dt) {
    const player = this.player;
    const focus = player.focusPos();
    const now = this.time;

    // Gunfire targets, refreshed so freshly spawned police cars are included.
    this.shootables.length = 0;
    for (const ped of this.crowd.peds) this.shootables.push(ped.group);
    for (const vehicle of this.allVehicles()) {
      vehicle.group.userData.vehicle = vehicle;
      this.shootables.push(vehicle.group);
    }

    if (Input.tapped('KeyM')) this.audio.setMuted(!this.audio.muted);
    if (this.state === 'playing' && Input.tapped('KeyP')) {
      this.pauseGame();
      return;
    }

    // --- Marco, on foot or behind the wheel. ---
    let playerSpeed = 0;
    if (player.inCar) {
      const car = player.car;
      let control;
      if (this.shotControl) {
        control = this.shotControl(dt, car);
      } else {
        control = {
          throttle: (Input.down('KeyW') || Input.down('ArrowUp') ? 1 : 0) + (Input.down('KeyS') || Input.down('ArrowDown') ? -1 : 0),
          steer: (Input.down('KeyA') || Input.down('ArrowLeft') ? 1 : 0) + (Input.down('KeyD') || Input.down('ArrowRight') ? -1 : 0),
          brake: false,
          handbrake: Input.down('Space'),
        };
      }
      const speedBefore = car.speed;
      car.update(dt, control);
      const resolved = collideCircle(car.x, car.z, 1.7, this.colliders);
      if (resolved.hit > 0.25 && Math.abs(speedBefore) > 6) {
        const impact = Math.abs(speedBefore);
        car.hurt(impact * 0.7);
        if (impact > 15) {
          player.hurt((impact - 13) * 0.55);
          this.lastHurtAt = now;
          this.hud.damageFlash(0.5);
        }
        this.audio.crash(clamp(impact / 32, 0.2, 1));
        this.crowd.scare(car.x, car.z, 15);
        car.speed *= 0.25;
      } else if (resolved.hit > 0.25) {
        car.speed *= 0.5;
      }
      car.group.position.x = resolved.x;
      car.group.position.z = resolved.z;
      car.clampToWorld(150);
      playerSpeed = car.speed;
      if (this.state === 'playing' && Input.tapped('KeyE') && Math.abs(car.speed) < 13) {
        player.exitCar();
        this.audio.click();
      }
    } else {
      const mouse = Input.consumeMouse();
      if (Input.locked || this.state === 'shot') this.rig.applyMouse(mouse.dx, mouse.dy);
      player.aiming = this.state === 'playing' && Input.locked && Input.mouseDown;
      player.updateOnFoot(dt, {
        x: (Input.down('KeyD') ? 1 : 0) - (Input.down('KeyA') ? 1 : 0),
        z: (Input.down('KeyW') ? 1 : 0) - (Input.down('KeyS') ? 1 : 0),
        sprint: Input.down('ShiftLeft') || Input.down('ShiftRight'),
      }, this.rig.yaw, this.colliders);
      playerSpeed = player.speedNow;

      // Shooting: hold the mouse to aim, click rhythm to fire.
      if (player.aiming && now - this.lastShotAt > 0.27) {
        this.lastShotAt = now;
        const tip = new THREE.Vector3();
        player.gun.getWorldPosition(tip);
        tip.y += 0.05;
        const report = this.combat.shoot(this.camera, this.shootables, this.city.occluders, tip, performance.now());
        if (report.fired) {
          this.wanted.report('gunfire', now);
          this.crowd.scare(player.x, player.z, 17);
          if (report.kind === 'ped') {
            this.wanted.report(report.killed ? 'killPedestrian' : 'hitPedestrian', now);
          } else if (report.kind === 'police') {
            this.wanted.report('shootPolice', now);
          }
        }
      }
      if (this.state === 'playing' && Input.tapped('KeyR')) this.combat.startReload(performance.now());

      // Climbing into a car.
      if (this.state === 'playing' && Input.tapped('KeyE')) {
        const near = this.nearestEnterableCar();
        if (near) {
          this.enterCar(near);
        }
      }
    }
    this.combat.update(performance.now());

    // --- The city lives around him. ---
    this.traffic.update(dt, this.obstacleList(), focus);
    this.crowd.update(dt, this.colliders, focus);
    if (this.state !== 'shot') this.resolveVehicleContacts(dt, now);
    this.checkPedestrianHits(now);

    if (!this.suppressPoliceAI) {
      this.police.update(dt, {
        playerPos: focus,
        playerSpeed,
        playerVelX: player.inCar ? Math.sin(player.car.heading) * player.car.speed : 0,
        playerVelZ: player.inCar ? Math.cos(player.car.heading) * player.car.speed : 0,
        stars: this.wanted.stars,
        colliders: this.colliders,
        onCrash: (intensity) => this.audio.crash(intensity * 0.7),
      });
    }

    // --- Wanted level, bust and health. ---
    const seen = this.police.playerSeen(focus) || now - this.wanted.lastGunfireReport < 2;
    if (!this.suppressPoliceAI) this.wanted.update(dt, seen);
    if (this.wanted.stars > 0) {
      const pinned = this.police.nearestDistance(focus) < 7.5 && Math.abs(playerSpeed) < 2.4;
      this.bustProgress = clamp(this.bustProgress + (pinned ? dt / 2.6 : -dt * 0.6), 0, 1);
      if (this.bustProgress >= 1 && this.state === 'playing') {
        this.busted();
        return;
      }
    } else {
      this.bustProgress = 0;
    }
    if (player.health < 100 && now - this.lastHurtAt > 6 && this.wanted.stars === 0) {
      player.heal(dt * 2.2);
    }
    if (player.health <= 0 && this.state === 'playing') {
      this.wasted();
      return;
    }

    // --- Missions, camera, sound, HUD. ---
    this.missions.update(dt, { playerPos: focus, playerCar: player.car, stars: this.wanted.stars });
    if (this.onShotFrame) this.onShotFrame(this.time, dt);
    if (this.shotCameraLocked) {
      // Posed camera: shots.js placed it (and may keep placing it per frame).
    } else if (player.inCar) {
      this.rig.updateCar(dt, player.car);
    } else {
      this.rig.updateFoot(dt, player.group.position);
    }

    const speedRatio = player.inCar ? Math.abs(player.car.speed) / player.car.spec.topSpeed : 0;
    this.audio.updateEngine(speedRatio, player.inCar && this.state === 'playing');
    this.audio.updateSiren(this.police.nearestDistance(focus), this.wanted.stars);
    this.city.update(dt);
    this.refreshHud(player, focus);
  }

  /** The nearest car Marco can take: parked or traffic, never a police car. */
  nearestEnterableCar() {
    let best = null;
    let bestDist = 3.4;
    for (const vehicle of this.allVehicles()) {
      if (vehicle.kind === 'police') continue;
      const d = Math.hypot(vehicle.x - this.player.x, vehicle.z - this.player.z);
      if (d < bestDist) {
        bestDist = d;
        best = vehicle;
      }
    }
    return best;
  }

  /** Take a car: traffic cars leave the fleet, theft is a crime, once per car. */
  enterCar(vehicle) {
    const trafficIndex = this.traffic.cars.findIndex((c) => c.vehicle === vehicle);
    if (trafficIndex >= 0) this.traffic.cars.splice(trafficIndex, 1);
    if (!this.parkedCars.includes(vehicle)) this.parkedCars.push(vehicle);
    this.player.enterCar(vehicle);
    this.rig.yaw = vehicle.heading;
    if (!vehicle.stolenOnce) {
      vehicle.stolenOnce = true;
      this.wanted.report('theft', this.time);
      this.crowd.scare(vehicle.x, vehicle.z, 7);
    }
    this.audio.click();
  }

  /** Push-apart and damage for the player's car and police against the world. */
  resolveVehicleContacts(dt, now) {
    const dynamics = [];
    if (this.player.inCar) dynamics.push(this.player.car);
    for (const unit of this.police.units) dynamics.push(unit.vehicle);
    const others = this.allVehicles();
    for (const a of dynamics) {
      for (const b of others) {
        if (a === b) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const minDist = (a.radius + b.radius) * 0.8;
        const d = Math.hypot(dx, dz);
        if (d < 0.01 || d >= minDist) continue;
        const push = minDist - d;
        a.group.position.x -= (dx / d) * push;
        a.group.position.z -= (dz / d) * push;
        const relSpeed = Math.abs(a.speed - b.speed);
        if (relSpeed > 6.5) {
          a.hurt((relSpeed - 4) * 0.9);
          b.hurt((relSpeed - 4) * 0.7);
          if (a === this.player.car || b === this.player.car) {
            this.audio.crash(clamp(relSpeed / 26, 0.25, 1));
            if (relSpeed > 13) {
              this.player.hurt((relSpeed - 11) * 0.4);
              this.lastHurtAt = now;
              this.hud.damageFlash(0.45);
            }
            if (b.kind === 'police' && now - this.lastRamReport > 2) {
              this.lastRamReport = now;
              this.wanted.report('ramPolice', now);
            } else if (b.kind !== 'police' && now - this.lastRamReport > 2) {
              this.lastRamReport = now;
              this.wanted.report('hitCar', now);
            }
          }
        }
        a.speed *= 0.55;
      }
    }
  }

  /** Cars of any driver knock pedestrians down; only Marco's hits are crimes. */
  checkPedestrianHits(now) {
    const drivers = this.allVehicles().filter((v) => Math.abs(v.speed) > 3.5);
    for (const vehicle of drivers) {
      for (const ped of this.crowd.peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.x - vehicle.x, ped.z - vehicle.z);
        if (d < vehicle.radius * 0.82 + 0.45) {
          const killed = ped.knockDown(Math.abs(vehicle.speed) * 2.3);
          vehicle.speed *= 0.93;
          if (vehicle === this.player.car) {
            this.wanted.report(killed ? 'killPedestrian' : 'hitPedestrian', now);
            this.audio.crash(0.3);
          }
        }
      }
    }
  }

  /** Feed every HUD element from the live state. */
  refreshHud(player, focus) {
    this.hud.setCash(this.save.cash);
    this.hud.setStars(this.wanted.stars);
    this.hud.setHealth(player.health);
    this.hud.setBust(this.wanted.stars > 0 && this.bustProgress > 0.02 ? this.bustProgress : null);
    if (player.inCar) {
      this.hud.setReadout({ speedKmh: Math.abs(player.car.speed) * 3.6 });
      this.hud.setPrompt(this.state === 'playing' && Math.abs(player.car.speed) < 13 ? '<b>E</b> — Get out' : null);
    } else {
      this.hud.setReadout({ ammo: this.combat.ammo, reserve: this.combat.reserve, reloading: this.combat.reloading });
      let prompt = null;
      if (this.state === 'playing') {
        const near = this.nearestEnterableCar();
        if (near) prompt = `<b>E</b> — Take the ${near.spec.name}`;
      }
      this.hud.setPrompt(prompt);
    }
    this.hud.setCrosshair(this.state === 'playing' && !player.inCar);
    const objective = this.shotObjective || this.missions.objective(focus);
    this.hud.setObjective(this.state === 'menu' ? { title: '' } : objective);
    this.minimap.draw({
      playerPos: focus,
      playerHeading: player.inCar ? player.car.heading : player.heading,
      cameraYaw: this.rig.yaw,
      traffic: this.traffic.cars.map((c) => c.vehicle),
      parked: this.parkedCars,
      police: [...this.police.units.map((u) => u.vehicle), ...(this.shotPolice || [])],
      peds: this.crowd.peds,
      marker: this.missions.currentMarker(),
    }, this.time);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => new Game());
} else {
  new Game();
}
