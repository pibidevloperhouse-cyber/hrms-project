import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporter } from "@/lib/mail/transporter";
import { buildOfferAcceptedEmailHTML, buildOfferDeclinedEmailHTML } from "@/lib/mail/offerEmail";

import { getAppUrl } from "@/lib/urlHelper";

function generateUsername(fullName) {
  const parts = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const first = parts[0] || "user";
  const last = parts.length > 1 ? parts[parts.length - 1] : "hr";
  const digits = String(Math.floor(Math.random() * 900) + 100);

  return `${first}.${last}.${digits}`;
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  let pass = "";
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

/**
 * GET /api/invitations/respond?token=...&action=accept|decline
 * Handles email link clicks when invited HR user responds to an offer
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const action = searchParams.get("action");

    const appUrl = getAppUrl(req);

    if (!token || !action) {
      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=error&message=Invalid+or+missing+invitation+token.`
      );
    }

    const adminSupabase = createAdminClient();

    // Fetch invitation by token
    const { data: invite, error: fetchErr } = await adminSupabase
      .from("invitations")
      .select("*, companies:company_id(id, name)")
      .eq("token", token)
      .maybeSingle();

    if (fetchErr || !invite) {
      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=error&message=Invitation+not+found+or+invalid+token.`
      );
    }

    if (invite.status !== "pending") {
      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=already_processed&action=${invite.status}&company=${encodeURIComponent(
          invite.companies?.name || "Company"
        )}`
      );
    }

    const companyName = invite.companies?.name || "Company Workspace";

    // Action === Decline
    if (action === "decline") {
      await adminSupabase
        .from("invitations")
        .update({ status: "declined" })
        .eq("id", invite.id);

      // Send decline confirmation email
      try {
        const emailHTML = buildOfferDeclinedEmailHTML({
          companyName,
          employeeName: invite.full_name,
        });
        await transporter.sendMail({
          from: `"${companyName} HRMS" <${process.env.EMAIL_USER}>`,
          to: invite.email,
          subject: `Response Received — ${companyName}`,
          html: emailHTML,
        });
      } catch (e) {
        console.error("Decline notification email error:", e);
      }

      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=declined&company=${encodeURIComponent(companyName)}`
      );
    }

    // Action === Accept
    if (action === "accept") {
      // 1. Update invitation status to 'accepted'
      await adminSupabase
        .from("invitations")
        .update({ status: "accepted" })
        .eq("id", invite.id);

      // 2. Generate username & temp password
      const username = generateUsername(invite.full_name);
      const tempPassword = generateTempPassword();

      // 3. Create or activate employee record
      const { data: empRecord, error: empErr } = await adminSupabase
        .from("employees")
        .insert([
          {
            company_id: invite.company_id,
            full_name: invite.full_name,
            email: invite.email,
            phone: invite.phone,
            department: invite.department,
            designation: invite.designation,
            role: invite.role,
            username: username,
            status: "active",
            invited_by: invite.invited_by,
            must_change_password: true,
          },
        ])
        .select()
        .single();

      if (empErr) {
        console.error("Failed to create active employee upon invitation accept:", empErr);
      }

      // 4. Send Credentials Email to the HR user
      const loginUrl = `${appUrl}/login`;
      const emailHTML = buildOfferAcceptedEmailHTML({
        companyName,
        employeeName: invite.full_name,
        role: invite.role,
        username,
        password: tempPassword,
        email: invite.email,
        loginUrl,
      });

      try {
        await transporter.sendMail({
          from: `"${companyName} HRMS" <${process.env.EMAIL_USER}>`,
          to: invite.email,
          subject: `🎉 Welcome to ${companyName} — Your HR Login Credentials`,
          html: emailHTML,
        });
        console.log("⚡ Credentials email sent to accepted HR user:", invite.email);
      } catch (mailErr) {
        console.error("Failed to send credentials email:", mailErr);
      }

      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=accepted&company=${encodeURIComponent(
          companyName
        )}&username=${encodeURIComponent(username)}&email=${encodeURIComponent(invite.email)}`
      );
    }

    return NextResponse.redirect(
      `${appUrl}/employee-invite-result?status=error&message=Invalid+action+specified.`
    );
  } catch (error) {
    console.error("Respond Invitation API Error:", error);
    return NextResponse.redirect(
      `${getAppUrl()}/employee-invite-result?status=error&message=Internal+server+error.`
    );
  }
}
