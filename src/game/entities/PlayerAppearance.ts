export type PlayerBodyType = 'average' | 'athletic' | 'muscular' | 'heavy';
export type PlayerOutfit = 'graphic-tee' | 'senator' | 'kaftan' | 'agbero-vest';
export type PlayerFootwear = 'sneakers' | 'slides';
export type PlayerBottoms = 'long' | 'shorts';
export type PlayerHeadwear = 'none' | 'snapback' | 'northern-cap' | 'headwrap';
export type PlayerFacialHair = 'clean' | 'stubble' | 'beard';
export type PlayerHairStyle = 'fade' | 'afro' | 'bald' | 'braids';

export interface PlayerAppearance {
  bodyType: PlayerBodyType;
  outfit: PlayerOutfit;
  shirtColor: number;
  pantsColor: number;
  bottoms: PlayerBottoms;
  footwear: PlayerFootwear;
  shoesColor: number;
  skinTone: number;
  headwear: PlayerHeadwear;
  hairStyle: PlayerHairStyle;
  facialHair: PlayerFacialHair;
  glasses: boolean;
}

export const DEFAULT_PLAYER_APPEARANCE: PlayerAppearance = {
  bodyType: 'muscular',
  outfit: 'graphic-tee',
  shirtColor: 0x176b4a,
  pantsColor: 0x292d35,
  bottoms: 'long',
  footwear: 'sneakers',
  shoesColor: 0xe7e3d8,
  skinTone: 0x8a5a3a,
  headwear: 'snapback',
  hairStyle: 'fade',
  facialHair: 'beard',
  glasses: false
};

export const SHIRT_COLORS = [
  { label: 'Emerald', value: 0x176b4a },
  { label: 'Black', value: 0x202126 },
  { label: 'White', value: 0xe8e4dc },
  { label: 'Indigo', value: 0x285c9a },
  { label: 'Oxblood', value: 0x8c2935 },
  { label: 'Ankara Gold', value: 0xd4a12f }
] as const;

export const TROUSER_COLORS = [
  { label: 'Charcoal', value: 0x292d35 },
  { label: 'Dark Denim', value: 0x22304a },
  { label: 'Sand', value: 0x8a7658 },
  { label: 'Olive', value: 0x3c4530 },
  { label: 'Black', value: 0x18191c }
] as const;

export const SHOE_COLORS = [
  { label: 'Cream', value: 0xe7e3d8 },
  { label: 'Black', value: 0x18191c },
  { label: 'White', value: 0xf0f0ea },
  { label: 'Brown', value: 0x5a4630 },
  { label: 'Red', value: 0x8a2f2f }
] as const;

export const SKIN_TONES = [
  { label: 'Deep ebony', value: 0x5c3218 },
  { label: 'Rich brown', value: 0x6b3f22 },
  { label: 'Warm brown', value: 0x7a4a28 },
  { label: 'Warm caramel', value: 0x8a5a3a },
  { label: 'Golden brown', value: 0x8a5a36 },
  { label: 'Light brown', value: 0x9a6a45 },
  { label: 'Bronze', value: 0xa87a52 }
] as const;

const BODY_TYPES: readonly PlayerBodyType[] = ['average', 'athletic', 'muscular', 'heavy'];
const OUTFITS: readonly PlayerOutfit[] = ['graphic-tee', 'senator', 'kaftan', 'agbero-vest'];
const FOOTWEAR: readonly PlayerFootwear[] = ['sneakers', 'slides'];
const BOTTOMS: readonly PlayerBottoms[] = ['long', 'shorts'];
const HEADWEAR: readonly PlayerHeadwear[] = ['none', 'snapback', 'northern-cap', 'headwrap'];
const HAIR_STYLES: readonly PlayerHairStyle[] = ['fade', 'afro', 'bald', 'braids'];
const FACIAL_HAIR: readonly PlayerFacialHair[] = ['clean', 'stubble', 'beard'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.some((entry) => entry === value);
}

function hasColor(values: ReadonlyArray<{ value: number }>, value: unknown): value is number {
  return typeof value === 'number' && values.some((entry) => entry.value === value);
}

export function isPlayerAppearance(value: unknown): value is PlayerAppearance {
  if (!isRecord(value)) return false;
  return (
    hasValue(BODY_TYPES, value.bodyType) &&
    hasValue(OUTFITS, value.outfit) &&
    hasColor(SHIRT_COLORS, value.shirtColor) &&
    hasColor(TROUSER_COLORS, value.pantsColor) &&
    hasValue(BOTTOMS, value.bottoms) &&
    hasValue(FOOTWEAR, value.footwear) &&
    hasColor(SHOE_COLORS, value.shoesColor) &&
    hasColor(SKIN_TONES, value.skinTone) &&
    hasValue(HEADWEAR, value.headwear) &&
    hasValue(HAIR_STYLES, value.hairStyle) &&
    hasValue(FACIAL_HAIR, value.facialHair) &&
    typeof value.glasses === 'boolean'
  );
}

export function copyPlayerAppearance(appearance: PlayerAppearance): PlayerAppearance {
  return { ...appearance };
}
