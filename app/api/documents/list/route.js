import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, EMPLOYEE_DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

function isHRRole(role) {
  return ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(role);
}

/**
 * GET /api/documents/list?employeeId=...&documentType=...
 * Lists employee documents.
 * HR can view all or filter by employee; regular employees can view all documents assigned to their email/profile.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in.", unauthorized: true }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "No company workspace found." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const reqEmpId = searchParams.get("employeeId");
    const reqDocType = searchParams.get("documentType");
    const mode = searchParams.get("mode");

    const isHR = isHRRole(role);
    const userEmail = user.email ? user.email.trim().toLowerCase() : "";

    let allowedEmployeeIds = null;

    if (isHR && mode !== "mine") {
      if (reqEmpId && reqEmpId !== "ALL") {
        allowedEmployeeIds = [reqEmpId];
      }
    } else {
      // Personal document query (regular employee OR HR viewing personal files via mode=mine)
      allowedEmployeeIds = [];
      if (employeeProfile?.id) {
        allowedEmployeeIds.push(employeeProfile.id);
      }

      // Query all employee records matching user ID or email
      let empQueryFilter = `auth_user_id.eq.${user.id}`;
      if (userEmail) {
        empQueryFilter += `,email.ilike."${userEmail.replace(/"/g, '""')}"`;
      }

      const { data: matchingEmps } = await adminSupabase
        .from("employees")
        .select("id")
        .eq("company_id", company.id)
        .or(empQueryFilter);

      if (matchingEmps && matchingEmps.length > 0) {
        matchingEmps.forEach((e) => {
          if (!allowedEmployeeIds.includes(e.id)) {
            allowedEmployeeIds.push(e.id);
          }
        });
      }

      if (allowedEmployeeIds.length === 0) {
        return NextResponse.json({
          success: true,
          userRole: role,
          isHR: false,
          documents: [],
        });
      }
    }

    let query = adminSupabase
      .from("employee_documents")
      .select("*, employees:employee_id(id, full_name, email, department, designation), uploader:uploaded_by(id, full_name)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });

    if (allowedEmployeeIds && allowedEmployeeIds.length > 0) {
      if (allowedEmployeeIds.length === 1) {
        query = query.eq("employee_id", allowedEmployeeIds[0]);
      } else {
        query = query.in("employee_id", allowedEmployeeIds);
      }
    }

    if (reqDocType && reqDocType !== "ALL") {
      const upperType = reqDocType.toUpperCase();
      if (upperType === "PERSONAL_INFORMATION") {
        query = query.in("document_type", [
          "PERSONAL_INFORMATION", "PERSONAL_DETAILS", "OFFER_LETTER", "EXPERIENCE_CERTIFICATE", "OTHER",
          "personal_information", "personal_details", "offer_letter", "experience_certificate", "other"
        ]);
      } else if (upperType === "SALARY_PAYSLIP" || upperType === "PAYSLIP") {
        query = query.in("document_type", [
          "SALARY_PAYSLIP", "PAYSLIP",
          "salary_payslip", "payslip"
        ]);
      } else {
        query = query.in("document_type", [upperType, upperType.toLowerCase()]);
      }
    }

    const { data: rawDocuments, error: dbErr } = await query;

    if (dbErr && dbErr.code !== "42P01") {
      console.warn("Error querying employee_documents table:", dbErr.message);
    }

    const bucketName = EMPLOYEE_DOCUMENTS_BUCKET;
    const docsList = rawDocuments || [];

    // Pre-generate 1-hour signed URLs for secure download/preview
    const documentsWithSignedUrls = await Promise.all(
      docsList.map(async (doc) => {
        let signedUrl = null;
        if (doc.file_path) {
          try {
            const { data: signedData } = await adminSupabase
              .storage
              .from(bucketName)
              .createSignedUrl(doc.file_path, 3600);

            if (signedData?.signedUrl) {
              signedUrl = signedData.signedUrl;
            }
          } catch (err) {
            console.warn("Signed URL generation notice:", err);
          }
        }

        const fallbackDownloadUrl = `/api/documents/download?id=${doc.id}&redirect=true`;

        return {
          id: doc.id,
          employeeId: doc.employee_id,
          employeeName: doc.employees?.full_name || "Employee",
          employeeEmail: doc.employees?.email || "",
          department: doc.employees?.department || "General",
          documentType: doc.document_type,
          documentName: doc.document_name,
          filePath: doc.file_path,
          fileSize: Number(doc.file_size || 0),
          fileType: doc.file_type || "application/octet-stream",
          uploadedBy: doc.uploader?.full_name || "HR Manager",
          notes: doc.notes || "",
          createdAt: doc.created_at,
          signedUrl: signedUrl || fallbackDownloadUrl,
          downloadUrl: signedUrl || fallbackDownloadUrl,
        };
      })
    );

    return NextResponse.json({
      success: true,
      userRole: role,
      isHR,
      requestedMode: mode || "all",
      requestedEmployeeId: reqEmpId || "ALL",
      requestedDocumentType: reqDocType || "ALL",
      allowedEmployeeIds,
      documentsCount: documentsWithSignedUrls.length,
      documents: documentsWithSignedUrls,
    });
  } catch (error) {
    console.error("GET /api/documents/list error:", error);
    return NextResponse.json({ message: error.message || "Failed to fetch documents list." }, { status: 500 });
  }
}
