import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyAndRoleForUser, validateInvitationTargetEmail } from "@/lib/supabase/companyHelper";
import { transporter } from "@/lib/mail/transporter";
import { buildOfferEmailHTML } from "@/lib/mail/offerEmail";

import { getAppUrl } from "@/lib/urlHelper";

/**
 * GET /api/invitations
 * Returns pending & historical invitations for the caller's company.
 */
export async function GET() {
  try {
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

    // Find company using company helper
    const { company } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company found for this user." },
        { status: 404 }
      );
    }

    const { data: invitations, error } = await adminSupabase
      .from("invitations")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "PGRST205" || error.message?.includes("invitations")) {
        return NextResponse.json({
          invitations: [],
          needMigration: true,
        });
      }
      return NextResponse.json(
        { message: "Failed to fetch invitations." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      invitations: invitations || [],
    });
  } catch (error) {
    console.error("GET Invitations Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invitations
 * Owner / Admin invites an HR user or employee:
 * 1. Creates invitation record in public.invitations with status 'pending'
 * 2. Generates explicit crypto token
 * 3. Sends invitation offer email via Nodemailer
 */
export async function POST(req) {
  try {
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

    // Verify caller company & permission (ADMIN, hr_manager, or hr_executive)
    const { company, role: callerRole } = await getCompanyAndRoleForUser(adminSupabase, user);

    const isAuthorized = company && ["ADMIN", "hr_manager", "hr_executive"].includes(callerRole);

    if (!isAuthorized) {
      return NextResponse.json(
        { message: "Access denied. Only Company Owner and HR Managers/Executives can issue invitations." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { fullName, email, phone, department, designation, role } = body;

    if (!fullName || !fullName.trim()) {
      return NextResponse.json(
        { message: "Full name is required." },
        { status: 400 }
      );
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { message: "Email is required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const targetRole = role || "hr_manager";

    // Role Restriction: Owner (ADMIN) can invite HR & Employees; HR can invite ONLY Employees (not HR)
    const isHrRoleTarget = ["hr_manager", "hr_executive"].includes(targetRole);
    if (isHrRoleTarget && callerRole !== "ADMIN") {
      return NextResponse.json(
        { message: "Access denied. Only the Company Owner can invite HR Manager or HR Executive roles." },
        { status: 403 }
      );
    }

    // Validate that candidate is NOT the Company Owner and has NOT already joined the company
    const emailValidation = await validateInvitationTargetEmail(adminSupabase, company, cleanEmail, user);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { message: emailValidation.message },
        { status: 400 }
      );
    }

    const { data: existingInvite } = await adminSupabase
      .from("invitations")
      .select("id, status, token")
      .eq("company_id", company.id)
      .eq("email", cleanEmail)
      .eq("status", "pending")
      .maybeSingle();

    // Generate explicit crypto token
    const token = crypto.randomBytes(32).toString("hex");
    let invitationRecord = null;
    const resolvedDepartment = department?.trim() || (isHrRoleTarget ? "Human Resources" : "General");

    if (existingInvite) {
      const { data: updatedInv, error: updateErr } = await adminSupabase
        .from("invitations")
        .update({
          token: token,
          full_name: fullName.trim(),
          phone: phone?.trim() || null,
          department: resolvedDepartment,
          designation: designation?.trim() || null,
          role: role || "hr_manager",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", existingInvite.id)
        .select()
        .single();

      if (updateErr) console.error("Invitation update error:", updateErr);
      invitationRecord = updatedInv || existingInvite;
    } else {
      const { data: newInv, error: insertError } = await adminSupabase
        .from("invitations")
        .insert([
          {
            company_id: company.id,
            invited_by: user.id,
            email: cleanEmail,
            full_name: fullName.trim(),
            phone: phone?.trim() || null,
            department: resolvedDepartment,
            designation: designation?.trim() || null,
            role: role || "hr_manager",
            token: token,
            status: "pending",
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ])
        .select()
        .single();

      if (insertError) {
        console.error("Invitation insert error:", insertError);
        return NextResponse.json(
          { message: "Failed to create invitation record: " + insertError.message },
          { status: 400 }
        );
      }
      invitationRecord = newInv;
    }

    // Build Action Link
    const appUrl = getAppUrl(req);
    const finalToken = invitationRecord?.token || token;
    const acceptUrl = `${appUrl}/accept-invite?token=${finalToken}`;

    // Construct Email Template
    const emailHTML = buildOfferEmailHTML({
      companyName: company.name,
      employeeName: fullName.trim(),
      role: role || "hr_manager",
      department: department?.trim() || "HR Department",
      designation: designation?.trim() || "HR Specialist",
      acceptUrl,
    });

    let emailSent = false;
    let emailErrorMessage = "";

    try {
      const cleanCompanyName = company.name.replace(/"/g, "");
      await transporter.sendMail({
        from: `"${cleanCompanyName} HRMS" <${process.env.EMAIL_USER}>`,
        to: cleanEmail,
        subject: `🤝 HR Role Invitation & Offer from ${cleanCompanyName}`,
        html: emailHTML,
      });
      console.log("⚡ HR Invitation email delivered to:", cleanEmail, "Token:", finalToken);
      emailSent = true;
    } catch (emailErr) {
      console.error("❌ Failed to deliver HR invitation email:", emailErr);
      emailErrorMessage = emailErr?.message || "Mail transport error";
    }

    return NextResponse.json({
      success: true,
      emailSent,
      emailErrorMessage,
      message: emailSent
        ? `Invitation email successfully sent to ${cleanEmail} (Status: PENDING).`
        : `Invitation recorded as PENDING, but email delivery had an issue (${emailErrorMessage}). Copy invitation link below.`,
      invitation: invitationRecord,
      inviteUrls: {
        acceptUrl,
      },
    });
  } catch (error) {
    console.error("POST Invitation API Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
