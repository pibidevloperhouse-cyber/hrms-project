"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api/authFetch";
import HRAttendanceTracker from "./HRAttendanceTracker";
import EmployeeMonthlySummaryTable from "./EmployeeMonthlySummaryTable";
import {
  ClockIcon,
  LogInIcon,
  LogOutIcon,
  CoffeeIcon,
  PauseIcon,
  PlayIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  CalendarIcon,
  SunIcon,
  PlaneIcon,
  TimerIcon,
  FileTextIcon,
  RefreshCwIcon,
  UsersIcon,
  BarChartIcon,
} from "./AttendanceIcons";

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
  const isAdmin = userRole === "ADMIN";
  const [activeViewTab, setActiveViewTab] = useState(userRole === "ADMIN" ? "team-tracker" : "punch-clock"); // "punch-clock" | "team-tracker" | "monthly-summary"
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
  const [liveTime, setLiveTime] = useState(() => (typeof window !== "undefined" ? new Date() : null));

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
  const [infoPopup, setInfoPopup] = useState(null);

  // 5-second auto-dismiss for transient info popup
  useEffect(() => {
    if (!infoPopup) return;
    const t = setTimeout(() => setInfoPopup(null), 5000);
    return () => clearTimeout(t);
  }, [infoPopup]);

  // Live wall-clock ticker for idle state
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);


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
      const res = await authFetch("/api/attendance/status");
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

    // Periodic attendance sync (every 60s) with background pause
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const currentDateStr = new Date().toDateString();
      if (currentDateStr !== lastCheckedDateRef.current) {
        lastCheckedDateRef.current = currentDateStr;
        fetchAttendanceStatus(false); // Midnight rollover — full refresh
      } else {
        fetchAttendanceStatus(true); // Background polling
      }
    }, 60000);

    const handleUpdate = () => {
      fetchAttendanceStatus(true);
    };

    const handleFocusOrOnline = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchAttendanceStatus(true);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
      window.addEventListener("focus", handleFocusOrOnline);
      window.addEventListener("online", handleFocusOrOnline);
      document.addEventListener("visibilitychange", handleFocusOrOnline);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
        window.removeEventListener("focus", handleFocusOrOnline);
        window.removeEventListener("online", handleFocusOrOnline);
        document.removeEventListener("visibilitychange", handleFocusOrOnline);
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

      const res = await authFetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        const formattedCheckIn = new Date(data.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setNotice({
          error: "",
          success: `Check-in recorded at ${formattedCheckIn} — Shift timer started.`,
        });

        if (data.isLate) {
          setInfoPopup({
            type: "warning",
            title: "⏰ Late Check-In Recorded",
            message: `You checked in at ${data.actualCheckInTime || formattedCheckIn}, which is ${data.delayDuration || "delayed"} after the scheduled start time (${data.scheduledStartTime || "09:30 AM"}).`,
          });
        } else {
          setInfoPopup({
            type: "success",
            title: "🟢 Shift Started Successfully",
            message: `Check-in recorded at ${formattedCheckIn}. Have a productive day!`,
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
      const res = await authFetch("/api/attendance/break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const clientTimeZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

      const res = await authFetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const isHR = ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(userRole);
  const canViewMonthlySummary = ["ADMIN", "hr_manager", "hr_executive"].includes(userRole);

  const effectiveViewTab = (!canViewMonthlySummary && activeViewTab === "monthly-summary")
    ? (isAdmin ? "team-tracker" : "punch-clock")
    : activeViewTab;

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

  return (
    <div className="space-y-6 animate-fadeIn relative">
      {/* Holiday Notification Banner */}
      {isHoliday && (
        <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
              <SunIcon className="w-5 h-5" />
            </div>
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
            <div className="w-10 h-10 rounded-xl bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-700 shrink-0">
              <PlaneIcon className="w-5 h-5" />
            </div>
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

      {/* Single Unified Enterprise Card matching EmployeeDocumentManager */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-6 shadow-xs">
        {/* Master Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Attendance &amp; Working Hours
            </h2>
          </div>

          <button
            type="button"
            onClick={() => fetchAttendanceStatus(false)}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-600 transition-colors shadow-2xs cursor-pointer flex items-center justify-center"
            title="Refresh Attendance Status"
          >
            <RefreshCwIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* View Switcher Sub-Tabs for HR/Admins - Unified Single Nav Track */}
        {isHR && (
          <nav className="flex items-center gap-1.5 p-1.5 bg-[#f1f5f9] border border-slate-200/70 rounded-2xl shadow-2xs overflow-x-auto scroll-smooth custom-scroll w-full">
            {!isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  setActiveViewTab("punch-clock");
                  e?.currentTarget?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }}
                className={`flex-1 min-w-max py-3 px-5 sm:px-6 rounded-xl font-['Manrope'] font-bold text-xs sm:text-sm tracking-normal transition-all duration-300 ease-out flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap active:scale-95 ${effectiveViewTab === "punch-clock"
                  ? "bg-brand-gradient text-white shadow-xs shadow-[#1f6fb2]/20 scale-[1.01]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
              >
                <ClockIcon className="w-4 h-4 shrink-0" />
                <span>My Punch Clock</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                setActiveViewTab("team-tracker");
                e?.currentTarget?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
              }}
              className={`flex-1 min-w-max py-3 px-5 sm:px-6 rounded-xl font-['Manrope'] font-bold text-xs sm:text-sm tracking-normal transition-all duration-300 ease-out flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap active:scale-95 ${effectiveViewTab === "team-tracker"
                ? "bg-brand-gradient text-white shadow-xs shadow-[#1f6fb2]/20 scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
            >
              <UsersIcon className="w-4 h-4 shrink-0" />
              <span>Team Attendance Tracker</span>
            </button>

            {canViewMonthlySummary && (
              <button
                type="button"
                onClick={(e) => {
                  setActiveViewTab("monthly-summary");
                  e?.currentTarget?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }}
                className={`flex-1 min-w-max py-3 px-5 sm:px-6 rounded-xl font-['Manrope'] font-bold text-xs sm:text-sm tracking-normal transition-all duration-300 ease-out flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap active:scale-95 ${effectiveViewTab === "monthly-summary"
                  ? "bg-brand-gradient text-white shadow-xs shadow-[#1f6fb2]/20 scale-[1.01]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
              >
                <BarChartIcon className="w-4 h-4 shrink-0" />
                <span>Monthly Summaries</span>
              </button>
            )}
          </nav>
        )}

        {/* TAB 1: PUNCH CLOCK & SHIFT LOGS (FOR EMPLOYEES & HR ONLY) */}
        {!isAdmin && (!isHR || effectiveViewTab === "punch-clock") && (
          <div className="space-y-6 animate-fadeIn">
            {/* Shift & Break Console Inner Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Shift &amp; Break Console
                </h3>
              </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase border ${isOnBreak
              ? "bg-slate-100 text-slate-700 border-slate-200"
              : checkedIn
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : hasCompletedToday && approvalStatus === "PENDING"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : hasCompletedToday
                      ? "bg-sky-50 text-sky-700 border-sky-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
              }`}
          >
            {isOnBreak ? (
              <span>LUNCH BREAK</span>
            ) : checkedIn ? (
              <span>ON DUTY</span>
            ) : hasCompletedToday && approvalStatus === "PENDING" ? (
              <>
                <TimerIcon className="w-3.5 h-3.5" />
                <span>PENDING HR REVIEW</span>
              </>
            ) : hasCompletedToday && (approvalStatus === "REJECTED" || isLop) ? (
              <>
                <XCircleIcon className="w-3.5 h-3.5" />
                <span>REJECTED (LOSS OF PAY)</span>
              </>
            ) : hasCompletedToday ? (
              <>
                <CheckCircleIcon className="w-3.5 h-3.5" />
                <span>SHIFT COMPLETED</span>
              </>
            ) : (
              <>
                <ClockIcon className="w-3.5 h-3.5" />
                <span>OFF DUTY</span>
              </>
            )}
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
              let modeIconNode = null;
              let statusBadgeClass = "bg-slate-100 text-slate-700 border-slate-200";

              if (isOnBreak) {
                digits = getDigitsHMS(currentBreakSeconds);
                modeLabel = "Lunch Break";
                modeIconNode = null;
                statusBadgeClass = "bg-slate-100 text-slate-700 border-slate-200";
              } else if (checkedIn) {
                digits = getDigitsHMS(elapsedSeconds);
                modeLabel = "On Duty";
                modeIconNode = null;
                statusBadgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
              } else if (hasCompletedToday) {
                digits = getDigitsHMS(Math.round(totalWorkingHoursToday * 3600));
                modeLabel = isLop || approvalStatus === "REJECTED" ? "Shift Closed (Loss of Pay)" : approvalStatus === "PENDING" ? "Shift Closed (Awaiting HR)" : "Shift Completed";
                modeIconNode = isLop || approvalStatus === "REJECTED" ? <XCircleIcon className="w-3.5 h-3.5 text-rose-700" /> : approvalStatus === "PENDING" ? <TimerIcon className="w-3.5 h-3.5 text-amber-700" /> : <CheckCircleIcon className="w-3.5 h-3.5 text-sky-700" />;
                statusBadgeClass = isLop || approvalStatus === "REJECTED" ? "bg-rose-50 text-rose-800 border-rose-200" : approvalStatus === "PENDING" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-sky-50 text-sky-800 border-sky-200";
              } else {
                const now = liveTime || new Date();
                digits = {
                  h: String(now.getHours()).padStart(2, "0"),
                  m: String(now.getMinutes()).padStart(2, "0"),
                  s: String(now.getSeconds()).padStart(2, "0"),
                };
              }

              return (
                <div className="relative overflow-hidden rounded-2xl bg-slate-50/60 border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5 transition-all duration-300">
                  {/* Console Header Bar */}
                  <div className="flex items-center justify-between gap-3 relative z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                        {checkedIn ? "Shift Timer" : hasCompletedToday ? "Shift Summary" : "Current Time"}
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border shadow-2xs ${statusBadgeClass}`}>
                      {modeIconNode}
                      <span>{modeLabel}</span>
                    </span>
                  </div>

                  {/* Segmented Digital Clock Readout */}
                  <div className="flex items-center justify-center gap-2 sm:gap-4 py-3 relative z-10">
                    {/* Hours Box */}
                    <div className="border border-slate-200/80 bg-white rounded-2xl px-5 py-4 sm:px-8 sm:py-5 text-center min-w-[80px] sm:min-w-[110px] shadow-2xs">
                      <div className="font-mono text-3xl sm:text-5xl font-black tracking-tight text-slate-900 tabular-nums">
                        {digits.h}
                      </div>
                      <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                        Hours
                      </div>
                    </div>

                    {/* Colon Separator */}
                    <div className="font-mono text-2xl sm:text-4xl font-bold text-slate-300 pb-4">
                      :
                    </div>

                    {/* Minutes Box */}
                    <div className="border border-slate-200/80 bg-white rounded-2xl px-5 py-4 sm:px-8 sm:py-5 text-center min-w-[80px] sm:min-w-[110px] shadow-2xs">
                      <div className="font-mono text-3xl sm:text-5xl font-black tracking-tight text-slate-900 tabular-nums">
                        {digits.m}
                      </div>
                      <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                        Minutes
                      </div>
                    </div>

                    {/* Colon Separator */}
                    <div className="font-mono text-2xl sm:text-4xl font-bold text-slate-300 pb-4">
                      :
                    </div>

                    {/* Seconds Box */}
                    <div className="border border-slate-200/80 bg-white rounded-2xl px-5 py-4 sm:px-8 sm:py-5 text-center min-w-[80px] sm:min-w-[110px] shadow-2xs">
                      <div className="font-mono text-3xl sm:text-5xl font-black tracking-tight text-slate-900 tabular-nums">
                        {digits.s}
                      </div>
                      <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                        Seconds
                      </div>
                    </div>
                  </div>

                  {/* Telemetry Metrics Strip (Check-In and Check-Out) */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/80 relative z-10">
                    <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Check-In</span>
                      <span className="font-mono font-bold text-xs sm:text-sm text-slate-800 mt-0.5 block truncate">
                        {checkInTime ? new Date(checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Check-Out</span>
                      <span className="font-mono font-bold text-xs sm:text-sm text-slate-800 mt-0.5 block truncate">
                        {checkOutTime ? new Date(checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : checkedIn ? "Active" : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Slim Linear Progress Bar */}
                  <div className="pt-1 relative z-10">
                    <div className="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          isOnBreak
                            ? "bg-slate-400"
                            : checkedIn
                              ? "bg-brand-gradient"
                              : hasCompletedToday
                                ? isLop || approvalStatus === "REJECTED" ? "bg-rose-500" : "bg-sky-600"
                                : "bg-slate-300"
                        }`}
                        style={{ width: `${checkedIn || hasCompletedToday ? progressPercentInt : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Loss of Pay Banner */}
            {hasCompletedToday && (approvalStatus === "REJECTED" || isLop) && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-700">
                  <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>HR Decision: Loss of Pay (LOP) Applied</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  Your early check-out request (8h) was rejected by HR. Marked as Loss of Pay.
                  {hrFeedback && <span className="block mt-1 italic text-slate-700">Note: &quot;{hrFeedback}&quot;</span>}
                </p>
              </div>
            )}

            {/* Pending HR Approval Banner */}
            {hasCompletedToday && approvalStatus === "PENDING" && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-700">
                  <TimerIcon className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>HR Approval Pending</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  Early check-out note delivered to HR. Pending HR review and decision.
                  {earlyReason && <span className="block mt-1 italic text-amber-800">Your Reason: &quot;{earlyReason}&quot;</span>}
                </p>
              </div>
            )}

            {/* 5-Second Transient Information Popup */}
            {infoPopup && (
              <div className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 shadow-md relative overflow-hidden ${
                infoPopup.type === "warning"
                  ? "bg-amber-50 border-amber-300 text-amber-900"
                  : "bg-emerald-50 border-emerald-300 text-emerald-900"
              }`}>
                <div className="flex items-start gap-2.5">
                  <span className="text-base shrink-0 mt-0.5">
                    {infoPopup.type === "warning" ? "⏰" : "✅"}
                  </span>
                  <div>
                    <p className="font-bold text-xs">{infoPopup.title}</p>
                    <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">{infoPopup.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoPopup(null)}
                  className="text-xs opacity-60 hover:opacity-100 cursor-pointer p-0.5 font-bold shrink-0"
                  title="Close"
                >
                  ✕
                </button>
                {/* 5-Second progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5">
                  <div
                    className={`h-full ${infoPopup.type === "warning" ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: "100%", animation: "shrinkProgress 5s linear forwards" }}
                  />
                </div>
              </div>
            )}

            {/* Feedback Notices */}
            {notice.error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center font-medium">
                {notice.error}
              </div>
            )}
            {notice.success && !infoPopup && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs text-center font-medium">
                {notice.success}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2">
              {checkedIn ? (
                <div className="space-y-3">
                  {isOnBreak ? (
                    /* Resuming Shift from Lunch Break */
                    <button
                      type="button"
                      onClick={() => handleToggleBreak("END")}
                      disabled={actionLoading}
                      className="w-full py-3.5 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs sm:text-sm font-semibold transition-all duration-200 shadow-xs shadow-[#1f6fb2]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                    >
                      {actionLoading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Resuming shift…</span>
                        </>
                      ) : (
                        <>
                          <PlayIcon className="w-4 h-4 shrink-0" />
                          <span className="tracking-wide">Finish Lunch Break &amp; Resume Shift</span>
                        </>
                      )}
                    </button>
                  ) : (hasCompletedBreak || totalBreakSeconds > 0) ? (
                    /* Break completed today, only Check Out available */
                    <div className="space-y-2.5">
                      <div className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-semibold text-center flex items-center justify-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Lunch break logged ({formatSecondsToHHMMSS(totalBreakSeconds)}) · Single daily break policy</span>
                      </div>
                      <button
                        type="button"
                        onClick={initiateCheckOut}
                        disabled={actionLoading}
                        className="w-full py-3.5 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs sm:text-sm font-semibold transition-all duration-200 shadow-xs shadow-[#1f6fb2]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                      >
                        {actionLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Processing check out…</span>
                          </>
                        ) : (
                          <>
                            <LogOutIcon className="w-4 h-4 shrink-0" />
                            <span className="tracking-wide">Check Out</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    /* Active shift: Start Lunch Break & Check Out */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleBreak("START")}
                        disabled={actionLoading || hasCompletedBreak || totalBreakSeconds > 0}
                        className="py-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 text-xs sm:text-sm font-semibold transition-all duration-200 shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                      >
                        <span className="tracking-wide">Start Lunch Break</span>
                      </button>

                      <button
                        type="button"
                        onClick={initiateCheckOut}
                        disabled={actionLoading}
                        className="py-3.5 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs sm:text-sm font-semibold transition-all duration-200 shadow-xs shadow-[#1f6fb2]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                      >
                        <LogOutIcon className="w-4 h-4 shrink-0" />
                        <span className="tracking-wide">Check Out</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : hasCompletedToday ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1">
                  <p className={`text-xs font-bold flex items-center justify-center gap-1.5 ${isLop ? "text-rose-700" : approvalStatus === "PENDING" ? "text-amber-700" : "text-slate-800"
                    }`}>
                    {isLop ? <XCircleIcon className="w-4 h-4 text-rose-700" /> : approvalStatus === "PENDING" ? <TimerIcon className="w-4 h-4 text-amber-700" /> : <CheckCircleIcon className="w-4 h-4 text-emerald-700" />}
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
                  className={`w-full rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2.5 relative overflow-hidden group ${
                    isHoliday
                      ? "py-3.5 bg-purple-50 border border-purple-200 text-purple-700 cursor-not-allowed"
                      : isNonWorkingDay
                        ? "py-3.5 bg-amber-50 border border-amber-200 text-amber-700 cursor-not-allowed"
                        : isOnLeaveToday
                          ? "py-3.5 bg-cyan-50 border border-cyan-200 text-cyan-700 cursor-not-allowed"
                          : "py-3.5 bg-brand-gradient hover:opacity-95 text-white shadow-xs shadow-[#1f6fb2]/20 cursor-pointer disabled:opacity-60 active:scale-[0.98]"
                  }`}
                >
                  {!isHoliday && !isNonWorkingDay && !isOnLeaveToday && (
                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out pointer-events-none" />
                  )}
                  {actionLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin shrink-0" />
                      <span className="tracking-wide">Starting your shift…</span>
                    </>
                  ) : isHoliday ? (
                    <>
                      <SunIcon className="w-4 h-4 text-purple-700 shrink-0" />
                      <span>Company Holiday — Check-In Closed</span>
                    </>
                  ) : isNonWorkingDay ? (
                    <>
                      <CalendarIcon className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Off Day ({todayDayName}) — No Shift Today</span>
                    </>
                  ) : isOnLeaveToday ? (
                    <>
                      <PlaneIcon className="w-4 h-4 text-cyan-700 shrink-0" />
                      <span>On Approved Leave Today</span>
                    </>
                  ) : (
                    <>
                      <LogInIcon className="w-4 h-4 text-white shrink-0" />
                      <span className="tracking-wide">Start My Shift</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

            {/* Today's Punch History Logs Table seamlessly integrated */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-bold text-slate-900">
                    Today&apos;s Shift Record
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono font-bold border border-slate-200">
                  {todayLogs.length} Logged
                </span>
              </div>

              {todayLogs.length === 0 ? (
                <div className="py-10 text-center text-slate-400 space-y-2">
                  <ClockIcon className="w-8 h-8 text-slate-300 mx-auto stroke-1" />
                  <p className="text-xs text-slate-500">No check-in log recorded for today yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider bg-slate-50/70">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Check In</th>
                        <th className="py-3 px-4">Check Out</th>
                        <th className="py-3 px-4">Lunch Break Duration</th>
                        <th className="py-3 px-4">Net Working Hours</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
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
                          <tr key={log.id || idx} className="hover:bg-slate-50/60 transition">
                            <td className="py-3.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-3.5 px-4 font-mono text-slate-800 font-semibold">
                              {new Date(log.check_in).toLocaleTimeString()}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-600">
                              {log.check_out ? new Date(log.check_out).toLocaleTimeString() : log.status === "ON_BREAK" ? <span className="text-slate-600 font-medium">On Lunch Break</span> : <span className="text-slate-500 font-medium">—</span>}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-700">
                              {formatDurationText(displayBreakSec)}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                              {displayWorkHours} hrs
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${log.status === "ON_BREAK"
                                  ? "bg-slate-100 text-slate-700 border-slate-200"
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
                                  ? "ON LUNCH BREAK"
                                  : log.status === "CHECKED_IN"
                                    ? "ON DUTY"
                                    : log.status === "PENDING_APPROVAL"
                                      ? "PENDING HR"
                                      : log.status === "REJECTED_LOP"
                                        ? "LOSS OF PAY"
                                        : "COMPLETED"}
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
          </div>
        )}

        {/* TAB 2: TEAM ATTENDANCE TRACKER */}
        {isHR && effectiveViewTab === "team-tracker" && (
          <div className="animate-fadeIn">
            <HRAttendanceTracker embedded={true} userRole={userRole} />
          </div>
        )}

        {/* TAB 3: EMPLOYEE MONTHLY SUMMARY */}
        {canViewMonthlySummary && effectiveViewTab === "monthly-summary" && (
          <div className="animate-fadeIn">
            <EmployeeMonthlySummaryTable embedded={true} userRole={userRole} />
          </div>
        )}
      </div>

      {/* --- EARLY CHECKOUT REASON POP-UP MODAL (MATCHING CREATE SPRINT THEME) --- */}
      {showReasonModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !actionLoading) setShowReasonModal(false);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Top Header matching exact Create Sprint format */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-base">
                <span className="font-bold text-slate-900">Request:</span>
                <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
                  Early Check-Out
                </span>
              </div>

              {/* Red square close button */}
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setShowReasonModal(false)}
                className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleReasonSubmit} className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
              {modalError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {modalError}
                </div>
              )}

              {/* Shift info box */}
              <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <p>
                  Standard overall working time is <strong className="text-blue-700 font-semibold">{dailyTargetHours} Hours</strong>. Current net shift duration is <strong className="text-slate-900 font-mono font-bold">{runtimeDecimal} hrs</strong>.
                </p>
                <p className="text-slate-500 text-[11px]">
                  Please enter a reason for checking out before {dailyTargetHours} hours. This message will be delivered to HR for approval.
                </p>
              </div>

              {/* Row: Reason with red underline required indicator */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
                  <span className="border-b-2 border-rose-500 pb-0.5">
                    Reason
                  </span>
                </label>
                <div className="flex-1">
                  <textarea
                    rows={3}
                    required
                    autoFocus
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    placeholder="e.g. Medical emergency / Personal work / Prior manager approval..."
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Footer Buttons matching Create Sprint exact theme */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={actionLoading || !reasonInput.trim()}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs flex items-center gap-1.5"
                >
                  {actionLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting…</span>
                    </>
                  ) : (
                    "Submit to HR"
                  )}
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setShowReasonModal(false)}
                  className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
