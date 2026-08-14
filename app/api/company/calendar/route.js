import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

/**
 * GET /api/company/calendar
 * Returns the company working schedule & holiday list.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabaseServer.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    // 1. Fetch Working Hours Schedule
    let schedule = {
      dailyWorkingHours: 8.0,
      startTime: "09:00",
      endTime: "17:00",
      workDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    };

    const { data: schedData, error: schedErr } = await adminSupabase
      .from("company_work_schedules")
      .select("*")
      .eq("company_id", company.id)
      .maybeSingle();

    if (schedData) {
      schedule = {
        id: schedData.id,
        dailyWorkingHours: Number(schedData.daily_working_hours) || 8.0,
        startTime: schedData.start_time || "09:00",
        endTime: schedData.end_time || "17:00",
        workDays: schedData.work_days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      };
    } else if (schedErr && schedErr.code !== "42P01") {
      console.warn("Notice fetching company schedule:", schedErr.message);
    }

    // 2. Fetch Company Holidays
    let holidays = [];
    const { data: holData, error: holErr } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", company.id)
      .order("date", { ascending: true });

    if (holData) {
      holidays = holData.map((h) => ({
        id: h.id,
        title: h.title,
        date: h.date,
        holidayType: h.holiday_type || "Paid Holiday",
        description: h.description || "",
      }));
    } else if (holErr && holErr.code !== "42P01") {
      console.warn("Notice fetching company holidays:", holErr.message);
    }

    const isHR = ["ADMIN", "hr_manager", "hr_executive"].includes(role);

    return NextResponse.json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      userRole: role,
      isHR,
      schedule,
      holidays,
    });
  } catch (error) {
    console.error("GET /api/company/calendar error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}
