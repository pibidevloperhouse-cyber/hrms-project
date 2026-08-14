import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, resolveEmployeeFast } from "@/lib/supabase/authHelper";

function isHRRole(role) {
  return ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(role);
}

/**
 * GET /api/notifications
 * Dynamically computes actionable alerts from primary business tables (leaves, attendance).
 * No database notifications table required.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized", unauthorized: true }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const empRecord = await resolveEmployeeFast(adminSupabase, user);

    if (!empRecord) {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    const userRole = empRecord.role || "employee";
    const isHR = isHRRole(userRole);
    const computedNotifications = [];

    if (isHR) {
      // 1. Fetch pending leaves requiring HR approval
      const { data: pendingLeaves } = await adminSupabase
        .from("leaves")
        .select("id, leave_type, reason, created_at, employee_id, employees(full_name, email)")
        .eq("company_id", empRecord.company_id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });

      if (pendingLeaves) {
        pendingLeaves.forEach((l) => {
          const empName = l.employees?.full_name || "An employee";
          computedNotifications.push({
            id: `leave-${l.id}`,
            title: "⌛ Pending Leave Request",
            message: `${empName} requested ${l.leave_type || "leave"}. Reason: "${l.reason || "No reason specified"}"`,
            type: "PENDING_LEAVE",
            is_read: false,
            created_at: l.created_at,
          });
        });
      }

      // 2. Fetch pending early check-out requests requiring HR approval
      const { data: pendingEarlyAtt } = await adminSupabase
        .from("attendance")
        .select("id, check_in, check_out, working_hours, early_reason, approval_status, updated_at, employees(full_name)")
        .eq("company_id", empRecord.company_id)
        .eq("approval_status", "PENDING")
        .order("updated_at", { ascending: false });

      if (pendingEarlyAtt) {
        pendingEarlyAtt.forEach((att) => {
          const empName = att.employees?.full_name || "An employee";
          computedNotifications.push({
            id: `att-early-${att.id}`,
            title: "⏱️ Early Check-Out Approval Required",
            message: `${empName} checked out early (${att.working_hours || 0} hrs). Reason: "${att.early_reason || "No reason provided"}"`,
            type: "EARLY_CHECKOUT_REQUEST",
            is_read: false,
            created_at: att.updated_at || att.check_in,
          });
        });
      }
    } else {
      // For standard employees: compute recent decisions on their leaves & early check-outs
      const { data: userLeaves } = await adminSupabase
        .from("leaves")
        .select("id, leave_type, status, updated_at")
        .eq("employee_id", empRecord.id)
        .neq("status", "PENDING")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (userLeaves) {
        userLeaves.forEach((l) => {
          const isApproved = l.status === "APPROVED";
          computedNotifications.push({
            id: `my-leave-${l.id}`,
            title: isApproved ? "✅ Leave Request Approved" : "✖ Leave Request Rejected",
            message: `Your ${l.leave_type || "leave"} application has been ${l.status.toLowerCase()} by HR.`,
            type: isApproved ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
            is_read: true,
            created_at: l.updated_at,
          });
        });
      }

      const { data: userEarlyAtt } = await adminSupabase
        .from("attendance")
        .select("id, check_in, working_hours, approval_status, hr_feedback, actioned_at, updated_at")
        .eq("employee_id", empRecord.id)
        .eq("early_checkout", true)
        .neq("approval_status", "PENDING")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (userEarlyAtt) {
        userEarlyAtt.forEach((att) => {
          const isApproved = att.approval_status === "APPROVED";
          computedNotifications.push({
            id: `my-att-${att.id}`,
            title: isApproved ? "✅ Early Check-Out Approved" : "⚠️ Early Check-Out Rejected (LOP)",
            message: isApproved
              ? `Your early check-out request (${att.working_hours || 0} hrs) was approved.`
              : `Your early check-out request was rejected by HR.${att.hr_feedback ? ` HR Note: ${att.hr_feedback}` : ""}`,
            type: isApproved ? "EARLY_CHECKOUT_APPROVED" : "EARLY_CHECKOUT_REJECTED_LOP",
            is_read: true,
            created_at: att.actioned_at || att.updated_at,
          });
        });
      }
    }

    // Sort descending by created_at
    computedNotifications.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    const unreadCount = computedNotifications.filter((n) => !n.is_read).length;

    return NextResponse.json({
      success: true,
      notifications: computedNotifications,
      unreadCount,
    });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ message: error.message || "Failed to compute notifications." }, { status: 500 });
  }
}

/**
 * POST /api/notifications
 * Acknowledges UI mark-as-read requests without DB writes.
 */
export async function POST(req) {
  try {
    return NextResponse.json({ success: true, message: "Notifications acknowledged." });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ message: error.message || "Failed to update notifications." }, { status: 500 });
  }
}

