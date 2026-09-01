import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, resolveEmployeeFast } from "@/lib/supabase/authHelper";
import { transporter } from "@/lib/mail/transporter";
import { buildEarlyCheckOutEmailHTML } from "@/lib/mail/earlyCheckOutEmail";
import { checkAndSendDailySummary } from "@/lib/mail/dailySummaryHelper";

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime12h(dateInput, timeZone = "Asia/Kolkata") {
  if (!dateInput) return "—";
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const tz = timeZone || "Asia/Kolkata";
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

function formatGapDuration(gapSeconds) {
  const hours = Math.floor(gapSeconds / 3600);
  const mins = Math.floor((gapSeconds % 3600) / 60);
  const secs = gapSeconds % 60;
  if (hours > 0 && mins > 0) {
    return `${hours} hr${hours > 1 ? "s" : ""} ${mins} min${mins > 1 ? "s" : ""} short`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} short`;
  }
  if (mins > 0) {
    return `${mins} minute${mins > 1 ? "s" : ""} short`;
  }
  return `${secs} second${secs !== 1 ? "s" : ""} short`;
}

/**
 * POST /api/attendance/check-out
 * Records check-out timestamp and calculates total working hours.
 * Enforces company standard working time: early check-out triggers email notification & requires reason.
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Session expired or invalid login. Please log in again.", unauthorized: true },
        { status: 401 }
      );
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body optional if standard checkout
    }
    const { reason, timeZone: clientTz } = body;
    const timeZone =
      clientTz ||
      req.headers.get("x-timezone") ||
      "Asia/Kolkata";

    const adminSupabase = createAdminClient();
    const empRecord = await resolveEmployeeFast(adminSupabase, user);

    if (!empRecord) {
      return NextResponse.json({ message: "Employee profile not found." }, { status: 404 });
    }

    const { data: activeSessions, error: findErr } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("employee_id", empRecord.id)
      .or("status.eq.CHECKED_IN,status.eq.ON_BREAK")
      .order("check_in", { ascending: false })
      .limit(1);

    if (findErr || !activeSessions || activeSessions.length === 0) {
      return NextResponse.json(
        { message: "No active shift session found to check out from." },
        { status: 400 }
      );
    }

    const activeSession = activeSessions[0];
    const checkOutTimeIso = new Date().toISOString();
    const checkInMs = new Date(activeSession.check_in).getTime();
    const checkOutMs = new Date(checkOutTimeIso).getTime();

    const grossElapsedSeconds = Math.max(1, Math.floor((checkOutMs - checkInMs) / 1000));

    // Deduct accumulated break time + current ongoing break if checked out while ON_BREAK
    let totalBreakSec = Number(activeSession.total_break_seconds) || 0;
    if (activeSession.status === "ON_BREAK") {
      const breakStartIso = activeSession.break_start || activeSession.updated_at || checkOutTimeIso;
      const ongoingBreakSec = Math.max(0, Math.floor((checkOutMs - new Date(breakStartIso).getTime()) / 1000));
      totalBreakSec += ongoingBreakSec;
    }

    const netWorkingSeconds = Math.max(1, grossElapsedSeconds - totalBreakSec);
    const elapsedSeconds = netWorkingSeconds;
    const workingHours = Number((netWorkingSeconds / 3600).toFixed(2));
    const durationFormatted = formatDuration(netWorkingSeconds);
    const breakDurationFormatted = formatDuration(totalBreakSec);

    // Fetch company working hours schedule (default 8.0 hours)
    let companyTargetHours = 8.0;
    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("daily_working_hours")
      .eq("company_id", empRecord.company_id)
      .maybeSingle();

    if (schedData && schedData.daily_working_hours) {
      companyTargetHours = Number(schedData.daily_working_hours) || 8.0;
    }

    const isEarly = workingHours < (companyTargetHours - 0.005);

    if (isEarly && (!reason || !reason.trim())) {
      return NextResponse.json(
        {
          message: `Net working time is ${workingHours} hrs after deducting ${breakDurationFormatted} lunch break (under required ${companyTargetHours} hours). Please provide a reason for early check-out.`,
          requiresReason: true,
          workingHours,
          companyTargetHours,
          totalBreakSec,
          breakDurationFormatted,
        },
        { status: 400 }
      );
    }

    const status = isEarly ? "PENDING_APPROVAL" : "COMPLETED";
    const approvalStatus = isEarly ? "PENDING" : "APPROVED";
    const earlyReasonText = (reason && reason.trim()) ? reason.trim() : null;

    const updatePayload = {
      check_out: checkOutTimeIso,
      working_hours: workingHours,
      total_break_seconds: totalBreakSec,
      break_start: null,
      status: status,
      early_checkout: isEarly || Boolean(earlyReasonText),
      early_reason: earlyReasonText,
      approval_status: approvalStatus,
      updated_at: checkOutTimeIso,
    };

    let finalSession = null;
    const { data: updatedSession, error: updateErr } = await adminSupabase
      .from("attendance")
      .update(updatePayload)
      .eq("id", activeSession.id)
      .select()
      .single();

    if (updateErr) {
      // If table doesn't have new columns yet, retry basic update
      try {
        const { data: fbData } = await adminSupabase
          .from("attendance")
          .update({
            check_out: checkOutTimeIso,
            working_hours: workingHours,
            status: status,
            early_checkout: isEarly || Boolean(earlyReasonText),
            early_reason: earlyReasonText,
            approval_status: approvalStatus,
            updated_at: checkOutTimeIso,
          })
          .eq("id", activeSession.id)
          .select()
          .single();
        finalSession = fbData;
      } catch {
        const { data: basicFb, error: fbErr } = await adminSupabase
          .from("attendance")
          .update({
            check_out: checkOutTimeIso,
            working_hours: workingHours,
            status: status,
            early_reason: earlyReasonText,
            updated_at: checkOutTimeIso,
          })
          .eq("id", activeSession.id)
          .select()
          .single();

        if (fbErr) throw fbErr;
        finalSession = basicFb;
      }
    } else {
      finalSession = updatedSession;
    }

    // Trigger Early Check-Out Email Notification if departing early
    if (isEarly && empRecord.email) {
      const companyName = empRecord.companies?.name || "Company";
      const targetSeconds = Math.round(companyTargetHours * 3600);
      const gapSeconds = Math.max(0, targetSeconds - netWorkingSeconds);
      const timeGapDuration = formatGapDuration(gapSeconds);
      const checkInFormatted = formatTime12h(activeSession.check_in, timeZone);
      const checkOutFormatted = formatTime12h(checkOutTimeIso, timeZone);
      let dateStr = "";
      try {
        dateStr = new Date(checkOutTimeIso).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone,
        });
      } catch {
        dateStr = new Date(checkOutTimeIso).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      const targetEmail = (empRecord.email || user.email || "").trim().toLowerCase();

      if (targetEmail) {
        try {
          const emailHtml = buildEarlyCheckOutEmailHTML({
            employeeName: empRecord.full_name || "Employee",
            companyName,
            checkInTime: checkInFormatted,
            checkOutTime: checkOutFormatted,
            workingHours,
            workingTimeFormatted: durationFormatted,
            targetHours: companyTargetHours,
            timeGapDuration,
            breakDuration: totalBreakSec > 0 ? breakDurationFormatted : null,
            reason: earlyReasonText,
            dateStr,
          });

          await transporter.sendMail({
            from: `"${companyName} HRMS" <${process.env.EMAIL_USER}>`,
            to: targetEmail,
            subject: `🚪 Early Check-Out Notice (${timeGapDuration}) - ${companyName}`,
            html: emailHtml,
          });
          console.log(`⚡ Early check-out email sent to ${targetEmail} (${timeGapDuration}) at ${checkOutFormatted} [${timeZone}]`);
        } catch (mailErr) {
          console.error("❌ Failed to send early check-out email:", mailErr.message);
        }
      }

      // In-app notification record
      try {
        await adminSupabase.from("notifications").insert([
          {
            company_id: empRecord.company_id,
            employee_id: empRecord.id,
            title: "🚪 Early Check-Out Recorded",
            message: `Checked out at ${checkOutFormatted} (${durationFormatted || `${workingHours} hrs`}, ${timeGapDuration} of required ${companyTargetHours} hrs).`,
            is_read: false,
            created_at: checkOutTimeIso,
          },
        ]);
      } catch {
        // Ignore notification table error if optional
      }
    }

    // Check if all working employees have checked out; if so, send daily summary report to HR & Owner in real time
    try {
      const summaryRes = await checkAndSendDailySummary(empRecord.company_id, adminSupabase);
      if (summaryRes?.sent) {
        console.log(`📊 All company employees checked out today. Daily attendance summary sent to HR & Owner (${summaryRes.recipients?.join(", ")}).`);
      }
    } catch (sumErr) {
      console.error("Daily summary report check/send error:", sumErr);
    }

    return NextResponse.json({
      success: true,
      message: isEarly
        ? "Early check-out recorded. Your reason has been delivered to HR for approval."
        : "Checked out successfully!",
      attendance: finalSession,
      checkInTime: activeSession.check_in,
      checkOutTime: checkOutTimeIso,
      workingHours,
      durationFormatted,
      elapsedSeconds,
      isEarly,
      approvalStatus,
      earlyReason: earlyReasonText,
    });
  } catch (error) {
    console.error("POST /api/attendance/check-out error:", error);
    return NextResponse.json({ message: error.message || "Failed to check out." }, { status: 500 });
  }
}

