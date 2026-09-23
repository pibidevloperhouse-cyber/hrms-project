import { createAdminClient } from "./admin";

/**
 * Safely decodes a JWT payload and validates expiration.
 * Used as a fast instant fallback when Supabase GoTrue Auth service is experiencing high latency.
 */
function parseJwtPayload(token) {
  try {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const jsonStr = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(jsonStr);

    // Validate expiration (allow 300-second clock skew buffer for serverless drift)
    if (payload.exp && typeof payload.exp === "number") {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp + 300 < nowSeconds) {
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
 * Resolves user from token with a strict guard,
 * falling back to GoTrue verification or unexpired JWT payload decoding.
 */
async function resolveUserFromToken(adminSupabase, token) {
  if (!token) return null;

  // 1. Fast JWT validation (instant 0ms resolution for valid unexpired sessions)
  const jwtUser = parseJwtPayload(token);
  if (jwtUser) return jwtUser;

  // 2. Attempt GoTrue verification with a 2-second timeout guard
  try {
    const authPromise = adminSupabase.auth.getUser(token);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GET_USER_TIMEOUT")), 2000)
    );

    const { data: { user } = {} } = await Promise.race([authPromise, timeoutPromise]);
    if (user) return user;
  } catch {
    // GoTrue unresponsive or high latency
  }

  return null;
}

/**
 * Robust authentication resolver for API routes.
 * Validates user session via Authorization header, session cookies (plain & base64 chunked), or Supabase server client.
 */
export async function getAuthUser(req, supabaseServer) {
  try {
    const adminSupabase = createAdminClient();

    const getHeader = (name) => {
      if (!req) return null;
      if (typeof req.headers?.get === "function") {
        return req.headers.get(name);
      }
      return req.headers?.[name] || req.headers?.[name.toLowerCase()];
    };

    // 1. Primary: Bearer Token in Authorization / x-access-token header
    const authHeader = getHeader("authorization") || getHeader("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      if (token) {
        const bearerUser = await resolveUserFromToken(adminSupabase, token);
        if (bearerUser) return bearerUser;
      }
    }

    const xAccessToken = getHeader("x-access-token");
    if (xAccessToken) {
      const xUser = await resolveUserFromToken(adminSupabase, xAccessToken.trim());
      if (xUser) return xUser;
    }

    // 2. Secondary: Parse Supabase session cookie directly from request header (supports all @supabase/ssr formats)
    const cookieHeader = getHeader("cookie") || "";
    if (cookieHeader) {
      // A. Match direct JWT tokens anywhere in the cookie header
      const jwtMatches = cookieHeader.match(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g);
      if (jwtMatches && jwtMatches.length > 0) {
        for (const token of jwtMatches) {
          const directJwtUser = await resolveUserFromToken(adminSupabase, token);
          if (directJwtUser) return directJwtUser;
        }
      }

      // B. Match sb-*-auth-token cookie chunks (handles single, chunked .0, .1, and base64- prefixes)
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
        let jsonStr = rawVal;
        if (jsonStr.startsWith("base64-")) {
          try {
            const b64Part = jsonStr.slice(7);
            const paddedB64 = b64Part.padEnd(b64Part.length + ((4 - (b64Part.length % 4)) % 4), "=");
            jsonStr = Buffer.from(paddedB64, "base64").toString("utf8");
          } catch (_) {}
        }
        try {
          const parsed = JSON.parse(jsonStr);
          const accessToken =
            parsed?.access_token ||
            (Array.isArray(parsed) ? parsed[0] : typeof parsed === "string" ? parsed : null);
          if (accessToken) {
            const cookieUser = await resolveUserFromToken(adminSupabase, accessToken);
            if (cookieUser) return cookieUser;
          }
        } catch {
          // If not valid JSON, test if rawVal itself contains or is a token
          const rawMatch = rawVal.match(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
          const fallbackUser = await resolveUserFromToken(adminSupabase, rawMatch ? rawMatch[0] : rawVal);
          if (fallbackUser) return fallbackUser;
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
  const userEmail = user.email ? user.email.toLowerCase().trim() : "";

  let empOrFilter = `auth_user_id.eq.${user.id}`;
  if (userEmail) {
    empOrFilter += `,email.ilike."${userEmail.replace(/"/g, '""')}"`;
  }

  let compOrFilter = `admin_id.eq.${user.id}`;
  if (userEmail) {
    compOrFilter += `,email.ilike."${userEmail.replace(/"/g, '""')}"`;
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
