"use client";

import { useState, useEffect, useCallback } from "react";

export default function LeaveManagement({ userRole, employeeProfile, company }) {
  const [leaves, setLeaves] = useState([]);
  const [balance, setBalance] = useState({
    allowance: 3.0,
    used: 0,
    available: 3.0,
    targetMonth: new Date().getMonth() + 1,
    targetYear: new Date().getFullYear(),
  });
  const [isHR, setIsHR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [warningNotice, setWarningNotice] = useState("");

  // Filter & Search states
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const initialIsHR = userRole === "hr_manager" || userRole === "hr_executive";
  const [activeTab, setActiveTab] = useState(initialIsHR ? "hr-inbox" : "my-leaves"); // "my-leaves" | "hr-inbox"

  // Apply Leave Modal State
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "Casual",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    reason: "",
  });

  // HR Action Modal State
  const [selectedLeaveForAction, setSelectedLeaveForAction] = useState(null);
  const [hrFeedback, setHrFeedback] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [companyHolidays, setCompanyHolidays] = useState([]);
  const [workDays, setWorkDays] = useState(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);

  // Derived state: calculate duration & validation directly during render
  const getCalculatedDaysAndValidation = () => {
    if (!leaveForm.start_date || !leaveForm.end_date) {
      return { days: 0, calendarDays: 0, offDayCount: 0, companyHolidayCount: 0, isValid: false, error: "Please select valid start and end dates." };
    }
    const todayStr = new Date().toISOString().split("T")[0];
    if (leaveForm.start_date < todayStr) {
      return {
        days: 0,
        calendarDays: 0,
        offDayCount: 0,
        companyHolidayCount: 0,
        isValid: false,
        error: "Start date cannot be before today's date. Please choose today or a future date.",
      };
    }

    const start = new Date(leaveForm.start_date);
    const end = new Date(leaveForm.end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { days: 0, calendarDays: 0, offDayCount: 0, companyHolidayCount: 0, isValid: false, error: "Invalid date format." };
    }
    if (end < start) {
      return { days: 0, calendarDays: 0, offDayCount: 0, companyHolidayCount: 0, isValid: false, error: "End date cannot be earlier than start date." };
    }

    // Build map of company holidays
    const holidayDatesMap = new Map();
    if (companyHolidays && companyHolidays.length > 0) {
      companyHolidays.forEach((h) => {
        if (h.date) holidayDatesMap.set(h.date, h.title);
      });
    }

    let calendarDays = 0;
    let effectiveWorkingDays = 0;
    let offDayCount = 0;
    let companyHolidayCount = 0;
    let firstHolidayTitle = null;
    let firstOffDayName = null;
    let firstOffDayDate = null;

    const curr = new Date(leaveForm.start_date);
    const stop = new Date(leaveForm.end_date);

    while (curr <= stop) {
      calendarDays++;
      const dateStr = curr.toISOString().split("T")[0];
      const dayName = curr.toLocaleDateString("en-US", { weekday: "long" });

      const isHoliday = holidayDatesMap.has(dateStr);
      const isWorkDay = workDays.includes(dayName);

      if (isHoliday) {
        companyHolidayCount++;
        if (!firstHolidayTitle) firstHolidayTitle = holidayDatesMap.get(dateStr);
      } else if (!isWorkDay) {
        offDayCount++;
        if (!firstOffDayName) {
          firstOffDayName = dayName;
          firstOffDayDate = dateStr;
        }
      } else {
        effectiveWorkingDays++;
      }

      curr.setDate(curr.getDate() + 1);
    }

    // Validation checks for non-working days & holidays
    if (effectiveWorkingDays <= 0) {
      if (companyHolidayCount > 0 && offDayCount === 0) {
        return {
          days: 0,
          calendarDays,
          offDayCount,
          companyHolidayCount,
          isValid: false,
          error: `🎉 Leave application disabled: Selected date(s) fall on an official company holiday ("${firstHolidayTitle}"). Company holidays are paid non-working days!`,
        };
      } else if (offDayCount > 0 && companyHolidayCount === 0) {
        return {
          days: 0,
          calendarDays,
          offDayCount,
          companyHolidayCount,
          isValid: false,
          error: `🏝️ Leave application disabled: ${firstOffDayDate} (${firstOffDayName}) is a company off-day / non-working day. Leave applications are not required or allowed on weekly off-days!`,
        };
      } else {
        return {
          days: 0,
          calendarDays,
          offDayCount,
          companyHolidayCount,
          isValid: false,
          error: `🏝️ Leave application disabled: Selected date(s) fall entirely on company holidays or weekly off-days. No leave application needed!`,
        };
      }
    }

    // Single date check
    if (leaveForm.start_date === leaveForm.end_date) {
      if (companyHolidayCount > 0) {
        return {
          days: 0,
          calendarDays,
          offDayCount,
          companyHolidayCount,
          isValid: false,
          error: `🎉 Leave application disabled: ${leaveForm.start_date} is an official company holiday ("${firstHolidayTitle}"). Company holidays are paid non-working days!`,
        };
      }
      if (offDayCount > 0) {
        return {
          days: 0,
          calendarDays,
          offDayCount,
          companyHolidayCount,
          isValid: false,
          error: `🏝️ Leave application disabled: ${leaveForm.start_date} (${firstOffDayName}) is a company off-day. Leave applications are not allowed on weekly off-days!`,
        };
      }
    }

    if (effectiveWorkingDays > balance.available) {
      return {
        days: effectiveWorkingDays,
        calendarDays,
        offDayCount,
        companyHolidayCount,
        isValid: false,
        error: `Insufficient leave balance! You requested ${effectiveWorkingDays} working day(s), but you only have ${balance.available} day(s) available for this month out of your 3-day allowance.`,
      };
    }

    return {
      days: effectiveWorkingDays,
      calendarDays,
      offDayCount,
      companyHolidayCount,
      isValid: true,
      error: "",
    };
  };

  const { days: calculatedDays, calendarDays: totalCalendarDays, offDayCount: totalOffDays, companyHolidayCount: totalHolidays, isValid: isFormValid, error: formValidationError } = getCalculatedDaysAndValidation();

  // Helper for manual re-fetching after actions
  const fetchLeaves = useCallback(async (month = selectedMonth, year = selectedYear) => {
    try {
      const res = await fetch(`/api/leaves?month=${month}&year=${year}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to fetch leave records.");
      }
      setLeaves(data.leaves || []);
      if (data.companyHolidays) setCompanyHolidays(data.companyHolidays || []);
      if (data.workDays) setWorkDays(data.workDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
      if (data.balance) setBalance(data.balance);
      setIsHR(Boolean(data.isHR));
      if (data.warning) setWarningNotice(data.warning);
    } catch (err) {
      console.error("Fetch Leaves Error:", err);
      setErrorMsg(err.message);
    }
  }, [selectedMonth, selectedYear]);

  // Initial and reactive data fetching in effect
  useEffect(() => {
    let isSubscribed = true;

    async function loadData() {
      try {
        const res = await fetch(`/api/leaves?month=${selectedMonth}&year=${selectedYear}`);
        const data = await res.json();
        if (!isSubscribed) return;
        if (!res.ok) {
          throw new Error(data.message || "Failed to fetch leave records.");
        }
        setLeaves(data.leaves || []);
        if (data.companyHolidays) setCompanyHolidays(data.companyHolidays || []);
        if (data.balance) setBalance(data.balance);
        setIsHR(Boolean(data.isHR));
        if (data.warning) setWarningNotice(data.warning);
      } catch (err) {
        if (isSubscribed) setErrorMsg(err.message);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    loadData();

    const handleLeaveEvent = () => {
      if (isSubscribed) loadData();
    };

    window.addEventListener("leave-request-updated", handleLeaveEvent);

    return () => {
      isSubscribed = false;
      window.removeEventListener("leave-request-updated", handleLeaveEvent);
    };
  }, [selectedMonth, selectedYear]);

  // Handle Create Request
  const handleSubmitLeaveRequest = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leaveForm),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to submit leave request.");
      }

      setSuccessMsg("Leave request submitted successfully for HR approval!");
      setIsApplyModalOpen(false);
      setLeaveForm({
        leave_type: "Casual",
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
        reason: "",
      });
      fetchLeaves(selectedMonth, selectedYear);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle HR Approve / Reject
  const handleHrAction = async (status) => {
    if (!selectedLeaveForAction) return;

    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/leaves/${selectedLeaveForAction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          hr_feedback: hrFeedback,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to process leave request.");
      }

      setSuccessMsg(`Leave request successfully ${status.toLowerCase()}!`);
      setSelectedLeaveForAction(null);
      setHrFeedback("");
      fetchLeaves(selectedMonth, selectedYear);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Cancel Request
  const handleCancelLeave = async (leaveId) => {
    if (!confirm("Are you sure you want to cancel this pending leave request?")) return;
    try {
      const res = await fetch(`/api/leaves/${leaveId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to cancel leave request.");
      setSuccessMsg("Leave request cancelled.");
      fetchLeaves(selectedMonth, selectedYear);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Filtered leaves logic
  const filteredLeaves = leaves.filter((l) => {
    // If HR is on "hr-inbox" tab: show all company employee leave requests
    if (activeTab === "hr-inbox") {
      if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const empName = l.employees?.full_name?.toLowerCase() || "";
        const empEmail = l.employees?.email?.toLowerCase() || "";
        const reason = l.reason?.toLowerCase() || "";
        const type = l.leave_type?.toLowerCase() || "";
        return empName.includes(term) || empEmail.includes(term) || reason.includes(term) || type.includes(term);
      }
      return true;
    }

    // If on "my-leaves" tab: show only current user's leaves
    if (activeTab === "my-leaves") {
      if (employeeProfile?.id && l.employee_id !== employeeProfile.id) return false;
    }

    if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const empName = l.employees?.full_name?.toLowerCase() || "";
      const empEmail = l.employees?.email?.toLowerCase() || "";
      const reason = l.reason?.toLowerCase() || "";
      const type = l.leave_type?.toLowerCase() || "";
      return empName.includes(term) || empEmail.includes(term) || reason.includes(term) || type.includes(term);
    }
    return true;
  });

  const isAdmin = userRole === "ADMIN";
  const isHRUser = userRole === "hr_manager" || userRole === "hr_executive";

  const getStatusBadge = (status, applicantRole) => {
    const isApplicantHR = applicantRole === "hr_manager" || applicantRole === "hr_executive";

    switch (status) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Approved {isApplicantHR ? "(by Owner)" : "(by HR)"}</span>
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            <span>Rejected {isApplicantHR ? "(by Owner)" : "(by HR)"}</span>
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            <span>Cancelled</span>
          </span>
        );
      default:
        return isApplicantHR ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
            <span>Pending Owner Review</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Pending HR Review</span>
          </span>
        );
    }
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner & Messages */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Leave Management</h1>
            {isHR && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                HR Portal
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Submit leave requests, review employee applications, and track your monthly quota.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsApplyModalOpen(true)}
            className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-xs shadow-sky-600/20 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Apply For Leave</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {warningNotice && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5">
          <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-bold">Database Setup Notice</p>
            <p className="text-xs text-amber-700 mt-0.5">{warningNotice}</p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="text-rose-400 hover:text-rose-700 cursor-pointer">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="text-emerald-500 hover:text-emerald-800 cursor-pointer">✕</button>
        </div>
      )}

      {/* Leave Balance Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Monthly Allowance */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-xl space-y-1 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Allowance</span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900">3.0 <span className="text-xs font-normal text-slate-500">Days</span></div>
          <p className="text-[11px] text-slate-500">Standard quota for {monthNames[selectedMonth - 1]}</p>
        </div>

        {/* Card 2: Used Days */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-xl space-y-1 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Days Consumed</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-xl font-bold text-amber-700">{balance.used.toFixed(1)} <span className="text-xs font-normal text-slate-500">Days</span></div>
          <p className="text-[11px] text-slate-500">Approved &amp; pending this month</p>
        </div>

        {/* Card 3: Available Balance */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-xl space-y-1 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Available Balance</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-700">{balance.available.toFixed(1)} <span className="text-xs font-normal text-slate-500">Days</span></div>
          <p className="text-[11px] text-slate-500">Remaining allowance for current month</p>
        </div>

        {/* Card 4: Monthly Refresh Info */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-xl space-y-1 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Allowance Rule</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>
          <div className="text-base font-bold text-slate-900">Auto Refreshed</div>
          <p className="text-[11px] text-slate-500">Resets to 3.0 days on 1st of month</p>
        </div>
      </div>

      {/* Main Tabs (If HR, show tab switcher between My Leaves & HR Approval Inbox) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isHR ? (
              <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl">
                <button
                  onClick={() => setActiveTab("hr-inbox")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    activeTab === "hr-inbox"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <span>Approval Inbox ({leaves.filter((l) => l.status === "PENDING").length})</span>
                </button>
                <button
                  onClick={() => setActiveTab("my-leaves")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    activeTab === "my-leaves"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>My Requests</span>
                </button>
              </div>
            ) : (
              <h2 className="text-sm font-bold text-slate-900">My Leave History</h2>
            )}
          </div>

          {/* Status & Search Filter Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search leaves..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white text-xs text-slate-800 placeholder-slate-400 pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-sky-500 shadow-2xs"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white text-xs font-semibold text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none cursor-pointer shadow-2xs"
            >
              <option value="ALL" className="bg-white">All Statuses</option>
              <option value="PENDING" className="bg-white">Pending Review</option>
              <option value="APPROVED" className="bg-white">Approved</option>
              <option value="REJECTED" className="bg-white">Rejected</option>
              <option value="CANCELLED" className="bg-white">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Leaves Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-2.5">
              <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-medium">Loading leave records...</p>
            </div>
          ) : filteredLeaves.length === 0 ? (
            <div className="py-16 text-center space-y-2 bg-slate-50/50">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-xs font-bold text-slate-800">No Leave Requests Found</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {activeTab === "hr-inbox"
                  ? "No employee leave requests submitted for this period."
                  : "You haven't submitted any leave requests for this period."}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-[10px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Date Range</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">HR Feedback Note</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredLeaves.map((l) => {
                  const isApplicantHR = ["hr_manager", "hr_executive"].includes(l.employees?.role);

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs uppercase border shadow-2xs ${
                            isApplicantHR
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-sky-50 text-sky-700 border-sky-200"
                          }`}>
                            {l.employees?.full_name ? l.employees.full_name.charAt(0) : "E"}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-slate-900 text-xs">{l.employees?.full_name || "Employee"}</p>
                              {isApplicantHR && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                                  HR
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono">{l.employees?.email || ""}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
                          {l.leave_type}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-xs font-mono">
                        <span className="text-slate-800 font-semibold">{l.start_date}</span>
                        <span className="text-slate-400 mx-1">to</span>
                        <span className="text-slate-800 font-semibold">{l.end_date}</span>
                      </td>

                      <td className="py-4 px-4 font-bold text-sky-700">
                        {l.total_days} {l.total_days === 1 ? "day" : "days"}
                      </td>

                      <td className="py-4 px-4 max-w-xs truncate text-xs text-slate-600" title={l.reason}>
                        {l.reason}
                      </td>

                      <td className="py-4 px-4">{getStatusBadge(l.status, l.employees?.role)}</td>

                      <td className="py-4 px-4 max-w-xs">
                        {l.hr_feedback ? (
                          <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-800">
                            <p className="font-semibold text-[10px] text-sky-700 uppercase tracking-wider">
                              {isApplicantHR ? "Note from Owner:" : "Note from HR:"}
                            </p>
                            <p className="italic mt-0.5">{l.hr_feedback}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-right">
                        {isHR && l.status === "PENDING" && activeTab === "hr-inbox" ? (
                          isApplicantHR && !isAdmin ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200"
                              title="HR leave requests can only be approved by the Company Owner"
                            >
                              <span>👑</span>
                              <span>Owner Action</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedLeaveForAction(l);
                                setHrFeedback("");
                              }}
                              className="bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs px-3 py-1.5 rounded-lg shadow-2xs transition-all cursor-pointer"
                            >
                              Review &amp; Action
                            </button>
                          )
                        ) : l.status === "PENDING" && (!isHR || activeTab === "my-leaves") ? (
                          <button
                            onClick={() => handleCancelLeave(l.id)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium hover:underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* --- APPLY LEAVE MODAL --- */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Submit Leave Request</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Available Monthly Balance: <span className="font-bold text-emerald-700">{balance.available} Days</span>
                </p>
              </div>
              <button
                onClick={() => setIsApplyModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-base p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitLeaveRequest} className="p-5 space-y-4">
              {isHRUser && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-600 shrink-0" />
                  <span>As HR Personnel, your request will be routed directly to the <strong>Company Owner</strong> for approval.</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Leave Type
                </label>
                <select
                  value={leaveForm.leave_type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                  className="w-full bg-white text-xs text-slate-800 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 shadow-2xs"
                >
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Annual">Annual Leave</option>
                  <option value="Emergency">Emergency Leave</option>
                  <option value="Unpaid">Unpaid Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full bg-white text-xs text-slate-800 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 shadow-2xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    min={leaveForm.start_date || new Date().toISOString().split("T")[0]}
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full bg-white text-xs text-slate-800 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 shadow-2xs font-mono"
                    required
                  />
                </div>
              </div>

              <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                isFormValid
                  ? "bg-slate-50 border-slate-200 text-slate-800"
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}>
                <div className="space-y-1">
                  <p className="font-bold text-xs text-slate-900">
                    Net Working Leave Deducted: {calculatedDays} {calculatedDays === 1 ? "Working Day" : "Working Days"}
                  </p>
                  
                  {isFormValid && (totalOffDays > 0 || totalHolidays > 0) && (
                    <p className="text-[11px] text-amber-800 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span>
                        Excluded {totalOffDays > 0 ? `${totalOffDays} off-day(s)` : ""}{totalOffDays > 0 && totalHolidays > 0 ? " & " : ""}{totalHolidays > 0 ? `${totalHolidays} holiday(s)` : ""} (0 leave charged for non-working days)
                      </span>
                    </p>
                  )}

                  {!isFormValid && (
                    <p className="mt-1 font-medium text-rose-700 leading-relaxed">{formValidationError}</p>
                  )}
                  
                  {isFormValid && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Within your available balance of {balance.available} days for this month.
                    </p>
                  )}
                </div>
                {isFormValid ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 ml-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 ml-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-sky-900 mb-1">
                  Reason for Leave
                </label>
                <textarea
                  rows={3}
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  placeholder="Provide brief details regarding your leave request..."
                  className="w-full bg-sky-50/50 text-sm text-slate-800 p-3 rounded-xl border border-sky-200 focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 bg-sky-100 border border-sky-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isFormValid || submitting}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
                    !isFormValid || submitting
                      ? "bg-slate-300 opacity-50 cursor-not-allowed"
                      : "bg-sky-600 hover:bg-sky-500 shadow-sky-500/20 cursor-pointer"
                  }`}
                >
                  {submitting
                    ? isHRUser ? "Submitting to Owner..." : "Submitting to HR..."
                    : isHRUser ? "Submit to Company Owner" : "Submit to HR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- HR / OWNER ACTION MODAL --- */}
      {selectedLeaveForAction && (() => {
        const isActionTargetHR = ["hr_manager", "hr_executive"].includes(selectedLeaveForAction.employees?.role);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <div className="bg-white border border-slate-200 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isAdmin && isActionTargetHR ? "Owner Review: HR Leave Request" : "HR Review & Approval Action"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review applicant details and record an official approval or rejection decision.
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLeaveForAction(null)}
                  className="text-slate-400 hover:text-slate-700 text-base p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Applicant:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedLeaveForAction.employees?.full_name || "Employee"}
                      {isActionTargetHR && (
                        <span className="ml-2 text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                          HR
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Department:</span>
                    <span className="text-slate-700 font-medium">{selectedLeaveForAction.employees?.department || "General"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Leave Type:</span>
                    <span className="font-semibold text-sky-700">{selectedLeaveForAction.leave_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-mono text-slate-800 font-bold">
                      {selectedLeaveForAction.start_date} to {selectedLeaveForAction.end_date} ({selectedLeaveForAction.total_days} days)
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200/80">
                    <span className="text-slate-500 block mb-1">Reason:</span>
                    <p className="text-slate-700 italic">{selectedLeaveForAction.reason}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAdmin ? "Owner Feedback Note" : "HR Feedback Note"}{" "}
                    <span className="text-slate-400 font-normal">(Visible to Applicant)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={hrFeedback}
                    onChange={(e) => setHrFeedback(e.target.value)}
                    placeholder="Enter feedback message (e.g. 'Approved: Have a good vacation!' or 'Rejected: Key deliverables scheduled on these dates')."
                    className="w-full bg-white text-xs text-slate-800 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 shadow-2xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedLeaveForAction(null)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleHrAction("REJECTED")}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Reject Request
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleHrAction("APPROVED")}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {actionLoading ? "Processing..." : "Approve Request"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
