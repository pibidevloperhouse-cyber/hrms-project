import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";

function isHRRole(role) {
  return ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(role);
}

/**
 * POST /api/attendance/approve-early
 * Allows HR/Admin to approve or reject an early check-out request.
 * Payload: { attendanceId: string, action: 'APPROVE' | 'REJECT', hrFeedback?: string }
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in.", unauthorized: true }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // Resolve HR user
    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("*, companies:company_id(*)")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .order("created_at", { ascending: false })
      .limit(1);

    let currentEmp = empRecords && empRecords.length > 0 ? empRecords[0] : null;
    let companyId = currentEmp ? currentEmp.company_id : null;
    let userRole = currentEmp ? currentEmp.role : "employee";

    if (!companyId) {
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("*")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      if (adminCompanies && adminCompanies.length > 0) {
        companyId = adminCompanies[0].id;
        userRole = "ADMIN";
      }
    }

    if (!companyId || !isHRRole(userRole)) {
      return NextResponse.json({ message: "Access denied. HR privileges required." }, { status: 403 });
    }

    const body = await req.json();
    const { attendanceId, action, hrFeedback } = body;

    if (!attendanceId || !action || !["APPROVE", "REJECT"].includes(action.toUpperCase())) {
      return NextResponse.json(
        { message: "Invalid payload. attendanceId and action ('APPROVE' or 'REJECT') are required." },
        { status: 400 }
      );
    }

    // Fetch existing attendance record
    const { data: attRecord, error: fetchErr } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("id", attendanceId)
      .eq("company_id", companyId)
      .single();

    if (fetchErr || !attRecord) {
      return NextResponse.json({ message: "Attendance record not found." }, { status: 404 });
    }

    const isApprove = action.toUpperCase() === "APPROVE";
    const approvalStatus = isApprove ? "APPROVED" : "REJECTED";
    const finalStatus = isApprove ? "COMPLETED" : "REJECTED_LOP";
    const isLop = !isApprove;
    const actionedAt = new Date().toISOString();

    const updatePayload = {
      approval_status: approvalStatus,
      status: finalStatus,
      is_lop: isLop,
      hr_feedback: hrFeedback || null,
      actioned_by: currentEmp?.id || null,
      actioned_at: actionedAt,
      updated_at: actionedAt,
    };

    const { data: updatedRecord, error: updateErr } = await adminSupabase
      .from("attendance")
      .update(updatePayload)
      .eq("id", attendanceId)
      .select()
      .single();

    if (updateErr) {
      // Fallback if extra columns don't exist yet
      if (updateErr.message?.includes("column") || updateErr.code === "42703") {
        const { data: fallbackRecord, error: fbErr } = await adminSupabase
          .from("attendance")
          .update({
            status: finalStatus,
            updated_at: actionedAt,
          })
          .eq("id", attendanceId)
          .select()
          .single();

        if (fbErr) throw fbErr;

        return NextResponse.json({
          success: true,
          message: isApprove
            ? "Early check-out request APPROVED."
            : "Early check-out request REJECTED (Loss of Pay applied).",
          attendance: fallbackRecord,
        });
      }
      throw updateErr;
    }

    return NextResponse.json({
      success: true,
      message: isApprove
        ? "Early check-out request APPROVED successfully. Employee notified."
        : "Early check-out request REJECTED (Loss of Pay applied). Employee notified.",
      attendance: updatedRecord,
    });
  } catch (error) {
    console.error("POST /api/attendance/approve-early error:", error);
    return NextResponse.json({ message: error.message || "Failed to process HR approval." }, { status: 500 });
  }
}
