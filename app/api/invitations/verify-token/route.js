import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/invitations/verify-token?token=...
 * Validates invitation token for password setting.
 * Fixes UUID casting error by checking token type before OR query.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = (searchParams.get("token") || "").trim();

    if (!token) {
      return NextResponse.json(
        { message: "Missing invitation token." },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

    let invitation = null;

    // 1. Query public.invitations table
    let invQuery = adminSupabase.from("invitations").select("*, companies:company_id(id, name)");
    
    if (isUuid) {
      invQuery = invQuery.or(`token.eq.${token},id.eq.${token}`);
    } else {
      invQuery = invQuery.eq("token", token);
    }

    const { data: invData, error: invErr } = await invQuery.maybeSingle();

    if (invErr) {
      console.error("Invitations query error:", invErr);
      if (invErr.code === "PGRST205" || invErr.code === "42P01") {
        return NextResponse.json(
          {
            message: "Database table 'invitations' not found. Please run the SQL migration script in supabase/migrations/20260807_create_invitations_table.sql in your Supabase SQL Editor.",
            needMigration: true,
          },
          { status: 400 }
        );
      }
    }

    if (invData) {
      invitation = invData;
    } else if (isUuid) {
      // 2. Fallback: Query public.employees table by UUID id
      const { data: empData } = await adminSupabase
        .from("employees")
        .select("*, companies:company_id(id, name)")
        .eq("id", token)
        .maybeSingle();

      if (empData) {
        invitation = {
          id: empData.id,
          company_id: empData.company_id,
          email: empData.email,
          full_name: empData.full_name,
          phone: empData.phone,
          department: empData.department,
          designation: empData.designation,
          role: empData.role,
          status: empData.status === "pending_offer" ? "pending" : empData.status,
          token: empData.id,
          companies: empData.companies,
        };
      }
    }

    if (!invitation) {
      return NextResponse.json(
        { message: "Invitation link not found or invalid token." },
        { status: 404 }
      );
    }

    if (invitation.status === "accepted" || invitation.status === "active") {
      return NextResponse.json(
        { message: "This invitation has already been accepted. Please log in.", alreadyAccepted: true },
        { status: 400 }
      );
    }

    const cleanEmail = (invitation.email || "").trim().toLowerCase();

    // Check if email belongs to Company Owner
    const companyObj = invitation.companies;
    const companyEmail = (companyObj?.email || "").trim().toLowerCase();
    if (companyEmail && cleanEmail === companyEmail) {
      return NextResponse.json(
        { message: "This email belongs to the Company Owner and cannot accept an employee invitation. Please log in directly as Company Owner.", isOwner: true },
        { status: 400 }
      );
    }

    // Check if user is already an active joined employee in the company
    if (invitation.company_id && cleanEmail) {
      const { data: existingEmps } = await adminSupabase
        .from("employees")
        .select("id, status, auth_user_id")
        .eq("company_id", invitation.company_id)
        .ilike("email", cleanEmail);

      const activeMember = existingEmps?.find((emp) => emp.status === "active" || Boolean(emp.auth_user_id));
      if (activeMember) {
        return NextResponse.json(
          { message: "You have already joined this company as an active team member. Please log in directly.", alreadyAccepted: true },
          { status: 400 }
        );
      }
    }

    if (invitation.status !== "pending" && invitation.status !== "pending_offer") {
      return NextResponse.json(
        { message: `This invitation is no longer active (Status: ${invitation.status}).` },
        { status: 400 }
      );
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { message: "This invitation link has expired. Please request a new invitation." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      invitation: {
        token: invitation.token || invitation.id,
        fullName: invitation.full_name,
        email: invitation.email,
        role: invitation.role,
        department: invitation.department,
        designation: invitation.designation,
        companyName: invitation.companies?.name || "Company Workspace",
        companyLogoUrl: invitation.companies?.logo_url,
      },
    });
  } catch (error) {
    console.error("Verify Invitation Token Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
