import os from "os";

/**
 * Network Validator & Security Utility
 * Server-side IP extraction, Vercel edge proxy support, CIDR subnet matching, and authorized company network verification.
 */

/**
 * Retrieves all active non-internal IPv4/IPv6 addresses configured on the host machine (for local dev fallback).
 */
export function getLocalMachineIps() {
  const ips = [];
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface.internal && iface.address) {
          ips.push(iface.address);
        }
      }
    }
  } catch (err) {
    console.warn("Could not inspect local network interfaces:", err);
  }
  return ips;
}

/**
 * Safely extracts the true client IP address from incoming Next.js / Vercel / Node request headers.
 */
export function extractClientIp(req) {
  if (!req) return "127.0.0.1";

  const getHeader = (name) => {
    if (typeof req.headers?.get === "function") {
      return req.headers.get(name);
    }
    return req.headers?.[name] || req.headers?.[name.toLowerCase()];
  };

  // Vercel Edge specifically guarantees the verified client public IP in x-vercel-forwarded-for
  const vercelForwardedFor = getHeader("x-vercel-forwarded-for");
  const cfConnectingIp = getHeader("cf-connecting-ip");
  const realIp = getHeader("x-real-ip");
  const trueClientIp = getHeader("true-client-ip");
  const clientIpHeader = getHeader("x-client-ip");
  const fastlyClientIp = getHeader("fastly-client-ip");
  const forwardedFor = getHeader("x-forwarded-for");

  let rawIp = "";
  if (vercelForwardedFor) {
    rawIp = String(vercelForwardedFor).split(",")[0].trim();
  } else if (cfConnectingIp) {
    rawIp = String(cfConnectingIp).trim();
  } else if (realIp) {
    rawIp = String(realIp).trim();
  } else if (trueClientIp) {
    rawIp = String(trueClientIp).trim();
  } else if (clientIpHeader) {
    rawIp = String(clientIpHeader).trim();
  } else if (fastlyClientIp) {
    rawIp = String(fastlyClientIp).trim();
  } else if (forwardedFor) {
    rawIp = String(forwardedFor).split(",")[0].trim();
  } else if (req.ip) {
    rawIp = String(req.ip).trim();
  } else if (req.socket?.remoteAddress) {
    rawIp = String(req.socket.remoteAddress).trim();
  }

  // Remove port if present (e.g., "192.168.1.1:54321" or "[2401:...]:54321")
  if (rawIp.startsWith("[") && rawIp.includes("]")) {
    const bracketMatch = rawIp.match(/^\[([^\]]+)\]/);
    if (bracketMatch) rawIp = bracketMatch[1];
  } else if (rawIp.includes(".") && rawIp.includes(":") && !rawIp.includes("::")) {
    rawIp = rawIp.split(":")[0];
  }

  // Strip IPv6 prefix for IPv4-mapped addresses (e.g., ::ffff:192.168.1.5 -> 192.168.1.5)
  if (rawIp.startsWith("::ffff:")) {
    rawIp = rawIp.replace("::ffff:", "");
  }

  // Strip IPv6 scope zone identifier (e.g., fe80::1%eth0 -> fe80::1)
  if (rawIp.includes("%")) {
    rawIp = rawIp.split("%")[0];
  }

  // Normalize localhost
  if (!rawIp || rawIp === "::1" || rawIp.toLowerCase() === "localhost") {
    rawIp = "127.0.0.1";
  }

  return rawIp;
}

/**
 * Converts an IPv4 string (e.g., "192.168.1.1") into a 32-bit unsigned integer.
 */
function ipToInt(ipStr) {
  const parts = String(ipStr).trim().split(".");
  if (parts.length !== 4) return null;
  let res = 0;
  for (let i = 0; i < 4; i++) {
    const octet = parseInt(parts[i], 10);
    if (isNaN(octet) || octet < 0 || octet > 255) return null;
    res = (res << 8) + octet;
  }
  return res >>> 0;
}

/**
 * Tests if an IPv4 address falls within a given CIDR block (e.g. "192.168.1.0/24" or "49.204.120.0/24").
 */
export function isIpInIpv4Cidr(clientIp, cidr) {
  if (!clientIp || !cidr || !cidr.includes("/")) return false;
  const [network, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const clientInt = ipToInt(clientIp);
  const networkInt = ipToInt(network);
  if (clientInt === null || networkInt === null) return false;

  if (prefix === 0) return true;
  const mask = ((0xffffffff << (32 - prefix)) >>> 0);
  return (clientInt & mask) === (networkInt & mask);
}

/**
 * Expands an IPv6 address string into a standard 8-part 4-hex-digit representation.
 * Example: "2401:4900:9273:d1f9::1" -> "2401:4900:9273:d1f9:0000:0000:0000:0001"
 */
export function expandIpv6(ip) {
  if (!ip || !ip.includes(":")) return null;
  let clean = ip.toLowerCase().split("%")[0].trim().split("/")[0];

  if (clean.startsWith("::ffff:") && clean.includes(".")) {
    return null;
  }

  const doubleColonCount = (clean.match(/::/g) || []).length;
  if (doubleColonCount > 1) return null;

  let parts = clean.split(":");
  if (clean.includes("::")) {
    const [leftStr, rightStr] = clean.split("::");
    const leftParts = leftStr ? leftStr.split(":").filter(Boolean) : [];
    const rightParts = rightStr ? rightStr.split(":").filter(Boolean) : [];
    const missingCount = 8 - (leftParts.length + rightParts.length);
    if (missingCount < 0) return null;
    const middle = Array(missingCount).fill("0000");
    parts = [...leftParts, ...middle, ...rightParts];
  }

  if (parts.length !== 8) return null;
  return parts.map((p) => p.padStart(4, "0")).join(":");
}

/**
 * Tests if an IPv6 address falls within a given IPv6 CIDR block (e.g. "2401:4900:9273::/48" or "2401:4900:9273:d1f9::/64").
 */
export function isIpInIpv6Cidr(clientIp, cidr) {
  if (!clientIp || !cidr || !cidr.includes("/")) return false;
  const [network, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;

  const expClient = expandIpv6(clientIp);
  const expNet = expandIpv6(network);
  if (!expClient || !expNet) return false;

  if (prefix === 0) return true;

  try {
    const clientBig = BigInt("0x" + expClient.replace(/:/g, ""));
    const netBig = BigInt("0x" + expNet.replace(/:/g, ""));
    const p = BigInt(prefix);
    const mask = ((1n << p) - 1n) << (128n - p);
    return (clientBig & mask) === (netBig & mask);
  } catch {
    return false;
  }
}

/**
 * Extracts the /64 routing prefix (first 4 expanded hextets) from an IPv6 address string.
 */
export function getIpv6Prefix(ip) {
  if (!ip) return null;
  const clean = ip.toLowerCase().split("%")[0].trim().split("/")[0];
  if (clean.includes("::") || clean.split(":").length >= 8) {
    const exp = expandIpv6(clean);
    if (!exp) return null;
    return exp.split(":").slice(0, 4).join(":");
  }
  // Partial prefix format like "2401:4900:9273:d1f9"
  const parts = clean.split(":").filter(Boolean);
  if (parts.length >= 4) {
    return parts.slice(0, 4).map((p) => p.padStart(4, "0")).join(":");
  }
  return null;
}

/**
 * Evaluates whether a client IP matches an individual network rule (exact IP, CIDR range, IPv6 prefix, wildcard, or private subnet).
 */
export function isIpMatching(clientIp, networkRule) {
  if (!clientIp || !networkRule) return false;

  const cleanClient = String(clientIp).trim().toLowerCase().split("%")[0];
  const cleanRule = String(networkRule).trim().toLowerCase().split("%")[0];

  // 0. Wildcard / Open Policy support
  if (
    cleanRule === "*" ||
    cleanRule === "all" ||
    cleanRule === "any" ||
    cleanRule === "0.0.0.0/0" ||
    cleanRule === "::/0"
  ) {
    return true;
  }

  // 1. Direct exact string match
  if (cleanClient === cleanRule) {
    return true;
  }

  // 2. Localhost aliases
  const isClientLocal = cleanClient === "127.0.0.1" || cleanClient === "::1" || cleanClient === "localhost";
  const isRuleLocal = cleanRule === "127.0.0.1" || cleanRule === "::1" || cleanRule === "localhost";
  if (isClientLocal && isRuleLocal) {
    return true;
  }

  // 3. Prefix / Wildcard pattern match (e.g., "192.168.1." or "49.204.120.*" or "2401:4900:*")
  if (cleanRule.endsWith("*")) {
    const pattern = cleanRule.slice(0, -1);
    if (cleanClient.startsWith(pattern)) {
      return true;
    }
  }

  // 4. CIDR Subnet Match (IPv4 or IPv6)
  if (cleanRule.includes("/")) {
    if (cleanClient.includes(":") || cleanRule.includes(":")) {
      if (isIpInIpv6Cidr(cleanClient, cleanRule)) return true;
    } else {
      if (isIpInIpv4Cidr(cleanClient, cleanRule)) return true;
    }
  }

  // 5. Dual-Stack IPv6 ISP /64 Subnet Match (e.g., client 2401:4900:9273:d1f9:1ded:... vs registered router 2401:4900:9273:d1f9:*)
  if (cleanClient.includes(":") && cleanRule.includes(":")) {
    // Both link-local
    if (cleanClient.startsWith("fe80:") && cleanRule.startsWith("fe80:")) {
      return true;
    }
    const clientPfx = getIpv6Prefix(cleanClient);
    const rulePfx = getIpv6Prefix(cleanRule);
    if (clientPfx && rulePfx && clientPfx === rulePfx) {
      return true;
    }
  }

  // 6. Automatic /24 subnet match for IPv4 (e.g., office ISP Wi-Fi pool 106.51.26.248 vs 106.51.26.x, or private 192.168.1.1 vs 192.168.1.44)
  const clientOctets = cleanClient.split(".");
  const ruleOctets = cleanRule.split(".");
  if (clientOctets.length === 4 && ruleOctets.length === 4) {
    if (
      clientOctets[0] !== "127" &&
      ruleOctets[0] !== "127" &&
      clientOctets[0] === ruleOctets[0] &&
      clientOctets[1] === ruleOctets[1] &&
      clientOctets[2] === ruleOctets[2]
    ) {
      return true;
    }
  }

  return false;
}


/**
 * Validates whether the incoming request originates from an authorized company network.
 * 
 * @param {Request} req - Next.js incoming HTTP request
 * @param {string} companyId - UUID of the employee's company
 * @param {object} adminSupabase - Supabase client with admin credentials
 * @returns {Promise<{ isAuthorized: boolean, clientIp: string, matchedNetwork: object | null, activeNetworksCount: number, reason?: string }>}
 */
export async function validateCompanyNetwork(req, companyId, adminSupabase) {
  const clientIp = extractClientIp(req);
  const isLoopback = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost";
  const isClientIpv6 = clientIp.includes(":");

  if (!companyId) {
    return {
      isAuthorized: false,
      clientIp,
      matchedNetwork: null,
      activeNetworksCount: 0,
      reason: "No active company workspace identified.",
    };
  }

  try {
    const { data: networks, error } = await adminSupabase
      .from("company_networks")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "active");

    if (error) {
      console.warn("Company networks query notice:", error.message);
      // If table doesn't exist yet, allow fallback for development while logging warning
      if (error.code === "PGRST205" || error.code === "42P01") {
        return {
          isAuthorized: true,
          clientIp,
          matchedNetwork: { network_name: "Default Network (Uninitialized DB)" },
          activeNetworksCount: 0,
        };
      }
    }

    const activeList = networks || [];

    // If company has 0 active networks configured
    if (activeList.length === 0) {
      return {
        isAuthorized: false,
        clientIp,
        matchedNetwork: null,
        activeNetworksCount: 0,
        reason: "No authorized company networks are configured. Please ask your Company Owner or HR to add an active company network in Company Settings.",
      };
    }

    // 1. Direct match check on the incoming request IP (Exact, CIDR, Wildcard, IPv6 /64 Prefix, Private /24 Subnet)
    for (const net of activeList) {
      if (isIpMatching(clientIp, net.network_ip)) {
        return {
          isAuthorized: true,
          clientIp,
          matchedNetwork: net,
          activeNetworksCount: activeList.length,
        };
      }
    }

    const localIps = getLocalMachineIps();

    // 2. Local loopback resolution (for local development machines):
    if (isLoopback) {
      for (const localIp of localIps) {
        for (const net of activeList) {
          if (isIpMatching(localIp, net.network_ip)) {
            return {
              isAuthorized: true,
              clientIp: localIp,
              matchedNetwork: net,
              activeNetworksCount: activeList.length,
            };
          }
        }
      }
    }

    // 3. Dual-Stack Wi-Fi Resolution for Mobile Devices / Local network adapters:
    if (isClientIpv6) {
      const clientPrefix = getIpv6Prefix(clientIp);
      const isClientLinkLocal = clientIp.toLowerCase().startsWith("fe80:");

      for (const localIp of localIps) {
        if (localIp.includes(":")) {
          const hostPrefix = getIpv6Prefix(localIp);
          if ((isClientLinkLocal && localIp.toLowerCase().startsWith("fe80:")) || (clientPrefix && hostPrefix && clientPrefix === hostPrefix)) {
            for (const net of activeList) {
              if (isIpMatching(localIp, net.network_ip)) {
                return {
                  isAuthorized: true,
                  clientIp,
                  matchedNetwork: net,
                  activeNetworksCount: activeList.length,
                };
              }
            }
          }
        }
      }
    }

    // IP does not match any registered active company network -> Return clear diagnostic info
    return {
      isAuthorized: false,
      clientIp,
      matchedNetwork: null,
      activeNetworksCount: activeList.length,
      reason: `Unauthorized Network: Your current connection (IP: ${clientIp}) is not recognized as an authorized company network. Please connect to your office Wi-Fi or ask HR/Admin to authorize "${clientIp}" in Company Settings.`,
    };
  } catch (err) {
    console.error("validateCompanyNetwork error:", err);
    return {
      isAuthorized: false,
      clientIp,
      matchedNetwork: null,
      activeNetworksCount: 0,
      reason: "Security validation error. Could not verify company network status.",
    };
  }
}
