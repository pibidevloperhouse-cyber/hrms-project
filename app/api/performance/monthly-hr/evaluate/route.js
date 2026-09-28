import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { calculate3PillarScores, computeFinalMonthlyEvaluation } from "@/lib/monthlyEvaluationUtils";

/**
 * POST /api/performance/monthly-hr/evaluate
 * HR submits monthly evaluation, feedback remarks, strengths, and rating for an employee.
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "Company workspace not found." }, { status: 404 });
    }

    const userRoleStr = (role || "").toLowerCase();
    const isHR = ["admin", "hr_manager", "hr_executive", "manager", "team_lead", "owner"].includes(userRoleStr) || Boolean(employeeProfile?.is_owner);
    if (!isHR) {
      return NextResponse.json({ message: "Access denied. HR privileges required." }, { status: 403 });
    }

    const body = await req.json();
    const {
      employeeId,
      evaluationMonth,
      hrRating = 8.0,
      hrFeedback,
      strengths = "",
      areasForImprovement = "",
      metrics = {},
    } = body;

    if (!employeeId || !evaluationMonth) {
      return NextResponse.json({ message: "Missing required fields: employeeId and evaluationMonth are required." }, { status: 400 });
    }

    if (!hrFeedback || hrFeedback.trim().length === 0) {
      return NextResponse.json({ message: "Please provide HR feedback remarks for this employee." }, { status: 400 });
    }

    // Enforce one-time monthly evaluation constraint (cannot be updated once submitted)
    const { data: existingEval } = await adminSupabase
      .from("monthly_employee_evaluations")
      .select("id, final_score")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .eq("evaluation_month", evaluationMonth)
      .maybeSingle();

    if (existingEval) {
      return NextResponse.json(
        {
          message: `HR evaluation has already been submitted and finalized for this employee for ${evaluationMonth}. Monthly evaluations can only be given once per month and cannot be updated again.`,
          isAlreadyEvaluated: true,
        },
        { status: 400 }
      );
    }

    // 1. Calculate 3-Pillar Scores safely
    const scores = calculate3PillarScores(metrics);

    // 2. Calculate Final Score
    const finalResult = computeFinalMonthlyEvaluation(scores.autoBaseScore, hrRating);

    // Safely resolve evaluator ID
    let evaluatedById = employeeProfile?.id || null;
    if (!evaluatedById) {
      // If user is admin/owner, try to find their employee record if any, otherwise use employeeId
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

    // 3. Upsert into monthly_employee_evaluations
    const recordToSave = {
      company_id: company.id,
      employee_id: employeeId,
      evaluated_by: evaluatedById,
      evaluation_month: evaluationMonth,

      // Factual Metrics Snapshot
      total_working_days: Math.round(safeNumber(metrics.total_working_days, 0)),
      present_days: Math.round(safeNumber(metrics.present_days, 0)),
      absent_days: Math.round(safeNumber(metrics.absent_days, 0)),
      approved_leave_days: Math.round(safeNumber(metrics.approved_leave_days, 0)),
      approved_leave_hours: safeNumber(metrics.approved_leave_hours, 0),
      expected_monthly_hours: safeNumber(metrics.expected_monthly_hours, 176),
      actual_working_hours: safeNumber(metrics.actual_working_hours, 0),
      total_working_hours: safeNumber(metrics.total_working_hours, 0),
      shortfall_hours: safeNumber(metrics.shortfall_hours, 0),
      overtime_hours: safeNumber(metrics.overtime_hours, 0),
      time_delay_hours: safeNumber(metrics.time_delay_hours, 0),
      completion_rate: safeNumber(metrics.completion_rate, 0),

      // 3-Pillar Sub-scores
      attendance_score: safeNumber(scores.attendanceScore, 0),
      hours_score: safeNumber(scores.hoursScore, 0),
      leave_score: safeNumber(scores.leaveScore, 0),
      auto_base_score: safeNumber(scores.autoBaseScore, 0),

      // HR Review
      hr_rating: safeNumber(finalResult.hrRating, 8.0),
      hr_feedback: hrFeedback.trim(),
      strengths: (strengths || "").trim(),
      areas_for_improvement: (areasForImprovement || "").trim(),

      // Final
      final_score: safeNumber(finalResult.finalScore, 0),
      performance_badge: finalResult.performanceBadge || "On Track",
      status: "FINALIZED",
      updated_at: new Date().toISOString(),
    };

    const { data: savedRecord, error: saveErr } = await adminSupabase
      .from("monthly_employee_evaluations")
      .upsert(recordToSave, {
        onConflict: "company_id,employee_id,evaluation_month",
      })
      .select()
      .single();

    if (saveErr) {
      console.error("Error saving monthly HR evaluation:", saveErr);
      return NextResponse.json(
        {
          message: `Database error: ${saveErr.message || "Failed to save evaluation."}`,
          error: saveErr.message,
          details: saveErr.details || saveErr.hint,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Monthly evaluation saved successfully.",
      evaluation: savedRecord,
    });
  } catch (err) {
    console.error("Error in POST /api/performance/monthly-hr/evaluate:", err);
    return NextResponse.json({ message: "Internal server error: " + (err.message || "") }, { status: 500 });
  }
}
