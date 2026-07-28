import type { ContentCategory } from "../../types/content";
import type { DiscoveryActionMode, DiscoveryMode } from "./types";

/**
 * What to say, and what to offer, when a request came back with nothing.
 *
 * Pulled out of the screen because the answer depends on *why* the deck is
 * empty, and getting that wrong is worse than unhelpful. An empty Underground
 * deck does not mean "shuffle again" — it means the band happened to be thin
 * on that tag, and the useful next step is to try it again rather than to
 * abandon the mode. The screen's inline version offered "Shuffle again" for
 * everything that was not a search or a filter, which quietly threw the user
 * back to unfiltered browsing whenever a deliberate choice came up short.
 */

export type EmptyStateAction =
  | { kind: "openPanel"; mode: "search" | "filter"; label: string; message: string }
  // Only the modes a user can re-trigger from the controls. Similar is not one
  // of them: it needs the seed card, which is no longer on screen.
  | { kind: "retryMode"; mode: DiscoveryActionMode; label: string; message: string }
  | { kind: "randomize"; label: string; message: string };

const CATEGORY_LABEL: Record<ContentCategory, string> = {
  movies: "movies",
  books: "books",
  artists: "artists",
  albums: "albums",
};

export function emptyStateAction(
  mode: DiscoveryMode | undefined,
  category: ContentCategory
): EmptyStateAction {
  const label = CATEGORY_LABEL[category];
  if (mode === "search" || mode === "filter") {
    return {
      kind: "openPanel",
      mode,
      label: "Adjust search or filters",
      message: `No ${label} found. Try another approach.`,
    };
  }
  if (mode === "fresh") {
    return {
      kind: "retryMode",
      mode,
      label: "Look again",
      // Catalogues fill in behind release dates rather than on them, so a
      // quiet week is a real and temporary answer, not a dead end.
      message: `Nothing new in ${label} just yet. Check back, or shuffle instead.`,
    };
  }
  if (mode === "underground") {
    return {
      kind: "retryMode",
      mode,
      label: "Try another corner",
      message: `No underground ${label} turned up this time. Another genre may be busier.`,
    };
  }
  return {
    kind: "randomize",
    label: "Shuffle again",
    message: `No ${label} found. Try another approach.`,
  };
}
