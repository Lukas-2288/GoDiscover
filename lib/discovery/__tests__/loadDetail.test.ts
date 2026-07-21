import type { MovieDetail, ResultItem } from "../../../types/content";
import { loadDetail, toDetailError, type DetailLoaderRegistry } from "../loadDetail";

const item: ResultItem = { id: "10", title: "Arrival", subtitle: "2016", meta: "" };
const movie: MovieDetail = {
  id: "10",
  title: "Arrival",
  overview: "First contact.",
  releaseYear: "2016",
  rating: 8,
  genres: ["Science Fiction"],
  language: "en",
};

it("loads and tags only the requested category detail", async () => {
  const loaders: DetailLoaderRegistry = {
    movies: jest.fn(async () => movie),
    books: jest.fn(),
    artists: jest.fn(),
    albums: jest.fn(),
  };
  await expect(loadDetail("movies", item, loaders)).resolves.toEqual({
    category: "movies",
    data: movie,
  });
  expect(loaders.movies).toHaveBeenCalledWith(item);
  expect(loaders.books).not.toHaveBeenCalled();
});

it("returns stable detail error copy", () => {
  expect(toDetailError()).toBe("Couldn't load all the details. Try again.");
});
