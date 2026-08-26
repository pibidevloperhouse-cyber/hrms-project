import os from "os";

// ----- Private IP Detection -----

/** RFC 1918 private ranges + loopback addresses */
const PRIVATE_IP_PATTERNS = [
  (ip) => ip === "localhost",
  (ip) => ip === "127.0.0.1",
  (ip) => ip.startsWith("192.168."),
  (ip) => ip.startsWith("10."),
  (ip) => /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip),
];

/**
 * Checks if a host string refers to a local/private network address.
 * Strips protocol and port before checking.
 *
 * @param {string} hostStr - e.g. "http://192.168.1.42:3000" or "localhost"
 * @returns {boolean}
 */
function isPrivateHost(hostStr) {
  if (!hostStr) return false;
  const ip = hostStr.replace(/^https?:\/\//, "").split(":")[0];
  return PRIVATE_IP_PATTERNS.some((check) => check(ip));
}

// ----- URL Resolution Strategies -----

/**
 * Strategy 1: Extract URL from the incoming HTTP request headers.
 * Next.js / Vercel set x-forwarded-host and x-forwarded-proto for proxied requests.
 */
function resolveFromRequestHeaders(req, isVercel) {
  if (!req) return null;

  try {
    const host =
      req.headers.get("x-forwarded-host") || req.headers.get("host");
    const protocol =
      req.headers.get("x-forwarded-proto") || (isVercel ? "https" : "http");

    if (host) {
      // In local dev, always use the active request host (e.g. localhost:3000)
      // On Vercel/production, ensure we don't accidentally return a private/local host
      if (!isVercel || !isPrivateHost(host)) {
        return `${protocol}://${host}`;
      }
    }
  } catch {
    // Header reading can fail in edge runtimes — fall through
  }

  return null;
}

/**
 * Strategy 2: Use VERCEL_URL, which Vercel auto-injects on every deployment.
 * Always HTTPS on Vercel.
 */
function resolveFromVercelEnv() {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;
}

/**
 * Strategy 3: Use the developer-configured app URL from environment variables.
 * Skips private IPs when running on Vercel (they'd be from .env.local).
 */
function resolveFromAppEnv(isVercel) {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;

  if (envUrl && (!isVercel || !isPrivateHost(envUrl))) {
    return envUrl;
  }

  return null;
}

/**
 * Strategy 4: Auto-discover the machine's LAN IPv4 address.
 * Only useful in local development for testing from other devices on the same network.
 */
function resolveFromNetworkInterfaces() {
  try {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          return `http://${iface.address}:3000`;
        }
      }
    }
  } catch (err) {
    console.warn("Could not auto-detect network IP:", err);
  }

  return null;
}

// ----- Main Export -----

/** Remove trailing slash for consistent URL joining */
const stripTrailingSlash = (url) => url.replace(/\/$/, "");

/**
 * Resolves the publicly reachable base URL of the application.
 *
 * Uses a priority waterfall:
 *   1. Request headers (x-forwarded-host)  →  most accurate for the current request
 *   2. VERCEL_URL env                      →  Vercel's auto-injected deployment URL
 *   3. NEXT_PUBLIC_APP_URL env             →  developer-configured custom domain
 *   4. LAN IP auto-discovery               →  local dev convenience
 *   5. http://localhost:3000               →  ultimate fallback
 *
 * @param {Request} [req] - The incoming Next.js request object (optional)
 * @returns {string} The base URL without a trailing slash
 */
export function getAppUrl(req) {
  const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL_URL;

  const url =
    resolveFromRequestHeaders(req, isVercel) ||
    resolveFromVercelEnv() ||
    resolveFromAppEnv(isVercel) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (!isVercel && resolveFromNetworkInterfaces()) ||
    "http://localhost:3000";

  return stripTrailingSlash(url);
}
