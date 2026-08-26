"use client";

import React, { useState, useEffect, useRef } from "react";
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

  // ─── Timer refs (never stale, no closure issues) ─────────────────────────────
  // workSecondsRef  : live counter of net worked seconds (source of truth for display)
  // breakSecondsRef : live counter of current break seconds
  // isOnBreakRef    : mirror of isOnBreak state — readable inside setInterval without stale closure
  // timerRef        : the single running interval ID
  const workSecondsRef = useRef(0);
  const breakSecondsRef = useRef(0);
  const isOnBreakRef = useRef(false);
  const timerRef = useRef(null);

  const lastCheckedDateRef = useRef(typeof window !== "undefined" ? new Date().toDateString() : "");

  const fetchAttendanceStatus = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch("/api/attendance/status");
      if (res.status === 401) {
        window.location.href = "/login";
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

        // If today is a clean new day (neither checked in nor completed today)
        if (!data.checkedIn && !data.hasCompletedToday) {
          workSecondsRef.current = 0;
          breakSecondsRef.current = 0;
          isOnBreakRef.current = false;
          setIsOnBreak(false);
          setHasCompletedBreak(false);
          setBreakStart(null);
          setTotalBreakSeconds(0);
          setCurrentBreakSeconds(0);
          setElapsedSeconds(0);
        } else {
          if (data.hasCompletedBreak || (data.totalBreakSeconds > 0 && !data.isOnBreak)) {
            setHasCompletedBreak(true);
          }
        }

        // ─── Timer / break state — initial load OR session active ──────────────
        if (!isSilent && (data.checkedIn || data.hasCompletedToday)) {
          const onBreak = data.isOnBreak || false;
          const netSeconds = Number(data.netWorkingSeconds ?? data.elapsedSeconds) || 0;
          const breakSec = Number(data.currentBreakSeconds) || 0;

          workSecondsRef.current = netSeconds;
          breakSecondsRef.current = breakSec;
          isOnBreakRef.current = onBreak;

          setElapsedSeconds(netSeconds);
          setCurrentBreakSeconds(breakSec);
          setIsOnBreak(onBreak);
          setBreakStart(data.breakStart || null);
          setTotalBreakSeconds(Number(data.totalBreakSeconds) || 0);
          setHasCompletedBreak(Boolean(data.hasCompletedBreak || (data.totalBreakSeconds > 0 && !onBreak)));
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
        fetchAttendanceStatus(true); // Silent background polling
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

  // ─── SINGLE INTERVAL TIMER ────────────────────────────────────────────────────
  // One interval runs whenever the user is checked in.
  // Every second it reads isOnBreakRef (a ref — never stale) to decide:
  //   - NOT on break → increment workSecondsRef, update elapsedSeconds display
  //   - ON break     → increment breakSecondsRef, update currentBreakSeconds display
  // Because we use refs for arithmetic and state only for display, there are
  // zero race conditions between handleToggleBreak and the interval.
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

    timerRef.current = setInterval(() => {
      if (isOnBreakRef.current) {
        breakSecondsRef.current += 1;
        setCurrentBreakSeconds(breakSecondsRef.current);
      } else {
        workSecondsRef.current += 1;
        setElapsedSeconds(workSecondsRef.current);
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [checkedIn]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    setNotice({ error: "", success: "" });
    try {
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to check in.", success: "" });
        if (data.hasCompletedToday) setHasCompletedToday(true);
      } else {
        setCheckedIn(true);
        // Reset all timer refs for the fresh session
        workSecondsRef.current = 0;
        breakSecondsRef.current = 0;
        isOnBreakRef.current = false;
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
          success: `Check-in recorded at ${new Date(data.checkInTime).toLocaleTimeString()} (PostgreSQL Server Timestamp)`,
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
  //   1. isOnBreakRef flips to true  → the running interval immediately stops
  //      touching workSecondsRef and starts counting breakSecondsRef instead.
  //   2. No need to "save" a frozen value — workSecondsRef IS the frozen value.
  //   3. setIsOnBreak(true) syncs React state for UI rendering.
  //
  // END:
  //   1. isOnBreakRef flips to false → the running interval immediately resumes
  //      counting workSecondsRef from exactly where it stopped.
  //   2. breakSecondsRef resets to 0 for the next display.
  //   3. No server fetch — the 15s background poll handles eventual sync.
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
      // Flip the ref FIRST — the interval reads this immediately on next tick
      isOnBreakRef.current = true;
      breakSecondsRef.current = 0;
      // Sync React state for UI
      setIsOnBreak(true);
      setBreakStart(new Date().toISOString());
      setCurrentBreakSeconds(0);
      // workSecondsRef is untouched — timer just stops adding to it
    } else {
      // Flip the ref FIRST — the interval resumes working seconds immediately
      isOnBreakRef.current = false;
      breakSecondsRef.current = 0;
      // Sync React state for UI
      setIsOnBreak(false);
      setElapsedSeconds(workSecondsRef.current); // display catches up to ref
      setCurrentBreakSeconds(0);
      setHasCompletedBreak(true);
      setBreakStart(null);
    }

    try {
      const res = await fetch("/api/attendance/break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionType }),
      });

      if (res.status === 401) { window.location.href = "/login"; return; }

      const data = await res.json();

      if (!res.ok) {
        // Rollback refs and state
        isOnBreakRef.current = prevIsOnBreak;
        workSecondsRef.current = prevWorkSeconds;
        breakSecondsRef.current = prevBreakSeconds;
        setIsOnBreak(prevIsOnBreak);
        setBreakStart(prevBreakStart);
        setTotalBreakSeconds(prevTotalBreakSeconds);
        setHasCompletedBreak(prevHasCompletedBreak);
        setElapsedSeconds(prevWorkSeconds);
        setNotice({ error: data.message || "Failed to update break status.", success: "" });
      } else {
        // Server confirmed — sync total break seconds and net working seconds (authoritative)
        if ((actionType === "END" || actionType === "FINISH") && data.totalBreakSeconds !== undefined) {
          setTotalBreakSeconds(Number(data.totalBreakSeconds) || 0);
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
      workSecondsRef.current = prevWorkSeconds;
      breakSecondsRef.current = prevBreakSeconds;
      setIsOnBreak(prevIsOnBreak);
      setBreakStart(prevBreakStart);
      setTotalBreakSeconds(prevTotalBreakSeconds);
      setHasCompletedBreak(prevHasCompletedBreak);
      setElapsedSeconds(prevWorkSeconds);
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
      const res = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reasonText }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
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

  // SVG Circular Ring Dimensions for Hero Clock
  const circleRadius = 90;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - progressRatio * circleCircumference;

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
                <span>⚡</span> Real-Time Shift Counter
              </h3>
              <p className="text-xs text-slate-500">Standard working time: {dailyTargetHours.toFixed(2)} Hours</p>
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
            <div className="space-y-6">
              {/* Central Clock Display with SVG Circular Ring */}
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <div className="relative w-48 h-48 md:w-56 md:h-56 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 200 200">
                    <circle
                      cx="100"
                      cy="100"
                      r={circleRadius}
                      className="stroke-sky-50"
                      strokeWidth="10"
                      fill="transparent"
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r={circleRadius}
                      className={`transition-all duration-1000 ease-out ${isOnBreak
                        ? "stroke-amber-500 opacity-80"
                        : checkedIn
                          ? "stroke-emerald-500"
                          : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                            ? "stroke-rose-500"
                            : "stroke-sky-500"
                        }`}
                      strokeWidth="10"
                      strokeDasharray={circleCircumference}
                      strokeDashoffset={checkedIn || hasCompletedToday ? strokeDashoffset : circleCircumference}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                    {checkedIn ? (
                      <>
                        <span className={`text-xl md:text-3xl font-mono font-black tracking-wider ${isOnBreak ? "text-amber-700" : "text-emerald-700"}`}>
                          {formatSecondsToHHMMSS(elapsedSeconds)}
                        </span>
                        <span className={`text-xs font-bold mt-1 ${isOnBreak ? "text-amber-800" : "text-emerald-800"}`}>
                          {runtimeDecimal} / {dailyTargetHours.toFixed(1)} hrs
                        </span>
                        {isOnBreak ? (
                          <span className="mt-2 px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-mono font-bold uppercase tracking-wider animate-pulse">
                            Timer Paused
                          </span>
                        ) : (
                          <span className="mt-2 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold uppercase tracking-wider">
                            {progressPercentInt}% Shift
                          </span>
                        )}
                      </>
                    ) : hasCompletedToday ? (
                      <>
                        <span className={`text-3xl font-black font-mono ${isLop || approvalStatus === "REJECTED"
                          ? "text-rose-700"
                          : approvalStatus === "PENDING"
                            ? "text-amber-700"
                            : "text-sky-700"
                          }`}>
                          {totalWorkingHoursToday.toFixed(2)}
                        </span>
                        <span className="text-xs font-bold text-slate-700">/ {dailyTargetHours.toFixed(1)} hrs net</span>
                        <span className={`mt-2 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${isLop || approvalStatus === "REJECTED"
                          ? "bg-rose-100 text-rose-800"
                          : approvalStatus === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-sky-100 text-sky-800"
                          }`}>
                          {approvalStatus === "PENDING"
                            ? "Pending Approval"
                            : isLop || approvalStatus === "REJECTED"
                              ? "Loss of Pay"
                              : "Approved"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl mb-2 text-sky-400">⏱️</span>
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Ready to Check In</span>
                        <span className="text-[10px] text-slate-400 mt-1">{dailyTargetHours} Hours Shift Target</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-center space-y-1">
                  {isOnBreak ? (
                    <p className="text-xs font-semibold text-amber-700">
                      Shift timer stopped for Lunch Break. Break Duration: <span className="font-mono text-amber-800 font-bold">{formatSecondsToHHMMSS(currentBreakSeconds)}</span>
                    </p>
                  ) : checkedIn ? (
                    <p className="text-xs font-semibold text-emerald-700">
                      Check-in timestamp: <span className="font-mono">{new Date(checkInTime).toLocaleTimeString()}</span>
                      {totalBreakSeconds > 0 && <span className="block text-[11px] text-amber-700">Lunch Break Deducted: {formatSecondsToHHMMSS(totalBreakSeconds)}</span>}
                    </p>
                  ) : hasCompletedToday ? (
                    <p className="text-xs font-semibold text-sky-800">
                      Check-In: <span className="font-mono">{checkInTime ? new Date(checkInTime).toLocaleTimeString() : "—"}</span> | Check-Out: <span className="font-mono">{checkOutTime ? new Date(checkOutTime).toLocaleTimeString() : "—"}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Postgres server time will be captured upon Check-In</p>
                  )}
                </div>
              </div>

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
                  <div className="space-y-2">
                    {isOnBreak ? (
                      <button
                        type="button"
                        onClick={() => handleToggleBreak("END")}
                        disabled={actionLoading}
                        className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {actionLoading ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span className="text-base">▶</span>
                            <span>Finish Lunch Break (Resume Shift Timer)</span>
                          </>
                        )}
                      </button>
                    ) : (hasCompletedBreak || totalBreakSeconds > 0) ? (
                      <div className="space-y-2">
                        <div className="py-2.5 px-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                          <span>✓</span>
                          <span>Lunch Break Completed for Today (Single break policy)</span>
                        </div>
                        <button
                          type="button"
                          onClick={initiateCheckOut}
                          disabled={actionLoading}
                          className="w-full py-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-bold transition shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span className="text-base">⏹</span>
                          <span>Check Out</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleBreak("START")}
                          disabled={actionLoading || hasCompletedBreak || totalBreakSeconds > 0}
                          className="py-3.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span className="text-base">🍱</span>
                          <span>Start Lunch Break</span>
                        </button>

                        <button
                          type="button"
                          onClick={initiateCheckOut}
                          disabled={actionLoading}
                          className="py-3.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span className="text-base">⏹</span>
                          <span>Check Out</span>
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
                    className={`w-full py-4 rounded-xl text-sm font-bold transition shadow-md flex items-center justify-center gap-2 ${isHoliday
                        ? "bg-purple-50 border border-purple-200 text-purple-700 cursor-not-allowed"
                        : isNonWorkingDay
                          ? "bg-amber-50 border border-amber-200 text-amber-700 cursor-not-allowed"
                          : isOnLeaveToday
                            ? "bg-cyan-50 border border-cyan-200 text-cyan-700 cursor-not-allowed"
                            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                      }`}
                  >
                    {actionLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Fetching PostgreSQL server timestamp…</span>
                      </>
                    ) : isHoliday ? (
                      <>
                        <span className="text-base">🎉</span>
                        <span>COMPANY HOLIDAY — CHECK-IN CLOSED</span>
                      </>
                    ) : isNonWorkingDay ? (
                      <>
                        <span className="text-base">🏝️</span>
                        <span>COMPANY OFF-DAY ({todayDayName?.toUpperCase()}) — CHECK-IN CLOSED</span>
                      </>
                    ) : isOnLeaveToday ? (
                      <>
                        <span className="text-base">✈️</span>
                        <span>ON APPROVED LEAVE — ABSENT TODAY</span>
                      </>
                    ) : (
                      <>
                        <span className="text-base">▶</span>
                        <span>Check In Now (Record Server Time)</span>
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
            <p className="text-xs text-slate-500">Historical single-shift attendance log recorded in PostgreSQL for today</p>
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
                  <th className="py-3 px-4">Check In (PostgreSQL)</th>
                  <th className="py-3 px-4">Check Out (PostgreSQL)</th>
                  <th className="py-3 px-4">Lunch Break Duration</th>
                  <th className="py-3 px-4">Net Working Hours</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100">
                {todayLogs.map((log, idx) => {
                  const checkInMs = new Date(log.check_in).getTime();
                  let checkOutMs;
                  if (log.check_out) {
                    checkOutMs = new Date(log.check_out).getTime();
                  } else if (log.status === "ON_BREAK") {
                    const breakStartIso = log.break_start || log.updated_at || log.check_in;
                    checkOutMs = new Date(breakStartIso).getTime();
                  } else {
                    checkOutMs = checkInMs + Math.max(0, elapsedSeconds * 1000);
                  }
                  const grossSec = Math.max(0, Math.floor((checkOutMs - checkInMs) / 1000));
                  const breakSec = Number(log.total_break_seconds) || 0;
                  const netSec = Math.max(0, grossSec - breakSec);
                  const isActive = log.status === "CHECKED_IN" || log.status === "ON_BREAK";
                  const hoursVal = (!isActive && log.working_hours) ? Number(log.working_hours).toFixed(2) : (netSec / 3600).toFixed(2);

                  return (
                    <tr key={log.id || idx} className="hover:bg-sky-50/50 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-800 font-semibold">
                        {new Date(log.check_in).toLocaleTimeString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {log.check_out ? new Date(log.check_out).toLocaleTimeString() : log.status === "ON_BREAK" ? <span className="text-amber-700 font-bold animate-pulse">On Lunch Break</span> : <span className="text-emerald-700 font-bold">Active Shift</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-amber-700">
                        {formatDurationText(breakSec)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        {hoursVal} hrs
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
