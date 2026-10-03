"use client";

import React, { useEffect, useRef } from "react";

/**
 * ToastNotification Component
 * Ultra-clean, realistic, modern SaaS notification toast.
 * Centered at top, solid background (no bleed-through), crisp typography,
 * smooth animation, and auto-dismiss.
 */
export default function ToastNotification({
  toast,
  onClose,
  duration = 4500, // 4.5 seconds auto-dismiss
}) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!toast) return;

    timerRef.current = setTimeout(() => {
      if (onClose) onClose();
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, duration, onClose]);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (onClose) onClose();
    }, 2000);
  };

  if (!toast) return null;

  // Support both string message or object { message, type, title }
  const message = typeof toast === "string" ? toast : toast.message;
  if (!message) return null;

  const type = (typeof toast === "object" && toast.type) || "info";

  const typeConfig = {
    warning: {
      border: "border-amber-300 dark:border-amber-700 bg-amber-50/95 dark:bg-amber-950/95 shadow-amber-500/10",
      iconBg: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 ring-4 ring-amber-500/20",
      defaultTitle: "Notice",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    error: {
      border: "border-rose-200 dark:border-rose-800/80",
      iconBg: "bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 ring-4 ring-rose-500/10",
      defaultTitle: "Action Blocked",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-6 6m0-6l6 6" />
        </svg>
      ),
    },
    success: {
      border: "border-emerald-200 dark:border-emerald-800/80",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-500/10",
      defaultTitle: "Success",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    info: {
      border: "border-sky-200 dark:border-sky-800/80",
      iconBg: "bg-sky-100 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 ring-4 ring-sky-500/10",
      defaultTitle: "Information",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
        </svg>
      ),
    },
  };

  const config = typeConfig[type] || typeConfig.info;
  const title = (typeof toast === "object" && toast.title) || config.defaultTitle;

  return (
    <div className="fixed top-6 inset-x-0 z-[99999] flex justify-center pointer-events-none px-4 animate-fadeIn">
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`pointer-events-auto w-full max-w-md bg-white dark:bg-slate-900 border ${config.border} rounded-2xl shadow-2xl shadow-slate-900/15 dark:shadow-black/60 p-3.5 transition-all duration-200 ease-out hover:shadow-slate-900/20`}
      >
        <div className="flex items-start gap-3">
          {/* Vector Icon Capsule */}
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg} mt-0.5`}
          >
            {config.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
              {title}
            </h4>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed break-words">
              {message}
            </p>
          </div>

          {/* Close Action Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss notification"
            className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-xs transition-colors shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
