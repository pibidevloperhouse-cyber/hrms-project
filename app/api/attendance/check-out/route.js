import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, resolveEmployeeFast } from "@/lib/supabase/authHelper";

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * POST /api/attendance/check-out
 * Records check-out timestamp and calculates total working hours.
 * Enforces 8-hour standard working time: <8 hours requires reason and HR approval.
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
    const { reason } = body;

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

    const isEarly = workingHours < 7.995;

    if (isEarly && (!reason || !reason.trim())) {
      return NextResponse.json(
        {
          message: `Net working time is ${workingHours} hrs after deducting ${breakDurationFormatted} lunch break (under 8 hours). Please provide a reason for early check-out.`,
          requiresReason: true,
          workingHours,
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

    const { data: updatedSession, error: updateErr } = await adminSupabase
      .from("attendance")
      .update(updatePayload)
      .eq("id", activeSession.id)
      .select()
      .single();

    if (updateErr) {
      // If table doesn't have new columns yet, retry basic update
        let fallbackSession = null;
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
          fallbackSession = fbData;
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
          fallbackSession = basicFb;
        }

        return NextResponse.json({
          success: true,
          message: isEarly
            ? "Early check-out recorded. Reason submitted to HR for approval."
            : "Checked out successfully!",
          attendance: fallbackSession,
          checkInTime: activeSession.check_in,
          checkOutTime: checkOutTimeIso,
          workingHours,
          durationFormatted,
          elapsedSeconds,
          isEarly,
          approvalStatus,
          earlyReason: earlyReasonText,
        });
    }

    return NextResponse.json({
      success: true,
      message: isEarly
        ? "Early check-out recorded. Your reason has been delivered to HR for approval."
        : "Checked out successfully!",
      attendance: updatedSession,
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
