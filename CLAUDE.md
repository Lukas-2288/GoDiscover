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

## Security

### Required: Row Level Security on `saved_items`

The Supabase queries in `lib/storage/saved.ts` do not include explicit `user_id` filters — they rely on RLS to enforce per-user isolation at the database level. **Without RLS turned on, every signed-in user can read and delete every other user's saved items.**

The policies are defined in `supabase/rls.sql`. Apply them once via Supabase Dashboard → SQL Editor. The file has step-by-step instructions and verification queries.

### Client-exposed env vars

All 4 env vars are `EXPO_PUBLIC_*`, which means Expo bakes their values into the JavaScript bundle that ships to the browser. Anyone viewing the deployed site's source can read them. Implications:

| Var | Risk if exposed | Mitigation |
|-----|-----------------|------------|
| `EXPO_PUBLIC_SUPABASE_URL` | None — meant to be public | None needed |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Only as dangerous as the RLS policies | Keep RLS strict (above) |
| `EXPO_PUBLIC_TMDB_API_KEY` | Attacker can burn your rate limit | Restrict key by domain in TMDB settings; long-term, proxy via backend |
| `EXPO_PUBLIC_DISCOGS_TOKEN` | Personal access token — full account access | Move to backend proxy before sharing widely |

### Deferred security work

Tracked here so future sessions remember (see plan file `ah-i-see-okay-linear-creek.md` for full context):

**Before sharing the app widely:**
- Restrict TMDB API key to the netlify.app domain
- Switch mobile session storage from AsyncStorage to `expo-secure-store` (Keychain / Android Keystore)
- Add input length/character validation in `lib/api/*.ts` search functions
- Drop the implicit-flow fallback in `lib/auth/oauth.ts` (lines ~38-51) — PKCE alone is sufficient

**Once the app has real users:**
- Build a backend proxy (Cloudflare Worker / Supabase Edge Function) to hold TMDB + Discogs keys server-side
- Add Sentry (`@sentry/react-native`) for crash reporting; replace raw error messages in `Alert.alert` with generic copy
- Client-side rate limiting / debounce on search
