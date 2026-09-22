import os from "os";

/**
 * Network Validator & Security Utility
 * Server-side IP extraction, CIDR subnet matching, and authorized company network verification.
 */

/**
 * Retrieves all active non-internal IPv4/IPv6 addresses configured on the host machine.
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
 * Safely extracts the true client IP address from incoming Next.js / Node request headers.
 */
export function extractClientIp(req) {
  if (!req) return "127.0.0.1";

  // Check standard proxy headers
  const forwardedFor = req.headers?.get ? req.headers.get("x-forwarded-for") : req.headers?.["x-forwarded-for"];
  const realIp = req.headers?.get ? req.headers.get("x-real-ip") : req.headers?.["x-real-ip"];
  const cfConnectingIp = req.headers?.get ? req.headers.get("cf-connecting-ip") : req.headers?.["cf-connecting-ip"];
  const trueClientIp = req.headers?.get ? req.headers.get("true-client-ip") : req.headers?.["true-client-ip"];

  let rawIp = "";
  if (forwardedFor) {
    rawIp = String(forwardedFor).split(",")[0].trim();
  } else if (cfConnectingIp) {
    rawIp = String(cfConnectingIp).trim();
  } else if (realIp) {
    rawIp = String(realIp).trim();
  } else if (trueClientIp) {
    rawIp = String(trueClientIp).trim();
  } else if (req.ip) {
    rawIp = String(req.ip).trim();
  } else if (req.socket?.remoteAddress) {
    rawIp = String(req.socket.remoteAddress).trim();
  }

  // Strip IPv6 prefix for IPv4-mapped addresses (e.g., ::ffff:192.168.1.5 -> 192.168.1.5)
  if (rawIp.startsWith("::ffff:")) {
    rawIp = rawIp.replace("::ffff:", "");
  }

  // Normalize localhost
  if (!rawIp || rawIp === "::1" || rawIp === "localhost") {
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
 * Tests if an IPv4 address falls within a given CIDR block (e.g. "192.168.1.0/24").
 */
function isIpInCidr(clientIp, cidr) {
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
 * Evaluates whether a client IP matches an individual network rule (exact IP, CIDR range, or same /24 private subnet).
 */
export function isIpMatching(clientIp, networkRule) {
  if (!clientIp || !networkRule) return false;

  const cleanClient = String(clientIp).trim().toLowerCase();
  const cleanRule = String(networkRule).trim().toLowerCase();

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

  // 3. Prefix match (e.g., "192.168.1." or "192.168.1.*" or "10.0.")
  const prefixPattern = cleanRule.replace(/\*$/, "");
  if (prefixPattern.endsWith(".") && cleanClient.startsWith(prefixPattern)) {
    return true;
  }

  // 4. CIDR Subnet match (e.g., 192.168.1.0/24 or 10.0.0.0/16)
  if (cleanRule.includes("/")) {
    try {
      return isIpInCidr(cleanClient, cleanRule);
    } catch (_) {
      return false;
    }
  }

  // 5. Automatic /24 subnet match for private class C IPv4 (e.g., router 192.168.1.1 vs device 192.168.1.44)
  const clientOctets = cleanClient.split(".");
  const ruleOctets = cleanRule.split(".");
  if (clientOctets.length === 4 && ruleOctets.length === 4) {
    const isPrivateC =
      (clientOctets[0] === "192" && clientOctets[1] === "168" && ruleOctets[0] === "192" && ruleOctets[1] === "168") ||
      (clientOctets[0] === "10" && ruleOctets[0] === "10") ||
      (clientOctets[0] === "172" && ruleOctets[0] === "172");

    if (isPrivateC && clientOctets[0] === ruleOctets[0] && clientOctets[1] === ruleOctets[1] && clientOctets[2] === ruleOctets[2]) {
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

    // 1. Direct match check on the incoming request IP
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

    // 2. Local loopback resolution:
    // If the browser connected via localhost (127.0.0.1), check if the host machine's
    // physical network interfaces (active Wi-Fi adapter) match any registered company network.
    if (isLoopback) {
      const localIps = getLocalMachineIps();
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

    // IP does not match any registered active company network -> STRICTLY REJECT
    return {
      isAuthorized: false,
      clientIp,
      matchedNetwork: null,
      activeNetworksCount: activeList.length,
      reason: "Unauthorized Network: Your current connection is not recognized as an authorized company network. Please connect to your office Wi-Fi or authorized company network to proceed.",
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
