export type ContentCategory = 'movies' | 'books' | 'artists' | 'albums';

export type ResultItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  imageUrl?: string;
  /**
   * Genre/subject/style labels for this item, in the same vocabulary the filter
   * UI uses (`constants/Filters.ts`), so they can be fed straight back into a
   * provider query. Populated by the API adapters where the provider gives them
   * away for free — TMDB returns `genre_ids` on every search and discover row.
   *
   * Recording these on a rejected card is what lets "Not for me" steer away
   * from a genre instead of only hiding one title. Optional because search
   * results and lightweight saved rows do not always carry them.
   */
  traits?: string[];
};

export type ArtistDetail = {
  id: string;
  name: string;
  imageUrl?: string;
  albums: { id: string; name: string; releaseDate: string; imageUrl?: string }[];
  spotifyUrl: string;
  genres?: string[];
  styles?: string[];
  description?: string;
  releaseYear?: string;
};

export type AlbumDetail = {
  id: string;
  name: string;
  artists: string[];
  releaseDate: string;
  totalTracks: number;
  albumType: string;
  genres: string[];
  popularity: number;
  imageUrl?: string;
  tracks: { id: string; name: string; durationMs: number }[];
  spotifyUrl: string;
};

export type BookDetail = {
  id: string;
  title: string;
  authors: string[];
  firstPublishYear?: number;
  subjects: string[];
  description: string;
  coverUrl?: string;
  rating?: number;
};

export type MovieDetail = {
  id: string;
  title: string;
  overview: string;
  releaseYear: string;
  rating: number;
  runtime?: number;
  genres: string[];
  posterUrl?: string;
  backdropUrl?: string;
  language: string;
};
