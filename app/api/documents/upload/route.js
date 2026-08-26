import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, EMPLOYEE_DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

function isHRRole(role) {
  return ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(role);
}

/**
 * POST /api/documents/upload
 * HR endpoint to upload an offer letter, personal details, or payslip for an employee into private bucket 'employee-documents'.
 */
export async function POST(req) {
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

    if (!isHRRole(role)) {
      return NextResponse.json({ message: "Access denied. HR privileges required to upload documents." }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const targetEmployeeId = formData.get("employeeId");
    const rawDocumentType = (formData.get("documentType") || "").toString().trim().toUpperCase();
    const customDocumentName = formData.get("documentName");
    const notes = formData.get("notes") || "";

    if (!file || typeof file === "string") {
      return NextResponse.json({ message: "No file payload provided." }, { status: 400 });
    }

    if (!targetEmployeeId) {
      return NextResponse.json({ message: "Target employee ID is required." }, { status: 400 });
    }

    const validDocTypes = [
      "PERSONAL_INFORMATION",
      "PERSONAL_DETAILS",
      "OFFER_LETTER",
      "EXPERIENCE_CERTIFICATE",
      "SALARY_PAYSLIP",
      "PAYSLIP",
      "OTHER"
    ];

    if (!rawDocumentType || !validDocTypes.includes(rawDocumentType)) {
      return NextResponse.json({ message: "Please select a valid document type (Personal Details, Offer Letter, Experience Certificate, or Salary Payslip)." }, { status: 400 });
    }

    // Verify target employee belongs to the company
    const { data: targetEmp, error: empErr } = await adminSupabase
      .from("employees")
      .select("id, full_name, email, company_id")
      .eq("id", targetEmployeeId)
      .eq("company_id", company.id)
      .single();

    if (empErr || !targetEmp) {
      return NextResponse.json({ message: "Target employee profile not found in your company." }, { status: 404 });
    }

    const isPayslip = rawDocumentType === "SALARY_PAYSLIP" || rawDocumentType === "PAYSLIP";
    const finalDocType = isPayslip ? "SALARY_PAYSLIP" : rawDocumentType;
    const subFolder = isPayslip ? "salary_payslip" : "personal_information";

    const originalFilename = file.name || "document.pdf";
    const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const finalDocName = (customDocumentName && customDocumentName.trim()) ? customDocumentName.trim() : originalFilename;

    const sanitizedEmpName = (targetEmp.full_name || "Employee")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_");
    const empFolderName = `${sanitizedEmpName}_${targetEmployeeId.slice(0, 6)}`;

    const timestamp = Date.now();
    const filePath = `${empFolderName}/${subFolder}/${timestamp}_${sanitizedFilename}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const bucketName = EMPLOYEE_DOCUMENTS_BUCKET;

    // 1. Upload file to Supabase private storage bucket 'employee-documents'
    const { data: storageData, error: storageErr } = await adminSupabase
      .storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (storageErr) {
      console.error("Supabase Storage Upload Error:", storageErr);
      return NextResponse.json({
        message: `Failed to upload file to storage bucket '${bucketName}'. ${storageErr.message}`,
      }, { status: 500 });
    }

    // 2. Insert document record into public.employee_documents
    const docPayload = {
      company_id: company.id,
      employee_id: targetEmployeeId,
      document_type: finalDocType,
      document_name: finalDocName,
      file_path: filePath,
      file_size: file.size || buffer.length,
      file_type: file.type || "application/octet-stream",
      uploaded_by: employeeProfile?.id || null,
      notes: notes.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: dbData, error: dbErr } = await adminSupabase
      .from("employee_documents")
      .insert([docPayload])
      .select()
      .single();

    if (dbErr) {
      console.error("DB insert into employee_documents error:", dbErr.message);
      if (dbErr.code === '42P01' || dbErr.message?.includes("employee_documents")) {
        return NextResponse.json({
          message: "Database table 'employee_documents' not found. Please execute the SQL migration script in supabase_employee_documents.sql in your Supabase SQL Editor.",
        }, { status: 500 });
      }
      return NextResponse.json({
        message: `Failed to save document record in database: ${dbErr.message}`,
      }, { status: 500 });
    }

    const savedDocument = dbData;

    // Create a notification for the employee if notifications table exists
    try {
      await adminSupabase.from("notifications").insert([
        {
          company_id: company.id,
          employee_id: targetEmployeeId,
          title: `📄 New ${finalDocType.replace("_", " ")} Uploaded`,
          message: `HR uploaded a new document "${finalDocName}" for you.`,
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {
      // Ignore notification table errors if optional
    }

    return NextResponse.json({
      success: true,
      message: `Document "${finalDocName}" uploaded successfully for ${targetEmp.full_name}!`,
      document: savedDocument,
    });
  } catch (error) {
    console.error("POST /api/documents/upload error:", error);
    return NextResponse.json({ message: error.message || "Failed to upload document." }, { status: 500 });
  }
}
