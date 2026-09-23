import { createClient } from "@/lib/supabase/client";

/**
 * Universal authenticated fetch utility for client-side API requests.
 * Automatically resolves and attaches the active Supabase JWT access token,
 * guarantees credentials transmission, and automatically handles session
 * refreshing + retry upon encountering a 401 response.
 *
 * @param {string | URL | Request} url - Target API URL
 * @param {RequestInit} [options={}] - Fetch configuration options
 * @returns {Promise<Response>} - Standard fetch Response
 */
export async function authFetch(url, options = {}) {
  const supabase = createClient();

  let accessToken = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token || null;
  } catch (_) {}

  // Initialize headers preserving any custom user headers
  const headers = new Headers(options.headers || {});
  
  if (accessToken && !headers.has("Authorization") && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // Ensure same-origin credentials (cookies) are transmitted
  const fetchOptions = {
    ...options,
    headers,
    credentials: options.credentials || "same-origin",
  };

  let res = await fetch(url, fetchOptions);

  // If unauthorized, attempt an automatic session refresh and single retry
  if (res.status === 401) {
    try {
      const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
      if (refreshedSession?.access_token) {
        headers.set("Authorization", `Bearer ${refreshedSession.access_token}`);
        res = await fetch(url, { ...fetchOptions, headers });
      }
    } catch (_) {}
  }

  return res;
}

export default authFetch;
