/**
 * Helper function to resolve the active company, role, and employee profile for a given user.
 * Supports both Company Owners (admin_id in companies) and HR/Employees (records in employees).
 */
export async function getCompanyAndRoleForUser(adminSupabase, user) {
  if (!user) {
    return { company: null, role: null, isOwner: false, employeeProfile: null };
  }

  const userEmail = user.email ? user.email.toLowerCase() : "";

  let empOrFilter = `auth_user_id.eq.${user.id}`;
  if (userEmail) {
    empOrFilter += `,email.eq."${userEmail.replace(/"/g, '""')}"`;
  }

  // 1. Check if user is an Employee first (HR Manager, HR Executive, Team Lead, Manager, Employee)
  const { data: empRecords } = await adminSupabase
    .from("employees")
    .select("*, companies:company_id(*)")
    .or(empOrFilter)
    .order("created_at", { ascending: false })
    .limit(1);

  const empRecord = empRecords && empRecords.length > 0 ? empRecords[0] : null;

  if (empRecord) {
    let companyObj = empRecord.companies;
    if (!companyObj && empRecord.company_id) {
      const { data: cData } = await adminSupabase
        .from("companies")
        .select("*")
        .eq("id", empRecord.company_id)
        .maybeSingle();
      companyObj = cData;
    }

    if (companyObj) {
      // Sync auth_user_id if missing
      if (!empRecord.auth_user_id && user.id) {
        try {
          await adminSupabase
            .from("employees")
            .update({ auth_user_id: user.id })
            .eq("id", empRecord.id);
        } catch (syncErr) {
          console.warn("Sync auth_user_id warning:", syncErr);
        }
      }

      return {
        company: companyObj,
        role: empRecord.role || "employee",
        isOwner: false,
        employeeProfile: {
          id: empRecord.id,
          full_name: empRecord.full_name,
          email: empRecord.email,
          role: empRecord.role,
          department: empRecord.department,
          designation: empRecord.designation,
          username: empRecord.username,
          status: empRecord.status,
          joining_date: empRecord.joining_date || null,
        },
      };
    }
  }

  // 2. If not found as employee, check if user is Company Owner / Admin
  let adminOrFilter = `admin_id.eq.${user.id}`;
  if (userEmail) {
    adminOrFilter += `,email.eq."${userEmail.replace(/"/g, '""')}"`;
  }

  const { data: adminCompanies } = await adminSupabase
    .from("companies")
    .select("*")
    .or(adminOrFilter);

  if (adminCompanies && adminCompanies.length > 0) {
    return {
      company: adminCompanies[0],
      role: "ADMIN",
      isOwner: true,
      employeeProfile: null,
    };
  }

  return { company: null, role: null, isOwner: false, employeeProfile: null };
}
