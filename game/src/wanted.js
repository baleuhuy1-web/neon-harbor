// The wanted level: crimes add heat, heat makes stars, stars bring police.
// Stay out of sight and the heat bleeds away, one star at a time.

export const CRIME_POINTS = {
  theft: 10,
  hitPedestrian: 14,
  killPedestrian: 24,
  gunfire: 8,
  shootPolice: 22,
  ramPolice: 12,
  hitCar: 5,
};

/** Heat needed for each star level, index = stars. */
const THRESHOLDS = [0, 1, 14, 30, 50, 76];

export class WantedSystem {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.unseenTime = 0;
    this.lastGunfireReport = -10;
  }

  /** Stars for a given heat, from the thresholds table. */
  starsFor(heat) {
    let stars = 0;
    for (let i = 1; i < THRESHOLDS.length; i += 1) {
      if (heat >= THRESHOLDS[i]) stars = i;
    }
    return stars;
  }

  /** Report a crime by name; gunfire is throttled so one shootout is one crime. */
  report(kind, now) {
    if (kind === 'gunfire' && now - this.lastGunfireReport < 1.6) return;
    if (kind === 'gunfire') this.lastGunfireReport = now;
    this.heat = Math.min(110, this.heat + (CRIME_POINTS[kind] || 5));
    this.stars = this.starsFor(this.heat);
    this.unseenTime = 0;
  }

  /** Force at least the given star level (a story beat, a posed scene). */
  forceStars(stars) {
    this.heat = Math.max(this.heat, THRESHOLDS[stars] + 2);
    this.stars = this.starsFor(this.heat);
    this.unseenTime = 0;
  }

  /** All is forgiven (a bust paid for, a job done cleanly). */
  clear() {
    this.heat = 0;
    this.stars = 0;
    this.unseenTime = 0;
  }

  /**
   * Per-frame: seenByPolice resets the escape clock; hidden long enough,
   * heat drains until the stars are gone.
   */
  update(dt, seenByPolice) {
    if (this.stars === 0) return;
    if (seenByPolice) {
      this.unseenTime = 0;
      return;
    }
    this.unseenTime += dt;
    if (this.unseenTime > 7) {
      this.heat = Math.max(0, this.heat - dt * 3.2);
      this.stars = this.starsFor(this.heat);
      if (this.stars === 0) this.heat = 0;
    }
  }
}
