import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();
    const rawInput = (body.email || body.username || "").trim();
    const { password } = body;

    // 1. Validate Input
    if (!rawInput || !password) {
      return NextResponse.json({ message: "Email/Username and password are required." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    let targetEmail = rawInput.toLowerCase();

    // Look up if input matches an employee's username or email
    let matchedEmp = null;
    try {
      const sanitizedInput = rawInput.replace(/"/g, '""');
      const sanitizedTarget = targetEmail.replace(/"/g, '""');
      const filterStr = `username.eq."${sanitizedInput}",email.eq."${sanitizedTarget}"`;

      const { data: matchedEmps } = await adminSupabase
        .from("employees")
        .select("id, email, username, auth_user_id, role, company_id")
        .or(filterStr)
        .order("created_at", { ascending: false })
        .limit(1);

      if (matchedEmps && matchedEmps.length > 0) {
        matchedEmp = matchedEmps[0];
      }
    } catch (empErr) {
      console.warn("Employee lookup warning during login:", empErr);
    }

    if (matchedEmp?.email) {
      targetEmail = matchedEmp.email.toLowerCase();
    }

    const supabase = await createClient();

    // 2. Authenticate User with resolved targetEmail
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    });

    if (authError) {
      return NextResponse.json({ message: authError.message || "Invalid credentials." }, { status: 401 });
    }

    if (!authData?.user) {
      return NextResponse.json({ message: "Authentication failed. User not found." }, { status: 401 });
    }

    const user = authData.user;
    const userMeta = user.user_metadata || {};
    const safeUserEmail = user.email ? user.email.toLowerCase() : targetEmail;

    // Sync auth_user_id on employee record if needed
    if (matchedEmp && (!matchedEmp.auth_user_id || matchedEmp.auth_user_id !== user.id)) {
      try {
        await adminSupabase
          .from("employees")
          .update({ auth_user_id: user.id })
          .eq("id", matchedEmp.id);
      } catch (syncErr) {
        console.warn("Could not sync auth_user_id:", syncErr);
      }
    }

    // 3. Check if this is an employee login
    const isEmployeeMeta = userMeta.is_employee === true;
    let employeeRecord = matchedEmp;

    if (!employeeRecord) {
      try {
        let empOrFilter = `auth_user_id.eq.${user.id}`;
        if (safeUserEmail) {
          const sanitizedEmail = safeUserEmail.replace(/"/g, '""');
          empOrFilter += `,email.eq."${sanitizedEmail}"`;
        }

        const { data: empByAuth } = await adminSupabase
          .from("employees")
          .select("*, companies:company_id(id, name, email, industry, logo_url)")
          .or(empOrFilter)
          .order("created_at", { ascending: false })
          .limit(1);
        employeeRecord = empByAuth && empByAuth.length > 0 ? empByAuth[0] : null;
      } catch (empFetchErr) {
        console.warn("Employee fetch warning:", empFetchErr);
      }
    } else if (!employeeRecord.companies) {
      try {
        const { data: empFull } = await adminSupabase
          .from("employees")
          .select("*, companies:company_id(id, name, email, industry, logo_url)")
          .eq("id", matchedEmp.id)
          .maybeSingle();
        if (empFull) employeeRecord = empFull;
      } catch (empFullErr) {
        console.warn("Employee full fetch warning:", empFullErr);
      }
    }

    if (isEmployeeMeta || employeeRecord) {
      let companyObj = employeeRecord?.companies || null;
      if (!companyObj && employeeRecord?.company_id) {
        try {
          const { data: cData } = await adminSupabase
            .from("companies")
            .select("id, name, email, industry, logo_url")
            .eq("id", employeeRecord.company_id)
            .maybeSingle();
          companyObj = cData;
        } catch (cErr) {
          console.warn("Company fetch warning:", cErr);
        }
      }

      return NextResponse.json({
        success: true,
        message: "Login successful!",
        user,
        session: authData.session,
        company: companyObj,
        isEmployee: true,
        role: employeeRecord?.role || userMeta.role || "employee",
        employee: employeeRecord
          ? {
              id: employeeRecord.id,
              full_name: employeeRecord.full_name,
              email: employeeRecord.email,
              role: employeeRecord.role,
              department: employeeRecord.department,
              designation: employeeRecord.designation,
              username: employeeRecord.username,
              status: employeeRecord.status,
              must_change_password: employeeRecord.must_change_password,
            }
          : null,
        requiresSetup: false,
      });
    }

    // 4. Admin login path — Get User's Company
    let company = null;
    try {
      const { data: cByAdmin } = await adminSupabase
        .from("companies")
        .select("*")
        .eq("admin_id", user.id)
        .maybeSingle();
      company = cByAdmin;

      if (!company && safeUserEmail) {
        const { data: cByEmail } = await adminSupabase
          .from("companies")
          .select("*")
          .eq("email", safeUserEmail)
          .maybeSingle();
        company = cByEmail;

        // Link admin_id if missing
        if (company && user.id) {
          try {
            await adminSupabase.from("companies").update({ admin_id: user.id }).eq("id", company.id);
            company.admin_id = user.id;
          } catch (linkErr) {
            console.warn("Could not link admin_id:", linkErr);
          }
        }
      }
    } catch (companyErr) {
      console.warn("Company lookup error:", companyErr);
    }

    // 5. Check Setup Completion
    const isCompletedInMeta = userMeta.setup_completed === true;
    const isCompletedInDB = company?.is_setup_completed === true;
    const hasProfileFields = !!(company?.legal_name && company?.country);

    const setupIsDone = isCompletedInMeta || isCompletedInDB || hasProfileFields;
    const requiresSetup = company ? !setupIsDone : false;

    // 6. Keep Auth Metadata & DB in sync if setup is done
    if (company && setupIsDone) {
      if (!isCompletedInMeta) {
        try {
          await adminSupabase.auth.admin.updateUserById(user.id, {
            user_metadata: { ...userMeta, setup_completed: true },
          });
        } catch (metaErr) {
          console.warn("Could not sync metadata:", metaErr);
        }
      }
      if (!isCompletedInDB && company.id) {
        try {
          await adminSupabase.from("companies").update({ is_setup_completed: true }).eq("id", company.id);
        } catch (dbErr) {
          console.warn("Could not sync DB is_setup_completed:", dbErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Login successful!",
      user,
      session: authData.session,
      company: company || null,
      isEmployee: false,
      requiresSetup,
    });

  } catch (error) {
    console.error("Login API Error:", error);
    return NextResponse.json({ message: error?.message || "Internal server error." }, { status: 500 });
  }
}


