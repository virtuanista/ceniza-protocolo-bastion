// Entrada de ratón y teclado con bloqueo de puntero y asignaciones configurables.
export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC', crouchAlt: 'ControlLeft',
  reload: 'KeyR', interact: 'KeyE', heal: 'KeyQ', grenade: 'KeyG',
  melee: 'KeyV', flashlight: 'KeyF', welder: 'KeyT', dropCash: 'KeyZ',
  scoreboard: 'Tab', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3',
  slot4: 'Digit4', slot5: 'Digit5', lastWeapon: 'KeyX', pause: 'Escape', chat: 'Enter',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
    this.binds = { ...DEFAULT_BINDS };
    this.locked = false;
    this.enabled = true;
    this.onUnlock = null;
    this.sensitivity = 1;
    this.invertY = false;
    this.textFocus = false;

    window.addEventListener('keydown', (e) => {
      if (this.textFocus) return;
      if (e.code === 'Tab' || (this.locked && e.code !== 'F11' && e.code !== 'F5' && e.code !== 'F12')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Descarta picos anómalos que algunos navegadores producen al bloquear el puntero
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignorado */ } });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* ignorado */ }
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(action) {
    const code = this.binds[action];
    if (action === 'crouch') return this.keys.has(code) || this.keys.has(this.binds.crouchAlt);
    return this.keys.has(code);
  }
  hit(action) {
    const code = this.binds[action];
    if (action === 'crouch') return this.pressed.has(code) || this.pressed.has(this.binds.crouchAlt);
    return this.pressed.has(code);
  }
  up(action) { return this.released.has(this.binds[action]); }
  codeHit(code) { return this.pressed.has(code); }

  consumeMouse() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
    return d;
  }
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
  }
}
