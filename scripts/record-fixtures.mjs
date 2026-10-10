/**
 * Records real provider responses so tests can assert against them offline.
 *
 * The recommendation paths are the least tested part of this app and the
 * hardest to test, because "does this result make sense" is a question about
 * real catalogue data. Hand-written mocks answer a different question — they
 * prove the parser handles whatever the author imagined. These are what the
 * providers actually said.
 *
 * Run once with a populated .env; commit the output. Responses carry no
 * credentials, so the fixtures are safe to check in.
 *
 *   node scripts/record-fixtures.mjs
 *
 * Re-run when a provider changes shape, or to refresh a stale seed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

/**
 * Reads .env the way Expo itself does, rather than making the shell do it.
 *
 * Asking for `set -a && . ./.env && set +a` first is how this used to work and
 * it is a trap: a single malformed line aborts the source silently, the keys
 * never arrive, and the failure looks like a missing key rather than a broken
 * file. `test/liveApiEnv.js` already solved this for the test suite; the same
 * loader belongs here. Anything already exported still wins.
 */
function loadProjectEnv() {
  // @expo/env warns without one, and outside `expo start` nothing sets it.
  process.env.NODE_ENV = process.env.NODE_ENV || "development";
  try {
    createRequire(import.meta.url)("@expo/env").loadProjectEnv(process.cwd());
  } catch {
    // Fall through to whatever the shell already exported.
  }
}

loadProjectEnv();

const OUT_DIR = path.join("lib", "api", "__tests__", "fixtures");

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(
      `Missing ${name}.\n` +
        "Expected it in .env at the project root, alongside the keys the app uses."
    );
    process.exit(2);
  }
  return value.trim();
}

const TMDB_KEY = requireEnv("EXPO_PUBLIC_TMDB_API_KEY");
const DISCOGS_TOKEN = requireEnv("EXPO_PUBLIC_DISCOGS_TOKEN");
const LASTFM_KEY = process.env.EXPO_PUBLIC_LASTFM_API_KEY?.trim();

/**
 * Seeds chosen to be stable and to exercise the cases that have actually
 * broken: a recent film, a genre-heavy novel, the 2025 single that once
 * returned a 1975 trucker album, and an artist whose Discogs entry carries a
 * disambiguation suffix.
 */
const RECORDINGS = [
  {
    name: "tmdb-similar-dune",
    describe: "TMDB similar films for Dune: Part Two (2024)",
    url: `https://api.themoviedb.org/3/movie/693134/similar?api_key=${TMDB_KEY}&page=1`,
  },
  {
    name: "tmdb-movie-dune",
    describe: "TMDB detail for the same seed, for its genre list",
    url: `https://api.themoviedb.org/3/movie/693134?api_key=${TMDB_KEY}`,
  },
  {
    name: "openlibrary-search-kindred",
    describe: "Open Library search for a seed book, with its subjects",
    url:
      "https://openlibrary.org/search.json?q=Kindred+Octavia+Butler&limit=5" +
      "&fields=key,title,author_name,first_publish_year,cover_i,ratings_average,subject",
  },
  {
    name: "openlibrary-subject-sciencefiction",
    describe: "Open Library subject search, the pool a book recommendation draws from",
    url:
      'https://openlibrary.org/search.json?q=subject:"science fiction"&limit=10&sort=rating' +
      "&fields=key,title,author_name,first_publish_year,cover_i,ratings_average,subject",
  },
  {
    name: "discogs-search-giver",
    describe: "Discogs master search for the Chappell Roan regression seed",
    url:
      "https://api.discogs.com/database/search?q=Chappell+Roan+The+Giver" +
      "&type=master&per_page=5",
    headers: { Authorization: `Discogs token=${DISCOGS_TOKEN}` },
  },
  {
    name: "discogs-search-artist-nirvana",
    describe: "Discogs artist search returning a disambiguation suffix",
    url: "https://api.discogs.com/database/search?q=Nirvana&type=artist&per_page=3",
    headers: { Authorization: `Discogs token=${DISCOGS_TOKEN}` },
  },
  ...(LASTFM_KEY
    ? [
        {
          name: "lastfm-similar-chappell-roan",
          describe: "Last.fm neighbours for the same seed",
          url:
            "https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar" +
            `&artist=Chappell+Roan&autocorrect=1&limit=8&api_key=${LASTFM_KEY}&format=json`,
        },
        {
          name: "lastfm-artist-info-portishead",
          describe: "Last.fm listener counts, the Underground band's only source",
          url:
            "https://ws.audioscrobbler.com/2.0/?method=artist.getinfo" +
            `&artist=Portishead&autocorrect=1&api_key=${LASTFM_KEY}&format=json`,
        },
      ]
    : []),
];

/** Discogs asks for one, and rate-limits harder without it. */
const USER_AGENT = "GoDiscover/1.0";

async function record({ name, describe, url, headers }) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, ...(headers ?? {}) },
  });
  const body = await response.json();
  // Last.fm answers 200 with an error body, so status alone is not enough.
  if (!response.ok || body?.error) {
    throw new Error(
      `${name}: HTTP ${response.status}${body?.message ? ` — ${body.message}` : ""}`
    );
  }
  const file = path.join(OUT_DIR, `${name}.json`);
  await writeFile(
    file,
    `${JSON.stringify({ describe, recordedAt: new Date().toISOString(), body }, null, 2)}\n`
  );
  return file;
}

await mkdir(OUT_DIR, { recursive: true });

let failed = 0;
for (const recording of RECORDINGS) {
  try {
    const file = await record(recording);
    console.log(`  ✓ ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${recording.name}: ${error.message}`);
  }
  // Discogs allows ~60 requests a minute; this is well inside it.
  await new Promise((resolve) => setTimeout(resolve, 1_100));
}

if (!LASTFM_KEY) {
  console.log(
    "\nNo EXPO_PUBLIC_LASTFM_API_KEY — skipped the Last.fm fixtures.\n" +
      "Music similarity and Underground tests will run against Discogs alone."
  );
}

console.log(
  failed
    ? `\n${failed} of ${RECORDINGS.length} failed. Commit what succeeded and re-run for the rest.`
    : `\nRecorded ${RECORDINGS.length} fixtures. Commit ${OUT_DIR} and they work everywhere.`
);
process.exit(failed ? 1 : 0);
