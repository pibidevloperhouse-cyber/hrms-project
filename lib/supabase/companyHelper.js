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

/**
 * Validates whether an email is eligible to receive a company invitation.
 * Checks:
 * 1. Is the email the Company Owner's email (company.email, company.admin_id user email, or caller user email if owner)?
 * 2. Has the user already joined the company as an active team member (employees table status === 'active' or auth_user_id set)?
 * 3. Does an accepted invitation already exist for this user in this company?
 *
 * Returns { valid: true } or { valid: false, message: string }
 */
export async function validateInvitationTargetEmail(adminSupabase, company, emailInput, callerUser) {
  const cleanEmail = (emailInput || "").trim().toLowerCase();
  if (!cleanEmail) {
    return { valid: false, message: "Employee email address is required." };
  }

  // 1. Check if email belongs to the Company Owner
  const companyOwnerEmail = (company?.email || "").trim().toLowerCase();
  if (companyOwnerEmail && cleanEmail === companyOwnerEmail) {
    return {
      valid: false,
      message: `The email "${cleanEmail}" is the registered Company Owner email address. Company owners cannot be invited as team members.`,
    };
  }

  if (company?.admin_id) {
    try {
      const { data: adminAuthUser } = await adminSupabase.auth.admin.getUserById(company.admin_id);
      const adminEmail = (adminAuthUser?.user?.email || "").trim().toLowerCase();
      if (adminEmail && cleanEmail === adminEmail) {
        return {
          valid: false,
          message: `The email "${cleanEmail}" belongs to the Company Owner account. Company owners cannot be invited as team members.`,
        };
      }
    } catch (adminErr) {
      console.warn("Notice checking company owner auth email:", adminErr);
    }
  }

  if (callerUser && (callerUser.id === company?.admin_id || callerUser.role === "ADMIN")) {
    const callerEmail = (callerUser.email || "").trim().toLowerCase();
    if (callerEmail && cleanEmail === callerEmail) {
      return {
        valid: false,
        message: `You are the Company Owner. You cannot send an employee invitation to your own owner email address.`,
      };
    }
  }

  // 2. Check if an employee with this email has already joined this company
  if (company?.id) {
    const { data: existingEmployees } = await adminSupabase
      .from("employees")
      .select("id, full_name, email, role, status, auth_user_id")
      .eq("company_id", company.id)
      .ilike("email", cleanEmail);

    if (existingEmployees && existingEmployees.length > 0) {
      const activeMember = existingEmployees.find(
        (emp) => emp.status === "active" || Boolean(emp.auth_user_id)
      );
      if (activeMember) {
        return {
          valid: false,
          message: `${activeMember.full_name || cleanEmail} is already an active member of this company with role "${activeMember.role || "employee"}". They do not need an invitation.`,
        };
      }
    }

    // 3. Check if an invitation was already accepted for this email in this company
    const { data: acceptedInvite } = await adminSupabase
      .from("invitations")
      .select("id, full_name, role, status")
      .eq("company_id", company.id)
      .ilike("email", cleanEmail)
      .eq("status", "accepted")
      .maybeSingle();

    if (acceptedInvite) {
      return {
        valid: false,
        message: `An invitation for "${cleanEmail}" has already been accepted and joined the company.`,
      };
    }
  }

  return { valid: true };
}

