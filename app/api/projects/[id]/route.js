import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects/[id]
 * Fetches a single project by ID with enriched creator, team lead, and team members.
 */
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ message: "Project ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "No company workspace found." }, { status: 404 });
    }

    const { data: project, error: fetchErr } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("company_id", company.id)
      .maybeSingle();

    if (fetchErr || !project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    // Collect all employee IDs for enrichment
    const empIds = new Set();
    if (project.created_by) empIds.add(project.created_by);
    if (project.owner_id) empIds.add(project.owner_id);
    if (project.team_lead_id) empIds.add(project.team_lead_id);
    if (Array.isArray(project.team_members)) {
      project.team_members.forEach((mId) => {
        if (mId) empIds.add(mId);
      });
    }

    let empMap = {};
    if (empIds.size > 0) {
      const { data: emps } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url, auth_user_id, username")
        .in("id", Array.from(empIds));

      if (emps) {
        emps.forEach((e) => {
          empMap[e.id] = e;
        });
      }
    }

    const enrichedProject = {
      ...project,
      project_type: project.project_type || "Scrum",
      project_group: project.project_group || null,
      creator: empMap[project.created_by] || empMap[project.owner_id] || null,
      teamLead: empMap[project.team_lead_id] || null,
      teamMembers: Array.isArray(project.team_members)
        ? project.team_members.map((mId) => empMap[mId]).filter(Boolean)
        : [],
    };

    return NextResponse.json({
      success: true,
      project: enrichedProject,
    });
  } catch (err) {
    console.error("GET /api/projects/[id] error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[id]
 * Updates project status, priority, dates, or details.
 * - Team Lead: Can update status (e.g. PLANNING -> IN_PROGRESS -> COMPLETED)
 * - Manager / Admin: Can update all fields including reassignment
 */
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ message: "Project ID is required." }, { status: 400 });
    }

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

    // Fetch existing project
    const { data: project, error: fetchErr } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("company_id", company.id)
      .maybeSingle();

    if (fetchErr || !project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isProjectOwnerOrCreator = project.owner_id === employeeProfile?.id || project.created_by === employeeProfile?.id;
    const isAssignedLead = project.team_lead_id === employeeProfile?.id;
    const isManager = cleanRole.includes("manager") || cleanRole.includes("lead") || cleanRole.includes("supervisor");
    const canManageProject = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManager;

    if (!canManageProject) {
      return NextResponse.json(
        { message: "Access denied. Only the assigned Team Lead, Project Manager, or Admin can update this project." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updateData = {};

    // Status update
    if (body.status !== undefined) {
      const validStatuses = ["PLANNING", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "CANCELLED"];
      const cleanStatus = String(body.status).toUpperCase();
      if (validStatuses.includes(cleanStatus)) {
        updateData.status = cleanStatus;
      }
    }

    // Squad and Team Members can be managed by Team Lead, Manager, Creator, or Admin
    if (body.project_group !== undefined) {
      updateData.project_group = body.project_group?.trim() || null;
    }
    if (body.team_members !== undefined && Array.isArray(body.team_members)) {
      const cleanMemberIds = Array.from(
        new Set(
          body.team_members
            .map((m) => (typeof m === "object" ? m?.id : m))
            .filter((id) => id && typeof id === "string" && id.trim())
            .map((id) => id.trim())
        )
      );
      updateData.team_members = cleanMemberIds;
    }

    // General project fields
    if (body.name !== undefined && body.name.trim()) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description.trim();
    if (body.department !== undefined && body.department.trim()) updateData.department = body.department.trim();
    if (body.start_date !== undefined) updateData.start_date = body.start_date || null;
    if (body.end_date !== undefined) updateData.end_date = body.end_date || null;

    if (body.priority !== undefined) {
      const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
      const cleanPriority = String(body.priority).toUpperCase();
      if (validPriorities.includes(cleanPriority)) {
        updateData.priority = cleanPriority;
      }
    }

    if (body.project_type !== undefined) {
      updateData.project_type = body.project_type;
    }

    // Reassign Team Lead (Admin / Manager only)
    if (body.team_lead_id !== undefined && body.team_lead_id !== project.team_lead_id && (isOwnerOrAdmin || isManager || isProjectOwnerOrCreator)) {
      if (!body.team_lead_id) {
        updateData.team_lead_id = null;
      } else {
        const { data: newLead } = await adminSupabase
          .from("employees")
          .select("id, full_name, role")
          .eq("id", body.team_lead_id)
          .eq("company_id", company.id)
          .maybeSingle();

        if (newLead) {
          updateData.team_lead_id = newLead.id;
        }
      }
    }

    updateData.updated_at = new Date().toISOString();

    let { data: updatedProject, error: updateErr } = await adminSupabase
      .from("projects")
      .update(updateData)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (updateErr) {
      // Fallback if missing schema columns
      if (
        updateErr.message?.includes("project_group") ||
        updateErr.message?.includes("team_members") ||
        updateErr.message?.includes("project_type")
      ) {
        const fallbackData = { ...updateData };
        delete fallbackData.project_group;
        delete fallbackData.team_members;
        delete fallbackData.project_type;
        const retryRes = await adminSupabase
          .from("projects")
          .update(fallbackData)
          .eq("id", id)
          .select()
          .maybeSingle();
        updatedProject = retryRes.data;
        updateErr = retryRes.error;
      }
    }

    if (updateErr || !updatedProject) {
      console.error("Update project error:", updateErr);
      return NextResponse.json({ message: updateErr?.message || "Failed to update project." }, { status: 500 });
    }

    // Dispatch notification if team lead was reassigned
    if (updateData.team_lead_id && updateData.team_lead_id !== project.team_lead_id) {
      try {
        const updaterName = employeeProfile?.full_name || "Management";
        await adminSupabase.from("notifications").insert([
          {
            company_id: company.id,
            employee_id: updateData.team_lead_id,
            title: `👑 Project Leadership: Appointed as Team Lead`,
            message: `You have been appointed by ${updaterName} as the Team Lead for project "${updatedProject.name}". You now have privileges to manage sprints, backlog items, and review task deliverables.`,
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (notifErr) {
        console.warn("Team lead reassignment notification warning:", notifErr?.message);
      }
    }

    // Enrich team members, team lead, and creator
    const memberIds = Array.isArray(updatedProject.team_members) && updatedProject.team_members.length > 0
      ? updatedProject.team_members
      : Array.isArray(updateData.team_members)
      ? updateData.team_members
      : [];

    let enrichedMembers = [];
    if (memberIds.length > 0) {
      const { data: memberDetails } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url, auth_user_id")
        .in("id", memberIds);
      enrichedMembers = memberDetails || [];
    }

    let leadDetail = null;
    if (updatedProject.team_lead_id) {
      const { data: leadFound } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url, auth_user_id")
        .eq("id", updatedProject.team_lead_id)
        .maybeSingle();
      leadDetail = leadFound || null;
    }

    let creatorDetail = null;
    if (updatedProject.created_by) {
      const { data: creatorFound } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url, auth_user_id")
        .eq("id", updatedProject.created_by)
        .maybeSingle();
      creatorDetail = creatorFound || null;
    }

    return NextResponse.json({
      success: true,
      message: "Project updated successfully.",
      project: {
        ...updatedProject,
        project_type: updatedProject.project_type || "Scrum",
        project_group: updatedProject.project_group !== undefined ? updatedProject.project_group : (updateData.project_group || null),
        team_members: memberIds,
        creator: creatorDetail,
        teamLead: leadDetail,
        teamMembers: enrichedMembers,
      },
    });
  } catch (err) {
    console.error("PATCH /api/projects/[id] error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]
 * Removes a project (Creator Manager or Admin only).
 */
export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "No company found." }, { status: 404 });
    }

    const { data: project } = await adminSupabase
      .from("projects")
      .select("id, created_by, company_id")
      .eq("id", id)
      .eq("company_id", company.id)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const canDelete = role === "ADMIN" || (role === "manager" && project.created_by === employeeProfile?.id);
    if (!canDelete) {
      return NextResponse.json({ message: "Access denied." }, { status: 403 });
    }

    const { error: delErr } = await adminSupabase
      .from("projects")
      .delete()
      .eq("id", id);

    if (delErr) {
      return NextResponse.json({ message: "Failed to delete project." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Project deleted." });
  } catch (err) {
    console.error("DELETE /api/projects/[id] error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
