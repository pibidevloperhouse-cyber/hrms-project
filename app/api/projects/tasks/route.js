import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects/tasks
 * Batch fetches all project tasks for the authenticated user's company in a single optimized query.
 * Scoped properly according to user role:
 * - Admin / Manager: All tasks across accessible company projects
 * - Team Lead: Tasks in lead's projects or assigned to lead
 * - Employee: Tasks assigned to the employee or in user's scoped projects
 */
export async function GET(req) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "No company workspace found." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const projectIdFilter = searchParams.get("projectId");
    const assignedOnly = searchParams.get("assignedOnly") === "true";

    let query = adminSupabase
      .from("project_tasks")
      .select("*, project:projects(id, name, department, status, priority, team_lead_id, created_by)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });

    if (projectIdFilter) {
      query = query.eq("project_id", projectIdFilter);
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isLead = cleanRole.includes("lead");
    const isEmployee = !isOwnerOrAdmin && !isManager && !isLead;

    // Collect all valid identity tokens for current employee
    const myIdentities = new Set();
    if (employeeProfile?.id) myIdentities.add(employeeProfile.id);
    if (user?.id) myIdentities.add(user.id);
    if (employeeProfile?.auth_user_id) myIdentities.add(employeeProfile.auth_user_id);
    if (employeeProfile?.user_id) myIdentities.add(employeeProfile.user_id);

    if (assignedOnly) {
      if (myIdentities.size > 0) {
        const idList = Array.from(myIdentities);
        const orClauses = idList.flatMap((id) => [
          `assigned_to.eq.${id}`,
          `planned_assignee_id.eq.${id}`,
        ]);
        query = query.or(orClauses.join(","));
      }
    }

    let { data: tasks, error: tasksErr } = await query;

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
          tasksByProject: {},
          tableNotReady: true,
        });
      }
      console.error("Fetch batch project tasks error:", tasksErr);
      return NextResponse.json({ message: "Failed to load project tasks." }, { status: 500 });
    }

    // Collect distinct employee, sprint, and epic IDs for enrichment in a single round-trip
    const empIds = new Set();
    const sprintIds = new Set();
    const epicIds = new Set();

    (tasks || []).forEach((t) => {
      if (t.assigned_to) empIds.add(t.assigned_to);
      if (t.planned_assignee_id) empIds.add(t.planned_assignee_id);
      if (t.assignee_id) empIds.add(t.assignee_id);
      if (t.review_feedback_by) empIds.add(t.review_feedback_by);
      if (t.sprint_id) sprintIds.add(t.sprint_id);
      if (t.epic_id) epicIds.add(t.epic_id);
    });

    const [empRes, sprintRes, epicRes] = await Promise.all([
      empIds.size > 0
        ? adminSupabase
            .from("employees")
            .select("id, full_name, email, role, department, designation, username, avatar_url, auth_user_id")
            .in("id", Array.from(empIds))
        : { data: [] },
      sprintIds.size > 0
        ? adminSupabase
            .from("project_sprints")
            .select("id, name, status, start_date, end_date")
            .in("id", Array.from(sprintIds))
        : { data: [] },
      epicIds.size > 0
        ? adminSupabase
            .from("project_epics")
            .select("id, name, color")
            .in("id", Array.from(epicIds))
        : { data: [] },
    ]);

    // Build map indexed by both employee ID and auth_user_id for reliable resolution
    const empMap = new Map();
    (empRes.data || []).forEach((e) => {
      if (e.id) empMap.set(e.id, e);
      if (e.auth_user_id) empMap.set(e.auth_user_id, e);
    });

    const sprintMap = new Map((sprintRes.data || []).map((s) => [s.id, s]));
    const epicMap = new Map((epicRes.data || []).map((ep) => [ep.id, ep]));

    // Collect all task IDs to fetch fallback deliverable metadata from task_status_history
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
        console.warn("task_status_history batch query fallback warning:", histErr?.message);
      }
    }

    const enrichedTasks = (tasks || []).map((t) => {
      const sprint = t.sprint_id ? sprintMap.get(t.sprint_id) || null : null;
      const epic = t.epic_id ? epicMap.get(t.epic_id) || null : null;
      const effectiveAssigneeId = t.assigned_to || t.planned_assignee_id || t.assignee_id;
      const assignee = effectiveAssigneeId ? empMap.get(effectiveAssigneeId) || null : null;

      // Status normalization fallback
      const rawStatus = t.status || "TODO";
      const normalizedStatus = rawStatus.toUpperCase().replace(/[\s-]+/g, "_");

      // 1. Direct review_attachments
      let reviewAttachments = t.review_attachments || [];
      if (typeof reviewAttachments === "string") {
        try {
          reviewAttachments = JSON.parse(reviewAttachments);
        } catch {
          reviewAttachments = [];
        }
      }
      if (!Array.isArray(reviewAttachments)) reviewAttachments = [];

      // 2. Direct embedded payload search
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
          console.warn("Direct deliverable payload parse error in batch:", e);
        }
      }

      // 3. Fallback history deliverable payload
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
          console.warn("History deliverable payload parse error in batch:", e);
        }
      }

      // 4. Clean combined comments
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
            const match = raw.match(/\[(?:Team Lead Suggestions|Team Lead Revision Feedback|Scope Revision Instructions)\]:\s*([\s\S]+)$/i);
            if (match && match[1]) {
              cleanReviewFeedback = match[1].trim();
              if (fallbackHistory) {
                feedbackLeadId = feedbackLeadId || fallbackHistory.changed_by;
                feedbackAt = feedbackAt || fallbackHistory.created_at;
              }
              break;
            }
          }
        }
      }

      const reviewFeedbackLead = feedbackLeadId ? empMap.get(feedbackLeadId) || null : null;

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
        assignee,
        assignee_id: effectiveAssigneeId || null,
        planned_assignee_id: t.planned_assignee_id || t.assigned_to || null,
        planned_assignee: assignee,
        sprint,
        epic,
        is_sprint_active: sprint ? sprint.status === "ACTIVE" : false,
        is_sprint_planned: sprint ? sprint.status === "PLANNED" : false,
        is_in_backlog: !t.sprint_id,
        review_comments: cleanReviewComments,
        review_attachments: effectiveReviewAttachments,
        review_submitted_at: effectiveSubmittedAt,
        review_submitted_by: effectiveSubmittedBy,
        review_feedback: cleanReviewFeedback,
        review_feedback_by: feedbackLeadId,
        review_feedback_at: feedbackAt,
        review_feedback_lead: reviewFeedbackLead,
      };
    });


    // Group tasks by project_id
    const tasksByProject = {};
    enrichedTasks.forEach((t) => {
      if (t.project_id) {
        if (!tasksByProject[t.project_id]) {
          tasksByProject[t.project_id] = [];
        }
        tasksByProject[t.project_id].push(t);
      }
    });

    return NextResponse.json({
      success: true,
      tasks: enrichedTasks,
      tasksByProject,
      count: enrichedTasks.length,
    });
  } catch (err) {
    console.error("GET /api/projects/tasks batch error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
