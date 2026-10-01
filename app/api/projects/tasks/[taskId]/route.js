import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { syncSprintLifecycles } from "@/lib/sprintAutoLifecycle";
import {
  getTaskPermissionRole,
  isTaskStatusTransitionAllowed,
  normalizeTaskStatus,
} from "@/lib/projectUtils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function sanitizeAttachments(rawAtts) {
  if (!Array.isArray(rawAtts)) return [];
  return rawAtts.map((a, idx) => {
    if (typeof a === "string") {
      if (a.startsWith("http://") || a.startsWith("https://")) {
        return { id: `att-${idx}`, name: `Attachment-${idx + 1}`, url: a };
      }
      return { id: `att-${idx}`, name: `Attachment-${idx + 1}`, url: "" };
    }
    const resolvedUrl = a.url || (a.dataUrl && (a.dataUrl.startsWith("http://") || a.dataUrl.startsWith("https://")) ? a.dataUrl : "");
    return {
      id: a.id || `att-${Date.now()}-${idx}`,
      name: a.name || `Screenshot-${idx + 1}.png`,
      size: a.size || "Unknown",
      url: resolvedUrl || a.url || "",
      type: a.type || "image/png",
    };
  });
}

/**
 * GET /api/projects/tasks/[taskId]
 * Securely retrieves a single task with role-based authorization check.
 */
export async function GET(req, { params }) {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ message: "Task ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    const { data: task, error: taskErr } = await adminSupabase
      .from("project_tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();

    if (taskErr || !task) {
      return NextResponse.json({ message: "Task not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, task.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    // Verify parent project authorization
    let project = null;
    if (task.project_id) {
      const { data: projData } = await adminSupabase
        .from("projects")
        .select("id, name, department, status, priority, team_lead_id, created_by, owner_id, team_members")
        .eq("id", task.project_id)
        .eq("company_id", task.company_id)
        .maybeSingle();
      project = projData;
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isProjectOwnerOrCreator = project?.created_by === employeeProfile?.id || project?.owner_id === employeeProfile?.id;
    const isLead = cleanRole.includes("lead") || project?.team_lead_id === employeeProfile?.id;
    const isDeptManager = isManager && project?.department && employeeProfile?.department && project.department.toLowerCase() === employeeProfile.department.toLowerCase();

    const myIdentities = new Set();
    if (employeeProfile?.id) myIdentities.add(employeeProfile.id);
    if (user?.id) myIdentities.add(user.id);
    if (employeeProfile?.auth_user_id) myIdentities.add(employeeProfile.auth_user_id);
    if (employeeProfile?.user_id) myIdentities.add(employeeProfile.user_id);

    const isAssigned = Boolean(
      (task.assigned_to && myIdentities.has(task.assigned_to)) ||
      (task.planned_assignee_id && myIdentities.has(task.planned_assignee_id))
    );
    const isSquadMember = Array.isArray(project?.team_members) && project.team_members.some((mId) => myIdentities.has(mId));

    const canView = isOwnerOrAdmin || isDeptManager || isProjectOwnerOrCreator || isLead || isAssigned || isSquadMember;

    if (!canView) {
      return NextResponse.json({ message: "Access denied to task details." }, { status: 403 });
    }

    // Enrich assignee and sprint
    let assignee = null;
    const effectiveAssigneeId = task.assigned_to || task.planned_assignee_id;
    if (effectiveAssigneeId) {
      const { data: a } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url, auth_user_id")
        .eq("id", effectiveAssigneeId)
        .maybeSingle();
      assignee = a;
    }

    let sprint = null;
    if (task.sprint_id) {
      const { data: s } = await adminSupabase
        .from("project_sprints")
        .select("id, name, goal, status, start_date, end_date")
        .eq("id", task.sprint_id)
        .maybeSingle();
      sprint = s;
    }

    let epic = null;
    if (task.epic_id) {
      const { data: ep } = await adminSupabase
        .from("project_epics")
        .select("id, name, color")
        .eq("id", task.epic_id)
        .maybeSingle();
      epic = ep;
    }

    // Enrich reviewer / approver details
    let reviewer = null;
    const effectiveReviewerId = task.reviewed_by || task.approved_by || task.review_feedback_by;
    if (effectiveReviewerId) {
      const { data: rev } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url")
        .eq("id", effectiveReviewerId)
        .maybeSingle();
      reviewer = rev;
    }

    // Fallback: If task is COMPLETED and reviewer is null, look up who approved it in task_status_history
    if (!reviewer && task.status === "COMPLETED") {
      try {
        const { data: history } = await adminSupabase
          .from("task_status_history")
          .select("id, changed_by, old_status, new_status, comments, created_at, changed_by_employee:employees!task_status_history_changed_by_fkey(id, full_name, role, department, designation, avatar_url)")
          .eq("task_id", taskId)
          .order("created_at", { ascending: false });

        if (Array.isArray(history)) {
          const approvalEntry = history.find(
            (h) =>
              h.new_status === "COMPLETED" ||
              (h.old_status === "REVIEW" && h.new_status === "COMPLETED") ||
              (h.comments && h.comments.toLowerCase().includes("approved"))
          );
          if (approvalEntry?.changed_by_employee) {
            reviewer = approvalEntry.changed_by_employee;
          }
        }
      } catch (histLookupErr) {
        console.warn("Reviewer history lookup error:", histLookupErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      task: {
        ...task,
        assignee,
        planned_assignee: assignee,
        sprint,
        epic,
        reviewer,
        reviewed_by_name: task.reviewed_by_name || task.approved_by_name || reviewer?.full_name || null,
        approved_by_name: task.approved_by_name || task.reviewed_by_name || reviewer?.full_name || null,
        reviewed_at: task.reviewed_at || task.approved_at || (task.status === "COMPLETED" ? (task.completed_at || task.updated_at) : null),
        approved_at: task.approved_at || task.reviewed_at || (task.status === "COMPLETED" ? (task.completed_at || task.updated_at) : null),
        is_sprint_active: Boolean(sprint && sprint.status === "ACTIVE"),
        is_in_backlog: !task.sprint_id,
      },
    });
  } catch (err) {
    console.error("GET task error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/tasks/[taskId]
 * Updates a subtask's status, details, priority, or assignee.
 * - Assigned Employee: Can update status (e.g. TODO -> IN_PROGRESS -> REVIEW), submit deliverable attachments & comments, request extensions
 * - Team Lead / Manager / Admin: Can update all fields, approve completions, decide extensions, reassign
 */
export async function PATCH(req, { params }) {
  try {
    const { taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ message: "Task ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Fetch existing task directly first to identify company workspace
    const { data: task, error: taskErr } = await adminSupabase
      .from("project_tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();

    if (taskErr || !task) {
      console.warn("Task lookup failed:", taskErr?.message || "Task not found");
      return NextResponse.json({ message: "Task not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, task.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    // Fetch parent project directly within company
    let project = null;
    if (task.project_id) {
      const { data: projData } = await adminSupabase
        .from("projects")
        .select("*")
        .eq("id", task.project_id)
        .eq("company_id", company.id)
        .maybeSingle();
      project = projData;
    }

    // Auto-sync date-driven sprint lifecycles before evaluating sprint status
    try {
      await syncSprintLifecycles(adminSupabase, company.id, task.project_id);
    } catch (sprintSyncErr) {
      console.warn("Auto sprint sync warning in PATCH task:", sprintSyncErr?.message);
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isProjectOwnerOrCreator = project?.owner_id === employeeProfile?.id || project?.created_by === employeeProfile?.id;
    const myIdentities = new Set();
    if (employeeProfile?.id) myIdentities.add(employeeProfile.id);
    if (user?.id) myIdentities.add(user.id);
    if (employeeProfile?.auth_user_id) myIdentities.add(employeeProfile.auth_user_id);
    if (employeeProfile?.user_id) myIdentities.add(employeeProfile.user_id);

    const isAssignedEmployee = Boolean(
      (task.assigned_to && myIdentities.has(task.assigned_to)) ||
      (task.planned_assignee_id && myIdentities.has(task.planned_assignee_id))
    );

    const isTaskCreator = Boolean(task.created_by && myIdentities.has(task.created_by));
    const isAssignedLead = Boolean(project?.team_lead_id && myIdentities.has(project.team_lead_id));
    const isManager = cleanRole.includes("manager") || cleanRole.includes("lead");

    // Any user who created the task, is assigned, or has management/lead/admin role can update task details
    const canApproveCompletion = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManager;
    const canManageTask = canApproveCompletion || isTaskCreator;
    const isLeadOrManagerOrAdmin = canApproveCompletion;
    const canUpdateTask = canManageTask || isAssignedEmployee;

    const userRoleCategory = getTaskPermissionRole(role, employeeProfile, project);

    if (!canUpdateTask) {
      return NextResponse.json({ message: "Access denied. You cannot update this task." }, { status: 403 });
    }

    const body = await req.json();

    const updateData = {};

    // Check optional columns that exist in database schema for project_tasks
    const hasCol = (col) => Object.prototype.hasOwnProperty.call(task, col);
    const hasProgressColumn = hasCol("progress");
    const hasPlannedAssigneeColumn = hasCol("planned_assignee_id");

    // Title can be updated by manager, lead, admin, creator, or assigned member
    if (body.title !== undefined) {
      const cleanTitle = String(body.title).trim();
      if (cleanTitle) {
        updateData.title = cleanTitle;
      }
    }

    // Status mapping & normalization (TODO, IN_PROGRESS, REVIEW, COMPLETED)
    if (body.status !== undefined) {
      const cleanStatus = normalizeTaskStatus(body.status);
      const validStatuses = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"];
      if (validStatuses.includes(cleanStatus)) {
        // Enforce role-based status transition state machine
        if (cleanStatus !== task.status) {
          const isAllowed = isTaskStatusTransitionAllowed(userRoleCategory, task.status, cleanStatus);
          if (!isAllowed) {
            if (userRoleCategory !== "EMPLOYEE" && (task.status === "IN_PROGRESS" || task.status === "TODO") && cleanStatus === "COMPLETED") {
              return NextResponse.json(
                {
                  message: "Deliverable Submission Required: In-progress tasks must be submitted for review by the assigned developer before they can be verified and marked as Completed.",
                  code: "DELIVERABLE_SUBMISSION_REQUIRED",
                },
                { status: 403 }
              );
            }
            if (userRoleCategory !== "EMPLOYEE" && (task.status === "IN_PROGRESS" || task.status === "TODO") && cleanStatus === "REVIEW") {
              return NextResponse.json(
                {
                  message: "Deliverable Submission Required: Only the assigned developer can submit deliverables for review.",
                  code: "DEVELOPER_SUBMISSION_REQUIRED",
                },
                { status: 403 }
              );
            }
            if (task.status === "COMPLETED" && userRoleCategory === "EMPLOYEE") {
              return NextResponse.json(
                {
                  message: "Access Denied: Completed tasks are locked and cannot be reopened or moved by employees.",
                  code: "TASK_COMPLETED_LOCKED",
                },
                { status: 403 }
              );
            }
            if (task.status === "REVIEW" && userRoleCategory === "EMPLOYEE") {
              return NextResponse.json(
                {
                  message: "Access Denied: Tasks under review are locked while waiting for supervisor verification.",
                  code: "TASK_IN_REVIEW_LOCKED",
                },
                { status: 403 }
              );
            }
            if (cleanStatus === "COMPLETED" && !canApproveCompletion) {
              return NextResponse.json(
                {
                  message: "Deliverable Approval Required: Only the Project Manager or Assigned Team Lead can validate and mark a task as Completed after reviewing the deliverable. Please submit your work for Review.",
                  code: "COMPLETION_PERMISSION_DENIED",
                },
                { status: 403 }
              );
            }
            return NextResponse.json(
              {
                message: `Unauthorized status transition: Moving task from "${task.status}" to "${cleanStatus}" is not permitted for role ${userRoleCategory}.`,
                code: "INVALID_STATUS_TRANSITION",
              },
              { status: 403 }
            );
          }
        }




        // Enforce Sprint Lifecycle Rule: Regular employees cannot move/update tasks in the Backlog or an unstarted Sprint (Scrum projects)
        const isKanban = (project?.project_type || "").toLowerCase() === "kanban";
        if (!isLeadOrManagerOrAdmin && !isKanban && cleanStatus !== task.status) {
          const targetSprintId = body.sprint_id !== undefined ? (body.sprint_id || null) : task.sprint_id;
          if (!targetSprintId) {
            return NextResponse.json(
              {
                message: "Sprint Not Started: This task is currently in the Backlog. You can begin work and update the task status once your Team Lead or Manager assigns it to an active sprint and starts the sprint.",
                code: "SPRINT_NOT_STARTED",
              },
              { status: 403 }
            );
          }

          // Fetch sprint status
          const { data: targetSprint } = await adminSupabase
            .from("project_sprints")
            .select("id, name, status")
            .eq("id", targetSprintId)
            .eq("company_id", company.id)
            .maybeSingle();

          const isSprintActive = Boolean(
            targetSprint && String(targetSprint.status).toUpperCase() === "ACTIVE"
          );

          if (!isSprintActive) {
            return NextResponse.json(
              {
                message: `Sprint Not Started: This task belongs to the "${targetSprint?.name || "Planned"}" sprint which has not been started yet. You can begin work and update the task status once your Team Lead or Manager starts the sprint.`,
                code: "SPRINT_NOT_STARTED",
              },
              { status: 403 }
            );
          }
        }

        updateData.status = cleanStatus;

        // Automatically stamp task lifecycle milestones for performance evaluation
        if (cleanStatus === "IN_PROGRESS") {
          if (!task.started_at) {
            updateData.started_at = new Date().toISOString();
          }
        } else if (cleanStatus === "REVIEW") {
          if (hasCol("submitted_at")) updateData.submitted_at = body.review_submitted_at || new Date().toISOString();
        } else if (cleanStatus === "COMPLETED") {
          const nowIso = new Date().toISOString();
          const reviewerFullName = employeeProfile?.full_name || body.reviewed_by_name || body.approved_by_name || "Team Lead / Project Manager";
          const reviewerEmpId = employeeProfile?.id || body.reviewed_by || body.approved_by || null;

          if (hasCol("completed_at")) updateData.completed_at = nowIso;
          if (hasCol("reviewed_at")) updateData.reviewed_at = nowIso;
          if (hasCol("approved_at")) updateData.approved_at = nowIso;
          if (hasCol("reviewed_by")) updateData.reviewed_by = reviewerEmpId;
          if (hasCol("approved_by")) updateData.approved_by = reviewerEmpId;
          if (hasCol("reviewed_by_name")) updateData.reviewed_by_name = reviewerFullName;
          if (hasCol("approved_by_name")) updateData.approved_by_name = reviewerFullName;
          if (hasCol("completed_by")) updateData.completed_by = reviewerEmpId;
        } else if (cleanStatus === "TODO") {
          if (hasCol("completed_at")) updateData.completed_at = null;
          if (hasCol("submitted_at")) updateData.submitted_at = null;
        }
      }
    }

    // Direct reviewer metadata overrides (guarded by column existence)
    if (body.reviewed_by !== undefined && hasCol("reviewed_by")) {
      updateData.reviewed_by = body.reviewed_by || employeeProfile?.id || null;
    }
    if (body.reviewed_by_name !== undefined && hasCol("reviewed_by_name")) {
      updateData.reviewed_by_name = body.reviewed_by_name || employeeProfile?.full_name || null;
    }
    if (body.approved_by !== undefined && hasCol("approved_by")) {
      updateData.approved_by = body.approved_by || employeeProfile?.id || null;
    }
    if (body.approved_by_name !== undefined && hasCol("approved_by_name")) {
      updateData.approved_by_name = body.approved_by_name || employeeProfile?.full_name || null;
    }

    // Review submission metadata & Team Lead suggestions feedback
    if (body.review_feedback !== undefined && hasCol("review_feedback")) {
      updateData.review_feedback = body.review_feedback ? String(body.review_feedback).trim() : null;
      if (hasCol("review_feedback_by")) updateData.review_feedback_by = employeeProfile?.id || null;
      if (hasCol("review_feedback_at")) updateData.review_feedback_at = new Date().toISOString();
    } else if (body.comments && typeof body.comments === "string") {
      const trimmedComm = body.comments.trim();
      if (
        trimmedComm.includes("[Team Lead Suggestions]:") ||
        trimmedComm.includes("[Team Lead Revision Feedback]:") ||
        trimmedComm.includes("[Scope Revision Instructions]:")
      ) {
        const cleanFeedback = trimmedComm
          .replace(/\[Team Lead Suggestions\]:/g, "")
          .replace(/\[Team Lead Revision Feedback\]:/g, "")
          .replace(/\[Scope Revision Instructions\]:/g, "")
          .replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "")
          .trim();
        if (hasCol("review_feedback")) updateData.review_feedback = cleanFeedback || trimmedComm;
        if (hasCol("review_feedback_by")) updateData.review_feedback_by = employeeProfile?.id || null;
        if (hasCol("review_feedback_at")) updateData.review_feedback_at = new Date().toISOString();
      }
    }

    if (body.review_comments !== undefined || body.comments !== undefined) {
      if (hasCol("review_comments")) updateData.review_comments = body.review_comments || body.comments || null;
      if (hasCol("comments")) updateData.comments = body.comments || body.review_comments || null;
    }
    if ((body.review_attachments !== undefined || body.attachments !== undefined) && hasCol("review_attachments")) {
      const rawAtts = body.review_attachments || body.attachments || [];
      updateData.review_attachments = sanitizeAttachments(rawAtts);
    }
    if (updateData.status === "REVIEW") {
      if (hasCol("submitted_at")) updateData.submitted_at = body.review_submitted_at || updateData.submitted_at || new Date().toISOString();
      if (hasCol("review_submitted_at")) updateData.review_submitted_at = updateData.submitted_at;
      if (hasCol("review_submitted_by")) updateData.review_submitted_by = employeeProfile?.id || null;
      // When re-submitting for review, clear prior pending suggestions
      if (body.review_feedback === undefined && hasCol("review_feedback")) {
        updateData.review_feedback = null;
      }
    }

    // Progress percentage (0 - 100) only if progress column exists in database
    if (hasProgressColumn) {
      if (body.progress !== undefined) {
        updateData.progress = Math.min(100, Math.max(0, parseInt(body.progress) || 0));
      } else if (updateData.status === "COMPLETED") {
        updateData.progress = 100;
      } else if (updateData.status === "TODO") {
        updateData.progress = 0;
      } else if (updateData.status === "REVIEW") {
        updateData.progress = Math.max(85, Number(task.progress) || 0);
      } else if (updateData.status === "IN_PROGRESS") {
        updateData.progress = task.progress && Number(task.progress) > 0 && Number(task.progress) < 100 ? Number(task.progress) : 50;
      }
    }

    // Handle Due Date Extension Requests and Decisions
    if (body.action === "request_extension" || (body.extension_requested_date !== undefined && body.action !== "decide_extension")) {
      const reqDate = body.extension_requested_date || body.requested_due_date;
      const reqReason = body.extension_reason || body.reason || "";
      if (!reqDate) {
        return NextResponse.json({ message: "Requested new due date is required." }, { status: 400 });
      }
      if (!reqReason.trim()) {
        return NextResponse.json({ message: "Please provide a reason for the extension request." }, { status: 400 });
      }

      const formattedReqDate = String(reqDate).split("T")[0];

      // Sprint Boundary Check: Extensions cannot exceed the sprint's deadline as it breaks the sprint work
      if (task.sprint_id) {
        const { data: currentSprint } = await adminSupabase
          .from("project_sprints")
          .select("id, name, start_date, end_date")
          .eq("id", task.sprint_id)
          .eq("company_id", company.id)
          .maybeSingle();

        if (currentSprint?.end_date) {
          const sprintEnd = String(currentSprint.end_date).split("T")[0];
          if (formattedReqDate > sprintEnd) {
            return NextResponse.json(
              {
                message: `Extension request blocked: The requested due date (${formattedReqDate}) exceeds the Sprint "${currentSprint.name || "Sprint"}" deadline (${sprintEnd}). Extending past the sprint boundary breaks sprint deliverables and cannot be submitted to the Team Lead.`,
                sprint_end_date: sprintEnd,
                sprint_name: currentSprint.name,
                breaches_sprint: true,
              },
              { status: 400 }
            );
          }
        }
      }

      updateData.extension_status = "PENDING";
      updateData.extension_requested_date = formattedReqDate;
      updateData.extension_current_due_date = task.due_date ? String(task.due_date).split("T")[0] : null;
      updateData.extension_reason = reqReason.trim();
      updateData.extension_requested_at = new Date().toISOString();
      updateData.extension_decision_by = null;
      updateData.extension_decision_note = null;
      updateData.extension_decision_at = null;
    }

    if (body.action === "decide_extension") {
      if (!canApproveCompletion) {
        return NextResponse.json(
          { message: "Only Team Lead or Project Manager can approve or reject extension requests." },
          { status: 403 }
        );
      }
      const decision = String(body.decision || "").toUpperCase().trim();
      if (decision !== "APPROVE" && decision !== "REJECT") {
        return NextResponse.json({ message: "Invalid decision. Must be APPROVE or REJECT." }, { status: 400 });
      }

      if (decision === "APPROVE") {
        const newDueDate = body.approved_due_date || task.extension_requested_date || body.due_date;
        if (newDueDate) {
          const cleanDate = String(newDueDate).split("T")[0];
          updateData.due_date = cleanDate;
          updateData.effective_due_date = cleanDate;
        }
        updateData.extension_status = "APPROVED";
        updateData.extension_decision_by = employeeProfile?.id || null;
        updateData.extension_decision_note = body.decision_note?.trim() || "Extension approved by Team Lead.";
        updateData.extension_decision_at = new Date().toISOString();
      } else {
        updateData.extension_status = "REJECTED";
        updateData.extension_decision_by = employeeProfile?.id || null;
        updateData.extension_decision_note = body.decision_note?.trim() || "Extension request rejected by Team Lead.";
        updateData.extension_decision_at = new Date().toISOString();
      }
    }

    // Detailed description
    if (body.description !== undefined) {
      updateData.description = String(body.description).trim();
    }

    // Due date and Sprint ID validation
    const effectiveSprintId = body.sprint_id !== undefined ? (body.sprint_id || null) : task.sprint_id;
    let validatedDueDate = body.due_date !== undefined ? (body.due_date || null) : task.due_date;

    if (effectiveSprintId && (body.due_date !== undefined || body.sprint_id !== undefined)) {
      const { data: targetSprint } = await adminSupabase
        .from("project_sprints")
        .select("id, name, start_date, end_date")
        .eq("id", effectiveSprintId)
        .eq("company_id", company.id)
        .maybeSingle();

      if (targetSprint) {
        const sprintStart = targetSprint.start_date ? String(targetSprint.start_date).split("T")[0] : null;
        const sprintEnd = targetSprint.end_date ? String(targetSprint.end_date).split("T")[0] : null;

        if (validatedDueDate) {
          const rawDue = String(validatedDueDate).split("T")[0];
          if ((sprintStart && rawDue < sprintStart) || (sprintEnd && rawDue > sprintEnd)) {
            // Auto-align due date to sprint timeline so backlog tasks move into sprint smoothly
            validatedDueDate = sprintEnd || sprintStart;
          }
        } else if (sprintEnd) {
          validatedDueDate = sprintEnd;
        }
      }
    }

    // Management-only fields: Due date, sprint, epic, points, priority, assignee
    if (isLeadOrManagerOrAdmin) {
      if (body.due_date !== undefined || (body.sprint_id !== undefined && validatedDueDate)) {
        const cleanDue = validatedDueDate ? String(validatedDueDate).split("T")[0] : null;
        updateData.due_date = cleanDue;
        if (!task.original_due_date) {
          updateData.original_due_date = cleanDue;
        }
        if (!task.effective_due_date || task.extension_status !== "APPROVED") {
          updateData.effective_due_date = cleanDue;
        }
      }

      if (body.sprint_id !== undefined) {
        updateData.sprint_id = body.sprint_id || null;
      }

      // Epic ID
      if (body.epic_id !== undefined) {
        updateData.epic_id = body.epic_id || null;
      }

      // Story Points
      if (body.story_points !== undefined) {
        updateData.story_points = Number(body.story_points) || 1;
      }

      // Task Type
      if (body.task_type !== undefined) {
        updateData.task_type = body.task_type || "STORY";
      }

      // Priority
      if (body.priority !== undefined) {
        const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
        const cleanPriority = String(body.priority).toUpperCase().trim();
        if (validPriorities.includes(cleanPriority)) {
          updateData.priority = cleanPriority;
        }
      }

      // Assignee
      const rawAssignee = body.assigned_to !== undefined ? body.assigned_to : body.assignee_id;
      if (rawAssignee !== undefined) {
        if (!rawAssignee) {
          updateData.assigned_to = null;
          if (hasPlannedAssigneeColumn) {
            updateData.planned_assignee_id = null;
          }
        } else {
          const { data: newAssignee } = await adminSupabase
            .from("employees")
            .select("id, full_name, department, auth_user_id")
            .eq("id", rawAssignee)
            .eq("company_id", company.id)
            .maybeSingle();

          if (!newAssignee) {
            return NextResponse.json({ message: "Assigned employee not found in this company." }, { status: 400 });
          }

          // Auto-enroll the new assignee into project squad if not already present
          if (project?.id) {
            try {
              const currentMembers = Array.isArray(project.team_members) ? project.team_members : [];
              if (!currentMembers.includes(newAssignee.id) && newAssignee.id !== project.team_lead_id && newAssignee.id !== project.created_by && newAssignee.id !== project.owner_id) {
                const updatedMembers = [...currentMembers, newAssignee.id];
                await adminSupabase
                  .from("projects")
                  .update({ team_members: updatedMembers })
                  .eq("id", project.id)
                  .eq("company_id", company.id);
              }
            } catch (enrollErr) {
              console.warn("Auto team member enrollment on reassign warning:", enrollErr?.message);
            }
          }

          updateData.assigned_to = newAssignee.id;
          if (hasPlannedAssigneeColumn) {
            updateData.planned_assignee_id = newAssignee.id;
          }
        }
      }
    }

    updateData.updated_at = new Date().toISOString();

    let { data: updatedTask, error: updateErr } = await adminSupabase
      .from("project_tasks")
      .update(updateData)
      .eq("id", taskId)
      .eq("company_id", company.id)
      .select()
      .maybeSingle();

    // Resilient fallback retry loop for any schema difference
    let retryCount = 0;
    while (updateErr && retryCount < 15) {
      retryCount++;
      let stripped = false;
      const errMsg = updateErr.message || "";

      // 1. Dynamic regex parsing for column missing errors
      const match =
        errMsg.match(/column "?([^"\s.]+)"? of relation "?project_tasks"? does not exist/i) ||
        errMsg.match(/Could not find the '([^']+)' column of '?project_tasks'?/i) ||
        errMsg.match(/column project_tasks\.([^"\s.]+) does not exist/i);

      if (match && match[1] && Object.prototype.hasOwnProperty.call(updateData, match[1])) {
        delete updateData[match[1]];
        stripped = true;
      }

      // 2. Comprehensive fallback list for all optional columns
      const potentialCols = [
        "reviewed_at", "approved_at", "reviewed_by", "approved_by",
        "reviewed_by_name", "approved_by_name", "completed_by", "completed_at",
        "review_feedback", "review_feedback_by", "review_feedback_at",
        "review_submitted_at", "review_submitted_by", "review_comments",
        "review_attachments", "progress", "planned_assignee_id", "story_points",
        "task_type", "epic_id", "comments", "sprint_id", "started_at",
        "extension_status", "extension_requested_date", "extension_current_due_date",
        "extension_reason", "extension_requested_at", "extension_decision_by",
        "extension_decision_note", "extension_decision_at", "effective_due_date", "original_due_date"
      ];

      for (const col of potentialCols) {
        if (errMsg.includes(`'${col}'`) || errMsg.includes(`"${col}"`) || errMsg.includes(` ${col} `) || errMsg.includes(`.${col}`)) {
          if (Object.prototype.hasOwnProperty.call(updateData, col)) {
            delete updateData[col];
            stripped = true;
          }
        }
      }

      if (!stripped) break;

      const retryRes = await adminSupabase
        .from("project_tasks")
        .update(updateData)
        .eq("id", taskId)
        .select()
        .maybeSingle();

      updatedTask = retryRes.data;
      updateErr = retryRes.error;
    }

    if (updateErr) {
      console.error("Update task error:", updateErr);
      return NextResponse.json({ message: updateErr.message || "Failed to update task." }, { status: 500 });
    }

    // Audit status change into task_status_history and generate notifications
    const isStatusChanged = Boolean(updateData.status && updateData.status !== task.status);
    const hasReviewSubmission = Boolean(
      (updateData.status === "REVIEW" || task.status === "REVIEW") &&
      (body.review_comments || body.comments || (Array.isArray(body.review_attachments) && body.review_attachments.length > 0))
    );

    if (isStatusChanged || hasReviewSubmission) {
      let auditComment = body.review_comments || body.comments || null;
      if (updateData.status === "REVIEW" || task.status === "REVIEW") {
        const rawComments = body.review_comments || body.comments || "Work submitted for review by employee";
        const rawAttachments = sanitizeAttachments(body.review_attachments || body.attachments || []);
        const payloadData = {
          comments: rawComments,
          attachments: rawAttachments,
          submitted_at: body.review_submitted_at || new Date().toISOString(),
          submitted_by: employeeProfile?.id || null,
        };
        auditComment = `<!--DELIVERABLE_PAYLOAD:${JSON.stringify(payloadData)}-->\n${rawComments}`;
      } else if (!auditComment) {
        const actorName = employeeProfile?.full_name || body.reviewed_by_name || body.approved_by_name || (cleanRole.includes("manager") ? "Project Manager" : "Team Lead");
        auditComment =
          isLeadOrManagerOrAdmin && task.status === "REVIEW" && (updateData.status === "IN_PROGRESS" || updateData.status === "TODO")
            ? (body.comments || `Changes requested by ${actorName}`)
            : isLeadOrManagerOrAdmin && updateData.status === "COMPLETED"
            ? (body.comments || `Approved and marked completed by ${actorName}`)
            : null;
      }

      try {
        await adminSupabase.from("task_status_history").insert({
          company_id: company.id,
          task_id: taskId,
          changed_by: employeeProfile?.id || null,
          old_status: task.status,
          new_status: updateData.status || task.status,
          comments: auditComment,
        });
      } catch (histErr) {
        console.warn("task_status_history insert warning:", histErr?.message);
      }

      // Dismiss / supersede any older notifications for this specific task
      try {
        await adminSupabase
          .from("notifications")
          .update({ is_read: true })
          .eq("task_id", taskId)
          .eq("company_id", company.id);
      } catch (cleanErr) {
        console.warn("Task notification cleanup warning:", cleanErr?.message);
      }

      // Dispatch in-app notifications
      try {
        const notifTime = new Date().toISOString();
        const currentEmpName = employeeProfile?.full_name || "A team member";
        const taskTitle = updatedTask?.title || task.title || "Task";
        const projName = project?.name || "Project";

        // 1. Employee submitted task for REVIEW -> Notify Managers and Team Leads
        if (updateData.status === "REVIEW") {
          const managerRecipientIds = new Set();
          if (project?.team_lead_id) managerRecipientIds.add(project.team_lead_id);
          if (project?.created_by) managerRecipientIds.add(project.created_by);
          if (project?.owner_id) managerRecipientIds.add(project.owner_id);
          
          // Don't notify the person who submitted it
          if (employeeProfile?.id) {
            managerRecipientIds.delete(employeeProfile.id);
          }

          const attachmentCount = Array.isArray(body.review_attachments || body.attachments) ? (body.review_attachments || body.attachments).length : 0;
          const attachmentNote = attachmentCount > 0 ? ` (${attachmentCount} screenshot${attachmentCount > 1 ? "s" : ""} attached)` : "";
          const commentsSummary = body.review_comments || body.comments ? ` Note: "${body.review_comments || body.comments}"` : "";

          const notifRows = Array.from(managerRecipientIds).map((mgrId) => ({
            company_id: company.id,
            employee_id: mgrId,
            title: "🔍 Task Submitted for Review",
            message: `${currentEmpName} submitted "${taskTitle}" in ${projName} for review.${attachmentNote}${commentsSummary}`,
            type: "TASK_REVIEW_PENDING",
            task_id: taskId,
            project_id: task.project_id,
            is_read: false,
            created_at: notifTime,
          }));

          if (notifRows.length > 0) {
            await adminSupabase.from("notifications").insert(notifRows);
          }
        }
        // 2. Manager approved task -> Notify Assignee
        else if (updateData.status === "COMPLETED" && (task.status === "REVIEW" || isLeadOrManagerOrAdmin)) {
          const assigneeId = task.assigned_to || task.planned_assignee_id;
          if (assigneeId && assigneeId !== employeeProfile?.id) {
            await adminSupabase.from("notifications").insert([
              {
                company_id: company.id,
                employee_id: assigneeId,
                title: "✅ Task Approved & Completed",
                message: `Your task "${taskTitle}" in ${projName} was approved by ${currentEmpName}.${body.comments ? ` Note: "${body.comments}"` : ""}`,
                type: "TASK_APPROVED",
                task_id: taskId,
                project_id: task.project_id,
                is_read: false,
                created_at: notifTime,
              },
            ]);
          }
        }
        // 3. Manager/Team Lead requested changes or gave suggestions -> Notify Assignee
        else if ((updateData.status === "TODO" || updateData.status === "IN_PROGRESS") && (task.status === "REVIEW" || isLeadOrManagerOrAdmin)) {
          const assigneeId = updateData.assigned_to || task.assigned_to || task.planned_assignee_id;
          if (assigneeId && assigneeId !== employeeProfile?.id && (body.comments || body.review_comments)) {
            const cleanSuggestion = String(body.comments || body.review_comments)
              .replace("[Team Lead Suggestions]:", "")
              .replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "")
              .trim();
            await adminSupabase.from("notifications").insert([
              {
                company_id: company.id,
                employee_id: assigneeId,
                title: "💬 Review Suggestions on Task",
                message: `${currentEmpName} reviewed "${taskTitle}" and provided suggestions: "${cleanSuggestion || "Please check task details for full feedback."}"`,
                type: "TASK_SUGGESTIONS_GIVEN",
                task_id: taskId,
                project_id: task.project_id,
                is_read: false,
                created_at: notifTime,
              },
            ]);
          }
        }
      } catch (notifErr) {
        console.warn("Task status notification warning:", notifErr?.message);
      }
    }

    // Dispatch in-app notification when task is newly assigned or reassigned to a team member
    if (
      updateData.assigned_to &&
      updateData.assigned_to !== task.assigned_to &&
      updateData.assigned_to !== employeeProfile?.id
    ) {
      try {
        const updaterName = employeeProfile?.full_name || "Management";
        const taskTitle = updatedTask?.title || task.title || "Task";
        const projName = project?.name || "Project";
        await adminSupabase.from("notifications").insert([
          {
            company_id: company.id,
            employee_id: updateData.assigned_to,
            title: "📌 Task Assigned to You",
            message: `${updaterName} assigned task "${taskTitle}" in ${projName} to you.${updateData.due_date ? ` Due: ${updateData.due_date}` : ""}`,
            type: "TASK_ASSIGNED",
            task_id: taskId,
            project_id: task.project_id,
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (assignNotifErr) {
        console.warn("Task reassignment notification warning:", assignNotifErr?.message);
      }
    }

    // Automatically update parent project status based on task deliverables
    let calculatedProjectStatus = null;
    if (updateData.status && task.project_id) {
      try {
        const { data: allProjectTasks } = await adminSupabase
          .from("project_tasks")
          .select("id, status")
          .eq("project_id", task.project_id);

        if (allProjectTasks && allProjectTasks.length > 0) {
          const taskStatuses = allProjectTasks.map((t) =>
            t.id === taskId ? updateData.status : t.status || "TODO"
          );

          const allCompleted = taskStatuses.length > 0 && taskStatuses.every((s) => s === "COMPLETED");
          const anyActive = taskStatuses.some((s) => s === "IN_PROGRESS" || s === "COMPLETED" || s === "REVIEW");

          if (allCompleted) {
            calculatedProjectStatus = "COMPLETED";
          } else if (anyActive) {
            calculatedProjectStatus = "IN_PROGRESS";
          } else {
            calculatedProjectStatus = "PLANNING";
          }

          if (calculatedProjectStatus && calculatedProjectStatus !== project?.status) {
            await adminSupabase
              .from("projects")
              .update({ status: calculatedProjectStatus, updated_at: new Date().toISOString() })
              .eq("id", task.project_id);
          }
        }
      } catch (projSyncErr) {
        console.warn("Auto project status update warning:", projSyncErr?.message);
      }
    }

    const finalTask = updatedTask || { ...task, ...updateData };

    // Enrich assignee and sprint for return
    let assignee = null;
    const effectiveAssigneeId = finalTask?.assigned_to || finalTask?.planned_assignee_id;
    if (effectiveAssigneeId) {
      const { data: a } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url, auth_user_id")
        .eq("id", effectiveAssigneeId)
        .maybeSingle();
      assignee = a;
    }

    let sprint = null;
    if (finalTask?.sprint_id) {
      const { data: s } = await adminSupabase
        .from("project_sprints")
        .select("id, name, goal, status, start_date, end_date")
        .eq("id", finalTask.sprint_id)
        .maybeSingle();
      sprint = s;
    }

    let reviewFeedbackLead = null;
    const feedbackLeadId = finalTask?.review_feedback_by || updateData?.review_feedback_by;
    if (feedbackLeadId) {
      const { data: leadEmp } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url")
        .eq("id", feedbackLeadId)
        .maybeSingle();
      reviewFeedbackLead = leadEmp;
    }

    return NextResponse.json({
      success: true,
      message: "Task updated successfully.",
      project_id: task.project_id,
      project_status: calculatedProjectStatus || project?.status,
      task: {
        ...finalTask,
        sprint,
        is_sprint_active: Boolean(sprint && sprint.status === "ACTIVE"),
        is_in_backlog: !finalTask?.sprint_id,
        is_sprint_planned: Boolean(sprint && sprint.status === "PLANNED"),
        assigned_to: finalTask?.assigned_to,
        assignee_id: finalTask?.assigned_to,
        planned_assignee_id: finalTask?.planned_assignee_id || finalTask?.assigned_to,
        assignee: assignee,
        planned_assignee: assignee,
        reviewed_by: finalTask?.reviewed_by || (updateData.status === "COMPLETED" ? (employeeProfile?.id || body.reviewed_by) : null),
        reviewed_by_name: finalTask?.reviewed_by_name || (updateData.status === "COMPLETED" ? (employeeProfile?.full_name || body.reviewed_by_name) : null),
        approved_by: finalTask?.approved_by || (updateData.status === "COMPLETED" ? (employeeProfile?.id || body.approved_by) : null),
        approved_by_name: finalTask?.approved_by_name || (updateData.status === "COMPLETED" ? (employeeProfile?.full_name || body.approved_by_name) : null),
        reviewed_at: finalTask?.reviewed_at || (updateData.status === "COMPLETED" ? new Date().toISOString() : null),
        approved_at: finalTask?.approved_at || (updateData.status === "COMPLETED" ? new Date().toISOString() : null),
        reviewer: employeeProfile || null,
        review_feedback: finalTask?.review_feedback !== undefined ? finalTask.review_feedback : updateData.review_feedback || null,
        review_feedback_by: finalTask?.review_feedback_by !== undefined ? finalTask.review_feedback_by : updateData.review_feedback_by || null,
        review_feedback_at: finalTask?.review_feedback_at !== undefined ? finalTask.review_feedback_at : updateData.review_feedback_at || null,
        review_feedback_lead: reviewFeedbackLead,
        comments: finalTask?.comments || body.comments || body.review_comments || null,
        review_comments: finalTask?.review_comments || body.review_comments || body.comments || null,
        review_attachments: finalTask?.review_attachments || body.review_attachments || body.attachments || [],
        review_submitted_at: finalTask?.review_submitted_at || (updateData.status === "REVIEW" ? (body.review_submitted_at || new Date().toISOString()) : null),
        review_submitted_by: finalTask?.review_submitted_by || (updateData.status === "REVIEW" ? (employeeProfile?.id || null) : null),
      },
    });
  } catch (err) {
    console.error("PATCH /api/projects/tasks/[taskId] error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/tasks/[taskId]
 * Deletes a subtask (Assigned Team Lead, Manager, or Admin only).
 */
export async function DELETE(req, { params }) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    const { data: task, error: taskErr } = await adminSupabase
      .from("project_tasks")
      .select("id, created_by, project_id, company_id")
      .eq("id", taskId)
      .maybeSingle();

    if (taskErr || !task) {
      return NextResponse.json({ message: "Task not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, task.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied." }, { status: 403 });
    }

    let project = null;
    if (task.project_id) {
      const { data: projData } = await adminSupabase
        .from("projects")
        .select("id, created_by, team_lead_id, company_id")
        .eq("id", task.project_id)
        .eq("company_id", company.id)
        .maybeSingle();
      project = projData;
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const canDelete =
      cleanRole.includes("admin") ||
      cleanRole.includes("owner") ||
      (cleanRole.includes("manager") && project?.created_by === employeeProfile?.id) ||
      (cleanRole.includes("lead") && (project?.team_lead_id === employeeProfile?.id || task.created_by === employeeProfile?.id));

    if (!canDelete) {
      return NextResponse.json({ message: "Access denied." }, { status: 403 });
    }

    const { error: delErr } = await adminSupabase
      .from("project_tasks")
      .delete()
      .eq("id", taskId)
      .eq("company_id", company.id);

    if (delErr) {
      return NextResponse.json({ message: "Failed to delete task." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Task deleted successfully." });
  } catch (err) {
    console.error("DELETE /api/projects/tasks/[taskId] error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
