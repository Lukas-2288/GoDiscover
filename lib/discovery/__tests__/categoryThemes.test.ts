import type { ContentCategory } from "../../../types/content";
import {
  CATEGORY_ORDER,
  CATEGORY_THEMES,
  getCategoryTheme,
  resolveCategorySecondary,
} from "../categoryThemes";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("category themes", () => {
  it("defines one complete theme for every category", () => {
    const expected: ContentCategory[] = ["artists", "albums", "books", "movies"];
    expect(CATEGORY_ORDER).toEqual(expected);
    expect(Object.keys(CATEGORY_THEMES).sort()).toEqual([...expected].sort());
    for (const category of expected) {
      expect(getCategoryTheme(category).label.length).toBeGreaterThan(0);
      expect(getCategoryTheme(category).badge.length).toBeGreaterThan(0);
    }
  });

  it("keeps text on category accents at WCAG AA contrast", () => {
    for (const category of CATEGORY_ORDER) {
      const theme = getCategoryTheme(category);
      expect(contrast(theme.accent, theme.onAccent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The secondary colour labels the second external-link button, so it has to
  // clear AA as text. No single hex manages that on both the dark surface and
  // the cream card — #0095D8 reaches only 2.96 on cream, #006FA3 only 3.34 on
  // dark — which is why the theme carries a light/dark pair.
  const DARK_SURFACE = "#141414";
  const LIGHT_SURFACE = "#ffffff";
  const CREAM_CARD = "#F4F1EA";

  it("keeps the secondary accent at AA on the surface it is resolved for", () => {
    for (const category of CATEGORY_ORDER) {
      const theme = getCategoryTheme(category);
      expect(
        contrast(resolveCategorySecondary(theme, true), DARK_SURFACE)
      ).toBeGreaterThanOrEqual(4.5);
      for (const surface of [LIGHT_SURFACE, CREAM_CARD]) {
        expect(
          contrast(resolveCategorySecondary(theme, false), surface)
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("resolves the secondary accent by active scheme", () => {
    for (const category of CATEGORY_ORDER) {
      const theme = getCategoryTheme(category);
      expect(resolveCategorySecondary(theme, true)).toBe(theme.secondaryDark);
      expect(resolveCategorySecondary(theme, false)).toBe(theme.secondaryLight);
      expect(theme.secondaryDark).not.toBe(theme.secondaryLight);
    }
  });
});
