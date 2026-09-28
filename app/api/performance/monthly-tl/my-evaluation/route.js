import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, resolveEmployeeFast } from "@/lib/supabase/authHelper";

/**
 * GET /api/performance/monthly-tl/my-evaluation?month=YYYY-MM
 * Allows an authenticated employee to fetch their finalized Team Lead monthly evaluation.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const empRecord = await resolveEmployeeFast(adminSupabase, user);

    if (!empRecord) {
      return NextResponse.json({ message: "Employee profile not found." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const targetMonth = searchParams.get("month") || defaultMonth;

    const { data: evalRecord, error } = await adminSupabase
      .from("monthly_team_lead_evaluations")
      .select("*")
      .eq("company_id", empRecord.company_id)
      .eq("employee_id", empRecord.id)
      .eq("evaluation_month", targetMonth)
      .maybeSingle();

    if (error && !error.message?.includes("does not exist")) {
      console.error("Fetch my TL evaluation notice:", error.message);
    }

    return NextResponse.json({
      success: true,
      evaluation: evalRecord || null,
      month: targetMonth,
    });
  } catch (error) {
    console.error("GET my TL evaluation error:", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
