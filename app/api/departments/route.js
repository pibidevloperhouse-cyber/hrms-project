import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/departments
 * List departments for the authenticated user's company
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // Find company associated with user
    let companyId = null;
    const { data: company } = await adminSupabase
      .from("companies")
      .select("id")
      .or(`admin_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (company) {
      companyId = company.id;
    } else {
      const { data: empComp } = await adminSupabase
        .from("employees")
        .select("company_id")
        .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
        .maybeSingle();

      if (empComp) {
        companyId = empComp.company_id;
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { message: "No company found." },
        { status: 404 }
      );
    }

    const { data: departments, error } = await adminSupabase
      .from("departments")
      .select("*")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (error) {
      // If table doesn't exist yet, return empty list gracefully
      if (error.code === "PGRST205" || error.message?.includes("departments")) {
        return NextResponse.json({
          departments: [],
          needMigration: true,
        });
      }
      return NextResponse.json(
        { message: "Failed to fetch departments." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      departments: departments || [],
    });
  } catch (error) {
    console.error("GET Departments Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/departments
 * Create a new department (Owner / Admin)
 */
export async function POST(req) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { message: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, code, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { message: "Department name is required." },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // Verify company & owner permissions
    const { data: company } = await adminSupabase
      .from("companies")
      .select("id")
      .or(`admin_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (!company) {
      return NextResponse.json(
        { message: "Access denied. Only Company Owner can create departments." },
        { status: 403 }
      );
    }

    const { data: newDept, error } = await adminSupabase
      .from("departments")
      .insert({
        company_id: company.id,
        name: name.trim(),
        code: code ? code.trim().toUpperCase() : null,
        description: description ? description.trim() : null,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { message: `Department "${name}" already exists.` },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { message: error.message || "Failed to create department." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Department created successfully.",
      department: newDept,
    });
  } catch (error) {
    console.error("POST Department Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/departments
 * Update existing department (Owner / Admin)
 */
export async function PUT(req) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { message: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, name, code, description, status } = body;

    if (!id) {
      return NextResponse.json(
        { message: "Department ID is required." },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    const { data: company } = await adminSupabase
      .from("companies")
      .select("id")
      .or(`admin_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (!company) {
      return NextResponse.json(
        { message: "Access denied. Only Company Owner can update departments." },
        { status: 403 }
      );
    }

    const { data: updatedDept, error } = await adminSupabase
      .from("departments")
      .update({
        name: name?.trim(),
        code: code ? code.trim().toUpperCase() : null,
        description: description ? description.trim() : null,
        status: status || "active",
      })
      .eq("id", id)
      .eq("company_id", company.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || "Failed to update department." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Department updated successfully.",
      department: updatedDept,
    });
  } catch (error) {
    console.error("PUT Department Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/departments
 * Delete department (Owner / Admin)
 */
export async function DELETE(req) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { message: "Department ID is required." },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    const { data: company } = await adminSupabase
      .from("companies")
      .select("id")
      .or(`admin_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (!company) {
      return NextResponse.json(
        { message: "Access denied. Only Company Owner can delete departments." },
        { status: 403 }
      );
    }

    const { error } = await adminSupabase
      .from("departments")
      .delete()
      .eq("id", id)
      .eq("company_id", company.id);

    if (error) {
      return NextResponse.json(
        { message: error.message || "Failed to delete department." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Department deleted successfully.",
    });
  } catch (error) {
    console.error("DELETE Department Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
