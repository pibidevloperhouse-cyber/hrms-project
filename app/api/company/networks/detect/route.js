import { NextResponse } from "next/server";
import { getLocalMachineIps } from "@/lib/security/networkValidator";

/**
 * GET /api/company/networks/detect
 * Helper endpoint to detect caller's client IP from incoming request headers.
 */
export async function GET(req) {
  try {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const cfConnectingIp = req.headers.get("cf-connecting-ip");

    let ip = "";
    if (forwardedFor) {
      ip = forwardedFor.split(",")[0].trim();
    } else if (realIp) {
      ip = realIp.trim();
    } else if (cfConnectingIp) {
      ip = cfConnectingIp.trim();
    }

    if (!ip || ip === "::1" || ip === "127.0.0.1") {
      // In local development, detect the active Wi-Fi / Ethernet adapter IPv4
      const localIps = getLocalMachineIps().filter(addr => !addr.includes(":") && addr !== "127.0.0.1");
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
