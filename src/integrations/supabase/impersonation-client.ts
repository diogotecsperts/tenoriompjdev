// Client Supabase dedicado à sessão impersonada.
// Usa storageKey diferente do client principal para NÃO deslogar o dev
// na aba original — cada aba usa localStorage no mesmo domínio, então
// isolamos a persistência da sessão por chave.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const impersonationSupabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'sb-impersonation-token',
    },
  },
);
