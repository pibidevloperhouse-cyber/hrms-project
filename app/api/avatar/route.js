import { NextResponse } from "next/server";
import { createAdminClient, EMPLOYEE_AVATARS_BUCKET } from "@/lib/supabase/admin";

/**
 * GET /api/avatar?path=<filePath>&t=<timestamp>
 * Universal Avatar Proxy Endpoint:
 * Streams avatar image binaries directly from Supabase Storage using Admin Client.
 * Guarantees 100% reliable image display regardless of client-side CORS or bucket public flags.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");
    const empId = searchParams.get("empId");

    const adminSupabase = createAdminClient();
    const bucketName = EMPLOYEE_AVATARS_BUCKET;

    let targetPath = filePath;

    if (!targetPath && empId) {
      const { data: emp } = await adminSupabase
        .from("employees")
        .select("avatar_url")
        .eq("id", empId)
        .maybeSingle();

      if (emp?.avatar_url) {
        if (emp.avatar_url.startsWith("http")) {
          return NextResponse.redirect(emp.avatar_url);
        }
        targetPath = emp.avatar_url;
      }
    }

    if (!targetPath) {
      return NextResponse.json({ message: "No avatar path provided." }, { status: 400 });
    }

    // Decode path if encoded
    const cleanPath = decodeURIComponent(targetPath).replace(/^[/\\]+/, "");

    // 1. Download file buffer using admin client
    const { data: blob, error: downloadErr } = await adminSupabase
      .storage
      .from(bucketName)
      .download(cleanPath);

    if (downloadErr || !blob) {
      // Fallback: If cleanPath was a full URL or failed, redirect
      if (targetPath.startsWith("http")) {
        return NextResponse.redirect(targetPath);
      }
      return NextResponse.json({ message: "Avatar not found." }, { status: 404 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = blob.type || (cleanPath.endsWith(".png") ? "image/png" : cleanPath.endsWith(".webp") ? "image/webp" : "image/jpeg");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("GET /api/avatar error:", error);
    return NextResponse.json({ message: "Failed to retrieve avatar." }, { status: 500 });
  }
}
