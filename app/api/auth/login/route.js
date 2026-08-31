import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Plain anon-key client — used as fallback when no access_token is provided
function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Race any promise against a timeout so the route never hangs indefinitely.
 */
function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Fetch company and employee data for a verified user.
 * This is the shared logic used regardless of how auth was performed.
 */
async function fetchUserProfile(adminSupabase, user, matchedEmp, session) {
  const userMeta = user.user_metadata || {};
  const safeUserEmail = user.email ? user.email.toLowerCase() : "";
  const isEmployeeMeta = userMeta.is_employee === true;

  // ── Employee Flow ──────────────────────────────────────────────
  if (isEmployeeMeta || matchedEmp) {
    let employeeRecord = matchedEmp;

    if (!employeeRecord) {
      try {
        const sanitizedEmail = safeUserEmail.replace(/"/g, '""');
        const { data: empByAuth } = await adminSupabase
          .from("employees")
          .select("*, companies:company_id(id, name, email, industry, logo_url)")
          .or(`auth_user_id.eq.${user.id},email.eq."${sanitizedEmail}"`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        employeeRecord = empByAuth;
      } catch (empFetchErr) {
        console.warn("Employee fetch warning:", empFetchErr);
      }
    }

    // Sync auth_user_id non-blockingly if missing/mismatched
    if (employeeRecord && (!employeeRecord.auth_user_id || employeeRecord.auth_user_id !== user.id)) {
      adminSupabase
        .from("employees")
        .update({ auth_user_id: user.id })
        .eq("id", employeeRecord.id)
        .catch((syncErr) => console.warn("Async auth_user_id sync warning:", syncErr));
    }

    let companyObj = employeeRecord?.companies || null;
    if (!companyObj && employeeRecord?.company_id) {
      try {
        const { data: cData } = await adminSupabase
          .from("companies")
          .select("id, name, email, industry, logo_url")
          .eq("id", employeeRecord.company_id)
          .maybeSingle();
        companyObj = cData;
      } catch (cErr) {
        console.warn("Company fetch warning:", cErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Login successful!",
      user,
      session,
      company: companyObj,
      isEmployee: true,
      role: employeeRecord?.role || userMeta.role || "employee",
      employee: employeeRecord
        ? {
            id: employeeRecord.id,
            full_name: employeeRecord.full_name,
            email: employeeRecord.email,
            role: employeeRecord.role,
            department: employeeRecord.department,
            designation: employeeRecord.designation,
            username: employeeRecord.username,
            status: employeeRecord.status,
            must_change_password: employeeRecord.must_change_password,
          }
        : null,
      requiresSetup: false,
    });
  }

  // ── Admin Flow ─────────────────────────────────────────────────
  let company = null;
  try {
    const sanitizedEmail = safeUserEmail.replace(/"/g, '""');
    const { data: cData } = await adminSupabase
      .from("companies")
      .select("*")
      .or(`admin_id.eq.${user.id},email.eq."${sanitizedEmail}"`)
      .limit(1)
      .maybeSingle();

    company = cData;

    if (company && !company.admin_id && user.id) {
      adminSupabase
        .from("companies")
        .update({ admin_id: user.id })
        .eq("id", company.id)
        .catch((linkErr) => console.warn("Async admin_id link warning:", linkErr));
    }
  } catch (companyErr) {
    console.warn("Company lookup error:", companyErr);
  }

  const isCompletedInMeta = userMeta.setup_completed === true;
  const isCompletedInDB = company?.is_setup_completed === true;
  const hasProfileFields = !!(company?.legal_name && company?.country);
  const setupIsDone = isCompletedInMeta || isCompletedInDB || hasProfileFields;
  const requiresSetup = company ? !setupIsDone : false;

  if (company && setupIsDone) {
    if (!isCompletedInMeta) {
      adminSupabase.auth.admin
        .updateUserById(user.id, {
          user_metadata: { ...userMeta, setup_completed: true },
        })
        .catch((metaErr) => console.warn("Background metadata sync warning:", metaErr));
    }
    if (!isCompletedInDB && company.id) {
      adminSupabase
        .from("companies")
        .update({ is_setup_completed: true })
        .eq("id", company.id)
        .catch((dbErr) => console.warn("Background DB setup sync warning:", dbErr));
    }
  }

  return NextResponse.json({
    success: true,
    message: "Login successful!",
    user,
    session,
    company: company || null,
    isEmployee: false,
    requiresSetup,
  });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const adminSupabase = createAdminClient();

    // ── PATH A: Client already authenticated — access_token provided ──
    // The browser called supabase.auth.signInWithPassword directly.
    // We validate the token (with fast JWT fallback if GoTrue is slow) and fetch profile data.
    if (body.access_token && body.refresh_token) {
      let user = null;
      try {
        const authRes = await Promise.race([
          adminSupabase.auth.getUser(body.access_token),
          new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000)),
        ]);
        user = authRes?.data?.user || null;
      } catch {
        // Fallback: decode unexpired JWT directly
        try {
          const parts = body.access_token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
            if (payload.sub && (!payload.exp || payload.exp * 1000 > Date.now())) {
              user = {
                id: payload.sub,
                email: payload.email || "",
                user_metadata: payload.user_metadata || {},
              };
            }
          }
        } catch (_) {
          // Token decode failed
        }
      }

      if (!user) {
        return NextResponse.json({ message: "Invalid or expired session token." }, { status: 401 });
      }

      const session = { access_token: body.access_token, refresh_token: body.refresh_token };
      return fetchUserProfile(adminSupabase, user, null, session);
    }

    // ── PATH B: Credentials provided — resolve username then auth on server ──
    // Used as fallback when the client-side auth fails (e.g. network issue on client).
    const rawInput = (body.email || body.username || "").trim();
    const { password } = body;

    if (!rawInput || !password) {
      return NextResponse.json({ message: "Email/Username and password are required." }, { status: 400 });
    }

    const isEmailInput = rawInput.includes("@");
    let targetEmail = rawInput.toLowerCase();
    let matchedEmp = null;

    // Resolve username → email
    if (!isEmailInput) {
      try {
        const sanitizedInput = rawInput.replace(/"/g, '""');
        const { data: empData } = await adminSupabase
          .from("employees")
          .select("*, companies:company_id(id, name, email, industry, logo_url)")
          .eq("username", sanitizedInput)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (empData) {
          matchedEmp = empData;
          if (empData.email) targetEmail = empData.email.toLowerCase();
        }
      } catch (empErr) {
        console.warn("Username lookup warning during login:", empErr);
      }
    }

    const supabase = createAnonClient();
    let authData, authError;
    try {
      const result = await withTimeout(
        supabase.auth.signInWithPassword({ email: targetEmail, password }),
        8000,
        "Supabase signInWithPassword"
      );
      authData = result.data;
      authError = result.error;
    } catch (timeoutErr) {
      console.error("Auth timeout:", timeoutErr.message);
      return NextResponse.json(
        { message: "Authentication service is taking too long. Please try again." },
        { status: 504 }
      );
    }

    if (authError) {
      return NextResponse.json({ message: authError.message || "Invalid credentials." }, { status: 401 });
    }

    if (!authData?.user) {
      return NextResponse.json({ message: "Authentication failed. User not found." }, { status: 401 });
    }

    return fetchUserProfile(adminSupabase, authData.user, matchedEmp, authData.session);
  } catch (error) {
    console.error("Login API Error:", error);
    return NextResponse.json({ message: error?.message || "Internal server error." }, { status: 500 });
  }
}
