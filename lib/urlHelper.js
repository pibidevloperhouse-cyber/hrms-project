import os from "os";

/**
 * Resolves the publicly reachable App URL for invitation links and redirects.
 * Prefers non-localhost request Host header, then process.env.NEXT_PUBLIC_APP_URL if non-localhost,
 * and falls back to auto-discovered LAN IPv4 address (e.g. http://192.168.1.51:3000).
 */
export function getAppUrl(req) {
  // 1. If incoming request has a non-localhost host header, use it (e.g. 192.168.1.51:3000 or domain.com)
  if (req) {
    try {
      const host = req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") || "http";
      if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
        return `${proto}://${host}`.replace(/\/$/, "");
      }
    } catch {
      // Fall through if req header reading fails
    }
  }

  // 2. If NEXT_PUBLIC_APP_URL is explicitly set and is not localhost, use it
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/$/, "");
  }

  // 3. Fallback: Automatically discover active LAN IPv4 address of host machine
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          return `http://${net.address}:3000`;
        }
      }
    }
  } catch (err) {
    console.warn("Could not auto-detect network IP in getAppUrl:", err);
  }

  return (envUrl || "http://localhost:3000").replace(/\/$/, "");
}
