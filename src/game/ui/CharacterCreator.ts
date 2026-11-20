import { CharacterPreview } from './CharacterPreview';
import {
  ACCENT_COLORS,
  HAIR_COLORS,
  SHIRT_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  TROUSER_COLORS,
  normalizePlayerAppearance,
  type PlayerAppearance
} from '../entities/PlayerAppearance';

type CreatorValue = string | number | boolean;

interface CreatorGroup {
  label: string;
  field: string;
  choices?: ReadonlyArray<{ label: string; value: CreatorValue }>;
  range?: { min: number; max: number; step: number; format?: (value: number) => string };
}

const GROUPS: CreatorGroup[] = [
  {
    label: 'FACE SHAPE',
    field: 'faceShape',
    choices: [
      { label: 'Oval', value: 'oval' },
      { label: 'Round', value: 'round' },
      { label: 'Square', value: 'square' },
      { label: 'Long', value: 'long' }
    ]
  },
  {
    label: 'EYES',
    field: 'eyeShape',
    choices: [
      { label: 'Standard', value: 'standard' },
      { label: 'Wide', value: 'wide' },
      { label: 'Narrow', value: 'narrow' },
      { label: 'Sharp', value: 'sharp' }
    ]
  },
  {
    label: 'EYEBROWS',
    field: 'browStyle',
    choices: [
      { label: 'Soft', value: 'soft' },
      { label: 'Straight', value: 'straight' },
      { label: 'Angled', value: 'angled' },
      { label: 'Thick', value: 'thick' }
    ]
  },
  {
    label: 'NOSE',
    field: 'noseShape',
    choices: [
      { label: 'Small', value: 'small' },
      { label: 'Straight', value: 'straight' },
      { label: 'Wide', value: 'wide' },
      { label: 'Hooked', value: 'hooked' }
    ]
  },
  {
    label: 'HAIRSTYLE',
    field: 'hairStyle',
    choices: [
      { label: 'Low fade', value: 'fade' },
      { label: 'Afro', value: 'afro' },
      { label: 'Braids', value: 'braids' },
      { label: 'Bald', value: 'bald' }
    ]
  },
  { label: 'HAIR COLOUR', field: 'hairColor', choices: HAIR_COLORS },
  {
    label: 'FACIAL HAIR',
    field: 'facialHair',
    choices: [
      { label: 'Clean', value: 'clean' },
      { label: 'Stubble', value: 'stubble' },
      { label: 'Beard', value: 'beard' }
    ]
  },
  {
    label: 'EYEWEAR',
    field: 'glasses',
    choices: [
      { label: 'None', value: false },
      { label: 'Glasses', value: true }
    ]
  },
  {
    label: 'HEADWEAR',
    field: 'headwear',
    choices: [
      { label: 'None', value: 'none' },
      { label: 'Snapback', value: 'snapback' },
      { label: 'Northern cap', value: 'northern-cap' },
      { label: 'Headwrap', value: 'headwrap' }
    ]
  },
  {
    label: 'CAP DIRECTION',
    field: 'capBackwards',
    choices: [
      { label: 'Front', value: false },
      { label: 'Backwards', value: true }
    ]
  },
  { label: 'ACCENT COLOUR', field: 'accentColor', choices: ACCENT_COLORS },
  {
    label: 'EARRING',
    field: 'earring',
    choices: [
      { label: 'Off', value: false },
      { label: 'On', value: true }
    ]
  },
  {
    label: 'BODY TYPE',
    field: 'bodyType',
    choices: [
      { label: 'Average', value: 'average' },
      { label: 'Athletic', value: 'athletic' },
      { label: 'Muscular', value: 'muscular' },
      { label: 'Heavy', value: 'heavy' }
    ]
  },
  {
    label: 'HEIGHT',
    field: 'heightScale',
    range: { min: 0.92, max: 1.08, step: 0.02, format: (v) => `${Math.round(v * 100)}%` }
  },
  {
    label: 'SHOULDERS',
    field: 'shoulderScale',
    range: { min: 0.92, max: 1.08, step: 0.02, format: (v) => `${Math.round(v * 100)}%` }
  },
  {
    label: 'OUTFIT',
    field: 'outfit',
    choices: [
      { label: 'Graphic tee', value: 'graphic-tee' },
      { label: 'Senator', value: 'senator' },
      { label: 'Kaftan', value: 'kaftan' },
      { label: 'Agbero vest', value: 'agbero-vest' }
    ]
  },
  {
    label: 'TROUSERS',
    field: 'bottoms',
    choices: [
      { label: 'Long', value: 'long' },
      { label: 'Shorts', value: 'shorts' }
    ]
  },
  {
    label: 'FOOTWEAR',
    field: 'footwear',
    choices: [
      { label: 'Sneakers', value: 'sneakers' },
      { label: 'Slides', value: 'slides' }
    ]
  },
  { label: 'SHIRT COLOUR', field: 'shirtColor', choices: SHIRT_COLORS },
  { label: 'TROUSER COLOUR', field: 'pantsColor', choices: TROUSER_COLORS },
  { label: 'SHOE COLOUR', field: 'shoesColor', choices: SHOE_COLORS },
  { label: 'SKIN TONE', field: 'skinTone', choices: SKIN_TONES }
];

function readField(appearance: PlayerAppearance, field: string): CreatorValue {
  const direct = (appearance as unknown as Record<string, CreatorValue | undefined>)[field];
  if (direct !== undefined) return direct;
  const features = appearance.features as unknown as Record<string, CreatorValue>;
  return features[field];
}

function withField(appearance: PlayerAppearance, field: string, value: CreatorValue): PlayerAppearance {
  const directFields: Record<string, true> = {
    bodyType: true,
    outfit: true,
    shirtColor: true,
    pantsColor: true,
    bottoms: true,
    footwear: true,
    shoesColor: true,
    skinTone: true,
    headwear: true,
    hairStyle: true,
    facialHair: true,
    glasses: true
  };
  if (directFields[field]) {
    return { ...appearance, [field]: value } as PlayerAppearance;
  }
  return {
    ...appearance,
    features: {
      ...appearance.features!,
      [field]: value
    }
  } as PlayerAppearance;
}

/**
 * Full character creator overlay. The preview is the same renderer used by the
 * in-game player, so every edit is an exact preview of the final character.
 * It only runs while the overlay is open, then disposes completely.
 */
export class CharacterCreator {
  private overlay: HTMLElement | null = document.getElementById('character-creator');
  private canvas: HTMLCanvasElement | null = document.getElementById('creator-preview-canvas') as HTMLCanvasElement | null;
  private controls: HTMLElement | null = document.getElementById('creator-controls');
  private preview: CharacterPreview | null = null;
  private current: PlayerAppearance = normalizePlayerAppearance(null);
  private applyCallback: ((appearance: PlayerAppearance) => void) | null = null;
  private closeCallback: (() => void) | null = null;

  constructor() {
    document.getElementById('creator-cancel')?.addEventListener('click', () => this.close());
    document.getElementById('creator-close')?.addEventListener('click', () => this.close());
    document.getElementById('creator-apply')?.addEventListener('click', () => {
      const callback = this.applyCallback;
      this.close();
      callback?.(normalizePlayerAppearance(this.current));
    });
  }

  get isOpen(): boolean {
    return Boolean(this.overlay?.classList.contains('is-active'));
  }

  open(
    appearance: PlayerAppearance,
    onApply: (appearance: PlayerAppearance) => void,
    onClose?: () => void
  ): void {
    if (this.isOpen) return;
    this.current = normalizePlayerAppearance(appearance);
    this.applyCallback = onApply;
    this.closeCallback = onClose ?? null;

    if (this.canvas) {
      this.preview = new CharacterPreview(this.canvas);
      this.preview.start();
      this.preview.setAppearance(this.current);
    }

    this.render();
    this.overlay?.classList.remove('is-hidden');
    this.overlay?.classList.add('is-active');
    document.body.classList.add('creator-active');
    document.dispatchEvent(new CustomEvent('creator-statechange'));
  }

  close(): void {
    this.overlay?.classList.remove('is-active');
    this.overlay?.classList.add('is-hidden');
    document.body.classList.remove('creator-active');
    document.dispatchEvent(new CustomEvent('creator-statechange'));
    this.preview?.stop();
    this.preview = null;
    const callback = this.closeCallback;
    this.applyCallback = null;
    this.closeCallback = null;
    callback?.();
  }

  private render(): void {
    if (!this.controls) return;
    // Keep the player's place in the long list when a single choice rerenders.
    const controlsScroll = this.controls.scrollTop;
    const layoutScroll = this.controls.parentElement?.scrollTop ?? 0;
    this.controls.innerHTML = '';

    GROUPS.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'creator-group';
      const title = document.createElement('div');
      title.className = 'creator-group-title';
      title.textContent = group.label;
      section.appendChild(title);

      if (group.range) {
        const row = document.createElement('label');
        row.className = 'creator-range';
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(group.range.min);
        input.max = String(group.range.max);
        input.step = String(group.range.step);
        const value = Number(readField(this.current, group.field));
        input.value = String(value);
        const output = document.createElement('span');
        output.textContent = group.range.format ? group.range.format(value) : String(value);
        input.addEventListener('input', () => {
          const nextValue = Number(input.value);
          output.textContent = group.range?.format ? group.range.format(nextValue) : String(nextValue);
          this.update(group.field, nextValue);
        });
        row.append(input, output);
        section.appendChild(row);
      } else {
        const row = document.createElement('div');
        row.className = 'creator-choices';
        group.choices?.forEach((choice) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'creator-choice';
          button.textContent = choice.label;
          if (readField(this.current, group.field) === choice.value) {
            button.classList.add('is-selected');
          }
          button.addEventListener('click', () => {
            this.update(group.field, choice.value);
            this.render();
          });
          row.appendChild(button);
        });
        section.appendChild(row);
      }

      this.controls!.appendChild(section);
    });

    this.controls.scrollTop = controlsScroll;
    if (this.controls.parentElement) this.controls.parentElement.scrollTop = layoutScroll;
  }

  private update(field: string, value: CreatorValue): void {
    this.current = withField(this.current, field, value);
    this.preview?.setAppearance(this.current);
  }
}

let sharedCreator: CharacterCreator | null = null;

/** One instance owns the overlay's buttons, so never construct it twice. */
export function getCharacterCreator(): CharacterCreator {
  if (!sharedCreator) sharedCreator = new CharacterCreator();
  return sharedCreator;
}
