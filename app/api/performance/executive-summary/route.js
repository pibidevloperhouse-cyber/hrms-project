import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { computeTriPillarFinalScore } from "@/lib/executiveEvaluationUtils";

/**
 * GET /api/performance/executive-summary?month=YYYY-MM or ?month=ALL
 * Fetches and merges saved genuine HR monthly evaluations (Attendance/Hours/Leaves)
 * and saved Team Lead / Manager monthly evaluations (Task Deadlines/Learning/Innovation/Collab)
 * for the Business Owner.
 *
 * No automated synthetic scores - only displays real appraisals submitted by HR and Managers.
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

    const userRoleStr = (role || "").toLowerCase();
    const isOwnerOrAdmin =
      ["admin", "owner", "hr_manager", "manager", "team_lead"].includes(userRoleStr) ||
      Boolean(isOwner || employeeProfile?.is_owner);

    if (!isOwnerOrAdmin) {
      return NextResponse.json({ message: "Access denied. Owner / Executive role required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rawMonth = searchParams.get("month") || "ALL";
    const isAllMonths = rawMonth.toUpperCase() === "ALL";
    let targetMonth = isAllMonths ? "ALL" : rawMonth;

    if (!isAllMonths && !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
      targetMonth = defaultMonth;
    }

    // 1. Fetch all company staff to resolve evaluators and employees to evaluate
    const { data: employeesData, error: empErr } = await adminSupabase
      .from("employees")
      .select("id, full_name, email, department, designation, role, avatar_url, status, joining_date")
      .eq("company_id", company.id)
      .order("full_name", { ascending: true });

    if (empErr) {
      console.error("Executive summary employee query error:", empErr);
      return NextResponse.json({ message: "Failed to fetch employees." }, { status: 500 });
    }

    const allStaff = employeesData || [];
    const empLookup = new Map();
    allStaff.forEach((emp) => empLookup.set(emp.id, emp));

    // Performance analysis is strictly for company employees with role === 'employee' (excluding other roles like owner, admin, manager, team_lead, hr_manager, etc.)
    const employees = allStaff.filter((emp) => {
      // Exclude self (the evaluating owner)
      if (employeeProfile?.id && emp.id === employeeProfile.id) return false;
      const r = (emp.role || "employee").toLowerCase().trim();
      // Strictly include only employee / staff role
      return r === "employee" || r === "staff";
    });


    // 2. Fetch saved HR, TL, and Business Owner evaluations safely
    let hrQuery = adminSupabase
      .from("monthly_employee_evaluations")
      .select("*")
      .eq("company_id", company.id);

    let tlQuery = adminSupabase
      .from("monthly_team_lead_evaluations")
      .select("*")
      .eq("company_id", company.id);

    let ownerQuery = adminSupabase
      .from("monthly_executive_evaluations")
      .select("*")
      .eq("company_id", company.id);

    if (!isAllMonths) {
      hrQuery = hrQuery.eq("evaluation_month", targetMonth);
      tlQuery = tlQuery.eq("evaluation_month", targetMonth);
      ownerQuery = ownerQuery.eq("evaluation_month", targetMonth);
    }

    let allHrEvals = [];
    let allTlEvals = [];
    let allOwnerEvals = [];

    try {
      const { data: hrRes, error: hrErr } = await hrQuery.order("evaluation_month", { ascending: false });
      if (!hrErr && hrRes) allHrEvals = hrRes;
    } catch (e) {
      console.warn("HR evaluations query warning:", e.message);
    }

    try {
      const { data: tlRes, error: tlErr } = await tlQuery.order("evaluation_month", { ascending: false });
      if (!tlErr && tlRes) allTlEvals = tlRes;
    } catch (e) {
      console.warn("TL evaluations query warning:", e.message);
    }

    try {
      const { data: ownerRes, error: ownerErr } = await ownerQuery.order("evaluation_month", { ascending: false });
      if (!ownerErr && ownerRes) allOwnerEvals = ownerRes;
    } catch (e) {
      console.warn("Owner evaluations query warning:", e.message);
    }

    // 3. Discover all distinct available evaluation months
    const distinctMonths = new Set();
    distinctMonths.add(defaultMonth);

    allHrEvals.forEach((ev) => {
      if (ev?.evaluation_month) distinctMonths.add(ev.evaluation_month);
    });
    allTlEvals.forEach((ev) => {
      if (ev?.evaluation_month) distinctMonths.add(ev.evaluation_month);
    });
    allOwnerEvals.forEach((ev) => {
      if (ev?.evaluation_month) distinctMonths.add(ev.evaluation_month);
    });

    // Also include past 24 months to support historical queries
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      distinctMonths.add(ym);
    }

    const sortedAvailableMonths = Array.from(distinctMonths).sort().reverse();

    // 4. Index saved evaluations by `${employee_id}_${month}`
    const savedHrMap = new Map();
    allHrEvals.forEach((item) => {
      if (item.employee_id && item.evaluation_month) {
        savedHrMap.set(`${item.employee_id}_${item.evaluation_month}`, item);
      }
    });

    const savedTlMap = new Map();
    allTlEvals.forEach((item) => {
      if (item.employee_id && item.evaluation_month) {
        savedTlMap.set(`${item.employee_id}_${item.evaluation_month}`, item);
      }
    });

    const savedOwnerMap = new Map();
    allOwnerEvals.forEach((item) => {
      if (item.employee_id && item.evaluation_month) {
        savedOwnerMap.set(`${item.employee_id}_${item.evaluation_month}`, item);
      }
    });

    // 5. Determine which months to compile
    const monthsToProcess = isAllMonths ? sortedAvailableMonths : [targetMonth];
    const matrixEntries = [];

    monthsToProcess.forEach((mStr) => {
      employees.forEach((emp) => {
        const pairKey = `${emp.id}_${mStr}`;
        const savedHr = savedHrMap.get(pairKey) || null;
        const savedTl = savedTlMap.get(pairKey) || null;
        const savedOwner = savedOwnerMap.get(pairKey) || null;

        // Skip employees who hadn't joined yet if it's a past month with 0 evaluations
        if (emp.joining_date && mStr < emp.joining_date.slice(0, 7) && !savedHr && !savedTl && !savedOwner) {
          return;
        }

        const matrixItem = buildGenuineMatrixItem(emp, mStr, savedHr, savedTl, savedOwner, empLookup);
        matrixEntries.push(matrixItem);
      });
    });

    // 6. Sort: Evaluation Month DESC, then Employee Full Name ASC
    matrixEntries.sort((a, b) => {
      if (a.evaluationMonth !== b.evaluationMonth) {
        return b.evaluationMonth.localeCompare(a.evaluationMonth);
      }
      return (a.employee?.full_name || "").localeCompare(b.employee?.full_name || "");
    });

    // 7. Compute aggregate statistics
    let totalScoreSum = 0;
    let evaluatedEmployeesCount = 0;
    let bothEvaluatedCount = 0;
    let hrOnlyCount = 0;
    let tlOnlyCount = 0;
    let pendingBothCount = 0;

    matrixEntries.forEach((item) => {
      if (item.status === "BOTH_EVALUATED") {
        bothEvaluatedCount++;
        totalScoreSum += item.overallScore || 0;
        evaluatedEmployeesCount++;
      } else if (item.status === "HR_ONLY") {
        hrOnlyCount++;
        totalScoreSum += item.overallScore || 0;
        evaluatedEmployeesCount++;
      } else if (item.status === "TL_ONLY") {
        tlOnlyCount++;
        totalScoreSum += item.overallScore || 0;
        evaluatedEmployeesCount++;
      } else {
        pendingBothCount++;
      }
    });

    const averageScore =
      evaluatedEmployeesCount > 0
        ? Math.round((totalScoreSum / evaluatedEmployeesCount) * 10) / 10
        : 0;

    return NextResponse.json({
      success: true,
      month: targetMonth,
      isAllMonths,
      availableMonths: sortedAvailableMonths,
      totalStaff: employees.length,
      totalEvaluations: matrixEntries.length,
      bothEvaluatedCount,
      hrOnlyCount,
      tlOnlyCount,
      pendingBothCount,
      evaluatedEmployeesCount,
      averageScore,
      matrix: matrixEntries,
    });
  } catch (error) {
    console.error("GET executive performance summary error:", error);
    return NextResponse.json(
      { message: `Internal server error: ${error?.message || "Unknown error"}`, error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * Builds a genuine matrix item combining HR (30%), TL (40%), and Owner (30%) appraisals
 */
function buildGenuineMatrixItem(emp, evalMonth, savedHr, savedTl, savedOwner, empLookup) {
  const hasHR = Boolean(savedHr);
  const hasTL = Boolean(savedTl);
  const hasOwner = Boolean(savedOwner);

  const hrScore = hasHR ? Number(savedHr.final_score) || 0 : null;
  const tlScore = hasTL ? Number(savedTl.final_score) || 0 : null;
  const ownerScore = hasOwner ? Number(savedOwner.owner_score) || 0 : null;

  const triPillar = computeTriPillarFinalScore(hrScore, tlScore, ownerScore);

  let status = "PENDING_BOTH";
  if (hasHR && hasTL && hasOwner) {
    status = "FULLY_CALIBRATED";
  } else if (hasHR && hasTL && !hasOwner) {
    status = "AWAITING_OWNER";
  } else if (hasHR && !hasTL) {
    status = "HR_ONLY";
  } else if (!hasHR && hasTL) {
    status = "TL_ONLY";
  } else if (hasOwner) {
    status = "OWNER_CALIBRATED";
  } else {
    status = "PENDING_BOTH";
  }

  const overallScore = (hasHR || hasTL || hasOwner) ? triPillar.finalCompositeScore : null;
  const overallBadge = (hasHR || hasTL || hasOwner) ? triPillar.performanceBadge : "Pending";

  const hrEvaluator = savedHr?.evaluated_by ? empLookup.get(savedHr.evaluated_by) : null;
  const tlEvaluator = savedTl?.evaluated_by ? empLookup.get(savedTl.evaluated_by) : null;
  const ownerEvaluator = savedOwner?.evaluated_by ? empLookup.get(savedOwner.evaluated_by) : null;

  let evaluationMonthFormatted = evalMonth;
  if (evalMonth && evalMonth.includes("-")) {
    const [yStr, mStr] = evalMonth.split("-");
    const yNum = parseInt(yStr, 10);
    const mNum = parseInt(mStr, 10);
    if (!isNaN(yNum) && !isNaN(mNum)) {
      const monthDate = new Date(yNum, mNum - 1, 1);
      evaluationMonthFormatted = monthDate.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    }
  }

  return {
    id: `${emp.id}_${evalMonth}`,
    evaluationMonth: evalMonth,
    evaluationMonthFormatted,
    employee: emp,
    status,
    overallScore,
    overallBadge,
    triPillar,
    hrEvaluation: hasHR
      ? {
          id: savedHr.id,
          finalScore: hrScore,
          performanceBadge: savedHr.performance_badge,
          hrRating: Number(savedHr.hr_rating) || 8.0,
          hrFeedback: savedHr.hr_feedback || savedHr.hrFeedback || "",
          strengths: savedHr.strengths || "",
          areasForImprovement: savedHr.areas_for_improvement || "",
          attendanceScore: Number(savedHr.attendance_score) || 0,
          hoursScore: Number(savedHr.hours_score) || 0,
          leaveScore: Number(savedHr.leave_score) || 0,
          autoBaseScore: Number(savedHr.auto_base_score) || 0,
          presentDays: savedHr.present_days,
          totalWorkingDays: savedHr.total_working_days,
          actualWorkingHours: savedHr.actual_working_hours,
          expectedMonthlyHours: savedHr.expected_monthly_hours,
          approvedLeaveDays: savedHr.approved_leave_days,
          absentDays: savedHr.absent_days,
          evaluatedBy: hrEvaluator ? hrEvaluator.full_name : "HR Department",
          evaluatedAt: savedHr.updated_at || savedHr.created_at,
        }
      : null,
    tlEvaluation: hasTL
      ? {
          id: savedTl.id,
          finalScore: tlScore,
          performanceBadge: savedTl.performance_badge,
          learningRating: Number(savedTl.learning_rating) || 8.0,
          innovationRating: Number(savedTl.innovation_rating) || 8.0,
          collaborationRating: Number(savedTl.collaboration_rating) || 8.0,
          learningScore: Number(savedTl.learning_score) || 16.0,
          innovationScore: Number(savedTl.innovation_score) || 16.0,
          collaborationScore: Number(savedTl.collaboration_score) || 16.0,
          autoTaskScore: Number(savedTl.auto_task_score) || 0,
          taskCompletionScore: Number(savedTl.task_completion_score) || 0,
          deadlinePunctualityScore: Number(savedTl.deadline_punctuality_score) || 0,
          totalTasks: savedTl.total_tasks,
          completedTasks: savedTl.completed_tasks,
          onTimeTasks: savedTl.on_time_tasks,
          delayedTasks: savedTl.delayed_tasks,
          totalDelayDays: savedTl.total_delay_days,
          tlFeedback: savedTl.tl_feedback || savedTl.tlFeedback || "",
          strengths: savedTl.strengths || "",
          areasForImprovement: savedTl.areas_for_improvement || "",
          evaluatedBy: tlEvaluator ? tlEvaluator.full_name : "Team Lead",
          evaluatedAt: savedTl.updated_at || savedTl.created_at,
        }
      : null,
    ownerEvaluation: hasOwner
      ? {
          id: savedOwner.id,
          cultureRating: Number(savedOwner.culture_adaptation_rating) || 8.0,
          visionRating: Number(savedOwner.vision_alignment_rating) || 8.0,
          cultureScore: Number(savedOwner.culture_adaptation_score) || 12.0,
          visionScore: Number(savedOwner.vision_alignment_score) || 12.0,
          ownerScore: Number(savedOwner.owner_score) || 24.0,
          ownerFeedback: savedOwner.owner_feedback || "",
          finalCompositeScore: Number(savedOwner.final_composite_score) || overallScore,
          performanceBadge: savedOwner.performance_badge,
          evaluatedBy: ownerEvaluator ? ownerEvaluator.full_name : "Business Owner",
          evaluatedAt: savedOwner.updated_at || savedOwner.created_at,
        }
      : null,
  };
}
