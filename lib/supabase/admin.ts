import { createClient } from "@supabase/supabase-js";

/**
 * Admin client using the service role key. This bypasses Row Level
 * Security entirely, so it must NEVER be imported into client-side
 * code — only used inside server-only files like API routes.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
