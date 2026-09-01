"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
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
  SendMailIcon,
  BarChartIcon,
  ShieldIcon,
  SunIcon,
  PlaneIcon,
  UsersIcon,
  SearchIcon,
  RefreshCwIcon,
  TimerIcon,
  FileTextIcon,
} from "./AttendanceIcons";

function formatTimeString(isoString) {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

function formatDurationHMS(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return "00h 00m 00s";
  const sec = Math.round(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export default function HRAttendanceTracker({ embedded = false }) {
  const [hrTab, setHrTab] = useState("daily"); // "daily" | "monthly"
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalStaff: 0,
    checkedInCount: 0,
    checkedOutCount: 0,
    notCheckedInCount: 0,
    presentTotal: 0,
    attendanceRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Rejection Feedback Modal
  const [rejectingAttId, setRejectingAttId] = useState(null);
  const [rejectFeedbackInput, setRejectFeedbackInput] = useState("");
  const [actionNotice, setActionNotice] = useState({ error: "", success: "" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("hrms_summary_sent_dates");
      } catch {
        // Ignore
      }
    }
  }, []);

  // Lock body scroll and handle Escape key when modal is open
  useEffect(() => {
    if (!rejectingAttId) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setRejectingAttId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [rejectingAttId]);

  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchedDates, setDispatchedDates] = useState({});

  const markDateAsDispatched = (dateKey) => {
    if (!dateKey) return;
    setDispatchedDates((prev) => ({ ...prev, [dateKey]: true }));
  };

  const handleDispatchDailySummary = async () => {
    const isAlreadySent = Boolean(dispatchedDates[selectedDate]);
    if (dispatchLoading || isAlreadySent) {
      setActionNotice({
        error: "",
        success: `ℹ️ Attendance summary report has already been sent for ${selectedDate}.`,
      });
      return;
    }

    setDispatchLoading(true);
    setActionNotice({ error: "", success: "" });
    try {
      const res = await fetch("/api/attendance/send-daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, date: selectedDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionNotice({ error: data.message || "Failed to send daily summary.", success: "" });
      } else if (data.alreadySent || data.details?.reason === "already_sent_today") {
        markDateAsDispatched(selectedDate);
        setActionNotice({
          error: "",
          success: data.message || `ℹ️ Attendance summary report has already been sent for ${selectedDate}.`,
        });
        await fetchNotifications();
      } else {
        markDateAsDispatched(selectedDate);
        setActionNotice({
          error: "",
          success: data.message || `Daily attendance summary report for ${selectedDate} successfully sent to HR email!`,
        });
        await fetchNotifications();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("attendance-updated"));
        }
      }
    } catch {
      setActionNotice({ error: "Network error sending daily summary report.", success: "" });
    } finally {
      setDispatchLoading(false);
    }
  };

  const fetchAttendanceList = async (dateStr, isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch(`/api/attendance/list?date=${dateStr}`, { headers });
      if (res.status === 401) {
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        if (data.summary) setSummary(data.summary);
        if (data.isReportSent) {
          markDateAsDispatched(dateStr);
        }
      }
    } catch (err) {
      console.error("Failed to fetch HR attendance list:", err);
    } finally {
      setLoading(false);
    }
  };

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error("Failed to fetch HR notifications:", err);
    }
  };

  const markNotificationsAsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setUnreadCount(0);
      fetchNotifications();
    } catch (err) {
      console.error("Failed to mark notifications as read:", err);
    }
  };

  const lastDateRef = React.useRef(typeof window !== "undefined" ? new Date().toISOString().split("T")[0] : "");

  useEffect(() => {
    const initData = async () => {
      await fetchAttendanceList(selectedDate, false);
      await fetchNotifications();
    };
    initData();

    const interval = setInterval(() => {
      const todayIso = new Date().toISOString().split("T")[0];
      if (todayIso !== lastDateRef.current && selectedDate === lastDateRef.current) {
        lastDateRef.current = todayIso;
        setSelectedDate(todayIso);
      } else {
        fetchAttendanceList(selectedDate, true);
        fetchNotifications();
      }
    }, 5000);

    const handleUpdateEvent = () => {
      fetchAttendanceList(selectedDate, true);
      fetchNotifications();
    };
    window.addEventListener("attendance-updated", handleUpdateEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener("attendance-updated", handleUpdateEvent);
    };
  }, [selectedDate]);

  // Live 1-second ticker to increment active employees' net working seconds in real-time
  useEffect(() => {
    const ticker = setInterval(() => {
      setRecords((prevRecords) =>
        prevRecords.map((emp) => {
          if (emp.status === "CHECKED_IN") {
            const newNetSec = (emp.netWorkingSeconds || Math.round((emp.workingHours || 0) * 3600)) + 1;
            return {
              ...emp,
              netWorkingSeconds: newNetSec,
              workingHours: newNetSec / 3600,
            };
          }
          return emp;
        })
      );
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const handleActionEarlyCheckout = async (attendanceId, action, feedbackText = "") => {
    if (!attendanceId) return;
    setActionLoadingId(attendanceId);
    setActionNotice({ error: "", success: "" });

    try {
      const res = await fetch("/api/attendance/approve-early", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceId,
          action,
          hrFeedback: feedbackText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionNotice({ error: data.message || "Failed to process request.", success: "" });
      } else {
        setActionNotice({ error: "", success: data.message });
        setRejectingAttId(null);
        setRejectFeedbackInput("");
        await fetchAttendanceList(selectedDate);
      }
    } catch {
      setActionNotice({ error: "Network error processing HR decision.", success: "" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingEarlyCount = records.filter(
    (r) => r.status === "PENDING_APPROVAL" || r.approvalStatus === "PENDING"
  ).length;

  // Strictly track staff whose role is designated as "employee"
  // HR, Admin, Manager, and Team Lead roles are 100% excluded from shift checkout tracking
  const isEmployeeStaff = (r) => {
    const role = (r.role || "").toLowerCase().trim();
    return role === "employee" || role === "employees";
  };

  const trackedRecords = records.filter(isEmployeeStaff);

  const activeStaffList = trackedRecords.filter((r) => r.status === "CHECKED_IN" || r.status === "ON_BREAK");
  const completedStaffList = trackedRecords.filter(
    (r) =>
      r.status === "COMPLETED" ||
      r.status === "CHECKED_OUT" ||
      r.status === "PENDING_APPROVAL" ||
      r.status === "APPROVED" ||
      r.status === "REJECTED_LOP"
  );
  const isSentForSelectedDate =
    Boolean(dispatchedDates[selectedDate]) ||
    notifications.some(
      (n) =>
        (n.title?.includes("Daily Attendance Summary") || n.title?.includes("Daily Summary")) &&
        (n.title?.includes(selectedDate) || (n.message && n.message.includes(selectedDate)))
    );

  const filteredRecords = records.filter((rec) => {
    const q = (searchQuery || "").toLowerCase();
    const matchesSearch =
      !q ||
      (rec.fullName && rec.fullName.toLowerCase().includes(q)) ||
      (rec.email && rec.email.toLowerCase().includes(q)) ||
      (rec.department && rec.department.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === "all" ||
      rec.status === statusFilter ||
      (statusFilter === "PENDING_APPROVAL" && (rec.status === "PENDING_APPROVAL" || rec.approvalStatus === "PENDING")) ||
      (statusFilter === "REJECTED_LOP" && (rec.status === "REJECTED_LOP" || rec.isLop));

    return matchesSearch && matchesStatus;
  });

  const renderDailyTracker = () => (
    <div className={embedded ? "space-y-6" : "bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-6 shadow-xs relative"}>
      {/* Header & Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
            <UsersIcon className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Team Shift Tracker &amp; Approvals
          </h2>
        </div>

        {/* Date Selector & Refresh & Send Report */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50/70 border border-slate-200/80 rounded-xl px-3 py-1.5 shadow-2xs">
            <CalendarIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-slate-800 focus:outline-none font-mono cursor-pointer font-medium"
            />
          </div>
          <button
            onClick={() => fetchAttendanceList(selectedDate)}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 text-xs font-semibold transition cursor-pointer flex items-center justify-center shadow-2xs"
            title="Refresh List"
          >
            <RefreshCwIcon className="w-3.5 h-3.5" />
          </button>
                <button
                  onClick={handleDispatchDailySummary}
                  disabled={dispatchLoading || isSentForSelectedDate || activeStaffList.length > 0 || completedStaffList.length === 0}
                  className={`py-2 px-3.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${isSentForSelectedDate
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-300 cursor-not-allowed opacity-90"
                    : activeStaffList.length > 0 || completedStaffList.length === 0
                      ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-75"
                      : "bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-400 hover:from-sky-400 hover:via-cyan-400 hover:to-teal-300 text-white shadow-md shadow-cyan-500/20 cursor-pointer active:scale-[0.98]"
                    }`}
                  title={
                    isSentForSelectedDate
                      ? `Attendance summary report has already been sent for ${selectedDate}.`
                      : activeStaffList.length > 0
                        ? `Report dispatch is disabled: ${activeStaffList.length} employee(s) are still clocked in on ${selectedDate}. All employees must check out first.`
                        : completedStaffList.length === 0
                          ? `No employee shifts have concluded for ${selectedDate} yet.`
                          : `All employees have checked out for ${selectedDate}! Click to send the attendance summary report to HR email.`
                  }
                >
                  {dispatchLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : isSentForSelectedDate ? (
                    <>
                      <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Report Sent</span>
                    </>
                  ) : (
                    <>
                      <SendMailIcon className="w-3.5 h-3.5" />
                      <span>Send Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* HR Unread Notifications & Reasons Banner */}
            {unreadCount > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between gap-3 animate-pulse shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <AlertTriangleIcon className="w-5 h-5 text-amber-700 shrink-0" />
                  <div>
                    <span className="font-bold text-amber-900 block text-xs">
                      {unreadCount} New Check-Out Request / Reason Noted by HR
                    </span>
                    <span className="text-[11px] text-amber-700">
                      {notifications.find((n) => !n.is_read)?.message || "Employee submitted early check-out request with reason."}
                    </span>
                  </div>
                </div>
                <button
                  onClick={markNotificationsAsRead}
                  className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-[11px] transition shrink-0 cursor-pointer"
                >
                  Mark as Read &amp; Noted
                </button>
              </div>
            )}

            {/* Action Notice Alert Banner */}
            {actionNotice.success && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between">
                <span>{actionNotice.success}</span>
                <button onClick={() => setActionNotice({ error: "", success: "" })} className="text-emerald-700 text-xs cursor-pointer">✕</button>
              </div>
            )}
            {actionNotice.error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between">
                <span>{actionNotice.error}</span>
                <button onClick={() => setActionNotice({ error: "", success: "" })} className="text-rose-700 text-xs cursor-pointer">✕</button>
              </div>
            )}

            {/* Summary Stat Cards Grid - Professional Document & Payslips Theme */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {/* Card 1: Total Staff */}
              <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-2 hover:border-slate-300 transition-all shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Total Staff</span>
                  <UsersIcon className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono">{summary.totalStaff}</div>
              </div>

              {/* Card 2: On Duty */}
              <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-2 hover:border-slate-300 transition-all shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">On Duty</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-700 font-mono">{summary.checkedInCount}</div>
              </div>

              {/* Card 3: Off Duty */}
              <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-2 hover:border-slate-300 transition-all shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Off Duty</span>
                  <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-700 font-mono">{summary.notCheckedInCount}</div>
              </div>

              {/* Card 4: Pending Early Requests */}
              <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-2 hover:border-slate-300 transition-all shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Pending Requests</span>
                  <TimerIcon className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-amber-700 font-mono">{pendingEarlyCount}</div>
              </div>

              {/* Card 5: Completed Shifts */}
              <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-2 hover:border-slate-300 transition-all shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Completed Shifts</span>
                  <CheckCircleIcon className="w-3.5 h-3.5 text-sky-500" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono">{summary.checkedOutCount}</div>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
              <div className="relative flex-1 w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                  <SearchIcon className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Search employee name, email, department…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition shadow-2xs"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs font-medium"
              >
                <option value="all">All Statuses ({records.length})</option>
                <option value="PENDING_APPROVAL">Pending HR Review ({pendingEarlyCount})</option>
                <option value="CHECKED_IN">On Duty ({summary.checkedInCount})</option>
                <option value="ON_BREAK">On Lunch Break</option>
                <option value="ON_LEAVE">On Approved Leave ({summary.onLeaveCount || 0})</option>
                <option value="COMPANY_HOLIDAY">Company Holiday ({summary.holidayCount || 0})</option>
                <option value="COMPLETED">Completed/Approved ({summary.checkedOutCount})</option>
                <option value="REJECTED_LOP">Loss of Pay (LOP)</option>
                <option value="NOT_CHECKED_IN">Not Checked In ({summary.notCheckedInCount})</option>
              </select>
            </div>

            {/* Employee Attendance Table */}
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                <span>Loading attendance records for {selectedDate}…</span>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <UsersIcon className="w-10 h-10 text-slate-300 mx-auto stroke-1" />
                <p className="text-xs">No employee records match the selected filter on {selectedDate}.</p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                <table className="w-full text-xs text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider bg-slate-50/70">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Check-In / Out</th>
                      <th className="py-3 px-4">Shift Duration</th>
                      <th className="py-3 px-4">Early Check-Out Reason</th>
                      <th className="py-3 px-4">Status &amp; HR Approval</th>
                      <th className="py-3 px-4 text-right">HR Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((emp) => {
                      const isPendingHR = emp.status === "PENDING_APPROVAL" || emp.approvalStatus === "PENDING";
                      const isRejectedLop = emp.status === "REJECTED_LOP" || emp.approvalStatus === "REJECTED" || emp.isLop;

                      return (
                        <tr key={emp.employeeId} className={`hover:bg-slate-50/60 transition group ${isPendingHR ? "bg-amber-50/60" : ""}`}>
                          {/* Employee info */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-xs shrink-0">
                                {emp.fullName?.charAt(0)?.toUpperCase() || "?"}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{emp.fullName}</div>
                                <div className="text-slate-500 text-[10px]">{emp.department} · {emp.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Check In / Out */}
                          <td className="py-3.5 px-4 font-mono text-xs">
                            <div className="text-slate-800">In: {emp.status === "COMPANY_HOLIDAY" ? <span className="text-purple-700 font-sans font-bold">Company Holiday</span> : emp.status === "ON_LEAVE" ? <span className="text-cyan-700 font-sans font-bold">Approved Leave</span> : formatTimeString(emp.checkIn)}</div>
                            <div className="text-slate-500">Out: {emp.status === "CHECKED_IN" ? <span className="text-emerald-600 font-bold animate-pulse">Active</span> : emp.status === "COMPANY_HOLIDAY" ? <span className="text-purple-700 font-sans font-bold">Company Holiday</span> : emp.status === "ON_LEAVE" ? <span className="text-cyan-700 font-sans font-bold">Approved Leave</span> : formatTimeString(emp.checkOut)}</div>
                          </td>

                          {/* Working Hours */}
                          <td className="py-3.5 px-4 font-mono">
                            {emp.status === "NOT_CHECKED_IN" ? (
                              <span className="font-bold text-slate-400">00h 00m 00s</span>
                            ) : (
                              <div>
                                <div className={`font-bold flex items-center gap-1.5 ${emp.status === "ON_BREAK"
                                  ? "text-amber-700"
                                  : emp.status === "COMPANY_HOLIDAY"
                                    ? "text-purple-700"
                                    : emp.status === "ON_LEAVE"
                                      ? "text-cyan-700"
                                      : emp.earlyCheckout
                                        ? "text-amber-700"
                                        : "text-emerald-700"
                                  }`}>
                                  <span>{formatDurationHMS(emp.netWorkingSeconds || Math.round(emp.workingHours * 3600))}</span>
                                  {emp.status === "CHECKED_IN" && (
                                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" title="Live Shift Running Timer" />
                                  )}
                                  {emp.status === "ON_BREAK" && (
                                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Shift Paused on Lunch Break" />
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500 block font-sans">
                                  ({(Number(emp.workingHours) || 0).toFixed(2)} hrs)
                                </span>
                              </div>
                            )}
                            {emp.status === "ON_BREAK" && (
                              <span className="block text-[9px] font-sans text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
                                <CoffeeIcon className="w-2.5 h-2.5" />
                                <span>Shift Paused (Lunch Break)</span>
                              </span>
                            )}
                            {emp.status === "COMPANY_HOLIDAY" && (
                              <span className="block text-[9px] font-sans text-purple-700 font-semibold flex items-center gap-1 mt-0.5">
                                <SunIcon className="w-2.5 h-2.5" />
                                <span>Holiday Credit</span>
                              </span>
                            )}
                            {emp.status === "ON_LEAVE" && (
                              <span className="block text-[9px] font-sans text-cyan-700 font-semibold flex items-center gap-1 mt-0.5">
                                <PlaneIcon className="w-2.5 h-2.5" />
                                <span>Leave Credit</span>
                              </span>
                            )}
                            {emp.earlyCheckout && emp.status !== "NOT_CHECKED_IN" && emp.status !== "CHECKED_IN" && emp.status !== "ON_BREAK" && emp.status !== "ON_LEAVE" && emp.status !== "COMPANY_HOLIDAY" && (
                              <span className="block text-[9px] font-sans text-amber-700 font-semibold">Under company shift standard</span>
                            )}
                          </td>

                          {/* Early Reason */}
                          <td className="py-3.5 px-4 max-w-xs">
                            {emp.earlyReason ? (
                              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium leading-relaxed shadow-2xs">
                                <span className="block text-[9px] font-bold text-amber-800 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                  <FileTextIcon className="w-3 h-3" />
                                  <span>Reason Noted by Employee:</span>
                                </span>
                                &quot;{emp.earlyReason}&quot;
                              </div>
                            ) : emp.earlyCheckout && emp.status !== "CHECKED_IN" && emp.status !== "NOT_CHECKED_IN" && emp.status !== "COMPANY_HOLIDAY" ? (
                              <span className="text-slate-400 italic text-[11px]">No reason recorded</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${emp.status === "ON_BREAK"
                                ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                                : emp.status === "CHECKED_IN"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : emp.status === "ON_LEAVE"
                                    ? "bg-cyan-50 text-cyan-700 border-cyan-200"
                                    : emp.status === "COMPANY_HOLIDAY"
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : isPendingHR
                                        ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                                        : isRejectedLop
                                          ? "bg-rose-50 text-rose-700 border-rose-200"
                                          : emp.status === "NOT_CHECKED_IN"
                                            ? "bg-slate-100 text-slate-600 border-slate-200"
                                            : "bg-sky-50 text-sky-700 border-sky-200"
                                }`}
                            >
                              {emp.status === "ON_BREAK" ? (
                                <>
                                  <CoffeeIcon className="w-3 h-3" />
                                  <span>ON LUNCH BREAK</span>
                                </>
                              ) : emp.status === "CHECKED_IN" ? (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span>ON DUTY</span>
                                </>
                              ) : emp.status === "ON_LEAVE" ? (
                                <>
                                  <PlaneIcon className="w-3 h-3" />
                                  <span>ON APPROVED LEAVE{emp.leaveType ? ` (${emp.leaveType})` : ""}</span>
                                </>
                              ) : emp.status === "COMPANY_HOLIDAY" ? (
                                <>
                                  <SunIcon className="w-3 h-3" />
                                  <span>COMPANY HOLIDAY{emp.holidayTitle ? ` (${emp.holidayTitle})` : ""}</span>
                                </>
                              ) : isPendingHR ? (
                                <>
                                  <TimerIcon className="w-3 h-3" />
                                  <span>PENDING HR APPROVAL</span>
                                </>
                              ) : isRejectedLop ? (
                                <>
                                  <XCircleIcon className="w-3 h-3" />
                                  <span>REJECTED (LOSS OF PAY / LOP)</span>
                                </>
                              ) : emp.status === "NOT_CHECKED_IN" ? (
                                <>
                                  <ClockIcon className="w-3 h-3" />
                                  <span>OFF DUTY</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircleIcon className="w-3 h-3" />
                                  <span>APPROVED (COMPLETED)</span>
                                </>
                              )}
                            </span>
                          </td>

                          {/* HR Actions */}
                          <td className="py-3.5 px-4 text-right">
                            {isPendingHR && emp.attendanceRecordId ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setRejectingAttId(emp.attendanceRecordId);
                                    setRejectFeedbackInput("");
                                  }}
                                  disabled={actionLoadingId === emp.attendanceRecordId}
                                  className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[11px] font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  <FileTextIcon className="w-3.5 h-3.5" />
                                  <span>Review Reason &amp; Decide</span>
                                </button>
                              </div>
                            ) : isRejectedLop ? (
                              <span className="text-rose-700 font-bold text-[10px] uppercase">LOP Applied</span>
                            ) : emp.status !== "NOT_CHECKED_IN" && emp.status !== "CHECKED_IN" ? (
                              <span className="text-emerald-700 font-bold text-[10px] uppercase">Approved</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* HR Approval & Review Modal (Displays Employee Reason & HR Actions) */}
            {mounted && rejectingAttId && typeof document !== "undefined" && (() => {
              const targetRec = records.find((r) => r.attendanceRecordId === rejectingAttId);
              return createPortal(
                <div
                  className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
                  onClick={() => setRejectingAttId(null)}
                >
                  <div
                    className="relative w-full max-w-lg bg-white border border-sky-100 rounded-2xl p-6 md:p-7 space-y-5 shadow-2xl my-auto animate-scaleUp"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-sky-100 pb-3.5">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-200 mb-1">
                          <TimerIcon className="w-3 h-3 shrink-0" />
                          <span>Early Check-Out Request Review</span>
                        </div>
                        <h3 className="text-base font-extrabold text-slate-900">
                          HR Approval Inbox &amp; Decision
                        </h3>
                      </div>
                      <button
                        onClick={() => setRejectingAttId(null)}
                        className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer text-sm font-bold shrink-0"
                        title="Close (Esc)"
                        aria-label="Close modal"
                      >
                        ✕
                      </button>
                    </div>

                    {targetRec && (
                      <div className="space-y-4">
                        {/* Employee Metadata */}
                        <div className="flex items-center justify-between bg-sky-50/50 p-3.5 rounded-xl border border-sky-100 text-xs">
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{targetRec.fullName}</div>
                            <div className="text-slate-500 text-[11px]">{targetRec.department} · {targetRec.email}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-amber-700 text-sm">
                              {formatDurationHMS(targetRec.netWorkingSeconds || Math.round(targetRec.workingHours * 3600))}
                            </div>
                            <div className="text-[10px] text-slate-500 font-sans">
                              ({(Number(targetRec.workingHours) || 0).toFixed(2)} hrs net — under 8.0h standard)
                            </div>
                          </div>
                        </div>

                        {/* PROMINENT REASON BOX */}
                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 space-y-2 shadow-inner">
                          <div className="flex items-center gap-2 font-bold text-amber-800 text-xs uppercase tracking-wider">
                            <FileTextIcon className="w-3.5 h-3.5" />
                            <span>Employee&apos;s Submitted Check-Out Reason:</span>
                          </div>
                          <div className="bg-white p-3.5 rounded-lg border border-amber-200 text-xs text-slate-800 italic leading-relaxed font-sans">
                            &quot;{targetRec.earlyReason || "No reason recorded in system"}&quot;
                          </div>
                        </div>

                        {/* HR Feedback / Note Input */}
                        <div>
                          <label className="block text-[11px] font-bold text-sky-900 uppercase mb-1">
                            HR Decision Note / Remarks (Optional)
                          </label>
                          <textarea
                            rows={2}
                            value={rejectFeedbackInput}
                            onChange={(e) => setRejectFeedbackInput(e.target.value)}
                            placeholder="e.g. Approved due to medical emergency / Shift minimum hours not met..."
                            className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-xs text-slate-800 placeholder-sky-400 focus:outline-none focus:border-sky-500 transition"
                          />
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <button
                            type="button"
                            disabled={actionLoadingId === rejectingAttId}
                            onClick={() => handleActionEarlyCheckout(rejectingAttId, "APPROVE", rejectFeedbackInput.trim())}
                            className="py-3 rounded-xl bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-400 hover:from-sky-400 hover:via-cyan-400 hover:to-teal-300 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                          >
                            {actionLoadingId === rejectingAttId ? (
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <CheckCircleIcon className="w-4 h-4 text-white" />
                                <span>Approve Early Check-Out</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingId === rejectingAttId}
                            onClick={() => handleActionEarlyCheckout(rejectingAttId, "REJECT", rejectFeedbackInput.trim())}
                            className="py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-rose-500/20 cursor-pointer disabled:opacity-50"
                          >
                            {actionLoadingId === rejectingAttId ? (
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <XCircleIcon className="w-4 h-4 text-white" />
                                <span>Reject (Loss of Pay)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>,
                document.body
              );
            })()}
    </div>
  );

  if (embedded) {
    return renderDailyTracker();
  }

  return (
    <div className="space-y-6">
      {/* Sliding Segmented Controller - Full Width & Bigger Size */}
      <div className="w-full bg-slate-100/90 p-1.5 sm:p-2 rounded-2xl border border-slate-200/90 shadow-2xs relative select-none">
        {/* Animated Sliding Blue Pill Indicator */}
        <div
          className="absolute top-1.5 bottom-1.5 sm:top-2 sm:bottom-2 w-[calc(50%-6px)] sm:w-[calc(50%-8px)] bg-sky-600 rounded-xl shadow-md shadow-sky-500/25 transition-transform duration-300 ease-out"
          style={{
            transform: hrTab === "monthly" ? "translateX(calc(100% + 6px))" : "translateX(0px)",
            left: "6px",
          }}
        />

        {/* Tab Triggers */}
        <div className="relative z-10 flex items-center">
          <button
            type="button"
            onClick={() => setHrTab("daily")}
            className={`flex-1 py-3.5 sm:py-4 px-4 sm:px-6 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-2.5 cursor-pointer ${hrTab === "daily" ? "text-white" : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <ClockIcon className="w-4 h-4 shrink-0" />
            <span>Daily Shift Tracker &amp; Approvals</span>
            {pendingEarlyCount > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black animate-pulse ${hrTab === "daily" ? "bg-white text-amber-600 shadow-2xs" : "bg-amber-500 text-white"
                  }`}
              >
                {pendingEarlyCount} Pending
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setHrTab("monthly")}
            className={`flex-1 py-3.5 sm:py-4 px-4 sm:px-6 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-2.5 cursor-pointer ${hrTab === "monthly" ? "text-white" : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <BarChartIcon className="w-4 h-4 shrink-0" />
            <span>Employee Monthly Summary</span>
          </button>
        </div>
      </div>

      {/* Tab Panes */}
      <div className="w-full">
        {/* Pane 1: Daily Shift Tracker & Approvals */}
        <div className={hrTab === "daily" ? "w-full animate-fadeIn" : "hidden"}>
          {renderDailyTracker()}
        </div>

        {/* Pane 2: Employee Monthly Summary */}
        <div className={hrTab === "monthly" ? "w-full animate-fadeIn" : "hidden"}>
          <EmployeeMonthlySummaryTable />
        </div>
      </div>
    </div>
  );
}

