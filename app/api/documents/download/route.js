import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, EMPLOYEE_DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

function isHRRole(role) {
  return ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(role);
}

/**
 * GET /api/documents/download?id=...&redirect=true
 * Secure download endpoint for private bucket 'employee-documents'.
 * Direct-streams the file attachment to the user with broadened ownership verification.
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
    const docId = searchParams.get("id");
    const docPath = searchParams.get("path");
    const userEmail = user.email ? user.email.toLowerCase() : "";

    let targetFilePath = docPath;
    let documentRecord = null;

    if (docId) {
      const { data: docData } = await adminSupabase
        .from("employee_documents")
        .select("*, employees:employee_id(id, full_name, email)")
        .eq("id", docId)
        .eq("company_id", company.id)
        .maybeSingle();

      if (docData) {
        documentRecord = docData;
        targetFilePath = docData.file_path;

        // Broadened Ownership verification: HR/Admin OR ID match OR Email match
        const isHR = isHRRole(role);
        let isOwner = false;

        if (employeeProfile && employeeProfile.id === docData.employee_id) {
          isOwner = true;
        } else if (docData.employees?.email && docData.employees.email.toLowerCase() === userEmail) {
          isOwner = true;
        } else if (userEmail) {
          const { data: targetEmp } = await adminSupabase
            .from("employees")
            .select("email")
            .eq("id", docData.employee_id)
            .maybeSingle();

          if (targetEmp?.email && targetEmp.email.toLowerCase() === userEmail) {
            isOwner = true;
          }
        }

        if (!isHR && !isOwner) {
          return NextResponse.json({ message: "Access denied. You can only access your own assigned documents." }, { status: 403 });
        }
      }
    }

    if (!targetFilePath) {
      return NextResponse.json({ message: "Document record or file path not found." }, { status: 404 });
    }

    const bucketName = EMPLOYEE_DOCUMENTS_BUCKET;

    // 1. Primary Download Strategy: Direct Server Binary Stream with Attachment Headers
    try {
      const { data: blobBuffer, error: downloadErr } = await adminSupabase
        .storage
        .from(bucketName)
        .download(targetFilePath);

      if (!downloadErr && blobBuffer) {
        const arrayBuffer = await blobBuffer.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const fileName = documentRecord?.document_name || "document.pdf";
        const fileType = documentRecord?.file_type || blobBuffer.type || "application/octet-stream";

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": fileType,
            "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    } catch (err) {
      console.warn("Direct storage download failed, attempting signed URL fallback:", err);
    }

    // 2. Fallback Strategy: Generate Supabase Signed URL
    const { data: signedData, error: signedErr } = await adminSupabase
      .storage
      .from(bucketName)
      .createSignedUrl(targetFilePath, 3600);

    if (signedErr || !signedData?.signedUrl) {
      console.error("Signed URL creation error:", signedErr);
      return NextResponse.json({
        message: `Failed to download file from private storage bucket. ${signedErr?.message || ""}`,
      }, { status: 500 });
    }

    return NextResponse.redirect(signedData.signedUrl);
  } catch (error) {
    console.error("GET /api/documents/download error:", error);
    return NextResponse.json({ message: error.message || "Failed to generate download URL." }, { status: 500 });
  }
}
