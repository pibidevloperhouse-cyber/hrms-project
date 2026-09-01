"use client";

import React, { useState, useEffect } from "react";
import { UsersIcon, CheckCircleIcon, SparklesIcon } from "./AttendanceIcons";

/**
 * AttendanceOverviewCard Component
 * Displays today's organization-wide attendance stats & health score for the Owner/Manager.
 */
export default function AttendanceOverviewCard({ totalStaffCount = 1 }) {
  const [liveStats, setLiveStats] = useState({
    presentCount: 0,
    totalStaff: totalStaffCount,
    attendanceRate: 0,
  });

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch("/api/attendance/summary");
        if (res.ok) {
          const data = await res.json();
          setLiveStats({
            presentCount: data.presentCount ?? 0,
            totalStaff: data.totalStaffCount || totalStaffCount,
            attendanceRate: data.attendanceRate ?? 0,
          });
        }
      } catch (err) {
        console.error("Failed to fetch attendance summary:", err);
      }
    }
    fetchSummary();

    const interval = setInterval(fetchSummary, 5000);
    const handleUpdate = () => fetchSummary();
    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, [totalStaffCount]);

  const presentCount = liveStats.presentCount;
  const effectiveTotalStaff = Math.max(1, liveStats.totalStaff);
  const attendanceRate = liveStats.attendanceRate || (effectiveTotalStaff > 0 ? Math.round((presentCount / effectiveTotalStaff) * 100) : 0);
  const offlineCount = Math.max(0, effectiveTotalStaff - presentCount);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 hover:border-sky-200 transition duration-300 shadow-xs flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
              <UsersIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Today&apos;s Attendance Overview</h3>
              <p className="text-[11px] text-slate-500">Live organization presence</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{attendanceRate}% On-Duty</span>
          </span>
        </div>

        {/* Attendance Rate Metric */}
        <div className="flex items-center justify-between bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Attendance Rate</span>
            <div className="text-2xl font-black text-slate-900">{presentCount} / {effectiveTotalStaff} Present</div>
          </div>
          <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-emerald-200 flex items-center justify-center text-xs font-bold text-emerald-700 font-mono">
            {attendanceRate}%
          </div>
        </div>

        {/* Breakdown Stats Grid */}
        <div className="grid grid-cols-2 gap-3 text-center text-xs">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-0.5">
            <span className="text-[10px] text-emerald-700 font-semibold uppercase">Currently Checked In</span>
            <div className="text-xl font-bold text-emerald-800">{presentCount}</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
            <span className="text-[10px] text-slate-500 font-semibold uppercase">Off Duty / Offline</span>
            <div className="text-xl font-bold text-slate-700">{offlineCount}</div>
          </div>
        </div>
      </div>

      <div className="pt-2 text-center">
        <span className="text-[11px] text-slate-500 italic flex items-center justify-center gap-1">
          <SparklesIcon className="w-3 h-3 text-sky-500" />
          <span>Live attendance updates automatically as staff check in</span>
        </span>
      </div>
    </div>
  );
}
