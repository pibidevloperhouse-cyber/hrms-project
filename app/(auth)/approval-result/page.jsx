"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ApprovalResultContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const company = searchParams.get("company");
  const decision = searchParams.get("decision");
  const message = searchParams.get("message");

  const configs = {
    approved: {
      icon: (
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      title: "Company Approved!",
      description: `${company || "The company"} has been approved successfully. The admin has been notified and can now sign in.`,
      borderColor: "border-emerald-200",
      bgGradient: "from-emerald-50 via-green-50 to-emerald-50",
    },
    rejected: {
      icon: (
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      ),
      iconBg: "bg-rose-100",
      iconColor: "text-rose-600",
      title: "Registration Rejected",
      description: `The registration request for ${company || "the company"} has been rejected. The applicant has been notified.`,
      borderColor: "border-rose-200",
      bgGradient: "from-rose-50 via-red-50 to-rose-50",
    },
    already_processed: {
      icon: (
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      title: "Already Processed",
      description: `This registration request for ${company || "the company"} has already been ${decision || "processed"}. No further action is needed.`,
      borderColor: "border-amber-200",
      bgGradient: "from-amber-50 via-yellow-50 to-amber-50",
    },
    error: {
      icon: (
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      title: "Something Went Wrong",
      description: message || "An unexpected error occurred while processing the registration request.",
      borderColor: "border-red-200",
      bgGradient: "from-red-50 via-rose-50 to-red-50",
    },
  };

  const config = configs[status] || configs.error;

  return (
    <div className={`min-h-screen bg-gradient-to-br ${config.bgGradient} to-sky-50 text-slate-800 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans`}>
      <div className={`w-full max-w-md bg-white border ${config.borderColor} rounded-3xl shadow-xl p-8 sm:p-10 text-center`}>
        
        {/* Icon */}
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl ${config.iconBg} ${config.iconColor} mb-6 shadow-inner`}>
          {config.icon}
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-3">
          {config.title}
        </h1>

        {/* Description */}
        <p className="text-sm text-slate-600 leading-relaxed mb-8">
          {config.description}
        </p>

        {/* Back Link */}
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold text-sm transition duration-150 shadow-lg shadow-sky-500/25"
        >
          Go to Login Page
        </Link>
      </div>
    </div>
  );
}

export default function ApprovalResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-sky-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <ApprovalResultContent />
    </Suspense>
  );
}
