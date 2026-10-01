"use client";

import React, { useState, useEffect } from "react";
import { authFetch } from "@/lib/api/authFetch";

const ALL_DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const HOLIDAY_TYPES = [
  "Paid Holiday",
  "National Holiday",
  "Regional / Festival",
  "Mandatory Closure",
  "Optional Holiday",
];

function calculateHoursBetween(start, end) {
  if (!start || !end) return 8.0;
  try {
    const [sH, sM] = start.split(":").map(Number);
    const [eH, eM] = end.split(":").map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 8.0;

    let diffMinutes = (eH * 60 + eM) - (sH * 60 + sM);
    if (diffMinutes <= 0) {
      diffMinutes += 24 * 60;
    }
    const hours = diffMinutes / 60;
    return Math.round(hours * 10) / 10;
  } catch {
    return 8.0;
  }
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function CompanyCalendar({ userRole }) {
  const [loading, setLoading] = useState(true);
  const [isHR, setIsHR] = useState(
    () => ["ADMIN", "hr_manager", "hr_executive"].includes(userRole)
  );
  const [companyName, setCompanyName] = useState("");
  
  const [schedule, setSchedule] = useState({
    dailyWorkingHours: 8.0,
    startTime: "09:00",
    endTime: "17:00",
    workDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  });

  const [holidays, setHolidays] = useState([]);
  const [notice, setNotice] = useState({ error: "", success: "" });

  // Date Navigation State for Month View
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [activeTab, setActiveTab] = useState("month"); // 'month' | 'list'

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    dailyWorkingHours: 8.0,
    startTime: "09:00",
    endTime: "17:00",
    workDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    holidayType: "Paid Holiday",
    description: "",
  });
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Fetch Calendar Data
  const fetchCalendarData = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await authFetch("/api/company/calendar");
      if (res.status === 401) {
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const roleDeterminedIsHR = data.isHR ?? ["ADMIN", "hr_manager", "hr_executive"].includes(data.userRole || userRole);
        setIsHR(Boolean(roleDeterminedIsHR));
        setCompanyName(data.companyName || "Company Workspace");
        if (data.schedule) {
          setSchedule(data.schedule);
          setScheduleForm(data.schedule);
        }
        if (data.holidays) {
          setHolidays(data.holidays);
        }
      }
    } catch (err) {
      console.error("Failed to fetch company calendar:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isSubscribed = true;
    (async () => {
      if (isSubscribed) {
        await fetchCalendarData(true);
      }
    })();
    return () => {
      isSubscribed = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  // Save Working Schedule (HR Only)
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    setScheduleSaving(true);
    setNotice({ error: "", success: "" });

    try {
      const res = await authFetch("/api/company/calendar/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to update working schedule.", success: "" });
      } else {
        if (data.schedule) setSchedule(data.schedule);
        setNotice({ error: "", success: data.message || "Working hours updated successfully!" });
        setShowScheduleModal(false);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("attendance-updated"));
          window.dispatchEvent(new Event("company-calendar-updated"));
          window.dispatchEvent(new Event("company-schedule-updated"));
        }
      }
    } catch {
      setNotice({ error: "Network error saving working schedule.", success: "" });
    } finally {
      setScheduleSaving(false);
    }
  };

  // Add Holiday (HR Only)
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!holidayForm.title.trim() || !holidayForm.date) {
      setNotice({ error: "Please enter holiday title and date.", success: "" });
      return;
    }

    setHolidaySaving(true);
    setNotice({ error: "", success: "" });

    try {
      const res = await authFetch("/api/company/calendar/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(holidayForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to add holiday.", success: "" });
      } else {
        setNotice({ error: "", success: data.message || "Holiday added successfully!" });
        setShowHolidayModal(false);
        setHolidayForm({
          title: "",
          date: new Date().toISOString().split("T")[0],
          holidayType: "Paid Holiday",
          description: "",
        });
        fetchCalendarData(true);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("company-calendar-updated"));
        }
      }
    } catch {
      setNotice({ error: "Network error adding holiday.", success: "" });
    } finally {
      setHolidaySaving(false);
    }
  };

  // Delete Holiday (HR Only)
  const handleDeleteHoliday = async (holidayId) => {
    if (!confirm("Are you sure you want to remove this holiday from the company calendar?")) return;
    setActionLoadingId(holidayId);
    setNotice({ error: "", success: "" });

    try {
      const res = await authFetch(`/api/company/calendar/holidays?id=${holidayId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to delete holiday.", success: "" });
      } else {
        setNotice({ error: "", success: data.message || "Holiday deleted." });
        setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("company-calendar-updated"));
        }
      }
    } catch {
      setNotice({ error: "Network error deleting holiday.", success: "" });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Month Navigation
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString("en-US", {
    month: "long",
  });

  // Calculate Days Grid for Month View
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0=Sun, 1=Mon...
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Mon=0, Sun=6

  const monthDaysGrid = [];
  for (let i = 0; i < adjustedFirstDay; i++) {
    monthDaysGrid.push(null); // blank padding
  }
  for (let day = 1; day <= daysInMonth; day++) {
    monthDaysGrid.push(day);
  }

  // Find Holidays for selected month
  const getHolidaysForDay = (dayNum) => {
    if (!dayNum) return [];
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    return holidays.filter((h) => h.date === dateStr);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Company Working Calendar</h2>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold">
            {companyName}
          </span>
        </div>

        {/* Action Controls for HR */}
        {isHR && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => {
                setNotice({ error: "", success: "" });
                const autoHours = calculateHoursBetween(schedule.startTime, schedule.endTime);
                setScheduleForm({
                  ...schedule,
                  dailyWorkingHours: autoHours,
                });
                setShowScheduleModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Configure Hours</span>
            </button>
            <button
              onClick={() => {
                setNotice({ error: "", success: "" });
                setShowHolidayModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs font-semibold transition shadow-md shadow-[#1f6fb2]/20 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>Add Holiday</span>
            </button>
          </div>
        )}
      </div>

      {/* Notice Banner */}
      {notice.error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
          <span>{notice.error}</span>
          <button onClick={() => setNotice({ error: "", success: "" })} className="text-rose-400 hover:text-rose-700 cursor-pointer">✕</button>
        </div>
      )}
      {notice.success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2">
          <span>{notice.success}</span>
          <button onClick={() => setNotice({ error: "", success: "" })} className="text-emerald-500 hover:text-emerald-800 cursor-pointer">✕</button>
        </div>
      )}

      {/* Clean 3-Card Professional KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Working Hours */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Standard Working Hours</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{schedule.dailyWorkingHours} hrs <span className="text-xs text-slate-500 font-normal font-sans">/ day</span></div>
        </div>

        {/* Work Days */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Work Days</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">{schedule.workDays.length} Days <span className="text-xs text-slate-500 font-normal">/ week</span></div>
        </div>

        {/* Total Holidays */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Company Holidays</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">{holidays.length} Days</div>
        </div>
      </div>

      {/* Main Tabs Navigation & Calendar Area */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs">
        
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("month")}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                activeTab === "month"
                  ? "bg-white text-slate-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Month Grid
            </button>
            <button
              onClick={() => setActiveTab("list")}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                activeTab === "list"
                  ? "bg-white text-slate-900 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Holidays Directory ({holidays.length})
            </button>
          </div>

          {/* Month Navigator Controls */}
          {activeTab === "month" && (
            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
              <button
                onClick={prevMonth}
                className="w-8 h-8 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-2xs"
                title="Previous Month"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono text-center min-w-[130px] px-2">
                {monthName} {currentYear}
              </span>
              <button
                onClick={nextMonth}
                className="w-8 h-8 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-2xs"
                title="Next Month"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-slate-500 text-xs">
            <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <span className="font-medium">Loading calendar schedule...</span>
          </div>
        ) : activeTab === "month" ? (
          /* MONTH GRID VIEW */
          <div className="space-y-2">
            <div className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="min-w-[620px] space-y-2">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-wider pb-2 border-b border-slate-100 text-slate-500">
                  <div>Mon</div>
                  <div>Tue</div>
                  <div>Wed</div>
                  <div>Thu</div>
                  <div>Fri</div>
                  <div className="text-slate-400">Sat</div>
                  <div className="text-slate-400">Sun</div>
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-2">
                  {monthDaysGrid.map((dayNum, idx) => {
                    if (!dayNum) {
                      return <div key={`empty-${idx}`} className="h-24 sm:h-26 rounded-xl bg-slate-50/50 border border-slate-100" />;
                    }

                    const isTodayDate =
                      dayNum === today.getDate() &&
                      currentMonth === today.getMonth() &&
                      currentYear === today.getFullYear();

                    const dateObj = new Date(currentYear, currentMonth, dayNum);
                    const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
                    const isWorkDay = schedule.workDays.includes(dayName);
                    const dayHolidays = getHolidaysForDay(dayNum);

                    const formattedDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

                    return (
                      <div
                        key={`day-${dayNum}`}
                        onClick={() => {
                          if (isHR) {
                            setNotice({ error: "", success: "" });
                            setHolidayForm({
                              title: "",
                              date: formattedDateStr,
                              holidayType: "Paid Holiday",
                              description: "",
                            });
                            setShowHolidayModal(true);
                          }
                        }}
                        className={`h-24 sm:h-26 rounded-xl p-2 border flex flex-col justify-between transition-all relative group ${
                          isHR ? "cursor-pointer hover:border-sky-400" : ""
                        } ${
                          isTodayDate
                            ? "bg-sky-50/70 border-sky-300 ring-1 ring-sky-300/60 shadow-xs"
                            : dayHolidays.length > 0
                            ? "bg-amber-50/70 border-amber-200 shadow-2xs"
                            : !isWorkDay
                            ? "bg-slate-50/70 border-slate-100"
                            : "bg-white border-slate-200/70 hover:border-slate-300"
                        }`}
                      >
                        {/* Top Row: Day Number & Status Badges */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-semibold rounded-lg w-6 h-6 flex items-center justify-center font-mono ${
                              isTodayDate
                                ? "bg-sky-600 text-white font-bold"
                                : !isWorkDay
                                ? "text-slate-400 font-medium"
                                : "text-slate-800"
                            }`}
                          >
                            {dayNum}
                          </span>

                          {!isWorkDay && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">
                              Off
                            </span>
                          )}
                        </div>

                        {/* Holidays Badge List */}
                        <div className="space-y-1 overflow-y-auto max-h-12 pr-0.5">
                          {dayHolidays.map((h) => (
                            <div
                              key={h.id}
                              className="px-1.5 py-0.5 rounded-md bg-amber-100/80 border border-amber-200/80 text-amber-900 text-[10px] font-semibold truncate flex items-center gap-1 shadow-2xs"
                              title={`${h.title} (${h.holidayType})`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                              <span className="truncate">{h.title}</span>
                            </div>
                          ))}
                        </div>

                        {/* Bottom HR Hover Hint */}
                        {isHR && (
                          <div className="text-[9px] text-sky-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity truncate">
                            + Holiday
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* HOLIDAY LIST VIEW */
          <div className="space-y-3">
            {holidays.length === 0 ? (
              <div className="py-16 text-center space-y-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs font-semibold text-slate-700">No Company Holidays</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {isHR
                    ? "Click 'Add Holiday' above to add recognized company holidays."
                    : "No official company holidays for this period."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {holidays.map((h) => (
                  <div
                    key={h.id}
                    className="bg-white border border-slate-200/80 hover:border-slate-300 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors shadow-2xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <h4 className="text-xs font-bold text-slate-900 truncate">{h.title}</h4>
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold shrink-0">
                          {h.holidayType}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-emerald-700 font-mono">
                        {formatDateDisplay(h.date)}
                      </p>
                      {h.description && (
                        <p className="text-xs text-slate-500 italic pt-0.5 leading-relaxed truncate">{h.description}</p>
                      )}
                    </div>

                    {isHR && (
                      <button
                        onClick={() => handleDeleteHoliday(h.id)}
                        disabled={actionLoadingId === h.id}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer self-end sm:self-center shrink-0"
                        title="Delete holiday"
                      >
                        {actionLoadingId === h.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- MODAL 1: CONFIGURE WORKING HOURS (HR ONLY) --- */}
      {showScheduleModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !scheduleSaving) setShowScheduleModal(false);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Top Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-1.5 font-sans">
                <span className="font-bold text-slate-900 text-sm sm:text-base">Configure:</span>
                <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
                  Working Hours &amp; Schedule
                </span>
              </div>

              {/* Close button */}
              <button
                type="button"
                disabled={scheduleSaving}
                onClick={() => setShowScheduleModal(false)}
                className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveSchedule} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {notice.error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {notice.error}
                </div>
              )}

              {/* Section 1: Working Time Window & Auto-Calculated Target Hours */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                  Working Time Window
                </span>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700">
                    Start Time
                  </label>
                  <div className="flex-1">
                    <input
                      type="time"
                      required
                      value={scheduleForm.startTime}
                      onChange={(e) => {
                        const newStart = e.target.value;
                        const calculatedHours = calculateHoursBetween(newStart, scheduleForm.endTime);
                        setScheduleForm((prev) => ({
                          ...prev,
                          startTime: newStart,
                          dailyWorkingHours: calculatedHours,
                        }));
                      }}
                      className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700">
                    End Time
                  </label>
                  <div className="flex-1">
                    <input
                      type="time"
                      required
                      value={scheduleForm.endTime}
                      onChange={(e) => {
                        const newEnd = e.target.value;
                        const calculatedHours = calculateHoursBetween(scheduleForm.startTime, newEnd);
                        setScheduleForm((prev) => ({
                          ...prev,
                          endTime: newEnd,
                          dailyWorkingHours: calculatedHours,
                        }));
                      }}
                      className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition"
                    />
                  </div>
                </div>

                {/* Target Hours (Auto Calculated & Disabled) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700">
                    Target Hours
                  </label>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      disabled
                      readOnly
                      value={scheduleForm.dailyWorkingHours}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 text-slate-700 font-mono outline-none shadow-2xs cursor-not-allowed select-none font-semibold"
                    />
                    <span className="text-xs text-slate-500 font-medium shrink-0">hrs/day</span>
                  </div>
                </div>
              </div>

              {/* Small separation divider */}
              <div className="border-t border-slate-100" />

              {/* Section 3: Active Work Days */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                  Active Work Days ({scheduleForm.workDays.length} Days)
                </span>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700">
                    Schedule Days
                  </label>
                  <div className="flex-1 flex flex-wrap items-center gap-1.5">
                    {ALL_DAYS_OF_WEEK.map((day) => {
                      const isChecked = scheduleForm.workDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              setScheduleForm((prev) => ({
                                ...prev,
                                workDays: prev.workDays.filter((d) => d !== day),
                              }));
                            } else {
                              setScheduleForm((prev) => ({
                                ...prev,
                                workDays: [...prev.workDays, day],
                              }));
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            isChecked
                              ? "bg-brand-gradient text-white shadow-xs"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80"
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={scheduleSaving || scheduleForm.workDays.length === 0}
                  className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20"
                >
                  {scheduleSaving ? "Saving…" : "Save Schedule"}
                </button>
                <button
                  type="button"
                  disabled={scheduleSaving}
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: ADD COMPANY HOLIDAY (HR ONLY) --- */}
      {showHolidayModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !holidaySaving) setShowHolidayModal(false);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Top Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-1.5 font-sans">
                <span className="font-bold text-slate-900 text-sm sm:text-base">Add:</span>
                <span className="text-[#2ec4b6] font-bold text-sm sm:text-base">
                  Company Holiday
                </span>
              </div>

              {/* Close button */}
              <button
                type="button"
                disabled={holidaySaving}
                onClick={() => setShowHolidayModal(false)}
                className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleAddHoliday} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {notice.error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {notice.error}
                </div>
              )}

              {/* Section 1: Holiday Title & Date */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700">
                    Holiday Name
                  </label>
                  <div className="flex-1">
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g., Independence Day / Spring Festival"
                      value={holidayForm.title}
                      onChange={(e) => setHolidayForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full border border-slate-200 focus:border-[#2ec4b6] focus:ring-2 focus:ring-[#2ec4b6]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 transition placeholder:text-slate-400 outline-none shadow-2xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700">
                    Holiday Date
                  </label>
                  <div className="flex-1">
                    <input
                      type="date"
                      required
                      value={holidayForm.date}
                      onChange={(e) => setHolidayForm((prev) => ({ ...prev, date: e.target.value }))}
                      className="w-full border border-slate-200 focus:border-[#2ec4b6] focus:ring-2 focus:ring-[#2ec4b6]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition"
                    />
                  </div>
                </div>
              </div>

              {/* Small separation divider */}
              <div className="border-t border-slate-100" />

              {/* Section 2: Details */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-[#2ec4b6] uppercase tracking-wider block">
                  Classification &amp; Details
                </span>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700">
                    Holiday Type
                  </label>
                  <div className="flex-1">
                    <select
                      value={holidayForm.holidayType}
                      onChange={(e) => setHolidayForm((prev) => ({ ...prev, holidayType: e.target.value }))}
                      className="w-full border border-slate-200 focus:border-[#2ec4b6] focus:ring-2 focus:ring-[#2ec4b6]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 cursor-pointer outline-none shadow-2xs transition"
                    >
                      {HOLIDAY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700 pt-1">
                    Description
                  </label>
                  <div className="flex-1">
                    <textarea
                      rows={2}
                      placeholder="Optional notes or remarks regarding this holiday..."
                      value={holidayForm.description}
                      onChange={(e) => setHolidayForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="w-full border border-slate-200 focus:border-[#2ec4b6] focus:ring-2 focus:ring-[#2ec4b6]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 resize-none transition placeholder:text-slate-400 outline-none shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={holidaySaving || !holidayForm.title.trim() || !holidayForm.date}
                  className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20"
                >
                  {holidaySaving ? "Adding…" : "Add Holiday"}
                </button>
                <button
                  type="button"
                  disabled={holidaySaving}
                  onClick={() => setShowHolidayModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
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
