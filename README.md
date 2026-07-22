# GoDiscover

A cross-platform discovery app for Movies, Books, Artists, and Albums. Browse by category, randomize with no filters, save your finds, and (soon) let AI recommend for you.

Built with React Native (Expo), TypeScript, and Supabase. Deploys to iOS, Android, and Web from one codebase.

---

## Features

- **Category Picker** — Switch between Movies, Books, Artists, and Albums, each with its own visual theme.
- **Surprise Me** — Start an unbiased, category-specific discovery deck with no filters or personalization.
- **Search and Filters** — Optional ways to narrow a deck by query, genre, era, rating, and more.
- **Swipe Deck** — Save with a right swipe or choose Not for me with a left swipe; labeled buttons provide the same actions without requiring gestures.
- **Explicit Similar** — Start a visibly labeled, temporary related deck only when you choose Similar, then return to unbiased Surprise Me at any time.
- **Saved Preferences** — Save items to your collection, organized by content type (4 sections: Movies, Books, Artists, Albums). Requires an account to persist.
- **Light / Dark Mode** — Full theme support with accessible color contrast.
- **Reduced Motion** — Honors the system setting by removing card flight, tilt, scale, parallax, expanding artwork, and repeated skeleton motion while preserving every action.

## Discovery Architecture

Discovery is split into three layers. `lib/discovery` contains pure request routing, category-session state, and transition logic. `components/discovery/useDiscoveryController.ts` is the side-effect boundary for provider requests, saved-item persistence, announcements, and Undo timing. The remaining `components/discovery` modules render the category picker, optional controls, swipe deck, status feedback, and detail sheet from that state.

The interaction contract is the same on every platform: swipe right or choose **Save**, swipe left or choose **Not for me**, and choose **Similar** only when you want a temporary related deck. Every gesture has an always-visible labeled button equivalent. Reduced-motion mode changes the transitions, not the available controls or their meaning.

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

Single-page architecture (no bottom tabs). The category theme changes, but the discovery controls and interaction order stay consistent.

```
┌──────────────────────────────────┐
│ [Account] GoDiscover [Saved] [?] │  <- Top bar
├──────────────────────────────────┤
│ [ Movies ] [ Books ]             │  <- Category picker
│ [ Artists ] [ Albums ]           │
├──────────────────────────────────┤
│ [Search] [Filter] [Surprise Me]  │  <- Discovery controls
├──────────────────────────────────┤
│     ┌────────────────────┐       │
│     │ Active deck card   │       │  <- Swipe or open details
│     └────────────────────┘       │
│ [Not for me] [Save] [Similar]    │  <- Labeled gesture parity
└──────────────────────────────────┘
```

### Output Behavior

- **Mobile**: The deck stays inline; opening a card presents a bottom detail sheet.
- **Web**: The deck stays inline and is bounded for desktop widths; opening a card presents a centered detail surface on wider screens.

### Modals

- **How to Use** — Simple instructional modal accessible from the top bar.
- **Account** — Sign in / sign up modal. Users can browse without an account; saving triggers a nudge to sign in.
- **Detail Sheet** — Category-aware details with explicit Save, Not for me, Similar, Share, and external-source actions as applicable.

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
app/                         # Expo Router routes and high-level composition
  index.tsx                  # Main discovery, auth, saved, and recents route
components/discovery/        # Category, controls, deck, status, and detail UI
  useDiscoveryController.ts  # Provider, storage, announcement, and Undo effects
lib/discovery/               # Pure request routing and discovery state logic
lib/api/                     # TMDB, Open Library, and music provider clients
lib/storage/                 # Saved-item and recent-item persistence
types/                       # Shared content contracts
constants/                   # Filter configuration
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
