import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export type Palette = {
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
};

export const darkPalette: Palette = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceAlt: 'rgba(255,255,255,0.05)',
  surfaceAltStrong: 'rgba(255,255,255,0.08)',
  topBar: 'rgba(18,18,18,0.95)',
  overlay: 'rgba(0,0,0,0.7)',
  pillDark: 'rgba(0,0,0,0.55)',
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.8)',
  textMuted: 'rgba(255,255,255,0.55)',
  textFaint: 'rgba(255,255,255,0.3)',
  border: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.25)',
  accent: '#9a4dff',
  accentDeep: '#6a2fb3',
  accentBgSoft: 'rgba(154,77,255,0.1)',
  accentBgMed: 'rgba(154,77,255,0.2)',
  accentBorder: 'rgba(154,77,255,0.35)',
  onAccent: '#ffffff',
  gradientMid: 'rgba(20,20,20,0.75)',
};

export const lightPalette: Palette = {
  bg: '#f5f5f7',
  surface: '#ffffff',
  surfaceAlt: 'rgba(0,0,0,0.04)',
  surfaceAltStrong: 'rgba(0,0,0,0.08)',
  topBar: 'rgba(245,245,247,0.95)',
  overlay: 'rgba(0,0,0,0.45)',
  pillDark: 'rgba(0,0,0,0.55)',
  text: '#0a0a0a',
  textSecondary: 'rgba(0,0,0,0.78)',
  textMuted: 'rgba(0,0,0,0.55)',
  textFaint: 'rgba(0,0,0,0.35)',
  border: 'rgba(0,0,0,0.12)',
  borderStrong: 'rgba(0,0,0,0.3)',
  accent: '#7b3bd4',
  accentDeep: '#5a2ba0',
  accentBgSoft: 'rgba(123,59,212,0.1)',
  accentBgMed: 'rgba(123,59,212,0.2)',
  accentBorder: 'rgba(123,59,212,0.35)',
  onAccent: '#ffffff',
  gradientMid: 'rgba(245,245,247,0.75)',
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
