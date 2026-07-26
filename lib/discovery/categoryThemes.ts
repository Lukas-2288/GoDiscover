import type { ContentCategory } from "../../types/content";

export type CategoryPattern = "backstage" | "record" | "paper" | "ticket";

export type CategoryTheme = {
  label: string;
  singular: string;
  icon: "microphone" | "music" | "book" | "film";
  badge: string;
  accent: string;
  /**
   * Labels the second external-link button and tints the card's tape strip.
   * Split into a pair because no single blue clears WCAG AA as text on both
   * the dark surface and the cream card: #0095D8 manages only 2.96:1 on cream,
   * #006FA3 only 3.34:1 on dark. Resolve with `resolveCategorySecondary`
   * rather than reading either field directly.
   */
  secondaryDark: string;
  secondaryLight: string;
  onAccent: string;
  softLight: string;
  softDark: string;
  pattern: CategoryPattern;
};

// Measured against the surfaces each one is actually used on:
// #0095D8 — 5.52:1 on the dark surface, but 2.96:1 on the cream card.
// #006FA3 — 5.52:1 on white and 4.90:1 on cream, 3.36:1 on dark.
// Neither clears AA on both, so each owns the scheme it is legible in.
const SECONDARY_DARK = "#0095D8";
const SECONDARY_LIGHT = "#006FA3";

export const CATEGORY_ORDER: ContentCategory[] = [
  "artists",
  "albums",
  "books",
  "movies",
];

export const CATEGORY_THEMES: Record<ContentCategory, CategoryTheme> = {
  artists: {
    label: "Artists",
    singular: "artist",
    icon: "microphone",
    badge: "BACKSTAGE PICK",
    accent: "#8BEA4A",
    secondaryDark: SECONDARY_DARK,
    secondaryLight: SECONDARY_LIGHT,
    onAccent: "#0C1B05",
    softLight: "#E9FFD9",
    softDark: "#18300E",
    pattern: "backstage",
  },
  albums: {
    label: "Albums",
    singular: "album",
    icon: "music",
    badge: "FRESH PRESSING",
    accent: "#FF8A4C",
    secondaryDark: SECONDARY_DARK,
    secondaryLight: SECONDARY_LIGHT,
    onAccent: "#1D0900",
    softLight: "#FFF0E8",
    softDark: "#35190E",
    pattern: "record",
  },
  books: {
    label: "Books",
    singular: "book",
    icon: "book",
    badge: "MARGIN NOTE",
    accent: "#FFD84D",
    secondaryDark: SECONDARY_DARK,
    secondaryLight: SECONDARY_LIGHT,
    onAccent: "#201500",
    softLight: "#FFF8D8",
    softDark: "#332B0F",
    pattern: "paper",
  },
  movies: {
    label: "Movies",
    singular: "movie",
    icon: "film",
    badge: "TONIGHT'S FEATURE",
    accent: "#FF5CA8",
    secondaryDark: SECONDARY_DARK,
    secondaryLight: SECONDARY_LIGHT,
    onAccent: "#19000C",
    softLight: "#FFE3F0",
    softDark: "#351124",
    pattern: "ticket",
  },
};

export function getCategoryTheme(category: ContentCategory): CategoryTheme {
  return CATEGORY_THEMES[category];
}

/** Picks the secondary accent that stays legible in the active scheme. */
export function resolveCategorySecondary(
  theme: CategoryTheme,
  isDark: boolean
): string {
  return isDark ? theme.secondaryDark : theme.secondaryLight;
}
