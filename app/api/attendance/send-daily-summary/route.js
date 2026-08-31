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

    // Extract target date from body if specified (e.g. YYYY-MM-DD)
    const targetDate = (reqBody.date || reqBody.targetDate || "").trim() || null;
    const targetEmail = (reqBody.targetEmail || reqBody.email || "").trim() || null;

    // When triggered manually by HR, force bypasses deduplication lock
    const force = reqBody.force !== false;
    const result = await checkAndSendDailySummary(companyId, adminSupabase, {
      force,
      targetDate,
      callerEmail: userEmail,
      targetEmail,
    });

    const displayDate = result?.reportDate || targetDate || "selected date";
    let userMessage = `Daily summary check completed for ${displayDate}.`;
    if (result?.sent) {
      userMessage = `Daily attendance summary report email for ${displayDate} successfully sent to HR (${result.recipients?.join(", ")}).`;
    } else if (result?.reason === "mail_send_failed") {
      return NextResponse.json(
        {
          success: false,
          message: `Failed to send email: ${result.error || "SMTP connection failed"}. Please check EMAIL_USER & EMAIL_PASS in .env.local.`,
          details: result,
        },
        { status: 500 }
      );
    } else if (result?.reason === "already_sent_today") {
      userMessage = `Daily attendance summary report has already been sent for ${displayDate}.`;
    } else if (result?.reason === "active_shifts_remain") {
      userMessage = `Cannot send report: ${result.activeCount} employee(s) are still clocked in on ${displayDate}. All employees must check out first.`;
    } else if (result?.reason === "no_shifts_completed_today") {
      userMessage = `No employee shifts have completed for ${displayDate}.`;
    } else if (result?.reason === "no_recipients") {
      userMessage = "No HR/Admin recipient email addresses found for this company.";
    } else if (result?.reason === "no_employees") {
      userMessage = "No employees with role 'employee' found for this company.";
    }

    return NextResponse.json({
      success: Boolean(result?.sent),
      alreadySent: result?.reason === "already_sent_today",
      message: userMessage,
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
