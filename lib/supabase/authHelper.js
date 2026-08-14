import { createAdminClient } from "./admin";

/**
 * Robust authentication resolver for API routes.
 * Validates user session via Supabase server client, Authorization header, or session cookie.
 */
export async function getAuthUser(req, supabaseServer) {
  try {
    // 1. Primary: Standard Supabase SSR Client Session
    if (supabaseServer) {
      const { data: { user } } = await supabaseServer.auth.getUser();
      if (user) return user;
    }

    const adminSupabase = createAdminClient();

    // 2. Secondary: Bearer Token in Authorization header
    if (req) {
      const authHeader = req.headers?.get("authorization") || req.headers?.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        if (token) {
          const { data: { user: bearerUser } } = await adminSupabase.auth.getUser(token);
          if (bearerUser) return bearerUser;
        }
      }

      // 3. Fallback: Parse Supabase session cookie directly from request header
      const cookieHeader = req.headers?.get("cookie") || "";
      if (cookieHeader) {
        const matches = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
        if (matches && matches[1]) {
          try {
            const rawVal = decodeURIComponent(matches[1]);
            const parsed = JSON.parse(rawVal);
            const accessToken = parsed?.access_token || (Array.isArray(parsed) ? parsed[0] : null);
            if (accessToken) {
              const { data: { user: cookieUser } } = await adminSupabase.auth.getUser(accessToken);
              if (cookieUser) return cookieUser;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    return null;
  } catch (err) {
    console.warn("getAuthUser resolution warning:", err);
    return null;
  }
}

/**
 * Fast parallel employee & company resolution helper.
 * Reduces sequential round-trips from 4 down to 1 parallel Promise.all query.
 */
export async function resolveEmployeeFast(adminSupabase, user) {
  const userEmail = user.email ? user.email.toLowerCase() : "";

  let empOrFilter = `auth_user_id.eq.${user.id}`;
  if (userEmail) {
    empOrFilter += `,email.eq."${userEmail.replace(/"/g, '""')}"`;
  }

  let compOrFilter = `admin_id.eq.${user.id}`;
  if (userEmail) {
    compOrFilter += `,email.eq."${userEmail.replace(/"/g, '""')}"`;
  }

  // Parallel Query: Check employees and companies concurrently
  const [empRes, compRes] = await Promise.all([
    adminSupabase
      .from("employees")
      .select("*, companies:company_id(*)")
      .or(empOrFilter)
      .order("created_at", { ascending: false })
      .limit(1),
    adminSupabase
      .from("companies")
      .select("*")
      .or(compOrFilter)
      .limit(1),
  ]);

  const empRecord = empRes.data && empRes.data.length > 0 ? empRes.data[0] : null;

  if (empRecord) {
    return empRecord;
  }

  const adminCompany = compRes.data && compRes.data.length > 0 ? compRes.data[0] : null;

  if (adminCompany) {
    const { data: adminEmp } = await adminSupabase
      .from("employees")
      .upsert(
        {
          company_id: adminCompany.id,
          full_name: adminCompany.name || "Company Administrator",
          email: userEmail,
          role: "ADMIN",
          status: "active",
          auth_user_id: user.id,
        },
        { onConflict: "company_id,email" }
      )
      .select()
      .maybeSingle();

    return adminEmp;
  }

  return null;
}
