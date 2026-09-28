import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

/**
 * GET /api/performance/monthly-hr/my-evaluation?month=YYYY-MM
 * Fetches the logged-in employee's finalized monthly performance evaluation and HR feedback.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company || !employeeProfile) {
      return NextResponse.json({ message: "Employee profile not found." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const targetMonth = searchParams.get("month") || new Date().toISOString().slice(0, 7);

    const { data: evaluation, error: evalErr } = await adminSupabase
      .from("monthly_employee_evaluations")
      .select(`
        *,
        evaluator:employees!monthly_employee_evaluations_evaluated_by_fkey(id, full_name, designation, avatar_url)
      `)
      .eq("company_id", company.id)
      .eq("employee_id", employeeProfile.id)
      .eq("evaluation_month", targetMonth)
      .maybeSingle();

    if (evalErr) {
      console.error("Error fetching employee monthly evaluation:", evalErr);
      return NextResponse.json({ message: "Failed to fetch evaluation." }, { status: 500 });
    }

    return NextResponse.json({
      month: targetMonth,
      employeeId: employeeProfile.id,
      evaluation: evaluation || null,
      isEvaluated: !!evaluation,
    });
  } catch (err) {
    console.error("Error in GET /api/performance/monthly-hr/my-evaluation:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
