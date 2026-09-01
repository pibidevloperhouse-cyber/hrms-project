"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import AttendanceOverviewCard from "./AttendanceOverviewCard";
import HRAttendanceTracker from "./HRAttendanceTracker";

function formatSecondsToHHMMSS(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00h 00m 00s";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

function formatDurationText(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return "0s";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getDigitsHMS(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return { h: "00", m: "00", s: "00" };
  const sec = Math.round(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (num) => String(num).padStart(2, "0");
  return { h: pad(h), m: pad(m), s: pad(s) };
}

export default function AttendancePage({ userRole }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [hasCompletedToday, setHasCompletedToday] = useState(false);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalWorkingHoursToday, setTotalWorkingHoursToday] = useState(0);
  const [totalCompletedHoursToday, setTotalCompletedHoursToday] = useState(0);
  const [dailyTargetHours, setDailyTargetHours] = useState(8.0);
  const [todayLogs, setTodayLogs] = useState([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  // Live wall-clock for idle (not checked-in) state
  const [liveTime, setLiveTime] = useState(() => new Date());

  // Lunch break state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [hasCompletedBreak, setHasCompletedBreak] = useState(false);
  const [breakStart, setBreakStart] = useState(null);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(0);
  const [currentBreakSeconds, setCurrentBreakSeconds] = useState(0);

  // Early check-out approval states
  const [approvalStatus, setApprovalStatus] = useState("APPROVED");
  const [earlyReason, setEarlyReason] = useState("");
  const [isLop, setIsLop] = useState(false);
  const [hrFeedback, setHrFeedback] = useState("");

  // Early check-out reason modal state
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reasonInput, setReasonInput] = useState("");
  const [modalError, setModalError] = useState("");

  // Holiday state for today
  const [isHoliday, setIsHoliday] = useState(false);
  const [holidayTitle, setHolidayTitle] = useState("");
  const [holidayType, setHolidayType] = useState("");

  // Non-working day / Company Off-Day state
  const [isNonWorkingDay, setIsNonWorkingDay] = useState(false);
  const [todayDayName, setTodayDayName] = useState("");

  // Approved Leave state for today
  const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);
  const [leaveTypeToday, setLeaveTypeToday] = useState("");
  const [leaveReasonToday, setLeaveReasonToday] = useState("");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState({ error: "", success: "" });

  // ─── Timer refs (never stale, wall-clock timestamp anchored) ─────────────────
  const checkInTimeRef = useRef(null);
  const breakStartRef = useRef(null);
  const totalBreakSecondsRef = useRef(0);
  const isOnBreakRef = useRef(false);
  const workSecondsRef = useRef(0);
  const breakSecondsRef = useRef(0);
  const timerRef = useRef(null);

  const lastCheckedDateRef = useRef(typeof window !== "undefined" ? new Date().toDateString() : "");

  const fetchAttendanceStatus = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch("/api/attendance/status", { headers });
      if (res.status === 401) {
        return;
      }
      if (res.ok) {
        const data = await res.json();

        // ─── Metadata — safe to update every poll ─────────────────────────────
        setCheckedIn(data.checkedIn);
        setHasCompletedToday(data.hasCompletedToday || false);
        setCheckInTime(data.checkInTime);
        setCheckOutTime(data.checkOutTime || null);
        setTotalWorkingHoursToday(data.totalWorkingHoursToday || 0);
        setTotalCompletedHoursToday(data.totalCompletedHoursToday || 0);
        if (data.dailyTargetHours) {
          setDailyTargetHours(Number(data.dailyTargetHours) || 8.0);
        }
        setTodayLogs(data.todayLogs || []);
        setApprovalStatus(data.approvalStatus || (data.status === "PENDING_APPROVAL" ? "PENDING" : data.status === "REJECTED_LOP" ? "REJECTED" : "APPROVED"));
        setEarlyReason(data.earlyReason || "");
        setIsLop(data.isLop || data.status === "REJECTED_LOP");
        setHrFeedback(data.hrFeedback || "");
        setIsHoliday(Boolean(data.isHoliday));
        setHolidayTitle(data.holidayTitle || "");
        setHolidayType(data.holidayType || "");
        setIsNonWorkingDay(Boolean(data.isNonWorkingDay));
        setTodayDayName(data.todayDayName || "");
        setIsOnLeaveToday(Boolean(data.isOnLeave));
        setLeaveTypeToday(data.leaveType || "");
        setLeaveReasonToday(data.leaveReason || "");

        // ─── Timer & Break State Synchronization (Authoritative) ─────────────
        if (data.checkedIn) {
          const onBreak = Boolean(data.isOnBreak);
          const breakStartIso = data.breakStart || null;
          const totalBreakSec = Number(data.totalBreakSeconds) || 0;
          const netSec = Number(data.netWorkingSeconds ?? data.elapsedSeconds) || 0;
          const breakSec = Number(data.currentBreakSeconds) || 0;

          checkInTimeRef.current = data.checkInTime;
          breakStartRef.current = breakStartIso;
          totalBreakSecondsRef.current = totalBreakSec;
          isOnBreakRef.current = onBreak;
          workSecondsRef.current = netSec;
          breakSecondsRef.current = breakSec;

          setIsOnBreak(onBreak);
          setBreakStart(breakStartIso);
          setTotalBreakSeconds(totalBreakSec);
          setCurrentBreakSeconds(breakSec);
          setElapsedSeconds(netSec);
          setHasCompletedBreak(Boolean(data.hasCompletedBreak || (totalBreakSec > 0 && !onBreak)));
        } else if (data.hasCompletedToday) {
          checkInTimeRef.current = data.checkInTime || null;
          breakStartRef.current = null;
          isOnBreakRef.current = false;
          setIsOnBreak(false);
          setBreakStart(null);
          setTotalBreakSeconds(Number(data.totalBreakSeconds) || 0);
          setHasCompletedBreak(Boolean(data.totalBreakSeconds > 0));
          const totalSec = Math.round(Number(data.workingHours || 0) * 3600);
          workSecondsRef.current = totalSec;
          setElapsedSeconds(totalSec);
        } else {
          // If today is a clean new day (neither checked in nor completed today)
          checkInTimeRef.current = null;
          breakStartRef.current = null;
          totalBreakSecondsRef.current = 0;
          isOnBreakRef.current = false;
          workSecondsRef.current = 0;
          breakSecondsRef.current = 0;
          setIsOnBreak(false);
          setHasCompletedBreak(false);
          setBreakStart(null);
          setTotalBreakSeconds(0);
          setCurrentBreakSeconds(0);
          setElapsedSeconds(0);
        }
      }
    } catch (err) {
      console.error("Failed to fetch attendance status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initStatus = async () => {
      await fetchAttendanceStatus(false);
    };
    initStatus();

    const interval = setInterval(() => {
      const currentDateStr = new Date().toDateString();
      if (currentDateStr !== lastCheckedDateRef.current) {
        lastCheckedDateRef.current = currentDateStr;
        fetchAttendanceStatus(false); // Midnight rollover — full refresh
      } else {
        fetchAttendanceStatus(true); // Background polling
      }
    }, 15000);

    const handleUpdate = () => fetchAttendanceStatus(true);
    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, []);

  // ─── WALL-CLOCK ACCURATE LIVE INTERVAL TIMER ─────────────────────────────────
  // Uses authoritative timestamps to compute live elapsed and break seconds.
  // Guarantees zero drift across background tabs, sleep mode, and page switches.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!checkedIn) {
      workSecondsRef.current = 0;
      breakSecondsRef.current = 0;
      setElapsedSeconds(0);
      setCurrentBreakSeconds(0);
      return;
    }

    const updateTimerTick = () => {
      const nowMs = Date.now();
      const checkInMs = checkInTimeRef.current ? new Date(checkInTimeRef.current).getTime() : nowMs;

      if (isOnBreakRef.current) {
        const breakStartMs = breakStartRef.current ? new Date(breakStartRef.current).getTime() : nowMs;
        const currentBreakSec = Math.max(0, Math.floor((nowMs - breakStartMs) / 1000));
        breakSecondsRef.current = currentBreakSec;
        setCurrentBreakSeconds(currentBreakSec);

        // While on break, working time is strictly frozen at the break_start instant
        const grossAtBreak = Math.max(0, Math.floor((breakStartMs - checkInMs) / 1000));
        const frozenNetSec = Math.max(0, grossAtBreak - totalBreakSecondsRef.current);
        workSecondsRef.current = frozenNetSec;
        setElapsedSeconds(frozenNetSec);
      } else {
        // Active shift: net working time = total elapsed wall-clock minus accumulated completed breaks
        const grossSec = Math.max(0, Math.floor((nowMs - checkInMs) / 1000));
        const netSec = Math.max(0, grossSec - totalBreakSecondsRef.current);
        workSecondsRef.current = netSec;
        setElapsedSeconds(netSec);
        breakSecondsRef.current = 0;
      }
    };

    updateTimerTick();
    timerRef.current = setInterval(updateTimerTick, 1000);

    return () => clearInterval(timerRef.current);
  }, [checkedIn]);

  // ─── LIVE WALL-CLOCK (idle state only) ──────────────────────────────────────
  // Shows the current local time inside the ring when not on shift.
  // Stops automatically once checked in (timer takes over) or day is completed.
  useEffect(() => {
    if (checkedIn || hasCompletedToday) return;
    const clockInterval = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, [checkedIn, hasCompletedToday]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    setNotice({ error: "", success: "" });
    try {
      const clientTimeZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers,
        body: JSON.stringify({ timeZone: clientTimeZone }),
      });
      if (res.status === 401) {
        setNotice({ error: "Session expired. Please sign in again.", success: "" });
        return;
      }
      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to check in.", success: "" });
        if (data.hasCompletedToday) setHasCompletedToday(true);
      } else {
        setCheckedIn(true);
        // Anchor refs for the fresh session
        checkInTimeRef.current = data.checkInTime;
        breakStartRef.current = null;
        totalBreakSecondsRef.current = 0;
        isOnBreakRef.current = false;
        workSecondsRef.current = 0;
        breakSecondsRef.current = 0;

        setIsOnBreak(false);
        setHasCompletedBreak(false);
        setBreakStart(null);
        setTotalBreakSeconds(0);
        setCurrentBreakSeconds(0);
        setHasCompletedToday(false);
        setCheckInTime(data.checkInTime);
        setApprovalStatus("APPROVED");
        setEarlyReason("");
        setIsLop(false);
        setElapsedSeconds(0);
        setNotice({
          error: "",
          success: `Check-in recorded at ${new Date(data.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} — Shift timer started.`,
        });
        if (typeof window !== "undefined") window.dispatchEvent(new Event("attendance-updated"));
        await fetchAttendanceStatus(true);
      }
    } catch {
      setNotice({ error: "Network error. Please try again.", success: "" });
    } finally {
      setActionLoading(false);
    }
  };

  // ─── LUNCH BREAK HANDLER ─────────────────────────────────────────────────────
  // START:
  //   1. Sets isOnBreakRef to true & records breakStartRef
  //   2. Live timer immediately pauses working seconds and starts ticking break seconds
  //
  // END:
  //   1. Accurately computes finished break duration and adds to totalBreakSecondsRef
  //   2. Resumes active working seconds from the exact paused value with zero gap
  // ─────────────────────────────────────────────────────────────────────────────
  const handleToggleBreak = async (actionType) => {
    // Hard guard: only one lunch break per day (blocked if break was already taken or completed)
    if (actionType === "START" && (hasCompletedBreak || totalBreakSeconds > 0)) return;

    setActionLoading(true);
    setNotice({ error: "", success: "" });

    // Capture rollback values BEFORE any changes
    const prevIsOnBreak = isOnBreak;
    const prevBreakStart = breakStart;
    const prevTotalBreakSeconds = totalBreakSeconds;
    const prevHasCompletedBreak = hasCompletedBreak;
    const prevWorkSeconds = workSecondsRef.current;
    const prevBreakSeconds = breakSecondsRef.current;

    if (actionType === "START") {
      const nowIso = new Date().toISOString();
      isOnBreakRef.current = true;
      breakStartRef.current = nowIso;
      breakSecondsRef.current = 0;

      setIsOnBreak(true);
      setBreakStart(nowIso);
      setCurrentBreakSeconds(0);
    } else {
      const nowMs = Date.now();
      const breakStartMs = breakStartRef.current ? new Date(breakStartRef.current).getTime() : nowMs;
      const finishedBreakSec = Math.max(1, Math.floor((nowMs - breakStartMs) / 1000));
      const newTotalBreak = totalBreakSecondsRef.current + finishedBreakSec;

      isOnBreakRef.current = false;
      breakStartRef.current = null;
      totalBreakSecondsRef.current = newTotalBreak;
      breakSecondsRef.current = 0;

      setIsOnBreak(false);
      setBreakStart(null);
      setTotalBreakSeconds(newTotalBreak);
      setHasCompletedBreak(true);
      setCurrentBreakSeconds(0);
    }

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch("/api/attendance/break", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: actionType }),
      });

      if (res.status === 401) {
        setNotice({ error: "Session expired. Please sign in again.", success: "" });
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        // Rollback refs and state
        isOnBreakRef.current = prevIsOnBreak;
        breakStartRef.current = prevBreakStart;
        totalBreakSecondsRef.current = prevTotalBreakSeconds;
        workSecondsRef.current = prevWorkSeconds;
        breakSecondsRef.current = prevBreakSeconds;

        setIsOnBreak(prevIsOnBreak);
        setBreakStart(prevBreakStart);
        setTotalBreakSeconds(prevTotalBreakSeconds);
        setHasCompletedBreak(prevHasCompletedBreak);
        setElapsedSeconds(prevWorkSeconds);
        setCurrentBreakSeconds(prevBreakSeconds);
        setNotice({ error: data.message || "Failed to update break status.", success: "" });
      } else {
        if (actionType === "START") {
          const confirmedBreakStart = data.breakStart || data.attendance?.break_start || new Date().toISOString();
          breakStartRef.current = confirmedBreakStart;
          setBreakStart(confirmedBreakStart);
        } else {
          const authoritativeTotalBreak = Number(data.totalBreakSeconds ?? data.attendance?.total_break_seconds) || totalBreakSecondsRef.current;
          totalBreakSecondsRef.current = authoritativeTotalBreak;
          setTotalBreakSeconds(authoritativeTotalBreak);
          if (data.netWorkingSeconds !== undefined) {
            const netSec = Number(data.netWorkingSeconds) || 0;
            workSecondsRef.current = netSec;
            setElapsedSeconds(netSec);
          }
        }
        setNotice({ error: "", success: data.message });
        if (typeof window !== "undefined") window.dispatchEvent(new Event("attendance-updated"));
      }
    } catch {
      // Rollback on network error
      isOnBreakRef.current = prevIsOnBreak;
      breakStartRef.current = prevBreakStart;
      totalBreakSecondsRef.current = prevTotalBreakSeconds;
      workSecondsRef.current = prevWorkSeconds;
      breakSecondsRef.current = prevBreakSeconds;

      setIsOnBreak(prevIsOnBreak);
      setBreakStart(prevBreakStart);
      setTotalBreakSeconds(prevTotalBreakSeconds);
      setHasCompletedBreak(prevHasCompletedBreak);
      setElapsedSeconds(prevWorkSeconds);
      setCurrentBreakSeconds(prevBreakSeconds);
      setNotice({ error: "Network error updating break status.", success: "" });
    } finally {
      setActionLoading(false);
    }
  };

  // Triggers pop-up modal when user clicks Check Out before target working hours
  const initiateCheckOut = () => {
    const runtimeHours = Number((elapsedSeconds / 3600).toFixed(2));
    const totalHours = Number((totalWorkingHoursToday + (checkedIn ? runtimeHours : 0)).toFixed(2));
    if (runtimeHours < dailyTargetHours || totalHours < dailyTargetHours) {
      setReasonInput("");
      setModalError("");
      setShowReasonModal(true);
    } else {
      executeCheckOut(null);
    }
  };

  const executeCheckOut = async (reasonText) => {
    setActionLoading(true);
    setNotice({ error: "", success: "" });
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const clientTimeZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

      const res = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: reasonText, timeZone: clientTimeZone }),
      });
      if (res.status === 401) {
        setNotice({ error: "Session expired. Please sign in again.", success: "" });
        return;
      }
      const data = await res.json();

      if (!res.ok) {
        if (data.requiresReason) {
          setShowReasonModal(true);
          setModalError(data.message);
        } else {
          setNotice({ error: data.message || "Failed to check out.", success: "" });
        }
      } else {
        setShowReasonModal(false);
        setCheckedIn(false);
        setIsOnBreak(false);
        setHasCompletedToday(true);
        setCheckInTime(data.checkInTime);
        setCheckOutTime(data.checkOutTime);
        setElapsedSeconds(0);
        setTotalWorkingHoursToday(data.workingHours || 0);
        setApprovalStatus(data.approvalStatus || (data.isEarly ? "PENDING" : "APPROVED"));
        setEarlyReason(data.earlyReason || reasonText || "");

        if (data.isEarly) {
          setNotice({
            error: "",
            success: `Early Check-Out Recorded (${data.workingHours} hrs, <${dailyTargetHours}h). Reason sent to HR for approval.`,
          });
        } else {
          setNotice({
            error: "",
            success: `Checked out successfully! Net working hours: ${data.durationFormatted || `${data.workingHours} hrs`}`,
          });
        }
        if (typeof window !== "undefined") window.dispatchEvent(new Event("attendance-updated"));
        await fetchAttendanceStatus(true);
      }
    } catch {
      setNotice({ error: "Network error. Please try again.", success: "" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReasonSubmit = (e) => {
    e.preventDefault();
    if (!reasonInput.trim()) {
      setModalError(`Please specify a reason for checking out before ${dailyTargetHours} hours.`);
      return;
    }
    executeCheckOut(reasonInput.trim());
  };

  const runtimeDecimal = (elapsedSeconds / 3600).toFixed(2);
  const currentCumulativeHours = Number(
    (totalCompletedHoursToday + (checkedIn ? Number(runtimeDecimal) : totalWorkingHoursToday)).toFixed(2)
  );
  const targetWorkHours = dailyTargetHours;

  // Real-time progress calculations towards target hours
  const targetSeconds = dailyTargetHours * 3600;
  const totalEffectiveSeconds = checkedIn ? elapsedSeconds : (totalWorkingHoursToday * 3600);
  const progressRatio = Math.min(1.0, Math.max(0, totalEffectiveSeconds / targetSeconds));
  const progressPercentInt = Math.min(100, Math.round(progressRatio * 100));

  // SVG circle constants removed — now using rectangular progress bar

  const isHR = ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(userRole);

  return (
    <div className="space-y-6 animate-fadeIn relative">
      {/* Top Banner Header */}
      <div className="relative rounded-2xl bg-gradient-to-r from-sky-600 via-sky-700 to-indigo-800 border border-sky-200 p-6 md:p-8 overflow-hidden shadow-md">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-100 text-[10px] font-bold uppercase tracking-wider border border-emerald-300/30 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
              Company Working Standard: {dailyTargetHours} Hours
            </div>
            <h1 className="text-xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <span>⏱️</span> Attendance & Working Hours
            </h1>
            <p className="mt-1.5 text-xs md:text-sm text-sky-100/90 max-w-xl">
              Overall company working time is {dailyTargetHours} hours. Start Lunch Break pauses active work time.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20">
            <div className="text-right">
              <p className="text-[10px] text-sky-100/80 font-bold uppercase">Status</p>
              <p
                className={`text-xs font-bold ${isOnBreak
                  ? "text-amber-200"
                  : checkedIn
                    ? "text-emerald-200"
                    : hasCompletedToday && approvalStatus === "PENDING"
                      ? "text-amber-200"
                      : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                        ? "text-rose-200"
                        : hasCompletedToday
                          ? "text-sky-100"
                          : "text-sky-200/80"
                  }`}
              >
                {isOnBreak
                  ? "🍱 ON LUNCH BREAK (PAUSED)"
                  : checkedIn
                    ? "● ON DUTY"
                    : hasCompletedToday && approvalStatus === "PENDING"
                      ? "⌛ PENDING HR APPROVAL"
                      : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                        ? "✖ REJECTED (LOP)"
                        : hasCompletedToday
                          ? "✓ COMPLETED TODAY"
                          : "○ OFF DUTY"}
              </p>
            </div>
            <div
              className={`w-3 h-3 rounded-full ${isOnBreak
                ? "bg-amber-300 animate-pulse"
                : checkedIn
                  ? "bg-emerald-300 animate-pulse"
                  : hasCompletedToday && approvalStatus === "PENDING"
                    ? "bg-amber-300 animate-pulse"
                    : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                      ? "bg-rose-300"
                      : hasCompletedToday
                        ? "bg-sky-200"
                        : "bg-sky-400/60"
                }`}
            />
          </div>
        </div>
      </div>

      {/* Holiday Notification Banner */}
      {isHoliday && (
        <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0">🎉</span>
            <div>
              <span className="font-extrabold text-purple-900 text-sm block">Official Company Holiday Today: &quot;{holidayTitle}&quot; ({holidayType || "Paid Holiday"})</span>
              <p className="text-purple-700 font-normal mt-0.5">Check-in process is disabled today for all employees in accordance with company policy.</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-[10px] font-mono font-bold uppercase tracking-wider border border-purple-200 shrink-0">
            Check-In Closed
          </span>
        </div>
      )}

      {/* Approved Leave Notification Banner */}
      {isOnLeaveToday && !checkedIn && (
        <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0">✈️</span>
            <div>
              <span className="font-extrabold text-cyan-900 text-sm block">Status Today: Absent (Approved Leave — {leaveTypeToday})</span>
              <p className="text-cyan-700 font-normal mt-0.5">Your leave request was approved by HR. You are credited with 8.0 hours standard leave time.</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-cyan-100 text-cyan-800 text-[10px] font-mono font-bold uppercase tracking-wider border border-cyan-200 shrink-0">
            Approved Leave
          </span>
        </div>
      )}

      {/* HR Staff Attendance Tracking Inbox (Visible to HR & Admins) */}
      {isHR && <HRAttendanceTracker />}

      {/* Main Punch Clock Hero Card & Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Giant Punch Clock Hero Card */}
        <div className="lg:col-span-2 bg-white border border-sky-100 rounded-2xl p-6 md:p-8 flex flex-col justify-between space-y-6 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-sky-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🕐</span> Live Shift Timer
              </h3>
              <p className="text-xs text-slate-500">Shift target: {dailyTargetHours.toFixed(2)} hours per working day</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${isOnBreak
                ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                : checkedIn
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse"
                  : hasCompletedToday && approvalStatus === "PENDING"
                    ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                    : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : hasCompletedToday
                        ? "bg-sky-50 text-sky-700 border-sky-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
            >
              {isOnBreak
                ? "LUNCH BREAK (PAUSED)"
                : checkedIn
                  ? "ACTIVE SHIFT"
                  : hasCompletedToday && approvalStatus === "PENDING"
                    ? `PENDING HR APPROVAL (<${dailyTargetHours}h)`
                    : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                      ? "REJECTED (LOSS OF PAY)"
                      : hasCompletedToday
                        ? "ATTENDANCE COMPLETED"
                        : "SHIFT INACTIVE"}
            </span>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
              <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Fetching server status…</span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* ── REAL-TIME DIGITAL SHIFT CONSOLE (LIGHT THEME MATCHING APP BACKGROUND) ── */}
              {(() => {
                let digits = { h: "00", m: "00", s: "00" };
                let modeLabel = "Ready to Clock In";
                let modeIcon = "○";
                let statusBadgeClass = "bg-slate-100 text-slate-700 border-slate-200";
                let secondColor = "text-sky-600";
                let containerTheme = "from-sky-50/80 via-white to-sky-50/40 border-sky-200/90";
                let tileBorder = "border-sky-200/80 bg-white";
                let tileShadow = "shadow-xs";

                if (isOnBreak) {
                  digits = getDigitsHMS(currentBreakSeconds);
                  modeLabel = "Lunch Break (Shift Paused)";
                  modeIcon = "⏸";
                  statusBadgeClass = "bg-amber-50 text-amber-800 border-amber-200 animate-pulse";
                  secondColor = "text-amber-600";
                  containerTheme = "from-amber-50/80 via-white to-amber-50/30 border-amber-200";
                  tileBorder = "border-amber-200 bg-white";
                } else if (checkedIn) {
                  digits = getDigitsHMS(elapsedSeconds);
                  modeLabel = "Active Shift in Progress";
                  modeIcon = "●";
                  statusBadgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200 animate-pulse";
                  secondColor = "text-emerald-600";
                  containerTheme = "from-emerald-50/60 via-white to-sky-50/40 border-emerald-200";
                  tileBorder = "border-emerald-200/80 bg-white";
                } else if (hasCompletedToday) {
                  digits = getDigitsHMS(Math.round(totalWorkingHoursToday * 3600));
                  modeLabel = isLop || approvalStatus === "REJECTED" ? "Shift Closed (Loss of Pay)" : approvalStatus === "PENDING" ? "Shift Closed (Awaiting HR)" : "Shift Completed For Today";
                  modeIcon = isLop || approvalStatus === "REJECTED" ? "✖" : approvalStatus === "PENDING" ? "⌛" : "✓";
                  statusBadgeClass = isLop || approvalStatus === "REJECTED" ? "bg-rose-50 text-rose-800 border-rose-200" : approvalStatus === "PENDING" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-sky-50 text-sky-800 border-sky-200";
                  secondColor = isLop || approvalStatus === "REJECTED" ? "text-rose-600" : approvalStatus === "PENDING" ? "text-amber-600" : "text-sky-600";
                  containerTheme = isLop || approvalStatus === "REJECTED" ? "from-rose-50/70 via-white to-rose-50/30 border-rose-200" : "from-sky-50/70 via-white to-sky-50/30 border-sky-200";
                  tileBorder = isLop || approvalStatus === "REJECTED" ? "border-rose-200 bg-white" : "border-sky-200 bg-white";
                } else {
                  digits = {
                    h: String(liveTime.getHours()).padStart(2, "0"),
                    m: String(liveTime.getMinutes()).padStart(2, "0"),
                    s: String(liveTime.getSeconds()).padStart(2, "0"),
                  };
                }

                return (
                  <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${containerTheme} border p-5 sm:p-6 shadow-2xs space-y-5 transition-all duration-300`}>
                    {/* Console Header Bar */}
                    <div className="flex items-center justify-between gap-3 relative z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                          {checkedIn ? "Live Shift Counter" : hasCompletedToday ? "Shift Summary" : "Current Local Time"}
                        </span>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border shadow-2xs ${statusBadgeClass}`}>
                        <span>{modeIcon}</span>
                        <span>{modeLabel}</span>
                      </span>
                    </div>

                    {/* Segmented Digital Clock Readout */}
                    <div className="flex items-center justify-center gap-2 sm:gap-3.5 py-2 relative z-10">
                      {/* Hours Box */}
                      <div className={`${tileBorder} border rounded-2xl px-4 py-3 sm:px-6 sm:py-4 text-center min-w-[72px] sm:min-w-[96px] ${tileShadow}`}>
                        <div className="font-mono text-3xl sm:text-5xl font-black tracking-tight text-slate-900 tabular-nums">
                          {digits.h}
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                          Hours
                        </div>
                      </div>

                      {/* Colon Separator */}
                      <div className="font-mono text-2xl sm:text-4xl font-bold text-sky-400 pb-4 animate-pulse">
                        :
                      </div>

                      {/* Minutes Box */}
                      <div className={`${tileBorder} border rounded-2xl px-4 py-3 sm:px-6 sm:py-4 text-center min-w-[72px] sm:min-w-[96px] ${tileShadow}`}>
                        <div className="font-mono text-3xl sm:text-5xl font-black tracking-tight text-slate-900 tabular-nums">
                          {digits.m}
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                          Minutes
                        </div>
                      </div>

                      {/* Colon Separator */}
                      <div className="font-mono text-2xl sm:text-4xl font-bold text-sky-400 pb-4 animate-pulse">
                        :
                      </div>

                      {/* Seconds Box */}
                      <div className={`${tileBorder} border rounded-2xl px-4 py-3 sm:px-6 sm:py-4 text-center min-w-[72px] sm:min-w-[96px] ${tileShadow}`}>
                        <div className={`font-mono text-3xl sm:text-5xl font-black tracking-tight tabular-nums ${secondColor}`}>
                          {digits.s}
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                          Seconds
                        </div>
                      </div>
                    </div>

                    {/* Telemetry Metrics Strip */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 pt-2 border-t border-sky-100 relative z-10">
                      <div className="bg-white border border-sky-100 rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Check-In</span>
                        <span className="font-mono font-bold text-xs sm:text-sm text-slate-800 mt-0.5 block truncate">
                          {checkInTime ? new Date(checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                      </div>

                      <div className="bg-white border border-sky-100 rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Shift Target</span>
                        <span className="font-mono font-bold text-xs sm:text-sm text-slate-800 mt-0.5 block truncate">
                          {dailyTargetHours.toFixed(1)} hrs
                        </span>
                      </div>

                      <div className="bg-white border border-sky-100 rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Shift Progress</span>
                        <span className="font-mono font-bold text-xs sm:text-sm text-emerald-600 mt-0.5 block truncate">
                          {checkedIn || hasCompletedToday ? `${progressPercentInt}% (${runtimeDecimal}h)` : "0%"}
                        </span>
                      </div>
                    </div>

                    {/* Slim Linear Progress Bar */}
                    <div className="space-y-1.5 pt-1 relative z-10">
                      <div className="w-full h-2.5 bg-sky-100/80 rounded-full overflow-hidden border border-sky-200/60">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${
                            isOnBreak
                              ? "bg-amber-400"
                              : checkedIn
                                ? "bg-gradient-to-r from-sky-500 via-teal-500 to-emerald-500"
                                : hasCompletedToday
                                  ? isLop || approvalStatus === "REJECTED" ? "bg-rose-500" : "bg-sky-600"
                                  : "bg-slate-300"
                          }`}
                          style={{ width: `${checkedIn || hasCompletedToday ? progressPercentInt : 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                        <span>
                          {checkedIn
                            ? `Net Logged: ${runtimeDecimal} hrs`
                            : hasCompletedToday
                              ? `Total: ${totalWorkingHoursToday.toFixed(2)} hrs`
                              : "Timer starts upon Check-In"}
                        </span>
                        {totalBreakSeconds > 0 && (
                          <span className="text-amber-700 font-semibold">
                            Lunch: {formatSecondsToHHMMSS(totalBreakSeconds)}
                          </span>
                        )}
                        <span>{dailyTargetHours}h standard</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Loss of Pay Banner */}
              {hasCompletedToday && (approvalStatus === "REJECTED" || isLop) && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-700">
                    <span>⚠️</span> HR Decision: Loss of Pay (LOP) Applied
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    Your early check-out request (8h) was rejected by HR. Marked as Loss of Pay.
                    {hrFeedback && <span className="block mt-1 italic text-slate-700">Note: "{hrFeedback}"</span>}
                  </p>
                </div>
              )}

              {/* Pending HR Approval Banner */}
              {hasCompletedToday && approvalStatus === "PENDING" && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-700">
                    <span>⌛</span> HR Approval Pending
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    Early check-out note delivered to HR. Pending HR review and decision.
                    {earlyReason && <span className="block mt-1 italic text-amber-800">Your Reason: "{earlyReason}"</span>}
                  </p>
                </div>
              )}

              {/* Feedback Notices */}
              {notice.error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center font-medium">
                  {notice.error}
                </div>
              )}
              {notice.success && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs text-center font-medium">
                  {notice.success}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2">
                {checkedIn ? (
                  <div className="space-y-3">
                    {isOnBreak ? (
                      /* Resuming Shift from Lunch Break (Teal Theme with Resume Icon) */
                      <button
                        type="button"
                        onClick={() => handleToggleBreak("END")}
                        disabled={actionLoading}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-500 via-teal-600 to-cyan-700 hover:from-teal-400 hover:via-teal-500 hover:to-cyan-600 text-white text-sm font-bold transition-all duration-200 shadow-md shadow-teal-500/25 hover:shadow-teal-500/40 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                      >
                        {actionLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Resuming shift…</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="tracking-wide">Finish Lunch Break &amp; Resume Shift</span>
                          </>
                        )}
                      </button>
                    ) : (hasCompletedBreak || totalBreakSeconds > 0) ? (
                      /* Break completed today, only Check Out available (Blue Theme) */
                      <div className="space-y-2.5">
                        <div className="py-2.5 px-3 rounded-xl bg-teal-50/80 border border-teal-200 text-teal-800 text-xs font-semibold text-center flex items-center justify-center gap-2">
                          <svg className="w-4 h-4 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Lunch break logged ({formatSecondsToHHMMSS(totalBreakSeconds)}) · Single daily break policy</span>
                        </div>
                        <button
                          type="button"
                          onClick={initiateCheckOut}
                          disabled={actionLoading}
                          className="w-full py-4 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 hover:from-sky-500 hover:via-blue-500 hover:to-indigo-600 text-white text-sm font-bold transition-all duration-200 shadow-md shadow-blue-500/25 hover:shadow-blue-500/40 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                        >
                          {actionLoading ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Processing check out…</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                              </svg>
                              <span className="tracking-wide">Check Out</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      /* Active shift: Start Lunch Break (Teal Theme with Timer Icon) & Check Out (Blue Theme) */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleBreak("START")}
                          disabled={actionLoading || hasCompletedBreak || totalBreakSeconds > 0}
                          className="py-4 rounded-2xl bg-gradient-to-r from-teal-500 via-teal-600 to-cyan-700 hover:from-teal-400 hover:via-teal-500 hover:to-cyan-600 text-white text-sm font-bold transition-all duration-200 shadow-md shadow-teal-500/20 hover:shadow-teal-500/35 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                        >
                          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="tracking-wide">Start Lunch Break</span>
                        </button>

                        <button
                          type="button"
                          onClick={initiateCheckOut}
                          disabled={actionLoading}
                          className="py-4 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 hover:from-sky-500 hover:via-blue-500 hover:to-indigo-600 text-white text-sm font-bold transition-all duration-200 shadow-md shadow-blue-500/20 hover:shadow-blue-500/35 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                        >
                          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          <span className="tracking-wide">Check Out</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : hasCompletedToday ? (
                  <div className="p-4 rounded-xl bg-sky-50/50 border border-sky-200 text-center space-y-1">
                    <p className={`text-xs font-bold flex items-center justify-center gap-1.5 ${isLop ? "text-rose-700" : approvalStatus === "PENDING" ? "text-amber-700" : "text-sky-800"
                      }`}>
                      <span>{isLop ? "✖" : approvalStatus === "PENDING" ? "⌛" : "✓"}</span>
                      <span>
                        {isLop
                          ? "Attendance Completed (Loss of Pay)"
                          : approvalStatus === "PENDING"
                            ? "Early Check-Out Awaiting HR Approval"
                            : "Attendance Completed For Today"}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Single daily check-in rule enforced. Net working hours locked.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCheckIn}
                    disabled={actionLoading || isHoliday || isOnLeaveToday || isNonWorkingDay}
                    className={`w-full rounded-2xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-3 relative overflow-hidden group ${
                      isHoliday
                        ? "py-4 bg-purple-50 border border-purple-200 text-purple-700 cursor-not-allowed"
                        : isNonWorkingDay
                          ? "py-4 bg-amber-50 border border-amber-200 text-amber-700 cursor-not-allowed"
                          : isOnLeaveToday
                            ? "py-4 bg-cyan-50 border border-cyan-200 text-cyan-700 cursor-not-allowed"
                            : "py-5 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 hover:from-emerald-400 hover:via-emerald-500 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 cursor-pointer disabled:opacity-60 active:scale-[0.98]"
                    }`}
                  >
                    {/* Subtle shimmer overlay for active state */}
                    {!isHoliday && !isNonWorkingDay && !isOnLeaveToday && (
                      <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out pointer-events-none" />
                    )}
                    {actionLoading ? (
                      <>
                        <span className="w-5 h-5 border-2 border-white/60 border-t-white rounded-full animate-spin shrink-0" />
                        <span className="tracking-wide">Starting your shift…</span>
                      </>
                    ) : isHoliday ? (
                      <>
                        <span className="text-base shrink-0">🎉</span>
                        <span>Company Holiday — Check-In Closed</span>
                      </>
                    ) : isNonWorkingDay ? (
                      <>
                        <span className="text-base shrink-0">🏝️</span>
                        <span>Off Day ({todayDayName}) — No Shift Today</span>
                      </>
                    ) : isOnLeaveToday ? (
                      <>
                        <span className="text-base shrink-0">✈️</span>
                        <span>On Approved Leave Today</span>
                      </>
                    ) : (
                      <>
                        {/* Fingerprint / Check-In icon */}
                        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.657-1.343-3-3-3S6 9.343 6 11v2a6 6 0 0012 0v-1a9 9 0 00-9-9" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0 0a3 3 0 01-3-3m3 3a3 3 0 003-3" />
                        </svg>
                        <span className="tracking-wide text-base">Start My Shift</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side Summary Stats Cards Column */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="bg-white border border-sky-100 rounded-2xl p-6 space-y-4 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-sky-100 pb-3">
              Daily Hours Summary (Net Working Time)
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-500 font-semibold">Daily Shift Target ({dailyTargetHours} hrs)</span>
                  <span className="font-bold text-slate-900 font-mono">{currentCumulativeHours} / {dailyTargetHours.toFixed(2)} hrs</span>
                </div>
                <div className="w-full h-3 bg-sky-50 rounded-full overflow-hidden border border-sky-100">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${isOnBreak
                      ? "bg-amber-400 opacity-80"
                      : "bg-gradient-to-r from-sky-500 to-emerald-500"
                      }`}
                    style={{ width: `${progressPercentInt}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 text-right">{progressPercentInt}% of target shift completed</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-sky-50/40 border border-sky-100 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Check-In Time</span>
                  <p className="text-xs font-mono font-bold text-slate-800">
                    {checkInTime ? new Date(checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </p>
                </div>

                <div className="p-3 bg-sky-50/40 border border-sky-100 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Net Working Hours</span>
                  <p className="text-xs font-mono font-bold text-emerald-700">
                    {currentCumulativeHours.toFixed(2)} hrs
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Org Presence Card */}
          <AttendanceOverviewCard />
        </div>
      </div>

      {/* Today's Punch History Logs Table */}
      <div className="bg-white border border-sky-100 rounded-2xl p-6 space-y-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-sky-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>📋</span> Today's Shift Record
            </h3>
            <p className="text-xs text-slate-500">Single-shift attendance log for today including break and net working hours</p>
          </div>
          <span className="px-2.5 py-0.5 rounded-md bg-sky-50 text-slate-600 text-[10px] font-mono border border-sky-100">
            {todayLogs.length} Record
          </span>
        </div>

        {todayLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <p className="text-3xl">⏱️</p>
            <p className="text-xs text-slate-500">No check-in log recorded for today yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-sky-100 text-sky-900 text-[10px] font-bold uppercase tracking-wider bg-sky-50/50">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Check In</th>
                  <th className="py-3 px-4">Check Out</th>
                  <th className="py-3 px-4">Lunch Break Duration</th>
                  <th className="py-3 px-4">Net Working Hours</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100">
                {todayLogs.map((log, idx) => {
                  const checkInMs = new Date(log.check_in).getTime();
                  const isActive = log.status === "CHECKED_IN" || log.status === "ON_BREAK";
                  let displayBreakSec = Number(log.total_break_seconds) || 0;
                  let displayWorkHours = "0.00";

                  if (log.status === "ON_BREAK") {
                    const ongoingBreakSec = isOnBreak ? currentBreakSeconds : 0;
                    displayBreakSec += ongoingBreakSec;
                    displayWorkHours = (elapsedSeconds / 3600).toFixed(2);
                  } else if (log.status === "CHECKED_IN") {
                    displayWorkHours = (elapsedSeconds / 3600).toFixed(2);
                  } else {
                    displayWorkHours = Number(log.working_hours || 0).toFixed(2);
                  }

                  return (
                    <tr key={log.id || idx} className="hover:bg-sky-50/50 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-800 font-semibold">
                        {new Date(log.check_in).toLocaleTimeString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {log.check_out ? new Date(log.check_out).toLocaleTimeString() : log.status === "ON_BREAK" ? <span className="text-amber-700 font-bold animate-pulse">🍱 On Lunch Break (Paused)</span> : <span className="text-emerald-700 font-bold">Active Shift</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-amber-700">
                        {formatDurationText(displayBreakSec)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        {displayWorkHours} hrs
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${log.status === "ON_BREAK"
                            ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                            : log.status === "CHECKED_IN"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : log.status === "PENDING_APPROVAL"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : log.status === "REJECTED_LOP"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-sky-50 text-sky-700 border-sky-200"
                            }`}
                        >
                          {log.status === "ON_BREAK"
                            ? "🍱 ON LUNCH BREAK"
                            : log.status === "CHECKED_IN"
                              ? "● ON DUTY"
                              : log.status === "PENDING_APPROVAL"
                                ? "⌛ PENDING HR (<8h)"
                                : log.status === "REJECTED_LOP"
                                  ? "✖ LOSS OF PAY"
                                  : "✓ COMPLETED"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- EARLY CHECKOUT REASON POP-UP MODAL --- */}
      {showReasonModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-amber-200 rounded-2xl p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-sky-100 pb-3">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                <span className="text-lg">⏱️</span>
                <span>Early Check-Out Reason Required</span>
              </div>
              <button
                type="button"
                onClick={() => setShowReasonModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-700 space-y-2">
              <p className="leading-relaxed">
                Company standard overall working time is <strong className="text-amber-700">{dailyTargetHours} Hours</strong>. Your net shift duration (deducting lunch break) is <strong className="text-slate-900 font-mono">{runtimeDecimal} hrs</strong>.
              </p>
              <p className="text-slate-500 text-[11px]">
                Please enter a reason for checking out before {dailyTargetHours} hours. This message will be delivered to HR for approval or rejection (Loss of Pay).
              </p>
            </div>

            {modalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleReasonSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Reason for Early Check-Out *
                </label>
                <textarea
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="e.g. Medical emergency / Personal work / Prior approval from manager..."
                  className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-xs text-slate-800 placeholder-sky-400 focus:outline-none focus:border-amber-500 transition"
                  required
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReasonModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-sky-200 text-slate-600 hover:text-slate-900 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/20"
                >
                  {actionLoading ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Submit to HR</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
