import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export type Palette = {
  isDark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceAltStrong: string;
  topBar: string;
  overlay: string;
  pillDark: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentDeep: string;
  accentBgSoft: string;
  accentBgMed: string;
  accentBorder: string;
  onAccent: string;
  gradientMid: string;
  focus: string;
  success: string;
  warning: string;
  danger: string;
  /**
   * The arcade accents, named rather than numbered because the design uses them
   * by name. `cream` is the card face — note this is *not* `surface`, which is
   * the dark panel behind it; the two were easy to confuse when the web and
   * native palettes were separate files.
   */
  cream: string;
  violet: string;
  tangerine: string;
  mint: string;
  lime: string;
  /**
   * Ink for text sitting on the light card face — cream in dark mode, white in
   * light mode. Constant across both schemes precisely because the card face is
   * light either way, so these must not be flipped with the rest of the theme.
   */
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  /** The discovery card's own background, which is light in both schemes. */
  cardFace: string;
};

export const darkPalette: Palette = {
  isDark: true,
  bg: '#15111F',
  surface: '#241B35',
  surfaceAlt: 'rgba(255,255,255,0.05)',
  surfaceAltStrong: 'rgba(255,255,255,0.09)',
  topBar: 'rgba(21,17,31,0.95)',
  overlay: 'rgba(10,7,17,0.72)',
  pillDark: 'rgba(0,0,0,0.55)',
  text: '#F9F5EF',
  textSecondary: 'rgba(249,245,239,0.8)',
  textMuted: '#B8AFC7',
  textFaint: 'rgba(249,245,239,0.34)',
  border: 'rgba(255,255,255,0.16)',
  borderStrong: 'rgba(255,255,255,0.32)',
  // `accent` is used both as a fill (with `onAccent` on top) and as a
  // foreground for icons and links, so it has to clear AA against `bg` either
  // way. Lime manages 14.95:1 on the violet ground in both directions.
  accent: '#D7F36A',
  accentDeep: '#A8C43F',
  accentBgSoft: 'rgba(215,243,106,0.12)',
  accentBgMed: 'rgba(215,243,106,0.22)',
  accentBorder: 'rgba(215,243,106,0.38)',
  onAccent: '#15111F',
  gradientMid: 'rgba(21,17,31,0.75)',
  focus: '#B6F0D2',
  success: '#B6F0D2',
  warning: '#FF8A5B',
  danger: '#FF6B7A',
  cream: '#F4F1EA',
  violet: '#7C5CFC',
  tangerine: '#FF8A5B',
  mint: '#B6F0D2',
  lime: '#D7F36A',
  ink: '#171225',
  inkSecondary: '#4A4057',
  inkMuted: '#645A72',
  cardFace: '#F4F1EA',
};

export const lightPalette: Palette = {
  isDark: false,
  bg: '#F4F1EA',
  surface: '#FFFFFF',
  surfaceAlt: 'rgba(21,17,31,0.04)',
  surfaceAltStrong: 'rgba(21,17,31,0.09)',
  topBar: 'rgba(244,241,234,0.95)',
  overlay: 'rgba(21,17,31,0.45)',
  pillDark: 'rgba(21,17,31,0.55)',
  text: '#15111F',
  textSecondary: 'rgba(21,17,31,0.78)',
  textMuted: '#5A5168',
  textFaint: 'rgba(21,17,31,0.35)',
  border: 'rgba(21,17,31,0.12)',
  borderStrong: 'rgba(21,17,31,0.3)',
  // Lime cannot be the light-mode accent: it manages 1.4:1 on cream, so every
  // icon drawn in it would vanish. Violet clears 6.49:1 and keeps lime
  // available as a fill, where dark text sits on top of it.
  accent: '#5B2BE0',
  accentDeep: '#43199F',
  accentBgSoft: 'rgba(91,43,224,0.1)',
  accentBgMed: 'rgba(91,43,224,0.2)',
  accentBorder: 'rgba(91,43,224,0.35)',
  onAccent: '#FFFFFF',
  gradientMid: 'rgba(244,241,234,0.75)',
  focus: '#43199F',
  success: '#187A3D',
  warning: '#8A5A00',
  danger: '#B42335',
  cream: '#F4F1EA',
  violet: '#5B2BE0',
  // The dark-mode tangerine only reaches 2.3:1 on cream; this one clears AA.
  tangerine: '#B4491F',
  mint: '#187A3D',
  lime: '#D7F36A',
  ink: '#171225',
  inkSecondary: '#4A4057',
  inkMuted: '#645A72',
  cardFace: '#FFFFFF',
};

const STORAGE_KEY = 'godiscover:theme-mode:v1';

export async function loadThemeMode(): Promise<ThemeMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {}
  return 'system';
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export function resolvePalette(mode: ThemeMode, systemIsDark: boolean): Palette {
  if (mode === 'dark') return darkPalette;
  if (mode === 'light') return lightPalette;
  return systemIsDark ? darkPalette : lightPalette;
}

/**
 * The chosen mode lives in a module-level store rather than component state,
 * because two trees need it and they must agree: the screen paints itself from
 * the resolved palette, while the root layout drives the navigation theme and
 * the status bar. When only the screen knew, forcing dark on a light-mode phone
 * left the status bar drawing dark text over a near-black bar.
 *
 * A store rather than a context so `useAppTheme` works anywhere — including in
 * tests that render a screen on its own — with no provider to remember.
 */
let currentMode: ThemeMode = 'system';
const modeListeners = new Set<() => void>();

function emitModeChange(): void {
  for (const listener of modeListeners) listener();
}

export function getThemeMode(): ThemeMode {
  return currentMode;
}

export function subscribeThemeMode(listener: () => void): () => void {
  modeListeners.add(listener);
  return () => {
    modeListeners.delete(listener);
  };
}

/** Applies immediately and persists in the background. */
export function setThemeMode(mode: ThemeMode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  emitModeChange();
  void saveThemeMode(mode);
}

/** Reads the stored preference once at startup. */
export async function hydrateThemeMode(): Promise<void> {
  const stored = await loadThemeMode();
  if (stored === currentMode) return;
  currentMode = stored;
  emitModeChange();
}

/** Test seam: drops the in-memory preference back to its initial value. */
export function resetThemeModeForTests(): void {
  currentMode = 'system';
  modeListeners.clear();
}
