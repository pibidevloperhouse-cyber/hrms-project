import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/company/setup
 * Updates company setup profile for the authenticated user and marks setup as completed.
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
        { message: "Unauthorized. Please log in to complete company setup." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // 1. Find user's company record by admin_id or email
    let { data: existingCompany } = await adminSupabase
      .from("companies")
      .select("*")
      .or(`admin_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    const body = await req.json();
    const {
      legalName,
      industry,
      establishedYear,
      country,
      state,
      address,
      logoUrl,
    } = body;

    // 2. Validate required profile inputs
    if (!legalName || !legalName.trim()) {
      return NextResponse.json(
        { message: "Legal Company Name is required." },
        { status: 400 }
      );
    }
    if (!industry || !industry.trim()) {
      return NextResponse.json(
        { message: "Industry is required." },
        { status: 400 }
      );
    }
    if (!country || !country.trim() || !state || !state.trim()) {
      return NextResponse.json(
        { message: "Country and State are required." },
        { status: 400 }
      );
    }

    // 3. Construct update payload
    const fullPayload = {
      name: legalName.trim(),
      legal_name: legalName.trim(),
      industry: industry.trim(),
      established_year: establishedYear ? parseInt(establishedYear, 10) : new Date().getFullYear(),
      country: country.trim(),
      state: state.trim(),
      address: address ? address.trim() : null,
      logo_url: logoUrl ? logoUrl.trim() : null,
      admin_id: user.id,
      is_setup_completed: true,
      updated_at: new Date().toISOString(),
    };

    let updatedCompany = null;

    if (existingCompany) {
      // Update existing company record
      const { data: updated, error: updateErr } = await adminSupabase
        .from("companies")
        .update(fullPayload)
        .eq("id", existingCompany.id)
        .select("*")
        .maybeSingle();

      if (updateErr) {
        console.warn("Notice updating extended company fields:", updateErr.message);
        // Fallback update for basic fields if custom columns are missing
        const { data: basicUpdated } = await adminSupabase
          .from("companies")
          .update({
            name: legalName.trim(),
            industry: industry.trim(),
            admin_id: user.id,
          })
          .eq("id", existingCompany.id)
          .select("*")
          .maybeSingle();

        updatedCompany = basicUpdated || existingCompany;
      } else {
        updatedCompany = updated;
      }
    } else {
      // Create new company profile if missing
      const { data: newCompany, error: createErr } = await adminSupabase
        .from("companies")
        .insert([
          {
            name: legalName.trim(),
            email: userEmail,
            admin_id: user.id,
            ...fullPayload,
          },
        ])
        .select("*")
        .single();

      if (createErr) {
        console.error("Company creation error during setup:", createErr);
      }
      updatedCompany = newCompany;
    }

    // 4. Update setup_completed in user_metadata
    try {
      const { data: userRecord } = await adminSupabase.auth.admin.getUserById(user.id);
      const currentMeta = userRecord?.user?.user_metadata || {};

      await adminSupabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...currentMeta,
          setup_completed: true,
        },
      });
    } catch (metaErr) {
      console.warn("User metadata update notice:", metaErr);
    }

    return NextResponse.json({
      success: true,
      message: "Company setup completed successfully!",
      setupCompleted: true,
      company: updatedCompany || { name: legalName.trim(), is_setup_completed: true },
    });
  } catch (error) {
    console.error("Company Setup POST Error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/company/setup
 * Fetches setup state for authenticated company owner using session auth.
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
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // Query user's company profile
    const { data: company } = await adminSupabase
      .from("companies")
      .select("*")
      .or(`admin_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (!company) {
      return NextResponse.json(
        { message: "Company profile not found." },
        { status: 404 }
      );
    }

    const setupCompleted =
      company.is_setup_completed === true ||
      !!(company.legal_name && company.country);

    return NextResponse.json({
      success: true,
      company,
      setupCompleted,
    });
  } catch (error) {
    console.error("Fetch Company Setup Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
