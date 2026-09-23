import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { getAuthUser } from "@/lib/supabase/authHelper";

/**
 * POST /api/company/calendar/schedule
 * Saves or updates company working hours schedule.
 * Restricted to HR (ADMIN, hr_manager, hr_executive).
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
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

    const isHR = ["ADMIN", "hr_manager", "hr_executive"].includes(role);
    if (!isHR) {
      return NextResponse.json(
        { message: "Access denied. Only HR Managers and Company Admins can configure working hours." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { dailyWorkingHours, startTime, endTime, workDays } = body;

    const cleanStartTime = startTime?.trim() || "09:00";
    const cleanEndTime = endTime?.trim() || "17:00";

    const hoursNum = (dailyWorkingHours !== undefined && dailyWorkingHours !== null && dailyWorkingHours !== "")
      ? Number(dailyWorkingHours)
      : 8.0;

    if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 24) {
      return NextResponse.json(
        { message: "Daily working hours must be between 1 and 24 hours." },
        { status: 400 }
      );
    }
    const cleanWorkDays = Array.isArray(workDays) && workDays.length > 0
      ? workDays
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    // Upsert into company_work_schedules
    const { data: savedSchedule, error: upsertErr } = await adminSupabase
      .from("company_work_schedules")
      .upsert(
        {
          company_id: company.id,
          daily_working_hours: hoursNum,
          start_time: cleanStartTime,
          end_time: cleanEndTime,
          work_days: cleanWorkDays,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      )
      .select()
      .single();

    if (upsertErr) {
      console.error("Upsert company schedule error:", upsertErr);
      return NextResponse.json(
        { message: upsertErr.message || "Failed to update work schedule." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Company working hours and schedule updated successfully!",
      schedule: {
        id: savedSchedule.id,
        dailyWorkingHours: Number(savedSchedule.daily_working_hours),
        startTime: savedSchedule.start_time,
        endTime: savedSchedule.end_time,
        workDays: savedSchedule.work_days,
      },
    });
  } catch (error) {
    console.error("POST /api/company/calendar/schedule error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to update schedule." },
      { status: 500 }
    );
  }
}
