import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporter } from "@/lib/mail/transporter";
import { buildApprovalEmailHTML } from "@/lib/mail/approvalEmail";
import { encryptPassword } from "@/lib/security/crypto";

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

export async function POST(req) {
  try {
    const body = await req.json();
    const { companyName, companyEmail, phone, industry, adminName, adminPassword } = body;

    // 1. Validation
    if (!companyName || !companyEmail || !phone || !industry || !adminName || !adminPassword) {
      return NextResponse.json(
        { message: "All fields are required." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(companyEmail)) {
      return NextResponse.json({ message: "Invalid email format." }, { status: 400 });
    }

    if (adminPassword.length < 8) {
      return NextResponse.json({ message: "Password must be at least 8 characters long." }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 2. Check if company already exists
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("email", companyEmail)
      .maybeSingle();

    if (existingCompany) {
      return NextResponse.json(
        { message: "A company with this email address is already registered. Please sign in." },
        { status: 400 }
      );
    }

    // 3. Check for existing pending registration
    const { data: existingPending } = await supabase
      .from("pending_registrations")
      .select("id")
      .eq("company_email", companyEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      return NextResponse.json(
        { message: "A registration request for this email is already pending approval." },
        { status: 400 }
      );
    }

    // 4. Encrypt password securely (AES-256-GCM) and save to pending_registrations table
    const encryptedPassword = encryptPassword(adminPassword);

    const { data: pendingData, error: pendingError } = await supabase
      .from("pending_registrations")
      .insert([
        {
          company_name: companyName,
          company_email: companyEmail,
          phone: phone,
          industry: industry,
          admin_name: adminName,
          admin_password: encryptedPassword,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (pendingError) {
      console.error("Pending Insert Error:", pendingError);
      return NextResponse.json(
        { message: "Failed to submit registration: " + pendingError.message },
        { status: 400 }
      );
    }

    // 5. Send approval email to Product Owner (Using reachable app URL)
    const appUrl = getAppUrl(req);
    const ownerEmail = process.env.OWNER_EMAIL || process.env.EMAIL_USER;
    const approveUrl = `${appUrl}/api/auth/approve-company?id=${pendingData.id}`;
    const rejectUrl = `${appUrl}/api/auth/reject-company?id=${pendingData.id}`;

    const emailHTML = buildApprovalEmailHTML({
      companyName,
      companyEmail,
      phone,
      industry,
      adminName,
      approveUrl,
      rejectUrl,
    });

    await transporter.sendMail({
      from: `"HRMS Registration" <${process.env.EMAIL_USER}>`,
      to: ownerEmail,
      subject: `🏢 New Registration Request — ${companyName}`,
      html: emailHTML,
    });

    return NextResponse.json({
      success: true,
      pendingId: pendingData.id,
      message: "Registration submitted successfully! Pending product owner approval.",
    });

  } catch (error) {
    console.error("Registration API Error:", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

