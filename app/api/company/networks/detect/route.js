import { NextResponse } from "next/server";
import { extractClientIp, getLocalMachineIps } from "@/lib/security/networkValidator";

/**
 * GET /api/company/networks/detect
 * Helper endpoint to detect caller's true public or local IP from incoming request headers.
 */
export async function GET(req) {
  try {
    let ip = extractClientIp(req);

    if (!ip || ip === "::1" || ip === "127.0.0.1") {
      // In local development fallback, detect the active Wi-Fi / Ethernet adapter IPv4
      const localIps = getLocalMachineIps().filter((addr) => !addr.includes(":") && addr !== "127.0.0.1");
      if (localIps.length > 0) {
        ip = localIps[0]; // e.g. 192.168.1.44
      } else {
        ip = "127.0.0.1";
      }
    }

    return NextResponse.json({
      success: true,
      ip,
    });
  } catch (error) {
    console.error("Detect IP error:", error);
    return NextResponse.json({ success: false, ip: "127.0.0.1" });
  }
}
