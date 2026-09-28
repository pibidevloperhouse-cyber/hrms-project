import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { calculateTaskDeadlineScores, computeFinalTLEvaluation } from "@/lib/teamLeadEvaluationUtils";

/**
 * POST /api/performance/monthly-tl/evaluate
 * Team Lead submits monthly evaluation, ratings (Learning, Innovation, Collaboration), and feedback for an employee.
 */
export async function POST(req) {
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
      return NextResponse.json({ message: "Access denied. Team Lead or Manager privileges required." }, { status: 403 });
    }

    const isTeamLeadOrManager = !isOwnerOrAdmin;
    const userDepartment = (employeeProfile?.department || "").trim().toLowerCase();

    const body = await req.json();
    const {
      employeeId,
      evaluationMonth,
      learningRating = 8.0,
      innovationRating = 8.0,
      collaborationRating = 8.0,
      tlFeedback,
      strengths = "",
      areasForImprovement = "",
      metrics = {},
    } = body;

    if (!employeeId || !evaluationMonth) {
      return NextResponse.json({ message: "Missing required fields: employeeId and evaluationMonth are required." }, { status: 400 });
    }

    if (!tlFeedback || tlFeedback.trim().length === 0) {
      return NextResponse.json({ message: "Please provide Team Lead feedback remarks for this employee." }, { status: 400 });
    }

    // Enforce one-time monthly evaluation constraint (cannot be updated once submitted)
    const { data: existingEval } = await adminSupabase
      .from("monthly_team_lead_evaluations")
      .select("id, final_score")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .eq("evaluation_month", evaluationMonth)
      .maybeSingle();

    if (existingEval) {
      return NextResponse.json(
        {
          message: `Team Lead / Manager evaluation has already been submitted and finalized for this employee for ${evaluationMonth}. Monthly evaluations can only be given once per month and cannot be updated again.`,
          isAlreadyEvaluated: true,
        },
        { status: 400 }
      );
    }

    // Verify target employee exists and belongs to the company
    const { data: targetEmployee, error: targetErr } = await adminSupabase
      .from("employees")
      .select("id, full_name, email, department, designation, role, company_id")
      .eq("id", employeeId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (targetErr || !targetEmployee) {
      return NextResponse.json({ message: "Employee not found in your company workspace." }, { status: 404 });
    }

    // Prevent team lead / manager from evaluating themselves
    if (employeeProfile?.id && targetEmployee.id === employeeProfile.id) {
      return NextResponse.json({ message: "You cannot submit a Team Lead evaluation for yourself." }, { status: 400 });
    }

    // Check authorization to evaluate this employee:
    // 1. Owner / Admin / HR can evaluate any employee in the company
    // 2. Department Lead / Manager can evaluate employees in their department
    // 3. Project Lead / Creator can evaluate members in their project squad
    if (isTeamLeadOrManager) {
      const targetDept = (targetEmployee.department || "").trim().toLowerCase();
      const sameDept = Boolean(userDepartment && targetDept === userDepartment);

      let isProjectLeadForEmployee = false;
      if (!sameDept && employeeProfile?.id) {
        const { data: sharedProjects } = await adminSupabase
          .from("projects")
          .select("id, team_lead_id, created_by, owner_id, team_members")
          .eq("company_id", company.id)
          .or(`team_lead_id.eq.${employeeProfile.id},created_by.eq.${employeeProfile.id},owner_id.eq.${employeeProfile.id}`);

        if (Array.isArray(sharedProjects)) {
          isProjectLeadForEmployee = sharedProjects.some((p) => {
            if (Array.isArray(p.team_members)) {
              return p.team_members.some((m) => (typeof m === "object" ? m?.id : m) === targetEmployee.id);
            }
            return false;
          });
        }
      }

      if (!sameDept && !isProjectLeadForEmployee && !userRoleStr.includes("manager")) {
        return NextResponse.json(
          {
            message: `Access denied. You can only evaluate employees in your department (${employeeProfile?.department || "Unassigned"}) or assigned project squads.`,
          },
          { status: 403 }
        );
      }
    }

    // Evaluations are strictly for employee role only (cannot evaluate team leads, managers, HR, or admins/owners)
    const targetRole = String(targetEmployee.role || "employee").toLowerCase().trim();
    if (targetRole !== "employee") {
      return NextResponse.json(
        { message: "Monthly team performance evaluations can only be submitted for employees (role: 'employee'). Team Leads, Managers, HR, and Administrators cannot be evaluated via this review." },
        { status: 400 }
      );
    }

    // Safely resolve evaluator ID
    let evaluatedById = employeeProfile?.id || null;
    if (!evaluatedById) {
      const { data: empMatch } = await adminSupabase
        .from("employees")
        .select("id")
        .eq("company_id", company.id)
        .or(`auth_user_id.eq.${user.id},email.ilike."${(user.email || "").replace(/"/g, '""')}"`)
        .maybeSingle();
      evaluatedById = empMatch?.id || employeeId;
    }

    const safeNumber = (val, fallback = 0) => {
      const n = Number(val);
      return Number.isFinite(n) ? n : fallback;
    };

    // 1. Calculate Automated Task & Deadline Scores
    const scores = calculateTaskDeadlineScores(metrics);

    // 2. Calculate Final Score (Auto Task Score + Learning + Innovation + Collaboration = 100 pts)
    const finalResult = computeFinalTLEvaluation(
      scores.autoTaskScore,
      learningRating,
      innovationRating,
      collaborationRating
    );

    // 3. Upsert into monthly_team_lead_evaluations
    const recordToSave = {
      company_id: company.id,
      employee_id: employeeId,
      evaluated_by: evaluatedById,
      evaluation_month: evaluationMonth,

      // Factual Task Metrics Snapshot
      total_tasks: Math.round(safeNumber(metrics.total_tasks, 0)),
      completed_tasks: Math.round(safeNumber(metrics.completed_tasks, 0)),
      on_time_tasks: Math.round(safeNumber(metrics.on_time_tasks, 0)),
      delayed_tasks: Math.round(safeNumber(metrics.delayed_tasks, 0)),
      total_delay_days: Math.round(safeNumber(metrics.total_delay_days, 0)),
      rework_requests_count: Math.round(safeNumber(metrics.rework_requests_count || metrics.rework_count, 0)),
      completion_rate: safeNumber(scores.completionRate, 0),

      // Calculated Sub-scores
      task_completion_score: safeNumber(scores.taskCompletionScore, 0),
      deadline_punctuality_score: safeNumber(scores.deadlinePunctualityScore, 0),
      auto_task_score: safeNumber(scores.autoTaskScore, 0),

      // Team Lead Qualitative Ratings & Scores
      learning_rating: safeNumber(finalResult.learningRating, 8.0),
      innovation_rating: safeNumber(finalResult.innovationRating, 8.0),
      collaboration_rating: safeNumber(finalResult.collaborationRating, 8.0),
      learning_score: safeNumber(finalResult.learningScore, 16.0),
      innovation_score: safeNumber(finalResult.innovationScore, 16.0),
      collaboration_score: safeNumber(finalResult.collaborationScore, 16.0),
      manual_skills_score: safeNumber(finalResult.manualSkillsScore, 48.0),

      // Team Lead Written Remarks
      tl_feedback: tlFeedback.trim(),
      strengths: (strengths || "").trim(),
      areas_for_improvement: (areasForImprovement || "").trim(),

      // Final Score & Badge
      final_score: safeNumber(finalResult.finalScore, 0),
      performance_badge: finalResult.performanceBadge || "On Track",
      status: "FINALIZED",
      updated_at: new Date().toISOString(),
    };

    const { data: savedRecord, error: saveErr } = await adminSupabase
      .from("monthly_team_lead_evaluations")
      .upsert(recordToSave, {
        onConflict: "company_id,employee_id,evaluation_month",
      })
      .select()
      .single();

    if (saveErr) {
      console.error("Save TL evaluation error:", saveErr);
      return NextResponse.json(
        {
          message: `Database error: ${saveErr.message || "Failed to save Team Lead evaluation."}`,
          error: saveErr.message,
          details: saveErr.details || saveErr.hint,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Monthly Team Lead evaluation finalized successfully.",
      evaluation: savedRecord,
    });
  } catch (error) {
    console.error("POST monthly-tl evaluate error:", error);
    return NextResponse.json({ message: "Internal server error: " + (error.message || "") }, { status: 500 });
  }
}
