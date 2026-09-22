import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { calculateMonthlyRollup } from "@/lib/performanceUtils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects/performance/monthly
 * Returns the month-end performance rollup summarizing finalized sprint evaluations for a month.
 * Query Params: month (e.g. "2026-09"), employee_id (optional), department (optional)
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
    const monthParam = searchParams.get("month") || new Date().toISOString().slice(0, 7); // e.g. "2026-09"
    const targetEmployeeId = searchParams.get("employee_id");
    const targetDepartment = searchParams.get("department");

    // Compute start and end of target month
    const [yearStr, monthStr] = monthParam.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    // 1. Fetch finalized sprint performance evaluations in this month
    let query = adminSupabase
      .from("performance_evaluations")
      .select(`
        *,
        employee:employees!performance_evaluations_employee_id_fkey(id, full_name, designation, department, avatar_url),
        team_lead:employees!performance_evaluations_team_lead_id_fkey(id, full_name, designation),
        sprint:project_sprints!performance_evaluations_sprint_id_fkey(id, name, status, start_date, end_date),
        project:projects!performance_evaluations_project_id_fkey(id, name, department)
      `)
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (targetEmployeeId) {
      query = query.eq("employee_id", targetEmployeeId);
    }

    const { data: evaluations, error: evalErr } = await query;
    if (evalErr) {
      console.error("Fetch monthly performance evaluations error:", evalErr);
      return NextResponse.json({ message: "Failed to fetch monthly evaluations." }, { status: 500 });
    }

    // 2. Group evaluations by employee
    const employeeEvalMap = new Map();
    (evaluations || []).forEach((ev) => {
      const empId = ev.employee_id;
      if (!employeeEvalMap.has(empId)) {
        employeeEvalMap.set(empId, {
          employee: ev.employee,
          evaluations: [],
        });
      }
      employeeEvalMap.get(empId).evaluations.push(ev);
    });

    const employeeRollups = Array.from(employeeEvalMap.entries()).map(([empId, item]) => {
      const summary = calculateMonthlyRollup(item.evaluations);
      return {
        employeeId: empId,
        employee: item.employee,
        ...summary,
      };
    });

    employeeRollups.sort((a, b) => b.avgFinalScore - a.avgFinalScore);

    // 3. Single employee summary (if requested)
    const singleEmployeeSummary = targetEmployeeId
      ? calculateMonthlyRollup(evaluations || [])
      : null;

    return NextResponse.json({
      success: true,
      month: monthParam,
      totalEvaluations: (evaluations || []).length,
      employeeRollups,
      singleEmployeeSummary,
    });
  } catch (err) {
    console.error("GET /api/projects/performance/monthly error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
