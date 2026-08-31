import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporter } from "@/lib/mail/transporter";
import { buildLeaveDecisionNoticeHTML } from "@/lib/mail/leaveEmail";

function isHRRole(role) {
  return role === "hr_manager" || role === "hr_executive";
}

/**
 * PATCH /api/leaves/[id]
 * 
 * HR Action: Approve or Reject a leave request and attach an HR feedback note.
 * Accessible ONLY to HR Managers, HR Executives, and Company Admins.
 */
export async function PATCH(req, { params }) {
  try {
    const { id: leaveId } = await params;
    if (!leaveId) {
      return NextResponse.json({ message: "Leave ID is required." }, { status: 400 });
    }

    const supabaseServer = await createClient();
    const { data: { user }, error: authErr } = await supabaseServer.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // 1. Resolve logged in user role & company
    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("*")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .limit(1);

    const empRecord = empRecords && empRecords.length > 0 ? empRecords[0] : null;
    let userRole = empRecord ? empRecord.role : null;
    let companyId = empRecord ? empRecord.company_id : null;

    if (!userRole) {
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("*")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      if (adminCompanies && adminCompanies.length > 0) {
        userRole = "ADMIN";
        companyId = adminCompanies[0].id;
      }
    }

    const isAdmin = userRole === "ADMIN";
    const isHR = isHRRole(userRole) || isAdmin;

    if (!isHR) {
      return NextResponse.json(
        { message: "Access Denied. Only HR Personnel or Company Admins can approve or reject leave requests." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { status, hr_feedback } = body;

    if (!status || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json(
        { message: "Invalid status. Must be 'APPROVED' or 'REJECTED'." },
        { status: 400 }
      );
    }

    // 2. Fetch target leave request and resolve applicant role
    const { data: existingLeave, error: fetchErr } = await adminSupabase
      .from("leave_requests")
      .select(`
        *,
        employees:employee_id (
          id,
          full_name,
          email,
          department,
          designation,
          role
        )
      `)
      .eq("id", leaveId)
      .single();

    if (fetchErr || !existingLeave) {
      return NextResponse.json({ message: "Leave request not found." }, { status: 404 });
    }

    if (existingLeave.company_id !== companyId) {
      return NextResponse.json({ message: "Unauthorized company access." }, { status: 403 });
    }

    const applicantRole = existingLeave.employees?.role || "";
    const isApplicantHR = isHRRole(applicantRole);

    // HIERARCHY ENFORCEMENT:
    // If the leave was submitted by an HR member (hr_manager or hr_executive), ONLY Company Owner (ADMIN) can approve/reject it.
    if (isApplicantHR && !isAdmin) {
      return NextResponse.json(
        {
          message: "Access Denied. Leave requests submitted by HR Personnel can only be approved or rejected by the Company Owner.",
          requiredRole: "ADMIN",
        },
        { status: 403 }
      );
    }

    // 3. Update leave request with decision and feedback note
    const reviewerTitle = isAdmin ? "Company Owner" : "HR Department";
    const { data: updatedLeave, error: updateErr } = await adminSupabase
      .from("leave_requests")
      .update({
        status,
        hr_feedback: hr_feedback ? hr_feedback.trim() : null,
        actioned_by: user.id,
        actioned_at: new Date().toISOString(),
      })
      .eq("id", leaveId)
      .select(`
        *,
        employees:employee_id (
          id,
          full_name,
          email,
          department,
          designation,
          role
        )
      `)
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 5. Send notification email to the Employee / HR Applicant
    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS && updatedLeave.employees?.email) {
        const html = buildLeaveDecisionNoticeHTML({
          companyName: "Company HRMS",
          employeeName: updatedLeave.employees?.full_name || "Employee",
          leaveType: updatedLeave.leave_type,
          leaveDate: `${updatedLeave.start_date} to ${updatedLeave.end_date}`,
          status: status.toLowerCase(),
          reviewerComment: hr_feedback || "",
          reviewerRole: reviewerTitle,
        });

        await transporter.sendMail({
          from: `"${reviewerTitle}" <${process.env.EMAIL_USER}>`,
          to: updatedLeave.employees.email,
          subject: `✈️ Leave Request ${status}: ${updatedLeave.start_date} to ${updatedLeave.end_date} (${reviewerTitle})`,
          html,
        });
      }
    } catch (mailErr) {
      console.warn("Employee Notification Email Warning:", mailErr.message);
    }

    return NextResponse.json({
      success: true,
      message: `Leave request successfully ${status.toLowerCase()} by ${reviewerTitle}.`,
      leave: updatedLeave,
      reviewedBy: reviewerTitle,
    });
  } catch (error) {
    console.error("PATCH /api/leaves/[id] Error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to update leave request." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/leaves/[id]
 * 
 * Allows employee to cancel their pending leave request.
 */
export async function DELETE(req, { params }) {
  try {
    const { id: leaveId } = await params;
    if (!leaveId) {
      return NextResponse.json({ message: "Leave ID is required." }, { status: 400 });
    }

    const supabaseServer = await createClient();
    const { data: { user }, error: authErr } = await supabaseServer.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Fetch existing leave
    const { data: existingLeave, error: fetchErr } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("id", leaveId)
      .single();

    if (fetchErr || !existingLeave) {
      return NextResponse.json({ message: "Leave request not found." }, { status: 404 });
    }

    // Mark as CANCELLED or delete
    const { error: cancelErr } = await adminSupabase
      .from("leave_requests")
      .update({ status: "CANCELLED" })
      .eq("id", leaveId);

    if (cancelErr) throw cancelErr;

    return NextResponse.json({
      success: true,
      message: "Leave request cancelled successfully.",
    });
  } catch (error) {
    console.error("DELETE /api/leaves/[id] Error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to cancel leave request." },
      { status: 500 }
    );
  }
}
