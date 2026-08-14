import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporter } from "@/lib/mail/transporter";
import {
  buildOfferAcceptedEmailHTML,
  buildOfferDeclinedEmailHTML,
} from "@/lib/mail/offerEmail";

// ---------- helpers ----------

/** Get the publicly reachable app URL for redirects */
import { getAppUrl } from "@/lib/urlHelper";

function generateUsername(fullName) {
  const parts = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const first = parts[0] || "user";
  const last = parts.length > 1 ? parts[parts.length - 1] : "emp";
  const digits = String(Math.floor(Math.random() * 900) + 100);

  return `${first}.${last}.${digits}`;
}

function generatePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$&";

  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const all = upper + lower + digits + special;
  const remaining = Array.from({ length: 8 }, () => pick(all));

  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

// ---------- route handler ----------

export async function GET(req) {
  const appUrl = getAppUrl(req);

  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("id");
    const action = searchParams.get("action"); // 'accept' | 'decline'

    if (!employeeId || !action || !["accept", "decline"].includes(action)) {
      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=error&message=Invalid+invitation+response+link`
      );
    }

    const adminSupabase = createAdminClient();

    // 1. Fetch employee record with company details
    const { data: employee, error: fetchError } = await adminSupabase
      .from("employees")
      .select("*, companies:company_id(id, name, email)")
      .eq("id", employeeId)
      .maybeSingle();

    if (fetchError || !employee) {
      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=error&message=Invitation+record+not+found`
      );
    }

    const companyName = employee.companies?.name || "Company Workspace";

    // 2. Check if already processed
    if (employee.status !== "pending_offer") {
      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=already_processed&company=${encodeURIComponent(
          companyName
        )}&decision=${employee.status}&email=${encodeURIComponent(employee.email)}`
      );
    }

    // 3. Handle ACCEPT Action -> Redirect directly to Set Password Page
    if (action === "accept") {
      return NextResponse.redirect(`${appUrl}/accept-invite?token=${employeeId}`);
    }

    // 4. Handle DECLINE Action
    if (action === "decline") {
      await adminSupabase
        .from("employees")
        .update({ status: "rejected" })
        .eq("id", employeeId);

      const emailHTML = buildOfferDeclinedEmailHTML({
        companyName,
        employeeName: employee.full_name,
      });

      try {
        const cleanCompanyName = companyName.replace(/"/g, "");
        const mailResult = await transporter.sendMail({
          from: `"${cleanCompanyName} HRMS" <${process.env.EMAIL_USER}>`,
          to: employee.email,
          subject: `Response Received — ${cleanCompanyName}`,
          html: emailHTML,
        });
        console.log("⚡ Decline confirmation email sent to:", employee.email, "MessageID:", mailResult.messageId);
      } catch (mailErr) {
        console.error("❌ Failed to send decline confirmation email:", mailErr);
      }

      return NextResponse.redirect(
        `${appUrl}/employee-invite-result?status=declined&company=${encodeURIComponent(
          companyName
        )}`
      );
    }
  } catch (error) {
    console.error("Respond invite API Error:", error);
    return NextResponse.redirect(
      `${appUrl}/employee-invite-result?status=error&message=${encodeURIComponent(
        error.message || "Internal error"
      )}`
    );
  }
}
