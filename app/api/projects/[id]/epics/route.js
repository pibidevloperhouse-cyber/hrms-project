import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects/[id]/epics
 * Returns all epics for a project with task progress and role authorization.
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

    // Verify parent project exists & check user authorization
    const { data: project } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user, project.company_id);
    if (!company) {
      return NextResponse.json({ message: "Access denied. You do not belong to this company workspace." }, { status: 403 });
    }

    // Query epics for project strictly within company workspace
    let epicQuery = adminSupabase
      .from("project_epics")
      .select("*")
      .eq("project_id", projectId);

    if (project.company_id) {
      epicQuery = epicQuery.eq("company_id", project.company_id);
    }

    const { data: epics, error: epicErr } = await epicQuery.order("created_at", { ascending: true });

    if (epicErr) {
      if (epicErr.code === "42P01" || epicErr.message?.includes("does not exist")) {
        return NextResponse.json({ success: true, epics: [] });
      }
      console.error("Fetch epics error:", epicErr);
      return NextResponse.json({ message: "Failed to load epics." }, { status: 500 });
    }

    // Fetch tasks grouped by epic (strictly scoped by company workspace)
    let tasksQuery = adminSupabase
      .from("project_tasks")
      .select("id, epic_id, status")
      .eq("project_id", projectId);

    if (project.company_id) {
      tasksQuery = tasksQuery.eq("company_id", project.company_id);
    }

    const { data: tasks } = await tasksQuery;

    const epicMap = {};
    (tasks || []).forEach((t) => {
      if (t.epic_id) {
        if (!epicMap[t.epic_id]) {
          epicMap[t.epic_id] = { totalTasks: 0, completedTasks: 0 };
        }
        epicMap[t.epic_id].totalTasks += 1;
        if (t.status === "COMPLETED") {
          epicMap[t.epic_id].completedTasks += 1;
        }
      }
    });

    // Collect creator IDs for enrichment
    const creatorIds = new Set();
    (epics || []).forEach((e) => {
      if (e.created_by) creatorIds.add(e.created_by);
    });

    const creatorMap = {};
    if (creatorIds.size > 0) {
      const { data: creators } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, designation, avatar_url")
        .in("id", Array.from(creatorIds));

      if (creators) {
        creators.forEach((c) => {
          creatorMap[c.id] = c;
        });
      }
    }

    const enrichedEpics = (epics || []).map((e) => {
      const stats = epicMap[e.id] || { totalTasks: 0, completedTasks: 0 };
      const progress = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
      return {
        ...e,
        creator: creatorMap[e.created_by] || null,
        metrics: stats,
        progress,
      };
    });

    return NextResponse.json({
      success: true,
      epics: enrichedEpics,
    });
  } catch (err) {
    console.error("GET epics error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/epics
 * Creates a new epic.
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

    // Verify parent project exists
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
    const canManage = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr") || cleanRole.includes("manager") || cleanRole.includes("lead") || targetProject.created_by === employeeProfile?.id || targetProject.team_lead_id === employeeProfile?.id;
    if (!canManage) {
      return NextResponse.json({ message: "Access denied. Team Leads, Managers, and Admins only." }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      description = "",
      color = "#3b82f6",
      start_date,
      end_date,
      status = "IN_PROGRESS",
      creator_note = "",
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ message: "Epic name is required." }, { status: 400 });
    }

    const projStart = targetProject.start_date ? String(targetProject.start_date).split("T")[0] : null;
    const projEnd = targetProject.end_date ? String(targetProject.end_date).split("T")[0] : null;
    const epicStart = start_date ? String(start_date).split("T")[0] : null;
    const epicEnd = end_date ? String(end_date).split("T")[0] : null;

    if (epicStart && epicEnd && epicEnd < epicStart) {
      return NextResponse.json({ message: "Epic end date cannot be earlier than epic start date." }, { status: 400 });
    }
    if (projEnd && epicEnd && epicEnd > projEnd) {
      return NextResponse.json({ message: `Epic end date (${epicEnd}) cannot exceed project end date (${projEnd}).` }, { status: 400 });
    }
    if (projStart && epicStart && epicStart < projStart) {
      return NextResponse.json({ message: `Epic start date (${epicStart}) cannot be earlier than project start date (${projStart}).` }, { status: 400 });
    }

    const payload = {
      company_id: targetProject.company_id || company.id,
      project_id: projectId,
      name: name.trim(),
      description: description.trim(),
      color: color || "#3b82f6",
      status: ["PLANNING", "IN_PROGRESS", "COMPLETED", "ON_HOLD"].includes(status) ? status : "IN_PROGRESS",
      start_date: start_date || null,
      end_date: end_date || null,
      created_by: employeeProfile?.id || null,
      creator_note: creator_note ? creator_note.trim() : null,
    };

    let { data: newEpic, error: insertErr } = await adminSupabase
      .from("project_epics")
      .insert([payload])
      .select()
      .maybeSingle();

    // Graceful fallback if created_by or creator_note column does not exist yet
    if (insertErr && (insertErr.message?.includes("created_by") || insertErr.message?.includes("creator_note"))) {
      const fallbackPayload = {
        company_id: company.id,
        project_id: projectId,
        name: name.trim(),
        description: creator_note
          ? `${description.trim() ? description.trim() + "\n\n" : ""}Creator Note: ${creator_note.trim()}`
          : description.trim(),
        color: color || "#3b82f6",
        status: ["PLANNING", "IN_PROGRESS", "COMPLETED", "ON_HOLD"].includes(status) ? status : "IN_PROGRESS",
        start_date: start_date || null,
        end_date: end_date || null,
      };

      const fallbackRes = await adminSupabase
        .from("project_epics")
        .insert([fallbackPayload])
        .select()
        .maybeSingle();

      newEpic = fallbackRes.data;
      insertErr = fallbackRes.error;
    }

    if (insertErr) {
      console.error("Insert epic error:", insertErr);
      return NextResponse.json({ message: insertErr.message || "Failed to create epic." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Epic "${newEpic?.name || "Epic"}" created.`,
      epic: {
        ...(newEpic || payload),
        creator: employeeProfile ? {
          id: employeeProfile.id,
          full_name: employeeProfile.full_name,
          email: employeeProfile.email,
          designation: employeeProfile.designation,
          avatar_url: employeeProfile.avatar_url,
        } : null,
        metrics: { totalTasks: 0, completedTasks: 0 },
        progress: 0,
      },
    });
  } catch (err) {
    console.error("POST epic error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[id]/epics
 * Updates epic details or status.
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

    // Verify parent project and permissions
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
      return NextResponse.json({ message: "Access denied. Only the assigned Team Lead, Project Manager, or Admin can update epics." }, { status: 403 });
    }

    const body = await req.json();
    const { epic_id, name, description, color, status, start_date, end_date, creator_note } = body;

    if (!epic_id) {
      return NextResponse.json({ message: "Epic ID is required." }, { status: 400 });
    }

    const projStart = targetProject.start_date ? String(targetProject.start_date).split("T")[0] : null;
    const projEnd = targetProject.end_date ? String(targetProject.end_date).split("T")[0] : null;
    const epicStart = start_date !== undefined ? (start_date ? String(start_date).split("T")[0] : null) : null;
    const epicEnd = end_date !== undefined ? (end_date ? String(end_date).split("T")[0] : null) : null;

    if (epicStart && epicEnd && epicEnd < epicStart) {
      return NextResponse.json({ message: "Epic end date cannot be earlier than epic start date." }, { status: 400 });
    }
    if (projEnd && epicEnd && epicEnd > projEnd) {
      return NextResponse.json({ message: `Epic end date (${epicEnd}) cannot exceed project end date (${projEnd}).` }, { status: 400 });
    }
    if (projStart && epicStart && epicStart < projStart) {
      return NextResponse.json({ message: `Epic start date (${epicStart}) cannot be earlier than project start date (${projStart}).` }, { status: 400 });
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (color !== undefined) updateData.color = color;
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;
    if (status !== undefined) updateData.status = status;
    if (creator_note !== undefined) updateData.creator_note = creator_note ? creator_note.trim() : null;

    let { data: updatedEpic, error: updateErr } = await adminSupabase
      .from("project_epics")
      .update(updateData)
      .eq("id", epic_id)
      .eq("project_id", projectId)
      .eq("company_id", targetProject.company_id)
      .select()
      .maybeSingle();

    if (updateErr && (updateErr.message?.includes("updated_at") || updateErr.code === "42703" || updateErr.message?.includes("creator_note"))) {
      const fallbackData = { ...updateData };
      delete fallbackData.updated_at;
      delete fallbackData.creator_note;
      const retry = await adminSupabase
        .from("project_epics")
        .update(fallbackData)
        .eq("id", epic_id)
        .eq("project_id", projectId)
        .eq("company_id", targetProject.company_id)
        .select()
        .maybeSingle();
      updatedEpic = retry.data;
      updateErr = retry.error;
    }

    if (updateErr || !updatedEpic) {
      console.error("Update epic error:", updateErr);
      return NextResponse.json({ message: updateErr?.message || "Failed to update epic." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Epic updated successfully.",
      epic: updatedEpic,
    });
  } catch (err) {
    console.error("PATCH epic error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]/epics
 * Deletes an epic after safely unlinking tasks.
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
      return NextResponse.json({ message: "Access denied. Only the assigned Team Lead, Project Manager, or Admin can delete epics." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let epicId = searchParams.get("epic_id");
    if (!epicId) {
      try {
        const body = await req.json();
        epicId = body.epic_id;
      } catch {}
    }

    if (!epicId) {
      return NextResponse.json({ message: "Epic ID is required." }, { status: 400 });
    }

    // Unlink any tasks from this epic strictly within company
    await adminSupabase
      .from("project_tasks")
      .update({ epic_id: null })
      .eq("epic_id", epicId)
      .eq("project_id", projectId)
      .eq("company_id", targetProject.company_id);

    const { error: delErr } = await adminSupabase
      .from("project_epics")
      .delete()
      .eq("id", epicId)
      .eq("project_id", projectId)
      .eq("company_id", targetProject.company_id);

    if (delErr) {
      console.error("Delete epic error:", delErr);
      return NextResponse.json({ message: delErr.message || "Failed to delete epic." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Epic deleted successfully.",
    });
  } catch (err) {
    console.error("DELETE epic error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
