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
 * POST /api/attendance/break
 * Start or End Lunch Break for an active shift session.
 * Body: { action: "START" | "END" | "FINISH" }
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Session expired or invalid login. Please log in again.", unauthorized: true }, { status: 401 });
    }

    const body = await req.json();
    const action = (body.action || "").toUpperCase();

    if (!["START", "END", "FINISH"].includes(action)) {
      return NextResponse.json({ message: "Invalid action. Action must be 'START', 'END', or 'FINISH'." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const empRecord = await resolveEmployeeFast(adminSupabase, user);

    if (!empRecord) {
      return NextResponse.json({ message: "Employee profile not found." }, { status: 404 });
    }

    const serverNowIso = new Date().toISOString();
    const serverNowMs = new Date(serverNowIso).getTime();

    if (action === "START") {
      // Find active checked-in session
      const { data: activeSessions, error: findErr } = await adminSupabase
        .from("attendance")
        .select("*")
        .eq("employee_id", empRecord.id)
        .eq("status", "CHECKED_IN")
        .order("check_in", { ascending: false })
        .limit(1);

      if (findErr || !activeSessions || activeSessions.length === 0) {
        return NextResponse.json(
          { message: "No active 'ON DUTY' shift session found to start lunch break." },
          { status: 400 }
        );
      }

      const activeSession = activeSessions[0];

      // Block if employee has already taken a break today (has_taken_break flag or total_break_seconds > 0)
      if (activeSession.has_taken_break === true || (Number(activeSession.total_break_seconds) || 0) > 0) {
        return NextResponse.json(
          { message: "You have already taken your lunch break for today. Only one lunch break is permitted per daily shift." },
          { status: 400 }
        );
      }

      const updatePayload = {
        status: "ON_BREAK",
        break_start: serverNowIso,
        updated_at: serverNowIso,
      };

      const { data: updatedSession, error: updateErr } = await adminSupabase
        .from("attendance")
        .update(updatePayload)
        .eq("id", activeSession.id)
        .select()
        .single();

      if (updateErr) {
        // Fallback if column missing
        if (updateErr.message?.includes("column") || updateErr.code === "42703") {
          const { data: fbSession, error: fbErr } = await adminSupabase
            .from("attendance")
            .update({ status: "ON_BREAK", break_start: serverNowIso, updated_at: serverNowIso })
            .eq("id", activeSession.id)
            .select()
            .single();

          if (fbErr) {
            const { data: fbSession2, error: fbErr2 } = await adminSupabase
              .from("attendance")
              .update({ status: "ON_BREAK", updated_at: serverNowIso })
              .eq("id", activeSession.id)
              .select()
              .single();
            if (fbErr2) throw fbErr2;
            return NextResponse.json({
              success: true,
              message: "Lunch break started. Working hours timer paused.",
              attendance: fbSession2,
              breakStart: serverNowIso,
            });
          }

          return NextResponse.json({
            success: true,
            message: "Lunch break started. Working hours timer paused.",
            attendance: fbSession,
            breakStart: serverNowIso,
          });
        }
        throw updateErr;
      }

      return NextResponse.json({
        success: true,
        message: "Lunch break started. Working hours timer paused.",
        attendance: updatedSession,
        breakStart: serverNowIso,
      });

    } else {
      // action === 'END' or 'FINISH'
      // Primary: find a record with status ON_BREAK
      // Fallback: find a CHECKED_IN record that has break_start set (stuck state recovery)
      let breakSession = null;

      const { data: onBreakSessions, error: findErr1 } = await adminSupabase
        .from("attendance")
        .select("*")
        .eq("employee_id", empRecord.id)
        .eq("status", "ON_BREAK")
        .order("check_in", { ascending: false })
        .limit(1);

      if (!findErr1 && onBreakSessions && onBreakSessions.length > 0) {
        breakSession = onBreakSessions[0];
      } else {
        // Fallback: CHECKED_IN record with a break_start (partially stuck)
        const { data: stuckSessions } = await adminSupabase
          .from("attendance")
          .select("*")
          .eq("employee_id", empRecord.id)
          .eq("status", "CHECKED_IN")
          .not("break_start", "is", null)
          .order("check_in", { ascending: false })
          .limit(1);

        if (stuckSessions && stuckSessions.length > 0) {
          breakSession = stuckSessions[0];
        }
      }

      if (!breakSession) {
        return NextResponse.json(
          { message: "No active lunch break session found to resume from." },
          { status: 400 }
        );
      }
      let breakStartIso = breakSession.break_start;
      if (!breakStartIso) {
        const checkInMs = new Date(breakSession.check_in).getTime();
        const updatedMs = breakSession.updated_at ? new Date(breakSession.updated_at).getTime() : 0;
        if (updatedMs > checkInMs && (serverNowMs - updatedMs) < 14400000) {
          breakStartIso = breakSession.updated_at;
        } else {
          breakStartIso = breakSession.check_in || serverNowIso;
        }
      }
      const breakStartMs = new Date(breakStartIso).getTime();

      const currentBreakSec = Math.max(1, Math.floor((serverNowMs - breakStartMs) / 1000));
      const accumulatedBreakSec = (Number(breakSession.total_break_seconds) || 0) + currentBreakSec;
      const currentBreakFormatted = formatDuration(currentBreakSec);
      const totalBreakFormatted = formatDuration(accumulatedBreakSec);

      const checkInMs = new Date(breakSession.check_in).getTime();
      const grossElapsedSeconds = Math.max(0, Math.floor((serverNowMs - checkInMs) / 1000));
      const netWorkingSeconds = Math.max(0, grossElapsedSeconds - accumulatedBreakSec);

      const updatePayload = {
        status: "CHECKED_IN",
        break_start: null,
        total_break_seconds: accumulatedBreakSec,
        has_taken_break: true,
        updated_at: serverNowIso,
      };

      const { data: updatedSession, error: updateErr } = await adminSupabase
        .from("attendance")
        .update(updatePayload)
        .eq("id", breakSession.id)
        .select()
        .single();

      if (updateErr) {
        if (updateErr.message?.includes("column") || updateErr.code === "42703") {
          const { data: fbSession, error: fbErr } = await adminSupabase
            .from("attendance")
            .update({
              status: "CHECKED_IN",
              break_start: null,
              total_break_seconds: accumulatedBreakSec,
              updated_at: serverNowIso,
            })
            .eq("id", breakSession.id)
            .select()
            .single();

          if (!fbErr) {
            return NextResponse.json({
              success: true,
              message: `Lunch break finished (${currentBreakFormatted}). Active shift timer resumed.`,
              attendance: fbSession,
              breakDurationSeconds: currentBreakSec,
              totalBreakSeconds: accumulatedBreakSec,
              netWorkingSeconds,
              currentBreakFormatted,
              totalBreakFormatted,
            });
          }

          const { data: fbSession2, error: fbErr2 } = await adminSupabase
            .from("attendance")
            .update({ status: "CHECKED_IN", updated_at: serverNowIso })
            .eq("id", breakSession.id)
            .select()
            .single();

          if (fbErr2) throw fbErr2;

          return NextResponse.json({
            success: true,
            message: `Lunch break finished (${currentBreakFormatted}). Active shift timer resumed.`,
            attendance: fbSession2,
            breakDurationSeconds: currentBreakSec,
            totalBreakSeconds: accumulatedBreakSec,
            netWorkingSeconds,
            currentBreakFormatted,
            totalBreakFormatted,
          });
        }
        throw updateErr;
      }

      return NextResponse.json({
        success: true,
        message: `Lunch break finished (${currentBreakFormatted}). Active shift timer resumed.`,
        attendance: updatedSession,
        breakDurationSeconds: currentBreakSec,
        totalBreakSeconds: accumulatedBreakSec,
        netWorkingSeconds,
        currentBreakFormatted,
        totalBreakFormatted,
      });
    }
  } catch (error) {
    console.error("POST /api/attendance/break error:", error);
    return NextResponse.json({ message: error.message || "Failed to update lunch break status." }, { status: 500 });
  }
}
