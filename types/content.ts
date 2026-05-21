export type ContentCategory = 'movies' | 'books' | 'artists' | 'albums';

export type ResultItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  imageUrl?: string;
};

export type ArtistDetail = {
  id: string;
  name: string;
  imageUrl?: string;
  albums: { id: string; name: string; releaseDate: string; imageUrl?: string }[];
  spotifyUrl: string;
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
