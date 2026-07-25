import type { ResultItem } from "../../../types/content";
import { buildCulturalProfile } from "../culturalProfile";

const item: ResultItem = {
  id: "dune",
  title: "Dune",
  subtitle: "Frank Herbert",
  meta: "1965",
};

describe("buildCulturalProfile", () => {
  it("normalizes provider metadata into the versioned vocabulary", () => {
    const profile = buildCulturalProfile("books", item, {
      authors: ["Frank Herbert"],
      firstPublishYear: 1965,
      subjects: ["Science fiction", "Space opera", "Desert planet"],
      description: "A political epic set on a desert planet.",
    });

    expect(profile).toEqual({
      vocabularyVersion: 1,
      genres: ["Sci-Fi"],
      styles: ["Epic"],
      subjects: ["Space opera"],
      creators: ["frank-herbert"],
      era: "1960s",
    });
  });

  it("derives a music profile from genres, styles, artist names, and release year", () => {
    const profile = buildCulturalProfile(
      "albums",
      { id: "1", title: "Mezzanine", subtitle: "Massive Attack", meta: "1998" },
      {
        artists: ["Massive Attack"],
        releaseDate: "1998-04-20",
        genres: ["Electronic", "Trip Hop"],
        styles: ["Downtempo", "Trip-Hop"],
      }
    );

    expect(profile).toEqual({
      vocabularyVersion: 1,
      genres: ["Electronic / EDM"],
      styles: ["Downtempo", "Trip-Hop"],
      subjects: [],
      creators: ["massive-attack"],
      era: "1990s",
    });
  });

  it("does not turn a movie release-year subtitle into a creator", () => {
    const profile = buildCulturalProfile(
      "movies",
      { id: "arrival", title: "Arrival", subtitle: "2016", meta: "★ 7.9" },
      { releaseYear: "2016", genres: ["Science Fiction"] }
    );

    expect(profile.creators).toEqual([]);
  });
});
