import { ViewStyle } from 'react-native';

/**
 * Claymorphism, as a set of tokens.
 *
 * The whole look rests on one rule: four shadows on every surface, not one.
 * Two outside for the lift, two inside for the thickness, with light always
 * from the top-left and shade always from the bottom-right. Break that
 * consistency anywhere and the surfaces stop reading as one material.
 *
 * React Native could only do a single flat shadow until 0.76, which is why the
 * app used to look like a settings menu. Layered `boxShadow` with `inset` has
 * been available since then and works on both platforms.
 */

export type ThemeName = 'dawn' | 'dusk' | 'midnight';

export type ClayTheme = {
  name: ThemeName;
  label: string;
  /** Page background. */
  ground: string;
  /** Raised surface. Sits above the ground. */
  clayHi: string;
  clayLo: string;
  ink: string;
  ink2: string;
  ink3: string;
  /** Wake, and nothing else -- the sun coming up. */
  dawn: string;
  dawnDeep: string;
  /** Accents and anything selected. */
  dusk: string;
  duskDeep: string;
  /** Awake. */
  moss: string;
  /**
   * On, but not logged in yet -- the lock screen. Deliberately not moss: the
   * PC is there, and none of the buttons will reach it until someone signs in.
   */
  waking: string;
  danger: string;
  /** The two shadow colours the recipe is built from. */
  shadow: string;
  shine: string;
  /** Text that sits on dawn/dusk fills. */
  onFill: string;
};

export const THEMES: Record<ThemeName, ClayTheme> = {
  dawn: {
    name: 'dawn',
    label: 'Dawn',
    ground: '#DED6F0',
    clayHi: '#FBF8FF',
    clayLo: '#DCD2F0',
    ink: '#38305A',
    ink2: '#6C6390',
    ink3: '#9A92B8',
    dawn: '#FF9E7A',
    dawnDeep: '#F0784F',
    dusk: '#7B6BE8',
    duskDeep: '#5A48CF',
    moss: '#3FA97B',
    waking: '#C9862B',
    danger: '#DB4A66',
    shadow: 'rgba(122,104,172,0.38)',
    shine: 'rgba(255,255,255,0.92)',
    onFill: '#FFFFFF',
  },
  dusk: {
    name: 'dusk',
    label: 'Dusk',
    ground: '#2A2036',
    clayHi: '#3B2E4C',
    clayLo: '#231A2E',
    ink: '#F6EDFF',
    ink2: '#C0AFD4',
    ink3: '#8A7AA0',
    dawn: '#FFB183',
    dawnDeep: '#E8834F',
    dusk: '#A48BFF',
    duskDeep: '#7C63E0',
    moss: '#68D6A4',
    waking: '#E9B571',
    danger: '#FF8099',
    shadow: 'rgba(0,0,0,0.50)',
    shine: 'rgba(255,255,255,0.075)',
    onFill: '#1A1226',
  },
  midnight: {
    name: 'midnight',
    label: 'Midnight',
    ground: '#12151F',
    clayHi: '#1F2433',
    clayLo: '#0C0F16',
    ink: '#E8ECF7',
    ink2: '#98A2BA',
    ink3: '#646E88',
    dawn: '#FFA061',
    dawnDeep: '#E07536',
    dusk: '#5D8BFF',
    duskDeep: '#3D66E0',
    moss: '#4FD69A',
    waking: '#E8B15C',
    danger: '#FF6B84',
    shadow: 'rgba(0,0,0,0.62)',
    shine: 'rgba(255,255,255,0.055)',
    onFill: '#0B0E16',
  },
};

/** A surface that sits above the page. */
export function raised(t: ClayTheme, scale = 1): ViewStyle {
  return {
    backgroundColor: t.clayHi,
    boxShadow: [
      { offsetX: 10 * scale, offsetY: 10 * scale, blurRadius: 22 * scale, color: t.shadow },
      { offsetX: -7 * scale, offsetY: -7 * scale, blurRadius: 16 * scale, color: t.shine },
      { offsetX: -3 * scale, offsetY: -3 * scale, blurRadius: 9 * scale, color: t.shadow, inset: true },
      { offsetX: 4 * scale, offsetY: 4 * scale, blurRadius: 10 * scale, color: t.shine, inset: true },
    ],
  };
}

/** A surface pressed into the page — inputs, wells, the status pill. */
export function sunken(t: ClayTheme, scale = 1): ViewStyle {
  return {
    backgroundColor: t.clayLo,
    boxShadow: [
      { offsetX: 5 * scale, offsetY: 5 * scale, blurRadius: 12 * scale, color: t.shadow, inset: true },
      { offsetX: -4 * scale, offsetY: -4 * scale, blurRadius: 10 * scale, color: t.shine, inset: true },
    ],
  };
}

/** What a raised surface becomes while your thumb is on it. */
export function pressed(t: ClayTheme): ViewStyle {
  return {
    transform: [{ scale: 0.93 }],
    boxShadow: [
      { offsetX: 6, offsetY: 6, blurRadius: 13, color: t.shadow, inset: true },
      { offsetX: -4, offsetY: -4, blurRadius: 10, color: t.shine, inset: true },
    ],
  };
}

/** The Wake button: the one filled control in the whole app. */
export function filled(t: ClayTheme, colour: string, deep: string): ViewStyle {
  return {
    backgroundColor: colour,
    boxShadow: [
      { offsetX: 10, offsetY: 10, blurRadius: 22, color: t.shadow },
      { offsetX: -6, offsetY: -6, blurRadius: 14, color: t.shine },
      { offsetX: 3, offsetY: 3, blurRadius: 9, color: 'rgba(255,255,255,0.45)', inset: true },
      { offsetX: -3, offsetY: -3, blurRadius: 9, color: deep, inset: true },
    ],
  };
}

export const RADIUS = { blob: 26, card: 24, pill: 999, field: 18, sheet: 30 };
