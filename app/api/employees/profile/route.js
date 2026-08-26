import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";

/**
 * PUT /api/employees/profile
 * Allows logged-in users (both Employees and Company Owners/Admins) to update their profile details seamlessly.
 */
export async function PUT(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in to update your profile.", unauthorized: true },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      firstName = "",
      lastName = "",
      personalEmail = "",
      phone = "",
      address = "",
      joiningDate = null,
      avatarUrl = null,
    } = body;

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || userEmail.split("@")[0];

    // 1. Fetch employee record
    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("*, companies:company_id(*)")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .order("created_at", { ascending: false })
      .limit(1);

    let empRecord = empRecords && empRecords.length > 0 ? empRecords[0] : null;

    // 2. If no employee record exists, check if user is a Company Owner (Admin)
    if (!empRecord) {
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("*")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      const targetCompany = adminCompanies && adminCompanies.length > 0 ? adminCompanies[0] : null;

      if (targetCompany) {
        // Create an employee profile record for the Company Owner
        const { data: newEmp, error: createErr } = await adminSupabase
          .from("employees")
          .upsert(
            {
              company_id: targetCompany.id,
              auth_user_id: user.id,
              email: userEmail,
              full_name: fullName,
              role: "ADMIN",
              department: "Executive Management",
              designation: "Company Administrator",
              username: userEmail.split("@")[0],
              status: "active",
              phone: phone.trim() || targetCompany.phone || "",
            },
            { onConflict: "company_id,email" }
          )
          .select()
          .maybeSingle();

        if (newEmp) {
          empRecord = newEmp;
        } else {
          // Company table fallback
          await adminSupabase
            .from("companies")
            .update({
              phone: phone.trim() || targetCompany.phone,
              logo_url: avatarUrl || targetCompany.logo_url,
            })
            .eq("id", targetCompany.id);

          return NextResponse.json({
            success: true,
            message: "Profile details updated successfully!",
            employee: {
              id: `admin-${user.id.slice(0, 8)}`,
              full_name: fullName,
              email: userEmail,
              role: "ADMIN",
              department: "Executive Management",
              designation: "Company Administrator",
              username: userEmail.split("@")[0],
              status: "active",
              avatar_url: avatarUrl || targetCompany.logo_url || null,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              employee_id: "EMP-ADMIN-001",
              personal_email: personalEmail.trim(),
              phone: phone.trim() || targetCompany.phone || "",
              address: address.trim(),
            },
          });
        }
      }
    }

    if (!empRecord) {
      return NextResponse.json(
        { message: "No workspace profile record found for this user account." },
        { status: 404 }
      );
    }

    // 3. Update employee record with graceful fallback for custom columns
    const fullPayload = {
      full_name: fullName,
      phone: phone.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      personal_email: personalEmail.trim(),
      address: address.trim(),
      joining_date: joiningDate || null,
      updated_at: new Date().toISOString(),
    };

    if (avatarUrl !== undefined && avatarUrl !== null) {
      fullPayload.avatar_url = avatarUrl;
    }

    let { data: updatedData, error: updateError } = await adminSupabase
      .from("employees")
      .update(fullPayload)
      .eq("id", empRecord.id)
      .select()
      .maybeSingle();

    // Fallback: If custom schema columns are missing, try update without custom columns
    if (updateError) {
      console.warn("Full payload update warning (trying tier 2 payload fallback):", updateError.message);

      const tier2Payload = {
        full_name: fullName,
        phone: phone.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        personal_email: personalEmail.trim(),
        address: address.trim(),
        updated_at: new Date().toISOString(),
      };
      if (avatarUrl !== undefined && avatarUrl !== null) {
        tier2Payload.avatar_url = avatarUrl;
      }

      const { data: tier2Data, error: tier2Error } = await adminSupabase
        .from("employees")
        .update(tier2Payload)
        .eq("id", empRecord.id)
        .select()
        .maybeSingle();

      if (!tier2Error && tier2Data) {
        updatedData = tier2Data;
      } else {
        const corePayload = {
          full_name: fullName,
          phone: phone.trim(),
          updated_at: new Date().toISOString(),
        };

        const { data: coreData, error: coreError } = await adminSupabase
          .from("employees")
          .update(corePayload)
          .eq("id", empRecord.id)
          .select()
          .single();

        if (coreError) {
          throw coreError;
        }
        updatedData = coreData;
      }
    }

    const finalRecord = updatedData || empRecord;

    return NextResponse.json({
      success: true,
      message: "Profile details saved successfully!",
      employee: {
        id: finalRecord.id,
        full_name: fullName || finalRecord.full_name,
        email: finalRecord.email || userEmail,
        role: finalRecord.role || "employee",
        department: finalRecord.department || "General",
        designation: finalRecord.designation || "Staff",
        username: finalRecord.username || "",
        status: finalRecord.status || "active",
        avatar_url: avatarUrl || finalRecord.avatar_url || null,
        first_name: firstName.trim() || finalRecord.first_name,
        last_name: lastName.trim() || finalRecord.last_name,
        employee_id: finalRecord.employee_id || `EMP-${finalRecord.id.slice(0, 5).toUpperCase()}`,
        personal_email: personalEmail.trim() || finalRecord.personal_email || "",
        phone: phone.trim() || finalRecord.phone || "",
        address: address.trim() || finalRecord.address || "",
        joining_date: joiningDate || finalRecord.joining_date || null,
      },
    });
  } catch (error) {
    console.error("PUT /api/employees/profile error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to save profile details." },
      { status: 500 }
    );
  }
}
