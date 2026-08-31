import { createBrowserClient } from "@supabase/ssr";

let clientInstance = null;

/**
 * Returns a singleton browser Supabase client.
 * Using a singleton is critical in @supabase/ssr to prevent Web Locks API
 * deadlocks and race conditions when multiple components access auth state.
 */
export function createClient() {
  if (clientInstance) return clientInstance;

  clientInstance = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return clientInstance;
}