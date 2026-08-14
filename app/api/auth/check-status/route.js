import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/auth/check-status?id=<pending_id>
 * Checks status of pending registration with fallback to companies table upon approval.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const pendingId = searchParams.get("id");

    if (!pendingId) {
      return NextResponse.json(
        { message: "Missing registration ID" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Check pending_registrations table
    const { data: pending } = await supabase
      .from("pending_registrations")
      .select("id, status, company_name, company_email")
      .eq("id", pendingId)
      .maybeSingle();

    if (pending) {
      return NextResponse.json({
        status: pending.status, // "pending" | "approved" | "rejected"
        companyName: pending.company_name,
        companyEmail: pending.company_email,
      });
    }

    // 2. Fallback: Check if company has already been approved & created
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, email")
      .eq("id", pendingId)
      .maybeSingle();

    if (company) {
      return NextResponse.json({
        status: "approved",
        companyName: company.name,
        companyEmail: company.email,
      });
    }

    return NextResponse.json(
      { status: "not_found", message: "Registration request not found" },
      { status: 404 }
    );
  } catch (err) {
    console.error("Check Status API Error:", err);
    return NextResponse.json(
      { message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
