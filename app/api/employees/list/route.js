import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/employees/list
 * Returns all employees for the authenticated user's company.
 */
export async function GET() {
  try {
    // 1. Authenticate user from session
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // 2. Find company associated with user (admin or employee)
    let company = null;
    const { data: adminComp } = await adminSupabase
      .from("companies")
      .select("*")
      .or(`admin_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (adminComp) {
      company = adminComp;
    } else {
      const { data: empComp } = await adminSupabase
        .from("employees")
        .select("company_id, companies:company_id(*)")
        .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
        .maybeSingle();

      if (empComp?.companies) {
        company = empComp.companies;
      }
    }

    if (!company) {
      return NextResponse.json(
        { message: "No company found for this user." },
        { status: 404 }
      );
    }

    // 3. Fetch all employees for the company
    const { data: employees, error: fetchError } = await adminSupabase
      .from("employees")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("Employee list fetch error:", fetchError);
      if (fetchError.code === 'PGRST205' || fetchError.message?.includes("employees")) {
        return NextResponse.json(
          {
            message: "Table 'employees' not found in database. Please run the SQL migration in supabase/migrations/20260803_create_employees_table.sql",
            employees: [],
            needMigration: true
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { message: "Failed to load employees." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      employees: employees || [],
      count: employees?.length || 0,
    });
  } catch (error) {
    console.error("Employee List API Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
