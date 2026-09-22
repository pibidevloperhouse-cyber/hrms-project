import { NextResponse } from "next/server";
import { GET as getMonthlyPerformance } from "@/app/api/projects/performance/monthly/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/performance/monthly
 * Route alias mapping to GET /api/projects/performance/monthly
 */
export async function GET(req) {
  return getMonthlyPerformance(req);
}
