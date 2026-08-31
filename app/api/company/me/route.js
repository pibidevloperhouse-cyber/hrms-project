import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";

/**
 * GET /api/company/me?companyId=<optional>
 * 
 * Secure production endpoint to fetch logged-in user's company data with session validation.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();

    // 1. Authenticate user from session token or Authorization header
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in.", unauthorized: true },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedCompanyId = searchParams.get("companyId");

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    let targetCompany = null;
    let role = "ADMIN";
    let employeeProfile = null;

    // 2. Fetch Employee and Company concurrently with Promise.all
    let empOrFilter = `auth_user_id.eq.${user.id}`;
    if (userEmail) {
      empOrFilter += `,email.eq."${userEmail.replace(/"/g, '""')}"`;
    }

    let adminOrFilter = `admin_id.eq.${user.id}`;
    if (userEmail) {
      adminOrFilter += `,email.eq."${userEmail.replace(/"/g, '""')}"`;
    }

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
        .or(adminOrFilter)
        .limit(1),
    ]);

    const empRecord = empRes.data && empRes.data.length > 0 ? empRes.data[0] : null;

    if (empRecord) {
      let companyObj = empRecord.companies;
      if (!companyObj && empRecord.company_id) {
        const { data: cData } = await adminSupabase
          .from("companies")
          .select("*")
          .eq("id", empRecord.company_id)
          .maybeSingle();
        companyObj = cData;
      }

      if (companyObj) {
        targetCompany = companyObj;
        role = empRecord.role || "employee";
        employeeProfile = {
          id: empRecord.id,
          full_name: empRecord.full_name,
          email: empRecord.email,
          role: empRecord.role,
          department: empRecord.department,
          designation: empRecord.designation,
          username: empRecord.username,
          status: empRecord.status,
          avatar_url: empRecord.avatar_url || null,
          first_name: empRecord.first_name || (empRecord.full_name ? empRecord.full_name.split(" ")[0] : ""),
          last_name: empRecord.last_name || (empRecord.full_name ? empRecord.full_name.split(" ").slice(1).join(" ") : ""),
          employee_id: empRecord.employee_id || `EMP-${empRecord.id.slice(0, 5).toUpperCase()}`,
          personal_email: empRecord.personal_email || "",
          phone: empRecord.phone || "",
          address: empRecord.address || "",
          joining_date: empRecord.joining_date || null,
        };

        // Sync auth_user_id non-blockingly if missing
        if (!empRecord.auth_user_id) {
          adminSupabase
            .from("employees")
            .update({ auth_user_id: user.id })
            .eq("id", empRecord.id)
            .catch((syncErr) => console.warn("Sync auth_user_id warning:", syncErr));
        }
      }
    }

    // 3. If not an employee, check if user is a Company Owner / Admin
    if (!targetCompany && compRes.data && compRes.data.length > 0) {
      targetCompany = compRes.data[0];
      role = "ADMIN";

      if (!employeeProfile) {
        const compName = targetCompany.name || "Company Owner";
        employeeProfile = {
          id: `admin-${user.id.slice(0, 8)}`,
          full_name: compName,
          email: userEmail,
          role: "ADMIN",
          department: "Executive Management",
          designation: "Company Administrator",
          username: userEmail.split("@")[0],
          status: "active",
          avatar_url: targetCompany.logo_url || null,
          first_name: compName.split(" ")[0] || "Owner",
          last_name: compName.split(" ").slice(1).join(" ") || "",
          employee_id: "EMP-ADMIN-001",
          personal_email: userEmail,
          phone: targetCompany.phone || "",
          address: targetCompany.country ? `${targetCompany.country}, ${targetCompany.state || ""}` : "",
          joining_date: targetCompany.created_at || null,
        };
      }
    }

    if (!targetCompany) {
      return NextResponse.json(
        {
          success: false,
          requiresSetup: true,
          message: "No registered company found for this user account.",
        },
        { status: 404 }
      );
    }

    // Verify companyId matches if specified
    if (requestedCompanyId && targetCompany.id !== requestedCompanyId) {
      return NextResponse.json(
        { message: "Access denied. You do not have permission to view this company's data." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
      role,
      company: targetCompany,
      employee: employeeProfile,
    });
  } catch (error) {
    console.error("Secure Company API Error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}
