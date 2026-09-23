"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api/authFetch";
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
} from "./AttendanceIcons";

function formatSecondsToHHMMSS(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00h 00m 00s";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
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

/**
 * AttendanceCard Component
 * Real-Time 8-Hour Working Standard Tracker with Digital Shift Console.
 */
export default function AttendanceCard() {
  const [checkedIn, setCheckedIn] = useState(false);
  const [hasCompletedToday, setHasCompletedToday] = useState(false);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [workDate, setWorkDate] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalWorkingHoursToday, setTotalWorkingHoursToday] = useState(0);
  const [totalCompletedHoursToday, setTotalCompletedHoursToday] = useState(0);
  const [dailyTargetHours, setDailyTargetHours] = useState(8.0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  // Live wall-clock for idle (not checked-in) state
  const [liveTime, setLiveTime] = useState(() => new Date());

  // Lunch break state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [hasCompletedBreak, setHasCompletedBreak] = useState(false);
  const [breakStart, setBreakStart] = useState(null);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(0);
  const [currentBreakSeconds, setCurrentBreakSeconds] = useState(0);

  // Early checkout & HR approval states
  const [approvalStatus, setApprovalStatus] = useState("APPROVED");
  const [earlyReason, setEarlyReason] = useState("");
  const [isLop, setIsLop] = useState(false);
  const [hrFeedback, setHrFeedback] = useState("");

  // Modal state for early checkout reason prompt
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

  // Company Network Authorization status
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState({ error: "", success: "" });
  const [networkStatus, setNetworkStatus] = useState({
    loading: true,
    isAuthorized: true,
    clientIp: "",
    userRole: "",
    networkName: "",
    reason: "",
  });
  const [networkAlertModal, setNetworkAlertModal] = useState({
    open: false,
    message: "",
    clientIp: "",
  });
  const [isAuthorizingNetwork, setIsAuthorizingNetwork] = useState(false);

  const fetchNetworkStatus = async () => {
    try {
      const res = await authFetch("/api/attendance/network-status");
      if (res.ok) {
        const data = await res.json();
        const isAuth = Boolean(data.isAuthorized);
        setNetworkStatus({
          loading: false,
          isAuthorized: isAuth,
          clientIp: data.clientIp || "",
          userRole: data.userRole || "",
          networkName: data.networkName || "",
          reason: data.message || "",
        });

        // Automatically clear unauthorized error notice and close warning modal when reconnected to authorized network!
        if (isAuth) {
          setNotice((prev) =>
            prev.error && prev.error.toLowerCase().includes("unauthorized network")
              ? { ...prev, error: "" }
              : prev
          );
          setNetworkAlertModal({ open: false, message: "", clientIp: "" });
        }
      }
    } catch (_) {}
  };

  const handleAuthorizeNetwork = async (ipToAuthorize) => {
    const targetIp = ipToAuthorize || networkAlertModal.clientIp || networkStatus.clientIp;
    if (!targetIp) return;
    setIsAuthorizingNetwork(true);
    try {
      const res = await authFetch("/api/company/networks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network_name: `Office Network (${targetIp})`,
          network_ip: targetIp,
          status: "active",
          description: "Authorized from Attendance Console",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({
          error: "",
          success: `Network IP "${targetIp}" authorized successfully! You can now check in.`,
        });
        setNetworkAlertModal({ open: false, message: "", clientIp: "" });
        await fetchNetworkStatus();
      } else {
        setNotice({
          error: data.message || "Failed to authorize network.",
          success: "",
        });
      }
    } catch (err) {
      console.error("Authorize network error:", err);
      setNotice({ error: "Network error authorizing IP. Please try again.", success: "" });
    } finally {
      setIsAuthorizingNetwork(false);
    }
  };

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

        // ─── Metadata — safe to update every poll ────────────────────────────
        setCheckedIn(data.checkedIn);
        setHasCompletedToday(data.hasCompletedToday || false);
        setCheckInTime(data.checkInTime);
        setCheckOutTime(data.checkOutTime || null);
        setWorkDate(data.workDate || null);
        setTotalWorkingHoursToday(data.totalWorkingHoursToday || 0);
        setTotalCompletedHoursToday(data.totalCompletedHoursToday || 0);
        if (data.dailyTargetHours) {
          setDailyTargetHours(Number(data.dailyTargetHours) || 8.0);
        }
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
      await fetchNetworkStatus();
    };
    initStatus();

    // Responsive network checking (every 5 seconds) to automatically detect Wi-Fi reconnection in real-time
    const networkPollInterval = setInterval(() => {
      fetchNetworkStatus();
    }, 5000);

    const pollInterval = setInterval(() => {
      const currentDateStr = new Date().toDateString();
      if (currentDateStr !== lastCheckedDateRef.current) {
        lastCheckedDateRef.current = currentDateStr;
        fetchAttendanceStatus(false); // Midnight rollover — full refresh
      } else {
        fetchAttendanceStatus(true); // Background polling
      }
    }, 15000);

    const handleUpdate = () => {
      fetchAttendanceStatus(true);
      fetchNetworkStatus();
    };

    const handleFocusOrOnline = () => {
      fetchNetworkStatus();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
      window.addEventListener("focus", handleFocusOrOnline);
      window.addEventListener("online", handleFocusOrOnline);
    }

    return () => {
      clearInterval(pollInterval);
      clearInterval(networkPollInterval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
        window.removeEventListener("focus", handleFocusOrOnline);
        window.removeEventListener("online", handleFocusOrOnline);
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

      if (res.status === 403 || data.unauthorizedNetwork) {
        setNotice({ error: data.message || "Unauthorized Network Connection", success: "" });
        setNetworkAlertModal({
          open: true,
          message: data.message || "Your current connection is not recognized as an authorized company network.",
          clientIp: data.clientIp || networkStatus.clientIp || "",
        });
        fetchNetworkStatus();
        return;
      }

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
        if (data.workDate) setWorkDate(data.workDate);
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
        setNotice({ error: data.message || "Failed to update lunch break status.", success: "" });
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

  // Called when user clicks "Check Out"
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

      if (res.status === 403 || data.unauthorizedNetwork) {
        setShowReasonModal(false);
        setNotice({ error: data.message || "Unauthorized Network Connection", success: "" });
        setNetworkAlertModal({
          open: true,
          message: data.message || "Your current connection is not recognized as an authorized company network.",
          clientIp: data.clientIp || networkStatus.clientIp || "",
        });
        fetchNetworkStatus();
        return;
      }

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
            success: `Early Check-Out Recorded (${data.workingHours} net hrs, <${dailyTargetHours}h). Reason sent to HR for approval.`,
          });
        } else {
          setNotice({
            error: "",
            success: `Shift completed! Calculated net working hours: ${data.durationFormatted || `${data.workingHours} hrs`}`,
          });
        }
        if (typeof window !== "undefined") window.dispatchEvent(new Event("attendance-updated"));
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
      setModalError(`Please specify a reason for early check-out (< ${dailyTargetHours} hours).`);
      return;
    }
    executeCheckOut(reasonInput.trim());
  };

  const runtimeWorkingHoursDecimal = (elapsedSeconds / 3600).toFixed(2);
  const formattedCheckInTime = checkInTime
    ? new Date(checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const formattedCheckOutTime = checkOutTime
    ? new Date(checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  // Real-time progress calculations towards company daily target hours
  const targetSeconds = dailyTargetHours * 3600;
  const totalEffectiveSeconds = checkedIn ? elapsedSeconds : (totalWorkingHoursToday * 3600);
  const progressRatio = Math.min(1.0, Math.max(0, totalEffectiveSeconds / targetSeconds));
  const progressPercentInt = Math.min(100, Math.round(progressRatio * 100));

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-xs hover:border-sky-200 transition-all duration-300 relative">

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
            <ClockIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Daily Attendance
            </h3>
            <p className="text-[11px] text-slate-500">Overall company working standard: {dailyTargetHours.toFixed(1)} Hours</p>
          </div>
        </div>

        {/* Dynamic Status Badge matching Document Manager */}
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border transition-colors ${isOnBreak
              ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
              : checkedIn
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse"
                : hasCompletedToday && approvalStatus === "PENDING"
                  ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                  : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : hasCompletedToday
                      ? "bg-sky-50 text-sky-700 border-sky-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
        >
          {isOnBreak ? (
            <>
              <CoffeeIcon className="w-3 h-3" />
              <span>ON LUNCH BREAK</span>
            </>
          ) : checkedIn ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>ON DUTY</span>
            </>
          ) : hasCompletedToday && approvalStatus === "PENDING" ? (
            <>
              <TimerIcon className="w-3 h-3" />
              <span>PENDING HR REVIEW</span>
            </>
          ) : hasCompletedToday && (approvalStatus === "REJECTED" || isLop) ? (
            <>
              <XCircleIcon className="w-3 h-3" />
              <span>REJECTED (LOP)</span>
            </>
          ) : hasCompletedToday ? (
            <>
              <CheckCircleIcon className="w-3 h-3" />
              <span>SHIFT COMPLETED</span>
            </>
          ) : (
            <>
              <ClockIcon className="w-3 h-3" />
              <span>OFF DUTY</span>
            </>
          )}
        </span>
      </div>

      {isHoliday && (
        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <SunIcon className="w-4 h-4 text-purple-700 shrink-0" />
            <span className="truncate">Holiday Today: &quot;{holidayTitle}&quot;</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-mono font-bold uppercase tracking-wider border border-purple-300 shrink-0">
            Check-In Closed
          </span>
        </div>
      )}

      {isNonWorkingDay && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="truncate">Company Off-Day ({todayDayName}): Non-working day</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-mono font-bold uppercase tracking-wider border border-amber-300 shrink-0">
            Check-In Closed
          </span>
        </div>
      )}


      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-slate-500 text-xs">
          <div className="w-7 h-7 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <span>Syncing attendance server state…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── ROUND CIRCULAR LIVE SHIFT DISPLAY (OVERVIEW TAB) ── */}
          {(() => {
            const circleRadius = 56;
            const circleCircumference = 2 * Math.PI * circleRadius;
            const strokeDashoffset = circleCircumference - progressRatio * circleCircumference;

            let timeDisplay = liveTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
            let subLabel = liveTime.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
            let strokeColor = "stroke-sky-400";
            let textColor = "text-slate-900";
            let ringBadge = `${dailyTargetHours.toFixed(0)}h Target`;

            if (isOnBreak) {
              timeDisplay = formatSecondsToHHMMSS(currentBreakSeconds);
              subLabel = "Lunch Break (Shift Paused)";
              strokeColor = "stroke-teal-500";
              textColor = "text-teal-700";
              ringBadge = "Break Paused";
            } else if (checkedIn) {
              timeDisplay = formatSecondsToHHMMSS(elapsedSeconds);
              subLabel = `${runtimeWorkingHoursDecimal} / ${dailyTargetHours.toFixed(1)} hrs`;
              strokeColor = "stroke-teal-500";
              textColor = "text-teal-700";
              ringBadge = `${progressPercentInt}% Target`;
            } else if (hasCompletedToday) {
              timeDisplay = `${totalWorkingHoursToday.toFixed(2)} hrs`;
              subLabel = "Shift Completed";
              strokeColor = isLop || approvalStatus === "REJECTED" ? "stroke-rose-500" : approvalStatus === "PENDING" ? "stroke-amber-500" : "stroke-sky-600";
              textColor = isLop || approvalStatus === "REJECTED" ? "text-rose-700" : approvalStatus === "PENDING" ? "text-amber-700" : "text-sky-700";
              ringBadge = isLop || approvalStatus === "REJECTED" ? "LOP Applied" : approvalStatus === "PENDING" ? "Pending HR" : "Completed";
            }

            return (
              <div className="flex flex-col items-center justify-center py-2">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  {/* SVG Round Progress Ring */}
                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 130 130">
                    <circle
                      cx="65"
                      cy="65"
                      r={circleRadius}
                      className="stroke-slate-100"
                      strokeWidth="7"
                      fill="transparent"
                    />
                    <circle
                      cx="65"
                      cy="65"
                      r={circleRadius}
                      className={`transition-all duration-1000 ease-out ${strokeColor}`}
                      strokeWidth="7"
                      strokeDasharray={circleCircumference}
                      strokeDashoffset={checkedIn || hasCompletedToday ? strokeDashoffset : circleCircumference}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  </svg>

                  {/* Central Round Contents */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {checkedIn ? "Shift Timer" : hasCompletedToday ? "Total Worked" : "Local Time"}
                    </span>
                    <div className={`font-mono text-lg sm:text-xl font-black tracking-tight tabular-nums mt-0.5 ${textColor}`}>
                      {timeDisplay}
                    </div>
                    <span className="text-[10px] font-medium text-slate-500 mt-0.5 truncate max-w-[110px]">
                      {subLabel}
                    </span>
                    <span className="mt-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[9px] font-mono font-bold border border-sky-200">
                      {ringBadge}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* LOP Banner Alert if rejected by HR */}
          {hasCompletedToday && (approvalStatus === "REJECTED" || isLop) && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-700">
                <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
                <span>HR Decision: Loss of Pay (LOP) Applied</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Your early check-out request (8h) was rejected by HR. Marked as Loss of Pay.
                {hrFeedback && <span className="block mt-1 italic text-slate-700">Note: "{hrFeedback}"</span>}
              </p>
            </div>
          )}

          {/* HR Approval Pending Banner */}
          {hasCompletedToday && approvalStatus === "PENDING" && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-700">
                <TimerIcon className="w-4 h-4 text-amber-600 shrink-0" />
                <span>HR Approval Pending</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Early check-out note delivered to HR. Pending HR review and decision.
                {earlyReason && <span className="block mt-1 italic text-amber-900">Your Reason: "{earlyReason}"</span>}
              </p>
            </div>
          )}

          {/* Feedback Notice Banner */}
          {notice.error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center font-medium">
              {notice.error}
            </div>
          )}
          {notice.success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs text-center font-medium">
              {notice.success}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-1">
            {checkedIn ? (
              <div className="space-y-2.5">
                {isOnBreak ? (
                  /* Resuming Shift from Lunch Break */
                  <button
                    type="button"
                    onClick={() => handleToggleBreak("END")}
                    disabled={actionLoading}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 text-white text-xs font-bold transition-all duration-200 shadow-md shadow-teal-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                  >
                    {actionLoading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                  <div className="space-y-2">
                    <div className="py-2 px-3 rounded-xl bg-teal-50/80 border border-teal-200 text-teal-800 text-[11px] font-semibold text-center flex items-center justify-center gap-1.5">
                      <CheckCircleIcon className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Lunch break logged ({formatSecondsToHHMMSS(totalBreakSeconds)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={initiateCheckOut}
                      disabled={actionLoading}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 hover:from-sky-500 hover:via-blue-500 hover:to-indigo-600 text-white text-xs font-bold transition-all duration-200 shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                    >
                      {actionLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleBreak("START")}
                      disabled={actionLoading || hasCompletedBreak || totalBreakSeconds > 0}
                      className="py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 text-white text-xs font-bold transition-all duration-200 shadow-md shadow-teal-500/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                    >
                      <CoffeeIcon className="w-4 h-4 shrink-0" />
                      <span className="tracking-wide">Start Lunch Break</span>
                    </button>

                    <button
                      type="button"
                      onClick={initiateCheckOut}
                      disabled={actionLoading}
                      className="py-3.5 rounded-xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 hover:from-sky-500 hover:via-blue-500 hover:to-indigo-600 text-white text-xs font-bold transition-all duration-200 shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                    >
                      <LogOutIcon className="w-4 h-4 shrink-0" />
                      <span className="tracking-wide">Check Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : hasCompletedToday ? (
              <div className="p-3.5 rounded-2xl bg-sky-50/50 border border-sky-200 text-center space-y-1">
                <p className={`text-xs font-bold flex items-center justify-center gap-1.5 ${isLop ? "text-rose-700" : approvalStatus === "PENDING" ? "text-amber-700" : "text-sky-800"}`}>
                  {isLop ? <XCircleIcon className="w-3.5 h-3.5 text-rose-700" /> : approvalStatus === "PENDING" ? <TimerIcon className="w-3.5 h-3.5 text-amber-700" /> : <CheckCircleIcon className="w-3.5 h-3.5 text-sky-700" />}
                  <span>
                    {isLop
                      ? "Attendance Completed (Loss of Pay)"
                      : approvalStatus === "PENDING"
                        ? "Early Check-Out Awaiting HR Approval"
                        : "Attendance Completed For Today"}
                  </span>
                </p>
                <p className="text-[10px] text-slate-500">
                  Single daily check-in rule enforced. Net working hours locked.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={actionLoading || isHoliday || isOnLeaveToday || isNonWorkingDay}
                className={`w-full rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2.5 relative overflow-hidden group ${
                  isHoliday
                    ? "py-3.5 bg-purple-50 border border-purple-200 text-purple-700 cursor-not-allowed"
                    : isNonWorkingDay
                      ? "py-3.5 bg-amber-50 border border-amber-200 text-amber-700 cursor-not-allowed"
                      : isOnLeaveToday
                        ? "py-3.5 bg-cyan-50 border border-cyan-200 text-cyan-700 cursor-not-allowed"
                        : "py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-60 active:scale-[0.98]"
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
                    <LogInIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                    <span className="tracking-wide">Start My Shift</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

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
                  Standard overall working time is <strong className="text-blue-700 font-semibold">{dailyTargetHours} Hours</strong>. Current net shift duration is <strong className="text-slate-900 font-mono font-bold">{runtimeWorkingHoursDecimal} hrs</strong>.
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

      {/* Network Access Security Warning Modal matching Create Sprint popup theme */}
      {networkAlertModal.open && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setNetworkAlertModal({ open: false, message: "", clientIp: "" });
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-md bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Top Header matching exact Create Sprint format */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-base">
                <span className="font-bold text-slate-900">Notice:</span>
                <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
                  Network Access
                </span>
              </div>

              {/* Red square close button */}
              <button
                type="button"
                onClick={() => setNetworkAlertModal({ open: false, message: "", clientIp: "" })}
                className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-4">
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">
                  <span>⚠️</span>
                  <span>Unauthorized Company Network</span>
                </div>
                <p className="leading-relaxed">
                  {networkAlertModal.message || "Your current connection is not recognized as an authorized company network. Please connect to your office Wi-Fi to proceed."}
                </p>
                {(networkAlertModal.clientIp || networkStatus.clientIp) && (
                  <div className="pt-1 flex items-center gap-1.5 text-[11px] font-mono text-slate-700 bg-white/80 p-1.5 rounded border border-rose-200">
                    <span className="font-bold text-slate-900 font-sans">Detected Client IP:</span>
                    <span className="font-semibold text-rose-600">{networkAlertModal.clientIp || networkStatus.clientIp}</span>
                  </div>
                )}
              </div>

              {/* Quick Authorize IP button for Owner & HR */}
              {(networkAlertModal.clientIp || networkStatus.clientIp) &&
                ["ADMIN", "hr_manager", "hr_executive"].includes(networkStatus.userRole) && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="text-[11px] text-emerald-800">
                      <span className="font-bold block">Owner / HR Action:</span>
                      Authorize this IP for the entire company in 1 click.
                    </div>
                    <button
                      type="button"
                      disabled={isAuthorizingNetwork}
                      onClick={() => handleAuthorizeNetwork(networkAlertModal.clientIp || networkStatus.clientIp)}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-2xs"
                    >
                      {isAuthorizingNetwork ? "Authorizing…" : "＋ Authorize This IP"}
                    </button>
                  </div>
                )}

              {/* Footer Buttons matching Create Sprint exact theme */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setNetworkAlertModal({ open: false, message: "", clientIp: "" });
                    fetchNetworkStatus();
                  }}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer shadow-xs"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setNetworkAlertModal({ open: false, message: "", clientIp: "" })}
                  className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
