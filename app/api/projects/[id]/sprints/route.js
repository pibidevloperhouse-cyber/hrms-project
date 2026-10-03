import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

import { syncSprintLifecycles } from "@/lib/sprintAutoLifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects/[id]/sprints
 * Returns all sprints for a project along with task metrics.
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
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Verify parent project exists
    const { data: project, error: projErr } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    // Verify user belongs to the project's company workspace
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, project.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    // Auto-sync date-driven sprint lifecycles
    try {
      if (project.company_id) {
        await syncSprintLifecycles(adminSupabase, project.company_id, projectId);
      }
    } catch (syncErr) {
      console.warn("Auto sprint sync error in GET /api/projects/[id]/sprints:", syncErr?.message);
    }

    // Query sprints for project strictly within company workspace
    let sprintQuery = adminSupabase
      .from("project_sprints")
      .select("*")
      .eq("project_id", projectId);

    if (project.company_id) {
      sprintQuery = sprintQuery.eq("company_id", project.company_id);
    }

    const { data: sprints, error: sprintErr } = await sprintQuery.order("created_at", { ascending: true });

    if (sprintErr) {
      if (sprintErr.code === "42P01" || sprintErr.message?.includes("does not exist")) {
        return NextResponse.json({ success: true, sprints: [] });
      }
      console.error("Fetch sprints error:", sprintErr);
      return NextResponse.json({ message: "Failed to load sprints." }, { status: 500 });
    }

    // Fetch tasks counts grouped by sprint (strictly scoped by company workspace)
    let tasksQuery = adminSupabase
      .from("project_tasks")
      .select("id, sprint_id, status, story_points")
      .eq("project_id", projectId);

    if (project.company_id) {
      tasksQuery = tasksQuery.eq("company_id", project.company_id);
    }

    const { data: tasks } = await tasksQuery;

    const taskMap = {};
    (tasks || []).forEach((t) => {
      if (t.sprint_id) {
        if (!taskMap[t.sprint_id]) {
          taskMap[t.sprint_id] = { totalTasks: 0, completedTasks: 0, totalPoints: 0, completedPoints: 0 };
        }
        taskMap[t.sprint_id].totalTasks += 1;
        const pts = Number(t.story_points) || 1;
        taskMap[t.sprint_id].totalPoints += pts;
        if (t.status === "COMPLETED") {
          taskMap[t.sprint_id].completedTasks += 1;
          taskMap[t.sprint_id].completedPoints += pts;
        }
      }
    });

    const enrichedSprints = (sprints || []).map((s) => ({
      ...s,
      metrics: taskMap[s.id] || { totalTasks: 0, completedTasks: 0, totalPoints: 0, completedPoints: 0 },
    }));

    return NextResponse.json({
      success: true,
      sprints: enrichedSprints,
    });
  } catch (err) {
    console.error("GET sprints error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/sprints
 * Creates a new sprint (Team Lead, Manager, or Admin only).
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
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Verify parent project exists and user is authorized to manage sprints
    const { data: targetProject, error: projErr } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (projErr || !targetProject) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, targetProject.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isProjectOwnerOrCreator = targetProject.created_by === employeeProfile?.id || targetProject.owner_id === employeeProfile?.id;
    const isAssignedLead = targetProject.team_lead_id === employeeProfile?.id;
    const canManage = isOwnerOrAdmin || isManager || isProjectOwnerOrCreator || isAssignedLead;

    if (!canManage) {
      return NextResponse.json({ message: "Access denied. Only the assigned Team Lead, Project Manager, or Admin can create sprints." }, { status: 403 });
    }

    if ((targetProject.project_type || "").toLowerCase() === "kanban") {
      return NextResponse.json(
        { message: "Sprint creation is disabled for Kanban projects as Kanban operates on continuous flow." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, goal = "", start_date, end_date, status = "PLANNED" } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ message: "Sprint name is required." }, { status: 400 });
    }

    const payload = {
      company_id: targetProject.company_id || company.id,
      project_id: projectId,
      name: name.trim(),
      goal: goal.trim(),
      status: ["PLANNED", "ACTIVE", "COMPLETED"].includes(status) ? status : "PLANNED",
      start_date: start_date || null,
      end_date: end_date || null,
    };

    let { data: newSprint, error: insertErr } = await adminSupabase
      .from("project_sprints")
      .insert([payload])
      .select()
      .maybeSingle();

    if (insertErr) {
      console.error("Insert sprint error:", insertErr);
      return NextResponse.json({ message: insertErr.message || "Failed to create sprint." }, { status: 500 });
    }

    // Auto-sync lifecycle immediately for date-driven consistency
    try {
      if (targetProject.company_id) {
        await syncSprintLifecycles(adminSupabase, targetProject.company_id, projectId);
      }
      if (newSprint?.id) {
        const { data: refreshed } = await adminSupabase
          .from("project_sprints")
          .select("*")
          .eq("id", newSprint.id)
          .maybeSingle();
        if (refreshed) newSprint = refreshed;
      }
    } catch (syncErr) {
      console.warn("POST sprint lifecycle sync warning:", syncErr?.message);
    }

    return NextResponse.json({
      success: true,
      message: `Sprint "${newSprint?.name || "Sprint"}" created.`,
      sprint: {
        ...(newSprint || payload),
        metrics: { totalTasks: 0, completedTasks: 0, totalPoints: 0, completedPoints: 0 },
      },
    });
  } catch (err) {
    console.error("POST sprint error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[id]/sprints
 * Updates sprint details or changes status (PLANNED -> ACTIVE -> COMPLETED).
 */
export async function PATCH(req, { params }) {
  try {
    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ message: "Project ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Verify project and permissions
    const { data: targetProject } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (!targetProject) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, targetProject.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isProjectOwnerOrCreator = targetProject.created_by === employeeProfile?.id || targetProject.owner_id === employeeProfile?.id;
    const isAssignedLead = targetProject.team_lead_id === employeeProfile?.id;
    const canManage = isOwnerOrAdmin || isManager || isProjectOwnerOrCreator || isAssignedLead;

    if (!canManage) {
      return NextResponse.json({ message: "Access denied. Only the assigned Team Lead, Project Manager, or Admin can update sprints." }, { status: 403 });
    }

    const body = await req.json();
    const { sprint_id, name, goal, status, start_date, end_date } = body;

    if (!sprint_id) {
      return NextResponse.json({ message: "Sprint ID is required." }, { status: 400 });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (goal !== undefined) updateData.goal = goal.trim();
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;
    if (status !== undefined && ["PLANNED", "ACTIVE", "COMPLETED"].includes(status)) {
      updateData.status = status;
    }
    updateData.updated_at = new Date().toISOString();

    let { data: updatedSprint, error: updateErr } = await adminSupabase
      .from("project_sprints")
      .update(updateData)
      .eq("id", sprint_id)
      .eq("project_id", projectId)
      .eq("company_id", targetProject.company_id)
      .select()
      .maybeSingle();

    // Fallback if updated_at column is not present in schema
    if (updateErr && (updateErr.message?.includes("updated_at") || updateErr.code === "42703")) {
      const fallbackData = { ...updateData };
      delete fallbackData.updated_at;
      const retry = await adminSupabase
        .from("project_sprints")
        .update(fallbackData)
        .eq("id", sprint_id)
        .eq("project_id", projectId)
        .eq("company_id", targetProject.company_id)
        .select()
        .maybeSingle();
      updatedSprint = retry.data;
      updateErr = retry.error;
    }

    if (updateErr || !updatedSprint) {
      console.error("Update sprint error:", updateErr);
      return NextResponse.json({ message: updateErr?.message || "Failed to update sprint." }, { status: 500 });
    }

    let movedTasksCount = 0;
    let completedTasksCount = 0;

    // Sprint lifecycle task activation:
    if (status === "ACTIVE") {
      // SPRINT STARTED! Officially activate all planned tasks in this sprint for team members
      try {
        const { data: sprintTasks } = await adminSupabase
          .from("project_tasks")
          .select("*")
          .eq("sprint_id", sprint_id)
          .eq("project_id", projectId)
          .eq("company_id", targetProject.company_id);

        for (const t of (sprintTasks || [])) {
          const targetAssignee = t.planned_assignee_id || t.assigned_to;
          if (targetAssignee && !t.assigned_to) {
            await adminSupabase
              .from("project_tasks")
              .update({
                assigned_to: targetAssignee,
                updated_at: new Date().toISOString(),
              })
              .eq("id", t.id)
              .eq("company_id", targetProject.company_id);
          }
        }
      } catch (activationErr) {
        console.warn("Sprint task activation warning:", activationErr?.message);
      }
    } else if (status === "COMPLETED") {
      // SPRINT COMPLETED! Automatically move any unfinished tasks (TODO, IN_PROGRESS, REVIEW) to the Product Backlog (sprint_id = null)
      try {
        const { data: sprintTasks, error: fetchTasksErr } = await adminSupabase
          .from("project_tasks")
          .select("id, title, status, progress, assigned_to")
          .eq("sprint_id", sprint_id)
          .eq("project_id", projectId)
          .eq("company_id", targetProject.company_id);

        if (!fetchTasksErr && Array.isArray(sprintTasks)) {
          const unfinishedTasks = sprintTasks.filter((t) => t.status !== "COMPLETED");
          completedTasksCount = sprintTasks.filter((t) => t.status === "COMPLETED").length;
          movedTasksCount = unfinishedTasks.length;

          if (unfinishedTasks.length > 0) {
            const unfinishedIds = unfinishedTasks.map((t) => t.id);

            // Batch update: unassign sprint_id to move to backlog
            const { error: moveErr } = await adminSupabase
              .from("project_tasks")
              .update({
                sprint_id: null,
                updated_at: new Date().toISOString(),
              })
              .in("id", unfinishedIds)
              .eq("company_id", targetProject.company_id);

            if (moveErr) {
              console.error("Move unfinished tasks to backlog error:", moveErr);
            } else {
              // Audit the rollover in task_status_history
              try {
                const historyEntries = unfinishedTasks.map((t) => ({
                  company_id: targetProject.company_id,
                  task_id: t.id,
                  changed_by: employeeProfile?.id || null,
                  old_status: t.status,
                  new_status: t.status,
                  comments: `Sprint "${updatedSprint.name}" completed. Preserved at ${t.progress || 0}% progress and automatically moved to Product Backlog.`,
                }));

                await adminSupabase.from("task_status_history").insert(historyEntries);
              } catch (histErr) {
                console.warn("task_status_history insert warning during sprint completion:", histErr?.message);
              }
            }
          }
        }
      } catch (rolloverErr) {
        console.warn("Sprint completion rollover error:", rolloverErr?.message);
      }
    }

    let successMessage = "Sprint updated successfully.";
    if (status === "ACTIVE") {
      successMessage = `Sprint "${updatedSprint.name}" started! Tasks are now active for team members.`;
    } else if (status === "COMPLETED") {
      successMessage =
        movedTasksCount > 0
          ? `Sprint "${updatedSprint.name}" completed! ${completedTasksCount} deliverable(s) finished, and ${movedTasksCount} unfinished task(s) moved to Product Backlog.`
          : `Sprint "${updatedSprint.name}" completed! All ${completedTasksCount} deliverable(s) finished.`;
    }

    return NextResponse.json({
      success: true,
      message: successMessage,
      movedTasksCount,
      completedTasksCount,
      sprint: updatedSprint,
    });
  } catch (err) {
    console.error("PATCH sprint error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]/sprints
 * Deletes or cancels a planned sprint after safely unlinking associated tasks.
 */
export async function DELETE(req, { params }) {
  try {
    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ message: "Project ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    const { data: targetProject } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (!targetProject) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, targetProject.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isProjectOwnerOrCreator = targetProject.created_by === employeeProfile?.id || targetProject.owner_id === employeeProfile?.id;
    const isAssignedLead = targetProject.team_lead_id === employeeProfile?.id;
    const canManage = isOwnerOrAdmin || isManager || isProjectOwnerOrCreator || isAssignedLead;

    if (!canManage) {
      return NextResponse.json({ message: "Access denied. Only the assigned Team Lead, Project Manager, or Admin can delete sprints." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let sprintId = searchParams.get("sprint_id");
    if (!sprintId) {
      try {
        const body = await req.json();
        sprintId = body.sprint_id;
      } catch {}
    }

    if (!sprintId) {
      return NextResponse.json({ message: "Sprint ID is required." }, { status: 400 });
    }

    // Unlink any tasks associated with this sprint strictly within company
    await adminSupabase
      .from("project_tasks")
      .update({ sprint_id: null })
      .eq("sprint_id", sprintId)
      .eq("project_id", projectId)
      .eq("company_id", targetProject.company_id);

    const { error: delErr } = await adminSupabase
      .from("project_sprints")
      .delete()
      .eq("id", sprintId)
      .eq("project_id", projectId)
      .eq("company_id", targetProject.company_id);

    if (delErr) {
      console.error("Delete sprint error:", delErr);
      return NextResponse.json({ message: delErr.message || "Failed to delete sprint." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Sprint deleted successfully. Associated tasks moved to Backlog.",
    });
  } catch (err) {
    console.error("DELETE sprint error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
