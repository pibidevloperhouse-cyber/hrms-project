import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

/**
 * GET /api/projects/tasks/[taskId]/history
 * Returns the status transition and audit history for a task.
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
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "No company workspace found." }, { status: 404 });
    }

    // Verify task exists in this company
    const { data: task, error: taskErr } = await adminSupabase
      .from("project_tasks")
      .select("id, company_id, assigned_to, project_id")
      .eq("id", taskId)
      .maybeSingle();

    if (taskErr || !task) {
      return NextResponse.json({ message: "Task not found." }, { status: 404 });
    }

    let project = null;
    if (task.project_id) {
      const { data: projData } = await adminSupabase
        .from("projects")
        .select("id, created_by, team_lead_id, department, company_id")
        .eq("id", task.project_id)
        .maybeSingle();
      project = projData;
    }

    const taskCompanyId = task.company_id || project?.company_id;
    if (taskCompanyId && taskCompanyId !== company.id) {
      return NextResponse.json({ message: "Task not found." }, { status: 404 });
    }

    const cleanRole = (role || "").toLowerCase();
    const isOwnerOrAdmin = cleanRole === "admin";
    const isCreatorManager = cleanRole === "manager" && (project?.created_by === employeeProfile?.id || project?.department?.toLowerCase() === employeeProfile?.department?.toLowerCase());
    const isAssignedLead = cleanRole === "team_lead" && project?.team_lead_id === employeeProfile?.id;
    const isAssignedEmployee = task.assigned_to === employeeProfile?.id;

    if (!isOwnerOrAdmin && !isCreatorManager && !isAssignedLead && !isAssignedEmployee) {
      return NextResponse.json({ message: "Access denied." }, { status: 403 });
    }

    // Query status history
    const { data: history, error: histErr } = await adminSupabase
      .from("task_status_history")
      .select(`
        id,
        task_id,
        old_status,
        new_status,
        comments,
        created_at,
        changed_by_employee:employees!task_status_history_changed_by_fkey (
          id,
          full_name,
          role,
          designation,
          avatar_url
        )
      `)
      .eq("task_id", taskId)
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });

    if (histErr) {
      // If table doesn't exist yet, return empty history gracefully
      if (
        histErr.code === "42P01" ||
        histErr.code === "PGRST205" ||
        histErr.message?.includes("Could not find the table")
      ) {
        return NextResponse.json({ success: true, history: [] });
      }
      console.error("Fetch task history error:", histErr);
      return NextResponse.json({ message: "Failed to load history." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      history: history || [],
    });
  } catch (err) {
    console.error("GET /api/projects/tasks/[taskId]/history error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
