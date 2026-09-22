import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

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
    const { company } = await getCompanyAndRoleForUser(adminSupabase, user);
    if (!company) {
      return NextResponse.json({ message: "Company workspace not found." }, { status: 404 });
    }

    // Query sprints for project
    const { data: sprints, error: sprintErr } = await adminSupabase
      .from("project_sprints")
      .select("*")
      .eq("project_id", projectId)
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });

    if (sprintErr) {
      // If table doesn't exist yet, return empty list gracefully
      if (sprintErr.code === "42P01" || sprintErr.message?.includes("does not exist")) {
        return NextResponse.json({ success: true, sprints: [] });
      }
      console.error("Fetch sprints error:", sprintErr);
      return NextResponse.json({ message: "Failed to load sprints." }, { status: 500 });
    }

    // Fetch tasks counts grouped by sprint
    const { data: tasks } = await adminSupabase
      .from("project_tasks")
      .select("id, sprint_id, status, story_points")
      .eq("project_id", projectId)
      .eq("company_id", company.id);

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
 * Creates a new sprint.
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
    const { company, role } = await getCompanyAndRoleForUser(adminSupabase, user);
    if (!company) {
      return NextResponse.json({ message: "Company workspace not found." }, { status: 404 });
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const canManage = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr") || cleanRole.includes("manager") || cleanRole.includes("lead");
    if (!canManage) {
      return NextResponse.json({ message: "Access denied. Team Leads, Managers, and Admins only." }, { status: 403 });
    }

    const body = await req.json();
    const { name, goal = "", start_date, end_date, status = "PLANNED" } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ message: "Sprint name is required." }, { status: 400 });
    }

    // Verify parent project exists and is not Kanban
    const { data: targetProject, error: projErr } = await adminSupabase
      .from("projects")
      .select("id, name, project_type")
      .eq("id", projectId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (projErr || !targetProject) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    if ((targetProject.project_type || "").toLowerCase() === "kanban") {
      return NextResponse.json(
        { message: "Sprint creation is disabled for Kanban projects as Kanban operates on continuous flow." },
        { status: 400 }
      );
    }

    const payload = {
      company_id: company.id,
      project_id: projectId,
      name: name.trim(),
      goal: goal.trim(),
      status: ["PLANNED", "ACTIVE", "COMPLETED"].includes(status) ? status : "PLANNED",
      start_date: start_date || null,
      end_date: end_date || null,
    };

    const { data: newSprint, error: insertErr } = await adminSupabase
      .from("project_sprints")
      .insert([payload])
      .select()
      .single();

    if (insertErr) {
      console.error("Insert sprint error:", insertErr);
      return NextResponse.json({ message: insertErr.message || "Failed to create sprint." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Sprint "${newSprint.name}" created.`,
      sprint: {
        ...newSprint,
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
    const { company, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);
    if (!company) {
      return NextResponse.json({ message: "Company workspace not found." }, { status: 404 });
    }

    const body = await req.json();
    const { sprint_id, name, goal, status, start_date, end_date } = body;

    if (!sprint_id) {
      return NextResponse.json({ message: "Sprint ID is required." }, { status: 400 });
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name.trim();
    if (goal !== undefined) updateData.goal = goal.trim();
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;
    if (status !== undefined && ["PLANNED", "ACTIVE", "COMPLETED"].includes(status)) {
      updateData.status = status;
    }

    const { data: updatedSprint, error: updateErr } = await adminSupabase
      .from("project_sprints")
      .update(updateData)
      .eq("id", sprint_id)
      .eq("project_id", projectId)
      .eq("company_id", company.id)
      .select()
      .single();

    if (updateErr) {
      console.error("Update sprint error:", updateErr);
      return NextResponse.json({ message: updateErr.message || "Failed to update sprint." }, { status: 500 });
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
          .eq("company_id", company.id);

        for (const t of (sprintTasks || [])) {
          const targetAssignee = t.planned_assignee_id || t.assigned_to;
          if (targetAssignee && !t.assigned_to) {
            await adminSupabase
              .from("project_tasks")
              .update({
                assigned_to: targetAssignee,
                updated_at: new Date().toISOString(),
              })
              .eq("id", t.id);
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
          .eq("company_id", company.id);

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
              .eq("company_id", company.id);

            if (moveErr) {
              console.error("Move unfinished tasks to backlog error:", moveErr);
            } else {
              // Audit the rollover in task_status_history
              try {
                const historyEntries = unfinishedTasks.map((t) => ({
                  company_id: company.id,
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
