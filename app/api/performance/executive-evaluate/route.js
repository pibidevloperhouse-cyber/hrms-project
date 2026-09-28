import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { calculateOwnerCultureVisionScores, computeTriPillarFinalScore } from "@/lib/executiveEvaluationUtils";

/**
 * POST /api/performance/executive-evaluate
 * Business Owner submits monthly executive appraisal (Culture Adaptation & Alignment with Vision)
 * and calibrates the final tri-pillar performance score for an employee.
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

    const userRoleStr = (role || "").toLowerCase();
    const isOwnerOrAdmin =
      ["admin", "owner", "hr_manager"].includes(userRoleStr) ||
      Boolean(isOwner || employeeProfile?.is_owner);

    if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { message: "Access denied. Business Owner or Executive role required to calibrate appraisals." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      employeeId,
      evaluationMonth,
      cultureRating = 8.0,
      visionRating = 8.0,
      ownerFeedback = "",
    } = body;

    if (!employeeId || !evaluationMonth) {
      return NextResponse.json(
        { message: "Missing required parameters: employeeId and evaluationMonth are required." },
        { status: 400 }
      );
    }

    if (!ownerFeedback || !ownerFeedback.trim()) {
      return NextResponse.json(
        { message: "Please provide Business Owner feedback remarks for this employee." },
        { status: 400 }
      );
    }

    // Enforce one-time monthly evaluation constraint (cannot be updated once submitted)
    const { data: existingOwnerEval } = await adminSupabase
      .from("monthly_executive_evaluations")
      .select("id, final_composite_score")
      .eq("company_id", company.id)
      .eq("employee_id", employeeId)
      .eq("evaluation_month", evaluationMonth)
      .maybeSingle();

    if (existingOwnerEval) {
      return NextResponse.json(
        {
          message: `Business Owner executive appraisal has already been submitted and finalized for this employee for ${evaluationMonth}. Monthly appraisals can only be given once per month and cannot be updated again.`,
          isAlreadyEvaluated: true,
        },
        { status: 400 }
      );
    }

    // 1. Verify target employee
    const { data: targetEmployee, error: targetErr } = await adminSupabase
      .from("employees")
      .select("id, full_name, email, department, designation, role, company_id")
      .eq("id", employeeId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (targetErr || !targetEmployee) {
      return NextResponse.json({ message: "Employee not found in this company." }, { status: 404 });
    }

    const targetRole = (targetEmployee.role || "employee").toLowerCase().trim();
    if (targetRole !== "employee" && targetRole !== "staff") {
      return NextResponse.json(
        { message: "Performance evaluations are strictly designated for staff in the employee role." },
        { status: 400 }
      );
    }

    // 2. Fetch existing HR and Manager evaluations for snapshot calculation
    const [{ data: hrData }, { data: tlData }] = await Promise.all([
      adminSupabase
        .from("monthly_employee_evaluations")
        .select("final_score")
        .eq("company_id", company.id)
        .eq("employee_id", employeeId)
        .eq("evaluation_month", evaluationMonth)
        .maybeSingle(),
      adminSupabase
        .from("monthly_team_lead_evaluations")
        .select("final_score")
        .eq("company_id", company.id)
        .eq("employee_id", employeeId)
        .eq("evaluation_month", evaluationMonth)
        .maybeSingle(),
    ]);

    const hasHR = Boolean(hrData);
    const hasTL = Boolean(tlData);

    if (!hasHR || !hasTL) {
      const missing = [];
      if (!hasHR) missing.push("HR Discipline Evaluation");
      if (!hasTL) missing.push("Team Lead / Manager Evaluation");
      return NextResponse.json(
        {
          message: `Cannot save executive appraisal: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} required before the Business Owner can calibrate the overall performance score.`,
          missingEvaluations: { hr: !hasHR, tl: !hasTL },
        },
        { status: 400 }
      );
    }

    const hrScore = Number(hrData.final_score) || 0;
    const tlScore = Number(tlData.final_score) || 0;

    // 3. Compute Owner Scores & Composite Final Score
    const ownerScores = calculateOwnerCultureVisionScores(cultureRating, visionRating);
    const triPillarResult = computeTriPillarFinalScore(hrScore, tlScore, ownerScores.ownerScore);

    // 4. Resolve evaluator ID
    let evaluatedById = employeeProfile?.id || null;
    if (!evaluatedById) {
      const { data: empMatch } = await adminSupabase
        .from("employees")
        .select("id")
        .eq("company_id", company.id)
        .or(`auth_user_id.eq.${user.id},email.ilike."${(user.email || "").replace(/"/g, '""')}"`)
        .maybeSingle();
      evaluatedById = empMatch?.id || null;
    }

    // 5. Upsert into monthly_executive_evaluations
    const recordToSave = {
      company_id: company.id,
      employee_id: employeeId,
      evaluated_by: evaluatedById,
      evaluation_month: evaluationMonth,

      culture_adaptation_rating: ownerScores.cultureRating,
      vision_alignment_rating: ownerScores.visionRating,
      culture_adaptation_score: ownerScores.cultureScore,
      vision_alignment_score: ownerScores.visionScore,
      owner_score: ownerScores.ownerScore,

      owner_feedback: (ownerFeedback || "").trim(),
      hr_score_snapshot: hrScore,
      tl_score_snapshot: tlScore,

      final_composite_score: triPillarResult.finalCompositeScore,
      performance_badge: triPillarResult.performanceBadge,
      status: "CALIBRATED",
      updated_at: new Date().toISOString(),
    };

    const { data: savedRecord, error: saveErr } = await adminSupabase
      .from("monthly_executive_evaluations")
      .upsert(recordToSave, {
        onConflict: "company_id,employee_id,evaluation_month",
      })
      .select()
      .single();

    if (saveErr) {
      console.error("Save executive evaluation error:", saveErr);
      return NextResponse.json(
        {
          message: `Database error: ${saveErr.message || "Failed to save executive appraisal."}`,
          error: saveErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Executive appraisal calibrated successfully for ${targetEmployee.full_name}!`,
      evaluation: savedRecord,
      triPillarResult,
    });
  } catch (error) {
    console.error("POST executive-evaluate error:", error);
    return NextResponse.json({ message: "Internal server error: " + (error.message || "") }, { status: 500 });
  }
}
