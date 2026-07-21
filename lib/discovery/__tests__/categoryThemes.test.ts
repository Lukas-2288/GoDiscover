import type { ContentCategory } from "../../../types/content";
import {
  CATEGORY_ORDER,
  CATEGORY_THEMES,
  getCategoryTheme,
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
});
