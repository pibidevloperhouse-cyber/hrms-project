"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { computeFinalMonthlyEvaluation } from "@/lib/monthlyEvaluationUtils";

export default function HREvaluationModal({
  isOpen,
  onClose,
  employeeData,
  month,
  onSaveSuccess,
}) {
  const [mounted, setMounted] = useState(false);
  const [hrRating, setHrRating] = useState(8.0);
  const [hrFeedback, setHrFeedback] = useState("");
  const [strengths, setStrengths] = useState("");
  const [areasForImprovement, setAreasForImprovement] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-fill existing evaluation data if available
  useEffect(() => {
    if (employeeData?.evaluation) {
      setHrRating(employeeData.evaluation.hrRating || 8.0);
      setHrFeedback(employeeData.evaluation.hrFeedback || "");
      setStrengths(employeeData.evaluation.strengths || "");
      setAreasForImprovement(employeeData.evaluation.areasForImprovement || "");
    } else {
      setHrRating(8.0);
      setHrFeedback("");
      setStrengths("");
      setAreasForImprovement("");
    }
    setErrorMessage("");
  }, [employeeData]);

  if (!isOpen || !employeeData) return null;

  const emp = employeeData.employee || {};
  const metrics = employeeData.metrics || {};
  const scores = employeeData.scores || {};
  const autoBaseScore = scores.autoBaseScore || 0;

  // Live Score Calculation (80% 3-Pillars + 20% HR Rating)
  const livePreview = computeFinalMonthlyEvaluation(autoBaseScore, hrRating);

  const getBadgeStyle = (badge) => {
    switch (badge) {
      case "Exceptional":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20";
      case "High Performer":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/20";
      case "On Track":
        return "bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/20";
      default:
        return "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20";
    }
  };

  const isEvaluated = Boolean(employeeData?.isEvaluated);

  const handleSaveEvaluation = async (e) => {
    e.preventDefault();
    if (isEvaluated) {
      setErrorMessage("HR evaluation for this employee has already been submitted for this month and cannot be modified.");
      return;
    }
    if (!hrFeedback.trim()) {
      setErrorMessage("Please enter qualitative HR feedback remarks.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/performance/monthly-hr/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: emp.id,
          evaluationMonth: month,
          hrRating: Number(hrRating),
          hrFeedback: hrFeedback.trim(),
          strengths: strengths.trim(),
          areasForImprovement: areasForImprovement.trim(),
          metrics: metrics,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save monthly evaluation.");
      }

      if (onSaveSuccess) {
        onSaveSuccess(data.evaluation);
      }
      onClose();
    } catch (err) {
      console.error("Save evaluation error:", err);
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-xl font-bold text-white shadow-inner">
              {emp.avatar_url ? (
                <img src={emp.avatar_url} alt={emp.full_name} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                emp.full_name?.charAt(0) || "E"
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">{emp.full_name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {month} Review
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {emp.designation || "Team Member"} • {emp.department || "General"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[75vh] overflow-y-auto">
          {/* Left Column: 3-Pillar Factual Metrics (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                3 Factual Pillars (80% Weight)
              </h3>

              {/* Pillar 1: Daily Attendance */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-bold text-slate-700">1. Daily Attendance</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    {scores.attendanceScore} / 40 pts
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                  <div>Present: <span className="font-semibold text-slate-800">{metrics.present_days} / {metrics.total_working_days} days</span></div>
                  <div>Late Delay: <span className="font-semibold text-amber-600">{metrics.time_delay_hours}h</span></div>
                </div>
              </div>

              {/* Pillar 2: Working Hours */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                    <span className="text-xs font-bold text-slate-700">2. Working Hours</span>
                  </div>
                  <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                    {scores.hoursScore} / 40 pts
                  </span>
                </div>
                <div className="space-y-1 pt-1 border-t border-slate-200/60 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <span>Actual Logged:</span>
                    <span className="font-semibold text-slate-800">{metrics.actual_working_hours} hrs</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monthly Target:</span>
                    <span className="font-semibold text-slate-800">{metrics.expected_monthly_hours} hrs</span>
                  </div>
                  <div className="flex justify-between text-indigo-600 font-semibold">
                    <span>Completion Rate:</span>
                    <span>{metrics.completion_rate}%</span>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Leaves & Discipline */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                    <span className="text-xs font-bold text-slate-700">3. Leave & Discipline</span>
                  </div>
                  <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                    {scores.leaveScore} / 20 pts
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                  <div>Approved Leaves: <span className="font-semibold text-slate-800">{metrics.approved_leave_days}d</span></div>
                  <div>Absences: <span className={`font-semibold ${metrics.absent_days > 0 ? "text-rose-600" : "text-emerald-600"}`}>{metrics.absent_days}d</span></div>
                </div>
              </div>
            </div>

            {/* Live Calculated Score Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-slate-100 border border-indigo-100 text-center space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Live Projected Monthly Score
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl font-black text-indigo-950 tracking-tight">
                  {livePreview.finalScore}
                </span>
                <span className="text-sm font-bold text-slate-400">/ 100</span>
              </div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ring-2 ring-offset-1 transition-all">
                <span className={`px-2 py-0.5 rounded-full border ${getBadgeStyle(livePreview.performanceBadge)}`}>
                  {livePreview.performanceBadge}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">
                Formula: (3-Pillars Auto Score × 80%) + (HR Rating × 20%)
              </p>
            </div>
          </div>

          {/* Right Column: HR Evaluation Form (7 Cols) */}
          <form onSubmit={handleSaveEvaluation} className="lg:col-span-7 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              {/* HR Rating Slider (1.0 to 10.0) */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">
                      HR Qualitative Rating (20% Weight)
                    </label>
                    <p className="text-[11px] text-slate-500">Rate work discipline, teamwork & overall contribution</p>
                  </div>
                  <div className="px-3 py-1 bg-indigo-600 text-white rounded-xl text-sm font-black shadow-xs">
                    {Number(hrRating).toFixed(1)} / 10.0
                  </div>
                </div>

                <input
                  type="range"
                  min="1.0"
                  max="10.0"
                  step="0.5"
                  value={hrRating}
                  onChange={(e) => setHrRating(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />

                <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                  <span>1.0 (Critical)</span>
                  <span>5.0 (Moderate)</span>
                  <span>8.0 (Good)</span>
                  <span>10.0 (Outstanding)</span>
                </div>
              </div>

              {/* HR Written Feedback (Mandatory) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>HR Feedback Remarks *</span>
                  <span className="text-[10px] font-normal text-slate-400">Visible to Employee</span>
                </label>
                <textarea
                  rows="3"
                  value={hrFeedback}
                  onChange={(e) => setHrFeedback(e.target.value)}
                  placeholder="E.g., Consistently on time, completed expected working hours without delay, proactive team communication..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                  required
                />
              </div>

              {/* Strengths Noticed */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">Key Strengths Noticed</label>
                <input
                  type="text"
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  placeholder="E.g., Punctuality, Full hours compliance, High attendance..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Areas for Growth */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">Areas for Improvement / Next Month Target</label>
                <input
                  type="text"
                  value={areasForImprovement}
                  onChange={(e) => setAreasForImprovement(e.target.value)}
                  placeholder="E.g., Minimize late check-ins, maintain continuous shift hours..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || isEvaluated}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold transition shadow-md shadow-indigo-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Saving Evaluation...</span>
                  </>
                ) : isEvaluated ? (
                  <span>✓ Already Evaluated</span>
                ) : (
                  <>
                    <span>Submit & Store Evaluation</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(modalContent, document.body) : null;
}
