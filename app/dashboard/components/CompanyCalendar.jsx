"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

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

function calculateHoursFromTimes(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;

  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const diffMinutes = endMinutes - startMinutes;
  const diffHours = Number((diffMinutes / 60).toFixed(1));
  return diffHours > 0 ? diffHours : null;
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

export default function CompanyCalendar() {
  const [loading, setLoading] = useState(true);
  const [isHR, setIsHR] = useState(false);
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
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch("/api/company/calendar", { headers });
      if (res.status === 401) {
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setIsHR(data.isHR || false);
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
    fetchCalendarData(true);
  }, []);

  // Save Working Schedule (HR Only)
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    setScheduleSaving(true);
    setNotice({ error: "", success: "" });

    try {
      const res = await fetch("/api/company/calendar/schedule", {
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
      const res = await fetch("/api/company/calendar/holidays", {
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
      const res = await fetch(`/api/company/calendar/holidays?id=${holidayId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to delete holiday.", success: "" });
      } else {
        setNotice({ error: "", success: data.message || "Holiday deleted." });
        setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
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

  // Upcoming Holidays Calculation
  const todayStr = new Date().toISOString().split("T")[0];
  const upcomingHolidays = holidays
    .filter((h) => h.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const nextHoliday = upcomingHolidays[0] || null;

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header */}
      <div className="bg-white border border-sky-100 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl">📅</span>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Company Working Calendar</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">
              {companyName}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isHR
              ? "HR Portal — Manage standard company working hours, work days, and official holidays."
              : "Employee Portal — View your company's official working schedule and upcoming holidays."}
          </p>
        </div>

        {/* Action Controls for HR */}
        {isHR && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={() => {
                setScheduleForm(schedule);
                setShowScheduleModal(true);
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-slate-700 text-xs font-semibold transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
            >
              <span>⚙️</span> Configure Working Hours
            </button>
            <button
              onClick={() => setShowHolidayModal(true)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-md shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🎉</span> Add Company Holiday
            </button>
          </div>
        )}
      </div>

      {/* Notice Banner */}
      {notice.error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
          <span>⚠️ {notice.error}</span>
          <button onClick={() => setNotice({ error: "", success: "" })} className="text-slate-400 hover:text-slate-700 cursor-pointer">✕</button>
        </div>
      )}
      {notice.success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2">
          <span>✅ {notice.success}</span>
          <button onClick={() => setNotice({ error: "", success: "" })} className="text-slate-400 hover:text-slate-700 cursor-pointer">✕</button>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Working Hours */}
        <div className="bg-white border border-sky-100 rounded-2xl p-5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Standard Working Hours</span>
            <span className="text-lg">⏱️</span>
          </div>
          <div className="text-2xl font-black text-slate-900">{schedule.dailyWorkingHours} Hours / Day</div>
          <div className="text-[11px] text-slate-500 font-mono">
            {schedule.startTime} — {schedule.endTime}
          </div>
        </div>

        {/* Work Days */}
        <div className="bg-white border border-sky-100 rounded-2xl p-5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Work Days</span>
            <span className="text-lg">🗓️</span>
          </div>
          <div className="text-2xl font-black text-sky-700">{schedule.workDays.length} Days / Week</div>
          <div className="text-[11px] text-slate-500 truncate">
            {schedule.workDays.join(", ")}
          </div>
        </div>

        {/* Total Holidays */}
        <div className="bg-white border border-sky-100 rounded-2xl p-5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Company Holidays</span>
            <span className="text-lg">🌴</span>
          </div>
          <div className="text-2xl font-black text-amber-700">{holidays.length} Holidays</div>
          <div className="text-[11px] text-slate-500">
            {upcomingHolidays.length} upcoming this year
          </div>
        </div>

        {/* Next Holiday */}
        <div className="bg-white border border-sky-100 rounded-2xl p-5 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Next Upcoming Holiday</span>
            <span className="text-lg">🎈</span>
          </div>
          {nextHoliday ? (
            <div>
              <div className="text-sm font-bold text-slate-900 truncate">{nextHoliday.title}</div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                {formatDateDisplay(nextHoliday.date)}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic py-1">No upcoming holidays scheduled</div>
          )}
        </div>
      </div>

      {/* Main Tabs Navigation & Calendar Area */}
      <div className="bg-white border border-sky-100 rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xs">
        
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-sky-100 pb-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("month")}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                activeTab === "month"
                  ? "bg-sky-600 text-white shadow-2xs"
                  : "bg-sky-50 text-slate-600 hover:text-slate-900"
              }`}
            >
              📅 Month View
            </button>
            <button
              onClick={() => setActiveTab("list")}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                activeTab === "list"
                  ? "bg-sky-600 text-white shadow-2xs"
                  : "bg-sky-50 text-slate-600 hover:text-slate-900"
              }`}
            >
              📋 Holidays ({holidays.length})
            </button>
          </div>

          {/* Month Navigator Controls */}
          {activeTab === "month" && (
            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto bg-sky-50/50 p-1.5 sm:p-0 rounded-xl sm:bg-transparent border sm:border-0 border-sky-100">
              <button
                onClick={prevMonth}
                className="w-8 h-8 rounded-lg bg-white sm:bg-sky-50 hover:bg-sky-100 border border-sky-200 text-slate-700 flex items-center justify-center text-sm font-bold transition cursor-pointer shrink-0"
              >
                ‹
              </button>
              <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono text-center flex-1 sm:flex-none sm:min-w-[130px]">
                {monthName} {currentYear}
              </span>
              <button
                onClick={nextMonth}
                className="w-8 h-8 rounded-lg bg-white sm:bg-sky-50 hover:bg-sky-100 border border-sky-200 text-slate-700 flex items-center justify-center text-sm font-bold transition cursor-pointer shrink-0"
              >
                ›
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500 text-xs">
            <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading company calendar data…</span>
          </div>
        ) : activeTab === "month" ? (
          /* MONTH GRID VIEW */
          <div className="space-y-2">
            <div className="text-[10px] text-slate-400 text-right sm:hidden">👈 Swipe horizontally to view full calendar grid 👉</div>
            <div className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="min-w-[580px] space-y-3">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-sky-900 uppercase tracking-wider pb-2 border-b border-sky-100">
                  <div>Mon</div>
                  <div>Tue</div>
                  <div>Wed</div>
                  <div>Thu</div>
                  <div>Fri</div>
                  <div className="text-amber-700">Sat</div>
                  <div className="text-amber-700">Sun</div>
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-2">
                  {monthDaysGrid.map((dayNum, idx) => {
                    if (!dayNum) {
                      return <div key={`empty-${idx}`} className="h-24 sm:h-28 rounded-xl bg-sky-50/20 border border-sky-100/50" />;
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
                            setHolidayForm({
                              title: "",
                              date: formattedDateStr,
                              holidayType: "Paid Holiday",
                              description: "",
                            });
                            setShowHolidayModal(true);
                          }
                        }}
                        className={`h-24 sm:h-28 rounded-xl p-2 border flex flex-col justify-between transition relative group ${
                          isHR ? "cursor-pointer hover:border-sky-400" : ""
                        } ${
                          isTodayDate
                            ? "bg-sky-100 border-sky-300 shadow-2xs"
                            : dayHolidays.length > 0
                            ? "bg-amber-50 border-amber-200"
                            : !isWorkDay
                            ? "bg-slate-50 border-slate-200 opacity-75"
                            : "bg-white border-sky-100"
                        }`}
                      >
                        {/* Top Row: Day Number & Status Badges */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-bold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center font-mono ${
                              isTodayDate
                                ? "bg-sky-600 text-white"
                                : "text-slate-800"
                            }`}
                          >
                            {dayNum}
                          </span>

                          {!isWorkDay && (
                            <span className="text-[8px] sm:text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-500">
                              End
                            </span>
                          )}
                        </div>

                        {/* Holidays Badge List */}
                        <div className="space-y-1 overflow-y-auto max-h-12 sm:max-h-14 pr-0.5">
                          {dayHolidays.map((h) => (
                            <div
                              key={h.id}
                              className="p-1 rounded bg-amber-100 border border-amber-200 text-amber-800 text-[9px] sm:text-[10px] font-bold truncate flex items-center gap-1 shadow-2xs"
                              title={`${h.title} (${h.holidayType})`}
                            >
                              <span>🌴</span>
                              <span className="truncate">{h.title}</span>
                            </div>
                          ))}
                        </div>

                        {/* Bottom HR Hover Hint */}
                        {isHR && (
                          <div className="text-[8px] sm:text-[9px] text-sky-700 font-semibold opacity-0 group-hover:opacity-100 transition truncate">
                            + Add holiday
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
          <div className="space-y-4">
            {holidays.length === 0 ? (
              <div className="py-12 text-center space-y-3 bg-sky-50/40 rounded-2xl border border-sky-100">
                <p className="text-sm font-bold text-slate-800">No Company Holidays Scheduled</p>
                <p className="text-xs text-slate-500">
                  {isHR
                    ? "Click 'Add Company Holiday' above to schedule official company holidays."
                    : "Your HR department has not scheduled any company holidays yet."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {holidays.map((h) => (
                  <div
                    key={h.id}
                    className="bg-white border border-sky-100 hover:border-sky-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition shadow-2xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base">🌴</span>
                        <h4 className="text-sm font-bold text-slate-900 truncate">{h.title}</h4>
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold shrink-0">
                          {h.holidayType}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-emerald-700 font-mono">
                        {formatDateDisplay(h.date)}
                      </p>
                      {h.description && (
                        <p className="text-xs text-slate-500 italic pt-0.5 leading-relaxed">{h.description}</p>
                      )}
                    </div>

                    {isHR && (
                      <button
                        onClick={() => handleDeleteHoliday(h.id)}
                        disabled={actionLoadingId === h.id}
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition disabled:opacity-50 cursor-pointer self-end sm:self-center shrink-0"
                        title="Delete holiday"
                      >
                        {actionLoadingId === h.id ? "…" : "🗑️ Delete"}
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-sky-100 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl animate-fadeIn max-h-[85vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-sky-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>⚙️</span> Configure Company Working Hours
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Set daily standard target hours, working window, and work days.</p>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-700 text-base cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
              
              {/* Start & End Time Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sky-900 font-bold uppercase tracking-wider">
                    Standard Start Time *
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.startTime}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      const calcHours = calculateHoursFromTimes(newStart, scheduleForm.endTime);
                      setScheduleForm((prev) => ({
                        ...prev,
                        startTime: newStart,
                        dailyWorkingHours: calcHours !== null ? calcHours : prev.dailyWorkingHours,
                      }));
                    }}
                    required
                    className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-slate-800 font-mono text-sm focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sky-900 font-bold uppercase tracking-wider">
                    Standard End Time *
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.endTime}
                    onChange={(e) => {
                      const newEnd = e.target.value;
                      const calcHours = calculateHoursFromTimes(scheduleForm.startTime, newEnd);
                      setScheduleForm((prev) => ({
                        ...prev,
                        endTime: newEnd,
                        dailyWorkingHours: calcHours !== null ? calcHours : prev.dailyWorkingHours,
                      }));
                    }}
                    required
                    className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-slate-800 font-mono text-sm focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Target Hours */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-sky-900 font-bold uppercase tracking-wider">
                    Daily Standard Target Hours *
                  </label>
                  <span className="text-[10px] text-sky-600 font-medium">
                    ✨ Auto-calculated from Start &amp; End time
                  </span>
                </div>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="24"
                  value={scheduleForm.dailyWorkingHours}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, dailyWorkingHours: e.target.value })
                  }
                  required
                  className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-slate-800 font-mono text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Work Days Checkboxes */}
              <div className="space-y-2">
                <label className="block text-sky-900 font-bold uppercase tracking-wider">
                  Active Working Days *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-sky-50/40 p-3 rounded-xl border border-sky-200">
                  {ALL_DAYS_OF_WEEK.map((day) => {
                    const isChecked = scheduleForm.workDays.includes(day);
                    return (
                      <label key={day} className="flex items-center gap-2 text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScheduleForm({
                                ...scheduleForm,
                                workDays: [...scheduleForm.workDays, day],
                              });
                            } else {
                              setScheduleForm({
                                ...scheduleForm,
                                workDays: scheduleForm.workDays.filter((d) => d !== day),
                              });
                            }
                          }}
                          className="w-4 h-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                        <span className="font-medium">{day}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-sky-100">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduleSaving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition disabled:opacity-50 shadow-md shadow-sky-500/20 cursor-pointer"
                >
                  {scheduleSaving ? "Saving Schedule…" : "Save Working Hours"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: ADD COMPANY HOLIDAY (HR ONLY) --- */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-sky-100 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl animate-fadeIn max-h-[85vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-sky-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>🎉</span> Add Company Holiday
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Schedule an official company holiday or mandatory day off.</p>
              </div>
              <button
                onClick={() => setShowHolidayModal(false)}
                className="text-slate-400 hover:text-slate-700 text-base cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddHoliday} className="space-y-4 text-xs">
              
              {/* Holiday Title */}
              <div className="space-y-1.5">
                <label className="block text-sky-900 font-bold uppercase tracking-wider">
                  Holiday Name / Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Independence Day / New Year Holiday"
                  value={holidayForm.title}
                  onChange={(e) => setHolidayForm({ ...holidayForm, title: e.target.value })}
                  required
                  className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-slate-800 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Date & Type Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sky-900 font-bold uppercase tracking-wider">
                    Holiday Date *
                  </label>
                  <input
                    type="date"
                    value={holidayForm.date}
                    onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                    required
                    className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-slate-800 font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sky-900 font-bold uppercase tracking-wider">
                    Holiday Type *
                  </label>
                  <select
                    value={holidayForm.holidayType}
                    onChange={(e) => setHolidayForm({ ...holidayForm, holidayType: e.target.value })}
                    className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-slate-800 text-xs focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    {HOLIDAY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-sky-900 font-bold uppercase tracking-wider">
                  Description / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Official paid company holiday for all departments..."
                  value={holidayForm.description}
                  onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
                  className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-3 text-slate-800 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-sky-100">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={holidaySaving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition disabled:opacity-50 shadow-md shadow-sky-500/20 cursor-pointer"
                >
                  {holidaySaving ? "Adding Holiday…" : "Add Holiday"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
