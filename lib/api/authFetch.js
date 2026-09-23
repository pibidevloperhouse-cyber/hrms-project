import { createClient } from "@/lib/supabase/client";

/**
 * Extracts a valid JWT token string from browser document.cookie or localStorage
 * as a fast synchronous fallback while Supabase SDK session initializes.
 */
function extractClientJwtFallback() {
  if (typeof window === "undefined") return null;

  try {
    // 1. Search localStorage for Supabase session
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes("supabase.auth.token") || key.startsWith("sb-"))) {
        const val = localStorage.getItem(key);
        if (val) {
          const match = val.match(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
          if (match && match[0]) return match[0];
        }
      }
    }

    // 2. Search document.cookie
    if (typeof document !== "undefined" && document.cookie) {
      const match = document.cookie.match(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
      if (match && match[0]) return match[0];
    }
  } catch (_) {}

  return null;
}

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

  // Instant fallback to cookie / localStorage JWT if SDK session is still hydrating
  if (!accessToken) {
    accessToken = extractClientJwtFallback();
  }

  // Initialize headers preserving custom user headers
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
