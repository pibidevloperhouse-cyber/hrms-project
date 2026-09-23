import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";
import { getAuthUser } from "@/lib/supabase/authHelper";

/**
 * Validates whether caller is authorized (Owner ADMIN, hr_manager, hr_executive)
 */
function isAuthorizedRole(role) {
  return ["ADMIN", "hr_manager", "hr_executive"].includes(role);
}

/**
 * GET /api/company/networks
 * Fetch all registered company networks for the caller's company.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    if (!isAuthorizedRole(role)) {
      return NextResponse.json(
        { message: "Access denied. Only Owner and HR can manage company network settings." },
        { status: 403 }
      );
    }

    const { data: networks, error } = await adminSupabase
      .from("company_networks")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01" || error.message?.includes("company_networks")) {
        return NextResponse.json({
          success: true,
          networks: [],
          needMigration: true,
        });
      }
      return NextResponse.json(
        { message: error.message || "Failed to fetch company networks." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      userRole: role,
      networks: networks || [],
    });
  } catch (error) {
    console.error("GET Company Networks Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/company/networks
 * Add a new company network (Network Name, Network IP, status, description).
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    if (!isAuthorizedRole(role)) {
      return NextResponse.json(
        { message: "Access denied. Only Owner and HR can add company networks." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { network_name, network_ip, status = "active", description = "" } = body;

    const trimmedName = typeof network_name === "string" ? network_name.trim() : "";
    const trimmedIp = typeof network_ip === "string" ? network_ip.trim() : "";
    const validStatus = status === "inactive" ? "inactive" : "active";
    const trimmedDesc = typeof description === "string" ? description.trim() : "";

    if (!trimmedName) {
      return NextResponse.json(
        { message: "Network Name is required." },
        { status: 400 }
      );
    }

    if (!trimmedIp) {
      return NextResponse.json(
        { message: "Network IP is required." },
        { status: 400 }
      );
    }

    // Insert network
    const { data: newNetwork, error } = await adminSupabase
      .from("company_networks")
      .insert({
        company_id: company.id,
        network_name: trimmedName,
        network_ip: trimmedIp,
        status: validStatus,
        description: trimmedDesc || null,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") {
        return NextResponse.json(
          { message: "Database table not initialized. Please run migration 20260923_create_company_networks_table.sql." },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { message: error.message || "Failed to add company network." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Company network "${trimmedName}" added successfully.`,
      network: newNetwork,
    });
  } catch (error) {
    console.error("POST Company Network Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/company/networks
 * Update an existing company network (name, IP, status, description).
 */
export async function PUT(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    if (!isAuthorizedRole(role)) {
      return NextResponse.json(
        { message: "Access denied. Only Owner and HR can update company networks." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, network_name, network_ip, status, description } = body;

    if (!id) {
      return NextResponse.json(
        { message: "Network ID is required for update." },
        { status: 400 }
      );
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
    };

    if (network_name !== undefined) {
      const trimmed = String(network_name).trim();
      if (!trimmed) {
        return NextResponse.json({ message: "Network Name cannot be empty." }, { status: 400 });
      }
      updatePayload.network_name = trimmed;
    }

    if (network_ip !== undefined) {
      const trimmed = String(network_ip).trim();
      if (!trimmed) {
        return NextResponse.json({ message: "Network IP cannot be empty." }, { status: 400 });
      }
      updatePayload.network_ip = trimmed;
    }

    if (status !== undefined) {
      updatePayload.status = status === "inactive" ? "inactive" : "active";
    }

    if (description !== undefined) {
      updatePayload.description = String(description).trim() || null;
    }

    const { data: updatedNetwork, error } = await adminSupabase
      .from("company_networks")
      .update(updatePayload)
      .eq("id", id)
      .eq("company_id", company.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || "Failed to update company network." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Company network updated successfully.",
      network: updatedNetwork,
    });
  } catch (error) {
    console.error("PUT Company Network Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/company/networks
 * Delete a company network by ID.
 */
export async function DELETE(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    if (!isAuthorizedRole(role)) {
      return NextResponse.json(
        { message: "Access denied. Only Owner and HR can delete company networks." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch (_) {}
    }

    if (!id) {
      return NextResponse.json(
        { message: "Network ID is required for deletion." },
        { status: 400 }
      );
    }

    const { error } = await adminSupabase
      .from("company_networks")
      .delete()
      .eq("id", id)
      .eq("company_id", company.id);

    if (error) {
      return NextResponse.json(
        { message: error.message || "Failed to delete company network." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Company network deleted successfully.",
    });
  } catch (error) {
    console.error("DELETE Company Network Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
