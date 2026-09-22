import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

const VALID_ROLES = [
  "employee",
  "team_lead",
  "manager",
  "hr_manager",
  "hr_executive",
];

const ROLE_LABELS = {
  employee: "Employee",
  team_lead: "Team Lead",
  manager: "Department Manager",
  hr_manager: "HR Manager",
  hr_executive: "HR Executive",
};

/**
 * PATCH /api/employees/[id]/role
 * Allows Company Owner (ADMIN) or HR Managers/Executives to update an employee's role.
 * - Multi-tenant enforcement: Target employee must belong to caller's company.
 * - Dispatches an in-app notification to the promoted employee.
 */
export async function PATCH(req, { params }) {
  try {
    const { id: targetEmployeeId } = await params;
    if (!targetEmployeeId) {
      return NextResponse.json({ message: "Employee ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, role: callerRole, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "No company workspace found." }, { status: 404 });
    }

    // Role check: Only ADMIN, hr_manager, or hr_executive can change employee roles
    const cleanCallerRole = (callerRole || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isAuthorized =
      cleanCallerRole.includes("admin") ||
      cleanCallerRole.includes("owner") ||
      cleanCallerRole === "hrmanager" ||
      cleanCallerRole === "hrexecutive" ||
      cleanCallerRole === "hr";

    if (!isAuthorized) {
      return NextResponse.json(
        { message: "Access denied. Only Company Owner and HR Management can update employee roles." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { role: newRole, designation } = body;

    const cleanNewRole = (newRole || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    if (!cleanNewRole || !VALID_ROLES.includes(cleanNewRole)) {
      return NextResponse.json(
        { message: `Invalid role specified. Valid roles are: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // Multi-tenant verify target employee exists within caller's company
    const { data: targetEmp, error: fetchErr } = await adminSupabase
      .from("employees")
      .select("id, company_id, full_name, email, role, department, designation, auth_user_id")
      .eq("id", targetEmployeeId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (fetchErr || !targetEmp) {
      return NextResponse.json(
        { message: "Employee not found in your company workspace." },
        { status: 404 }
      );
    }

    const previousRole = targetEmp.role;

    // Update payload
    const updatePayload = {
      role: cleanNewRole,
      updated_at: new Date().toISOString(),
    };

    if (designation !== undefined && String(designation).trim()) {
      updatePayload.designation = String(designation).trim();
    } else if (cleanNewRole === "team_lead" && (!targetEmp.designation || targetEmp.designation === "Employee")) {
      updatePayload.designation = "Team Lead";
    }

    const { data: updatedEmp, error: updateErr } = await adminSupabase
      .from("employees")
      .update(updatePayload)
      .eq("id", targetEmployeeId)
      .eq("company_id", company.id)
      .select()
      .single();

    if (updateErr) {
      console.error("Update employee role error:", updateErr);
      return NextResponse.json(
        { message: updateErr.message || "Failed to update employee role." },
        { status: 500 }
      );
    }

    // Dispatch promotion notification to employee
    if (previousRole !== cleanNewRole) {
      try {
        const callerName = employeeProfile?.full_name || "HR Management";
        const roleLabel = ROLE_LABELS[cleanNewRole] || cleanNewRole;

        const isPromotion = cleanNewRole === "team_lead" || cleanNewRole === "manager";
        const title = isPromotion
          ? `🎉 Role Promotion: You are now a ${roleLabel}`
          : `📋 Role Updated: ${roleLabel}`;

        const message = isPromotion
          ? `Congratulations! Your role has been elevated to ${roleLabel} by ${callerName}. You now have project leadership and deliverable review privileges.`
          : `Your company role was updated to ${roleLabel} by ${callerName}.`;

        await adminSupabase.from("notifications").insert([
          {
            company_id: company.id,
            employee_id: targetEmp.id,
            title,
            message,
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (notifErr) {
        console.warn("Promotion notification warning:", notifErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Employee role updated to ${ROLE_LABELS[cleanNewRole] || cleanNewRole} successfully.`,
      employee: updatedEmp,
    });
  } catch (err) {
    console.error("PATCH /api/employees/[id]/role error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
