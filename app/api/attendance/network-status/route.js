import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, resolveEmployeeFast } from "@/lib/supabase/authHelper";
import { validateCompanyNetwork } from "@/lib/security/networkValidator";

/**
 * GET /api/attendance/network-status
 * Preemptively checks if caller's IP matches active company networks.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const empRecord = await resolveEmployeeFast(adminSupabase, user);

    if (!empRecord || !empRecord.company_id) {
      return NextResponse.json(
        { message: "Employee company not found." },
        { status: 404 }
      );
    }

    const networkCheck = await validateCompanyNetwork(req, empRecord.company_id, adminSupabase);

    const isAuthorized = Boolean(networkCheck.isAuthorized);
    return NextResponse.json({
      success: true,
      isAuthorized,
      networkName: isAuthorized ? (networkCheck.matchedNetwork?.network_name || "Authorized Company Network") : null,
      message: isAuthorized
        ? "Connected to Authorized Company Network"
        : "Unauthorized Network: Your current connection is not recognized as an authorized company network. Please connect to your office Wi-Fi to proceed.",
    });
  } catch (error) {
    console.error("GET Network Status Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
