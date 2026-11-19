// Keyboard and mouse state: held keys, one-shot presses, pointer-lock mouse look
// and clicks. The game polls this every frame; nothing here knows the game rules.

export const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  clicked: false,
  mouseDown: false,
  locked: false,
  enabled: true,

  init(canvas) {
    window.addEventListener('keydown', (event) => {
      if (!event.repeat) this.pressed.add(event.code);
      this.keys.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('click', () => {
      if (this.enabled && !this.locked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseDX += event.movementX || 0;
      this.mouseDY += event.movementY || 0;
    });
    document.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        if (this.locked) this.clicked = true;
      }
    });
    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
  },

  /** True while the key is held. */
  down(code) {
    return this.keys.has(code);
  },

  /** True only on the frame the key went down. */
  tapped(code) {
    return this.pressed.has(code);
  },

  /** Read and clear the accumulated mouse movement. */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  },

  /** Call at the end of every frame to clear one-shot state. */
  endFrame() {
    this.pressed.clear();
    this.clicked = false;
  },

  /** Release the pointer (menus, pause, game over). */
  unlock() {
    if (this.locked) document.exitPointerLock();
  },
};
