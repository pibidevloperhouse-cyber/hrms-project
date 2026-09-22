import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { calculateSprintTaskMetrics, calculateFinalPerformanceScore } from "@/lib/performanceUtils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects/performance
 * Returns factual sprint task metrics, existing finalized evaluation snapshot, and member performance summary.
 * Query Params: sprint_id, employee_id, project_id
 */
export async function GET(req) {
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

    const { searchParams } = new URL(req.url);
    const sprintId = searchParams.get("sprint_id");
    const employeeId = searchParams.get("employee_id");
    const projectId = searchParams.get("project_id");

    if (!sprintId && !employeeId && !projectId) {
      return NextResponse.json({ message: "Either sprint_id, employee_id, or project_id is required." }, { status: 400 });
    }

    // 1. Fetch Sprint details if valid sprintId provided
    let sprint = null;
    if (sprintId && sprintId !== "current-sprint") {
      try {
        const { data: sData } = await adminSupabase
          .from("project_sprints")
          .select("id, name, goal, status, start_date, end_date, project_id")
          .eq("id", sprintId)
          .eq("company_id", company.id)
          .maybeSingle();
        sprint = sData;
      } catch (sErr) {
        console.warn("Fetch sprint details warning:", sErr?.message);
      }
    }

    // 2. Query project_tasks resiliently using select("*")
    let tasks = [];
    try {
      let tasksQuery = adminSupabase
        .from("project_tasks")
        .select("*")
        .eq("company_id", company.id);

      if (sprintId && sprintId !== "current-sprint") {
        tasksQuery = tasksQuery.eq("sprint_id", sprintId);
      }
      if (employeeId) {
        tasksQuery = tasksQuery.eq("assigned_to", employeeId);
      }
      if (projectId) {
        tasksQuery = tasksQuery.eq("project_id", projectId);
      }

      const { data: tData, error: tasksErr } = await tasksQuery;
      if (tasksErr) {
        console.warn("Tasks query warning, trying fallback:", tasksErr?.message);
        // Fallback: fetch tasks without sprint filter if sprint_id failed
        let fallbackQuery = adminSupabase
          .from("project_tasks")
          .select("*")
          .eq("company_id", company.id);
        if (employeeId) fallbackQuery = fallbackQuery.eq("assigned_to", employeeId);
        if (projectId) fallbackQuery = fallbackQuery.eq("project_id", projectId);
        const { data: fallbackData } = await fallbackQuery;
        tasks = fallbackData || [];
      } else {
        tasks = tData || [];
      }
    } catch (err) {
      console.error("Fetch tasks error:", err);
      tasks = [];
    }

    // 3. Safe query for finalized evaluation snapshot
    let evaluation = null;
    if (sprintId && employeeId && sprintId !== "current-sprint") {
      try {
        const { data: evalData } = await adminSupabase
          .from("performance_evaluations")
          .select(`
            *,
            team_lead:employees!performance_evaluations_team_lead_id_fkey(id, full_name, designation, avatar_url)
          `)
          .eq("sprint_id", sprintId)
          .eq("employee_id", employeeId)
          .maybeSingle();
        evaluation = evalData;
      } catch (evalErr) {
        console.warn("Fetch evaluation snapshot warning (table may not exist yet):", evalErr?.message);
      }
    }

    // 4. Calculate factual sprint metrics & execution evidence
    const factualMetrics = calculateSprintTaskMetrics(tasks);

    // 5. Final score is only calculated if an existing finalized evaluation exists
    const evaluationScore = evaluation?.execution_score !== undefined && evaluation?.execution_score !== null
      ? calculateFinalPerformanceScore(
          Number(evaluation.execution_score),
          evaluation.punctuality_score ?? factualMetrics.punctualityScore,
          evaluation.progress_percentage ?? factualMetrics.progressPercentage
        )
      : null;

    return NextResponse.json({
      success: true,
      sprint,
      tasks,
      factualMetrics,
      evaluation,
      evaluationScore,
    });
  } catch (err) {
    console.error("GET /api/projects/performance error:", err);
    return NextResponse.json({ message: "Internal server error: " + err.message }, { status: 500 });
  }
}
