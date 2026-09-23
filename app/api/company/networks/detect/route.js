import { NextResponse } from "next/server";
import { extractClientIp, getLocalMachineIps, getIpv6Prefix, expandIpv6 } from "@/lib/security/networkValidator";

/**
 * GET /api/company/networks/detect
 * Helper endpoint to detect caller's true public or local IP from incoming request headers
 * and calculate recommended CIDR subnets for dual-stack Wi-Fi environments.
 */
export async function GET(req) {
  try {
    let ip = extractClientIp(req);
    let isLocal = false;

    if (!ip || ip === "::1" || ip === "127.0.0.1") {
      // In local development fallback, detect the active Wi-Fi / Ethernet adapter IPv4
      const localIps = getLocalMachineIps().filter((addr) => !addr.includes(":") && addr !== "127.0.0.1");
      if (localIps.length > 0) {
        ip = localIps[0]; // e.g. 192.168.1.44
      } else {
        ip = "127.0.0.1";
      }
      isLocal = true;
    }

    const isIpv6 = ip.includes(":");
    let ipv6Prefix = null;
    let ipv6SubnetCidr = null;

    if (isIpv6) {
      const pfx = getIpv6Prefix(ip);
      if (pfx) {
        ipv6Prefix = pfx;
        ipv6SubnetCidr = `${pfx}::/64`;
      }
    }

    return NextResponse.json({
      success: true,
      ip,
      isIpv6,
      ipv6Prefix,
      ipv6SubnetCidr,
      isLocal,
    });
  } catch (error) {
    console.error("Detect IP error:", error);
    return NextResponse.json({ success: false, ip: "127.0.0.1", isIpv6: false });
  }
}

