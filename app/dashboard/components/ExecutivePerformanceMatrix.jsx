"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  calculateOwnerCultureVisionScores,
  computeTriPillarFinalScore,
} from "@/lib/executiveEvaluationUtils";
import ToastNotification from "./common/ToastNotification";

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
        `Business Owner appraisal has already been finalized for ${
          currentEmp.full_name || "this employee"
        } for ${formatMonthName(modalMonth)}.`
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
      setFormError("Owner Feedback remarks are required before saving.");
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

  const modalMonthSelectOptions = monthOptions.filter((opt) => opt.value !== "ALL");

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn text-xs"
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <span className="px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-50 text-[#1f6fb2] dark:bg-blue-950 dark:text-sky-300 border border-blue-200 dark:border-blue-900 shadow-2xs shrink-0">
              {formatMonthName(modalMonth)}
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
              Executive Performance Calibration
            </span>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center text-sm transition cursor-pointer shrink-0"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveExecutiveAppraisal} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(88vh-140px)]">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <span>{formError}</span>
              </div>
            )}

            {/* Selection Controls: Month & Employee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Evaluation Month
                </label>
                <select
                  value={modalMonth}
                  onChange={(e) => setModalMonth(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  {modalMonthSelectOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Select Employee
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    required
                    value={currentEmp.id || ""}
                    onChange={(e) => onSelectEmployeeId(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium cursor-pointer"
                  >
                    {employees.map((empItem) => (
                      <option key={empItem.id} value={empItem.id}>
                        {empItem.full_name} ({empItem.designation || "Staff"})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={currentEmpIndex <= 0 || isSubmitting}
                    onClick={handlePrevEmp}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-40 shrink-0"
                    title="Previous Employee"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    disabled={currentEmpIndex < 0 || currentEmpIndex >= employees.length - 1 || isSubmitting}
                    onClick={handleNextEmp}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-40 shrink-0"
                    title="Next Employee"
                  >
                    ▶
                  </button>
                </div>
              </div>
            </div>

            {/* Pillar 1: HR Discipline Evaluation */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">
                  1. HR Discipline Evaluation (30% Weight)
                </span>
                <span className="font-bold font-mono text-[#1f6fb2] dark:text-sky-300">
                  {hr ? `${liveTriPillar.hrWeighted} / 30 pts` : "Pending HR Review"}
                </span>
              </div>
              {hr ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1 text-slate-600 dark:text-slate-300">
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Attendance</span>
                    <strong className="text-slate-800 dark:text-slate-200">{hr.presentDays} / {hr.totalWorkingDays} days ({hr.attendanceScore}/40 pts)</strong>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Working Hours</span>
                    <strong className="text-slate-800 dark:text-slate-200">{hr.actualWorkingHours}h ({hr.hoursScore}/40 pts)</strong>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Leave Discipline</span>
                    <strong className="text-slate-800 dark:text-slate-200">{hr.approvedLeaveDays} leaves ({hr.leaveScore}/20 pts)</strong>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">HR monthly evaluation not yet recorded for {formatMonthName(modalMonth)}.</p>
              )}
            </div>

            {/* Pillar 2: Manager Evaluation */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">
                  2. Manager / Team Lead Evaluation (40% Weight)
                </span>
                <span className="font-bold font-mono text-indigo-700 dark:text-indigo-300">
                  {tl ? `${liveTriPillar.tlWeighted} / 40 pts` : "Pending Manager Review"}
                </span>
              </div>
              {tl ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1 text-slate-600 dark:text-slate-300">
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Deadlines</span>
                    <strong className="text-slate-800 dark:text-slate-200">{tl.onTimeTasks} / {tl.totalTasks} on-time ({tl.autoTaskScore}/40 pts)</strong>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Skills &amp; Innovation</span>
                    <strong className="text-slate-800 dark:text-slate-200">Rating: {tl.learningRating}/10 · {tl.innovationRating}/10</strong>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Collaboration</span>
                    <strong className="text-slate-800 dark:text-slate-200">Rating: {tl.collaborationRating}/10 ({tl.collaborationScore}/20 pts)</strong>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">Manager monthly evaluation not yet recorded for {formatMonthName(modalMonth)}.</p>
              )}
            </div>

            {/* Pillar 3: Business Owner Executive Appraisal */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">
                  3. Business Owner Executive Appraisal (30% Weight)
                </span>
                <span className="font-bold font-mono text-emerald-700 dark:text-emerald-300">
                  {liveOwnerScores.ownerScore} / 30 pts
                </span>
              </div>

              {isOwnerEvaluated && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                  ✓ Finalized: Business Owner appraisal has already been recorded for this month.
                </div>
              )}

              {/* Sliders for Culture & Vision */}
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Culture Adaptation (1.0 - 10.0)</span>
                    <span className="font-mono text-[#1f6fb2] dark:text-sky-300">{Number(cultureRating).toFixed(1)} / 10 ({liveOwnerScores.cultureScore} / 15 pts)</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.5"
                    value={cultureRating}
                    onChange={(e) => setCultureRating(parseFloat(e.target.value))}
                    disabled={isSubmitting || isOwnerEvaluated}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#1f6fb2]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Alignment with Vision (1.0 - 10.0)</span>
                    <span className="font-mono text-[#1f6fb2] dark:text-sky-300">{Number(visionRating).toFixed(1)} / 10 ({liveOwnerScores.visionScore} / 15 pts)</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.5"
                    value={visionRating}
                    onChange={(e) => setVisionRating(parseFloat(e.target.value))}
                    disabled={isSubmitting || isOwnerEvaluated}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#1f6fb2]"
                  />
                </div>

                <div className="space-y-1 pt-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Owner Feedback Remarks
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Enter leadership feedback, guidance, and evaluation comments..."
                    value={ownerFeedback}
                    onChange={(e) => setOwnerFeedback(e.target.value)}
                    disabled={isSubmitting || isOwnerEvaluated}
                    className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl p-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none shadow-2xs transition resize-y font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Composite Score Summary Banner */}
            <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-600 dark:text-slate-400 font-medium">Final Composite Score:</span>
                <span className="ml-2 font-black text-[#1f6fb2] dark:text-sky-300 font-mono text-sm">
                  {liveTriPillar.finalCompositeScore} / 100
                </span>
                <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  (HR: {liveTriPillar.hrWeighted} + Mgr: {liveTriPillar.tlWeighted} + Owner: {liveOwnerScores.ownerScore})
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full font-bold text-white bg-[#1f6fb2] text-[11px] shadow-2xs">
                {liveTriPillar.performanceBadge}
              </span>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer shadow-2xs disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !currentEmp.id || !ownerFeedback.trim() || !canSave || isOwnerEvaluated}
              className="px-5 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isOwnerEvaluated ? "✓ Already Evaluated" : isSubmitting ? "Saving…" : "Save Evaluation"}
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
      style: "bg-slate-100 text-slate-600 border-slate-200",
    };
  };

  return (
    <div className="space-y-4 animate-fadeIn text-xs text-slate-800">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            Executive Performance &amp; Appraisals
          </h2>
          <p className="text-xs text-slate-500 pt-0.5">
            Calibrate Culture Adaptation and Vision Alignment to finalize monthly composite performance.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
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

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
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
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#1f6fb2] transition shadow-2xs font-medium"
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
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-[#1f6fb2] transition cursor-pointer shadow-2xs font-medium"
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
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-[#1f6fb2] transition cursor-pointer shadow-2xs font-medium"
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

      {/* Main Clean Employee Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-[#1f6fb2] border-t-transparent rounded-full animate-spin mx-auto" />
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
                <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
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
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1f6fb2] border border-blue-100 flex items-center justify-center font-bold text-xs shrink-0">
                            {emp.avatar_url ? (
                              <img src={emp.avatar_url} alt="" className="w-full h-full rounded-lg object-cover" />
                            ) : (
                              emp.full_name?.charAt(0)?.toUpperCase() || "E"
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{emp.full_name}</span>
                            <span className="text-[11px] text-slate-500 block font-mono">{emp.email}</span>
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
                            <span className="font-bold text-blue-700 text-xs font-mono">
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
                            <span className="font-bold text-indigo-700 text-xs font-mono">
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
                            <span className="font-bold text-emerald-700 text-xs font-mono">
                              {owner.ownerScore} / 30 pts
                            </span>
                            <span className="text-[10px] text-slate-500">
                              C:{owner.cultureRating} · V:{owner.visionRating}
                            </span>
                          </div>
                        ) : (
                          <span className="text-amber-600 font-medium text-[11px] bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
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
                        <span className={`whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center ${statusInfo.style}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Action: View / Calibrate */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenModal(emp.id)}
                          className={`px-3.5 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer inline-flex items-center gap-1 ${
                            owner
                              ? "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs"
                              : "bg-brand-gradient hover:opacity-95 text-white shadow-xs shadow-[#1f6fb2]/20"
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

      {/* Realistic SaaS Toast Notification */}
      <ToastNotification
        toast={toastMsg}
        onClose={() => setToastMsg(null)}
        duration={5500}
      />

      {/* Clean Centered Performance Popup */}
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
