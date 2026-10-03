import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

import { syncSprintLifecycles } from "@/lib/sprintAutoLifecycle";
import { taskCreateSchema } from "@/lib/validations/taskValidation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects/[id]/tasks
 * Lists all subtasks for a given project with strict role-based access control.
 */
export async function GET(req, { params }) {
  try {
    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ message: "Project ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Verify project exists in this workspace
    const { data: project, error: projErr } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (projErr || !project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, project.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    // Auto-sync date-driven sprint lifecycles
    try {
      if (project.company_id) {
        await syncSprintLifecycles(adminSupabase, project.company_id, projectId);
      }
    } catch (sprintSyncErr) {
      console.warn("Auto sprint sync warning in GET /api/projects/[id]/tasks:", sprintSyncErr?.message);
    }

    // Query subtasks strictly within company workspace
    let tasksQuery = adminSupabase
      .from("project_tasks")
      .select("*")
      .eq("project_id", projectId);

    if (project.company_id) {
      tasksQuery = tasksQuery.eq("company_id", project.company_id);
    }

    tasksQuery = tasksQuery.order("created_at", { ascending: true });

    const { searchParams } = new URL(req.url);
    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isProjectOwnerOrCreator = project.owner_id === employeeProfile?.id || project.created_by === employeeProfile?.id;
    const isAssignedLead = project.team_lead_id === employeeProfile?.id;
    const isManagementOrLead = isOwnerOrAdmin || isManager || isProjectOwnerOrCreator || isAssignedLead || cleanRole.includes("lead");

    const myIdentities = new Set();
    if (employeeProfile?.id) myIdentities.add(employeeProfile.id);
    if (user?.id) myIdentities.add(user.id);
    if (employeeProfile?.auth_user_id) myIdentities.add(employeeProfile.auth_user_id);
    const idList = Array.from(myIdentities);

    if (!isManagementOrLead && assignedOnly) {
      if (idList.length > 0) {
        const orClauses = idList.flatMap((id) => [
          `assigned_to.eq.${id}`,
          `planned_assignee_id.eq.${id}`,
        ]);
        tasksQuery = tasksQuery.or(orClauses.join(","));
      }
    }

    const { data: tasks, error: tasksErr } = await tasksQuery;

    if (tasksErr) {
      if (
        tasksErr.code === "42P01" ||
        tasksErr.code === "PGRST205" ||
        tasksErr.code === "PGRST204" ||
        tasksErr.message?.includes("schema cache") ||
        tasksErr.message?.includes("Could not find the table")
      ) {
        return NextResponse.json({
          success: true,
          tasks: [],
          tableNotReady: true,
          message: "Subtasks table not initialized yet.",
        });
      }
      console.error("Fetch project tasks error:", tasksErr);
      return NextResponse.json({ message: "Failed to load subtasks." }, { status: 500 });
    }

    // Enrich assignee, planned_assignee, reviewer, sprint, and epic details
    const assigneeIds = new Set();
    const sprintIds = new Set();
    const epicIds = new Set();
    (tasks || []).forEach((t) => {
      if (t.assigned_to) assigneeIds.add(t.assigned_to);
      if (t.planned_assignee_id) assigneeIds.add(t.planned_assignee_id);
      if (t.review_feedback_by) assigneeIds.add(t.review_feedback_by);
      if (t.reviewed_by) assigneeIds.add(t.reviewed_by);
      if (t.approved_by) assigneeIds.add(t.approved_by);
      if (t.sprint_id) sprintIds.add(t.sprint_id);
      if (t.epic_id) epicIds.add(t.epic_id);
    });

    const assigneeMap = {};
    if (assigneeIds.size > 0) {
      const { data: assignees } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, username, avatar_url, auth_user_id")
        .in("id", Array.from(assigneeIds));

      if (assignees) {
        assignees.forEach((a) => {
          if (a.id) assigneeMap[a.id] = a;
          if (a.auth_user_id) assigneeMap[a.auth_user_id] = a;
        });
      }
    }

    const sprintMap = {};
    if (sprintIds.size > 0) {
      const { data: sprints } = await adminSupabase
        .from("project_sprints")
        .select("id, name, goal, status, start_date, end_date")
        .in("id", Array.from(sprintIds));

      if (sprints) {
        sprints.forEach((s) => {
          sprintMap[s.id] = s;
        });
      }
    }

    const epicMap = {};
    if (epicIds.size > 0) {
      const { data: epics } = await adminSupabase
        .from("project_epics")
        .select("id, name, description, color, status")
        .in("id", Array.from(epicIds));

      if (epics) {
        epics.forEach((ep) => {
          epicMap[ep.id] = ep;
        });
      }
    }

    // Fetch fallback review comments and attachments from task_status_history
    const allTaskIds = (tasks || []).map((t) => t.id).filter(Boolean);
    const historyDeliverableMap = {};
    if (allTaskIds.length > 0) {
      try {
        const { data: histories } = await adminSupabase
          .from("task_status_history")
          .select("task_id, comments, created_at, changed_by")
          .in("task_id", allTaskIds)
          .order("created_at", { ascending: false });

        if (histories) {
          histories.forEach((h) => {
            if (h.task_id && h.comments) {
              if (h.comments.includes("<!--DELIVERABLE_PAYLOAD:")) {
                if (!historyDeliverableMap[h.task_id] || !historyDeliverableMap[h.task_id].comments?.includes("<!--DELIVERABLE_PAYLOAD:")) {
                  historyDeliverableMap[h.task_id] = h;
                }
              } else if (!historyDeliverableMap[h.task_id]) {
                historyDeliverableMap[h.task_id] = h;
              }
            }
          });
        }
      } catch (histErr) {
        console.warn("task_status_history query fallback warning:", histErr?.message);
      }
    }

    const enrichedTasks = (tasks || []).map((t) => {
      const sprint = t.sprint_id ? sprintMap[t.sprint_id] || null : null;
      const epic = t.epic_id ? epicMap[t.epic_id] || null : null;
      const rawSprintStatus = String(sprint?.status || "").trim().toUpperCase();
      const isSprintActive = Boolean(sprint && ["ACTIVE", "IN_PROGRESS", "RUNNING", "STARTED", "CURRENT"].includes(rawSprintStatus));
      const isInBacklog = !t.sprint_id;
      const isSprintPlanned = Boolean(sprint && (rawSprintStatus === "PLANNED" || rawSprintStatus === "PLANNING" || !rawSprintStatus));

      const rawStatus = t.status || "TODO";
      const normalizedStatus = rawStatus.toUpperCase().replace(/[\s-]+/g, "_");

      const effectiveAssignee = assigneeMap[t.assigned_to] || assigneeMap[t.planned_assignee_id] || null;

      // 1. Check direct task review_attachments
      let reviewAttachments = t.review_attachments || [];
      if (typeof reviewAttachments === "string") {
        try {
          reviewAttachments = JSON.parse(reviewAttachments);
        } catch {
          reviewAttachments = [];
        }
      }
      if (!Array.isArray(reviewAttachments)) reviewAttachments = [];

      // 2. Check if t.review_comments or t.comments contains embedded payload envelope
      let embeddedPayloadComments = null;
      let embeddedPayloadAttachments = [];
      let embeddedSubmittedAt = null;
      let embeddedSubmittedBy = null;

      const directComments = t.review_comments || t.comments || "";
      if (directComments && directComments.includes("<!--DELIVERABLE_PAYLOAD:")) {
        try {
          const match = directComments.match(/<!--DELIVERABLE_PAYLOAD:([\s\S]*?)-->/);
          if (match && match[1]) {
            const parsed = JSON.parse(match[1]);
            if (parsed.comments) embeddedPayloadComments = parsed.comments;
            if (Array.isArray(parsed.attachments)) embeddedPayloadAttachments = parsed.attachments;
            if (parsed.submitted_at) embeddedSubmittedAt = parsed.submitted_at;
            if (parsed.submitted_by) embeddedSubmittedBy = parsed.submitted_by;
          }
        } catch (e) {
          console.warn("Direct deliverable payload parse error:", e);
        }
      }

      // 3. Check fallback task_status_history payload envelope
      const fallbackHistory = historyDeliverableMap[t.id];
      let historyComments = fallbackHistory?.comments || null;
      let historyAttachments = [];
      let historySubmittedAt = fallbackHistory?.created_at || null;
      let historySubmittedBy = fallbackHistory?.changed_by || null;

      if (historyComments && historyComments.includes("<!--DELIVERABLE_PAYLOAD:")) {
        try {
          const match = historyComments.match(/<!--DELIVERABLE_PAYLOAD:([\s\S]*?)-->/);
          if (match && match[1]) {
            const parsed = JSON.parse(match[1]);
            if (parsed.comments) historyComments = parsed.comments;
            if (Array.isArray(parsed.attachments)) historyAttachments = parsed.attachments;
            if (parsed.submitted_at) historySubmittedAt = parsed.submitted_at;
            if (parsed.submitted_by) historySubmittedBy = parsed.submitted_by;
          }
        } catch (e) {
          console.warn("History deliverable payload parse error:", e);
        }
      }

      // 4. Combine and resolve final clean review metadata
      let cleanReviewComments =
        t.review_comments ||
        embeddedPayloadComments ||
        historyComments ||
        t.comments ||
        null;

      if (cleanReviewComments && cleanReviewComments.includes("<!--DELIVERABLE_PAYLOAD:")) {
        cleanReviewComments = cleanReviewComments.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
      }

      // 5. Resolve Team Lead review feedback / suggestions
      let cleanReviewFeedback = t.review_feedback || null;
      let feedbackLeadId = t.review_feedback_by || null;
      let feedbackAt = t.review_feedback_at || null;

      if (!cleanReviewFeedback) {
        const rawCandidates = [
          t.comments,
          t.last_status_comment,
          historyComments,
        ].filter(Boolean);

        for (const raw of rawCandidates) {
          if (
            typeof raw === "string" &&
            (raw.includes("[Team Lead Suggestions]:") ||
             raw.includes("[Team Lead Revision Feedback]:") ||
             raw.includes("[Scope Revision Instructions]:"))
          ) {
            cleanReviewFeedback = raw
              .replace(/\[Team Lead Suggestions\]:/g, "")
              .replace(/\[Team Lead Revision Feedback\]:/g, "")
              .replace(/\[Scope Revision Instructions\]:/g, "")
              .replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "")
              .trim();
            if (fallbackHistory?.changed_by) feedbackLeadId = fallbackHistory.changed_by;
            if (fallbackHistory?.created_at) feedbackAt = fallbackHistory.created_at;
            break;
          }
        }
      }

      const reviewFeedbackLead = feedbackLeadId ? assigneeMap[feedbackLeadId] || null : null;

      const effectiveReviewAttachments =
        reviewAttachments.length > 0
          ? reviewAttachments
          : embeddedPayloadAttachments.length > 0
          ? embeddedPayloadAttachments
          : historyAttachments;

      const effectiveSubmittedAt =
        t.review_submitted_at ||
        embeddedSubmittedAt ||
        historySubmittedAt ||
        (normalizedStatus === "REVIEW" ? t.updated_at : null);

      const effectiveSubmittedBy =
        t.review_submitted_by ||
        embeddedSubmittedBy ||
        historySubmittedBy ||
        null;

      return {
        ...t,
        status: normalizedStatus,
        sprint,
        epic,
        is_sprint_active: isSprintActive,
        is_in_backlog: isInBacklog,
        is_sprint_planned: isSprintPlanned,
        assignee_id: t.assigned_to || t.planned_assignee_id || null,
        assignee: effectiveAssignee,
        planned_assignee_id: t.planned_assignee_id || t.assigned_to || null,
        planned_assignee: assigneeMap[t.planned_assignee_id] || effectiveAssignee,
        review_feedback: cleanReviewFeedback,
        review_feedback_by: feedbackLeadId,
        review_feedback_at: feedbackAt,
        review_feedback_lead: reviewFeedbackLead,
        comments: t.comments || cleanReviewComments,
        review_comments: cleanReviewComments,
        review_attachments: effectiveReviewAttachments,
        review_submitted_at: effectiveSubmittedAt,
        review_submitted_by: effectiveSubmittedBy,
        reviewed_by: t.reviewed_by || t.approved_by || feedbackLeadId || null,
        approved_by: t.approved_by || t.reviewed_by || null,
        reviewed_by_name: t.reviewed_by_name || t.approved_by_name || (t.reviewed_by ? assigneeMap[t.reviewed_by]?.full_name : null) || (t.approved_by ? assigneeMap[t.approved_by]?.full_name : null) || null,
        approved_by_name: t.approved_by_name || t.reviewed_by_name || (t.approved_by ? assigneeMap[t.approved_by]?.full_name : null) || null,
        reviewed_at: t.reviewed_at || t.approved_at || (normalizedStatus === "COMPLETED" ? (t.completed_at || t.updated_at) : null),
        approved_at: t.approved_at || t.reviewed_at || (normalizedStatus === "COMPLETED" ? (t.completed_at || t.updated_at) : null),
        reviewer: (t.reviewed_by ? assigneeMap[t.reviewed_by] : t.approved_by ? assigneeMap[t.approved_by] : null) || null,
        project: project
          ? {
              id: project.id,
              name: project.name,
              department: project.department,
              team_lead_id: project.team_lead_id,
              teamLead: project.teamLead || null,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      tasks: enrichedTasks,
      count: enrichedTasks.length,
    });
  } catch (err) {
    console.error("GET /api/projects/[id]/tasks error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/tasks
 * Creates a new subtask under a project and assigns it to an employee of the same department.
 * Allowed roles: Team Lead (assigned to project), Manager (creator/dept), ADMIN.
 */
export async function POST(req, { params }) {
  try {
    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ message: "Project ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Fetch parent project
    const { data: project, error: projErr } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (projErr || !project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, project.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    // Permission check: Team Lead assigned to project, creator Manager, or ADMIN
    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isProjectOwnerOrCreator = project.owner_id === employeeProfile?.id || project.created_by === employeeProfile?.id;
    const isAssignedLead = project.team_lead_id === employeeProfile?.id;
    const isManager = cleanRole.includes("manager") || cleanRole.includes("lead") || cleanRole.includes("supervisor");
    const canCreateTask = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManager;

    if (!canCreateTask) {
      return NextResponse.json(
        { message: "Access denied. Only the assigned Team Lead, Project Manager, or Admin can create subtasks for this project." },
        { status: 403 }
      );
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ message: "Invalid JSON request payload." }, { status: 400 });
    }

    const validationResult = taskCreateSchema.safeParse(rawBody);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors?.[0]?.message || "Validation failed on payload fields.";
      return NextResponse.json(
        {
          message: `Request validation error: ${firstError}`,
          errors: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const body = validationResult.data;
    const {
      title,
      description = "",
      priority = "MEDIUM",
      status = "TODO",
      due_date,
    } = body;
    const targetAssigneeId = body.assigned_to || rawBody.assignee_id;

    if (!title || !title.trim()) {
      return NextResponse.json({ message: "Task title is required." }, { status: 400 });
    }

    let verifiedAssignee = null;
    if (targetAssigneeId) {
      // Validate that the assigned employee exists and belongs to this company
      const { data: emp, error: empErr } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url, auth_user_id")
        .eq("id", targetAssigneeId)
        .eq("company_id", company.id)
        .maybeSingle();

      if (empErr || !emp) {
        return NextResponse.json(
          { message: "Selected employee not found in this company." },
          { status: 400 }
        );
      }

      verifiedAssignee = emp;

      // Automatically enroll the assigned employee into project squad / team_members if not already in it
      try {
        const currentMembers = Array.isArray(project.team_members) ? project.team_members : [];
        if (!currentMembers.includes(emp.id) && emp.id !== project.team_lead_id && emp.id !== project.created_by && emp.id !== project.owner_id) {
          const updatedMembers = [...currentMembers, emp.id];
          await adminSupabase
            .from("projects")
            .update({ team_members: updatedMembers })
            .eq("id", projectId);
        }
      } catch (enrollErr) {
        console.warn("Auto team member enrollment warning:", enrollErr?.message);
      }
    }

    const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    const validStatuses = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"];

    const cleanPriority = validPriorities.includes(priority?.toUpperCase()) ? priority.toUpperCase() : "MEDIUM";
    const cleanStatus = validStatuses.includes(status?.toUpperCase()) ? status.toUpperCase() : "TODO";

    // Check if target sprint is ACTIVE and validate sprint timeline bounds
    let isSprintActive = false;
    let validatedDueDate = due_date || null;
    let targetSprint = null;
    const projectCompanyId = project.company_id || company.id;

    if (body.sprint_id) {
      const { data: sData } = await adminSupabase
        .from("project_sprints")
        .select("id, name, status, start_date, end_date")
        .eq("id", body.sprint_id)
        .eq("project_id", projectId)
        .eq("company_id", projectCompanyId)
        .maybeSingle();

      if (sData) {
        targetSprint = sData;
        const isCompleted = ["COMPLETED", "CLOSED"].includes(String(targetSprint.status || "").toUpperCase());
        if (isCompleted) {
          return NextResponse.json(
            {
              message: `Invalid Sprint Assignment: Sprint "${targetSprint.name || "Sprint"}" is already completed/closed. Tasks cannot be scheduled in finished sprints.`,
              code: "SPRINT_ALREADY_COMPLETED",
            },
            { status: 400 }
          );
        }

        if (String(targetSprint.status || "").toUpperCase() === "ACTIVE") {
          isSprintActive = true;
        }

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        const sprintStart = targetSprint.start_date ? targetSprint.start_date.split("T")[0] : null;
        const sprintEnd = targetSprint.end_date ? targetSprint.end_date.split("T")[0] : null;
        const minDate = isSprintActive ? (sprintStart && sprintStart > todayStr ? sprintStart : todayStr) : sprintStart;

        if (validatedDueDate) {
          const rawDue = String(validatedDueDate).split("T")[0];

          // For active sprints, past dates are finished dates and cannot be set
          if (isSprintActive && rawDue < todayStr) {
            return NextResponse.json(
              {
                message: `Invalid Task Due Date: Due date (${rawDue}) cannot be set to a past or finished date. For active sprint "${targetSprint.name || "Active Sprint"}", tasks can only be scheduled within current active remaining days (${minDate} to ${sprintEnd || "sprint end"}).`,
                code: "DUE_DATE_PAST_ACTIVE_SPRINT",
              },
              { status: 400 }
            );
          }

          if (minDate && rawDue < minDate) {
            return NextResponse.json(
              {
                message: `Invalid Task Due Date: Due date (${rawDue}) cannot be earlier than Sprint "${targetSprint.name || "Sprint"}" start date (${minDate}). Tasks must be scheduled within the sprint duration.`,
                code: "DUE_DATE_OUTSIDE_SPRINT",
              },
              { status: 400 }
            );
          }

          if (sprintEnd && rawDue > sprintEnd) {
            const diffDays = Math.ceil((new Date(rawDue).getTime() - new Date(sprintEnd).getTime()) / (1000 * 60 * 60 * 24));
            return NextResponse.json(
              {
                message: `Invalid Task Due Date: Due date (${rawDue}) exceeds Sprint "${targetSprint.name || "Sprint"}" end date (${sprintEnd}) by ${diffDays} day${diffDays > 1 ? "s" : ""}. Tasks must be assigned within the sprint duration (${sprintStart || ""} to ${sprintEnd}).`,
                code: "DUE_DATE_OUTSIDE_SPRINT",
              },
              { status: 400 }
            );
          }
          validatedDueDate = rawDue;
        } else if (sprintEnd) {
          // If sprint is assigned without an explicit due date, default to sprint end date
          validatedDueDate = sprintEnd;
        }
      }
    }

    let targetEpic = null;
    if (body.epic_id) {
      const { data: eData } = await adminSupabase
        .from("project_epics")
        .select("id, name")
        .eq("id", body.epic_id)
        .eq("project_id", projectId)
        .eq("company_id", projectCompanyId)
        .maybeSingle();
      if (eData) {
        targetEpic = eData;
      }
    }

    const activeAssignedTo = verifiedAssignee ? verifiedAssignee.id : null;
    const cleanSprintId = targetSprint ? targetSprint.id : (body.sprint_id && String(body.sprint_id).trim() ? String(body.sprint_id).trim() : null);
    const cleanEpicId = targetEpic ? targetEpic.id : (body.epic_id && String(body.epic_id).trim() ? String(body.epic_id).trim() : null);

    const insertPayload = {
      company_id: projectCompanyId,
      project_id: projectId,
      title: title.trim(),
      description: description.trim(),
      assigned_to: activeAssignedTo,
      created_by: employeeProfile?.id || null,
      priority: cleanPriority,
      status: cleanStatus,
      due_date: validatedDueDate,
      original_due_date: validatedDueDate,
      effective_due_date: validatedDueDate,
      started_at: cleanStatus === "IN_PROGRESS" ? new Date().toISOString() : null,
      submitted_at: cleanStatus === "REVIEW" ? new Date().toISOString() : null,
      completed_at: cleanStatus === "COMPLETED" ? new Date().toISOString() : null,
      sprint_id: cleanSprintId,
      epic_id: cleanEpicId,
      story_points: Number(body.story_points) || 1,
      task_type: body.task_type || "TASK",
    };

    let { data: newTask, error: insertErr } = await adminSupabase
      .from("project_tasks")
      .insert([insertPayload])
      .select()
      .single();

    // Resilient fallback retry loop for optional schema differences without stripping sprint_id or epic_id
    let retryCount = 0;
    while (insertErr && retryCount < 5) {
      retryCount++;
      const errMsg = insertErr.message || "";
      const match =
        errMsg.match(/column "([^"]+)" of relation "project_tasks" does not exist/i) ||
        errMsg.match(/Could not find the '([^']+)' column of 'project_tasks'/i);
      if (match && match[1] && Object.prototype.hasOwnProperty.call(insertPayload, match[1])) {
        delete insertPayload[match[1]];
        const retryRes = await adminSupabase
          .from("project_tasks")
          .insert([insertPayload])
          .select()
          .single();
        newTask = retryRes.data;
        insertErr = retryRes.error;
      } else {
        break;
      }
    }

    if (insertErr) {
      console.error("Insert project_task error:", insertErr);
      if (
        insertErr.code === "42P01" ||
        insertErr.code === "PGRST205" ||
        insertErr.code === "PGRST204" ||
        insertErr.message?.includes("schema cache") ||
        insertErr.message?.includes("Could not find the table")
      ) {
        return NextResponse.json(
          { message: "Subtasks table not found in Supabase. Please run the SQL migration." },
          { status: 500 }
        );
      }
      return NextResponse.json({ message: insertErr.message || "Failed to create task." }, { status: 500 });
    }

    // Send in-app notification to the assigned employee
    if (verifiedAssignee?.id && verifiedAssignee.id !== employeeProfile?.id) {
      try {
        const creatorName = employeeProfile?.full_name || "Management";
        const projName = project?.name || "Project";
        await adminSupabase.from("notifications").insert([
          {
            company_id: company.id,
            employee_id: verifiedAssignee.id,
            title: "📌 New Task Assigned",
            message: `${creatorName} assigned you task "${newTask.title}" in ${projName}.${newTask.due_date ? ` Due: ${newTask.due_date}` : ""}`,
            type: "TASK_ASSIGNED",
            task_id: newTask.id,
            project_id: projectId,
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (notifErr) {
        console.warn("Task assignment notification warning:", notifErr?.message);
      }
    }

    const responseMsg = isSprintActive && verifiedAssignee
      ? `Task "${newTask.title}" created and assigned to ${verifiedAssignee.full_name}.`
      : verifiedAssignee
      ? `Task "${newTask.title}" planned for ${verifiedAssignee.full_name} in sprint "${targetSprint?.name || "Sprint"}".`
      : `Task "${newTask.title}" created.`;

    return NextResponse.json({
      success: true,
      message: responseMsg,
      task: {
        ...newTask,
        assigned_to: newTask.assigned_to,
        assignee_id: newTask.assigned_to,
        assignee: verifiedAssignee || null,
        planned_assignee_id: verifiedAssignee?.id || null,
        planned_assignee: verifiedAssignee || null,
        sprint: targetSprint || null,
      },
    });
  } catch (err) {
    console.error("POST /api/projects/[id]/tasks error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
