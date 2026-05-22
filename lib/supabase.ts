import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase env vars are not set');
}

// AsyncStorage accesses `window` which doesn't exist during SSR/build.
// On web, return undefined so Supabase uses its own browser-safe storage.
function getStorage() {
  if (typeof window === 'undefined') return undefined;
  return require('@react-native-async-storage/async-storage').default;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
