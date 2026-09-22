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
    const isAdmin = userRole === "ADMIN";
    const isHR = ["hr_manager", "hr_executive"].includes(userRole);
    const computedNotifications = [];

    if (isAdmin) {
      // 1. Company Owner sees all pending leaves (highlighting HR leaves requiring Owner decision)
      const { data: pendingLeaves } = await adminSupabase
        .from("leave_requests")
        .select("id, leave_type, reason, created_at, employee_id, employees(full_name, email, role)")
        .eq("company_id", empRecord.company_id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });

      if (pendingLeaves) {
        pendingLeaves.forEach((l) => {
          const empName = l.employees?.full_name || "An employee";
          const isApplicantHR = ["hr_manager", "hr_executive"].includes(l.employees?.role);

          computedNotifications.push({
            id: `leave-${l.id}`,
            title: isApplicantHR ? "👑 HR Leave Approval Required" : "⌛ Pending Employee Leave Request",
            message: isApplicantHR
              ? `${empName} (HR Staff) requested ${l.leave_type || "leave"}. Owner approval required.`
              : `${empName} requested ${l.leave_type || "leave"}. Reason: "${l.reason || "No reason specified"}"`,
            type: isApplicantHR ? "HR_LEAVE_REQUEST" : "PENDING_LEAVE",
            is_read: false,
            created_at: l.created_at,
          });
        });
      }

      // 2. Pending early check-out requests
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
    } else if (isHR) {
      // 1. HR Personnel see regular employee pending leaves (HR leaves are routed to Owner)
      const { data: pendingLeaves } = await adminSupabase
        .from("leave_requests")
        .select("id, leave_type, reason, created_at, employee_id, employees(full_name, email, role)")
        .eq("company_id", empRecord.company_id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });

      if (pendingLeaves) {
        pendingLeaves.forEach((l) => {
          const isApplicantHR = ["hr_manager", "hr_executive"].includes(l.employees?.role);
          const empName = l.employees?.full_name || "An employee";

          if (!isApplicantHR) {
            computedNotifications.push({
              id: `leave-${l.id}`,
              title: "⌛ Pending Employee Leave Request",
              message: `${empName} requested ${l.leave_type || "leave"}. Reason: "${l.reason || "No reason specified"}"`,
              type: "PENDING_LEAVE",
              is_read: false,
              created_at: l.created_at,
            });
          }
        });
      }

      // 2. Early check-outs for HR review
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
        .from("leave_requests")
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
            message: `Your ${l.leave_type || "leave"} application has been ${l.status.toLowerCase()} by management.`,
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

    // --- Task Review & Decision Notifications ---
    try {
      // 1. Fetch persistent database notifications for current employee
      const { data: dbNotifs } = await adminSupabase
        .from("notifications")
        .select("id, title, message, is_read, created_at, type, task_id, project_id")
        .eq("company_id", empRecord.company_id)
        .or(`employee_id.eq.${empRecord.id},employee_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(30);

      if (dbNotifs && dbNotifs.length > 0) {
        dbNotifs.forEach((n) => {
          computedNotifications.push({
            id: `db-${n.id}`,
            title: n.title || "Notification",
            message: n.message || "",
            type: n.type || "INFO",
            is_read: Boolean(n.is_read),
            created_at: n.created_at,
            task_id: n.task_id,
            project_id: n.project_id,
          });
        });
      }

      // 2. Dynamic Task Assignments & Due Date Alerts for regular employees
      const myEmpIds = [empRecord.id];
      if (empRecord.auth_user_id) myEmpIds.push(empRecord.auth_user_id);
      
      const { data: myAssignedTasks } = await adminSupabase
        .from("project_tasks")
        .select("id, title, status, due_date, priority, created_at, updated_at, project_id, extension_status, extension_requested_date, extension_reason, extension_decision_note, extension_decision_at, project:projects(id, name, created_by)")
        .eq("company_id", empRecord.company_id)
        .in("assigned_to", myEmpIds)
        .in("status", ["TODO", "IN_PROGRESS", "REVIEW"])
        .order("created_at", { ascending: false })
        .limit(25);

      if (myAssignedTasks && myAssignedTasks.length > 0) {
        const todayStr = new Date().toISOString().split("T")[0];

        myAssignedTasks.forEach((t) => {
          const projName = t.project?.name || "Project";
          const dueStr = t.due_date ? new Date(t.due_date).toISOString().split("T")[0] : null;
          const isCompleted = t.status === "COMPLETED";

          // Extension Decision Notifications for Employee
          if (t.extension_status === "APPROVED" && t.extension_decision_at) {
            computedNotifications.push({
              id: `task-ext-approved-${t.id}`,
              title: "✅ Due Date Extension Approved",
              message: `Your extension request for "${t.title}" in ${projName} was approved. New deadline: ${dueStr || t.extension_requested_date}.${t.extension_decision_note ? ` Note: "${t.extension_decision_note}"` : ""}`,
              type: "TASK_EXTENSION_APPROVED",
              is_read: false,
              created_at: t.extension_decision_at,
              task_id: t.id,
              project_id: t.project_id,
            });
          } else if (t.extension_status === "REJECTED" && t.extension_decision_at) {
            computedNotifications.push({
              id: `task-ext-rejected-${t.id}`,
              title: "✖ Due Date Extension Rejected",
              message: `Your extension request for "${t.title}" in ${projName} was rejected. Deadline remains ${dueStr}.${t.extension_decision_note ? ` Note: "${t.extension_decision_note}"` : ""}`,
              type: "TASK_EXTENSION_REJECTED",
              is_read: false,
              created_at: t.extension_decision_at,
              task_id: t.id,
              project_id: t.project_id,
            });
          }

          if (dueStr && !isCompleted) {
            if (dueStr === todayStr) {
              // High Priority Alert: Task Due Today
              computedNotifications.push({
                id: `task-due-today-${t.id}`,
                title: "⏰ Deliverable Due Today · Action Required",
                message: `Task "${t.title}" in ${projName} is scheduled for completion today. Please analyze the current status and prioritize this work.`,
                type: "TASK_DUE_TODAY",
                is_read: false,
                created_at: new Date().toISOString(),
                task_id: t.id,
                project_id: t.project_id,
              });
              return;
            } else if (dueStr < todayStr) {
              // Escalation Alert: Task Overdue
              computedNotifications.push({
                id: `task-overdue-${t.id}`,
                title: "⚠️ Overdue Deliverable · Priority Escalation",
                message: `Task "${t.title}" in ${projName} has exceeded its deadline (${dueStr}). Please analyze remaining blockers and update status.`,
                type: "TASK_OVERDUE",
                is_read: false,
                created_at: t.updated_at || t.created_at,
                task_id: t.id,
                project_id: t.project_id,
              });
              return;
            }
          }

          // Active assignment notification if status is TODO or IN_PROGRESS
          if (["TODO", "IN_PROGRESS"].includes(t.status)) {
            computedNotifications.push({
              id: `task-assigned-${t.id}`,
              title: "📌 Task Assigned to You",
              message: `You have an active task "${t.title}" in ${projName} (${t.status.replace("_", " ")}).`,
              type: "TASK_ASSIGNED",
              is_read: true,
              created_at: t.created_at,
              task_id: t.id,
              project_id: t.project_id,
            });
          }
        });
      }

      // 3. Pending Task Reviews & Extension Requests for Managers, Team Leads, and Admins
      const isManagement = isAdmin || isHR || userRole === "manager" || userRole === "team_lead";
      if (isManagement) {
        // A. Pending Task Reviews
        const { data: reviewTasks } = await adminSupabase
          .from("project_tasks")
          .select("id, title, status, updated_at, created_at, project_id, assigned_to, project:projects(id, name, created_by, owner_id, team_lead_id)")
          .eq("company_id", empRecord.company_id)
          .eq("status", "REVIEW")
          .order("updated_at", { ascending: false })
          .limit(20);

        // B. Pending Due Date Extension Requests
        const { data: extensionTasks } = await adminSupabase
          .from("project_tasks")
          .select("id, title, status, due_date, extension_status, extension_requested_date, extension_reason, extension_requested_at, updated_at, created_at, project_id, assigned_to, project:projects(id, name, created_by, owner_id, team_lead_id)")
          .eq("company_id", empRecord.company_id)
          .eq("extension_status", "PENDING")
          .order("extension_requested_at", { ascending: false })
          .limit(20);

        const allAssigneeIds = [
          ...(reviewTasks || []).map((t) => t.assigned_to),
          ...(extensionTasks || []).map((t) => t.assigned_to),
        ].filter(Boolean);

        const assigneeMap = new Map();
        if (allAssigneeIds.length > 0) {
          const { data: emps } = await adminSupabase
            .from("employees")
            .select("id, full_name")
            .in("id", allAssigneeIds);
          (emps || []).forEach((e) => assigneeMap.set(e.id, e.full_name));
        }

        if (extensionTasks && extensionTasks.length > 0) {
          extensionTasks.forEach((t) => {
            const proj = t.project;
            const isMyProject =
              isAdmin ||
              isHR ||
              proj?.created_by === empRecord.id ||
              proj?.owner_id === empRecord.id ||
              proj?.team_lead_id === empRecord.id;

            if (isMyProject) {
              const empName = assigneeMap.get(t.assigned_to) || "An employee";
              const projName = proj?.name || "Project";
              const reqDate = t.extension_requested_date ? String(t.extension_requested_date).split("T")[0] : "New Date";
              computedNotifications.push({
                id: `task-extension-req-${t.id}`,
                title: "⏳ Due Date Extension Requested",
                message: `${empName} requested a deadline extension for "${t.title}" in ${projName} to ${reqDate}.${t.extension_reason ? ` Reason: "${t.extension_reason}"` : ""}`,
                type: "TASK_EXTENSION_REQUESTED",
                is_read: false,
                created_at: t.extension_requested_at || t.updated_at || t.created_at,
                task_id: t.id,
                project_id: t.project_id,
              });
            }
          });
        }

        if (reviewTasks && reviewTasks.length > 0) {
          reviewTasks.forEach((t) => {
            const proj = t.project;
            const isMyProject =
              isAdmin ||
              isHR ||
              proj?.created_by === empRecord.id ||
              proj?.owner_id === empRecord.id ||
              proj?.team_lead_id === empRecord.id;

            if (isMyProject) {
              const empName = assigneeMap.get(t.assigned_to) || "An employee";
              const projName = proj?.name || "Project";
              computedNotifications.push({
                id: `task-review-${t.id}`,
                title: "🔍 Task Submitted for Review",
                message: `${empName} submitted "${t.title}" in ${projName} for review.`,
                type: "TASK_REVIEW_PENDING",
                is_read: false,
                created_at: t.updated_at || t.created_at,
                task_id: t.id,
                project_id: t.project_id,
              });
            }
          });
        }
      }
    } catch (notifFetchErr) {
      console.warn("Error fetching task notifications:", notifFetchErr?.message);
    }

    // Sort descending by created_at first so newest updates take precedence
    computedNotifications.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    // Deduplicate notifications: keep unique IDs, and if a task_id is present, keep only the latest notification for that task (superseding older milestone notifications like 50% done)
    const seenIds = new Set();
    const seenTaskIds = new Set();
    const uniqueNotifications = [];

    for (const notif of computedNotifications) {
      if (seenIds.has(notif.id)) continue;
      if (notif.task_id) {
        if (seenTaskIds.has(notif.task_id)) {
          // An earlier milestone/status notification for this task already exists in newest order; supersede older ones
          continue;
        }
        seenTaskIds.add(notif.task_id);
      }
      seenIds.add(notif.id);
      uniqueNotifications.push(notif);
    }

    const unreadCount = uniqueNotifications.filter((n) => !n.is_read).length;

    return NextResponse.json({
      success: true,
      notifications: uniqueNotifications,
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

