import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";

/**
 * GET /api/attendance/summary
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ totalStaffCount: 1, presentCount: 0, attendanceRate: 0, unauthorized: true }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("company_id")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .limit(1);

    let companyId = empRecords && empRecords.length > 0 ? empRecords[0].company_id : null;

    if (!companyId) {
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("id")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      if (adminCompanies && adminCompanies.length > 0) {
        companyId = adminCompanies[0].id;
      }
    }

    if (!companyId) {
      return NextResponse.json({ totalStaffCount: 1, presentCount: 0, attendanceRate: 0 });
    }

    const { count: totalStaffCount } = await adminSupabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId);

    const totalStaff = totalStaffCount || 1;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayStr = new Date().toISOString().split("T")[0];

    // Fetch active sessions globally OR completed sessions strictly for TODAY
    const { data: activeAttendance } = await adminSupabase
      .from("attendance")
      .select("employee_id, check_in, work_date, status")
      .eq("company_id", companyId)
      .in("status", ["CHECKED_IN", "ON_BREAK", "COMPLETED", "CHECKED_OUT", "PENDING_APPROVAL", "REJECTED_LOP"])
      .gte("check_in", new Date(startOfDay.getTime() - 12 * 3600 * 1000).toISOString());

    const uniquePresentIds = new Set();
    if (activeAttendance) {
      activeAttendance.forEach((att) => {
        const isActive = att.status === "CHECKED_IN" || att.status === "ON_BREAK";
        const isToday = att.work_date === todayStr || (att.check_in && att.check_in >= startOfDay.toISOString());
        if (isActive || isToday) {
          uniquePresentIds.add(att.employee_id);
        }
      });
    }

    const presentCount = uniquePresentIds.size;
    const attendanceRate = totalStaff > 0 ? Math.round((presentCount / totalStaff) * 100) : 0;

    return NextResponse.json({
      totalStaffCount: totalStaff,
      presentCount,
      attendanceRate,
    });
  } catch (error) {
    console.error("GET /api/attendance/summary error:", error);
    return NextResponse.json({ totalStaffCount: 1, presentCount: 0, attendanceRate: 0 });
  }
}
