import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, EMPLOYEE_AVATARS_BUCKET } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import {
  getOrCreateTenantEmployeeFolder,
  getCompanyTenantFolderName,
} from "@/lib/supabase/storageTenantHelper";

/**
 * POST /api/upload/avatar
 * Uploads an avatar/profile photo or company logo to 'employee-avatars' Supabase public storage bucket.
 * Multi-tenancy structure:
 *   - Employee Avatar:  [Company_Tenant]/[Employee_Name_EMPCode]/avatar_[timestamp].[ext]
 *   - Company Branding: [Company_Tenant]/company_branding/logo_[timestamp].[ext]
 * Automatically finds and reuses the employee's existing storage folder on repeated uploads.
 * Directly persists avatar_url in the database for instant UI synchronization.
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in to upload avatar.", unauthorized: true },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    const formData = await req.formData();
    const file = formData.get("file");
    const isCompanyLogo = formData.get("isCompanyLogo") === "true" || formData.get("isLogo") === "true";

    if (!file || typeof file === "string") {
      return NextResponse.json({ message: "No image file provided." }, { status: 400 });
    }

    // Validate MIME type
    const mimeType = file.type || "";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json(
        { message: "Invalid file type. Please upload an image file (PNG, JPG, WebP, GIF, SVG)." },
        { status: 400 }
      );
    }

    // Limit size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { message: "Avatar image size exceeds the 5MB limit." },
        { status: 400 }
      );
    }

    const rawExt = file.name ? file.name.split(".").pop() : "";
    const ext = (rawExt || (mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const timestamp = Date.now();
    const bucketName = EMPLOYEE_AVATARS_BUCKET;

    // Ensure bucket exists and has public read access enabled
    try {
      const { data: buckets } = await adminSupabase.storage.listBuckets();
      if (!buckets?.some((b) => b.name === bucketName)) {
        await adminSupabase.storage.createBucket(bucketName, { public: true });
      } else {
        const targetB = buckets.find((b) => b.name === bucketName);
        if (!targetB?.public) {
          await adminSupabase.storage.updateBucket(bucketName, { public: true });
        }
      }
    } catch (bErr) {
      console.warn("Storage bucket verification notice:", bErr?.message);
    }

    let targetFolder = "";
    if (isCompanyLogo) {
      const companyFolder = getCompanyTenantFolderName(company);
      targetFolder = `${companyFolder}/company_branding`;
    } else {
      // Discover and reuse the employee's existing folder inside this company's tenant
      const { fullFolderPath } = await getOrCreateTenantEmployeeFolder({
        adminSupabase,
        bucketName,
        company,
        employeeProfile,
        user,
      });
      targetFolder = fullFolderPath;
    }

    // Purge previous avatar/logo images from storage folder to prevent accumulation of duplicate files
    try {
      const { data: existingFiles } = await adminSupabase.storage
        .from(bucketName)
        .list(targetFolder);

      if (Array.isArray(existingFiles) && existingFiles.length > 0) {
        const prefix = isCompanyLogo ? "logo" : "avatar";
        const filesToDelete = existingFiles
          .filter((item) => item.name && (item.name.startsWith(prefix) || item.name.includes(prefix)))
          .map((item) => `${targetFolder}/${item.name}`);

        if (filesToDelete.length > 0) {
          await adminSupabase.storage
            .from(bucketName)
            .remove(filesToDelete);
        }
      }
    } catch (cleanupErr) {
      console.warn("Old avatar cleanup notice:", cleanupErr?.message);
    }

    const filePath = `${targetFolder}/${isCompanyLogo ? "logo" : "avatar"}_${timestamp}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage bucket 'employee-avatars'
    const { error: storageErr } = await adminSupabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: mimeType || "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });

    if (storageErr) {
      console.error("Avatar Storage Upload Error:", storageErr);
      return NextResponse.json(
        { message: `Failed to upload image to bucket '${bucketName}'. ${storageErr.message}` },
        { status: 500 }
      );
    }

    // Retrieve public CDN URL
    const { data: publicUrlData } = adminSupabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl || "";
    const userEmail = user.email ? user.email.toLowerCase() : "";
    let updatedEmployee = null;

    // Persist immediately in database for seamless UI sync
    if (isCompanyLogo && company?.id) {
      await adminSupabase
        .from("companies")
        .update({ logo_url: publicUrl })
        .eq("id", company.id);
    } else if (employeeProfile?.id) {
      const { data: updated } = await adminSupabase
        .from("employees")
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", employeeProfile.id)
        .select()
        .maybeSingle();

      if (updated) {
        updatedEmployee = updated;
      }
    } else {
      // Find employee by auth_user_id or email
      const { data: empList } = await adminSupabase
        .from("employees")
        .select("*")
        .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
        .limit(1);

      if (empList && empList.length > 0) {
        const { data: updated } = await adminSupabase
          .from("employees")
          .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", empList[0].id)
          .select()
          .maybeSingle();

        if (updated) {
          updatedEmployee = updated;
        }
      } else if (company?.id) {
        await adminSupabase
          .from("companies")
          .update({ logo_url: publicUrl })
          .eq("id", company.id);
      }
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      avatarUrl: publicUrl,
      filePath,
      name: file.name,
      size: file.size,
      employee: updatedEmployee || (employeeProfile ? { ...employeeProfile, avatar_url: publicUrl } : null),
    });
  } catch (err) {
    console.error("Avatar upload exception:", err);
    return NextResponse.json(
      { message: err.message || "An unexpected error occurred during avatar upload." },
      { status: 500 }
    );
  }
}
