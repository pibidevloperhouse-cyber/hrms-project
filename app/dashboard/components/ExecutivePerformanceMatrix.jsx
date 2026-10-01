"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  calculateOwnerCultureVisionScores,
  computeTriPillarFinalScore,
} from "@/lib/executiveEvaluationUtils";

// Timezone-safe month formatting helpers
function formatMonthName(monthStr) {
  if (!monthStr || monthStr === "ALL") return "All Months";
  const parts = monthStr.split("-");
  if (parts.length < 2) return monthStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return monthStr;
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatMonthShortLabel(monthStr) {
  if (!monthStr || monthStr === "ALL") return "All Months";
  const parts = monthStr.split("-");
  if (parts.length < 2) return monthStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return monthStr;
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * ExecutivePerformanceModal
 * A clean, centered popup modal for the Business Owner to analyze employee performance
 * and manually evaluate Culture Adaptation & Alignment with Vision to calibrate the final score.
 */
function ExecutivePerformanceModal({
  isOpen,
  onClose,
  matrix = [],
  employees = [],
  selectedEmployeeId,
  onSelectEmployeeId,
  monthOptions = [],
  onSaved,
}) {
  const [mounted, setMounted] = useState(false);
  const now = new Date();
  const defaultCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [modalMonth, setModalMonth] = useState(defaultCurrentMonth);

  // Business Owner Evaluation Form State
  const [cultureRating, setCultureRating] = useState(8.0);
  const [visionRating, setVisionRating] = useState(8.0);
  const [ownerFeedback, setOwnerFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setMounted(true);
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen, onClose]);

  // Reset to default current month whenever modal is newly opened
  useEffect(() => {
    if (isOpen) {
      setModalMonth(defaultCurrentMonth);
      setFormError("");
    }
  }, [isOpen, defaultCurrentMonth]);

  // Resolve current employee
  const currentEmp = useMemo(() => {
    return (
      employees.find((e) => e.id === selectedEmployeeId) ||
      matrix.find((m) => m.employee?.id === selectedEmployeeId || m.id === selectedEmployeeId)?.employee ||
      employees[0] ||
      {}
    );
  }, [employees, matrix, selectedEmployeeId]);

  // Find the exact evaluation record for (currentEmp.id, modalMonth)
  const currentItem = useMemo(() => {
    if (!currentEmp.id) return null;
    return (
      matrix.find(
        (m) =>
          (m.employee?.id === currentEmp.id || m.id === `${currentEmp.id}_${modalMonth}`) &&
          m.evaluationMonth === modalMonth
      ) ||
      matrix.find((m) => m.employee?.id === currentEmp.id && m.evaluationMonth === modalMonth) ||
      null
    );
  }, [matrix, currentEmp.id, modalMonth]);

  const hr = currentItem?.hrEvaluation || null;
  const tl = currentItem?.tlEvaluation || null;
  const ownerEval = currentItem?.ownerEvaluation || null;

  // Sync owner input fields with existing saved data or defaults when employee or month changes
  useEffect(() => {
    if (ownerEval) {
      setCultureRating(Number(ownerEval.cultureRating) || 8.0);
      setVisionRating(Number(ownerEval.visionRating) || 8.0);
      setOwnerFeedback(ownerEval.ownerFeedback || "");
    } else {
      setCultureRating(8.0);
      setVisionRating(8.0);
      setOwnerFeedback("");
    }
    setFormError("");
  }, [ownerEval, currentEmp.id, modalMonth]);

  // Live Tri-Pillar Score Calculations
  const liveOwnerScores = useMemo(() => {
    return calculateOwnerCultureVisionScores(cultureRating, visionRating);
  }, [cultureRating, visionRating]);

  const liveTriPillar = useMemo(() => {
    const hrScore = hr ? hr.finalScore : null;
    const tlScore = tl ? tl.finalScore : null;
    return computeTriPillarFinalScore(hrScore, tlScore, liveOwnerScores.ownerScore);
  }, [hr, tl, liveOwnerScores.ownerScore]);

  const currentEmpIndex = employees.findIndex((e) => e.id === currentEmp.id);

  const handlePrevEmp = () => {
    if (currentEmpIndex > 0) {
      onSelectEmployeeId(employees[currentEmpIndex - 1].id);
    }
  };

  const handleNextEmp = () => {
    if (currentEmpIndex >= 0 && currentEmpIndex < employees.length - 1) {
      onSelectEmployeeId(employees[currentEmpIndex + 1].id);
    }
  };

  const getBadgeClass = (badge) => {
    switch (badge) {
      case "Exceptional":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "High Performer":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "On Track":
        return "bg-sky-50 text-sky-700 border-sky-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const isHrPresent = Boolean(hr);
  const isTlPresent = Boolean(tl);
  const isOwnerEvaluated = Boolean(ownerEval);
  const canSave = isHrPresent && isTlPresent && !isOwnerEvaluated;

  // Submit Business Owner Appraisal
  const handleSaveExecutiveAppraisal = async (e) => {
    if (e) e.preventDefault();
    if (!currentEmp.id) return;

    if (isOwnerEvaluated) {
      setFormError(
        `Business Owner executive appraisal has already been submitted and finalized for ${
          currentEmp.full_name || "this employee"
        } for ${formatMonthName(modalMonth)}. Monthly appraisals can only be given once per month.`
      );
      return;
    }

    if (!isHrPresent || !isTlPresent) {
      const missing = [];
      if (!isHrPresent) missing.push("HR Discipline Evaluation");
      if (!isTlPresent) missing.push("Team Lead / Manager Evaluation");
      setFormError(
        `Cannot save appraisal: ${missing.join(" and ")} ${
          missing.length > 1 ? "are" : "is"
        } required before the Business Owner can calibrate the overall score.`
      );
      return;
    }

    if (!ownerFeedback.trim()) {
      setFormError("Owner Feedback Remarks are required before saving.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const res = await fetch("/api/performance/executive-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentEmp.id,
          evaluationMonth: modalMonth,
          cultureRating: Number(cultureRating),
          visionRating: Number(visionRating),
          ownerFeedback: ownerFeedback.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Failed to save executive appraisal.");
      }

      // Success
      if (onSaved) {
        onSaved(currentEmp.full_name, json.triPillarResult?.finalCompositeScore || liveTriPillar.finalCompositeScore);
      }
      onClose();
    } catch (err) {
      console.error("Save executive appraisal error:", err);
      setFormError(err.message || "An error occurred while saving. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  // Pure month options without "ALL" for modal dropdown
  const modalMonthSelectOptions = monthOptions.filter((opt) => opt.value !== "ALL");

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header format matching HR & TL modals */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900">Evaluate:</span>
            <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
              Executive Appraisal &amp; Performance
            </span>
            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {formatMonthName(modalMonth)}
            </span>
          </div>

          {/* Red square close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Form Body layout */}
        <form onSubmit={handleSaveExecutiveAppraisal} className="px-6 py-4 space-y-3.5 max-h-[82vh] overflow-y-auto">
          {formError && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          {/* Row: Evaluation Month */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">Evaluation Month</span>
            </label>
            <div className="flex-1">
              <select
                value={modalMonth}
                onChange={(e) => setModalMonth(e.target.value)}
                disabled={isSubmitting}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors cursor-pointer"
              >
                {modalMonthSelectOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: Select Employee */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">Select Employee</span>
            </label>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <select
                  required
                  value={currentEmp.id || ""}
                  onChange={(e) => onSelectEmployeeId(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors cursor-pointer"
                >
                  {employees.map((empItem) => (
                    <option key={empItem.id} value={empItem.id}>
                      {empItem.full_name} ({empItem.designation || "Staff"} · {empItem.department || "General"})
                    </option>
                  ))}
                </select>

                {/* Quick Prev / Next Buttons */}
                <button
                  type="button"
                  disabled={currentEmpIndex <= 0 || isSubmitting}
                  onClick={handlePrevEmp}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-medium transition cursor-pointer disabled:opacity-40 shrink-0"
                  title="Previous Employee"
                >
                  ◀
                </button>
                <button
                  type="button"
                  disabled={currentEmpIndex < 0 || currentEmpIndex >= employees.length - 1 || isSubmitting}
                  onClick={handleNextEmp}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-medium transition cursor-pointer disabled:opacity-40 shrink-0"
                  title="Next Employee"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* Section 1: HR Discipline Evaluation (30% Weight) */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3 flex items-center justify-between">
            <span>1. HR Discipline Evaluation (30% Weight)</span>
            <span className="text-xs font-mono font-bold text-blue-700">
              {hr ? `${liveTriPillar.hrWeighted} / 30 pts` : "Pending Review"}
            </span>
          </div>

          {hr ? (
            <div className="space-y-2.5 pt-1">
              {/* Daily Attendance */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Daily Attendance</span>
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                  <span className="text-xs text-slate-700 font-medium">
                    {hr.presentDays} of {hr.totalWorkingDays} working days present
                  </span>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    {hr.attendanceScore} / 40 pts
                  </span>
                </div>
              </div>

              {/* Working Hours */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Working Hours</span>
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                  <span className="text-xs text-slate-700 font-medium">
                    {hr.actualWorkingHours} hrs logged (expected {hr.expectedMonthlyHours}h)
                  </span>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    {hr.hoursScore} / 40 pts
                  </span>
                </div>
              </div>

              {/* Leave Discipline */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Leave Discipline</span>
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                  <span className="text-xs text-slate-700 font-medium">
                    {hr.approvedLeaveDays} approved leaves, {hr.absentDays} unapproved/absent
                  </span>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    {hr.leaveScore} / 20 pts
                  </span>
                </div>
              </div>

              {/* HR Feedback */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0 pt-1">
                  <span className="border-b-2 border-rose-500 pb-0.5">HR Feedback</span>
                </label>
                <div className="flex-1 border-b border-slate-300 pb-1.5 text-xs text-slate-700 italic">
                  "{hr.hrFeedback || "No feedback comments provided."}"
                </div>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-slate-400 italic">
              HR monthly evaluation not yet recorded for {formatMonthName(modalMonth)}.
            </div>
          )}

          {/* Section 2: Manager Evaluation (40% Weight) */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3 flex items-center justify-between">
            <span>2. Manager Evaluation (40% Weight)</span>
            <span className="text-xs font-mono font-bold text-blue-700">
              {tl ? `${liveTriPillar.tlWeighted} / 40 pts` : "Pending Review"}
            </span>
          </div>

          {tl ? (
            <div className="space-y-2.5 pt-1">
              {/* Task Deadlines */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Task Deadlines</span>
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                  <span className="text-xs text-slate-700 font-medium">
                    {tl.onTimeTasks} of {tl.totalTasks} tasks completed on-time
                  </span>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    {tl.autoTaskScore} / 40 pts
                  </span>
                </div>
              </div>

              {/* Learning Skills */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Learning Skills</span>
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                  <span className="text-xs text-slate-700 font-medium">
                    Manager Rating: {tl.learningRating} / 10
                  </span>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    {tl.learningScore} / 20 pts
                  </span>
                </div>
              </div>

              {/* Innovation */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Innovation</span>
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                  <span className="text-xs text-slate-700 font-medium">
                    Manager Rating: {tl.innovationRating} / 10
                  </span>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    {tl.innovationScore} / 20 pts
                  </span>
                </div>
              </div>

              {/* Collaboration */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Collaboration</span>
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                  <span className="text-xs text-slate-700 font-medium">
                    Manager Rating: {tl.collaborationRating} / 10
                  </span>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    {tl.collaborationScore} / 20 pts
                  </span>
                </div>
              </div>

              {/* Manager Feedback */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0 pt-1">
                  <span className="border-b-2 border-rose-500 pb-0.5">Manager Feedback</span>
                </label>
                <div className="flex-1 border-b border-slate-300 pb-1.5 text-xs text-slate-700 italic">
                  "{tl.tlFeedback || "No feedback comments provided."}"
                </div>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-slate-400 italic">
              Manager monthly evaluation not yet recorded for {formatMonthName(modalMonth)}.
            </div>
          )}

          {/* Section 3: Business Owner Executive Appraisal (30% Weight) */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3 flex items-center justify-between">
            <span>3. Business Owner Executive Appraisal (30% Weight)</span>
            <span className="text-xs font-mono font-bold text-blue-700">
              {liveOwnerScores.ownerScore} / 30 pts
            </span>
          </div>

          {/* Notice when already evaluated */}
          {isOwnerEvaluated && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-600 text-sm">✓</span>
                <span>
                  <strong>Finalized:</strong> Business Owner appraisal for <strong>{currentEmp.full_name || "this employee"}</strong> has already been submitted for {formatMonthName(modalMonth)} ({ownerEval?.ownerScore || liveOwnerScores.ownerScore} pts / Final Composite: {ownerEval?.finalCompositeScore || liveTriPillar.finalCompositeScore} pts). Evaluations can only be submitted once per month.
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            {/* Culture Adaptation */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                <span className="border-b-2 border-blue-600 pb-0.5">Culture Adaptation</span>
              </label>
              <div className="flex-1 flex items-center gap-3">
                <input
                  type="range"
                  min="1.0"
                  max="10.0"
                  step="0.5"
                  value={cultureRating}
                  onChange={(e) => setCultureRating(parseFloat(e.target.value))}
                  disabled={isSubmitting || isOwnerEvaluated}
                  className="flex-1 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                />
                <span className="w-28 text-center font-bold text-xs bg-blue-50 text-blue-700 py-1 px-2 rounded border border-blue-200 shrink-0 font-mono">
                  ⭐ {Number(cultureRating).toFixed(1)} ({liveOwnerScores.cultureScore} / 15)
                </span>
              </div>
            </div>

            {/* Alignment with Vision */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0">
                <span className="border-b-2 border-blue-600 pb-0.5">Alignment with Vision</span>
              </label>
              <div className="flex-1 flex items-center gap-3">
                <input
                  type="range"
                  min="1.0"
                  max="10.0"
                  step="0.5"
                  value={visionRating}
                  onChange={(e) => setVisionRating(parseFloat(e.target.value))}
                  disabled={isSubmitting || isOwnerEvaluated}
                  className="flex-1 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                />
                <span className="w-28 text-center font-bold text-xs bg-blue-50 text-blue-700 py-1 px-2 rounded border border-blue-200 shrink-0 font-mono">
                  ⭐ {Number(visionRating).toFixed(1)} ({liveOwnerScores.visionScore} / 15)
                </span>
              </div>
            </div>

            {/* Owner Feedback */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-2">
              <label className="sm:w-44 text-sm text-slate-700 font-medium shrink-0 pt-1">
                <span className="border-b-2 border-rose-500 pb-0.5">Owner Feedback</span>
              </label>
              <div className="flex-1">
                <textarea
                  rows={3}
                  required
                  placeholder="Enter executive feedback remarks, leadership notes, or mentorship guidance..."
                  value={ownerFeedback}
                  onChange={(e) => setOwnerFeedback(e.target.value)}
                  disabled={isSubmitting || isOwnerEvaluated}
                  className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Live Preview Score Banner */}
          <div className="p-3 rounded bg-blue-50/80 border border-blue-200 flex items-center justify-between text-xs animate-fadeIn mt-3">
            <div>
              <span className="text-slate-600 font-medium">Final Composite Score:</span>
              <span className="ml-2 font-black text-blue-700 font-mono text-sm">
                {liveTriPillar.finalCompositeScore} / 100
              </span>
              <span className="ml-2 text-[11px] text-slate-500 font-mono">
                (HR: {liveTriPillar.hrWeighted} + Mgr: {liveTriPillar.tlWeighted} + Owner: {liveOwnerScores.ownerScore})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Badge:</span>
              <span className="px-2.5 py-0.5 rounded font-bold text-white bg-blue-600 text-[11px] shadow-2xs">
                {liveTriPillar.performanceBadge}
              </span>
            </div>
          </div>

          {/* Prerequisite Alert Notification when HR or Manager evaluation is pending */}
          {!isOwnerEvaluated && !canSave && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5 animate-fadeIn">
              <span className="text-base leading-none text-amber-600 shrink-0">⚠️</span>
              <div className="space-y-0.5">
                <div className="font-bold text-amber-900">
                  Prerequisite Evaluation Required
                </div>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  {!isHrPresent && !isTlPresent
                    ? "Both HR Discipline Evaluation and Team Lead / Manager Evaluation must be completed before the Business Owner can save the overall performance calibration."
                    : !isHrPresent
                    ? "HR Discipline Evaluation is pending. It must be completed by HR before the Business Owner can save the overall appraisal."
                    : "Team Lead / Manager Evaluation is pending. It must be completed by the Team Lead / Manager before the Business Owner can save the overall appraisal."}
                </p>
              </div>
            </div>
          )}

          {/* Bottom Action Buttons */}
          <div className="pt-4 pb-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !currentEmp.id || !ownerFeedback.trim() || !canSave || isOwnerEvaluated}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              title={isOwnerEvaluated ? "Appraisal already submitted" : !canSave ? "HR and Manager evaluations must both be completed before saving" : "Save Evaluation"}
            >
              {isOwnerEvaluated ? "✓ Already Evaluated" : isSubmitting ? "Saving…" : "Save Evaluation"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

/**
 * ExecutivePerformanceMatrix
 * Main Business Owner performance console.
 * Displays unique employees in the main table with current performance snapshot.
 * Clicking "View Performance" opens the centered modal with the in-modal month switcher and manual appraisal inputs.
 */
export default function ExecutivePerformanceMatrix() {
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [selectedEmpIdForModal, setSelectedEmpIdForModal] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const showNotificationToast = (message, type = "info") => {
    setToastMsg({ message, type });
  };

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Month options (All available months from DB + last 24 months)
  const monthOptions = useMemo(() => {
    const options = [{ value: "ALL", label: "All Months (Complete Performance History)" }];
    const distinctSet = new Set(data?.availableMonths || []);
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      distinctSet.add(`${y}-${m}`);
    }
    const sorted = Array.from(distinctSet).sort().reverse();
    sorted.forEach((val) => {
      options.push({ value: val, label: formatMonthName(val) });
    });
    return options;
  }, [data?.availableMonths]);

  const fetchExecutiveSummary = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`/api/performance/executive-summary?month=ALL`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.error("Executive summary error response:", res.status, errJson);
      }
    } catch (err) {
      console.error("Failed to fetch executive summary:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExecutiveSummary(true);
  }, [fetchExecutiveSummary]);

  // Real-time live synchronization for HR, TL, and Owner submissions
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-executive-evals-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "monthly_employee_evaluations",
        },
        () => {
          fetchExecutiveSummary(false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "monthly_team_lead_evaluations",
        },
        () => {
          fetchExecutiveSummary(false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "monthly_executive_evaluations",
        },
        () => {
          fetchExecutiveSummary(false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "employees",
        },
        () => {
          fetchExecutiveSummary(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchExecutiveSummary]);

  const matrix = data?.matrix || [];

  // 1 row per unique employee for the main table (strictly for employee role)
  const uniqueEmployeesList = useMemo(() => {
    const map = new Map();
    matrix.forEach((item) => {
      const emp = item.employee;
      const empId = emp?.id;
      if (!empId) return;

      // Strictly include only staff in the employee role (exclude owner, admin, manager, team_lead, hr_manager, etc.)
      const roleStr = (emp?.role || "employee").toLowerCase().trim();
      if (roleStr !== "employee" && roleStr !== "staff") return;

      if (!map.has(empId)) {
        map.set(empId, item);
      } else {
        const existing = map.get(empId);
        if (item.evaluationMonth === currentMonthStr) {
          map.set(empId, item);
        } else if (existing.evaluationMonth !== currentMonthStr && item.evaluationMonth > existing.evaluationMonth) {
          map.set(empId, item);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      (a.employee?.full_name || "").localeCompare(b.employee?.full_name || "")
    );
  }, [matrix, currentMonthStr]);

  // Extract distinct employee list for modal switcher
  const employeesList = useMemo(() => {
    return uniqueEmployeesList.map((item) => item.employee).filter(Boolean);
  }, [uniqueEmployeesList]);

  const departments = useMemo(() => {
    const depts = new Set(employeesList.map((e) => e.department).filter(Boolean));
    return ["ALL", ...Array.from(depts)];
  }, [employeesList]);

  // Filtered unique employee rows
  const filteredEmployees = useMemo(() => {
    return uniqueEmployeesList.filter((item) => {
      const emp = item.employee || {};
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (emp.full_name && emp.full_name.toLowerCase().includes(q)) ||
        (emp.email && emp.email.toLowerCase().includes(q)) ||
        (emp.designation && emp.designation.toLowerCase().includes(q)) ||
        (emp.department && emp.department.toLowerCase().includes(q));

      const matchesDept = departmentFilter === "ALL" || emp.department === departmentFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        item.status === statusFilter ||
        (statusFilter === "FULLY_CALIBRATED" && (item.status === "FULLY_CALIBRATED" || item.ownerEvaluation)) ||
        (statusFilter === "AWAITING_OWNER" && item.status === "AWAITING_OWNER");

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [uniqueEmployeesList, searchQuery, departmentFilter, statusFilter]);

  const handleOpenModal = (employeeId) => {
    setSelectedEmpIdForModal(employeeId);
    setIsModalOpen(true);
  };

  const getBadgeStyle = (badge) => {
    switch (badge) {
      case "Exceptional":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "High Performer":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "On Track":
        return "bg-sky-50 text-sky-700 border-sky-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const getStatusBadge = (item) => {
    const hasHR = Boolean(item.hrEvaluation);
    const hasTL = Boolean(item.tlEvaluation);
    const hasOwner = Boolean(item.ownerEvaluation);

    if (hasHR && hasTL && hasOwner) {
      return {
        label: "Fully Calibrated",
        style: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    }
    if (hasHR && hasTL && !hasOwner) {
      return {
        label: "Awaiting Owner",
        style: "bg-amber-50 text-amber-700 border-amber-200",
      };
    }
    if (hasHR && !hasTL) {
      return {
        label: "HR Evaluated",
        style: "bg-sky-50 text-sky-700 border-sky-200",
      };
    }
    if (!hasHR && hasTL) {
      return {
        label: "TL Evaluated",
        style: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };
    }
    if (hasOwner) {
      return {
        label: "Owner Appraised",
        style: "bg-blue-50 text-blue-700 border-blue-200",
      };
    }
    return {
      label: "Pending Review",
      style: "bg-slate-50 text-slate-500 border-slate-200",
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Standard Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Executive Performance &amp; Appraisals
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Refresh Button */}
            <button
              onClick={() => fetchExecutiveSummary(true)}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
              title="Refresh Live Data"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 4 Standard Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Average Score
            </span>
            <div className="text-xl font-bold text-slate-900">{data?.averageScore || 0} / 100</div>
            <span className="text-[11px] text-slate-500">{data?.evaluatedEmployeesCount || 0} evaluations recorded</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Fully Calibrated
            </span>
            <div className="text-xl font-bold text-emerald-700">
              {uniqueEmployeesList.filter((i) => i.hrEvaluation && i.tlEvaluation && i.ownerEvaluation).length}
            </div>
            <span className="text-[11px] text-slate-500">HR, TL &amp; Owner complete</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Awaiting Owner
            </span>
            <div className="text-xl font-bold text-amber-600">
              {uniqueEmployeesList.filter((i) => i.hrEvaluation && i.tlEvaluation && !i.ownerEvaluation).length}
            </div>
            <span className="text-[11px] text-slate-500">Ready for Owner appraisal</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Pending HR/TL
            </span>
            <div className="text-xl font-bold text-slate-700">
              {uniqueEmployeesList.filter((i) => !i.hrEvaluation || !i.tlEvaluation).length}
            </div>
            <span className="text-[11px] text-slate-500">Awaiting department reviews</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search staff, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 transition cursor-pointer shadow-2xs"
          >
            <option value="ALL">All Departments</option>
            {departments
              .filter((d) => d !== "ALL")
              .map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 transition cursor-pointer shadow-2xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="FULLY_CALIBRATED">Fully Calibrated</option>
            <option value="AWAITING_OWNER">Awaiting Owner Appraisal</option>
            <option value="HR_ONLY">HR Evaluated</option>
            <option value="TL_ONLY">TL Evaluated</option>
            <option value="PENDING_BOTH">Pending Review</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <strong>{filteredEmployees.length}</strong> of <strong>{uniqueEmployeesList.length}</strong> employees
        </div>
      </div>

      {/* Main Clean Employee Table (1 row per unique employee) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-500 font-medium">Loading employee appraisals...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <p className="text-sm font-bold text-slate-700">No employees found matching criteria</p>
            <p className="text-xs text-slate-400">Try adjusting your search query or department filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Department &amp; Role</th>
                  <th className="py-3.5 px-4 text-center">HR Score (30%)</th>
                  <th className="py-3.5 px-4 text-center">Manager (40%)</th>
                  <th className="py-3.5 px-4 text-center">Owner (30%)</th>
                  <th className="py-3.5 px-4 text-center">Final Composite</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((item) => {
                  const emp = item.employee || {};
                  const hr = item.hrEvaluation;
                  const tl = item.tlEvaluation;
                  const owner = item.ownerEvaluation;
                  const statusInfo = getStatusBadge(item);

                  return (
                    <tr key={emp.id || item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Employee Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold text-xs shrink-0">
                            {emp.avatar_url ? (
                              <img src={emp.avatar_url} alt="" className="w-full h-full rounded-lg object-cover" />
                            ) : (
                              emp.full_name?.charAt(0)?.toUpperCase() || "E"
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{emp.full_name}</span>
                            <span className="text-[11px] text-slate-500 block">{emp.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Department & Role */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 block">{emp.department || "General"}</span>
                        <span className="text-[11px] text-slate-500 block">{emp.designation || "Staff"}</span>
                      </td>

                      {/* HR Score (30% weight) */}
                      <td className="py-3.5 px-4 text-center">
                        {hr ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="font-bold text-blue-700 text-xs">
                              {hr.finalScore} / 100
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({item.triPillar?.hrWeighted || Math.round(hr.finalScore * 0.3 * 10) / 10} pts)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Pending</span>
                        )}
                      </td>

                      {/* TL Score (40% weight) */}
                      <td className="py-3.5 px-4 text-center">
                        {tl ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="font-bold text-indigo-700 text-xs">
                              {tl.finalScore} / 100
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({item.triPillar?.tlWeighted || Math.round(tl.finalScore * 0.4 * 10) / 10} pts)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Pending</span>
                        )}
                      </td>

                      {/* Owner Score (30% weight) */}
                      <td className="py-3.5 px-4 text-center">
                        {owner ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="font-bold text-emerald-700 text-xs">
                              {owner.ownerScore} / 30 pts
                            </span>
                            <span className="text-[10px] text-slate-500">
                              C:{owner.cultureRating} · V:{owner.visionRating}
                            </span>
                          </div>
                        ) : (
                          <span className="text-amber-600 font-medium text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Final Composite Score & Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {item.overallScore !== null ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-sm font-extrabold text-slate-900 font-mono">
                              {item.overallScore}
                              <span className="text-[10px] text-slate-400 font-normal"> / 100</span>
                            </span>
                            {item.overallBadge && item.overallBadge !== "Needs Attention" && item.overallBadge !== "Pending" && (
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border mt-0.5 ${getBadgeStyle(item.overallBadge)}`}>
                                {item.overallBadge}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusInfo.style}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Action: View / Calibrate */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenModal(emp.id)}
                          className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition shadow-2xs cursor-pointer inline-flex items-center gap-1 ${
                            owner
                              ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          }`}
                        >
                          <span>{owner ? "View Appraisal" : "View & Calibrate"}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[999999] pointer-events-auto animate-scaleIn">
          <div className="relative pt-2.5">
            <div className="absolute top-0 left-4 z-10">
              <span
                className={`px-3 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-xs ${
                  toastMsg.type === "warning"
                    ? "bg-amber-500"
                    : toastMsg.type === "error"
                    ? "bg-rose-500"
                    : toastMsg.type === "info"
                    ? "bg-sky-500"
                    : "bg-emerald-500"
                }`}
              >
                {toastMsg.type === "warning"
                  ? "WARNING"
                  : toastMsg.type === "error"
                  ? "ERROR"
                  : toastMsg.type === "info"
                  ? "INFO"
                  : "SUCCESS"}
              </span>
            </div>

            <div
              className={`bg-white rounded-2xl border-2 px-4 py-3 shadow-xl flex items-center gap-3 min-w-[280px] sm:min-w-[340px] max-w-md ${
                toastMsg.type === "warning"
                  ? "border-amber-500 shadow-amber-500/10"
                  : toastMsg.type === "error"
                  ? "border-rose-500 shadow-rose-500/10"
                  : toastMsg.type === "info"
                  ? "border-sky-500 shadow-sky-500/10"
                  : "border-emerald-500 shadow-emerald-500/10"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${
                  toastMsg.type === "warning"
                    ? "border-amber-500 text-amber-500"
                    : toastMsg.type === "error"
                    ? "border-rose-500 text-rose-500"
                    : toastMsg.type === "info"
                    ? "border-sky-500 text-sky-500"
                    : "border-emerald-500 text-emerald-500"
                }`}
              >
                {toastMsg.type === "warning"
                  ? "!"
                  : toastMsg.type === "error"
                  ? "✕"
                  : toastMsg.type === "info"
                  ? "ℹ"
                  : "✓"}
              </div>

              <span className="flex-1 text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-snug">
                {toastMsg.message}
              </span>

              <button
                type="button"
                onClick={() => setToastMsg(null)}
                className="text-slate-400 hover:text-slate-700 shrink-0 text-xs font-bold cursor-pointer p-1 rounded-full hover:bg-slate-100 transition"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Centered Performance Popup with In-Modal Month Switcher and Manual Appraisal Form */}
      <ExecutivePerformanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        matrix={matrix}
        employees={employeesList}
        selectedEmployeeId={selectedEmpIdForModal}
        onSelectEmployeeId={(id) => setSelectedEmpIdForModal(id)}
        monthOptions={monthOptions}
        onSaved={(empName, score) => {
          fetchExecutiveSummary(false);
          showNotificationToast(
            `Executive appraisal saved for ${empName}! Composite Score: ${score}/100`,
            "success"
          );
        }}
      />
    </div>
  );
}
