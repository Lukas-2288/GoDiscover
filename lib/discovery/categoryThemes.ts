import type { ContentCategory } from "../../types/content";

export type CategoryPattern = "backstage" | "record" | "paper" | "ticket";

export type CategoryTheme = {
  label: string;
  singular: string;
  icon: "microphone" | "music" | "book" | "film";
  badge: string;
  accent: string;
  secondary: string;
  onAccent: string;
  softLight: string;
  softDark: string;
  pattern: CategoryPattern;
};

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
    secondary: "#315BFF",
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
    secondary: "#32D7D2",
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
    secondary: "#5B2BE0",
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
    secondary: "#3F78FF",
    onAccent: "#19000C",
    softLight: "#FFE3F0",
    softDark: "#351124",
    pattern: "ticket",
  },
};

export function getCategoryTheme(category: ContentCategory): CategoryTheme {
  return CATEGORY_THEMES[category];
}
