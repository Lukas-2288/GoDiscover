import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { createSupabaseAuthOptions } from './auth/storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase env vars are not set');
}

const auth = createSupabaseAuthOptions(
  {
    platform: Platform.OS,
    hasWindow: typeof window !== 'undefined',
  },
  AsyncStorage
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth,
});
