import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { calculate3PillarScores, computeFinalMonthlyEvaluation } from "@/lib/monthlyEvaluationUtils";

/**
 * GET /api/performance/monthly-hr/summary?month=YYYY-MM
 * Evaluates monthly employee attendance, working hours, and approved leaves
 * based strictly on company working days, holidays, and factual performance metrics.
 * Supports current month, past/before months, and future months accurately.
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
    const isOwnerOrHR =
      userRoleStr.includes("admin") ||
      userRoleStr.includes("owner") ||
      userRoleStr.includes("hr") ||
      Boolean(isOwner || employeeProfile?.is_owner);

    if (!isOwnerOrHR) {
      return NextResponse.json({ message: "Access denied. HR or Admin privileges required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const targetMonth = searchParams.get("month") || defaultMonth; // "YYYY-MM"

    // 1. Fetch Company Work Schedule (Default 8.0h / Mon-Fri)
    let dailyTargetHours = 8.0;
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("daily_working_hours, work_days")
      .eq("company_id", company.id)
      .maybeSingle();

    if (schedData) {
      dailyTargetHours = Number(schedData.daily_working_hours) || 8.0;
      if (Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
        workDays = schedData.work_days;
      }
    }

    // 2. Parse Month Boundaries
    const [yearStr, monthStr] = targetMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const startDateIso = startOfMonth.toISOString();
    const endDateIso = endOfMonth.toISOString();

    const startMonthDateStr = `${targetMonth}-01`;
    const endMonthDateStr = new Date(year, month, 0).toISOString().split("T")[0];

    const todayDate = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const currentDayOfMonth = todayDate.getDate();

    const isCurrentMonth = todayDate.getFullYear() === year && (todayDate.getMonth() + 1) === month;
    const isPastMonth = (todayDate.getFullYear() > year) || (todayDate.getFullYear() === year && (todayDate.getMonth() + 1) > month);
    const isFutureMonth = (todayDate.getFullYear() < year) || (todayDate.getFullYear() === year && (todayDate.getMonth() + 1) < month);

    // 3. Fetch Company Holidays falling in this month
    const { data: monthHolidaysData } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", company.id)
      .gte("date", startMonthDateStr)
      .lte("date", endMonthDateStr);

    const holidayDatesSet = new Set();
    (monthHolidaysData || []).forEach((h) => {
      if (h.date) {
        const dt = new Date(h.date + "T00:00:00Z");
        const dayName = dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
        if (workDays.includes(dayName)) {
          holidayDatesSet.add(h.date);
        }
      }
    });
    const companyHolidaysCount = holidayDatesSet.size;

    // Calculate gross calendar work days & elapsed work days for target month
    const daysInMonthCount = new Date(year, month, 0).getDate();
    let expectedWorkDaysInMonth = 0;
    let elapsedExpectedWorkDays = 0;

    for (let day = 1; day <= daysInMonthCount; day++) {
      const dt = new Date(year, month - 1, day);
      const dayName = dt.toLocaleDateString("en-US", { weekday: "long" });
      const dayIsoStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isHoliday = holidayDatesSet.has(dayIsoStr);

      if (workDays.includes(dayName) && !isHoliday) {
        expectedWorkDaysInMonth += 1;
        if (isPastMonth) {
          elapsedExpectedWorkDays += 1;
        } else if (isCurrentMonth) {
          if (day <= currentDayOfMonth) {
            elapsedExpectedWorkDays += 1;
          }
        }
      }
    }

    const netExpectedWorkDaysInMonth = Math.max(1, expectedWorkDaysInMonth);
    const netElapsedExpectedWorkDays = Math.max(isFutureMonth ? 0 : 1, elapsedExpectedWorkDays);
    const grossExpectedMonthlyHours = Math.round(netExpectedWorkDaysInMonth * dailyTargetHours * 10) / 10;

    // 4. Fetch All Employees in Company
    const { data: employees, error: empErr } = await adminSupabase
      .from("employees")
      .select("id, full_name, email, department, designation, avatar_url, joining_date, status, role")
      .eq("company_id", company.id)
      .order("full_name", { ascending: true });

    if (empErr) {
      console.error("Error fetching employees:", empErr);
      return NextResponse.json({ message: "Failed to fetch employees." }, { status: 500 });
    }

    // 5. Fetch Attendance records for the target month (by check_in timestamp and work_date fallback)
    let { data: attendanceList } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("company_id", company.id)
      .gte("check_in", startDateIso)
      .lte("check_in", endDateIso)
      .order("check_in", { ascending: false });

    // Fallback query by work_date if check_in range returned 0 logs
    if (!attendanceList || attendanceList.length === 0) {
      const { data: byWorkDate } = await adminSupabase
        .from("attendance")
        .select("*")
        .eq("company_id", company.id)
        .gte("work_date", startMonthDateStr)
        .lte("work_date", endMonthDateStr);
      if (byWorkDate && byWorkDate.length > 0) {
        attendanceList = byWorkDate;
      }
    }

    const logs = attendanceList || [];

    // 6. Fetch Approved Leaves for the month
    const { data: leavesList } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("company_id", company.id)
      .or("status.eq.APPROVED,status.eq.approved,status.eq.Approved");

    const monthLeaves = (leavesList || []).filter((lv) => {
      const sDate = lv.start_date || lv.leave_date;
      const eDate = lv.end_date || sDate;
      if (!sDate) return false;
      return sDate <= endMonthDateStr && eDate >= startMonthDateStr;
    });

    // 7. Fetch Existing Saved Evaluations for this month
    let existingEvaluations = [];
    try {
      const { data: evals } = await adminSupabase
        .from("monthly_employee_evaluations")
        .select("*")
        .eq("company_id", company.id)
        .eq("evaluation_month", targetMonth);
      existingEvaluations = evals || [];
    } catch (evalErr) {
      console.warn("Notice: monthly_employee_evaluations query warning:", evalErr?.message);
    }

    const evalMap = new Map((existingEvaluations || []).map((ev) => [ev.employee_id, ev]));

    // Group logs by employee_id
    const logsByEmployee = {};
    logs.forEach((log) => {
      if (!logsByEmployee[log.employee_id]) logsByEmployee[log.employee_id] = [];
      logsByEmployee[log.employee_id].push(log);
    });

    // Group leaves by employee_id
    const leavesByEmployee = {};
    monthLeaves.forEach((lv) => {
      if (!leavesByEmployee[lv.employee_id]) leavesByEmployee[lv.employee_id] = [];
      leavesByEmployee[lv.employee_id].push(lv);
    });

    // 8. Process Performance Metrics for Each Employee (strictly employee role)
    const employeesList = (employees || []).filter((emp) => {
      if (employeeProfile?.id && emp.id === employeeProfile.id) return false;
      const r = (emp.role || "employee").toLowerCase().trim();
      return r === "employee" || r === "staff";
    });

    const employeeSummaries = employeesList.map((emp) => {
      const empLogs = logsByEmployee[emp.id] || [];
      const empLeaves = leavesByEmployee[emp.id] || [];

      const uniqueWorkedDates = new Set();
      let totalEmpWorkingHours = 0;
      let totalEmpOvertime = 0;
      let totalEmpTimeDelay = 0;

      empLogs.forEach((log) => {
        let hoursNum = Number(log.working_hours || 0);
        const logCheckInMs = log.check_in ? new Date(log.check_in).getTime() : 0;
        const isPastDate = logCheckInMs > 0 && logCheckInMs < startOfDay.getTime();
        const isActive = log.status === "CHECKED_IN" || log.status === "ON_BREAK";

        // Auto-heal prior unclosed attendance logs
        if (isPastDate && (isActive || !log.check_out || hoursNum === 0)) {
          const autoEndMs = Math.min(Date.now(), logCheckInMs + 8 * 3600 * 1000);
          const grossSec = Math.max(1, Math.floor((autoEndMs - logCheckInMs) / 1000));
          const totalBreakSec = Number(log.total_break_seconds || 0);
          const netSec = Math.max(1, grossSec - totalBreakSec);
          hoursNum = Number((netSec / 3600).toFixed(2));
        }

        // Real-time live hours for active shift today (if current month)
        if (isCurrentMonth && !isPastDate && isActive && log.check_in) {
          const checkInMs = new Date(log.check_in).getTime();
          const nowMs = Date.now();
          const grossElapsedSec = Math.max(0, Math.floor((nowMs - checkInMs) / 1000));
          const totalBreakSec = Number(log.total_break_seconds || 0);
          let netWorkingSec = Math.max(0, grossElapsedSec - totalBreakSec);

          if (log.status === "ON_BREAK") {
            const breakStartIso = log.break_start || log.updated_at || log.check_in;
            const breakStartMs = new Date(breakStartIso).getTime();
            const grossAtBreak = Math.max(0, Math.floor((breakStartMs - checkInMs) / 1000));
            netWorkingSec = Math.max(0, grossAtBreak - totalBreakSec);
          }

          const liveHours = Number((netWorkingSec / 3600).toFixed(2));
          if (liveHours > hoursNum) hoursNum = liveHours;
        }

        const workDate = log.work_date || (log.check_in ? log.check_in.split("T")[0] : null);
        const isCompleted = log.status === "COMPLETED" || log.status === "CHECKED_OUT" || log.status === "APPROVED";

        if (workDate && (hoursNum > 0 || isActive || isCompleted)) {
          uniqueWorkedDates.add(workDate);
        }

        totalEmpWorkingHours += hoursNum;

        // Daily Overtime vs Time Delay / Shortfall
        if (hoursNum > dailyTargetHours) {
          totalEmpOvertime += Number((hoursNum - dailyTargetHours).toFixed(2));
        } else if ((isCompleted || log.status === "REJECTED_LOP") && hoursNum < dailyTargetHours && hoursNum > 0) {
          totalEmpTimeDelay += Number((dailyTargetHours - hoursNum).toFixed(2));
        }
      });

      // Calculate approved leave days for employee in target month
      let approvedLeaveDays = 0;
      empLeaves.forEach((lv) => {
        const sDateStr = lv.start_date || lv.leave_date;
        const eDateStr = lv.end_date || sDateStr;
        if (!sDateStr) return;

        const cur = new Date(sDateStr + "T00:00:00Z");
        const end = new Date((eDateStr || sDateStr) + "T00:00:00Z");

        while (cur <= end) {
          const dStr = cur.toISOString().split("T")[0];
          if (dStr >= startMonthDateStr && dStr <= endMonthDateStr) {
            const dayName = cur.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
            if (workDays.includes(dayName) && !holidayDatesSet.has(dStr)) {
              approvedLeaveDays += 1;
            }
          }
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      });

      if (approvedLeaveDays === 0 && empLeaves.length > 0) {
        empLeaves.forEach((lv) => {
          approvedLeaveDays += Number(lv.total_days || lv.days_count || 1);
        });
      }

      const approvedLeaveHours = Number((approvedLeaveDays * dailyTargetHours).toFixed(2));

      // Approved leaves reduce required work days and required monthly hours
      const empRequiredWorkDays = Math.max(0, netExpectedWorkDaysInMonth - approvedLeaveDays);
      const empRequiredMonthlyHours = Number((empRequiredWorkDays * dailyTargetHours).toFixed(1));
      const actualWorkingHours = Number(totalEmpWorkingHours.toFixed(2));

      const attendanceWorkedDays = uniqueWorkedDates.size;
      const effectiveElapsed = isPastMonth ? netExpectedWorkDaysInMonth : netElapsedExpectedWorkDays;
      const absentDays = Math.max(0, effectiveElapsed - (attendanceWorkedDays + approvedLeaveDays));
      const shortfallHours = Number(Math.max(0, empRequiredMonthlyHours - actualWorkingHours).toFixed(2));

      const completionRate = empRequiredMonthlyHours > 0
        ? Math.min(100, Math.round((actualWorkingHours / empRequiredMonthlyHours) * 100))
        : 0;

      const factualMetrics = {
        total_working_days: netExpectedWorkDaysInMonth,
        required_working_days: empRequiredWorkDays,
        elapsed_working_days: effectiveElapsed,
        present_days: attendanceWorkedDays,
        absent_days: absentDays,
        approved_leave_days: approvedLeaveDays,
        approved_leave_hours: approvedLeaveHours,
        company_holidays_count: companyHolidaysCount,
        expected_monthly_hours: empRequiredMonthlyHours,
        required_monthly_hours: empRequiredMonthlyHours,
        gross_monthly_hours: grossExpectedMonthlyHours,
        actual_working_hours: actualWorkingHours,
        total_working_hours: actualWorkingHours,
        shortfall_hours: shortfallHours,
        overtime_hours: Number(totalEmpOvertime.toFixed(2)),
        time_delay_hours: Number(totalEmpTimeDelay.toFixed(2)),
        completion_rate: completionRate,
      };

      // Calculate Scores (Attendance /40, Hours /40, Leaves /20 = 100 pts)
      const scores = calculate3PillarScores(factualMetrics);

      // Check if already evaluated by HR in database for this month
      const existingEval = evalMap.get(emp.id);
      const isEvaluated = !!existingEval;
      const defaultHrRating = existingEval ? Number(existingEval.hr_rating) : 8.0;
      const finalEval = computeFinalMonthlyEvaluation(scores.autoBaseScore, defaultHrRating);

      return {
        employee: emp,
        metrics: factualMetrics,
        scores: scores,
        evaluation: existingEval
          ? {
              id: existingEval.id,
              hrRating: Number(existingEval.hr_rating),
              hrFeedback: existingEval.hr_feedback,
              strengths: existingEval.strengths,
              areasForImprovement: existingEval.areas_for_improvement,
              finalScore: Number(existingEval.final_score),
              performanceBadge: existingEval.performance_badge,
              status: existingEval.status,
              evaluatedAt: existingEval.updated_at,
            }
          : {
              hrRating: 8.0,
              hrFeedback: "",
              strengths: "",
              areasForImprovement: "",
              finalScore: finalEval.finalScore,
              performanceBadge: finalEval.performanceBadge,
              status: "PENDING",
            },
        isEvaluated,
      };
    });

    return NextResponse.json({
      success: true,
      month: targetMonth,
      companyId: company.id,
      expectedWorkDaysInMonth: netExpectedWorkDaysInMonth,
      expectedMonthlyHours: grossExpectedMonthlyHours,
      companyHolidaysCount,
      totalEmployees: employeesList.length,
      evaluatedCount: existingEvaluations?.length || 0,
      employees: employeeSummaries,
    });
  } catch (err) {
    console.error("Error in GET /api/performance/monthly-hr/summary:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
