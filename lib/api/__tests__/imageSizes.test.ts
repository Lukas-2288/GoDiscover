import { sizedImageUrl, thumbnailUrl } from "../imageSizes";

// Thumbnails were downloading card-sized artwork — a 40x58 slot in the Saved
// Atlas list pulling a 500px-wide poster. A wrong rewrite breaks the image
// though, so anything unrecognised has to pass through untouched.
describe("sized image URLs", () => {
  const tmdb = "https://image.tmdb.org/t/p/w500/abc123.jpg";
  const openLibrary = "https://covers.openlibrary.org/b/id/8231856-L.jpg";
  const discogs = "https://i.discogs.com/aBcD/rx-90/image.jpeg";

  it("shrinks TMDB posters for thumbnail slots", () => {
    expect(thumbnailUrl(tmdb)).toBe("https://image.tmdb.org/t/p/w185/abc123.jpg");
  });

  it("shrinks TMDB backdrops requested at original size", () => {
    expect(
      thumbnailUrl("https://image.tmdb.org/t/p/original/xyz.jpg")
    ).toBe("https://image.tmdb.org/t/p/w185/xyz.jpg");
  });

  it("steps Open Library covers down from large to medium", () => {
    expect(thumbnailUrl(openLibrary)).toBe(
      "https://covers.openlibrary.org/b/id/8231856-M.jpg"
    );
  });

  it("leaves hosts it cannot safely rewrite alone", () => {
    expect(thumbnailUrl(discogs)).toBe(discogs);
    expect(thumbnailUrl("https://example.com/art.png")).toBe(
      "https://example.com/art.png"
    );
  });

  it("passes card slots through at full size", () => {
    expect(sizedImageUrl(tmdb, "card")).toBe(tmdb);
    expect(sizedImageUrl(openLibrary, "card")).toBe(openLibrary);
  });

  it("handles a missing image", () => {
    expect(thumbnailUrl(undefined)).toBeUndefined();
  });
});
