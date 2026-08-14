import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

/**
 * POST /api/company/calendar/holidays
 * Adds a new holiday to the company calendar.
 * Restricted to HR (ADMIN, hr_manager, hr_executive).
 */
export async function POST(req) {
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

    const isHR = ["ADMIN", "hr_manager", "hr_executive"].includes(role);
    if (!isHR) {
      return NextResponse.json(
        { message: "Access denied. Only HR Managers and Company Admins can add holidays." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title, date, holidayType, description } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { message: "Holiday title/name is required." },
        { status: 400 }
      );
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { message: "Valid holiday date (YYYY-MM-DD) is required." },
        { status: 400 }
      );
    }

    const cleanTitle = title.trim();
    const cleanType = holidayType?.trim() || "Paid Holiday";
    const cleanDesc = description?.trim() || null;

    const { data: insertedHoliday, error: insertErr } = await adminSupabase
      .from("company_holidays")
      .insert([
        {
          company_id: company.id,
          title: cleanTitle,
          date,
          holiday_type: cleanType,
          description: cleanDesc,
          created_by: user.id,
        },
      ])
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === "42P01") {
        return NextResponse.json(
          { message: "Table 'company_holidays' does not exist yet. Please run migration 20260811_create_company_calendar_tables.sql in Supabase SQL Editor." },
          { status: 400 }
        );
      }
      throw insertErr;
    }

    return NextResponse.json({
      success: true,
      message: `Holiday "${cleanTitle}" added for ${date}!`,
      holiday: {
        id: insertedHoliday.id,
        title: insertedHoliday.title,
        date: insertedHoliday.date,
        holidayType: insertedHoliday.holiday_type,
        description: insertedHoliday.description || "",
      },
    });
  } catch (error) {
    console.error("POST /api/company/calendar/holidays error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to add company holiday." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/company/calendar/holidays?id=...
 * Deletes a holiday from the company calendar.
 * Restricted to HR (ADMIN, hr_manager, hr_executive).
 */
export async function DELETE(req) {
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

    const isHR = ["ADMIN", "hr_manager", "hr_executive"].includes(role);
    if (!isHR) {
      return NextResponse.json(
        { message: "Access denied. Only HR Managers and Company Admins can remove holidays." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const holidayId = searchParams.get("id");

    if (!holidayId) {
      return NextResponse.json(
        { message: "Holiday ID is required." },
        { status: 400 }
      );
    }

    const { error: delErr } = await adminSupabase
      .from("company_holidays")
      .delete()
      .eq("id", holidayId)
      .eq("company_id", company.id);

    if (delErr) {
      throw delErr;
    }

    return NextResponse.json({
      success: true,
      message: "Holiday removed from company calendar successfully.",
    });
  } catch (error) {
    console.error("DELETE /api/company/calendar/holidays error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to delete holiday." },
      { status: 500 }
    );
  }
}
