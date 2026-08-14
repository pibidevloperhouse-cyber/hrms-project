import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporter } from "@/lib/mail/transporter";
import { buildRejectedEmailHTML } from "@/lib/mail/statusEmail";

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
 * GET /api/auth/reject-company?id=<pending_registration_id>
 * Called when the owner clicks the "Reject" button in the email.
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

    // 2. Log denial
    await supabase.from("denied_registration_logs").insert([
      {
        company_name: pending.company_name,
        company_email: pending.company_email,
        admin_name: pending.admin_name,
        reason: "Registration request rejected by owner",
      },
    ]);

    // 3. Mark registration as rejected
    await supabase.from("pending_registrations").update({ status: "rejected" }).eq("id", pendingId);

    // 4. Send rejection email to applicant
    const emailHTML = buildRejectedEmailHTML({
      companyName: pending.company_name,
      adminName: pending.admin_name,
    });

    try {
      await transporter.sendMail({
        from: `"HRMS" <${process.env.EMAIL_USER}>`,
        to: pending.company_email,
        subject: `Registration update for ${pending.company_name}`,
        html: emailHTML,
      });
    } catch (emailErr) {
      console.error("Failed to send rejection email:", emailErr);
    }

    // 5. Redirect Product Owner to result page
    return NextResponse.redirect(`${appUrl}/approval-result?status=rejected&company=${encodeURIComponent(pending.company_name)}`);

  } catch (error) {
    console.error("Reject Company Error:", error);
    return NextResponse.redirect(`${appUrl}/approval-result?status=error&message=${encodeURIComponent(error.message || "Internal error")}`);
  }
}

