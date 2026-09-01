"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // 1. Verify invitation token on mount
  useEffect(() => {
    if (!token) {
      setLoadError("Invalid invitation link. No token provided.");
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`/api/invitations/verify-token?token=${encodeURIComponent(token)}`);
        const contentType = res.headers.get("content-type") || "";
        let data = {};
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const rawText = await res.text();
          console.warn("Non-JSON response from verify-token:", res.status, rawText.slice(0, 200));
          data = { message: "Failed to verify invitation link. Please verify the URL or request a new invite." };
        }

        if (!res.ok) {
          setLoadError(data.message || "Invalid or expired invitation link.");
          if (data.alreadyAccepted) {
            setTimeout(() => {
              router.push("/login");
            }, 3000);
          }
        } else {
          setInvitation(data.invitation);
        }
      } catch (err) {
        console.error("Error verifying invitation token:", err);
        setLoadError("Network error. Failed to verify invitation link.");
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token, router]);

  // Password strength calculation
  const getPasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: "", color: "" };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 1, label: "Weak", color: "bg-rose-500 text-rose-400" };
    if (score <= 4) return { score: 2, label: "Medium", color: "bg-amber-500 text-amber-400" };
    return { score: 3, label: "Strong", color: "bg-emerald-500 text-emerald-400" };
  };

  const strength = getPasswordStrength(password);

  // Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (!password) {
      setSubmitError("Please enter a new password.");
      return;
    }

    if (password.length < 6) {
      setSubmitError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/invitations/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const contentType = res.headers.get("content-type") || "";
      let data = {};
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        console.warn("Non-JSON response during password creation:", res.status, rawText.slice(0, 200));
        data = { message: "Server encountered an error activating account. Please try again." };
      }

      if (!res.ok) {
        setSubmitError(data.message || "Failed to create password.");
        setIsSubmitting(false);
      } else {
        setIsSuccess(true);
        setTimeout(() => {
          router.push("/login");
        }, 1500);
      }
    } catch (err) {
      console.error("Complete invitation error:", err);
      setSubmitError("Network error while creating password.");
      setIsSubmitting(false);
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin h-10 w-10 border-4 border-sky-500 border-t-transparent rounded-full"></div>
          <span className="text-sm font-medium text-slate-400">Verifying HR Invitation Link...</span>
        </div>
      </div>
    );
  }

  // Token Error State
  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-2xl border border-amber-500/20">
            ⚠️
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Invitation Link Issue</h2>
            <p className="text-sm text-slate-400 leading-relaxed">{loadError}</p>
          </div>
          <Link
            href="/login"
            className="block w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition"
          >
            Return to Login Page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-sky-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-7 shadow-2xl backdrop-blur-md relative z-10">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white text-xl mx-auto shadow-lg shadow-sky-500/20 border border-sky-400/30">
            {invitation?.companyName?.charAt(0).toUpperCase() || "H"}
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              Accept Invitation
            </h2>
            <p className="text-xs text-sky-400 font-semibold mt-1">
              {invitation?.companyName || "Company Workspace"}
            </p>
          </div>
        </div>

        {/* Candidate & Role Info Card */}
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Candidate Name:</span>
            <span className="font-bold text-white">{invitation?.fullName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Work Email:</span>
            <span className="font-mono text-sky-300 font-semibold">{invitation?.email}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">Assigned Position:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 text-[11px] font-bold border border-purple-500/20 capitalize">
              {invitation?.role?.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Success View */}
        {isSuccess ? (
          <div className="py-6 text-center space-y-4 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-3xl">
              🎉
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Password Set Successfully!</h3>
              <p className="text-xs text-slate-400">
                Your HR invitation is accepted and your profile is active. Redirecting to login...
              </p>
            </div>
            <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : (
          /* Password Form */
          <form onSubmit={handleSubmit} className="space-y-5 text-xs">
            {submitError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center space-x-2">
                <span>⚠️</span>
                <span>{submitError}</span>
              </div>
            )}

            {/* New Password Input */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold uppercase tracking-wider">
                Create New Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-sky-500 outline-none transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {/* Strength indicator */}
              {password && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400">Password Strength:</span>
                    <span className={`font-bold ${strength.color.split(" ")[1]}`}>{strength.label}</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full ${strength.color.split(" ")[0]} transition-all duration-300`}
                      style={{ width: `${(strength.score / 3) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-semibold uppercase tracking-wider">
                Confirm New Password *
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-sky-500 outline-none transition"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition shadow-lg shadow-sky-600/20 disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  <span>Activating Account...</span>
                </>
              ) : (
                <span>⚡ Accept Invitation & Activate Account</span>
              )}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-sky-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
