import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (serverClient) {
    return serverClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  serverClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serverClient;
}
