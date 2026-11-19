// The HUD: DOM overlays above the canvas — cash and wanted stars, health,
// ammunition or speed, the objective banner, prompts, toasts, the bust meter,
// and the title / pause / game-over screens. main.js feeds it numbers; this
// file only knows how to show them.

function el(id) {
  return document.getElementById(id);
}

export class Hud {
  constructor() {
    this.cashEl = el('hud-cash');
    this.starsEl = el('hud-stars');
    this.healthFill = el('health-fill');
    this.healthBox = el('health-box');
    this.ammoEl = el('hud-ammo');
    this.speedEl = el('hud-speed');
    this.objectiveBox = el('objective');
    this.objectiveTitle = el('objective-title');
    this.objectiveText = el('objective-text');
    this.objectiveExtra = el('objective-extra');
    this.promptEl = el('prompt');
    this.toastBox = el('toast');
    this.toastTitle = el('toast-title');
    this.toastSub = el('toast-sub');
    this.bustBox = el('bust-box');
    this.bustFill = el('bust-fill');
    this.vignette = el('vignette');
    this.crosshair = el('crosshair');
    this.screens = {
      title: el('title-screen'),
      pause: el('pause-screen'),
      over: el('over-screen'),
    };
    this.toastTimer = 0;
    this.vignetteLevel = 0;
    this.lastCash = null;
    this.lastStars = null;
  }

  setCash(cash) {
    if (cash === this.lastCash) return;
    this.lastCash = cash;
    this.cashEl.textContent = '$' + cash.toLocaleString('en-US');
  }

  setStars(stars) {
    if (stars === this.lastStars) return;
    this.lastStars = stars;
    this.starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.starsEl.classList.toggle('hot', stars > 0);
  }

  setHealth(health) {
    const pct = Math.max(0, Math.min(100, health));
    this.healthFill.style.width = pct + '%';
    this.healthFill.style.background = pct < 28 ? '#e33d2e' : pct < 55 ? '#e8a13a' : '#57c84c';
    this.healthBox.classList.toggle('low', pct < 28);
  }

  /** Show ammunition on foot, speed in a car, or neither in menus. */
  setReadout({ ammo = null, reserve = null, reloading = false, speedKmh = null }) {
    if (speedKmh !== null) {
      this.ammoEl.style.display = 'none';
      this.speedEl.style.display = 'block';
      this.speedEl.textContent = `${Math.round(speedKmh)} km/h`;
    } else if (ammo !== null) {
      this.speedEl.style.display = 'none';
      this.ammoEl.style.display = 'block';
      this.ammoEl.textContent = reloading ? 'RELOADING' : `PISTOL ${ammo} / ${reserve}`;
    } else {
      this.ammoEl.style.display = 'none';
      this.speedEl.style.display = 'none';
    }
  }

  setObjective({ title, text, extra }) {
    this.objectiveTitle.textContent = title || '';
    this.objectiveText.textContent = text || '';
    this.objectiveExtra.textContent = extra || '';
    this.objectiveBox.style.display = title ? 'block' : 'none';
  }

  setPrompt(text) {
    this.promptEl.textContent = text || '';
    this.promptEl.style.display = text ? 'block' : 'none';
  }

  setCrosshair(visible) {
    this.crosshair.style.display = visible ? 'block' : 'none';
  }

  /** A timed announcement: job titles, Sal's lines, warnings. */
  toast(title, sub = '', seconds = 4.5) {
    this.toastTitle.textContent = title;
    this.toastSub.textContent = sub;
    this.toastBox.classList.add('show');
    this.toastTimer = seconds;
  }

  /** The bust meter: fraction 0..1 while police pin the player, else null. */
  setBust(fraction) {
    if (fraction === null || fraction <= 0.01) {
      this.bustBox.style.display = 'none';
      return;
    }
    this.bustBox.style.display = 'block';
    this.bustFill.style.width = Math.min(100, fraction * 100) + '%';
  }

  /** A red edge flash when Marco takes a hit. */
  damageFlash(strength = 0.55) {
    this.vignetteLevel = Math.max(this.vignetteLevel, strength);
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastBox.classList.remove('show');
    }
    if (this.vignetteLevel > 0) {
      this.vignetteLevel = Math.max(0, this.vignetteLevel - dt * 0.7);
      this.vignette.style.opacity = this.vignetteLevel.toFixed(3);
    }
  }

  /** Show one full-screen overlay ('title' | 'pause' | 'over') or none. */
  showScreen(name) {
    for (const key of Object.keys(this.screens)) {
      this.screens[key].style.display = key === name ? 'flex' : 'none';
    }
  }

  /** Fill the game-over screen for a bust or a wreck. */
  setGameOver(kind, line) {
    el('over-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    el('over-title').className = kind === 'busted' ? 'over-busted' : 'over-wasted';
    el('over-line-flavor').textContent = line;
  }
}
