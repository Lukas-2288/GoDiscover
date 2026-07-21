import { getAlbumDetail, getArtistDetail } from "../api/discogs";
import { getBookDetail } from "../api/openlibrary";
import { getMovieDetail } from "../api/tmdb";
import type {
  AlbumDetail,
  ArtistDetail,
  BookDetail,
  ContentCategory,
  MovieDetail,
  ResultItem,
} from "../../types/content";

export type ContentDetail =
  | { category: "movies"; data: MovieDetail }
  | { category: "books"; data: BookDetail }
  | { category: "artists"; data: ArtistDetail }
  | { category: "albums"; data: AlbumDetail };

export type DetailLoaderRegistry = {
  movies(item: ResultItem): Promise<MovieDetail>;
  books(item: ResultItem): Promise<BookDetail>;
  artists(item: ResultItem): Promise<ArtistDetail>;
  albums(item: ResultItem): Promise<AlbumDetail>;
};

const defaultDetailLoaders: DetailLoaderRegistry = {
  movies: (item) => getMovieDetail(item.id),
  books: (item) =>
    getBookDetail(item.id, { title: item.title, imageUrl: item.imageUrl }),
  artists: (item) => getArtistDetail(item.id),
  albums: (item) => getAlbumDetail(item.id),
};

export async function loadDetail(
  category: ContentCategory,
  item: ResultItem,
  loaders: DetailLoaderRegistry = defaultDetailLoaders
): Promise<ContentDetail> {
  switch (category) {
    case "movies":
      return { category, data: await loaders.movies(item) };
    case "books":
      return { category, data: await loaders.books(item) };
    case "artists":
      return { category, data: await loaders.artists(item) };
    case "albums":
      return { category, data: await loaders.albums(item) };
  }
}

export function toDetailError(): string {
  return "Couldn't load all the details. Try again.";
}
