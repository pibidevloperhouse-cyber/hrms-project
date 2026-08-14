import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

/**
 * POST /api/invitations/complete
 * Completes HR/employee invitation acceptance:
 * 1. Verifies token in invitations or employees table
 * 2. Creates Supabase Auth user with candidate's password
 * 3. Activates employee record in public.employees
 * 4. Saves personal profile record in public.profiles
 * 5. Marks invitation status as 'accepted'
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { token: rawToken, password } = body;
    const token = (rawToken || "").trim();

    if (!token || !password) {
      return NextResponse.json(
        { message: "Token and new password are required." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters long." },
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
      console.error("Complete invitation query error:", invErr);
      if (invErr.code === "PGRST205" || invErr.code === "42P01") {
        return NextResponse.json(
          { message: "Database table 'invitations' not found. Please run the SQL migration in supabase/migrations/20260807_create_invitations_table.sql in Supabase SQL Editor." },
          { status: 400 }
        );
      }
    }

    if (invData) {
      invitation = invData;
    } else if (isUuid) {
      // 2. Fallback: Query public.employees by UUID id
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
          invited_by: empData.invited_by,
        };
      }
    }

    if (!invitation) {
      return NextResponse.json(
        { message: "Invalid or expired invitation link." },
        { status: 404 }
      );
    }

    if (invitation.status === "accepted" || invitation.status === "active") {
      return NextResponse.json(
        { message: "Invitation has already been accepted. Please log in." },
        { status: 400 }
      );
    }

    const cleanEmail = invitation.email.trim().toLowerCase();
    const fullName = invitation.full_name.trim();

    // 3. Create or Update Supabase Auth User with Password
    let authUser = null;
    const { data: createdAuthUser, error: authError } = await adminSupabase.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: invitation.role,
        is_employee: true,
        company_id: invitation.company_id,
      },
    });

    if (authError) {
      if (authError.message?.includes("already been registered") || authError.status === 422) {
        const { data: usersList } = await adminSupabase.auth.admin.listUsers();
        const existingUser = usersList?.users?.find(
          (u) => u.email?.toLowerCase() === cleanEmail
        );

        if (existingUser) {
          const { data: updatedUser, error: updateErr } = await adminSupabase.auth.admin.updateUserById(
            existingUser.id,
            {
              password: password,
              user_metadata: {
                ...existingUser.user_metadata,
                full_name: fullName,
                role: invitation.role,
                is_employee: true,
                company_id: invitation.company_id,
              },
            }
          );

          if (updateErr) {
            return NextResponse.json(
              { message: "Failed to set user password: " + updateErr.message },
              { status: 400 }
            );
          }
          authUser = updatedUser.user;
        } else {
          return NextResponse.json(
            { message: "Account creation error: " + authError.message },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { message: "Failed to create authentication user: " + authError.message },
          { status: 400 }
        );
      }
    } else {
      authUser = createdAuthUser.user;
    }

    // 4. Generate Username and activate Employee record
    const username = generateUsername(fullName);

    const { data: existingEmp } = await adminSupabase
      .from("employees")
      .select("id")
      .eq("company_id", invitation.company_id)
      .eq("email", cleanEmail)
      .maybeSingle();

    let employeeRecord = null;

    if (existingEmp) {
      const { data: updatedEmp, error: empUpdateErr } = await adminSupabase
        .from("employees")
        .update({
          auth_user_id: authUser.id,
          full_name: fullName,
          department: invitation.department,
          designation: invitation.designation,
          role: invitation.role,
          username: username,
          status: "active",
          must_change_password: false,
        })
        .eq("id", existingEmp.id)
        .select()
        .single();

      if (empUpdateErr) console.error("Employee update error:", empUpdateErr);
      employeeRecord = updatedEmp || existingEmp;
    } else {
      const { data: newEmp, error: empInsertErr } = await adminSupabase
        .from("employees")
        .insert([
          {
            company_id: invitation.company_id,
            auth_user_id: authUser.id,
            full_name: fullName,
            email: cleanEmail,
            phone: invitation.phone,
            department: invitation.department,
            designation: invitation.designation,
            role: invitation.role,
            username: username,
            status: "active",
            invited_by: invitation.invited_by,
            must_change_password: false,
          },
        ])
        .select()
        .single();

      if (empInsertErr) console.error("Employee insert error:", empInsertErr);
      employeeRecord = newEmp;
    }

    // 5. Save personal profile details into public.profiles table
    if (employeeRecord?.id) {
      const nameParts = fullName.split(" ");
      const firstName = nameParts[0] || fullName;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      try {
        await adminSupabase.from("profiles").upsert(
          [
            {
              employee_id: employeeRecord.id,
              company_id: invitation.company_id,
              auth_user_id: authUser.id,
              first_name: firstName,
              last_name: lastName,
              personal_email: cleanEmail,
              personal_phone: invitation.phone || null,
              date_of_joining: new Date().toISOString().split("T")[0],
            },
          ],
          { onConflict: "employee_id" }
        );
      } catch (profileErr) {
        console.warn("Profile creation notice:", profileErr);
      }
    }

    // 6. Mark invitation status as 'accepted'
    try {
      await adminSupabase
        .from("invitations")
        .update({ status: "accepted" })
        .eq("token", token);
    } catch (invUpdateErr) {
      console.warn("Notice updating invitations status:", invUpdateErr);
    }

    return NextResponse.json({
      success: true,
      message: "Password created and account activated successfully!",
      email: cleanEmail,
      username,
    });
  } catch (error) {
    console.error("Complete Invitation API Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
