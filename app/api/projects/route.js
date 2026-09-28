import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

import { syncSprintLifecycles } from "@/lib/sprintAutoLifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects
 * Lists projects for the authenticated user's company, scoped strictly by role & permission:
 * - Admin: All projects in the company
 * - Manager: Projects created by the manager or in the manager's department
 * - Team Lead: Projects where user is the assigned team_lead_id or squad member
 * - Employee: Strictly scoped to projects where the employee is in team_members or has assigned tasks
 */
export async function GET(req) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    // Auto-sync date-driven sprint lifecycles in background
    try {
      await syncSprintLifecycles(adminSupabase, company.id);
    } catch (sprintSyncErr) {
      console.warn("Auto sprint sync warning in GET /api/projects:", sprintSyncErr?.message);
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isTeamLead = cleanRole.includes("lead");
    const userDept = employeeProfile?.department?.trim();

    // Collect all valid identity tokens for the authenticated user
    const myIdentities = new Set();
    if (employeeProfile?.id) myIdentities.add(employeeProfile.id);
    if (user?.id) myIdentities.add(user.id);
    if (employeeProfile?.auth_user_id) myIdentities.add(employeeProfile.auth_user_id);
    if (employeeProfile?.user_id) myIdentities.add(employeeProfile.user_id);
    const idList = Array.from(myIdentities);

    let query = adminSupabase
      .from("projects")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });

    if (isManager) {
      if (employeeProfile?.id) {
        if (userDept) {
          query = query.or(`created_by.eq.${employeeProfile.id},department.ilike."${userDept.replace(/"/g, '""')}"`);
        } else {
          query = query.eq("created_by", employeeProfile.id);
        }
      } else if (userDept) {
        query = query.ilike("department", userDept);
      }
    } else if (isTeamLead) {
      // STRICT SCOPING: Team Lead sees projects where they are assigned as lead or creator
      if (employeeProfile?.id) {
        query = query.or(`team_lead_id.eq.${employeeProfile.id},created_by.eq.${employeeProfile.id}`);
      } else {
        return NextResponse.json({
          success: true,
          projects: [],
          count: 0,
        });
      }
    } else if (isOwnerOrAdmin) {
      // Admins see all company projects
    } else {
      // REGULAR EMPLOYEES: Strictly authorized project membership only
      // 1. Projects with assigned/planned tasks for this employee
      // 2. Projects where the employee is in team_members
      let myTaskProjectIds = [];
      if (idList.length > 0) {
        const [assignedTasksRes, plannedTasksRes] = await Promise.all([
          adminSupabase
            .from("project_tasks")
            .select("project_id")
            .eq("company_id", company.id)
            .in("assigned_to", idList),
          adminSupabase
            .from("project_tasks")
            .select("project_id")
            .eq("company_id", company.id)
            .in("planned_assignee_id", idList),
        ]);

        myTaskProjectIds = Array.from(
          new Set([
            ...(assignedTasksRes.data || []).map((t) => t.project_id),
            ...(plannedTasksRes.data || []).map((t) => t.project_id),
          ].filter(Boolean))
        );
      }

      // Fetch projects to filter by squad membership & tasks
      const { data: rawProjects, error: fetchErr } = await query;
      if (fetchErr) {
        if (
          fetchErr.code === "42P01" ||
          fetchErr.code === "PGRST205" ||
          fetchErr.code === "PGRST204" ||
          fetchErr.message?.includes("schema cache") ||
          fetchErr.message?.includes("Could not find the table")
        ) {
          return NextResponse.json({
            success: true,
            projects: [],
            tableNotReady: true,
          });
        }
        console.error("Fetch projects error:", fetchErr);
        return NextResponse.json({ message: "Failed to load projects." }, { status: 500 });
      }

      const taskProjIdSet = new Set(myTaskProjectIds);
      const authorizedProjects = (rawProjects || []).filter((p) => {
        if (taskProjIdSet.has(p.id)) return true;
        if (p.created_by && myIdentities.has(p.created_by)) return true;
        if (p.team_lead_id && myIdentities.has(p.team_lead_id)) return true;
        if (Array.isArray(p.team_members)) {
          return p.team_members.some((mId) => myIdentities.has(mId));
        }
        return false;
      });

      // Enrich authorized projects
      const empIds = new Set();
      authorizedProjects.forEach((p) => {
        if (p.created_by) empIds.add(p.created_by);
        if (p.team_lead_id) empIds.add(p.team_lead_id);
        if (Array.isArray(p.team_members)) {
          p.team_members.forEach((mId) => {
            if (mId) empIds.add(mId);
          });
        }
      });

      const empMap = {};
      if (empIds.size > 0) {
        const { data: emps } = await adminSupabase
          .from("employees")
          .select("id, full_name, email, role, department, designation, username, avatar_url")
          .in("id", Array.from(empIds));

        if (emps) {
          emps.forEach((e) => {
            empMap[e.id] = e;
          });
        }
      }

      const enrichedProjects = authorizedProjects.map((p) => ({
        ...p,
        project_type: p.project_type || "Scrum",
        project_group: p.project_group || null,
        creator: empMap[p.created_by] || null,
        teamLead: empMap[p.team_lead_id] || null,
        teamMembers: Array.isArray(p.team_members)
          ? p.team_members.map((mId) => empMap[mId]).filter(Boolean)
          : [],
      }));

      return NextResponse.json({
        success: true,
        projects: enrichedProjects,
        count: enrichedProjects.length,
      });
    }

    const { data: projects, error: fetchErr } = await query;

    if (fetchErr) {
      // If table does not exist yet in Supabase schema cache
      if (
        fetchErr.code === "42P01" ||
        fetchErr.code === "PGRST205" ||
        fetchErr.code === "PGRST204" ||
        fetchErr.message?.includes("schema cache") ||
        fetchErr.message?.includes("Could not find the table")
      ) {
        return NextResponse.json({
          success: true,
          projects: [],
          tableNotReady: true,
          message: "Projects table not yet initialized in Supabase. Please run the SQL migration script in Supabase SQL Editor.",
        });
      }
      console.error("Fetch projects error:", fetchErr);
      return NextResponse.json({ message: "Failed to load projects." }, { status: 500 });
    }

    // Collect distinct employee IDs for enrichment
    const empIds = new Set();
    (projects || []).forEach((p) => {
      if (p.created_by) empIds.add(p.created_by);
      if (p.team_lead_id) empIds.add(p.team_lead_id);
      if (Array.isArray(p.team_members)) {
        p.team_members.forEach((mId) => {
          if (mId) empIds.add(mId);
        });
      }
    });

    const empMap = {};
    if (empIds.size > 0) {
      const { data: emps } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, username, avatar_url")
        .in("id", Array.from(empIds));

      if (emps) {
        emps.forEach((e) => {
          empMap[e.id] = e;
        });
      }
    }

    const enrichedProjects = (projects || []).map((p) => ({
      ...p,
      project_type: p.project_type || "Scrum",
      project_group: p.project_group || null,
      creator: empMap[p.created_by] || null,
      teamLead: empMap[p.team_lead_id] || null,
      teamMembers: Array.isArray(p.team_members)
        ? p.team_members.map((mId) => empMap[mId]).filter(Boolean)
        : [],
    }));

    return NextResponse.json({
      success: true,
      projects: enrichedProjects,
      count: enrichedProjects.length,
    });
  } catch (err) {
    console.error("GET /api/projects error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

/**
 * POST /api/projects
 * Creates a new project with Zoho Sprints attributes:
 * - project name
 * - project type (Scrum, Kanban, Custom Agile)
 * - project description
 * - Assign owner (denotes who creates the project)
 * - project group (optional)
 * - team members (optional list of employee IDs)
 * - project start date and end date
 * - current project status
 * - priority
 */
export async function POST(req) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    // Role check: Only Manager or ADMIN can create projects
    const cleanRole = (role || "").toLowerCase().replace(/\s+/g, "_");
    if (cleanRole !== "manager" && cleanRole !== "admin") {
      return NextResponse.json(
        { message: "Access denied. Only Department Managers and Admins can create projects." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name,
      project_type = "Scrum",
      description = "",
      department: reqDept,
      start_date,
      end_date,
      priority = "MEDIUM",
      status = "PLANNING",
      team_lead_id,
      owner_id,
      project_group = "",
      team_members = [],
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { message: "Project name is required." },
        { status: 400 }
      );
    }

    // Date sanity check
    if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
      return NextResponse.json(
        { message: "Target completion date cannot be earlier than start date." },
        { status: 400 }
      );
    }

    const resolvedDept = reqDept?.trim() || employeeProfile?.department?.trim() || "Engineering";

    // Determine Owner (Creator): Defaults to current employee, or specified owner
    let resolvedOwnerId = employeeProfile?.id || null;
    let ownerRecord = employeeProfile;
    if (owner_id && owner_id !== employeeProfile?.id) {
      const { data: specifiedOwner } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url")
        .eq("id", owner_id)
        .eq("company_id", company.id)
        .maybeSingle();

      if (specifiedOwner) {
        resolvedOwnerId = specifiedOwner.id;
        ownerRecord = specifiedOwner;
      }
    }

    // Validate Team Lead if provided
    let leadRecord = null;
    if (team_lead_id) {
      const { data: leadFound, error: leadErr } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url")
        .eq("id", team_lead_id)
        .eq("company_id", company.id)
        .maybeSingle();

      if (leadErr || !leadFound) {
        return NextResponse.json(
          { message: "Selected Team Lead does not exist in this company." },
          { status: 400 }
        );
      }
      leadRecord = leadFound;
    } else {
      // If team lead not explicitly set, we can assign the owner as lead or fallback to first lead in dept
      const { data: fallbackLead } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url")
        .eq("company_id", company.id)
        .ilike("role", "team_lead")
        .maybeSingle();

      leadRecord = fallbackLead || ownerRecord;
    }

    // Validate optional team members belong to company
    let validTeamMemberIds = [];
    if (Array.isArray(team_members) && team_members.length > 0) {
      const cleanIds = team_members.filter((id) => typeof id === "string" && id.trim());
      if (cleanIds.length > 0) {
        const { data: memberRecords } = await adminSupabase
          .from("employees")
          .select("id")
          .eq("company_id", company.id)
          .in("id", cleanIds);

        if (memberRecords) {
          validTeamMemberIds = memberRecords.map((m) => m.id);
        }
      }
    }

    const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    const validStatuses = ["PLANNING", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "CANCELLED"];
    const validTypes = ["Scrum", "Kanban", "Custom Agile"];

    const cleanPriority = validPriorities.includes(priority?.toUpperCase()) ? priority.toUpperCase() : "MEDIUM";
    const cleanStatus = validStatuses.includes(status?.toUpperCase()) ? status.toUpperCase() : "PLANNING";
    const cleanType = validTypes.includes(project_type) ? project_type : "Scrum";

    const insertPayload = {
      company_id: company.id,
      name: name.trim(),
      project_type: cleanType,
      project_group: project_group?.trim() || null,
      team_members: validTeamMemberIds,
      description: description.trim(),
      department: resolvedDept,
      start_date: start_date || null,
      end_date: end_date || null,
      priority: cleanPriority,
      status: cleanStatus,
      created_by: resolvedOwnerId,
      team_lead_id: leadRecord?.id || null,
    };

    let newProject = null;
    let insertErr = null;

    // Attempt insert with all Zoho Sprints fields
    const res = await adminSupabase
      .from("projects")
      .insert([insertPayload])
      .select()
      .single();

    newProject = res.data;
    insertErr = res.error;

    // If error was due to missing columns (project_type, project_group, team_members not yet migrated in Supabase)
    if (insertErr && (insertErr.message?.includes("project_type") || insertErr.message?.includes("project_group") || insertErr.message?.includes("team_members"))) {
      console.warn("Zoho Sprint columns not present yet. Falling back to standard schema fields...");
      const fallbackPayload = {
        company_id: company.id,
        name: name.trim(),
        description: description.trim(),
        department: resolvedDept,
        start_date: start_date || null,
        end_date: end_date || null,
        priority: cleanPriority,
        status: cleanStatus,
        created_by: resolvedOwnerId,
        team_lead_id: leadRecord?.id || null,
      };

      const fallbackRes = await adminSupabase
        .from("projects")
        .insert([fallbackPayload])
        .select()
        .single();

      newProject = fallbackRes.data;
      insertErr = fallbackRes.error;
    }

    if (insertErr) {
      console.error("Insert project error:", insertErr);
      if (
        insertErr.code === "42P01" ||
        insertErr.code === "PGRST205" ||
        insertErr.code === "PGRST204" ||
        insertErr.message?.includes("schema cache") ||
        insertErr.message?.includes("Could not find the table")
      ) {
        return NextResponse.json(
          { message: "Projects table not found in Supabase. Please run the SQL migration in Supabase SQL Editor." },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { message: insertErr.message || "Failed to create project." },
        { status: 500 }
      );
    }

    // Dispatch notification to assigned Team Lead if not the creator
    if (leadRecord?.id && leadRecord.id !== resolvedOwnerId) {
      try {
        const creatorName = ownerRecord?.full_name || employeeProfile?.full_name || "Department Manager";
        await adminSupabase.from("notifications").insert([
          {
            company_id: company.id,
            employee_id: leadRecord.id,
            title: `👑 Project Leadership: Appointed as Team Lead`,
            message: `You have been appointed by ${creatorName} as the Team Lead for project "${newProject.name}". You now have privileges to manage sprints, backlog items, and review task deliverables.`,
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (notifErr) {
        console.warn("Project lead notification warning:", notifErr?.message);
      }
    }

    // Fetch team members details for enriched response
    let enrichedMembers = [];
    if (validTeamMemberIds.length > 0) {
      const { data: memberDetails } = await adminSupabase
        .from("employees")
        .select("id, full_name, email, role, department, designation, avatar_url")
        .in("id", validTeamMemberIds);
      enrichedMembers = memberDetails || [];
    }

    return NextResponse.json({
      success: true,
      message: `Project "${newProject.name}" created successfully.`,
      project: {
        ...newProject,
        project_type: cleanType,
        project_group: project_group?.trim() || null,
        creator: ownerRecord ? {
          id: ownerRecord.id,
          full_name: ownerRecord.full_name,
          email: ownerRecord.email,
          designation: ownerRecord.designation,
          role: ownerRecord.role,
          avatar_url: ownerRecord.avatar_url,
        } : null,
        teamLead: leadRecord ? {
          id: leadRecord.id,
          full_name: leadRecord.full_name,
          email: leadRecord.email,
          designation: leadRecord.designation,
          avatar_url: leadRecord.avatar_url,
        } : null,
        teamMembers: enrichedMembers,
      },
    });
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
