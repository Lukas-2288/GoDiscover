// Filters available per content type
// Used to drive the Filter UI and API query params

export const ERA_FILTERS = {
  centuries: ['Pre-1900s', '1900s', '2000s'],
  decades: ['50s', '60s', '70s', '80s', '90s', '00s', '10s', '20s'],
  // Specific year: handled via a text input (user types a year)
};

export const GENRE_FILTERS = {
  artists: [
    'Pop', 'Rock', 'Hip-Hop / Rap', 'R&B / Soul', 'Electronic / EDM',
    'Country', 'Jazz', 'Classical', 'Metal', 'Indie / Alternative',
    'Latin', 'K-Pop', 'Folk', 'Reggae', 'Blues',
  ],
  albums: [
    'Pop', 'Rock', 'Hip-Hop / Rap', 'R&B / Soul', 'Electronic / EDM',
    'Country', 'Jazz', 'Classical', 'Metal', 'Indie / Alternative',
    'Latin', 'K-Pop', 'Folk', 'Reggae', 'Blues',
  ],
  books: [
    'Fiction', 'Non-Fiction', 'Mystery / Thriller', 'Sci-Fi', 'Fantasy',
    'Romance', 'Historical Fiction', 'Biography / Memoir', 'Self-Help',
    'Horror', 'Young Adult', 'Literary Fiction', 'Graphic Novel',
  ],
  movies: [
    'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller',
    'Romance', 'Animation', 'Documentary', 'Crime', 'Fantasy',
    'Adventure', 'Western',
  ],
};

// Popularity buckets — source: Spotify popularity score (0–100)
export const POPULARITY_FILTERS = {
  albums: [
    { label: 'Underground', range: [0, 30] },
    { label: 'Rising', range: [30, 50] },
    { label: 'Popular', range: [50, 70] },
    { label: 'Mainstream', range: [70, 100] },
  ],
  // Monthly listeners — source: Spotify
  artists: [
    { label: 'Emerging', description: 'Under 100K monthly listeners' },
    { label: 'Mid-size', description: '100K – 1M monthly listeners' },
    { label: 'Major', description: '1M – 10M monthly listeners' },
    { label: 'Global', description: '10M+ monthly listeners' },
  ],
};

// Rating filters — sources vary by content type
// Movies:  TMDB community rating (0–10)
// Books:   Google Books aggregate rating (0–5)
// Albums:  Last.fm listener score (used as proxy)
// Artists: No rating — use popularity filters instead
export const RATING_FILTERS = {
  movies: [
    { label: 'Any', min: 0 },
    { label: '6+', min: 6 },
    { label: '7+', min: 7 },
    { label: '8+', min: 8 },
    { label: '9+', min: 9 },
  ],
  books: [
    { label: 'Any', min: 0 },
    { label: '3+', min: 3 },
    { label: '3.5+', min: 3.5 },
    { label: '4+', min: 4 },
    { label: '4.5+', min: 4.5 },
  ],
  albums: [
    { label: 'Any', min: 0 },
    { label: '6+', min: 6 },
    { label: '7+', min: 7 },
    { label: '8+', min: 8 },
    { label: '9+', min: 9 },
  ],
};

// Content-specific filters
export const CONTENT_FILTERS = {
  movies: {
    runtime: [
      { label: 'Short', description: 'Under 90 min' },
      { label: 'Standard', description: '90 – 120 min' },
      { label: 'Long', description: '120+ min' },
    ],
    language: ['English', 'Spanish', 'French', 'Japanese', 'Korean', 'Italian', 'German', 'Hindi'],
    awards: { label: 'Oscar Winner', toggle: true },
  },
  books: {
    pageCount: [
      { label: 'Quick Read', description: 'Under 200 pages' },
      { label: 'Medium', description: '200 – 400 pages' },
      { label: 'Long', description: '400+ pages' },
    ],
    language: ['English', 'Spanish', 'French', 'Japanese', 'Korean', 'Italian', 'German'],
    type: ['Fiction', 'Non-Fiction'],
    awards: { label: 'Booker Prize Winner', toggle: true },
  },
  artists: {
    // Era filter uses decades only (no specific year or century)
    eraMode: 'decades' as const,
    awards: { label: 'Grammy Winner', toggle: true },
  },
  albums: {
    type: ['Album', 'EP', 'Single'],
    explicit: { label: 'Exclude Explicit', toggle: true },
    awards: { label: 'Grammy Winner', toggle: true },
  },
};
