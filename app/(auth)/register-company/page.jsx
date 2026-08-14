"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterCompanyPage() {
  const router = useRouter();

  // 1. Form state
  const [formData, setFormData] = useState({
    companyName: "",
    companyEmail: "",
    phone: "",
    industry: "",
    adminName: "",
    adminPassword: "",
    confirmPassword: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Pending approval tracking state
  const [pendingRegistration, setPendingRegistration] = useState(null);
  const [approvalStatus, setApprovalStatus] = useState("pending"); // "pending" | "approved" | "rejected"
  const [lastChecked, setLastChecked] = useState(null);

  const industries = [
    "Information Technology & Software",
    "Healthcare & Life Sciences",
    "Finance & Banking",
    "E-Commerce & Retail",
    "Manufacturing & Logistics",
    "Education & EdTech",
    "Services & Consulting",
    "Other",
  ];

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // 2. Real-time Status Monitoring (Supabase Realtime + Polling Fallback)
  useEffect(() => {
    if (!pendingRegistration?.id || approvalStatus !== "pending") return;

    const supabase = createClient();

    // Instant Realtime WebSocket subscription
    const channel = supabase
      .channel(`pending-reg-${pendingRegistration.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pending_registrations",
          filter: `id=eq.${pendingRegistration.id}`,
        },
        (payload) => {
          if (payload.new?.status === "approved") {
            setApprovalStatus("approved");
            setTimeout(() => {
              router.push(`/login?approved=true&email=${encodeURIComponent(pendingRegistration.companyEmail)}`);
            }, 2000);
          } else if (payload.new?.status === "rejected") {
            setApprovalStatus("rejected");
          }
        }
      )
      .subscribe();

    // Fast polling fallback (every 2 seconds)
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/auth/check-status?id=${pendingRegistration.id}`);
        if (!res.ok) return;

        const data = await res.json();
        setLastChecked(new Date().toLocaleTimeString());

        if (data.status === "approved") {
          setApprovalStatus("approved");
          setTimeout(() => {
            router.push("/login");
          }, 1500);
        } else if (data.status === "rejected") {
          setApprovalStatus("rejected");
        }
      } catch (err) {
        console.error("Status check failed:", err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [pendingRegistration, approvalStatus, router]);

  // 3. Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    setErrorMessage("");

    if (!formData.companyName.trim()) {
      setErrorMessage("Please enter your Company Name.");
      return;
    }

    if (!formData.companyEmail.trim()) {
      setErrorMessage("Please enter your Company Work Email.");
      return;
    }

    if (!formData.companyEmail.includes("@") || !formData.companyEmail.includes(".")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (!formData.phone.trim()) {
      setErrorMessage("Please enter your Phone Number.");
      return;
    }

    if (!formData.industry) {
      setErrorMessage("Please select an Industry.");
      return;
    }

    if (!formData.adminName.trim()) {
      setErrorMessage("Please enter Admin Full Name.");
      return;
    }

    if (!formData.adminPassword) {
      setErrorMessage("Please enter Admin Password.");
      return;
    }

    if (formData.adminPassword.length < 8) {
      setErrorMessage("Admin Password must be at least 8 characters long.");
      return;
    }

    if (formData.adminPassword !== formData.confirmPassword) {
      setErrorMessage("Admin Password and Confirm Password do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formData.companyName.trim(),
          companyEmail: formData.companyEmail.trim().toLowerCase(),
          phone: formData.phone.trim(),
          industry: formData.industry,
          adminName: formData.adminName.trim(),
          adminPassword: formData.adminPassword,
        }),
      });

      let result = {};
      try {
        result = await response.json();
      } catch (jsonErr) {
        console.error("Non-JSON response during registration:", jsonErr);
        setErrorMessage("Server error during registration. Please try again.");
        return;
      }

      if (!response.ok) {
        setErrorMessage(result.message || "Registration failed.");
      } else {
        setPendingRegistration({
          id: result.pendingId,
          companyName: formData.companyName.trim(),
          companyEmail: formData.companyEmail.trim().toLowerCase(),
          adminName: formData.adminName.trim(),
        });
        setApprovalStatus("pending");
      }
    } catch (err) {
      console.error("Client registration error:", err);
      setErrorMessage(err?.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dynamic View: Render Pending / Approved / Rejected Card when registered
  if (pendingRegistration) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 text-slate-800 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
        <div className="w-full max-w-lg bg-white border border-sky-100 rounded-3xl shadow-xl shadow-sky-500/10 p-8 sm:p-10 text-center">

          {approvalStatus === "pending" && (
            <>
              <div className="relative inline-flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping"></div>
                <div className="w-20 h-20 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-inner relative z-10">
                  <svg className="w-10 h-10 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Awaiting Approval
              </h2>

              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Registration for <strong className="text-sky-900">{pendingRegistration.companyName}</strong> has been submitted. The system owner has been notified.
              </p>

              {/* Real-time Status Card */}
              <div className="bg-sky-50/80 border border-sky-200/80 rounded-2xl p-4 mb-6 space-y-2">
                <div className="flex items-center justify-center space-x-2 text-xs font-semibold text-sky-700 uppercase tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse"></span>
                  <span>Live Status Monitoring Active</span>
                </div>
                <p className="text-xs text-sky-800/80">
                  When approved on mobile or email, this screen will automatically refresh and open your portal.
                </p>
                {lastChecked && (
                  <p className="text-[11px] text-sky-600/70 pt-1">
                    Last sync check: {lastChecked}
                  </p>
                )}
              </div>

              <div className="flex justify-center items-center space-x-2 text-xs text-slate-500">
                <svg className="animate-spin h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Waiting for owner action...</span>
              </div>
            </>
          )}

          {approvalStatus === "approved" && (
            <>
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-100 text-emerald-600 mb-6 shadow-inner animate-pulse">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-emerald-950 mb-2">
                🎉 Registration Approved!
              </h2>

              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Great news! <strong className="text-emerald-900">{pendingRegistration.companyName}</strong> has been approved. Redirecting you to sign in...
              </p>

              <Link
                href={`/login?approved=true&email=${encodeURIComponent(pendingRegistration.companyEmail)}`}
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-lg shadow-emerald-500/25 w-full"
              >
                Proceed to Login Now →
              </Link>
            </>
          )}

          {approvalStatus === "rejected" && (
            <>
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-rose-100 text-rose-600 mb-6 shadow-inner">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-rose-950 mb-2">
                Registration Request Declined
              </h2>

              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Unfortunately, your registration request for {pendingRegistration.companyName} was not approved.
              </p>

              <button
                onClick={() => setPendingRegistration(null)}
                className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm transition"
              >
                Try Registering Again
              </button>
            </>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 text-slate-800 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-xl bg-white border border-sky-100 rounded-3xl shadow-xl shadow-sky-500/10 p-6 sm:p-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-100 text-sky-600 mb-3 shadow-inner">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0V7" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-sky-950">Register Your Company</h1>
          <p className="text-sm text-sky-700/80 mt-1.5">Enter your details to build your workspace</p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center space-x-2">
            <svg className="w-5 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Company Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Company Name *</label>
            <input
              type="text"
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              placeholder="e.g. Apex Innovations"
              className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
            />
          </div>

          {/* Company Email */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Company Work Email *</label>
            <input
              type="email"
              name="companyEmail"
              value={formData.companyEmail}
              onChange={handleChange}
              placeholder="admin@company.com"
              className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Phone Number *</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+1 (555) 000-0000"
                className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
              />
            </div>

            {/* Industry */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Industry *</label>
              <select
                name="industry"
                value={formData.industry}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
              >
                <option value="" className="text-slate-400">-- Select Industry --</option>
                {industries.map((ind) => (
                  <option key={ind} value={ind} className="text-slate-800">{ind}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Admin Name */}
          <div className="pt-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Admin Full Name *</label>
            <input
              type="text"
              name="adminName"
              value={formData.adminName}
              onChange={handleChange}
              placeholder="John Doe"
              className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Admin Password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Admin Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="adminPassword"
                  value={formData.adminPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-4 pr-12 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-xs font-semibold text-sky-600 hover:text-sky-800"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Confirm Password *</label>
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-6 py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold text-sm transition duration-150 shadow-lg shadow-sky-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Registering Company...</span>
              </>
            ) : (
              <span>Complete Registration</span>
            )}
          </button>

        </form>

        {/* Login Navigation Link */}
        <div className="mt-8 text-center pt-6 border-t border-sky-100 text-xs text-sky-800">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-sky-600 hover:text-sky-800 hover:underline">
            Sign In Here
          </Link>
        </div>

      </div>
    </div>
  );
}