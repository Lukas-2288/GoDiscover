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

  it("normalizes every supported provider genre and book subject label", () => {
    const movie = buildCulturalProfile(
      "movies",
      { id: "movie", title: "Movie", subtitle: "", meta: "" },
      { genres: ["Action", "Adventure", "Animation", "Crime", "Thriller", "Western"] }
    );
    const book = buildCulturalProfile(
      "books",
      { id: "book", title: "Book", subtitle: "", meta: "" },
      { subjects: ["Fiction", "Historical fiction", "Biography", "Memoir", "Self help", "Young adult fiction", "Literary fiction", "Graphic novel"] }
    );
    const music = buildCulturalProfile(
      "albums",
      { id: "album", title: "Album", subtitle: "", meta: "" },
      { genres: ["Pop", "Rock", "Hip-Hop / Rap", "R&B / Soul", "Electronic / EDM", "Country", "Jazz", "Classical", "Metal", "Indie / Alternative", "Latin", "K-Pop", "Folk", "Reggae", "Blues"] }
    );

    expect(movie.genres).toEqual(["Action", "Adventure", "Animation", "Crime", "Thriller", "Western"]);
    expect(book.subjects).toEqual([
      "Fiction", "Historical Fiction", "Biography / Memoir", "Self-Help", "Young Adult", "Literary Fiction", "Graphic Novel",
    ]);
    expect(music.genres).toEqual([
      "Pop", "Rock", "Hip-Hop / Rap", "R&B / Soul", "Electronic / EDM", "Country", "Jazz", "Classical", "Metal", "Indie / Alternative", "Latin", "K-Pop", "Folk", "Reggae", "Blues",
    ]);
  });

  it("extracts normalized genre and subject aliases from descriptions", () => {
    const profile = buildCulturalProfile(
      "movies",
      { id: "movie", title: "Movie", subtitle: "", meta: "" },
      { overview: "A science-fiction mystery and historical fiction epic." }
    );

    expect(profile.genres).toEqual(["Sci-Fi"]);
    expect(profile.subjects).toEqual(["Mystery / Thriller", "Historical Fiction"]);
    expect(profile.styles).toEqual(["Epic"]);
  });

  it("prefers specific non-overlapping fiction aliases over generic Fiction in descriptions", () => {
    const profile = buildCulturalProfile(
      "books",
      { id: "book", title: "Book", subtitle: "", meta: "" },
      { description: "A Young Adult Fiction and Literary Fiction companion, not Non-Fiction." }
    );

    expect(profile.subjects).toEqual(["Young Adult", "Literary Fiction", "Non-Fiction"]);
    expect(profile.subjects).not.toContain("Fiction");
  });
});
