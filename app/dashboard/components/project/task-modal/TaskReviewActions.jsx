"use client";

import React from "react";

/**
 * TaskReviewActions Sub-Component
 * Renders revision request feedback modal when requested.
 */
export default function TaskReviewActions({
  showSuggestionsModal = false,
  setShowSuggestionsModal,
  suggestionNotes = "",
  setSuggestionNotes,
  isSubmitting = false,
  onConfirmSuggestions,
}) {
  if (!showSuggestionsModal) return null;

  return (
    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-3 animate-fadeIn shadow-2xs mt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
          Provide Revision Suggestions &amp; Feedback
        </span>
        <button
          type="button"
          onClick={() => setShowSuggestionsModal(false)}
          className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 font-semibold cursor-pointer"
        >
          ✕ Cancel
        </button>
      </div>
      <p className="text-[11px] text-amber-800 dark:text-amber-300/80 leading-relaxed">
        Explain what needs adjustment. The task will be moved back to &quot;To Do&quot; with your feedback.
      </p>
      <textarea
        rows={3}
        value={suggestionNotes}
        onChange={(e) => setSuggestionNotes(e.target.value)}
        placeholder="Describe the requested adjustments or test feedback..."
        className="w-full border border-amber-300 dark:border-amber-700/80 rounded-xl p-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 outline-none font-medium resize-none shadow-2xs"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowSuggestionsModal(false)}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-amber-100/60 transition cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSubmitting || !suggestionNotes.trim()}
          onClick={onConfirmSuggestions}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-all disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? "Submitting..." : "Submit Revisions"}
        </button>
      </div>
    </div>
  );
}
