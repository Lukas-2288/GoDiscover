# GoDiscover

A cross-platform discovery app for Movies, Books, Artists, and Albums. Browse by category, randomize with no filters, save your finds, and (soon) let AI recommend for you.

Built with React Native (Expo), TypeScript, and Supabase. Deploys to iOS, Android, and Web from one codebase.

---

## Features

- **Content Type Selector** — Switch between Movies, Books, Artists, and Albums. Acts as a silent toggle that sets the context for all actions without changing the page layout.
- **Randomize** — No filters, no decision fatigue. Hit the button, get 5 results (1 hero + 4 alternatives).
- **Filters** — Narrow results by genre, year, rating, and more. Filter options vary by content type (see below).
- **Saved Preferences** — Save items to your collection, organized by content type (4 sections: Movies, Books, Artists, Albums). Requires an account to persist.
- **AI Search** _(coming soon)_ — Conversational discovery powered by AI.
- **Light / Dark Mode** — Full theme support with accessible color contrast.

---

## Design

### Color Scheme

| Token      | Light Mode           | Dark Mode                |
| ---------- | -------------------- | ------------------------ |
| text       | `#ff843d` (orange)   | `#ff843d`                |
| background | `#ffffff`            | `#121212`                |
| primary    | `#6e00ff` (purple)   | `#9a4dff` (lighter)      |
| secondary  | `#ffffff`            | `#1e1e1e`                |
| accent     | `#6e00ff`            | `#9a4dff`                |
| surface    | `#f5f5f5`            | `#1e1e1e`                |

### Layout

Single-page architecture (no bottom tabs). The page layout is the same regardless of selected content type.

```
┌──────────────────────────────────┐
│  Logo    [How to Use]  [Account] │  <- Top bar / nav
├──────────────────────────────────┤
│                                  │
│   [ Movies ] [ Books ]           │  <- Content type selector
│   [ Artists ] [ Albums ]         │     (silent toggle)
│                                  │
├──────────────────────────────────┤
│                                  │
│  [ Randomize ]  [ Filters ]      │  <- Action buttons
│  [ AI Search (coming soon) ]     │
│                                  │
├──────────────────────────────────┤
│                                  │
│  ┌──────────────────────┐        │
│  │     Hero Result      │        │  <- 1 hero card (large)
│  └──────────────────────┘        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ... │  <- 4 smaller cards
│  └──────┘ └──────┘ └──────┘     │
│                                  │
└──────────────────────────────────┘
```

### Output Behavior

- **Mobile**: Results appear in a modal. Tapping a result for details opens a second modal with full info (review, rating, release year, etc.).
- **Web**: Results appear inline on the page. Clicking a result opens a detail modal.

### Modals

- **How to Use** — Simple instructional modal accessible from the top bar.
- **Account** — Sign in / sign up modal. Users can browse without an account; saving triggers a nudge to sign in.
- **Detail View** — Full info about a selected item (varies by content type).

---

## Filters by Content Type

### Movies (TMDB)
- Genre
- Year / Decade
- Rating
- Language
- Runtime (short / medium / long)
- Certification (PG, PG-13, R)

### Books (Open Library)
- Genre / Subject
- Year published
- Page count (short / medium / long)
- Fiction vs Non-Fiction
- Language

### Artists (Spotify)
- Genre
- Monthly Listeners range
- Popularity score

### Albums (Spotify)
- Genre
- Release year
- Popularity
- Album type (Single / EP / Album)
- Explicit content toggle

---

## Auth

- **No account required** to browse, randomize, filter, or view results.
- **Account required** to persist saved items. If a user saves without an account, the app notifies them it won't persist and nudges sign-in.
- **Sign-in options**: Email/password, Google, Apple, GitHub — all handled via Supabase Auth.

---

## Tech Stack

| Layer          | Technology                                                             |
| -------------- | ---------------------------------------------------------------------- |
| Mobile & Web   | React Native + Expo (iOS, Android, Web)                                |
| Routing        | Expo Router (file-based)                                               |
| Language       | TypeScript (strict)                                                    |
| Backend & Auth | Supabase (PostgreSQL + Row-Level Security)                             |
| Movies API     | [TMDB](https://www.themoviedb.org/documentation/api)                   |
| Books API      | [Open Library](https://openlibrary.org/developers/api)                 |
| Music API      | [Spotify Web API](https://developer.spotify.com/documentation/web-api) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- A [Supabase](https://supabase.com) account (free tier works)
- API keys for TMDB and Spotify

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/GoDiscover.git
cd GoDiscover

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your keys (see Environment Variables section below)

# Start the development server
npx expo start
```

### Running on a specific platform

```bash
npx expo start --ios
npx expo start --android
npx expo start --web
```

---

## Environment Variables

Create a `.env` file in the root of the project:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_TMDB_API_KEY=your_tmdb_api_key
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id
EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

> Never commit your `.env` file. It's already in `.gitignore`.

---

## Project Structure

```
app/                  # Expo Router file-based routes
  index.tsx           # Main single-page layout
  saved.tsx           # Saved preferences page
components/           # Reusable UI components
  ContentSelector.tsx # Movies / Books / Artists / Albums toggle
  ResultCard.tsx      # Hero and small result cards
  FilterModal.tsx     # Filter UI per content type
  DetailModal.tsx     # Item detail view
  HowToUseModal.tsx   # Instructional modal
  AuthModal.tsx       # Sign in / sign up
lib/                  # API clients, Supabase config, helpers
types/                # TypeScript type definitions
constants/            # Colors, themes, genres, config values
```

---

## Roadmap

- [x] Brainstorming and design decisions
- [ ] Project scaffold (Expo + Router + TypeScript)
- [ ] Theme system (light/dark mode, color tokens)
- [ ] Single-page layout with content type selector
- [ ] Randomize feature (all four content types)
- [ ] Filter system per content type
- [ ] Result cards (hero + alternatives)
- [ ] Detail modals per content type
- [ ] Supabase auth (email, Google, Apple, GitHub)
- [ ] Saved preferences (organized by content type)
- [ ] Accessibility pass
- [ ] Responsive design (mobile vs web differences)
- [ ] AI-powered conversational search

---

## API Credits

- Movie data provided by [TMDB](https://www.themoviedb.org/) — this product uses the TMDB API but is not endorsed or certified by TMDB
- Book data provided by [Open Library](https://openlibrary.org/), a project of the Internet Archive
- Music data provided by [Spotify](https://developer.spotify.com/)

---

## License

MIT
