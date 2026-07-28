// Shared jest setup, registered as `setupFiles` in jest.config.js.
//
// The live-probe suite (lib/api/__tests__/liveProviders.test.ts) used to require
// shell-sourcing .env by hand: `set -a && . ./.env && set +a && LIVE_API_PROBE=1
// npx jest liveProviders`. A single malformed line aborts that source partway
// through with no clear signal, so the keys silently never reach the process.
// Loading .env the same way Expo CLI/Metro itself does removes the shell from
// the picture entirely.
//
// A no-op unless the probe is actually requested, so plain `npm test` never
// touches this.
if (process.env.LIVE_API_PROBE === "1") {
  require("@expo/env").loadProjectEnv(process.cwd());

  // @expo/env skips .env.local under NODE_ENV=test (Jest's default). This
  // repo's documented convention is a plain .env (README, .gitignore), which
  // is not skipped, so that's a non-issue here — not something to "fix" by
  // renaming the file later.
  const required = ["EXPO_PUBLIC_TMDB_API_KEY", "EXPO_PUBLIC_DISCOGS_TOKEN"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing env var(s) for LIVE_API_PROBE: ${missing.join(", ")}`);
  }
}
