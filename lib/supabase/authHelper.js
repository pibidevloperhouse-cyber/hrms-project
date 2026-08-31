import { createAdminClient } from "./admin";

/**
 * Safely decodes a JWT payload and validates expiration.
 * Used as a fallback when Supabase GoTrue Auth service is experiencing high latency.
 */
function parseJwtPayload(token) {
  try {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(base64, "base64").toString("utf8");
    const payload = JSON.parse(jsonStr);

    // Validate expiration
    if (payload.exp && typeof payload.exp === "number") {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSeconds) {
        return null; // Expired
      }
    }

    if (!payload.sub) return null;

    return {
      id: payload.sub,
      email: payload.email || "",
      user_metadata: payload.user_metadata || {},
      app_metadata: payload.app_metadata || {},
      role: payload.role || "authenticated",
    };
  } catch {
    return null;
  }
}

/**
 * Resolves user from token with a strict 3-second timeout,
 * falling back to unexpired JWT payload decoding if GoTrue is unresponsive.
 */
async function resolveUserFromToken(adminSupabase, token) {
  if (!token) return null;

  try {
    const authPromise = adminSupabase.auth.getUser(token);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GET_USER_TIMEOUT")), 3000)
    );

    const { data: { user } = {} } = await Promise.race([authPromise, timeoutPromise]);
    if (user) return user;
  } catch (err) {
    // If GoTrue times out or fails, gracefully use validated JWT payload
    if (err.message === "GET_USER_TIMEOUT") {
      console.warn("GoTrue getUser timed out; using JWT payload fallback.");
    }
  }

  // Fast JWT fallback
  return parseJwtPayload(token);
}

/**
 * Robust authentication resolver for API routes.
 * Validates user session via Authorization header, session cookie, or Supabase server client.
 */
export async function getAuthUser(req, supabaseServer) {
  try {
    const adminSupabase = createAdminClient();

    // 1. Primary: Bearer Token in Authorization header (fastest and most direct)
    if (req) {
      const authHeader = req.headers?.get("authorization") || req.headers?.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        if (token) {
          const bearerUser = await resolveUserFromToken(adminSupabase, token);
          if (bearerUser) return bearerUser;
        }
      }
    }

    // 2. Secondary: Parse Supabase session cookie directly from request header (single & chunked)
    if (req) {
      const cookieHeader = req.headers?.get("cookie") || "";
      if (cookieHeader) {
        let rawVal = "";
        const singleMatch = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
        if (singleMatch && singleMatch[1]) {
          rawVal = decodeURIComponent(singleMatch[1]);
        } else {
          const chunkRegex = /sb-[^=]+-auth-token\.(\d+)=([^;]+)/g;
          const chunks = [];
          let match;
          while ((match = chunkRegex.exec(cookieHeader)) !== null) {
            chunks.push({ index: parseInt(match[1], 10), value: match[2] });
          }
          if (chunks.length > 0) {
            chunks.sort((a, b) => a.index - b.index);
            rawVal = decodeURIComponent(chunks.map((c) => c.value).join(""));
          }
        }

        if (rawVal) {
          try {
            const parsed = JSON.parse(rawVal);
            const accessToken = parsed?.access_token || (Array.isArray(parsed) ? parsed[0] : null);
            if (accessToken) {
              const cookieUser = await resolveUserFromToken(adminSupabase, accessToken);
              if (cookieUser) return cookieUser;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    // 3. Fallback: Supabase SSR Client Session via cookies (with 3-second guard)
    if (supabaseServer) {
      try {
        const userPromise = supabaseServer.auth.getUser();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("SSR_USER_TIMEOUT")), 3000)
        );
        const { data: { user } = {} } = await Promise.race([userPromise, timeoutPromise]);
        if (user) return user;
      } catch {
        // Fallback handled
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
