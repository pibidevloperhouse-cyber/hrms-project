import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

/**
 * GET /api/attendance/monthly-summary?month=YYYY-MM&employeeId=...
 * Calculates real-time monthly working hours, overtime (+OT), time delay (-Delay),
 * working days, and absent days for each employee and company-wide.
 * Generates automated HR evaluation badges and smart recommendations.
 * Persists evaluated summary records into public.monthly_analysis_summary table.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in.", unauthorized: true },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const targetMonth = searchParams.get("month") || new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const reqEmpId = searchParams.get("employeeId");

    const isHR = ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(role);

    // Target employee for individual drill-down
    let targetEmployeeId = employeeProfile?.id;
    if (isHR && reqEmpId) {
      targetEmployeeId = reqEmpId;
    }

    // 1. Fetch Company Work Schedule (Default 8.0h/day)
    let dailyTargetHours = 8.0;
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("*")
      .eq("company_id", company.id)
      .maybeSingle();

    if (schedData) {
      dailyTargetHours = Number(schedData.daily_working_hours) || 8.0;
      if (Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
        workDays = schedData.work_days;
      }
    }

    // Parse Month Boundaries (start of month 00:00:00 to end of month 23:59:59)
    const [yearStr, monthStr] = targetMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-indexed

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const startDateIso = startOfMonth.toISOString();
    const endDateIso = endOfMonth.toISOString();

    // Calculate Month Work Days Target & Elapsed Work Days to date
    const daysInMonthCount = new Date(year, month, 0).getDate();
    let expectedWorkDaysInMonth = 0;

    const todayDate = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const currentDayOfMonth = todayDate.getDate();
    const isCurrentMonth = todayDate.getFullYear() === year && (todayDate.getMonth() + 1) === month;

    let elapsedExpectedWorkDays = 0;

    for (let day = 1; day <= daysInMonthCount; day++) {
      const dt = new Date(year, month - 1, day);
      const dayName = dt.toLocaleDateString("en-US", { weekday: "long" });
      if (workDays.includes(dayName)) {
        expectedWorkDaysInMonth += 1;
        if (!isCurrentMonth || day <= currentDayOfMonth) {
          elapsedExpectedWorkDays += 1;
        }
      }
    }

    const expectedMonthlyHours = Number((expectedWorkDaysInMonth * dailyTargetHours).toFixed(1));

    // 2. Fetch All Company Employees
    const { data: allEmpList } = await adminSupabase
      .from("employees")
      .select("id, full_name, email, role, department, designation, status")
      .eq("company_id", company.id)
      .order("full_name", { ascending: true });

    const employees = allEmpList || [];

    // Target employee details
    let targetEmployeeDetails = employeeProfile;
    if (targetEmployeeId && targetEmployeeId !== employeeProfile?.id) {
      const targetEmp = employees.find((e) => e.id === targetEmployeeId);
      if (targetEmp) targetEmployeeDetails = targetEmp;
    }

    // 3. Fetch ALL Attendance Logs, Approved Leaves & HR Company Holidays for company for target month
    const startMonthDateStr = `${targetMonth}-01`;
    const endMonthDateStr = new Date(year, month, 0).toISOString().split("T")[0];

    const { data: monthLogs } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("company_id", company.id)
      .gte("check_in", startDateIso)
      .lte("check_in", endDateIso)
      .order("check_in", { ascending: false });

    const logs = monthLogs || [];

    const { data: monthLeavesData } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("company_id", company.id)
      .eq("status", "APPROVED");

    const monthLeaves = (monthLeavesData || []).filter((lv) => {
      const sDate = lv.start_date || lv.leave_date;
      const eDate = lv.end_date || sDate;
      if (!sDate) return false;
      return sDate <= endMonthDateStr && eDate >= startMonthDateStr;
    });

    const { data: monthHolidaysData } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", company.id)
      .gte("date", startMonthDateStr)
      .lte("date", endMonthDateStr);

    const monthHolidays = monthHolidaysData || [];

    // Count holidays falling on standard company work days
    const holidayDatesSet = new Set();
    monthHolidays.forEach((h) => {
      if (h.date) {
        const dt = new Date(h.date + "T00:00:00Z");
        const dayName = dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
        if (workDays.includes(dayName)) {
          holidayDatesSet.add(h.date);
        }
      }
    });

    const companyHolidaysCount = holidayDatesSet.size;

    // Deduct HR Company Holidays from Expected Work Days & Hours (Holidays do not require working hours!)
    const netExpectedWorkDaysInMonth = Math.max(0, expectedWorkDaysInMonth - companyHolidaysCount);
    const netElapsedExpectedWorkDays = Math.max(0, elapsedExpectedWorkDays - companyHolidaysCount);
    const netExpectedMonthlyHours = Number((netExpectedWorkDaysInMonth * dailyTargetHours).toFixed(1));

    // Group logs by employee_id
    const logsByEmployee = {};
    logs.forEach((log) => {
      if (!logsByEmployee[log.employee_id]) {
        logsByEmployee[log.employee_id] = [];
      }
      logsByEmployee[log.employee_id].push(log);
    });

    // Group approved leaves by employee_id
    const leavesByEmployee = {};
    monthLeaves.forEach((lv) => {
      if (!leavesByEmployee[lv.employee_id]) {
        leavesByEmployee[lv.employee_id] = [];
      }
      leavesByEmployee[lv.employee_id].push(lv);
    });

    // 4. Calculate Summary for ALL Employees & Prepare Database Upsert Payload
    const staffSummaryTable = [];
    const dbUpsertPayload = [];

    employees.forEach((emp) => {
      const empLogs = logsByEmployee[emp.id] || [];
      const empLeaves = leavesByEmployee[emp.id] || [];

      const uniqueWorkedDates = new Set();
      let totalEmpWorkingHours = 0;
      let totalEmpOvertime = 0;
      let totalEmpTimeDelay = 0;
      let totalLopShortageHours = 0;

      empLogs.forEach((log) => {
        let hoursNum = Number(log.working_hours || 0);
        const logCheckInMs = log.check_in ? new Date(log.check_in).getTime() : 0;
        const isPastDate = logCheckInMs > 0 && logCheckInMs < startOfDay.getTime();
        const isActive = log.status === "CHECKED_IN" || log.status === "ON_BREAK";

        // Auto-heal prior unclosed attendance logs from previous calendar dates (e.g. 11-08-2026)
        if (isPastDate && (isActive || !log.check_out || hoursNum === 0)) {
          const autoEndMs = Math.min(Date.now(), logCheckInMs + 8 * 3600 * 1000);
          const autoCheckOutIso = new Date(autoEndMs).toISOString();
          const grossSec = Math.max(1, Math.floor((autoEndMs - logCheckInMs) / 1000));
          const totalBreakSec = Number(log.total_break_seconds || 0);
          const netSec = Math.max(1, grossSec - totalBreakSec);
          hoursNum = Number((netSec / 3600).toFixed(2));

          log.check_out = autoCheckOutIso;
          log.working_hours = hoursNum;
          log.status = "COMPLETED";
          log.approval_status = "APPROVED";

          adminSupabase
            .from("attendance")
            .update({
              check_out: autoCheckOutIso,
              working_hours: hoursNum,
              status: "COMPLETED",
              approval_status: "APPROVED",
              updated_at: new Date().toISOString(),
            })
            .eq("id", log.id)
            .then();
        }

        const isCompleted = log.status === "COMPLETED" || log.status === "CHECKED_OUT" || log.status === "APPROVED";
        const isLop = log.status === "REJECTED_LOP" || log.is_lop === true || log.approval_status === "REJECTED";
        const workDate = log.work_date || (log.check_in ? log.check_in.split("T")[0] : null);

        // If shift is active right now for TODAY, calculate live runtime working hours
        if (!isPastDate && isActive && log.check_in) {
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

          const liveHours = Number((netWorkingSec / 3600).toFixed(4));
          if (liveHours > hoursNum) {
            hoursNum = liveHours;
          }
        }

        if (workDate && (hoursNum > 0 || isActive || isCompleted)) {
          uniqueWorkedDates.add(workDate);
        }

        // If Loss of Pay (LOP), compute shortage time explicitly
        if (isLop) {
          const lopShortage = Math.max(0, dailyTargetHours - hoursNum);
          totalLopShortageHours += Number(lopShortage.toFixed(2));
        }

        totalEmpWorkingHours += hoursNum;

        // Daily Overtime vs Time Delay / Deficit
        if (hoursNum > dailyTargetHours) {
          totalEmpOvertime += Number((hoursNum - dailyTargetHours).toFixed(2));
        } else if ((isCompleted || isLop) && hoursNum < dailyTargetHours && hoursNum > 0) {
          totalEmpTimeDelay += Number((dailyTargetHours - hoursNum).toFixed(2));
        }
      });

      // Calculate approved leave days for employee
      let approvedLeaveDays = 0;
      empLeaves.forEach((lv) => {
        approvedLeaveDays += Number(lv.total_days || 1.0);
      });

      // HR Approved Leave Policy: Leaves reduce the employee's required working days & monthly target hours!
      const empRequiredWorkDays = Math.max(0, netExpectedWorkDaysInMonth - approvedLeaveDays);
      const empRequiredMonthlyHours = Number((empRequiredWorkDays * dailyTargetHours).toFixed(1));
      const actualShiftHoursOnly = Number(totalEmpWorkingHours.toFixed(2));

      // Attendance Worked Days & Net Unexcused Absent Days
      const attendanceWorkedDays = uniqueWorkedDates.size;
      const totalEffectiveWorkingDays = attendanceWorkedDays;
      const absentDays = Math.max(0, netElapsedExpectedWorkDays - (attendanceWorkedDays + approvedLeaveDays));

      const shortfallHours = Number(Math.max(0, empRequiredMonthlyHours - actualShiftHoursOnly).toFixed(2));

      const completionRate = empRequiredMonthlyHours > 0
        ? Math.min(100, Math.round((actualShiftHoursOnly / empRequiredMonthlyHours) * 100))
        : 0;

      let evaluationBadge = "⚖️ Satisfactory";
      let evaluationLevel = "STANDARD";
      let suggestionText = "Performance meeting standard shift requirements.";

      if (completionRate >= 95 && totalEmpOvertime >= 5) {
        evaluationBadge = "🌟 Star Performer";
        evaluationLevel = "EXCELLENT";
        suggestionText = `High shift completion & overtime (+${totalEmpOvertime}h OT). Recommend appreciation/bonus.`;
      } else if (completionRate >= 85) {
        evaluationBadge = approvedLeaveDays > 0 ? "✓ High Reliability (Reduced Target)" : "✓ High Reliability";
        evaluationLevel = "GOOD";
        suggestionText = "Consistent shift attendance and reliable working hours.";
        if (approvedLeaveDays > 0) {
          suggestionText += ` (Required days reduced by ${approvedLeaveDays}d approved leave).`;
        }
      } else if (absentDays >= 3) {
        evaluationBadge = "🚨 High Absenteeism";
        evaluationLevel = "CRITICAL";
        suggestionText = `${absentDays} days unexcused absent. Recommend formal attendance audit.`;
      } else if (totalLopShortageHours > 0 || totalEmpTimeDelay >= 5) {
        evaluationBadge = "⚠️ Time Delay / LOP";
        evaluationLevel = "WARNING";
        suggestionText = `Accumulated delay of -${(totalLopShortageHours + totalEmpTimeDelay).toFixed(1)}h.`;
        if (totalLopShortageHours > 0) {
          suggestionText += ` Includes -${totalLopShortageHours.toFixed(1)}h Loss of Pay (LOP) shortage.`;
        }
      }

      // Real-Time Attendance Health Score (0 - 100 Index)
      let healthScore = Math.min(50, Math.round(completionRate * 0.5));
      if (absentDays === 0) healthScore += 25;
      else healthScore += Math.max(0, 25 - (absentDays * 8));

      if (totalEmpTimeDelay < 2 && totalLopShortageHours === 0) healthScore += 25;
      else healthScore += Math.max(0, 25 - Math.round(totalEmpTimeDelay * 2) - Math.round(totalLopShortageHours * 3));

      healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

      // Burnout & Overwork Risk Assessment
      let burnoutRiskLevel = "LOW";
      if (totalEmpOvertime >= 12 && completionRate >= 90) {
        burnoutRiskLevel = "HIGH";
      } else if (totalEmpOvertime >= 6) {
        burnoutRiskLevel = "MEDIUM";
      }

      const empSummaryObj = {
        employeeId: emp.id,
        fullName: emp.full_name,
        email: emp.email,
        role: emp.role,
        department: emp.department || "General",
        designation: emp.designation || "",
        totalWorkingDays: totalEffectiveWorkingDays,
        attendanceWorkedDays,
        approvedLeaveDays,
        approvedLeaveHours: Number((approvedLeaveDays * dailyTargetHours).toFixed(2)),
        companyHolidaysCount,
        absentDays,
        requiredWorkDays: empRequiredWorkDays,
        requiredHours: empRequiredMonthlyHours,
        expectedMonthlyHours: empRequiredMonthlyHours,
        actualWorkingHours: actualShiftHoursOnly,
        workedHours: actualShiftHoursOnly,
        totalWorkingHours: actualShiftHoursOnly,
        shortfallHours,
        totalLopShortageHours,
        overtimeHours: Number(totalEmpOvertime.toFixed(2)),
        timeDelayHours: Number(totalEmpTimeDelay.toFixed(2)),
        completionRate,
        healthScore,
        burnoutRiskLevel,
        evaluationBadge,
        evaluationLevel,
        suggestionText,
        hrRemarks: suggestionText,
      };

      staffSummaryTable.push(empSummaryObj);

      dbUpsertPayload.push({
        company_id: company.id,
        employee_id: emp.id,
        month: targetMonth,
        total_working_days: totalEffectiveWorkingDays,
        absent_days: absentDays,
        approved_leave_days: approvedLeaveDays,
        approved_leave_hours: Number((approvedLeaveDays * dailyTargetHours).toFixed(2)),
        expected_monthly_hours: empRequiredMonthlyHours,
        actual_working_hours: actualShiftHoursOnly,
        total_working_hours: actualShiftHoursOnly,
        overtime_hours: Number(totalEmpOvertime.toFixed(2)),
        time_delay_hours: Number(totalEmpTimeDelay.toFixed(2)),
        completion_rate: completionRate,
        health_score: healthScore,
        burnout_risk_level: burnoutRiskLevel,
        evaluation_badge: evaluationBadge,
        evaluation_level: evaluationLevel,
        suggestion_text: suggestionText,
        last_evaluated_at: new Date().toISOString(),
      });
    });

    // Compute Department Capacity Benchmarks
    const departmentMap = {};
    staffSummaryTable.forEach((emp) => {
      const dept = emp.department || "General";
      if (!departmentMap[dept]) {
        departmentMap[dept] = {
          name: dept,
          count: 0,
          totalWorked: 0,
          totalOvertime: 0,
        };
      }
      departmentMap[dept].count += 1;
      departmentMap[dept].totalWorked += emp.workedHours;
      departmentMap[dept].totalOvertime += emp.overtimeHours;
    });

    const departmentBenchmarks = Object.values(departmentMap).map((d) => ({
      department: d.name,
      employeeCount: d.count,
      totalWorkedHours: Number(d.totalWorked.toFixed(1)),
      totalOvertimeHours: Number(d.totalOvertime.toFixed(1)),
    }));

    // 5. Persist evaluated records into public.employee_monthly_summary table
    if (dbUpsertPayload.length > 0) {
      try {
        await adminSupabase
          .from("employee_monthly_summary")
          .upsert(dbUpsertPayload, { onConflict: "employee_id,month" });
      } catch (dbErr) {
        try {
          await adminSupabase
            .from("monthly_analysis_summary")
            .upsert(dbUpsertPayload, { onConflict: "employee_id,month" });
        } catch (fallbackErr) {
          console.warn("Notice: monthly summary upsert warning:", dbErr.message);
        }
      }
    }

    // 6. Filter individual shift breakdown for requested target employee
    const targetLogs = targetEmployeeId ? (logsByEmployee[targetEmployeeId] || []) : logs;

    let totalCompletedHours = 0;
    let totalOvertimeHours = 0;
    let totalTimeGapHours = 0;
    let totalWorkedDays = 0;

    const dailyBreakdown = targetLogs.map((log) => {
      let hoursNum = Number(log.working_hours || 0);
      const logCheckInMs = log.check_in ? new Date(log.check_in).getTime() : 0;
      const isPastDate = logCheckInMs > 0 && logCheckInMs < startOfDay.getTime();
      const isActive = log.status === "CHECKED_IN" || log.status === "ON_BREAK";

      if (isPastDate && (isActive || !log.check_out || hoursNum === 0)) {
        const autoEndMs = Math.min(Date.now(), logCheckInMs + 8 * 3600 * 1000);
        const autoCheckOutIso = new Date(autoEndMs).toISOString();
        const grossSec = Math.max(1, Math.floor((autoEndMs - logCheckInMs) / 1000));
        const totalBreakSec = Number(log.total_break_seconds || 0);
        const netSec = Math.max(1, grossSec - totalBreakSec);
        hoursNum = Number((netSec / 3600).toFixed(2));

        log.check_out = autoCheckOutIso;
        log.working_hours = hoursNum;
        log.status = "COMPLETED";
        log.approval_status = "APPROVED";
      }

      const isCompleted = log.status === "COMPLETED" || log.status === "CHECKED_OUT" || log.status === "APPROVED";

      // If shift is active right now for TODAY, calculate live runtime working hours
      if (!isPastDate && isActive && log.check_in) {
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

        const liveHours = Number((netWorkingSec / 3600).toFixed(4));
        if (liveHours > hoursNum) {
          hoursNum = liveHours;
        }
      }

      const isLop = log.status === "REJECTED_LOP" || log.is_lop === true || log.approval_status === "REJECTED";

      let overtimeHours = 0;
      let timeGapHours = 0;

      if (hoursNum > dailyTargetHours) {
        overtimeHours = Number((hoursNum - dailyTargetHours).toFixed(2));
      } else if ((isCompleted || isLop) && hoursNum < dailyTargetHours) {
        timeGapHours = Number((dailyTargetHours - hoursNum).toFixed(2));
      }

      totalCompletedHours += hoursNum;
      totalOvertimeHours += overtimeHours;
      totalTimeGapHours += timeGapHours;
      if (hoursNum > 0 || isActive) {
        totalWorkedDays += 1;
      }

      let dailyHrRemarks = "Standard shift completed.";
      if (isLop) {
        dailyHrRemarks = `✖ Loss of Pay (LOP) — Shortage: -${timeGapHours.toFixed(1)}h`;
        if (log.hr_feedback) {
          dailyHrRemarks += ` (${log.hr_feedback})`;
        }
      } else if (log.hr_feedback) {
        dailyHrRemarks = `HR Note: ${log.hr_feedback}`;
      } else if (log.early_reason) {
        dailyHrRemarks = `Early Reason: ${log.early_reason}`;
      } else if (log.status === "PENDING_APPROVAL") {
        dailyHrRemarks = "Pending HR early check-out review";
      } else if (log.status === "CHECKED_IN") {
        dailyHrRemarks = "Currently On Duty (Active Shift)";
      } else if (log.status === "ON_BREAK") {
        dailyHrRemarks = "Currently On Lunch Break";
      } else if (overtimeHours > 0) {
        dailyHrRemarks = `Overtime worked (+${overtimeHours}h OT)`;
      } else if (timeGapHours > 0) {
        dailyHrRemarks = `Shortfall deficit (-${timeGapHours}h delay)`;
      }

      return {
        id: log.id,
        employeeId: log.employee_id,
        checkIn: log.check_in,
        checkOut: log.check_out,
        workDate: log.work_date || (log.check_in ? log.check_in.split("T")[0] : null),
        requiredHours: dailyTargetHours,
        workedHours: hoursNum,
        workingHours: hoursNum,
        totalBreakSeconds: Number(log.total_break_seconds || 0),
        shortfallHours: timeGapHours,
        overtimeHours,
        timeGapHours,
        status: log.status,
        earlyCheckout: log.early_checkout || false,
        earlyReason: log.early_reason || null,
        approvalStatus: log.approval_status || "APPROVED",
        hrRemarks: dailyHrRemarks,
      };
    });

    // Merge approved leave days into dailyBreakdown if employee was on approved leave on dates without attendance check-in
    const empLeaveList = targetEmployeeId ? (leavesByEmployee[targetEmployeeId] || []) : monthLeaves;
    const existingBreakdownDates = new Set(dailyBreakdown.map((d) => d.workDate).filter(Boolean));

    empLeaveList.forEach((lv) => {
      const sDateStr = lv.start_date || lv.leave_date;
      const eDateStr = lv.end_date || sDateStr;
      if (!sDateStr) return;

      const curDate = new Date(sDateStr + "T00:00:00Z");
      const endDate = new Date((eDateStr || sDateStr) + "T00:00:00Z");

      while (curDate <= endDate) {
        const dStr = curDate.toISOString().split("T")[0];
        if (dStr >= startMonthDateStr && dStr <= endMonthDateStr && !existingBreakdownDates.has(dStr)) {
          existingBreakdownDates.add(dStr);
          dailyBreakdown.push({
            id: `leave_${lv.id}_${dStr}`,
            employeeId: lv.employee_id,
            checkIn: null,
            checkOut: null,
            workDate: dStr,
            requiredHours: 0,
            workedHours: 0,
            workingHours: 0,
            totalBreakSeconds: 0,
            shortfallHours: 0,
            overtimeHours: 0,
            timeGapHours: 0,
            status: "ON_LEAVE",
            earlyCheckout: false,
            earlyReason: null,
            approvalStatus: "APPROVED",
            hrRemarks: `✈️ Approved Leave (${lv.leave_type || "Casual"}) — Working Day Reduced (-1d)`,
            leaveType: lv.leave_type || "Approved Leave",
          });
        }
        curDate.setUTCDate(curDate.getUTCDate() + 1);
      }
    });

    dailyBreakdown.sort((a, b) => new Date(b.workDate || 0).getTime() - new Date(a.workDate || 0).getTime());

    const targetEmpSummary = staffSummaryTable.find((s) => s.employeeId === targetEmployeeId) || {
      totalWorkedDays,
      totalCompletedHours: Number(totalCompletedHours.toFixed(2)),
      totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
      totalTimeGapHours: Number(totalTimeGapHours.toFixed(2)),
      completionRate: netExpectedMonthlyHours > 0 ? Math.min(100, Math.round((totalCompletedHours / netExpectedMonthlyHours) * 100)) : 0,
    };

    return NextResponse.json({
      success: true,
      month: targetMonth,
      companyId: company.id,
      userRole: role,
      isHR,
      targetEmployee: targetEmployeeDetails,
      allEmployees: employees,
      dailyTargetHours,
      expectedWorkDaysInMonth: netExpectedWorkDaysInMonth,
      expectedMonthlyHours: netExpectedMonthlyHours,
      grossExpectedWorkDaysInMonth: expectedWorkDaysInMonth,
      grossExpectedMonthlyHours: expectedMonthlyHours,
      companyHolidaysCount,
      summary: targetEmpSummary,
      staffSummaryTable, // All staff real-time summary evaluation list for HR
      departmentBenchmarks, // Department capacity and health score benchmarks
      dailyBreakdown,
    });
  } catch (error) {
    console.error("GET /api/attendance/monthly-summary error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}
