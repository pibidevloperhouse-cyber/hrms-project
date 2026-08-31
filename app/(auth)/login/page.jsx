"use client";
// c
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    const approvedParam = searchParams.get("approved");

    if (emailParam) {
      setFormData((prev) => ({ ...prev, email: emailParam }));
    }
    if (approvedParam === "true") {
      setSuccessMessage("🎉 Your registration is approved! Please sign in to complete your company setup.");
    }
  }, [searchParams]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  /**
   * Given a valid session (access_token + refresh_token), call the API route
   * to fetch company / employee profile data and redirect accordingly.
   */
  const fetchProfileAndRedirect = async (session) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });

      clearTimeout(timeout);

      let data = null;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try { data = await res.json(); } catch (_) { /* ignore */ }
      }

      // Even if the profile fetch fails, we have a valid session — redirect to dashboard
      const targetUrl = data?.requiresSetup ? "/company-wizard" : "/dashboard";
      setSuccessMessage("Login successful! Redirecting to workspace...");
      await new Promise((r) => setTimeout(r, 100));
      window.location.replace(targetUrl);
    } catch (_) {
      // Profile fetch failed or timed out — session is still valid, just go to dashboard
      setSuccessMessage("Login successful! Redirecting to workspace...");
      await new Promise((r) => setTimeout(r, 100));
      window.location.replace("/dashboard");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();

    setErrorMessage("");
    setSuccessMessage("");

    if (!formData.email.trim()) {
      setErrorMessage("Please enter your email address or username.");
      return;
    }

    if (!formData.password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsSubmitting(true);

    const emailInput = formData.email.trim();
    const isUsername = !emailInput.includes("@");

    try {
      // ── STEP 1: Resolve username → email (only needed for username logins) ──
      let targetEmail = emailInput.toLowerCase();
      if (isUsername) {
        try {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 5000);
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ email: emailInput, password: formData.password }),
          });
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const data = await res.json();
            // If server authenticated successfully via username path, use that result directly
            if (res.ok && data?.success && data?.session) {
              const supabase = createClient();
              try {
                await Promise.race([
                  supabase.auth.setSession({
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                  }),
                  new Promise((_, reject) => setTimeout(() => reject(), 4000)),
                ]);
              } catch (_) { /* non-fatal */ }
              const targetUrl = data.requiresSetup ? "/company-wizard" : "/dashboard";
              setSuccessMessage("Login successful! Redirecting to workspace...");
              await new Promise((r) => setTimeout(r, 100));
              window.location.replace(targetUrl);
              return;
            }
            // Server returned a proper auth error (wrong credentials) — show it and stop
            if ((res.status === 401 || res.status === 400) && data?.message) {
              setErrorMessage(data.message);
              setIsSubmitting(false);
              return;
            }

            if (res.status === 504) {
              setErrorMessage("Supabase authentication service is currently unresponsive. Please restart the project from the Supabase dashboard or check project health.");
              setIsSubmitting(false);
              return;
            }
          }
        } catch (_) {
          // Server request failed — fall through to direct client-side auth
        }
      }

      // ── STEP 2: Authenticate directly in the browser with a 10-second timeout guard ──
      const supabase = createClient();
      let authData = null;
      let authError = null;

      try {
        const authPromise = supabase.auth.signInWithPassword({
          email: targetEmail,
          password: formData.password,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 10000)
        );

        const raceResult = await Promise.race([authPromise, timeoutPromise]);
        authData = raceResult.data;
        authError = raceResult.error;
      } catch (authTimeoutErr) {
        if (authTimeoutErr?.message === "AUTH_TIMEOUT") {
          setErrorMessage(
            "Supabase authentication service is currently unresponsive. The cloud auth service container may be frozen. Please restart the project in the Supabase Dashboard."
          );
          setIsSubmitting(false);
          return;
        }
        throw authTimeoutErr;
      }

      if (authError) {
        setErrorMessage(authError.message || "Invalid email or password. Please try again.");
        setIsSubmitting(false);
        return;
      }

      if (!authData?.session) {
        setErrorMessage("Authentication completed but no session was created. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // ── STEP 3: Fetch company/employee profile from server using the valid token ──
      await fetchProfileAndRedirect(authData.session);
    } catch (err) {
      console.error("Login error:", err);
      setErrorMessage(err?.message || "An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 text-slate-800 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-md bg-white border border-sky-100 rounded-3xl shadow-xl shadow-sky-500/10 p-6 sm:p-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-100 text-sky-600 mb-3 shadow-inner">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-sky-950">Welcome Back</h1>
          <p className="text-sm text-sky-700/80 mt-1.5">Sign in to your company dashboard</p>
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

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center space-x-2">
            <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-5"
          data-form-type="other"
          data-lpignore="true"
          suppressHydrationWarning
        >

          {/* Email or Username */}
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Work Email or Username *</label>
            <input
              id="login-email"
              type="text"
              name="email"
              value={formData.email}
              onChange={handleChange}
              autoComplete="username"
              placeholder="user@company.com or username"
              suppressHydrationWarning
              className="w-full px-4 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-sky-900 mb-1.5">Password *</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="current-password"
                placeholder="••••••••"
                suppressHydrationWarning
                className="w-full pl-4 pr-12 py-3 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-sm placeholder-sky-400/70 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 outline-none transition duration-150"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                suppressHydrationWarning
                className="absolute right-3 top-3.5 text-xs font-semibold text-sky-600 hover:text-sky-800"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            suppressHydrationWarning
            className="w-full mt-6 py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold text-sm transition duration-150 shadow-lg shadow-sky-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Register Link */}
        <div className="mt-8 text-center pt-6 border-t border-sky-100 text-xs text-sky-800">
          Don&apos;t have a company account yet?{" "}
          <Link href="/register-company" className="font-bold text-sky-600 hover:text-sky-800 hover:underline">
            Register Company
          </Link>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-sky-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
