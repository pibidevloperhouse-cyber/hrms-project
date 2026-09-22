import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { calculateSprintTaskMetrics, calculateFinalPerformanceScore } from "@/lib/performanceUtils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/projects/performance/evaluate
 * Team Lead endpoint to evaluate an employee for a sprint and save an immutable performance snapshot.
 */
export async function POST(req) {
  try {
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

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isTeamLead = cleanRole.includes("lead");

    if (!isOwnerOrAdmin && !isManager && !isTeamLead) {
      return NextResponse.json({ message: "Access denied. Only Team Leads and Managers can finalize evaluations." }, { status: 403 });
    }

    const body = await req.json();
    const {
      employee_id,
      sprint_id,
      project_id,
      execution_score,
      comment,
    } = body;

    if (!employee_id || !sprint_id) {
      return NextResponse.json({ message: "employee_id and sprint_id are required." }, { status: 400 });
    }

    // 1. Fetch Sprint details if valid
    let sprintName = "Sprint";
    let effectiveProjectId = project_id;
    if (sprint_id && sprint_id !== "current-sprint") {
      const { data: sprint } = await adminSupabase
        .from("project_sprints")
        .select("id, name, project_id, status")
        .eq("id", sprint_id)
        .eq("company_id", company.id)
        .maybeSingle();

      if (sprint) {
        sprintName = sprint.name || sprintName;
        effectiveProjectId = effectiveProjectId || sprint.project_id;
      }
    }

    // 2. Load all tasks for this employee in this sprint/project to calculate factual metrics server-side
    let tasksQuery = adminSupabase
      .from("project_tasks")
      .select("*")
      .eq("company_id", company.id)
      .eq("assigned_to", employee_id);

    if (sprint_id && sprint_id !== "current-sprint") {
      tasksQuery = tasksQuery.eq("sprint_id", sprint_id);
    } else if (effectiveProjectId) {
      tasksQuery = tasksQuery.eq("project_id", effectiveProjectId);
    }

    const { data: tasks, error: tasksErr } = await tasksQuery;
    if (tasksErr) {
      console.warn("Fetch sprint tasks warning:", tasksErr?.message);
    }

    // 3. Compute factual metrics server-side
    const factualMetrics = calculateSprintTaskMetrics(tasks || []);

    // 4. Validate manual Execution Quality Score (1.0 - 10.0) entered by Team Lead
    if (execution_score === undefined || execution_score === null || isNaN(Number(execution_score))) {
      return NextResponse.json(
        { message: "Execution Score is required. The Team Lead must enter an Execution Score (1.0 - 10.0) based on factual evidence." },
        { status: 400 }
      );
    }

    const cleanExec = Math.max(1, Math.min(10, Number(execution_score)));

    // 5. System calculates final score: Execution 40% + Punctuality 35% + Progress 25%
    const { finalScore, performanceBadge } = calculateFinalPerformanceScore(
      cleanExec,
      factualMetrics.punctualityScore,
      factualMetrics.progressPercentage
    );

    // 6. Insert / Upsert the sprint performance snapshot
    const payload = {
      employee_id,
      team_lead_id: employeeProfile?.id || null,
      sprint_id: sprint_id !== "current-sprint" ? sprint_id : null,
      project_id: effectiveProjectId || null,
      assigned_points: factualMetrics.assignedPoints,
      completed_points: factualMetrics.completedPoints,
      progress_percentage: factualMetrics.progressPercentage,
      total_tasks: factualMetrics.totalTasks,
      completed_tasks: factualMetrics.completedTasks,
      incomplete_tasks: factualMetrics.incompleteTasks,
      rework_requests_count: factualMetrics.reworkRequestsCount,
      on_time_tasks: factualMetrics.onTimeTasks,
      delayed_tasks: factualMetrics.delayedTasks,
      total_delay_days: factualMetrics.totalDelayDays,
      punctuality_score: factualMetrics.punctualityScore,
      execution_score: cleanExec,
      final_score: finalScore,
      performance_badge: performanceBadge,
      comment: comment ? String(comment).trim() : null,
      evaluation_period: `Sprint: ${sprintName}`,
      updated_at: new Date().toISOString(),
    };

    const { data: savedEvaluation, error: saveErr } = await adminSupabase
      .from("performance_evaluations")
      .upsert(payload, { onConflict: "employee_id, sprint_id" })
      .select(`
        *,
        team_lead:employees!performance_evaluations_team_lead_id_fkey(id, full_name, designation, avatar_url)
      `)
      .single();

    if (saveErr) {
      console.error("Save performance_evaluation error:", saveErr);
      return NextResponse.json({ message: "Failed to save performance snapshot: " + saveErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      evaluation: savedEvaluation,
      message: "Sprint performance evaluation snapshot saved successfully.",
    });
  } catch (err) {
    console.error("POST /api/projects/performance/evaluate error:", err);
    return NextResponse.json({ message: "Internal server error: " + err.message }, { status: 500 });
  }
}
