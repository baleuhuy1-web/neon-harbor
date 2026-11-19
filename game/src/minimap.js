// The minimap: a round canvas map that turns with the camera. Avenues, the
// beach and the sea are drawn from the same grid the city is built on; cars
// are dots, police flash red and blue, and the mission marker pulses gold.
import { AVENUES, WATER_Z } from './config.js';

const RANGE = 95;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
  }

  /**
   * Draw one frame. view: { playerPos, playerHeading, cameraYaw, traffic:
   * [{x,z}], parked: [{x,z}], police: [{x,z}], peds: [{x,z}], marker }.
   */
  draw(view, time) {
    const ctx = this.ctx;
    const R = this.size / 2;
    const scale = R / RANGE;
    const yaw = view.cameraYaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // World offset -> map offset (up on the map is where the camera looks).
    const project = (x, z) => {
      const dx = x - view.playerPos.x;
      const dz = z - view.playerPos.z;
      return {
        x: R + (dx * -cos + dz * sin) * scale,
        y: R - (dx * sin + dz * cos) * scale,
      };
    };

    ctx.clearRect(0, 0, this.size, this.size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#131a22';
    ctx.fillRect(0, 0, this.size, this.size);

    // The sea along the south edge, drawn as its true rotated quad.
    const seaCorners = [project(-500, WATER_Z), project(500, WATER_Z), project(500, WATER_Z + 450), project(-500, WATER_Z + 450)];
    ctx.fillStyle = '#14607e';
    ctx.beginPath();
    ctx.moveTo(seaCorners[0].x, seaCorners[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(seaCorners[i].x, seaCorners[i].y);
    ctx.closePath();
    ctx.fill();

    // Avenues as pale strokes.
    ctx.strokeStyle = '#46525f';
    ctx.lineWidth = Math.max(2, 14 * scale * 0.55);
    ctx.beginPath();
    for (const a of AVENUES) {
      const v1 = project(a, -160);
      const v2 = project(a, 160);
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      const h1 = project(-160, a);
      const h2 = project(160, a);
      ctx.moveTo(h1.x, h1.y);
      ctx.lineTo(h2.x, h2.y);
    }
    ctx.stroke();

    const dot = (x, z, radius, color) => {
      const p = project(x, z);
      if (p.x < -6 || p.y < -6 || p.x > this.size + 6 || p.y > this.size + 6) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const ped of view.peds) dot(ped.x, ped.z, 1.4, 'rgba(200,200,200,0.5)');
    for (const car of view.parked) dot(car.x, car.z, 2.2, '#9aa3ad');
    for (const car of view.traffic) dot(car.x, car.z, 2.4, '#e8e6df');
    const flashBlue = Math.floor(time * 2.4) % 2 === 0;
    for (const cop of view.police) dot(cop.x, cop.z, 3, flashBlue ? '#3a7bff' : '#ff4040');

    // The mission marker: gold, pulsing, clamped to the rim when far away.
    if (view.marker) {
      let p = project(view.marker.x, view.marker.z);
      const dx = p.x - R;
      const dy = p.y - R;
      const d = Math.hypot(dx, dy);
      if (d > R - 10) {
        p = { x: R + (dx / d) * (R - 10), y: R + (dy / d) * (R - 10) };
      }
      const pulse = 4.4 + Math.sin(time * 5) * 1.1;
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,201,60,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse + 3.4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The player arrow, turned by the difference between facing and camera.
    ctx.translate(R, R);
    ctx.rotate(yaw - view.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.6, 5.4);
    ctx.lineTo(0, 2.8);
    ctx.lineTo(-4.6, 5.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // The rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(R, R, R - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}
