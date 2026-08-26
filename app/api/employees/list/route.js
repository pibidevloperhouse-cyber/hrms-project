import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";

/**
 * GET /api/employees/list
 * Returns all employees for the authenticated user's company along with document upload summary metrics.
 */
export async function GET(req) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // Find company associated with user (admin or employee)
    let company = null;
    const { data: adminComp } = await adminSupabase
      .from("companies")
      .select("*")
      .or(`admin_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (adminComp) {
      company = adminComp;
    } else {
      const { data: empComp } = await adminSupabase
        .from("employees")
        .select("company_id, companies:company_id(*)")
        .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
        .maybeSingle();

      if (empComp?.companies) {
        company = empComp.companies;
      }
    }

    if (!company) {
      return NextResponse.json(
        { message: "No company found for this user." },
        { status: 404 }
      );
    }

    // Fetch all employees for the company
    const { data: employees, error: fetchError } = await adminSupabase
      .from("employees")
      .select("*")
      .eq("company_id", company.id)
      .order("full_name", { ascending: true });

    if (fetchError) {
      console.error("Employee list fetch error:", fetchError);
      return NextResponse.json(
        { message: "Failed to load employees." },
        { status: 500 }
      );
    }

    // Fetch all employee_documents for company to calculate document counts per employee
    const { data: allDocs } = await adminSupabase
      .from("employee_documents")
      .select("id, employee_id, document_type")
      .eq("company_id", company.id);

    const docMap = {};
    if (allDocs) {
      allDocs.forEach((d) => {
        if (!docMap[d.employee_id]) {
          docMap[d.employee_id] = {
            total: 0,
            OFFER_LETTER: 0,
            PERSONAL_DETAILS: 0,
            PERSONAL_INFORMATION: 0,
            EXPERIENCE_CERTIFICATE: 0,
            SALARY_PAYSLIP: 0,
            PAYSLIP: 0,
            OTHER: 0,
          };
        }
        docMap[d.employee_id].total += 1;
        const dt = d.document_type;
        if (docMap[d.employee_id][dt] !== undefined) {
          docMap[d.employee_id][dt] += 1;
        }
      });
    }

    const employeesWithDocs = (employees || []).map((emp) => {
      const dStats = docMap[emp.id] || { total: 0, OFFER_LETTER: 0, PERSONAL_DETAILS: 0, PERSONAL_INFORMATION: 0, EXPERIENCE_CERTIFICATE: 0, SALARY_PAYSLIP: 0, PAYSLIP: 0, OTHER: 0 };
      const payslipTotal = (dStats.SALARY_PAYSLIP || 0) + (dStats.PAYSLIP || 0);
      const personalDetailsTotal = (dStats.PERSONAL_DETAILS || 0) + (dStats.PERSONAL_INFORMATION || 0);
      return {
        ...emp,
        docSummary: {
          totalDocs: dStats.total,
          hasOfferLetter: dStats.OFFER_LETTER > 0,
          offerLetterCount: dStats.OFFER_LETTER,
          hasPersonalDetails: personalDetailsTotal > 0,
          personalDetailsCount: personalDetailsTotal,
          hasExperienceCertificate: (dStats.EXPERIENCE_CERTIFICATE || 0) > 0,
          experienceCertificateCount: dStats.EXPERIENCE_CERTIFICATE || 0,
          hasPayslip: payslipTotal > 0,
          payslipCount: payslipTotal,
          otherDocsCount: dStats.OTHER || 0,
        },
      };
    });

    return NextResponse.json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      employees: employeesWithDocs,
      count: employeesWithDocs.length,
    });
  } catch (error) {
    console.error("Employee List API Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
