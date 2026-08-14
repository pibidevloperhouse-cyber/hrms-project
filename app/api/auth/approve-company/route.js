import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporter } from "@/lib/mail/transporter";
import { buildApprovedEmailHTML } from "@/lib/mail/statusEmail";
import { decryptPassword } from "@/lib/security/crypto";

// Helper to get reachable app base URL from request headers or environment
function getAppUrl(req) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "http";

  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    return `${proto}://${host}`;
  }

  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost")) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (host) {
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * GET /api/auth/approve-company?id=<pending_registration_id>
 * Called when the owner clicks the "Approve" button in the email.
 */
export async function GET(req) {
  const appUrl = getAppUrl(req);

  try {
    const { searchParams } = new URL(req.url);
    const pendingId = searchParams.get("id");

    if (!pendingId) {
      return NextResponse.redirect(`${appUrl}/approval-result?status=error&message=Missing+registration+ID`);
    }

    const supabase = createAdminClient();

    // 1. Fetch pending registration
    const { data: pending, error: fetchError } = await supabase
      .from("pending_registrations")
      .select("*")
      .eq("id", pendingId)
      .single();

    if (fetchError || !pending) {
      return NextResponse.redirect(`${appUrl}/approval-result?status=error&message=Registration+request+not+found`);
    }

    if (pending.status !== "pending") {
      return NextResponse.redirect(
        `${appUrl}/approval-result?status=already_processed&company=${encodeURIComponent(pending.company_name)}&decision=${pending.status}`
      );
    }

    // 2. Decrypt AES-256-GCM encrypted password & create Supabase Auth user
    const rawAdminPassword = decryptPassword(pending.admin_password);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: pending.company_email,
      password: rawAdminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: pending.admin_name,
        role: "ADMIN",
      },
    });

    if (authError) {
      console.error("Auth user creation failed:", authError);
      return NextResponse.redirect(
        `${appUrl}/approval-result?status=error&message=${encodeURIComponent("Failed to create user account: " + authError.message)}`
      );
    }

    // 3. Create company record as active
    let { error: companyError } = await supabase.from("companies").insert([
      {
        name: pending.company_name,
        email: pending.company_email,
        phone: pending.phone,
        industry: pending.industry,
        admin_id: authData.user?.id || null,
        status: "active",
        is_setup_completed: false,
      },
    ]);

    // Fallback if column is missing
    if (companyError) {
      const fallback = await supabase.from("companies").insert([
        {
          name: pending.company_name,
          email: pending.company_email,
          phone: pending.phone,
          industry: pending.industry,
          admin_id: authData.user?.id || null,
          status: "active",
        },
      ]);
      companyError = fallback.error;
    }

    if (companyError) {
      if (authData.user?.id) await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.redirect(
        `${appUrl}/approval-result?status=error&message=${encodeURIComponent("Failed to create company: " + companyError.message)}`
      );
    }

    // 4. Mark registration as approved and purge/sanitize password field from DB table
    await supabase
      .from("pending_registrations")
      .update({ status: "approved", admin_password: "[ENCRYPTED_PURGED]" })
      .eq("id", pendingId);

    // 5. Send approval email to applicant
    const loginUrl = `${appUrl}/login`;
    const emailHTML = buildApprovedEmailHTML({
      companyName: pending.company_name,
      adminName: pending.admin_name,
      loginUrl,
    });

    try {
      await transporter.sendMail({
        from: `"HRMS" <${process.env.EMAIL_USER}>`,
        to: pending.company_email,
        subject: `✅ Your registration for ${pending.company_name} has been approved!`,
        html: emailHTML,
      });
    } catch (emailErr) {
      console.error("Failed to send approval email:", emailErr);
    }

    // 6. Redirect Product Owner to result page
    return NextResponse.redirect(`${appUrl}/approval-result?status=approved&company=${encodeURIComponent(pending.company_name)}`);

  } catch (error) {
    console.error("Approve Company Error:", error);
    return NextResponse.redirect(`${appUrl}/approval-result?status=error&message=${encodeURIComponent(error.message || "Internal error")}`);
  }
}

