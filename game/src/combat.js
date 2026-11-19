// Gunplay: a hitscan pistol with a twelve-round magazine. Shots are raycast
// from the camera through the crosshair; they drop pedestrians, scar cars and
// draw a tracer with a muzzle flash so the shot reads on screen.
import * as THREE from 'three';

export const MAG_SIZE = 12;

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.ammo = MAG_SIZE;
    this.reserve = 240;
    this.reloadUntil = 0;
    this.flashLight = new THREE.PointLight(0xffc37a, 0, 18);
    scene.add(this.flashLight);
    const flashGeo = new THREE.SphereGeometry(0.14, 8, 6);
    this.flashMesh = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0 }));
    scene.add(this.flashMesh);
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0 }));
    scene.add(this.tracer);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 140;
  }

  get reloading() {
    return performance.now() < this.reloadUntil;
  }

  /** Start a reload if the magazine is not full and the reserve allows. */
  startReload(now) {
    if (this.reloading || this.ammo === MAG_SIZE || this.reserve <= 0) return false;
    this.reloadUntil = now + 900;
    this.audio.reload();
    return true;
  }

  /** Finish a reload whose time has come. */
  update(now) {
    if (this.reloadUntil && now >= this.reloadUntil) {
      const take = Math.min(MAG_SIZE - this.ammo, this.reserve);
      this.ammo += take;
      this.reserve -= take;
      this.reloadUntil = 0;
    }
    if (this.flashLight.intensity > 0) this.flashLight.intensity = Math.max(0, this.flashLight.intensity - 14);
    if (this.flashMesh.material.opacity > 0) this.flashMesh.material.opacity = Math.max(0, this.flashMesh.material.opacity - 0.14);
    if (this.tracer.material.opacity > 0) this.tracer.material.opacity = Math.max(0, this.tracer.material.opacity - 0.16);
  }

  /**
   * Fire one round through the crosshair. shootables: root objects whose
   * userData may carry { ped } or { vehicle }; occluders: solid meshes (the
   * city's buildings) that stop a round first. Returns a hit report:
   * { fired, kind: 'ped'|'vehicle'|'police'|'world'|null, target, point, killed }.
   */
  shoot(camera, shootables, occluders, gunTip, now) {
    if (this.reloading) return { fired: false };
    if (this.ammo <= 0) {
      this.audio.dryFire();
      this.startReload(now);
      return { fired: false };
    }
    this.ammo -= 1;
    this.audio.gunshot();
    this.flashLight.position.copy(gunTip);
    this.flashLight.intensity = 26;
    this.flashMesh.position.copy(gunTip);
    this.flashMesh.material.opacity = 0.95;

    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = this.raycaster.intersectObjects(shootables, true);
    const wallHits = occluders && occluders.length ? this.raycaster.intersectObjects(occluders, false) : [];
    let end = this.raycaster.ray.at(140, new THREE.Vector3());
    let report = { fired: true, kind: 'world', target: null, point: end, killed: false };
    const wallDistance = wallHits.length ? wallHits[0].distance : Infinity;
    if (hits.length && hits[0].distance < wallDistance) {
      const hit = hits[0];
      end = hit.point;
      let node = hit.object;
      while (node) {
        if (node.userData.ped) {
          const ped = node.userData.ped;
          const killed = ped.knockDown(34);
          report = { fired: true, kind: 'ped', target: ped, point: hit.point, killed };
          break;
        }
        if (node.userData.vehicle) {
          const vehicle = node.userData.vehicle;
          vehicle.hurt(9);
          report = { fired: true, kind: vehicle.kind === 'police' ? 'police' : 'vehicle', target: vehicle, point: hit.point, killed: false };
          break;
        }
        node = node.parent;
      }
    } else if (wallHits.length) {
      end = wallHits[0].point;
      report = { fired: true, kind: 'world', target: null, point: end, killed: false };
    }
    const positions = this.tracer.geometry.attributes.position;
    positions.setXYZ(0, gunTip.x, gunTip.y, gunTip.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;
    this.tracer.material.opacity = 0.85;
    if (this.ammo === 0) this.startReload(now);
    return report;
  }
}
