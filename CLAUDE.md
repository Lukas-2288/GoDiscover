# GoDiscover — Codebase Notes

A cross-platform discovery app for Books, Movies, and Music (Artists & Albums). Users can search, filter, or randomize content, then save the things they want to check out. Built with React Native (Expo Router), TypeScript, and Supabase.

## Running the App

**Deployed web version:** https://godiscover.netlify.app
Netlify auto-deploys on every push to `claude/code-phone-first-time-JFQOs`.

**Local dev:**
```bash
npm install
npm start -- --web --offline   # web preview at localhost:8081
```

**Required `.env` file** (git-ignored, never commit):
```
EXPO_PUBLIC_TMDB_API_KEY=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_DISCOGS_TOKEN=
```

## Key File Map

```
app/
  _layout.tsx       Root navigation shell (font loading, splash screen)
  index.tsx         Entire app UI (~2,500 lines — see refactoring note below)
  +not-found.tsx    404 screen

lib/
  api/
    tmdb.ts         TMDB movie search/filter/detail/similar
    openlibrary.ts  Open Library book search/filter/detail/similar
    discogs.ts      Discogs music search/filter/detail/similar (artists + albums)
  auth/
    oauth.ts        Google OAuth flow via Supabase
  storage/
    saved.ts        Dual-layer saved items (AsyncStorage + Supabase cloud sync)
    recents.ts      Local-only recently viewed items (max 12, LRU)
  supabase.ts       Supabase client (SSR-safe, guards AsyncStorage behind window check)
  theme.ts          Light/dark palette system + AsyncStorage persistence

constants/
  Filters.ts        ERA, GENRE, RATING, POPULARITY filter definitions for all 4 categories
                    Note: POPULARITY_FILTERS defined but not yet wired up in the UI

types/
  content.ts        Shared TypeScript types (ContentCategory, ResultItem, detail types)

components/
  Themed.tsx        Themed Text/View — used only by +not-found.tsx
  useColorScheme.ts System color scheme hook
```

## Architecture Notes

- **All app logic lives in `app/index.tsx`** — search, filter, randomize, saved/recents, auth, modals, and styles. This is the main refactoring target.
- **API layer** (`lib/api/`) converts external API responses into `ResultItem` and detail types from `types/content.ts`. All three are complete and production-ready.
- **Storage** is local-first: AsyncStorage always, with Supabase cloud sync when the user is signed in.
- **Theme** uses a custom palette system in `lib/theme.ts` (not the old `constants/Colors.ts` which only exists for the 404 screen).
- **Web output** is set to `"single"` (SPA) in `app.json` to avoid SSR issues with AsyncStorage during static export.

## Known Issues / Future Improvements

- `index.tsx` is ~2,500 lines and should be split into components (ResultCard, FilterSection, DetailModal, AuthModal, RecentsList)
- `POPULARITY_FILTERS` in `constants/Filters.ts` is defined but not shown in the filter UI
- `useColorScheme.web.ts` always returns `'light'` — dark mode browsers won't get the dark theme on web
- Search results have no pagination (TMDB supports it, just not exposed)
- OAuth debug logs (`console.log` in `lib/auth/oauth.ts`) should be removed before production
