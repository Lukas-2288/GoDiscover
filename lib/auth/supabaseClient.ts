import { AuthClient, type GoTrueClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';

import type { SupabaseAuthOptions } from './storage';

/**
 * GoDiscover calls exactly two of the five clients `createClient` builds: auth
 * and PostgREST. `SupabaseClient` constructs realtime, storage and functions
 * eagerly in its constructor, so no bundler can shake them out — composing the
 * two we use keeps the rest out of the bundle entirely.
 *
 * Everything here mirrors what `@supabase/supabase-js` does, because the app
 * has to keep talking to the same endpoints and reading the same stored
 * session. The pieces that must stay byte-identical are called out below.
 */

/** `AuthClient` is a const aliasing the `GoTrueClient` class, so instances type as `GoTrueClient`. */
export type SupabaseClient = {
  readonly auth: GoTrueClient;
  readonly from: PostgrestClient<any>['from'];
};

const CLIENT_INFO = 'godiscover';

export function createSupabaseClient(
  supabaseUrl: string,
  anonKey: string,
  options: { auth: SupabaseAuthOptions; fetch?: typeof fetch }
): SupabaseClient {
  const baseUrl = new URL(
    supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`
  );

  const auth = new AuthClient({
    url: new URL('auth/v1', baseUrl).href,
    // supabase-js derives this key from the project ref, and an already
    // signed-in user's session is sitting under it right now. Deriving it any
    // other way would sign every existing user out on their next visit.
    storageKey: `sb-${baseUrl.hostname.split('.')[0]}-auth-token`,
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      'X-Client-Info': CLIENT_INFO,
    },
    ...options.auth,
  });

  const rest = new PostgrestClient(new URL('rest/v1', baseUrl).href, {
    // Deliberately no Authorization here: the per-request fetch below supplies
    // it, and a header set at construction time would win over the fresh one.
    headers: { 'X-Client-Info': CLIENT_INFO },
    schema: 'public',
    fetch: authenticatedFetch(anonKey, auth, options.fetch),
  });

  return { auth, from: rest.from.bind(rest) };
}

/**
 * PostgREST needs the access token that is current *at request time*, not the
 * one that happened to be live when the client was built. `getSession()`
 * refreshes an expired token before returning, so resolving it per request is
 * what keeps RLS writes working across a token expiry — bind it once and the
 * saved-items upserts start failing an hour into a session.
 *
 * Falling back to the anon key matches signed-out behaviour, where RLS is
 * expected to reject the write rather than the transport.
 */
export function authenticatedFetch(
  anonKey: string,
  auth: Pick<GoTrueClient, 'getSession'>,
  baseFetch: typeof fetch = (...args) => fetch(...args)
): typeof fetch {
  return async (input, init) => {
    const { data } = await auth.getSession();
    const headers = new Headers(init?.headers);
    if (!headers.has('apikey')) headers.set('apikey', anonKey);
    if (!headers.has('Authorization')) {
      headers.set(
        'Authorization',
        `Bearer ${data.session?.access_token ?? anonKey}`
      );
    }
    return baseFetch(input, { ...init, headers });
  };
}
