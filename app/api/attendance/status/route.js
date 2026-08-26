import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, resolveEmployeeFast } from "@/lib/supabase/authHelper";

/**
 * GET /api/attendance/status
 * Real-time daily attendance status logic.
 * Checks for any active session (including overnight shifts) or completed session for TODAY.
 * If moving to a new day without check-in, returns fresh uncompleted state.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in.", unauthorized: true }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const empRecord = await resolveEmployeeFast(adminSupabase, user);

    if (!empRecord) {
      return NextResponse.json({ message: "Employee profile not found" }, { status: 404 });
    }

    const serverNowIso = new Date().toISOString();
    const todayStr = serverNowIso.split("T")[0];

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Check company work schedule (working hours & working days)
    let dailyTargetHours = 8.0;
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const { data: schedData, error: schedErr } = await adminSupabase
      .from("company_work_schedules")
      .select("daily_working_hours, work_days")
      .eq("company_id", empRecord.company_id)
      .maybeSingle();

    if (schedData) {
      if (schedData.daily_working_hours) {
        dailyTargetHours = Number(schedData.daily_working_hours) || 8.0;
      }
      if (Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
        workDays = schedData.work_days;
      }
    } else if (schedErr && schedErr.code !== "42P01") {
      console.warn("Notice fetching company schedule on status check:", schedErr.message);
    }

    const todayDayName = new Date(serverNowIso).toLocaleDateString("en-US", { weekday: "long" });
    const isWorkingDay = workDays.includes(todayDayName);
    const isNonWorkingDay = !isWorkingDay;

    // Check if today is a registered company holiday
    const { data: holidayData } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", empRecord.company_id)
      .eq("date", todayStr)
      .maybeSingle();

    const isHoliday = Boolean(holidayData);
    const holidayTitle = holidayData?.title || null;
    const holidayType = holidayData?.holiday_type || null;

    // Check if employee has an HR-approved leave request for today
    const { data: approvedLeaveData } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("employee_id", empRecord.id)
      .eq("status", "APPROVED")
      .lte("start_date", todayStr)
      .gte("end_date", todayStr)
      .maybeSingle();

    const isOnLeave = Boolean(approvedLeaveData);
    const leaveType = approvedLeaveData?.leave_type || "Approved Leave";
    const leaveReason = approvedLeaveData?.reason || null;

    // 1. Fetch any active shift session (CHECKED_IN or ON_BREAK) regardless of check-in time (supports overnight shifts)
    const { data: activeLogs, error: activeErr } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("employee_id", empRecord.id)
      .in("status", ["CHECKED_IN", "ON_BREAK"])
      .order("check_in", { ascending: false })
      .limit(1);

    if (activeErr) {
      console.warn("Active session query error:", activeErr.message);
    }

    let activeSession = activeLogs && activeLogs.length > 0 ? activeLogs[0] : null;

    if (activeSession) {
      const checkInMs = new Date(activeSession.check_in).getTime();
      // Auto-close prior day unclosed active sessions (e.g. 11-08-2026)
      if (checkInMs < startOfDay.getTime()) {
        const autoEndMs = Math.min(Date.now(), checkInMs + 8 * 3600 * 1000);
        const autoCheckOutIso = new Date(autoEndMs).toISOString();
        const grossSec = Math.max(1, Math.floor((autoEndMs - checkInMs) / 1000));
        const totalBreakSec = Number(activeSession.total_break_seconds || 0);
        const netSec = Math.max(1, grossSec - totalBreakSec);
        const calculatedHours = Number((netSec / 3600).toFixed(2));

        await adminSupabase
          .from("attendance")
          .update({
            check_out: autoCheckOutIso,
            working_hours: calculatedHours,
            status: "COMPLETED",
            approval_status: "APPROVED",
            updated_at: serverNowIso,
          })
          .eq("id", activeSession.id);

        activeSession = null;
      }
    }

    // 2. Fetch logs for today (check_in >= startOfDay or work_date == todayStr)
    const { data: todayLogs, error: todayErr } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("employee_id", empRecord.id)
      .gte("check_in", startOfDay.toISOString())
      .order("check_in", { ascending: true });

    if (todayErr && todayErr.code !== "42P01") {
      console.warn("Today logs query error:", todayErr.message);
    }

    let totalCompletedHours = 0;
    if (todayLogs) {
      todayLogs.forEach((log) => {
        if (log.status !== "CHECKED_IN" && log.status !== "ON_BREAK" && log.working_hours) {
          totalCompletedHours += Number(log.working_hours);
        }
      });
    }

    if (activeSession) {
      const checkInMs = new Date(activeSession.check_in).getTime();
      const nowMs = new Date(serverNowIso).getTime();
      const grossElapsedSeconds = Math.max(0, Math.floor((nowMs - checkInMs) / 1000));
      
      const isOnBreak = activeSession.status === "ON_BREAK";
      let accumulatedBreakSec = Number(activeSession.total_break_seconds) || 0;
      let currentBreakSec = 0;
      let netWorkingSeconds = Math.max(0, grossElapsedSeconds - accumulatedBreakSec);

      if (isOnBreak) {
        const breakStartIso = activeSession.break_start || activeSession.updated_at || activeSession.check_in || serverNowIso;
        const breakStartMs = new Date(breakStartIso).getTime();
        currentBreakSec = Math.max(0, Math.floor((nowMs - breakStartMs) / 1000));
        
        // When on break, net working time is frozen at break_start timestamp
        const grossElapsedAtBreakStart = Math.max(0, Math.floor((breakStartMs - checkInMs) / 1000));
        netWorkingSeconds = Math.max(0, grossElapsedAtBreakStart - accumulatedBreakSec);
      }

      const runtimeHours = Number((netWorkingSeconds / 3600).toFixed(2));

      return NextResponse.json({
        checkedIn: true,
        isOnBreak,
        breakStart: activeSession.break_start || null,
        totalBreakSeconds: accumulatedBreakSec,
        currentBreakSeconds: currentBreakSec,
        hasCompletedBreak: Boolean(
          activeSession.has_taken_break || (accumulatedBreakSec > 0 && !isOnBreak)
        ),
        netWorkingSeconds,
        hasCompletedToday: false,
        checkInTime: activeSession.check_in,
        workDate: activeSession.work_date || (activeSession.check_in ? activeSession.check_in.split("T")[0] : todayStr),
        attendanceId: activeSession.id,
        serverTime: serverNowIso,
        workingHours: runtimeHours,
        elapsedSeconds: netWorkingSeconds,
        grossElapsedSeconds,
        todayLogs: todayLogs || [],
        totalCompletedHoursToday: Number(totalCompletedHours.toFixed(2)),
        totalWorkingHoursToday: Number((totalCompletedHours + runtimeHours).toFixed(2)),
        dailyTargetHours,
        isHoliday,
        holidayTitle,
        holidayType,
        isOnLeave,
        leaveType,
        leaveReason,
        isWorkingDay,
        isNonWorkingDay,
        todayDayName,
        canCheckIn: isWorkingDay && !isHoliday && !isOnLeave,
        dbReady: true,
      });
    }

    // 3. Look for a completed session strictly for TODAY
    const completedSessionToday = todayLogs?.slice().reverse().find(
      (log) => log.status === "COMPLETED" || log.status === "CHECKED_OUT" || log.status === "PENDING_APPROVAL" || log.status === "REJECTED_LOP"
    );

    if (completedSessionToday) {
      return NextResponse.json({
        checkedIn: false,
        hasCompletedToday: true,
        checkInTime: completedSessionToday.check_in,
        checkOutTime: completedSessionToday.check_out,
        workDate: completedSessionToday.work_date || (completedSessionToday.check_in ? completedSessionToday.check_in.split("T")[0] : todayStr),
        attendanceId: completedSessionToday.id,
        serverTime: serverNowIso,
        workingHours: Number(completedSessionToday.working_hours || 0),
        status: completedSessionToday.status,
        earlyCheckout: completedSessionToday.early_checkout || false,
        earlyReason: completedSessionToday.early_reason || null,
        approvalStatus: completedSessionToday.approval_status || (completedSessionToday.status === "PENDING_APPROVAL" ? "PENDING" : completedSessionToday.status === "REJECTED_LOP" ? "REJECTED" : "APPROVED"),
        isLop: completedSessionToday.is_lop || completedSessionToday.status === "REJECTED_LOP",
        hrFeedback: completedSessionToday.hr_feedback || null,
        todayLogs: todayLogs || [],
        totalWorkingHoursToday: Number(totalCompletedHours.toFixed(2)),
        dailyTargetHours,
        isHoliday,
        holidayTitle,
        holidayType,
        isOnLeave,
        leaveType,
        leaveReason,
        isWorkingDay,
        isNonWorkingDay,
        todayDayName,
        canCheckIn: isWorkingDay && !isHoliday && !isOnLeave,
        dbReady: true,
        message: "Attendance checked out for today.",
      });
    }

    // 4. Default: New day, fresh ready-to-check-in state!
    return NextResponse.json({
      checkedIn: false,
      hasCompletedToday: false,
      checkInTime: null,
      workDate: todayStr,
      attendanceId: null,
      serverTime: serverNowIso,
      workingHours: 0,
      todayLogs: todayLogs || [],
      totalWorkingHoursToday: 0,
      dailyTargetHours,
      isHoliday,
      holidayTitle,
      holidayType,
      isOnLeave,
      leaveType,
      leaveReason,
      isWorkingDay,
      isNonWorkingDay,
      todayDayName,
      canCheckIn: isWorkingDay && !isHoliday && !isOnLeave,
      dbReady: true,
    });
  } catch (error) {
    console.error("GET /api/attendance/status error:", error);
    return NextResponse.json({ message: error.message || "Internal server error" }, { status: 500 });
  }
}

