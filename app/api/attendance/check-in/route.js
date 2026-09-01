import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, resolveEmployeeFast } from "@/lib/supabase/authHelper";
import { transporter } from "@/lib/mail/transporter";
import { buildLateCheckInEmailHTML } from "@/lib/mail/lateCheckInEmail";

/**
 * Parses "09:00", "09:00:00", "09:30 AM", or "2:15 PM" into total minutes from midnight.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const str = String(timeStr).trim();

  // 12-hour format like "09:30 AM" or "9:30 pm"
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3] ? ampmMatch[3].toUpperCase() : null;

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  // 24-hour format "HH:MM" or "HH:MM:SS"
  const [hStr, mStr] = str.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Converts timestamp or time string into clean 12-hour format ("09:00 AM")
 */
function formatTime12h(timeInput, timeZone) {
  const tz = timeZone || "Asia/Kolkata";
  if (!timeInput) return "—";
  if (timeInput instanceof Date) {
    try {
      return timeInput.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: tz,
      });
    } catch {
      return timeInput.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }
  }
  if (typeof timeInput === "string") {
    if (timeInput.includes("T") || timeInput.endsWith("Z")) {
      const d = new Date(timeInput);
      if (!isNaN(d.getTime())) {
        try {
          return d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: tz,
          });
        } catch {
          return d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
        }
      }
    }
    const mins = parseTimeToMinutes(timeInput);
    if (mins !== null) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const period = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
    }
  }
  return String(timeInput);
}

/**
 * Calculates delayed minutes and formats readable duration string if check-in is after scheduled start time.
 */
function calculateDelay(checkInDateInput, scheduledStartTimeStr, options = {}) {
  if (!scheduledStartTimeStr) return null;

  const scheduledMinutes = parseTimeToMinutes(scheduledStartTimeStr);
  if (scheduledMinutes === null) return null;

  const d = checkInDateInput instanceof Date ? checkInDateInput : new Date(checkInDateInput);
  if (isNaN(d.getTime())) return null;

  const tz = options.timeZone || "Asia/Kolkata";

  // Determine check-in minutes in local timezone
  let checkInMinutes;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(d);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    checkInMinutes = h * 60 + m;
  } catch {
    checkInMinutes = d.getHours() * 60 + d.getMinutes();
  }

  const diffMinutes = checkInMinutes - scheduledMinutes;
  if (diffMinutes <= 0) return null; // On-time or early

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  let delayDuration = "";
  if (hours > 0 && mins > 0) {
    delayDuration = `${hours} hr${hours > 1 ? "s" : ""} ${mins} min${mins > 1 ? "s" : ""}`;
  } else if (hours > 0) {
    delayDuration = `${hours} hour${hours > 1 ? "s" : ""}`;
  } else {
    delayDuration = `${mins} min${mins > 1 ? "s" : ""}`;
  }

  return {
    isLate: true,
    diffMinutes,
    delayDuration,
    scheduledTime: formatTime12h(scheduledStartTimeStr, tz),
    checkInTime: formatTime12h(d, tz),
  };
}

/**
 * POST /api/attendance/check-in
 * Records check-in with PostgreSQL server timestamp.
 * Strictly enforces single check-in per day per employee.
 * Calculates late arrival delay and sends email notification to employee in real time.
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

    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }
    const timeZone =
      body?.timeZone ||
      req.headers.get("x-timezone") ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "Asia/Kolkata";

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
          // Unclosed session from a PREVIOUS date: Auto-close & finalize out time
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

    // 3. Fetch Company Schedule (work_days and start_time)
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    let scheduledStartTime = "09:00";

    const { data: schedData, error: schedErr } = await adminSupabase
      .from("company_work_schedules")
      .select("work_days, start_time")
      .eq("company_id", empRecord.company_id)
      .maybeSingle();

    if (schedData) {
      if (Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
        workDays = schedData.work_days;
      }
      if (schedData.start_time) {
        scheduledStartTime = schedData.start_time;
      }
    } else if (schedErr && schedErr.code !== "42P01") {
      console.warn("Notice fetching company schedule on check-in:", schedErr.message);
    }

    const todayDayName = new Date(serverNowIso).toLocaleDateString("en-US", { weekday: "long", timeZone });
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

    // 4. Check if today is an official company holiday
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

    // 5. Check if employee is on approved leave today
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

    // 6. Insert new Attendance Check-In Record
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
            message: "Attendance database table missing. Please run migration in Supabase SQL Editor.",
          },
          { status: 400 }
        );
      }
      throw insertErr;
    }

    // 7. Check for Late Check-In and Dispatch Email to Employee's Gmail in real time
    const checkInDate = new Date(serverNowIso);
    const delayInfo = calculateDelay(checkInDate, scheduledStartTime, { timeZone });
    const targetEmail = (empRecord.email || user.email || "").trim().toLowerCase();

    let emailDispatched = false;
    let emailError = null;

    if (delayInfo && targetEmail) {
      console.log(`⏰ Late check-in detected for ${empRecord.full_name || "Employee"} (${targetEmail}): ${delayInfo.delayDuration} delay (Check-in: ${delayInfo.checkInTime}, Scheduled: ${delayInfo.scheduledTime})`);

      let companyName = empRecord.companies?.name;
      if (!companyName && empRecord.company_id) {
        try {
          const { data: comp } = await adminSupabase
            .from("companies")
            .select("name")
            .eq("id", empRecord.company_id)
            .maybeSingle();
          if (comp?.name) companyName = comp.name;
        } catch {
          // Fallback to default
        }
      }
      companyName = companyName || "Company Workspace";

      const dateStr = checkInDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone,
      });

      const employeeId = empRecord.employee_id || (empRecord.id ? `EMP-${empRecord.id.slice(0, 5).toUpperCase()}` : "EMP-001");

      try {
        const emailHtml = buildLateCheckInEmailHTML({
          employeeName: empRecord.full_name || "Employee",
          employeeId,
          companyName,
          scheduledTime: delayInfo.scheduledTime,
          checkInTime: delayInfo.checkInTime,
          delayDuration: delayInfo.delayDuration,
          dateStr,
        });

        const senderAddress = process.env.EMAIL_USER
          ? `"${companyName} HRMS" <${process.env.EMAIL_USER}>`
          : `"${companyName} HRMS"`;

        const sendRes = await transporter.sendMail({
          from: senderAddress,
          to: targetEmail,
          subject: `Late Check-In Notice - ${empRecord.full_name || "Employee"} (${dateStr})`,
          html: emailHtml,
        });
        emailDispatched = true;
        console.log(`⚡ Late check-in email successfully sent in real time to: ${targetEmail} (ID: ${sendRes?.messageId || "OK"}, Delay: ${delayInfo.delayDuration})`);
      } catch (mailErr) {
        emailError = mailErr?.message || String(mailErr);
        console.error(`❌ Failed to send late check-in email to ${targetEmail}:`, mailErr);
      }

      // In-app notification record for employee
      try {
        await adminSupabase.from("notifications").insert([
          {
            company_id: empRecord.company_id,
            employee_id: empRecord.id,
            title: "⏰ Late Check-In Notice",
            message: `You checked in at ${delayInfo.checkInTime}, which is ${delayInfo.delayDuration} after the scheduled start time (${delayInfo.scheduledTime}).`,
            is_read: false,
            created_at: serverNowIso,
          },
        ]);
      } catch {
        // Ignore notification table errors if optional
      }
    }

    return NextResponse.json({
      success: true,
      message: delayInfo
        ? `Check-in recorded at ${delayInfo.checkInTime} (${delayInfo.delayDuration} after scheduled ${delayInfo.scheduledTime} shift start).`
        : "Check-in successful!",
      isLate: Boolean(delayInfo),
      delayDuration: delayInfo?.delayDuration || null,
      scheduledStartTime: delayInfo?.scheduledTime || formatTime12h(scheduledStartTime, timeZone),
      actualCheckInTime: delayInfo?.checkInTime || formatTime12h(checkInDate, timeZone),
      emailSent: emailDispatched,
      emailSentTo: emailDispatched ? targetEmail : null,
      emailError: emailError,
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

