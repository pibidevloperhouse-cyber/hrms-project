import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, TASK_ATTACHMENTS_BUCKET } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { getOrCreateTenantEmployeeFolder } from "@/lib/supabase/storageTenantHelper";
import {
  inspectFileSignature,
  sanitizeAttachmentFilename,
  formatBytes,
} from "@/lib/security/fileSignatureVerifier";

/**
 * POST /api/upload/task-attachment
 * Securely uploads deliverable screenshots and documents with server-side magic byte inspection.
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in to upload attachments.", unauthorized: true },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found for this account." },
        { status: 404 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const taskId = String(formData.get("taskId") || "general").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36) || "general";
    const rawContext = String(formData.get("context") || "tasks").toLowerCase();
    const context = rawContext === "suggestions" || rawContext === "suggestion" ? "suggestions" : "tasks";

    if (!file || typeof file === "string") {
      return NextResponse.json({ message: "No attachment file provided." }, { status: 400 });
    }

    // Limit attachment size to 15MB
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { message: "Attachment size exceeds the 15MB limit." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Perform Server-Side Magic Byte Inspection
    const sigCheck = inspectFileSignature(buffer, file.type);
    if (!sigCheck.valid) {
      return NextResponse.json(
        { message: sigCheck.error || "Invalid file signature. Disguised files are rejected." },
        { status: 400 }
      );
    }

    const effectiveMime = sigCheck.detectedMime || file.type || "image/png";
    const extMatch = effectiveMime.split("/")[1] || "png";
    const originalFilename = file.name || `proof_${Date.now()}.${extMatch}`;
    const safeFilename = sanitizeAttachmentFilename(originalFilename, extMatch);
    const timestamp = Date.now();
    const bucketName = TASK_ATTACHMENTS_BUCKET;

    // Discover and reuse tenant employee folder
    const { fullFolderPath } = await getOrCreateTenantEmployeeFolder({
      adminSupabase,
      bucketName,
      company,
      employeeProfile,
      user,
    });

    const filePath = `${fullFolderPath}/${context}/${taskId}/${timestamp}_${safeFilename}`;

    // Upload to Supabase Storage
    const { error: storageErr } = await adminSupabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: effectiveMime,
        cacheControl: "3600",
        upsert: true,
      });

    if (storageErr) {
      console.error("Task Attachment Storage Upload Error:", storageErr);
      return NextResponse.json(
        { message: `Failed to upload attachment to storage: ${storageErr.message}` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl || "";

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filePath,
      name: safeFilename,
      size: formatBytes(file.size || buffer.length),
      type: effectiveMime,
      id: `att-${timestamp}-${Math.random().toString(36).substr(2, 6)}`,
    });
  } catch (err) {
    console.error("Task attachment upload exception:", err);
    return NextResponse.json(
      { message: err.message || "An unexpected error occurred during attachment upload." },
      { status: 500 }
    );
  }
}
