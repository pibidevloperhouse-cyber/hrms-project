import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, TASK_ATTACHMENTS_BUCKET } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import {
  getOrCreateTenantEmployeeFolder,
  sanitizeFilename,
} from "@/lib/supabase/storageTenantHelper";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * POST /api/upload/task-attachment
 * Uploads task deliverable proofs or suggestion screenshots to 'task-attachments' Supabase public storage bucket.
 * Multi-tenancy structure:
 *   - Deliverable proofs:    [Company_Tenant]/[Employee_Name_EMPCode]/tasks/[taskId]/[timestamp]_[file]
 *   - Suggestion feedback:   [Company_Tenant]/[Employee_Name_EMPCode]/suggestions/[taskId]/[timestamp]_[file]
 * Automatically finds and reuses the employee's existing storage folder on repeated uploads.
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
    const taskId = formData.get("taskId") || "general";
    const rawContext = (formData.get("context") || "tasks").toLowerCase();
    const context = rawContext === "suggestions" || rawContext === "suggestion" ? "suggestions" : "tasks";

    if (!file || typeof file === "string") {
      return NextResponse.json({ message: "No attachment file provided." }, { status: 400 });
    }

    // Validate MIME type (allow images, PDFs, office documents)
    const mimeType = file.type || "";
    if (
      !mimeType.startsWith("image/") &&
      !mimeType.includes("pdf") &&
      !mimeType.includes("document") &&
      !mimeType.includes("text")
    ) {
      return NextResponse.json(
        { message: "Invalid file type. Please upload image or document proofs." },
        { status: 400 }
      );
    }

    // Limit attachment size to 15MB
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { message: "Attachment size exceeds the 15MB limit." },
        { status: 400 }
      );
    }

    const originalFilename = file.name || `screenshot_${Date.now()}.png`;
    const safeFilename = sanitizeFilename(originalFilename);
    const safeTaskId = sanitizeFilename(taskId).slice(0, 36) || "general";
    const timestamp = Date.now();

    const bucketName = TASK_ATTACHMENTS_BUCKET;

    // Discover and reuse the employee's existing folder inside this company's tenant
    const { fullFolderPath } = await getOrCreateTenantEmployeeFolder({
      adminSupabase,
      bucketName,
      company,
      employeeProfile,
      user,
    });

    const filePath = `${fullFolderPath}/${context}/${safeTaskId}/${timestamp}_${safeFilename}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage bucket 'task-attachments'
    const { error: storageErr } = await adminSupabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: mimeType || "application/octet-stream",
        cacheControl: "3600",
        upsert: true,
      });

    if (storageErr) {
      console.error("Task Attachment Storage Upload Error:", storageErr);
      return NextResponse.json(
        { message: `Failed to upload attachment to bucket '${bucketName}'. ${storageErr.message}` },
        { status: 500 }
      );
    }

    // Retrieve public CDN URL
    const { data: publicUrlData } = adminSupabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl || "";

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filePath,
      name: originalFilename,
      size: formatBytes(file.size || buffer.length),
      type: mimeType,
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
