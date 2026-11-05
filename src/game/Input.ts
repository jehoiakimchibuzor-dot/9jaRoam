export interface InputState {
  moveX: number;
  moveY: number;
  aHeld: boolean;
  aPressed: boolean;
  bPressed: boolean;
  cPressed: boolean;
  cHeld: boolean;
  dPressed: boolean;
  ePressed: boolean;
  dHeld: boolean;
  gasHeld: boolean;
  reverseHeld: boolean;
  sprintHeld: boolean;
  rPressed: boolean;
  fPressed: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function deadzone(v: number): number {
  return Math.abs(v) < 0.14 ? 0 : v;
}

export class Input {
  readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    aHeld: false,
    aPressed: false,
    bPressed: false,
    cPressed: false,
    cHeld: false,
    dPressed: false,
    ePressed: false,
    dHeld: false,
    gasHeld: false,
    reverseHeld: false,
    sprintHeld: false,
    rPressed: false,
    fPressed: false
  };

  private keys = new Set<string>();
  private disabledButtons = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  private zoomDelta = 0;
  private leftKnob: HTMLElement | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private lookPointer = -1;
  private stickActive = false;
  private pinchDist = 0;
  private mouseDragging = false;
  private lastMouse = { x: 0, y: 0 };

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement) {
    this.buildStick();
    this.buildButtons();
    this.bindKeyboard();
    this.bindCanvasLook();
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  private buildStick(): void {
    const left = document.createElement('div');
    left.id = 'stick-left';
    left.className = 'stick-zone';
    left.innerHTML = '<div class="stick-ring"></div><div class="stick-knob"></div>';
    this.root.append(left);
    this.leftKnob = left.querySelector('.stick-knob');
    this.bindMoveStick(left);
  }

  private bindMoveStick(zone: HTMLElement): void {
    let active = -1;
    let center = { x: 0, y: 0 };
    const radius = () => zone.clientWidth * 0.32;
    const knob = this.leftKnob;

    const setKnob = (dx: number, dy: number): void => {
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const update = (e: PointerEvent): void => {
      const dx = clamp(e.clientX - center.x, -radius(), radius());
      const dy = clamp(e.clientY - center.y, -radius(), radius());
      setKnob(dx, dy);
      this.state.moveX = deadzone(dx / radius());
      this.state.moveY = deadzone(dy / radius());
    };

    const release = (): void => {
      active = -1;
      this.stickActive = false;
      setKnob(0, 0);
      this.state.moveX = 0;
      this.state.moveY = 0;
    };

    zone.addEventListener('pointerdown', (e: PointerEvent) => {
      active = e.pointerId;
      this.stickActive = true;
      zone.setPointerCapture(e.pointerId);
      const rect = zone.getBoundingClientRect();
      center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      update(e);
      e.preventDefault();
      e.stopPropagation();
    });
    zone.addEventListener('pointermove', (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      update(e);
      e.preventDefault();
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== active) return;
      release();
      e.preventDefault();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private buildButtons(): void {
    this.makeButton('btn-a', 'A', 'FIRE', (down) => {
      this.state.aHeld = down;
      if (down) this.state.aPressed = true;
    });
    this.makeButton('btn-b', 'B', 'USE', (down) => {
      if (down) this.state.bPressed = true;
    });
    this.makeButton('btn-c', 'C', 'JUMP', (down) => {
      this.state.cHeld = down;
      if (down) this.state.cPressed = true;
    });
    this.makeButton('btn-d', 'D', 'CROUCH', (down) => {
      this.state.dHeld = down;
      if (down) this.state.dPressed = true;
    });
    this.makeButton('btn-gas', 'G', 'GAS', (down) => {
      this.state.gasHeld = down;
    });
    this.makeButton('btn-rev', 'S', 'REVERSE', (down) => {
      this.state.reverseHeld = down;
    });
    this.makeButton('btn-e', 'E', 'WEAPON', (down) => {
      if (down) this.state.ePressed = true;
    });
    this.makeButton('btn-f', 'F', 'NEXT GUN', (down) => {
      if (down) this.state.fPressed = true;
    });
    this.makeButton('btn-r', 'R', 'RELOAD', (down) => {
      if (down) this.state.rPressed = true;
    });
  }

  private makeButton(
    id: string,
    letter: string,
    sub: string,
    handler: (down: boolean) => void
  ): void {
    const btn = document.createElement('div');
    btn.id = id;
    btn.className = 'abtn';
    btn.innerHTML = `<span class="abtn-letter">${letter}</span><span class="abtn-sub">${sub}</span>`;
    this.root.append(btn);
    const down = (e: PointerEvent): void => {
      if (this.disabledButtons.has(id)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      btn.classList.add('down');
      handler(true);
      e.preventDefault();
      e.stopPropagation();
    };
    const up = (e: PointerEvent): void => {
      btn.classList.remove('down');
      handler(false);
      e.preventDefault();
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  setButtonLabel(id: string, sub: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    const subEl = el.querySelector('.abtn-sub');
    if (subEl && subEl.textContent !== sub) subEl.textContent = sub;
  }

  setButtonEnabled(id: string, enabled: boolean): void {
    const el = document.getElementById(id);
    if (!el) return;
    if (enabled) this.disabledButtons.delete(id);
    else {
      this.disabledButtons.add(id);
      el.classList.remove('down');
    }
    el.classList.toggle('is-disabled', !enabled);
  }

  setButtonActive(id: string, active: boolean): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('is-active', active);
  }

  private bindKeyboard(): void {
    const down = (e: KeyboardEvent): void => {
      this.keys.add(e.code);
      const repeat = e.repeat;
      if (e.code === 'KeyJ' || e.code === 'Enter') {
        this.state.aHeld = true;
        if (!repeat) this.state.aPressed = true;
      }
      if (e.code === 'KeyE' && !repeat) this.state.bPressed = true;
      if (e.code === 'Space' && !repeat) this.state.cPressed = true;
      if (e.code === 'KeyC' && !repeat) this.state.dPressed = true;
      if (e.code === 'KeyQ' && !repeat) this.state.ePressed = true;
      if (e.code === 'KeyF' && !repeat) this.state.fPressed = true;
      if (e.code === 'KeyR' && !repeat) this.state.rPressed = true;
      this.refreshKeyboard();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent): void => {
      this.keys.delete(e.code);
      if (e.code === 'KeyJ' || e.code === 'Enter') this.state.aHeld = false;
      this.refreshKeyboard();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
  }

  private refreshKeyboard(): void {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
    }
    if (x !== 0 || y !== 0) {
      this.state.moveX = x;
      this.state.moveY = y;
    } else if (!this.stickActive) {
      this.state.moveX = 0;
      this.state.moveY = 0;
    }
    this.state.sprintHeld = k.has('ShiftLeft') || k.has('ShiftRight');
    this.state.gasHeld = k.has('KeyW') || k.has('ArrowUp');
    this.state.reverseHeld = k.has('KeyS') || k.has('ArrowDown');
  }

  private bindCanvasLook(): void {
    const c = this.canvas;

    c.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.pointerType === 'touch') {
        if (this.pointers.size === 1) {
          this.lookPointer = e.pointerId;
        } else if (this.pointers.size === 2) {
          this.lookPointer = -1;
          const pts = [...this.pointers.values()];
          this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        }
      } else {
        this.mouseDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        c.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
    });

    c.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId)!;
      const cur = { x: e.clientX, y: e.clientY };
      this.pointers.set(e.pointerId, cur);

      if (e.pointerType === 'touch') {
        if (this.pointers.size >= 2) {
          const pts = [...this.pointers.values()];
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this.zoomDelta += (this.pinchDist - d) * 0.012;
          this.pinchDist = d;
        } else if (e.pointerId === this.lookPointer) {
          this.lookDX += cur.x - prev.x;
          this.lookDY += cur.y - prev.y;
        }
      } else if (this.mouseDragging) {
        this.lookDX += cur.x - this.lastMouse.x;
        this.lookDY += cur.y - this.lastMouse.y;
        this.lastMouse = cur;
      }
      e.preventDefault();
    });

    const endPointer = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      if (e.pointerId === this.lookPointer) this.lookPointer = -1;
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (e.pointerType !== 'touch') this.mouseDragging = false;
    };
    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', endPointer);

    c.addEventListener('wheel', (e: WheelEvent) => {
      this.zoomDelta += e.deltaY * 0.004;
      e.preventDefault();
    }, { passive: false });
  }

  consumeA(): boolean {
    const pressed = this.state.aPressed;
    this.state.aPressed = false;
    return pressed;
  }

  consumeB(): boolean {
    const pressed = this.state.bPressed;
    this.state.bPressed = false;
    return pressed;
  }

  consumeC(): boolean {
    const pressed = this.state.cPressed;
    this.state.cPressed = false;
    return pressed;
  }

  consumeD(): boolean {
    const pressed = this.state.dPressed;
    this.state.dPressed = false;
    return pressed;
  }

  consumeE(): boolean {
    const pressed = this.state.ePressed;
    this.state.ePressed = false;
    return pressed;
  }

  consumeF(): boolean {
    const pressed = this.state.fPressed;
    this.state.fPressed = false;
    return pressed;
  }

  consumeR(): boolean {
    const pressed = this.state.rPressed;
    this.state.rPressed = false;
    return pressed;
  }

  reset(): void {
    this.keys.clear();
    this.pointers.clear();
    this.state.moveX = 0;
    this.state.moveY = 0;
    this.state.aHeld = false;
    this.state.aPressed = false;
    this.state.bPressed = false;
    this.state.cPressed = false;
    this.state.dPressed = false;
    this.state.ePressed = false;
    this.state.dHeld = false;
    this.state.gasHeld = false;
    this.state.reverseHeld = false;
    this.state.sprintHeld = false;
    this.state.rPressed = false;
    this.state.fPressed = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoomDelta = 0;
    this.lookPointer = -1;
    this.stickActive = false;
    this.pinchDist = 0;
    this.mouseDragging = false;
    if (this.leftKnob) this.leftKnob.style.transform = 'translate(0px, 0px)';
    for (const btn of this.root.querySelectorAll('.abtn.down')) btn.classList.remove('down');
  }

  consumeLook(): { x: number; y: number } {
    const out = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  consumeZoom(): number {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }
}
