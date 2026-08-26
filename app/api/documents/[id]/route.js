import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, EMPLOYEE_DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

function isHRRole(role) {
  return ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(role);
}

/**
 * DELETE /api/documents/[id]
 * Deletes an employee document record and purges file from private storage bucket.
 */
export async function DELETE(req, context) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in.", unauthorized: true }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, role } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "No company workspace found." }, { status: 404 });
    }

    if (!isHRRole(role)) {
      return NextResponse.json({ message: "Access denied. HR privileges required to delete documents." }, { status: 403 });
    }

    const { params } = context;
    const documentId = (await params)?.id;

    if (!documentId) {
      return NextResponse.json({ message: "Document ID parameter is required." }, { status: 400 });
    }

    // Fetch document record
    const { data: docRecord, error: fetchErr } = await adminSupabase
      .from("employee_documents")
      .select("*")
      .eq("id", documentId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (fetchErr || !docRecord) {
      return NextResponse.json({ message: "Document record not found in workspace." }, { status: 404 });
    }

    const bucketName = EMPLOYEE_DOCUMENTS_BUCKET;

    // Delete file from Supabase private storage
    if (docRecord.file_path) {
      const { error: storageDelErr } = await adminSupabase
        .storage
        .from(bucketName)
        .remove([docRecord.file_path]);

      if (storageDelErr) {
        console.warn("Storage deletion notice:", storageDelErr.message);
      }
    }

    // Delete database row
    const { error: dbDelErr } = await adminSupabase
      .from("employee_documents")
      .delete()
      .eq("id", documentId)
      .eq("company_id", company.id);

    if (dbDelErr) {
      throw dbDelErr;
    }

    return NextResponse.json({
      success: true,
      message: `Document "${docRecord.document_name}" deleted successfully!`,
      deletedId: documentId,
    });
  } catch (error) {
    console.error("DELETE /api/documents/[id] error:", error);
    return NextResponse.json({ message: error.message || "Failed to delete document." }, { status: 500 });
  }
}
