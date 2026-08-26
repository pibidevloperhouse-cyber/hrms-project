import { createClient } from "@supabase/supabase-js";

/**
 * Central storage bucket constant for employee documents.
 * Configurable via SUPABASE_EMPLOYEE_DOCUMENTS_BUCKET environment variable.
 */
export const EMPLOYEE_DOCUMENTS_BUCKET =
  process.env.SUPABASE_EMPLOYEE_DOCUMENTS_BUCKET || "employee-documents";

/**
 * Creates a Supabase admin client using the Service Role key.
 * This client bypasses Row Level Security (RLS) and has full access
 * to auth user management (e.g. deleting rejected users, managing records).
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
