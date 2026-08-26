import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { checkAndSendDailySummary } from "@/lib/mail/dailySummaryHelper";

/**
 * POST /api/attendance/send-daily-summary
 * Manual or automated endpoint to trigger the end-of-day attendance summary report email.
 * Sends summary report to configured user email (EMAIL_USER).
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in.", unauthorized: true },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // Resolve company
    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("company_id, role")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .limit(1);

    let companyId = empRecords && empRecords.length > 0 ? empRecords[0].company_id : null;
    let role = empRecords && empRecords.length > 0 ? empRecords[0].role : null;

    if (!companyId) {
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("id")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      if (adminCompanies && adminCompanies.length > 0) {
        companyId = adminCompanies[0].id;
        role = "ADMIN";
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    const isHR = ["ADMIN", "hr_manager", "hr_executive"].includes(role);
    if (!isHR) {
      return NextResponse.json(
        { message: "Access denied. Only HR Managers or Admins can dispatch the daily summary report." },
        { status: 403 }
      );
    }

    let reqBody = {};
    try {
      reqBody = await req.json();
    } catch {
      // Optional body
    }

    const force = reqBody.force !== undefined ? Boolean(reqBody.force) : true;
    const result = await checkAndSendDailySummary(companyId, adminSupabase, { force });

    return NextResponse.json({
      success: true,
      message: result?.sent
        ? `Daily attendance summary report email successfully sent to ${result.recipients?.join(", ")}.`
        : `Daily summary check completed (Status: ${result?.reason || "held"}).`,
      details: result,
    });
  } catch (error) {
    console.error("POST /api/attendance/send-daily-summary error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to send daily summary." },
      { status: 500 }
    );
  }
}
