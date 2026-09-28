import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { calculateTaskDeadlineScores, computeFinalTLEvaluation } from "@/lib/teamLeadEvaluationUtils";

/**
 * GET /api/performance/monthly-tl/summary?month=YYYY-MM
 * Aggregates monthly factual task execution metrics (completed on-time, delays, rework)
 * and existing Team Lead monthly evaluations for all employees in the company.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, role, isOwner, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "Company workspace not found." }, { status: 404 });
    }

    const userRoleStr = String(role || employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const userDesignation = String(employeeProfile?.designation || "").toLowerCase();
    const isOwnerOrAdmin =
      userRoleStr.includes("admin") ||
      userRoleStr.includes("owner") ||
      userRoleStr.includes("hr") ||
      Boolean(isOwner || employeeProfile?.is_owner);
    const isLeadOrAdmin =
      isOwnerOrAdmin ||
      userRoleStr.includes("manager") ||
      userRoleStr.includes("lead") ||
      userRoleStr.includes("supervisor") ||
      userDesignation.includes("manager") ||
      userDesignation.includes("lead") ||
      userDesignation.includes("head");

    if (!isLeadOrAdmin) {
      return NextResponse.json({ message: "Access denied. Team Lead / Manager role required." }, { status: 403 });
    }

    const userDepartment = (employeeProfile?.department || "").trim();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const targetMonth = searchParams.get("month") || defaultMonth; // "YYYY-MM"

    // Parse Month Boundaries
    const [yearStr, monthStr] = targetMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const startMonthIso = startOfMonth.toISOString();
    const endMonthIso = endOfMonth.toISOString();
    const startMonthDateStr = `${targetMonth}-01`;
    const endMonthDateStr = new Date(year, month, 0).toISOString().split("T")[0];

    const targetEmpId = searchParams.get("employee_id");

    // 1. Fetch company employees
    let empQuery = adminSupabase
      .from("employees")
      .select("id, full_name, email, department, designation, role, status")
      .eq("company_id", company.id)
      .eq("status", "active");

    const { data: employeesData, error: empErr } = await empQuery.order("full_name", { ascending: true });

    if (empErr) {
      console.error("Fetch employees error:", empErr);
      return NextResponse.json({ message: "Failed to fetch employees." }, { status: 500 });
    }

    // Strictly filter: ONLY users with the role 'employee' can be evaluated (no Team Leads, Managers, HR, or Admins)
    let employeesList = (employeesData || []).filter((emp) => {
      // Cannot evaluate themselves
      if (employeeProfile?.id && emp.id === employeeProfile.id) {
        return false;
      }
      const r = (emp.role || "employee").toLowerCase().trim();
      return r === "employee";
    });

    // If targetEmpId was requested specifically, ensure it is only included if its role is strictly 'employee'
    if (targetEmpId && !employeesList.some((e) => e.id === targetEmpId)) {
      const specificEmp = (employeesData || []).find((e) => e.id === targetEmpId);
      if (specificEmp && specificEmp.id !== employeeProfile?.id && (specificEmp.role || "employee").toLowerCase().trim() === "employee") {
        employeesList.unshift(specificEmp);
      }
    }

    // 2. Fetch all project tasks for this company falling into this month
    const { data: tasksData, error: tasksErr } = await adminSupabase
      .from("project_tasks")
      .select("id, title, assigned_to, status, due_date, effective_due_date, original_due_date, created_at, updated_at, completed_at")
      .eq("company_id", company.id);

    if (tasksErr && !tasksErr.message?.includes("does not exist")) {
      console.error("Fetch tasks notice:", tasksErr.message);
    }

    const allTasks = tasksData || [];

    // 3. Fetch existing finalized/draft Team Lead evaluations for this month
    let existingEvaluationsMap = new Map();
    try {
      const { data: evalsData, error: evalErr } = await adminSupabase
        .from("monthly_team_lead_evaluations")
        .select("*")
        .eq("company_id", company.id)
        .eq("evaluation_month", targetMonth);

      if (!evalErr && Array.isArray(evalsData)) {
        evalsData.forEach((ev) => {
          if (ev.employee_id) {
            existingEvaluationsMap.set(ev.employee_id, ev);
          }
        });
      }
    } catch (_) {}

    // 4. Group tasks by employee and compute metrics
    const employeesSummary = employeesList.map((emp) => {
      // Find tasks assigned to this employee relevant to this month
      const empTasks = allTasks.filter((t) => {
        if (t.assigned_to !== emp.id) return false;
        const taskDue = t.effective_due_date || t.due_date;
        const taskCompleted = t.completed_at || (t.status === "COMPLETED" ? t.updated_at : null);
        const taskCreated = t.created_at;

        // Falls into target month if due, completed, or created in this month
        const isDueInMonth = taskDue && taskDue >= startMonthDateStr && taskDue <= endMonthDateStr;
        const isCompletedInMonth = taskCompleted && taskCompleted >= startMonthIso && taskCompleted <= endMonthIso;
        const isCreatedInMonth = taskCreated && taskCreated >= startMonthIso && taskCreated <= endMonthIso;

        return isDueInMonth || isCompletedInMonth || isCreatedInMonth;
      });

      let totalTasks = empTasks.length;
      let completedTasks = 0;
      let onTimeTasks = 0;
      let delayedTasks = 0;
      let totalDelayDays = 0;
      let reworkRequestsCount = 0;

      empTasks.forEach((t) => {
        const isDone = t.status === "COMPLETED";
        const dueDateStr = t.effective_due_date || t.due_date;
        const completedDateIso = t.completed_at || (isDone ? t.updated_at : null);

        if (isDone) {
          completedTasks++;
          if (dueDateStr && completedDateIso) {
            const completedDayStr = completedDateIso.split("T")[0];
            if (completedDayStr <= dueDateStr) {
              onTimeTasks++;
            } else {
              delayedTasks++;
              const dueTime = new Date(dueDateStr + "T00:00:00Z").getTime();
              const compTime = new Date(completedDayStr + "T00:00:00Z").getTime();
              const diffDays = Math.max(1, Math.floor((compTime - dueTime) / (1000 * 3600 * 24)));
              totalDelayDays += diffDays;
            }
          } else {
            onTimeTasks++;
          }
        } else {
          // Not completed yet - check if overdue
          if (dueDateStr) {
            const todayStr = new Date().toISOString().split("T")[0];
            if (todayStr > dueDateStr) {
              delayedTasks++;
              const dueTime = new Date(dueDateStr + "T00:00:00Z").getTime();
              const compTime = new Date(todayStr + "T00:00:00Z").getTime();
              const diffDays = Math.max(1, Math.floor((compTime - dueTime) / (1000 * 3600 * 24)));
              totalDelayDays += diffDays;
            }
          }
        }
      });

      const metrics = {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        on_time_tasks: onTimeTasks,
        delayed_tasks: delayedTasks,
        total_delay_days: totalDelayDays,
        rework_requests_count: reworkRequestsCount,
      };

      const scores = calculateTaskDeadlineScores(metrics);
      metrics.completion_rate = scores.completionRate;

      // Check if existing evaluation is saved
      const savedEval = existingEvaluationsMap.get(emp.id);
      const isEvaluated = Boolean(savedEval);

      let evaluationData = null;
      if (savedEval) {
        evaluationData = {
          id: savedEval.id,
          learningRating: Number(savedEval.learning_rating) || 8.0,
          innovationRating: Number(savedEval.innovation_rating) || 8.0,
          collaborationRating: Number(savedEval.collaboration_rating) || 8.0,
          learningScore: Number(savedEval.learning_score) || 16.0,
          innovationScore: Number(savedEval.innovation_score) || 16.0,
          collaborationScore: Number(savedEval.collaboration_score) || 16.0,
          autoTaskScore: Number(savedEval.auto_task_score) || scores.autoTaskScore,
          finalScore: Number(savedEval.final_score) || 0,
          performanceBadge: savedEval.performance_badge || "On Track",
          tlFeedback: savedEval.tl_feedback || "",
          strengths: savedEval.strengths || "",
          areasForImprovement: savedEval.areas_for_improvement || "",
          status: savedEval.status || "FINALIZED",
          evaluatedAt: savedEval.updated_at || savedEval.created_at,
        };
      }

      return {
        employee: emp,
        metrics,
        scores,
        isEvaluated,
        evaluation: evaluationData,
      };
    });

    const evaluatedCount = employeesSummary.filter((e) => e.isEvaluated).length;
    const totalEmployees = employeesSummary.length;
    const pendingCount = totalEmployees - evaluatedCount;

    return NextResponse.json({
      success: true,
      month: targetMonth,
      totalEmployees,
      evaluatedCount,
      pendingCount,
      employees: employeesSummary,
    });
  } catch (error) {
    console.error("GET monthly-tl summary error:", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
