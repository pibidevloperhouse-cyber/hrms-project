import { NextResponse } from "next/server";
import { GET as getProjectPerformance } from "@/app/api/projects/performance/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/performance/employee
 * Route alias mapping to GET /api/projects/performance
 */
export async function GET(req) {
  return getProjectPerformance(req);
}
