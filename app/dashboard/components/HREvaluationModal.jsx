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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sm font-bold text-[#1f6fb2] shadow-2xs">
              {emp.avatar_url ? (
                <img src={emp.avatar_url} alt={emp.full_name} className="w-full h-full object-cover rounded-xl" />
              ) : (
                emp.full_name?.charAt(0) || "E"
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">{emp.full_name}</h2>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-sky-50 text-[#1f6fb2] border border-sky-200/80 font-mono">
                  {month} Review
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {emp.designation || "Team Member"} • {emp.department || "General"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer shadow-2xs"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[75vh] overflow-y-auto">
          {/* Left Column: 3-Pillar Factual Metrics (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1f6fb2] mb-2.5">
                3 Factual Pillars (80% Weight)
              </h3>

              {/* Pillar 1: Daily Attendance */}
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2 mb-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-bold text-slate-700">1. Daily Attendance</span>
                  </div>
                  <span className="text-xs font-bold text-[#1f6fb2] bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200 font-mono">
                    {scores.attendanceScore} / 40 pts
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                  <div>Present: <span className="font-semibold text-slate-800">{metrics.present_days} / {metrics.total_working_days} days</span></div>
                  <div>Late Delay: <span className="font-semibold text-amber-600">{metrics.time_delay_hours}h</span></div>
                </div>
              </div>

              {/* Pillar 2: Working Hours */}
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2 mb-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                    <span className="text-xs font-bold text-slate-700">2. Working Hours</span>
                  </div>
                  <span className="text-xs font-bold text-[#1f6fb2] bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200 font-mono">
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
                  <div className="flex justify-between text-[#1f6fb2] font-semibold">
                    <span>Completion Rate:</span>
                    <span>{metrics.completion_rate}%</span>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Leaves & Discipline */}
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2 mb-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                    <span className="text-xs font-bold text-slate-700">3. Leave & Discipline</span>
                  </div>
                  <span className="text-xs font-bold text-[#1f6fb2] bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200 font-mono">
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
            <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200/80 text-center space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Live Projected Monthly Score
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl font-black text-[#1f6fb2] tracking-tight font-mono">
                  {livePreview.finalScore}
                </span>
                <span className="text-sm font-bold text-slate-400">/ 100</span>
              </div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition-all">
                <span className={`px-2.5 py-0.5 rounded-lg border ${getBadgeStyle(livePreview.performanceBadge)}`}>
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
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">
                      HR Qualitative Rating (20% Weight)
                    </label>
                    <p className="text-[11px] text-slate-500">Rate work discipline, teamwork & overall contribution</p>
                  </div>
                  <div className="px-3 py-1 bg-sky-50 text-[#1f6fb2] border border-sky-200/80 rounded-xl text-xs font-bold font-mono shadow-2xs">
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
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1f6fb2]"
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
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 resize-none transition placeholder:text-slate-400 outline-none shadow-2xs"
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
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition placeholder:text-slate-400"
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
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || isEvaluated}
                className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs shadow-[#1f6fb2]/20"
              >
                {saving ? (
                  <span>Saving Evaluation...</span>
                ) : isEvaluated ? (
                  <span>✓ Already Evaluated</span>
                ) : (
                  <span>Submit & Store Evaluation</span>
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
