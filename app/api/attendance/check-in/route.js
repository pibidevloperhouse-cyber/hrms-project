import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, resolveEmployeeFast } from "@/lib/supabase/authHelper";

/**
 * POST /api/attendance/check-in
 * Records check-in with PostgreSQL server timestamp.
 * Strictly enforces single check-in per day per employee.
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Session expired or invalid login. Please log in again to check in.", unauthorized: true },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const empRecord = await resolveEmployeeFast(adminSupabase, user);

    if (!empRecord) {
      return NextResponse.json({ message: "Employee profile not found." }, { status: 404 });
    }

    const serverNowIso = new Date().toISOString();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 1. Fetch ALL active sessions (CHECKED_IN or ON_BREAK) for employee regardless of date
    const { data: activeLogs } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("employee_id", empRecord.id)
      .in("status", ["CHECKED_IN", "ON_BREAK"])
      .order("check_in", { ascending: false });

    if (activeLogs && activeLogs.length > 0) {
      for (const activeLog of activeLogs) {
        const logCheckInMs = new Date(activeLog.check_in).getTime();
        if (logCheckInMs < startOfDay.getTime()) {
          // Unclosed session from a PREVIOUS date (e.g. 11-08-2026): Auto-close & finalize out time
          const autoEndMs = Math.min(Date.now(), logCheckInMs + 8 * 3600 * 1000);
          const autoCheckOutIso = new Date(autoEndMs).toISOString();
          const grossSec = Math.max(1, Math.floor((autoEndMs - logCheckInMs) / 1000));
          const totalBreakSec = Number(activeLog.total_break_seconds || 0);
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
            .eq("id", activeLog.id);
        } else {
          // Already active shift for TODAY
          return NextResponse.json({
            success: true,
            message: "Already checked in for today.",
            attendance: activeLog,
            checkInTime: activeLog.check_in,
            serverTime: serverNowIso,
          });
        }
      }
    }

    // 2. Fetch completed logs for today to strictly enforce single shift per day
    const { data: todayLogs } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("employee_id", empRecord.id)
      .gte("check_in", startOfDay.toISOString());

    if (todayLogs && todayLogs.length > 0) {
      const completed = todayLogs.find((l) => l.status === "COMPLETED" || l.status === "CHECKED_OUT");

      if (completed) {
        return NextResponse.json(
          {
            message: "You have already completed your attendance check-in & check-out for today. Multiple check-ins per day are disabled.",
            hasCompletedToday: true,
          },
          { status: 400 }
        );
      }
    }

    const workDate = serverNowIso.split("T")[0];

    // 1. Check if today is a company working day based on company schedule
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const { data: schedData, error: schedErr } = await adminSupabase
      .from("company_work_schedules")
      .select("work_days")
      .eq("company_id", empRecord.company_id)
      .maybeSingle();

    if (schedData && Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
      workDays = schedData.work_days;
    } else if (schedErr && schedErr.code !== "42P01") {
      console.warn("Notice fetching company schedule on check-in:", schedErr.message);
    }

    const todayDayName = new Date(serverNowIso).toLocaleDateString("en-US", { weekday: "long" });
    if (!workDays.includes(todayDayName)) {
      return NextResponse.json(
        {
          message: `Check-in is disabled today because today (${todayDayName}) is a company off-day / non-working day. Attendance check-in and check-out are only allowed on company working days.`,
          isNonWorkingDay: true,
          dayName: todayDayName,
        },
        { status: 400 }
      );
    }

    // 2. Check if today is an official company holiday
    const { data: holidayRecord } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", empRecord.company_id)
      .eq("date", workDate)
      .maybeSingle();

    if (holidayRecord) {
      return NextResponse.json(
        {
          message: `Check-in is disabled today because today is an official company holiday ("${holidayRecord.title}"). Enjoy your day off!`,
          isHoliday: true,
          holidayTitle: holidayRecord.title,
        },
        { status: 400 }
      );
    }

    // 3. Check if employee is on approved leave today
    const { data: approvedLeaveRecord } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("employee_id", empRecord.id)
      .eq("status", "APPROVED")
      .lte("start_date", workDate)
      .gte("end_date", workDate)
      .maybeSingle();

    if (approvedLeaveRecord) {
      return NextResponse.json(
        {
          message: `Check-in is disabled today because you are on approved leave ("${approvedLeaveRecord.leave_type || "Leave"}").`,
          isOnLeave: true,
          leaveType: approvedLeaveRecord.leave_type,
        },
        { status: 400 }
      );
    }

    let newAttendance = null;
    let insertErr = null;

    const { data: insertedData, error: primaryInsertErr } = await adminSupabase
      .from("attendance")
      .insert({
        company_id: empRecord.company_id,
        employee_id: empRecord.id,
        check_in: serverNowIso,
        work_date: workDate,
        status: "CHECKED_IN",
        working_hours: 0,
      })
      .select()
      .single();

    if (primaryInsertErr) {
      // If work_date column does not exist in schema yet, fallback gracefully
      if (primaryInsertErr.message?.includes("column") || primaryInsertErr.code === "42703") {
        const { data: fallbackData, error: fbErr } = await adminSupabase
          .from("attendance")
          .insert({
            company_id: empRecord.company_id,
            employee_id: empRecord.id,
            check_in: serverNowIso,
            status: "CHECKED_IN",
            working_hours: 0,
          })
          .select()
          .single();

        if (fbErr) insertErr = fbErr;
        else newAttendance = fallbackData;
      } else {
        insertErr = primaryInsertErr;
      }
    } else {
      newAttendance = insertedData;
    }

    if (insertErr) {
      if (insertErr.code === "42P01" || insertErr.message?.includes("cache")) {
        return NextResponse.json(
          {
            message: "Attendance database table missing. Please run migration 20260807_create_attendance_table.sql in Supabase SQL Editor.",
          },
          { status: 400 }
        );
      }
      throw insertErr;
    }

    return NextResponse.json({
      success: true,
      message: "Check-in successful!",
      attendance: newAttendance,
      checkInTime: newAttendance?.check_in || serverNowIso,
      workDate: newAttendance?.work_date || workDate,
      serverTime: serverNowIso,
    });
  } catch (error) {
    console.error("POST /api/attendance/check-in error:", error);
    return NextResponse.json({ message: error.message || "Failed to check in." }, { status: 500 });
  }
}
