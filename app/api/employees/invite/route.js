import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyAndRoleForUser, validateInvitationTargetEmail } from "@/lib/supabase/companyHelper";
import { transporter } from "@/lib/mail/transporter";
import { buildOfferEmailHTML } from "@/lib/mail/offerEmail";

import { getAppUrl } from "@/lib/urlHelper";

const VALID_ROLES = [
  "hr_manager",
  "hr_executive",
  "team_lead",
  "manager",
  "employee",
];

export async function POST(req) {
  try {
    // 1. Authenticate caller
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

    // 2. Verify caller company & permission (ADMIN, hr_manager, or hr_executive)
    const { company, role: callerRole } = await getCompanyAndRoleForUser(adminSupabase, user);

    const isAuthorized = company && ["ADMIN", "hr_manager", "hr_executive"].includes(callerRole);

    if (!isAuthorized) {
      return NextResponse.json(
        { message: "Access denied. Only Company Owner and HR Managers/Executives can invite employees." },
        { status: 403 }
      );
    }

    // 3. Parse input
    const body = await req.json();
    const { fullName, email, phone, department, designation, role } = body;

    if (!fullName || !fullName.trim()) {
      return NextResponse.json(
        { message: "Employee full name is required." },
        { status: 400 }
      );
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { message: "Employee email is required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // Role Restriction: Owner (ADMIN) can invite HR & Employees; HR can invite ONLY Employees (not HR)
    const isHrRoleTarget = ["hr_manager", "hr_executive"].includes(role);
    if (isHrRoleTarget && callerRole !== "ADMIN") {
      return NextResponse.json(
        { message: "Access denied. Only the Company Owner can invite HR Manager or HR Executive roles." },
        { status: 403 }
      );
    }

    // 4. Validate that candidate is NOT the Company Owner and has NOT already joined the company
    const emailValidation = await validateInvitationTargetEmail(adminSupabase, company, cleanEmail, user);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { message: emailValidation.message },
        { status: 400 }
      );
    }

    // 5. Check for duplicate pending invitation
    const { data: existingInvite } = await adminSupabase
      .from("invitations")
      .select("id, status, token")
      .eq("company_id", company.id)
      .eq("email", cleanEmail)
      .eq("status", "pending")
      .maybeSingle();

    // 6. Generate secure 32-byte hex token in Node.js
    const token = crypto.randomBytes(32).toString("hex");

    let invitationRecord = null;
    const resolvedDepartment = department?.trim() || (isHrRoleTarget ? "Human Resources" : "General");

    if (existingInvite) {
      // Refresh token & details for existing pending invitation
      const { data: updatedInv, error: updateErr } = await adminSupabase
        .from("invitations")
        .update({
          token: token,
          full_name: fullName.trim(),
          phone: phone?.trim() || null,
          department: resolvedDepartment,
          designation: designation?.trim() || null,
          role: role,
          invited_by: user.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", existingInvite.id)
        .select()
        .single();

      if (updateErr) {
        console.error("Invitation update error:", updateErr);
      }
      invitationRecord = updatedInv || existingInvite;
    } else {
      // Insert new pending invitation into public.invitations
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
            role: role,
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
          { message: "Failed to create invitation: " + insertError.message },
          { status: 400 }
        );
      }
      invitationRecord = newInv;
    }

    // 7. Build Action Link pointing to Password Creation Page
    const appUrl = getAppUrl(req);
    const finalToken = invitationRecord?.token || token;
    const acceptUrl = `${appUrl}/accept-invite?token=${finalToken}`;

    // 8. Send Invitation Letter Email
    const emailHTML = buildOfferEmailHTML({
      companyName: company.name,
      employeeName: fullName.trim(),
      role: role,
      department: department?.trim() || "General",
      designation: designation?.trim() || "",
      acceptUrl,
    });

    let emailSent = false;
    let emailErrorMessage = "";

    try {
      const cleanCompanyName = company.name.replace(/"/g, "");
      await transporter.sendMail({
        from: `"${cleanCompanyName} HRMS" <${process.env.EMAIL_USER}>`,
        to: cleanEmail,
        subject: `🤝 Team Invitation & Offer from ${cleanCompanyName}`,
        html: emailHTML,
      });
      console.log("⚡ Invitation email sent to:", cleanEmail, "Token:", finalToken);
      emailSent = true;
    } catch (emailErr) {
      console.error("❌ Failed to send offer email:", emailErr);
      emailErrorMessage = emailErr?.message || "Mail transport failed";
    }

    return NextResponse.json({
      success: true,
      emailSent,
      emailErrorMessage,
      message: emailSent
        ? `Invitation offer sent to ${cleanEmail}. Candidate will set their own password upon accepting.`
        : `Invitation stored in invitations table, but email delivery returned a warning (${emailErrorMessage}). Copy invitation link below.`,
      invitation: {
        id: invitationRecord?.id,
        token: finalToken,
        full_name: fullName.trim(),
        email: cleanEmail,
        role: role,
        department: department?.trim() || null,
        designation: designation?.trim() || null,
        status: "pending",
      },
      inviteUrls: {
        acceptUrl,
      },
    });
  } catch (error) {
    console.error("Invite Employee API Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
