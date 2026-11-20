import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

const globalForSupabase = globalThis as typeof globalThis & {
  supabaseClient?: SupabaseClient<Database>;
};

export function getSupabaseClient(): SupabaseClient<Database> {
  if (globalForSupabase.supabaseClient) {
    return globalForSupabase.supabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_KEY must be configured",
    );
  }

  const projectUrl = url.replace(/\/rest\/v1\/?$/, "");
  const client = createClient<Database>(projectUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  globalForSupabase.supabaseClient = client;
  return client;
}
