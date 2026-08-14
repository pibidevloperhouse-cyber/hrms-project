"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function ResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const status = searchParams.get("status"); // 'accepted' | 'declined' | 'already_processed' | 'error'
  const company = searchParams.get("company") || "Company Workspace";
  const email = searchParams.get("email") || "";
  const decision = searchParams.get("decision") || "";
  const message = searchParams.get("message") || "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-950 to-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 text-center space-y-6">

        {/* Accepted View */}
        {status === "accepted" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2 shadow-inner animate-pulse">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                🎉 Offer Accepted!
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                Welcome to <strong className="text-sky-400">{company}</strong>! Your account has been activated and your login credentials have been sent to your email.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1 text-left">
              <div className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
                📌 Next Steps:
              </div>
              <p>1. Check your email (<span className="text-sky-400 font-mono">{email}</span>) for your generated username and temporary password.</p>
              <p>2. Click the button below to sign in to your workspace.</p>
            </div>

            <Link
              href={`/login?email=${encodeURIComponent(email)}`}
              className="inline-flex items-center justify-center w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-lg shadow-emerald-600/25"
            >
              Sign In to Your Workspace →
            </Link>
          </>
        )}

        {/* Declined View */}
        {status === "declined" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-slate-800 text-slate-400 border border-slate-700 mb-2">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">
                Response Recorded
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                You have declined the offer from <strong className="text-slate-200">{company}</strong>. We have updated your status and notified the HR department.
              </p>
            </div>

            <p className="text-xs text-slate-500">
              Thank you for your time, and we wish you success in your future endeavors.
            </p>
          </>
        )}

        {/* Already Processed View */}
        {status === "already_processed" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-2">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-white">
                Response Already Recorded
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                You have already responded to the invitation offer for <strong className="text-slate-200">{company}</strong> (Current Status: <span className="text-sky-400 uppercase font-bold">{decision}</span>).
              </p>
            </div>

            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition"
            >
              Go to Login Page
            </Link>
          </>
        )}

        {/* Error View */}
        {status === "error" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 mb-2">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-rose-400">
                Invalid Request
              </h1>
              <p className="text-sm text-slate-400">
                {message || "The invitation link is invalid or has expired."}
              </p>
            </div>

            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition"
            >
              Return to Sign In
            </Link>
          </>
        )}

      </div>
    </div>
  );
}

export default function EmployeeInviteResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-sky-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <ResultContent />
    </Suspense>
  );
}
