import { NextResponse } from "next/server";
import { POST as evaluatePerformance } from "@/app/api/projects/performance/evaluate/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/performance/evaluate
 * Route alias mapping to POST /api/projects/performance/evaluate
 */
export async function POST(req) {
  return evaluatePerformance(req);
}
