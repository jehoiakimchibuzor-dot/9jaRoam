export type ControlMode = 'foot' | 'car' | 'heli' | 'plane' | 'fall';

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
  ejectPressed: boolean;
  chutePressed: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function deadzone(v: number): number {
  return Math.abs(v) < 0.14 ? 0 : v;
}

/* ---------------------------------------------------------------------------
   White line icons. Everything is stroke based so the icons stay crisp at any
   button size and pick up the button colour automatically.
--------------------------------------------------------------------------- */
const ICON = {
  fire: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  sprint: '<path d="M4 17l6-5-6-5"/><path d="M12 17l6-5-6-5"/>',
  jump: '<path d="M12 20V6"/><path d="M6 12l6-6 6 6"/><path d="M5 21h14"/>',
  car: '<path d="M4 15l1.6-4.2A2 2 0 0 1 7.5 9h9a2 2 0 0 1 1.9 1.8L20 15"/><path d="M3 15h18v4h-3"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/>',
  hand: '<path d="M9 11V5a2 2 0 1 1 4 0v5"/><path d="M13 10V4a2 2 0 1 1 4 0v7"/><path d="M17 11V7a2 2 0 1 1 4 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-2.3-4a2 2 0 0 1 3.4-2l1.1 2"/>',
  exit: '<path d="M14 4h5v16h-5"/><path d="M3 12h10"/><path d="M9 8l-4 4 4 4"/>',
  forward: '<path d="M4 12h14"/><path d="M12 6l6 6-6 6"/>',
  back: '<path d="M20 12H6"/><path d="M12 6l-6 6 6 6"/>',
  up: '<path d="M12 20V6"/><path d="M6 12l6-6 6 6"/>',
  down: '<path d="M12 4v14"/><path d="M6 12l6 6 6-6"/>',
  handbrake: '<circle cx="12" cy="12" r="9"/><path d="M9 16V8h3.5a3 3 0 0 1 0 6H9"/>',
  yawLeft: '<path d="M20 12a8 8 0 1 0-2.6 5.9"/><path d="M20 5v6h-6"/>',
  yawRight: '<path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 5v6h6"/>',
  flame: '<path d="M12 3c3 3.5 6 6 6 9a6 6 0 0 1-12 0c0-3 2-5 4-7 0 2 1 3 2 4 0-2 0-4 0-6z"/>',
  chute: '<path d="M3 11a9 7 0 0 1 18 0z"/><path d="M12 11v7"/><path d="M8 18l4-7 4 7"/>',
  eject: '<path d="M12 20V7"/><path d="M6 13l6-6 6 6"/><path d="M4 3h16"/>',
  pause: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  weapon: '<path d="M4 9h12l4 3-1 2h-4v4h-3v-4H8v3H5v-3H4z"/>'
} as const;

type IconName = keyof typeof ICON;

type Slot = 'primary' | 'a1' | 'a2' | 'a3' | 'a4';

interface ActionSpec {
  icon: IconName;
  label: string;
  short?: string;
  down?: () => void;
  up?: () => void;
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
    fPressed: false,
    ejectPressed: false,
    chutePressed: false
  };

  /** Set by Game so the top-left pause button can freeze the world. */
  onPause?: (paused: boolean) => void;

  private mode: ControlMode = 'foot';
  private keys = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  private zoomDelta = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private lookPointer = -1;
  private pinchDist = 0;
  private mouseDragging = false;
  private lastMouse = { x: 0, y: 0 };

  private moveZone!: HTMLDivElement;
  private stickBase!: HTMLDivElement;
  private stickKnob!: HTMLDivElement;
  private stickX = 0;
  private stickY = 0;
  private stickCenter = { x: 0, y: 0 };
  private stickRadius = 44;

  private steerPad!: HTMLDivElement;
  private steerLeft = false;
  private steerRight = false;
  private yawLeft = false;
  private yawRight = false;
  private axisBtnX = 0;
  private keyAxisX = 0;
  private keyAxisY = 0;

  private actionButtons = {} as Record<Slot, HTMLButtonElement>;
  private actionSpecs: Record<Slot, ActionSpec | null> = {
    primary: null,
    a1: null,
    a2: null,
    a3: null,
    a4: null
  };
  private actionPointers = new Map<Slot, number>();

  private pauseButton!: HTMLButtonElement;
  private weaponButton!: HTMLButtonElement;
  private helpSheet!: HTMLDivElement;
  private weaponLabel = '';
  private paused = false;
  private locked = false;
  private weaponTimer: number | null = null;

  // Touch-owned held flags. Keyboard state is merged on top so the two input
  // methods never cancel each other out.
  private touchA = false;
  private touchC = false;
  private touchD = false;
  private touchGas = false;
  private touchReverse = false;
  private touchSprint = false;

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement) {
    this.buildBar();
    this.buildMoveStick();
    this.buildSteering();
    this.buildArc();
    this.buildHelpSheet();
    this.applyLayout();
    this.bindKeyboard();
    this.bindCanvasLook();
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---------------------------------------------------------------- building */

  private buildBar(): void {
    this.pauseButton = document.createElement('button');
    this.pauseButton.type = 'button';
    this.pauseButton.id = 'btn-pause';
    this.pauseButton.className = 'tctrl corner-btn has-label';
    this.pauseButton.setAttribute('aria-label', 'Pause');
    this.pauseButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.paused = !this.paused;
      this.pauseButton.classList.toggle('is-on', this.paused);
      this.pauseButton.setAttribute('aria-label', this.paused ? 'Resume' : 'Pause');
      this.renderPauseButton();
      this.updateHelpSheet();
      this.onPause?.(this.paused);
    });
    this.root.append(this.pauseButton);
    this.renderPauseButton();

    this.weaponButton = document.createElement('button');
    this.weaponButton.type = 'button';
    this.weaponButton.id = 'btn-weapon';
    this.weaponButton.className = 'tctrl corner-btn has-label';
    this.weaponButton.setAttribute('aria-label', 'Weapon selector');
    this.weaponButton.innerHTML = `${this.svg('weapon')}<span class="tctrl-label">WEAPON</span>`;
    this.bindWeaponButton();
    this.root.append(this.weaponButton);
  }

  private renderPauseButton(): void {
    this.pauseButton.innerHTML = `${this.svg(this.paused ? 'play' : 'pause')}<span class="tctrl-label">${this.paused ? 'RESUME' : 'PAUSE'}</span>`;
  }

  /* Pause doubles as the "how do I play this?" screen. The card is built from
     the same action specs that drive the buttons, so it can never go stale. */
  private buildHelpSheet(): void {
    this.helpSheet = document.createElement('div');
    this.helpSheet.id = 'controls-help';
    this.helpSheet.setAttribute('role', 'status');
    this.helpSheet.hidden = true;
    this.root.append(this.helpSheet);
  }

  private updateHelpSheet(): void {
    if (!this.paused) {
      this.helpSheet.hidden = true;
      return;
    }
    this.renderHelpSheet();
    this.helpSheet.hidden = false;
  }

  private renderHelpSheet(): void {
    const titles: Record<ControlMode, [string, string]> = {
      foot: ['ON FOOT', 'Drag MOVE to walk · drag the open screen to look around'],
      car: ['DRIVING', 'Tap LEFT / RIGHT to steer · drag the open screen to look around'],
      heli: ['HELICOPTER', 'Drag MOVE to fly and turn · drag the open screen to look around'],
      plane: ['AIRPLANE', 'Drag MOVE to fly and turn · drag the open screen to look around'],
      fall: ['FREE FALL', 'Drag MOVE to steer · open the CHUTE before you hit the ground']
    };
    const [title, subtitle] = titles[this.mode];
    const rows: string[] = [];

    if (this.mode === 'car') {
      rows.push('<span class="help-key">LEFT / RIGHT</span><span class="help-desc">Steer the car</span>');
    } else {
      rows.push(`<span class="help-key">MOVE</span><span class="help-desc">${this.mode === 'foot' ? 'Walk in any direction' : 'Steer'}</span>`);
    }

    for (const slot of ['primary', 'a1', 'a2', 'a3', 'a4'] as Slot[]) {
      const spec = this.actionSpecs[slot];
      if (!spec) continue;
      rows.push(`<span class="help-key">${spec.short ?? spec.label}</span><span class="help-desc">${spec.label}</span>`);
    }

    rows.push('<span class="help-key">WEAPON</span><span class="help-desc">Tap to switch weapon · hold to reload</span>');

    this.helpSheet.innerHTML =
      `<p class="help-title">${title} · PAUSED</p>` +
      `<p class="help-sub">${subtitle}</p>` +
      `<div class="help-grid">${rows.join('')}</div>` +
      '<p class="help-desktop">KEYBOARD: WASD / arrows move · Shift run · Space jump or handbrake · ' +
      'E enter or exit · F fire · R eject or reload</p>';
  }

  private bindWeaponButton(): void {
    let holdFired = false;
    let pointer = -1;
    const down = (e: PointerEvent): void => {
      if (this.locked) return;
      e.preventDefault();
      e.stopPropagation();
      pointer = e.pointerId;
      holdFired = false;
      this.weaponButton.setPointerCapture(e.pointerId);
      this.weaponButton.classList.add('down');
      if (this.weaponTimer !== null) window.clearTimeout(this.weaponTimer);
      // Long press reloads; a quick tap cycles to the next weapon.
      this.weaponTimer = window.setTimeout(() => {
        holdFired = true;
        this.weaponTimer = null;
        this.state.rPressed = true;
      }, 450);
    };
    const up = (e: PointerEvent): void => {
      if (pointer !== e.pointerId) return;
      pointer = -1;
      this.weaponButton.classList.remove('down');
      if (this.weaponTimer !== null) {
        window.clearTimeout(this.weaponTimer);
        this.weaponTimer = null;
      }
      if (!holdFired) {
        this.state.fPressed = true;
        this.state.ePressed = false;
      }
      e.preventDefault();
    };
    this.weaponButton.addEventListener('pointerdown', down);
    this.weaponButton.addEventListener('pointerup', up);
    this.weaponButton.addEventListener('pointercancel', up);
  }

  private buildMoveStick(): void {
    const zone = document.createElement('div');
    zone.id = 'move-zone';
    zone.className = 'move-zone';
    const base = document.createElement('div');
    base.className = 'stick-base';
    base.innerHTML = '<div class="stick-ring"></div><span class="stick-label">MOVE</span><div class="stick-knob"></div>';
    zone.append(base);
    this.root.append(zone);
    this.moveZone = zone;
    this.stickBase = base;
    this.stickKnob = base.querySelector('.stick-knob') as HTMLDivElement;

    let active = -1;
    let home = { x: 0, y: 0 };

    const setKnob = (dx: number, dy: number): void => {
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const update = (e: PointerEvent): void => {
      const dx = clamp(e.clientX - this.stickCenter.x, -this.stickRadius, this.stickRadius);
      const dy = clamp(e.clientY - this.stickCenter.y, -this.stickRadius, this.stickRadius);
      setKnob(dx, dy);
      this.stickX = deadzone(dx / this.stickRadius);
      this.stickY = deadzone(dy / this.stickRadius);
      this.syncAxes();
    };

    const release = (): void => {
      active = -1;
      this.stickX = 0;
      this.stickY = 0;
      setKnob(0, 0);
      this.stickBase.style.transform = 'translate(0px, 0px)';
      this.syncAxes();
    };

    zone.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.locked || active !== -1) return;
      e.preventDefault();
      e.stopPropagation();
      active = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const rect = this.stickBase.getBoundingClientRect();
      home = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.stickRadius = Math.max(34, this.stickBase.clientWidth * 0.36);
      // Let the stick base slide under the thumb instead of forcing the player
      // to find a fixed ring. It stays clamped so it never leaves the zone.
      const shiftX = clamp(e.clientX - home.x, -this.stickRadius, this.stickRadius);
      const shiftY = clamp(e.clientY - home.y, -this.stickRadius, this.stickRadius);
      this.stickBase.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
      this.stickCenter = { x: home.x + shiftX, y: home.y + shiftY };
      update(e);
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
    zone.addEventListener('lostpointercapture', end);
  }

  private buildSteering(): void {
    const pad = document.createElement('div');
    pad.id = 'steer-pad';
    pad.className = 'steer-pad';
    const left = document.createElement('button');
    left.type = 'button';
    left.id = 'btn-steer-left';
    left.className = 'tctrl steer-btn has-label';
    left.setAttribute('aria-label', 'Steer left');
    left.innerHTML = `${this.svg('back')}<span class="tctrl-label">LEFT</span>`;
    const right = document.createElement('button');
    right.type = 'button';
    right.id = 'btn-steer-right';
    right.className = 'tctrl steer-btn has-label';
    right.setAttribute('aria-label', 'Steer right');
    right.innerHTML = `${this.svg('forward')}<span class="tctrl-label">RIGHT</span>`;
    pad.append(left, right);
    this.root.append(pad);
    this.steerPad = pad;

    const bind = (btn: HTMLButtonElement, side: 'left' | 'right'): void => {
      let pointer = -1;
      const set = (held: boolean): void => {
        if (side === 'left') this.steerLeft = held;
        else this.steerRight = held;
        this.updateAxisButtons();
      };
      const down = (e: PointerEvent): void => {
        if (this.locked) return;
        e.preventDefault();
        e.stopPropagation();
        pointer = e.pointerId;
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('down');
        set(true);
      };
      const up = (e: PointerEvent): void => {
        if (pointer !== e.pointerId) return;
        pointer = -1;
        btn.classList.remove('down');
        set(false);
        e.preventDefault();
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    };
    bind(left, 'left');
    bind(right, 'right');
  }

  private buildArc(): void {
    const slots: Slot[] = ['primary', 'a1', 'a2', 'a3', 'a4'];
    for (const slot of slots) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = `act-${slot}`;
      btn.className = `tctrl arc-${slot} has-label`;
      btn.innerHTML = this.svg('fire');
      btn.classList.add('is-hidden');
      this.root.append(btn);
      this.actionButtons[slot] = btn;
      this.wireAction(btn, slot);
    }
  }

  private wireAction(btn: HTMLButtonElement, slot: Slot): void {
    const down = (e: PointerEvent): void => {
      const spec = this.actionSpecs[slot];
      if (this.locked || !spec) return;
      e.preventDefault();
      e.stopPropagation();
      btn.setPointerCapture(e.pointerId);
      this.actionPointers.set(slot, e.pointerId);
      btn.classList.add('down');
      spec.down?.();
    };
    const up = (e: PointerEvent): void => {
      if (this.actionPointers.get(slot) !== e.pointerId) return;
      this.actionPointers.delete(slot);
      btn.classList.remove('down');
      this.actionSpecs[slot]?.up?.();
      e.preventDefault();
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  }

  private svg(name: IconName): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
  }

  /* ------------------------------------------------------------- mode layout */

  private applyLayout(): void {
    const stick = this.mode === 'foot' || this.mode === 'heli' || this.mode === 'plane' || this.mode === 'fall';
    this.moveZone.classList.toggle('is-hidden', !stick);
    this.steerPad.classList.toggle('is-hidden', this.mode !== 'car');
    for (const slot of ['primary', 'a1', 'a2', 'a3', 'a4'] as Slot[]) {
      this.actionSpecs[slot] = null;
      this.actionButtons[slot].classList.add('is-hidden');
    }

    switch (this.mode) {
      case 'foot':
        this.setAction('primary', {
          icon: 'fire',
          label: 'Attack',
          short: 'FIRE',
          down: () => {
            this.touchA = true;
            this.state.aPressed = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchA = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a1', {
          icon: 'sprint',
          label: 'Sprint',
          short: 'RUN',
          down: () => {
            this.touchSprint = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchSprint = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a2', {
          icon: 'jump',
          label: 'Jump',
          short: 'JUMP',
          down: () => {
            this.touchC = true;
            this.state.cPressed = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchC = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a3', { icon: 'hand', label: 'Interact · enter vehicle', short: 'USE', down: () => (this.state.bPressed = true) });
        break;

      case 'car':
        this.setAction('primary', {
          icon: 'forward',
          label: 'Accelerate',
          short: 'GAS',
          down: () => {
            this.touchGas = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchGas = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a1', {
          icon: 'back',
          label: 'Brake / reverse',
          short: 'BRAKE',
          down: () => {
            this.touchReverse = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchReverse = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a2', {
          icon: 'handbrake',
          label: 'Handbrake',
          short: 'DRIFT',
          down: () => {
            this.touchD = true;
            this.state.dPressed = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchD = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a3', { icon: 'exit', label: 'Exit vehicle', short: 'EXIT', down: () => (this.state.bPressed = true) });
        break;

      case 'heli':
        this.setAction('primary', {
          icon: 'up',
          label: 'Ascend',
          short: 'UP',
          down: () => {
            this.touchGas = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchGas = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a1', {
          icon: 'down',
          label: 'Descend',
          short: 'DOWN',
          down: () => {
            this.touchD = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchD = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a2', {
          icon: 'yawLeft',
          label: 'Yaw left',
          short: 'YAW L',
          down: () => this.setYawButton('left', true),
          up: () => this.setYawButton('left', false)
        });
        this.setAction('a3', {
          icon: 'yawRight',
          label: 'Yaw right',
          short: 'YAW R',
          down: () => this.setYawButton('right', true),
          up: () => this.setYawButton('right', false)
        });
        this.setAction('a4', { icon: 'exit', label: 'Exit helicopter', short: 'EXIT', down: () => (this.state.bPressed = true) });
        break;

      case 'plane':
        this.setAction('primary', {
          icon: 'up',
          label: 'Throttle up',
          short: 'GAS',
          down: () => {
            this.touchGas = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchGas = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a1', {
          icon: 'down',
          label: 'Throttle down / airbrake',
          short: 'SLOW',
          down: () => {
            this.touchReverse = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchReverse = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a2', {
          icon: 'flame',
          label: 'Fire / flare',
          short: 'FIRE',
          down: () => {
            this.touchA = true;
            this.state.aPressed = true;
            this.refreshHeldFlags();
          },
          up: () => {
            this.touchA = false;
            this.refreshHeldFlags();
          }
        });
        this.setAction('a3', { icon: 'exit', label: 'Exit airplane', short: 'EXIT', down: () => (this.state.bPressed = true) });
        break;

      case 'fall':
        this.setAction('primary', {
          icon: 'chute',
          label: 'Deploy parachute',
          short: 'CHUTE',
          down: () => {
            this.state.bPressed = true;
            this.state.chutePressed = true;
          }
        });
        this.setAction('a1', { icon: 'eject', label: 'Eject', short: 'EJECT', down: () => (this.state.ejectPressed = true) });
        break;
    }
  }

  private setAction(slot: Slot, spec: ActionSpec): void {
    this.actionSpecs[slot] = spec;
    const btn = this.actionButtons[slot];
    btn.innerHTML = `${this.svg(spec.icon)}<span class="tctrl-label">${spec.short ?? spec.label}</span>`;
    btn.setAttribute('aria-label', spec.label);
    btn.title = spec.label;
    btn.classList.remove('is-hidden');
  }

  private setYawButton(side: 'left' | 'right', held: boolean): void {
    // Yaw buttons nudge the same lateral axis the stick uses. Holding one while
    // the stick is centred gives a clean constant yaw; the stick still wins if
    // the player pushes it further.
    if (side === 'left') this.yawLeft = held;
    else this.yawRight = held;
    this.updateAxisButtons();
  }

  private updateAxisButtons(): void {
    const padX =
      (this.steerRight ? 1 : 0) -
      (this.steerLeft ? 1 : 0) +
      (this.yawRight ? 1 : 0) -
      (this.yawLeft ? 1 : 0);
    this.axisBtnX = clamp(padX, -1, 1);
    this.syncAxes();
  }

  /* ----------------------------------------------------------------- input IO */

  private syncAxes(): void {
    let x = 0;
    let y = 0;
    if (this.keyAxisX !== 0 || this.keyAxisY !== 0) {
      x = this.keyAxisX;
      y = this.keyAxisY;
    } else {
      x = this.stickX + this.axisBtnX;
      y = this.stickY;
    }
    this.state.moveX = deadzone(clamp(x, -1, 1));
    this.state.moveY = deadzone(clamp(y, -1, 1));
  }

  private refreshHeldFlags(): void {
    const k = this.keys;
    this.state.aHeld = this.touchA || k.has('KeyJ') || k.has('Enter');
    this.state.cHeld = this.touchC;
    this.state.dHeld = this.touchD;
    this.state.gasHeld = this.touchGas || k.has('KeyW') || k.has('ArrowUp');
    this.state.reverseHeld = this.touchReverse || k.has('KeyS') || k.has('ArrowDown');
    this.state.sprintHeld = this.touchSprint || k.has('ShiftLeft') || k.has('ShiftRight');
  }

  private bindKeyboard(): void {
    const down = (e: KeyboardEvent): void => {
      this.keys.add(e.code);
      const repeat = e.repeat;
      if (e.code === 'KeyJ' || e.code === 'Enter') {
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
    this.keyAxisX = x;
    this.keyAxisY = y;
    this.syncAxes();
    this.refreshHeldFlags();
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

  /* --------------------------------------------------------------- public API */

  /** Swap the visible control set. Resets every held input on the way through. */
  setControlMode(mode: ControlMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.reset();
    this.applyLayout();
    if (this.paused) this.updateHelpSheet();
  }

  /** Hide/show the contextual foot interaction button. */
  setEnterVisible(visible: boolean): void {
    const btn = this.actionButtons.a3;
    if (this.mode === 'foot') btn.classList.toggle('is-hidden', !visible);
  }

  /** Reflect the equipped weapon on the top-right selector. */
  setWeaponState(name: string, armed: boolean): void {
    const label = armed ? `Weapon: ${name}` : 'Fists';
    if (label === this.weaponLabel) return;
    this.weaponLabel = label;
    this.weaponButton.classList.toggle('is-armed', armed);
    this.weaponButton.setAttribute('aria-label', label);
  }

  /** Freeze the whole control layer (cutscenes, entering/exiting, death). */
  setControlsEnabled(enabled: boolean): void {
    const locked = !enabled;
    if (this.locked === locked) return;
    this.locked = locked;
    this.root.classList.toggle('is-locked', locked);
    if (locked) this.reset();
  }

  /** Kept for the pause overlay, which can resume the game externally. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.renderPauseButton();
    this.pauseButton.classList.toggle('is-on', paused);
    this.updateHelpSheet();
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

  consumeEject(): boolean {
    const pressed = this.state.ejectPressed;
    this.state.ejectPressed = false;
    return pressed;
  }

  consumeChute(): boolean {
    const pressed = this.state.chutePressed;
    this.state.chutePressed = false;
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
    this.state.cHeld = false;
    this.state.dHeld = false;
    this.state.gasHeld = false;
    this.state.reverseHeld = false;
    this.state.sprintHeld = false;
    this.state.rPressed = false;
    this.state.fPressed = false;
    this.state.ejectPressed = false;
    this.state.chutePressed = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoomDelta = 0;
    this.lookPointer = -1;
    this.pinchDist = 0;
    this.mouseDragging = false;
    this.stickX = 0;
    this.stickY = 0;
    this.stickCenter = { x: 0, y: 0 };
    this.keyAxisX = 0;
    this.keyAxisY = 0;
    this.steerLeft = false;
    this.steerRight = false;
    this.yawLeft = false;
    this.yawRight = false;
    this.axisBtnX = 0;
    this.touchA = false;
    this.touchC = false;
    this.touchD = false;
    this.touchGas = false;
    this.touchReverse = false;
    this.touchSprint = false;
    if (this.weaponTimer !== null) {
      window.clearTimeout(this.weaponTimer);
      this.weaponTimer = null;
    }
    this.stickKnob.style.transform = 'translate(0px, 0px)';
    this.stickBase.style.transform = 'translate(0px, 0px)';
    this.actionPointers.clear();
    for (const btn of Object.values(this.actionButtons)) btn.classList.remove('down');
    this.weaponButton.classList.remove('down');
    this.steerPad.querySelectorAll('.down').forEach((el) => el.classList.remove('down'));
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
